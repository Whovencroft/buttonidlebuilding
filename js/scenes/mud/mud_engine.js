/**
 * mud_engine.js  -  MUD Engine Core
 *
 * Manages the room graph, parser, player state, combat loop, and command execution.
 * Exposes a simple interface: create(), execute(input), update(dt), getSaveSlice().
 */
(() => {
  // ─── Parser (delegates to MudParser + MudCommands) ─────────────────────────
  // The old flat VERB_ALIASES and STOP_WORDS are replaced by mud_parser.js
  // and mud_commands.js. This section only keeps deriveKeywords for entity matching.

  /**
   * Derive searchable keywords from an item or mob name.
   * e.g. "Knight's Broadsword" → ["knight's", "broadsword", "knight's broadsword"]
   */
  function deriveKeywords(name) {
    if (!name) return [];
    const lower = name.toLowerCase();
    const words = lower.split(/\s+/);
    return [...words, lower];
  }

  // ─── Engine ────────────────────────────────────────────────────────────────

  function create({ savedState } = {}) {
    let rooms = {};
    let mobs = {};
    let items = {};
    let player = createDefaultPlayer();
    let combatState = null;
    let combatTimer = 0;
    let combatTick = 0;
    let lastAbilityUsed = null;  // Track last ability for finishing moves
    let chargeState = null;  // Active charge-up ability state
    let pendingSystemOutput = [];  // Queued output from stat growth etc.

    const COMBAT_TICK_INTERVAL = 2.5; // seconds per auto-attack round

    let quests = {};
    let recipes = {};

    // Load world data from global (set by data loader script)
    if (window.MudData) {
      rooms = window.MudData.rooms || {};
      mobs = window.MudData.mobs || {};
      items = window.MudData.items || {};
      quests = window.MudData.quests || {};
      recipes = window.MudData.recipes || {};
    }

    // Restore from save if available
    if (savedState && savedState.player) {
      player = { ...createDefaultPlayer(), ...savedState.player };
    }
    // Ensure coreStats exists (legacy saves may have null)
    if (!player.coreStats) {
      player.coreStats = { vigor: 1, precision: 1, grit: 1, instinct: 1, xp: {} };
    }

    function createDefaultPlayer() {
      return {
        currentRoom: 101,  // Training Tower - Ground Floor
        hp: 100,
        maxHp: 100,
        focus: 50,
        maxFocus: 50,
        attackPower: 10,
        defense: 5,
        inventory: [],
        equipped: {},
        gold: 0,
        power: 0,
        questPoints: 0,
        visitedRooms: [],
        worldFlags: {},
        activeQuests: [],
        completedQuests: [],
        questCompletionCounts: {},
        killCounts: {},
        baseClass: null,
        specialization: null,
        specName: null,
        abilities: [],
        abilityCooldowns: {},
        chainProgress: {},
        glimmeredDefs: {},  // Runtime cache: { [abilityId]: ability def } for chain evolutions
        focusCostModifier: 0,
        recallPoint: 1,
        coreStats: { vigor: 1, precision: 1, grit: 1, instinct: 1, xp: {} }
      };
    }

    /**
     * Get the current room object.
     */
    function currentRoom() {
      return rooms[player.currentRoom] || null;
    }

    /**
     * Execute a command through the unified registry pipeline.
     * Flow: MudParser.parse → MudCommands.execute → fallback to ability match.
     */
    function execute(input) {
      // Reset ambient idle timer  -  player is active
      ambientTimer = 0;

      // Use the new parser if available, otherwise basic fallback
      const parsed = window.MudParser
        ? window.MudParser.parse(input)
        : { verb: null, target: input.trim().toLowerCase(), args: [], raw: input };

      // Build context for the command registry
      const ctx = {
        inCombat: !!combatState,
        currentRoom: player.currentRoom,
        player,
        combatState,
        rooms,
        mobs,
        items,
        quests
      };

      // Try the unified command registry first
      if (parsed.verb && window.MudCommands) {
        const result = window.MudCommands.execute(parsed, ctx);
        if (result) return result;
      }

      // Fallback: check if the full input matches an ability name (combat)
      const abilityResult = tryUseAbilityByName(input.trim().toLowerCase());
      if (abilityResult) return abilityResult;

      // Nothing matched
      if (parsed.verb) {
        return [{ type: 'error', text: `Unknown command: '${parsed.verb}'. Type 'help' for a list.` }];
      }
      return [{ type: 'error', text: "I don't understand that. Type 'help' for commands." }];
    }

    // ─── Command Implementations ─────────────────────────────────────────────

    function doGo(direction) {
      if (combatState) {
        return [{ type: 'error', text: "You can't leave while in combat! Try 'flee' instead." }];
      }

      const room = currentRoom();
      if (!room) return [{ type: 'error', text: 'You are nowhere. Something is very wrong.' }];

      if (!direction) return [{ type: 'error', text: 'Go where? Specify a direction.' }];

      const exit = room.exits?.[direction];
      if (exit == null) {
        return [{ type: 'error', text: `There is no exit to the ${direction}.` }];
      }

      // Exits can be plain vnums (int) or objects { target_vnum, door }
      const targetVnum = typeof exit === 'object' ? exit.target_vnum : exit;

      // Check for locked doors (object-style exits with door.state or top-level locked flag)
      const isLocked = typeof exit === 'object' && (
        (exit.door && exit.door.state === 'locked') || exit.locked
      );
      if (isLocked) {
        // Already unlocked this session?
        if (player.worldFlags[`door_${room.vnum}_${direction}`] === 'unlocked') {
          return moveToRoom(targetVnum);
        }
        // Meta-puzzle unlock: marble confrontation bypasses key requirement
        if (targetVnum === 11099 && player.worldFlags?.marble_confrontation_unlocked) {
          player.worldFlags[`door_${room.vnum}_${direction}`] = 'unlocked';
          return [
            { type: 'success', text: 'The void parts before you. You know where it is.' },
            ...moveToRoom(targetVnum)
          ];
        }
        const keyVnum = (exit.door && exit.door.key_vnum) || exit.key_vnum;
        if (keyVnum && player.inventory.includes(keyVnum)) {
          player.worldFlags[`door_${room.vnum}_${direction}`] = 'unlocked';
          return [
            { type: 'success', text: `You unlock the door with your key.` },
            ...moveToRoom(targetVnum)
          ];
        }
        const desc = exit.description || 'The way is locked.';
        return [{ type: 'error', text: desc }];
      }

      return moveToRoom(targetVnum);
    }

    function moveToRoom(vnum) {
      // Validate the target room exists before committing the move
      if (!rooms[vnum]) {
        return [{ type: 'error', text: 'An impassable barrier blocks your way.' }];
      }

      // Zone transition detection
      const prevZone = Math.floor(player.currentRoom / 100);
      player.currentRoom = vnum;
      const newZone = Math.floor(vnum / 100);
      const isNewRoom = !player.visitedRooms.includes(vnum);
      if (isNewRoom) {
        player.visitedRooms.push(vnum);
      }
      // Instinct grows from exploring new rooms
      if (isNewRoom && window.MudStats && player.coreStats) {
        const iGrowth = window.MudStats.onRoomEntered(true);
        if (iGrowth) {
          const iResult = window.MudStats.applyGrowth(player.coreStats, iGrowth);
          // Queue output for next flush since moveToRoom returns its own output
          if (iResult.output.length > 0) {
            pendingSystemOutput = pendingSystemOutput.concat(iResult.output);
            recalcStats();
          }
        }
      }

      // Record ghost and auto-save on room change
      recordGhost('move', String(vnum));
      autoSave();

      const room = currentRoom();

      const output = [];

      // Zone transition message
      if (newZone !== prevZone && prevZone > 0) {
        const ZONE_NAMES = {
          1: 'The Nexus', 11: 'Shattered Crown', 12: 'Neon Sprawl',
          13: 'Undercity', 14: 'Iron Wastes', 15: 'Void Reach',
          16: 'Temporal Rift', 17: 'Shadow Market', 18: 'Training Grounds',
          19: 'Ancient Ruins', 20: 'Wizard Tower'
        };
        const zoneName = ZONE_NAMES[newZone] || `Zone ${newZone}`;
        output.push({ type: 'info', text: `\u2550\u2550\u2550 Entering: ${zoneName} \u2550\u2550\u2550` });
      }

      output.push({ type: 'room-name', text: room.name });
      output.push({ type: 'room-desc', text: room.description });

      // Show current weather if not clear
      const currentWeather = zoneWeather[room.zone] || 'clear';
      if (currentWeather !== 'clear') {
        const weatherDesc = {
          overcast: 'The sky is overcast, casting everything in muted grey.',
          rain: 'Rain falls steadily here.',
          fog: 'A thick fog limits visibility.',
          storm: 'A storm rages overhead.'
        };
        output.push({ type: 'info', text: weatherDesc[currentWeather] });
      }

      // List exits (only show directions that lead to valid rooms)
      const exits = Object.keys(room.exits || {}).filter(dir => {
        const ex = room.exits[dir];
        const target = typeof ex === 'object' ? ex.target_vnum : ex;
        return target != null && rooms[target];
      });
      if (exits.length > 0) {
        output.push({ type: 'exits', text: `Exits: ${exits.join(', ')}` });
      }

      // List items on the ground
      const groundItems = (room.initial_items || []).filter(v => !isItemTaken(room, v));
      if (groundItems.length > 0) {
        const names = groundItems.map(v => getItemName(v)).filter(Boolean);
        if (names.length > 0) {
          output.push({ type: 'items', text: `You see: ${names.join(', ')}` });
        }
      }

      // List mobs with power hint
      const roomMobs = getAliveMobsInRoom(room);
      if (roomMobs.length > 0) {
        const mobEntries = roomMobs.map(v => {
          const mob = mobs[v];
          if (!mob) return null;
          const mobPow = (mob.stats?.hp || 0) + (mob.stats?.attack || 0) * 3 + (mob.stats?.defense || 0) * 2;
          const ratio = mobPow / Math.max(1, player.power);
          let tag = '';
          if (ratio > 4) tag = ' [!!]';
          else if (ratio > 2) tag = ' [!]';
          else if (ratio < 0.25) tag = ' [~]';
          return mob.name + tag;
        }).filter(Boolean);
        if (mobEntries.length > 0) {
          output.push({ type: 'mobs', text: `Present: ${mobEntries.join(', ')}` });
        }
      }

      // Check for aggressive mobs (Oni allAggro makes every mob hostile)
      const allAggro = (player.raceMods || {}).allAggro;
      const aggressive = roomMobs.find(v => {
        const mob = mobs[v];
        if (!mob) return false;
        if (allAggro) return true;
        return mob.flags && mob.flags.includes('aggressive');
      });
      if (aggressive) {
        output.push(...initiateCombat(aggressive));
      }

      // Meta-puzzle: one-time marble sighting (fires before clue discovery)
      if (window.MudMetaPuzzle) {
        const sightingOutput = window.MudMetaPuzzle.checkMarbleSighting(room, player);
        if (sightingOutput.length > 0) output.push(...sightingOutput);
      }

      // Meta-puzzle: check for marble trail clues
      if (window.MudMetaPuzzle) {
        const clueOutput = window.MudMetaPuzzle.checkRoomForClue(room, player);
        if (clueOutput.length > 0) output.push(...clueOutput);
      }

      // Set on_visit_flag if room defines one (used for puzzle prerequisites)
      if (room.on_visit_flag && !player.worldFlags[room.on_visit_flag]) {
        player.worldFlags[room.on_visit_flag] = true;
      }

      // Final confrontation trigger
      if (room.final_confrontation && window.MudMetaPuzzle) {
        output.push(...window.MudMetaPuzzle.executeConfrontation(player));
      }

      return output;
    }

    function doLook(target) {
      const room = currentRoom();
      if (!room) return [{ type: 'error', text: 'There is nothing to see.' }];

      if (!target) {
        return moveToRoom(player.currentRoom); // Re-display room
      }

      // Look at an interactable
      const interactable = (room.interactables || []).find(i =>
        i.keyword.some(k => target.includes(k))
      );
      if (interactable) {
        // Set flags for puzzle clue discovery
        if (room.vnum === 3006 && interactable.keyword.includes('desk')) {
          player.worldFlags.zone_3_knows_combo = true;
        }
        return [{ type: 'info', text: interactable.description }];
      }

      // Look at an item in the room or inventory
      const itemVnum = findItemByKeyword(target);
      if (itemVnum !== null) {
        const item = items[itemVnum];
        if (item) return [{ type: 'info', text: item.description }];
      }

      // Look at a mob -- show description, relative power, and equipment
      const mobVnum = findMobByKeyword(target);
      if (mobVnum !== null) {
        const mob = mobs[mobVnum];
        if (mob) {
          const output = [];
          output.push({ type: 'info', text: `--- ${mob.name} ---` });
          output.push({ type: 'info', text: mob.description || 'You see nothing remarkable.' });
          // Relative power assessment
          const mobPow = getCreaturePower(mob);
          const ratio = mobPow / Math.max(player.power, 1);
          let assessment;
          if (ratio < 0.25) assessment = 'looks utterly harmless to you.';
          else if (ratio < 0.5) assessment = 'looks weak compared to you.';
          else if (ratio < 0.8) assessment = 'looks slightly weaker than you.';
          else if (ratio < 1.2) assessment = 'looks about your equal.';
          else if (ratio < 2.0) assessment = 'looks stronger than you.';
          else if (ratio < 4.0) assessment = 'looks much stronger than you.';
          else assessment = 'radiates overwhelming power.';
          output.push({ type: 'info', text: `${mob.name} ${assessment}` });
          // Show equipment if any
          if (mob.equipment && Object.keys(mob.equipment).length > 0) {
            const equipped = Object.entries(mob.equipment)
              .map(([slot, vnum]) => {
                const item = items[vnum];
                return item ? `  ${slot}: ${item.name}` : null;
              })
              .filter(Boolean);
            if (equipped.length > 0) {
              output.push({ type: 'info', text: 'Wielding/Wearing:' });
              equipped.forEach(line => output.push({ type: 'info', text: line }));
            }
          }
          // Show flags of interest
          const flags = mob.flags || [];
          if (flags.includes('elite')) output.push({ type: 'info', text: '(Elite)' });
          if (flags.includes('boss')) output.push({ type: 'info', text: '(Boss)' });
          if (flags.includes('merchant')) output.push({ type: 'info', text: 'This creature appears to be a merchant.' });
          if (flags.includes('trainer')) output.push({ type: 'info', text: 'This creature appears to be a trainer.' });
          return output;
        }
      }

      return [{ type: 'error', text: `You don't see '${target}' here.` }];
    }

    function doTake(target) {
      if (!target) return [{ type: 'error', text: 'Take what?' }];
      if (player.inventory.length >= 99) {
        return [{ type: 'error', text: 'Your inventory is full (99 items max).' }];
      }

      const room = currentRoom();
      const groundItems = (room?.initial_items || []).filter(v => !isItemTaken(room, v));
      const itemVnum = groundItems.find(v => {
        const item = items[v];
        return item && matchKeyword(item, target);
      });

      if (itemVnum === undefined) {
        return [{ type: 'error', text: `You don't see '${target}' here to take.` }];
      }

      markItemTaken(room, itemVnum);
      player.inventory.push(itemVnum);
      return [{ type: 'success', text: `You take the ${getItemName(itemVnum)}.` }];
    }

    function doDrop(target) {
      if (!target) return [{ type: 'error', text: 'Drop what?' }];

      const idx = player.inventory.findIndex(v => {
        const item = items[v];
        return item && matchKeyword(item, target);
      });

      if (idx === -1) {
        return [{ type: 'error', text: `You don't have '${target}'.` }];
      }

      const vnum = player.inventory.splice(idx, 1)[0];
      return [{ type: 'success', text: `You drop the ${getItemName(vnum)}.` }];
    }

    function doInventory() {
      if (player.inventory.length === 0) {
        return [{ type: 'info', text: 'You are carrying nothing.' }];
      }
      const lines = player.inventory.map(v => `  ${getItemName(v)}`);
      return [
        { type: 'info', text: `Inventory (${player.inventory.length}/99):` },
        ...lines.map(l => ({ type: 'info', text: l }))
      ];
    }

    function doEquipment() {
      const slots = player.equipped;
      const entries = Object.entries(slots).filter(([, v]) => v != null);
      if (entries.length === 0) {
        return [{ type: 'info', text: 'You have nothing equipped.' }];
      }
      const lines = entries.map(([slot, vnum]) => `  [${slot}] ${getItemName(vnum)}`);
      return [
        { type: 'info', text: 'Equipment:' },
        ...lines.map(l => ({ type: 'info', text: l }))
      ];
    }

    function doWear(target) {
      if (!target) return [{ type: 'error', text: 'Wear what?' }];

      const idx = player.inventory.findIndex(v => {
        const item = items[v];
        return item && matchKeyword(item, target);
      });

      if (idx === -1) return [{ type: 'error', text: `You don't have '${target}'.` }];

      const vnum = player.inventory[idx];
      const item = items[vnum];
      const slot = item?.slot || (item?.type === 'weapon' ? 'weapon' : null);
      if (!slot) {
        return [{ type: 'error', text: `You can't wear that.` }];
      }

      // Unequip current item in that slot
      const currentlyEquipped = player.equipped[slot];
      if (currentlyEquipped != null) {
        player.inventory.push(currentlyEquipped);
      }

      // If equipping a weapon into primary slot, clear offhand if primary is now two-handed
      if (slot === 'weapon' && item.two_handed && player.equipped.offhand != null) {
        player.inventory.push(player.equipped.offhand);
        player.equipped.offhand = null;
      }

      player.inventory.splice(idx, 1);
      player.equipped[slot] = vnum;

      // Recalculate stats
      recalcStats();
      return [{ type: 'success', text: `You equip the ${item.name}.` }];
    }

    /**
     * Equip a weapon in the offhand slot for dual wielding.
     * Requires a one-handed weapon in the primary slot.
     */
    function doDualWield(target) {
      if (!target) return [{ type: 'error', text: 'Dual wield what? Usage: dual <weapon>' }];

      // Must have a primary weapon first
      const primaryVnum = player.equipped.weapon;
      if (primaryVnum == null) {
        return [{ type: 'error', text: 'You need a weapon equipped first before dual wielding.' }];
      }
      const primaryItem = items[primaryVnum];
      if (primaryItem?.two_handed) {
        return [{ type: 'error', text: 'You can\'t dual wield with a two-handed weapon.' }];
      }

      // Find the weapon in inventory
      const idx = player.inventory.findIndex(v => {
        const item = items[v];
        return item && item.slot === 'weapon' && matchKeyword(item, target);
      });
      if (idx === -1) return [{ type: 'error', text: `You don't have a weapon called '${target}'.` }];

      const vnum = player.inventory[idx];
      const item = items[vnum];
      if (item.two_handed) {
        return [{ type: 'error', text: `${item.name} is two-handed and can't be used as an offhand weapon.` }];
      }

      // Unequip current offhand if any
      if (player.equipped.offhand != null) {
        player.inventory.push(player.equipped.offhand);
      }
      // Also unequip shield if one is in the offhand-adjacent slot
      if (player.equipped.shield != null) {
        player.inventory.push(player.equipped.shield);
        player.equipped.shield = null;
      }

      player.inventory.splice(idx, 1);
      player.equipped.offhand = vnum;

      recalcStats();
      return [{ type: 'success', text: `You dual wield the ${item.name} in your off hand.` }];
    }

    function doUnequip(target) {
      if (!target) return [{ type: 'error', text: 'Remove what?' }];

      const entry = Object.entries(player.equipped).find(([, vnum]) => {
        if (vnum == null) return false;
        const item = items[vnum];
        return item && matchKeyword(item, target);
      });

      if (!entry) return [{ type: 'error', text: `You don't have '${target}' equipped.` }];

      if (player.inventory.length >= 99) {
        return [{ type: 'error', text: 'Inventory full. Drop something first.' }];
      }

      const [slot, vnum] = entry;
      player.equipped[slot] = null;
      player.inventory.push(vnum);
      recalcStats();
      return [{ type: 'success', text: `You remove the ${getItemName(vnum)}.` }];
    }

    function doUse(target) {
      if (!target) return [{ type: 'error', text: 'Use what?' }];

      const room = currentRoom();

      // Check room interactables first
      const interactable = (room?.interactables || []).find(i =>
        i.keyword.some(k => target.includes(k))
      );
      if (interactable && interactable.action) {
        return executePuzzleAction(interactable.action, target);
      }

      // Check inventory items with use effects
      const invItem = player.inventory.find(v => {
        const item = items[v];
        return item && matchKeyword(item, target);
      });
      if (invItem !== undefined) {
        const item = items[invItem];
        if (item.type === 'consumable') {
          return useConsumable(invItem);
        }
      }

      return [{ type: 'error', text: `You can't use '${target}' here.` }];
    }

    /**
     * Talk to an NPC in the current room.
     */
    function doTalk(target) {
      if (!target) return [{ type: 'error', text: 'Talk to whom?' }];

      const room = currentRoom();
      const roomMobs = getAliveMobsInRoom(room);
      const mobVnum = roomMobs.find(v => {
        const mob = mobs[v];
        return mob && matchKeyword(mob, target);
      });

      if (mobVnum === undefined) {
        return [{ type: 'error', text: `There is no '${target}' here to talk to.` }];
      }

      const mob = mobs[mobVnum];
      if (!mob.dialogue || mob.dialogue.length === 0) {
        return [{ type: 'info', text: `${mob.name} has nothing to say.` }];
      }

      // Find the first dialogue entry whose condition is met (or has no condition)
      const entry = mob.dialogue.find(d => {
        if (!d.condition) return true;
        return checkDialogueCondition(d.condition);
      });

      if (!entry) {
        return [{ type: 'info', text: `${mob.name} has nothing more to say.` }];
      }

      const output = [{ type: 'dialogue', text: `${mob.name} says: "${entry.text}"` }];

      // Apply dialogue effects (give items, set flags, etc.)
      if (entry.effects) {
        output.push(...applyDialogueEffects(entry.effects));
      }

      // Set talked flag for quest tracking
      player.worldFlags[`talked_${mobVnum}`] = true;

      // Check if this NPC has quests to offer
      const availableQuests = Object.values(quests).filter(q =>
        q.giver_vnum === mobVnum &&
        !player.activeQuests.includes(q.id) &&
        !player.completedQuests.includes(q.id)
      );
      if (availableQuests.length > 0) {
        output.push({ type: 'quest', text: `${mob.name} has a task for you:` });
        for (const q of availableQuests) {
          output.push({ type: 'quest', text: `  "${q.name}" - ${q.description}` });
          output.push({ type: 'info', text: `  Type 'quest ${q.name.toLowerCase()}' to accept.` });
        }
      }

      // Check if this NPC can complete any active quests
      const completable = player.activeQuests.filter(qid => {
        const q = quests[qid];
        return q && q.giver_vnum === mobVnum && q.objectives.every(obj => isObjectiveMet(obj));
      });
      for (const qid of completable) {
        output.push(...tryCompleteQuest(qid));
      }

      return output;
    }

    /**
     * Combine two items from inventory into a new item.
     * Syntax: combine <item1> <item2>
     */
    function doCombine(target) {
      if (!target) return [{ type: 'error', text: 'Combine what? (e.g., combine eye cell)' }];

      // Split target into two parts
      const parts = target.split(/\s+/);
      if (parts.length < 2) {
        return [{ type: 'error', text: 'Combine requires two items. (e.g., combine eye cell)' }];
      }

      // Try to match each part to an inventory item
      const item1Keyword = parts[0];
      const item2Keyword = parts.slice(1).join(' ');

      const idx1 = player.inventory.findIndex(v => {
        const item = items[v];
        return item && matchKeyword(item, item1Keyword);
      });
      if (idx1 === -1) {
        return [{ type: 'error', text: `You don't have '${item1Keyword}'.` }];
      }

      const idx2 = player.inventory.findIndex((v, i) => {
        if (i === idx1) return false; // Don't match the same slot
        const item = items[v];
        return item && matchKeyword(item, item2Keyword);
      });
      if (idx2 === -1) {
        return [{ type: 'error', text: `You don't have '${item2Keyword}'.` }];
      }

      const vnum1 = player.inventory[idx1];
      const vnum2 = player.inventory[idx2];

      // Check known recipes
      const result = checkCombineRecipe(vnum1, vnum2);
      if (!result) {
        return [{ type: 'error', text: 'Those items cannot be combined.' }];
      }

      // Remove ingredients, add result
      player.inventory = player.inventory.filter((v, i) => i !== idx1 && i !== idx2);
      const qty = result.qty || 1;
      for (let i = 0; i < qty; i++) player.inventory.push(result.vnum);

      const qtyText = qty > 1 ? ` (x${qty})` : '';
      return [{ type: 'success', text: `You craft: ${getItemName(result.vnum)}${qtyText}` }];
    }

    /**
     * Rotate a statue (Zone 1 Throne Room puzzle).
     * Syntax: rotate statue <number> <direction>
     */
    function doRotate(target) {
      if (!target) return [{ type: 'error', text: 'Rotate what? (e.g., rotate statue 1 east)' }];

      const room = currentRoom();
      if (room?.vnum !== 1017) {
        return [{ type: 'error', text: "There's nothing to rotate here." }];
      }

      // Parse "statue N direction"
      const match = target.match(/statue\s*(\d)\s*(north|south|east|west|n|s|e|w)/i);
      if (!match) {
        return [{ type: 'error', text: 'Try: rotate statue <1-4> <direction>' }];
      }

      const statueNum = parseInt(match[1]);
      if (statueNum < 1 || statueNum > 4) {
        return [{ type: 'error', text: 'There are only 4 statues (1-4).' }];
      }

      const dirInput = match[2].toLowerCase();
      const dir = DIRECTION_ALIASES[dirInput] || dirInput;

      // Store statue state in worldFlags
      player.worldFlags[`statue_${statueNum}`] = dir;

      const output = [{ type: 'success', text: `You rotate statue ${statueNum} to face ${dir}. Stone grinds against stone.` }];

      // Check if all four are correct
      // Solution: statue 1 = east (sword/rising sun), statue 2 = south (shield/river),
      //           statue 3 = north (crown/star), statue 4 = west (hands/setting sun)
      const solution = { 1: 'east', 2: 'south', 3: 'north', 4: 'west' };
      const allCorrect = Object.entries(solution).every(
        ([num, expected]) => player.worldFlags[`statue_${num}`] === expected
      );

      if (allCorrect && !player.worldFlags.zone_1_puzzle_complete) {
        player.worldFlags.zone_1_puzzle_complete = true;
        output.push({ type: 'success', text: '' });
        output.push({ type: 'room-desc', text: 'The four statues lock into position with a thunderous CLICK. The throne shudders and slides backward, revealing a perfectly smooth, circular tunnel leading downward. A faint rolling sound echoes from the darkness below - something was here moments ago. The tunnel is too small for you to follow.' });
        output.push({ type: 'success', text: '─── ZONE 1 PUZZLE COMPLETE ───' });
        output.push({ type: 'info', text: 'The marble was here. It has escaped deeper.' });
      }

      return output;
    }

    function doAttack(target) {
      if (combatState) {
        return [{ type: 'info', text: 'You are already in combat!' }];
      }

      const room = currentRoom();
      const roomMobs = getAliveMobsInRoom(room);

      if (!target && roomMobs.length > 0) {
        // Attack first aggressive mob, or first mob
        const aggroMob = roomMobs.find(v => mobs[v]?.flags?.includes('aggressive'));
        return initiateCombat(aggroMob || roomMobs[0]);
      }

      const mobVnum = roomMobs.find(v => {
        const mob = mobs[v];
        return mob && matchKeyword(mob, target);
      });

      if (mobVnum === undefined) {
        return [{ type: 'error', text: `There is no '${target}' here to fight.` }];
      }

      return initiateCombat(mobVnum);
    }

    function doFlee() {
      if (!combatState) {
        return [{ type: 'error', text: "You aren't in combat." }];
      }

      // Only 1 flee attempt per combat round
      if (combatState.fleeAttempted) {
        return [{ type: 'combat', text: 'You already tried to flee this round. Wait for the next opening.' }];
      }
      combatState.fleeAttempted = true;

      // 50% chance to flee
      if (Math.random() < 0.5) {
        const room = currentRoom();
        const validExits = Object.keys(room?.exits || {}).filter(dir => {
          const ex = room.exits[dir];
          const target = typeof ex === 'object' ? ex.target_vnum : ex;
          return target != null && rooms[target];
        });
        if (validExits.length > 0) {
          const dir = validExits[Math.floor(Math.random() * validExits.length)];
          // Mob heals to full when player flees
          const mob = mobs[combatState.mobVnum];
          combatState.mobHp = combatState.mobMaxHp;
          combatState = null;
          combatTimer = 0;
          const ex = room.exits[dir];
          const targetVnum = typeof ex === 'object' ? ex.target_vnum : ex;
          return [
            { type: 'combat', text: `You flee to the ${dir}!` },
            { type: 'info', text: `The ${mob?.name || 'creature'} recovers as you disengage.` },
            ...moveToRoom(targetVnum)
          ];
        }
      }

      return [{ type: 'combat', text: 'You fail to escape!' }];
    }

    /** Warp back to the player's recall point (default: room 1). */
    function doRecall() {
      if (combatState) {
        return [{ type: 'error', text: "You can't recall while in combat!" }];
      }
      const dest = player.recallPoint || 1;
      if (player.currentRoom === dest) {
        return [{ type: 'info', text: 'You are already at your recall point.' }];
      }
      return [
        { type: 'info', text: 'The world blurs around you...' },
        ...moveToRoom(dest)
      ];
    }

    /** Set the current room as the player's recall point. */
    function doSetRecall() {
      const room = currentRoom();
      if (!room) return [{ type: 'error', text: 'You are nowhere. Cannot set recall.' }];
      player.recallPoint = room.vnum;
      autoSave();
      return [{ type: 'success', text: `Recall point set to: ${room.name}` }];
    }

    /**
     * Show current weather conditions in the player's zone.
     */
    function doWeather() {
      const room = currentRoom();
      if (!room) return [{ type: 'error', text: 'You cannot sense the weather here.' }];
      const weather = zoneWeather[room.zone] || 'clear';
      const descriptions = {
        clear: 'The sky is clear. Visibility is excellent.',
        overcast: 'Heavy clouds blanket the sky, but no rain falls yet.',
        rain: 'Steady rain falls, slicking every surface. (-3% defense in combat)',
        fog: 'Dense fog obscures the distance. (-5% accuracy for all combatants)',
        storm: 'A violent storm rages. Lightning splits the sky. (+10% damage dealt and received)'
      };
      return [{ type: 'info', text: descriptions[weather] }];
    }

     /**
     * Dynamic help  -  pulls from the command registry if available,
     * otherwise shows a static fallback.
     */
    function doHelp() {
      // If the registry is loaded, generate help from registered commands
      if (window.MudCommands) {
        return window.MudCommands.generateHelp();
      }
      // Fallback (should never hit if scripts load correctly)
      return [
        { type: 'info', text: '─── Available Commands ───' },
        { type: 'info', text: "  Type any command to interact. Type 'help' for details." }
      ];
    }

    // ─── Server-Backed Commands ──────────────────────────────────────────────

    /** Auto-save interval tracker (saves every 60 seconds of play). */
    let autoSaveTimer = 0;
    let ambientTimer = 0;
    const AMBIENT_INTERVAL = 30; // Show ambient text after 30 seconds of no player input
    const AUTO_SAVE_INTERVAL = 60;
    let focusRegenTimer = 0;
    const FOCUS_REGEN_INTERVAL = 5; // seconds between passive focus ticks

    // --- Weather system ---
    // Cycles per zone every 5-10 minutes; affects ambient flavor and minor combat mods
    const WEATHER_STATES = ['clear', 'overcast', 'rain', 'fog', 'storm'];
    const WEATHER_CYCLE_MIN = 300;  // 5 minutes minimum
    const WEATHER_CYCLE_MAX = 600;  // 10 minutes maximum
    let weatherTimer = Math.random() * WEATHER_CYCLE_MIN;
    let zoneWeather = {};  // { zoneId: 'rain', ... }

    /**
     * Write a note in the current room (max 280 chars).
     * Async  -  returns a pending message, then posts to server.
     */
    function doWrite(target) {
      if (!target) return [{ type: 'error', text: 'Write what? Usage: write <message>' }];
      if (!window.MudAPI?.isLoggedIn()) {
        return [{ type: 'error', text: 'You must be logged in to leave notes.' }];
      }
      if (target.length > 280) {
        return [{ type: 'error', text: 'Note too long (max 280 characters).' }];
      }

      const room = currentRoom();
      // Filter the note content
      if (window.MudFilter) {
        const check = window.MudFilter.check(target);
        if (check.blocked) {
          return [{ type: 'error', text: 'Your note contains inappropriate language.' }];
        }
      }

      // Fire and forget  -  post to server
      window.MudAPI.postNote(room.vnum, target).catch(err => {
        combatOutput.push({ type: 'error', text: `Note failed: ${err.message}` });
      });

      return [{ type: 'success', text: `You scratch a note into the wall: "${target}"` }];
    }

    /**
     * Read notes left by other players in the current room.
     * Async  -  returns a pending message, then fetches from server.
     */
    function doReadNotes() {
      if (!window.MudAPI?.isLoggedIn()) {
        return [{ type: 'info', text: 'You must be logged in to read notes.' }];
      }

      const room = currentRoom();
      window.MudAPI.getNotes(room.vnum).then(result => {
        if (!result.notes || result.notes.length === 0) {
          combatOutput.push({ type: 'info', text: 'No notes have been left here.' });
        } else {
          combatOutput.push({ type: 'info', text: '─── Notes ───' });
          for (const note of result.notes) {
            combatOutput.push({ type: 'info', text: `  ${note.username}: "${note.content}"` });
          }
        }
      }).catch(err => {
        combatOutput.push({ type: 'error', text: `Could not read notes: ${err.message}` });
      });

      return [{ type: 'info', text: 'Reading notes...' }];
    }

    /**
     * Browse the rotating marketplace.
     * Async  -  fetches stock from server.
     */
    function doShop(target) {
      if (!window.MudAPI?.isLoggedIn()) {
        return [{ type: 'info', text: 'You must be logged in to use the marketplace.' }];
      }

      // If target is a number, try to buy that stock item
      if (target && /^\d+$/.test(target)) {
        const stockId = parseInt(target);
        window.MudAPI.buyItem(stockId).then(result => {
          combatOutput.push({ type: 'success', text: `Purchased! Gold remaining: ${result.gold}` });
          player.gold = result.gold;
          if (result.item_vnum) player.inventory.push(result.item_vnum);
        }).catch(err => {
          combatOutput.push({ type: 'error', text: `Purchase failed: ${err.message}` });
        });
        return [{ type: 'info', text: 'Purchasing...' }];
      }

      // Otherwise, show the shop
      window.MudAPI.getMarketplace().then(result => {
        if (!result.stock || result.stock.length === 0) {
          combatOutput.push({ type: 'info', text: 'The marketplace has nothing for sale right now.' });
        } else {
          combatOutput.push({ type: 'info', text: '─── Marketplace ───' });
          for (const s of result.stock) {
            const name = getItemName(s.item_vnum);
            combatOutput.push({ type: 'info', text: `  [${s.id}] ${name} - ${s.price} gold (qty: ${s.quantity})` });
          }
          combatOutput.push({ type: 'info', text: `  Type 'shop <id>' to purchase.` });
          combatOutput.push({ type: 'info', text: `  Your gold: ${player.gold}` });
        }
      }).catch(err => {
        combatOutput.push({ type: 'error', text: `Marketplace error: ${err.message}` });
      });

      return [{ type: 'info', text: 'Checking the marketplace...' }];
    }

    /**
     * Record a ghost action to the server (fire and forget).
     * Called on movement, combat, and other key actions.
     */
    function recordGhost(action, direction) {
      if (!window.MudAPI?.isLoggedIn()) return;
      const room = currentRoom();
      if (!room) return;
      window.MudAPI.recordGhost(room.vnum, action, direction || '').catch(() => {});
    }

    /**
     * Auto-save the player's state to the server.
     * Called periodically and on key events (room change, combat end, quest complete).
     */
    function autoSave() {
      if (!window.MudAPI?.isLoggedIn()) return;
      window.MudAPI.storeSave(getSaveSlice()).catch(() => {});
    }

    // ─── Ability System ────────────────────────────────────────────────────────

    /**
     * Determine what abilities a mob can use in combat.
     * Boss mobs get 2-3 abilities, elite (aggressive) mobs get 1-2.
     * Returns an array of ability definitions.
     */
    function getMobAbilities(mob) {
      const flags = mob.flags || [];
      const isBoss = flags.includes('boss');
      const isElite = flags.includes('aggressive');
      if (!isBoss && !isElite) return [];

      const mobPower = (mob.stats?.hp || 0) + (mob.stats?.attack || 0) * 3;
      const abilities = [];

      // Boss mobs get a heavy attack, a buff, and optionally a heal
      if (isBoss) {
        abilities.push({
          id: 'mob_heavy_strike', name: 'Heavy Strike', type: 'attack',
          multiplier: 2.0, cooldown: 3,
          desc: 'A devastating blow.'
        });
        abilities.push({
          id: 'mob_enrage', name: 'Enrage', type: 'buff',
          atkMod: 1.5, duration: 3, cooldown: 6,
          desc: 'The creature flies into a rage.'
        });
        if (mobPower > 500) {
          abilities.push({
            id: 'mob_regenerate', name: 'Regenerate', type: 'heal',
            healPercent: 0.15, cooldown: 8,
            desc: 'The creature mends its wounds.'
          });
        }
      } else {
        // Elite mobs get a single strong attack
        abilities.push({
          id: 'mob_power_attack', name: 'Power Attack', type: 'attack',
          multiplier: 1.6, cooldown: 4,
          desc: 'A focused strike.'
        });
      }
      return abilities;
    }

    /**
     * Attempt to use a mob ability. Returns true if an ability was used.
     * Mobs use abilities based on cooldowns and a random chance (30% per round).
     */
    function tryMobAbility(mob, output) {
      if (!combatState.mobAbilities || combatState.mobAbilities.length === 0) return false;

      // 30% chance per round to attempt an ability (adds unpredictability)
      if (Math.random() > 0.3) return false;

      const cooldowns = combatState.mobAbilityCooldowns;
      const round = combatState.combatRound;

      // Find an available ability (not on cooldown)
      const available = combatState.mobAbilities.filter(a => {
        const lastUsed = cooldowns[a.id] || 0;
        return (round - lastUsed) >= a.cooldown;
      });

      if (available.length === 0) return false;

      // Pick a random available ability
      const ability = available[Math.floor(Math.random() * available.length)];
      cooldowns[ability.id] = round;

      if (ability.type === 'attack') {
        const mobAtk = mob.stats.attack || 10;
        const dmg = Math.max(1, Math.floor(mobAtk * ability.multiplier) - Math.floor(player.defense / 3));
        player.hp -= dmg;
        output.push({ type: 'combat', text: `${mob.name} uses ${ability.name}! ${dmg} damage! [HP: ${player.hp}/${player.maxHp}]` });
      } else if (ability.type === 'buff') {
        // Apply a temporary buff to the mob (tracked as a combat state modifier)
        if (!combatState.mobBuffs) combatState.mobBuffs = [];
        combatState.mobBuffs.push({ ...ability, expiresRound: round + ability.duration });
        output.push({ type: 'combat', text: `${mob.name} uses ${ability.name}! ${ability.desc}` });
      } else if (ability.type === 'heal') {
        const heal = Math.floor(combatState.mobMaxHp * ability.healPercent);
        combatState.mobHp = Math.min(combatState.mobMaxHp, combatState.mobHp + heal);
        output.push({ type: 'combat', text: `${mob.name} uses ${ability.name}! Heals ${heal} HP. [Mob HP: ${combatState.mobHp}/${combatState.mobMaxHp}]` });
      }

      return true;
    }

    /**
     * Calculate creature power from its stats (hp + attack*3 + defense*2).
     * Used for the power-gain formula.
     */
    function getCreaturePower(mob) {
      if (!mob || !mob.stats) return 10;
      return (mob.stats.hp || 0) + (mob.stats.attack || 0) * 3 + (mob.stats.defense || 0) * 2;
    }

    /**
     * Calculate the MAXIMUM power that can be gained from a fight.
     * - Creature < 50% of player power -> 0 (too weak)
     * - Creature 50-90% of player -> 2% of creature power
     * - Creature within +/-10% -> 10% of creature power
     * - Creature 10%+ stronger -> 10% + 1% per 5% beyond threshold
     * Power is gained per-hit proportional to damage dealt, capped at this max.
     */
    function calcMaxFightReward(creaturePower, playerPower) {
      const ratio = playerPower > 0 ? (creaturePower / playerPower) : 2;
      if (ratio < 0.5) return 0;

      const threshold = 0.10;
      let base;
      if (ratio < (1 - threshold)) {
        base = Math.max(1, Math.floor(creaturePower * 0.02));
      } else if (ratio <= (1 + threshold)) {
        base = Math.max(1, Math.floor(creaturePower * 0.10));
      } else {
        const excessPercent = (ratio - (1 + threshold)) * 100;
        const bonusPercent = Math.floor(excessPercent / 5);
        const totalPercent = 10 + bonusPercent;
        base = Math.max(1, Math.floor(creaturePower * totalPercent / 100));
      }

      // Echo invasions award 2.5x the normal max reward
      if (combatState && mobs[combatState.mobVnum]?.isEchoInvasion) {
        return Math.floor(base * 2.5);
      }
      return base;
    }

    /**
     * Award power on a successful hit, proportional to damage dealt.
     * Power gained = (damage / mobMaxHp) * maxFightReward, capped so total
     * gained in the fight never exceeds the max reward for that mob.
     * Only awards if mob is >= 50% of player power.
     * @param {number} damage - Damage dealt this hit
     * @returns {number} Power actually gained (0 if mob too weak)
     */
    function awardHitPower(damage) {
      if (!combatState) return 0;
      const mob = mobs[combatState.mobVnum];
      if (!mob) return 0;

      const creaturePower = getCreaturePower(mob);
      const maxReward = calcMaxFightReward(creaturePower, player.power);
      if (maxReward <= 0) return 0;

      // Calculate proportional gain: (damage / mobMaxHp) * maxReward
      const mobMaxHp = combatState.mobMaxHp || 1;
      const proportional = Math.max(1, Math.floor((damage / mobMaxHp) * maxReward));

      // Cap at remaining reward for this fight
      if (!combatState.powerGained) combatState.powerGained = 0;
      const remaining = maxReward - combatState.powerGained;
      if (remaining <= 0) return 0;

      const gained = Math.min(proportional, remaining);
      combatState.powerGained += gained;
      player.power += gained;
      return gained;
    }

    /**
     * Calculate gold dropped by a mob on kill.
     * Returns 0 if the creature is below the 50% power floor.
     * Gold scales with creature power: base 1 gold per 10 power.
     * @param {number} creaturePower - The mob's calculated power
     * @param {number} playerPower - The player's current power
     * @returns {number} Gold to award
     */
    function calcGoldDrop(creaturePower, playerPower) {
      const ratio = playerPower > 0 ? (creaturePower / playerPower) : 2;
      if (ratio < 0.5) return 0;
      return Math.max(1, Math.floor(creaturePower * 0.1));
    }

    /**
     * Display the player's full status screen.
     * Layout: Identity + Description header, merged Attributes section,
     * Economy with deaths, Proficiency, Effects, Location.
     */
    function doStatus() {
      const spec = window.MudAbilities?.getSpec(player.baseClass, player.specialization);
      const specName = spec?.name || player.specName || 'Unspecialized';
      const raceName = player.raceName || 'Unknown';
      const pName = player.name || 'Traveler';
      const title = player.title ? `${player.title} ` : '';
      const desc = player.description || 'A mysterious traveler from another place.';

      // Helpers
      const col = (l, v, w = 16) => `${l.padEnd(w)}${v}`;
      const sep = '  |  ';

      const output = [];

      // === Identity + Description ===
      output.push({ type: 'info', text: `=== ${title}${pName} ===` });
      output.push({ type: 'info', text: `  Name: ${pName}` });
      output.push({ type: 'info', text: `  Race: ${raceName.padEnd(14)}Class: ${specName}` });
      output.push({ type: 'info', text: `  Power: ${player.power}` });
      output.push({ type: 'info', text: '' });
      output.push({ type: 'info', text: `  ${desc}` });

      // === Attributes (merged vitals + combat + stats + growth bars) ===
      output.push({ type: 'info', text: '' });
      output.push({ type: 'info', text: '--- Attributes ---' });

      // HP and Focus on one line
      const hpBar = makeBar(player.hp, player.maxHp, 12);
      const fpBar = makeBar(player.focus, player.maxFocus, 12);
      output.push({ type: 'info', text: `  Hit Points: ${hpBar} ${player.hp}/${player.maxHp}${sep}Focus: ${fpBar} ${player.focus}/${player.maxFocus}` });

      // Attack, Defense, Stance on one line
      let combatLine = `  Attack: ${player.attackPower}${sep}Defense: ${player.defense}`;
      if (window.MudCombatSystems) {
        const stanceName = window.MudCombatSystems.STANCES[player.stance]?.name || 'Balanced';
        combatLine += `${sep}Stance: ${stanceName}`;
      }
      output.push({ type: 'info', text: combatLine });

      // Crit and Dodge on one line
      const cs = player.coreStats;
      const d = player._derived || {};
      const critPct = ((d.critChance || 0.01) * 100).toFixed(1);
      const dodgePct = ((d.dodgeChance || 0) * 100).toFixed(1);
      output.push({ type: 'info', text: `  Crit: ${critPct}%${sep}Dodge: ${dodgePct}%` });

      // Stat bars: Vigor | Precision, then Grit | Instinct
      if (cs && window.MudStats) {
        const statBar = (name, level) => {
          const xp = (cs.xp && cs.xp[name]) || 0;
          const needed = window.MudStats.xpForNextLevel(level);
          const pct = Math.min(100, Math.floor((xp / needed) * 100));
          const filled = Math.floor(pct / 10);
          return '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled) + `  ${pct}%`;
        };
        const v = cs.vigor || 1, p = cs.precision || 1;
        const g = cs.grit || 1, ins = cs.instinct || 1;
        output.push({ type: 'info', text: `  Vigor: ${v}  ${statBar('vigor', v)}${sep}Precision: ${p}  ${statBar('precision', p)}` });
        output.push({ type: 'info', text: `  Grit: ${g}  ${statBar('grit', g)}${sep}Instinct: ${ins}  ${statBar('instinct', ins)}` });
      }

      // Transform info if applicable
      if (window.MudSecretClasses && player.secretClass && player.transformTier >= 0) {
        const tMods = window.MudSecretClasses.getTransformMods(player);
        if (tMods) output.push({ type: 'info', text: `  Transform: ATK x${tMods.atkMod}  DEF x${tMods.defMod}` });
      }
      if (player.exhausted) output.push({ type: 'info', text: '  ** EXHAUSTED **' });

      // === Economy ===
      output.push({ type: 'info', text: '' });
      output.push({ type: 'info', text: '--- Economy ---' });
      output.push({ type: 'info', text: `  Gold: ${player.gold}${sep}Quest Points: ${player.questPoints}` });
      const totalKills = Object.values(player.killCounts || {}).reduce((a, b) => a + b, 0);
      const questsDone = (player.completedQuests || []).length;
      const deaths = player.deaths || 0;
      output.push({ type: 'info', text: `  Kills: ${totalKills}${sep}Quests Done: ${questsDone}` });
      output.push({ type: 'info', text: `  Deaths: ${deaths}` });

      // === Proficiency (top 4) ===
      if (window.MudWeaponProficiency) {
        const wp = player.weaponProficiency || {};
        const entries = Object.entries(wp).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
        if (entries.length > 0) {
          output.push({ type: 'info', text: '' });
          output.push({ type: 'info', text: '--- Proficiency ---' });
          const names = window.MudWeaponProficiency.CATEGORY_NAMES || {};
          const profLine = entries.map(([c, v]) => `${(names[c] || c).substring(0, 10)}: ${Math.floor(v)}%`).join(sep);
          output.push({ type: 'info', text: `  ${profLine}` });
        }
      }

      // === Active Effects ===
      const effects = [];
      for (const [key, remaining] of Object.entries(player.worldFlags || {})) {
        if (remaining <= 0) continue;
        if (key.startsWith('buff_')) {
          const def = window.MudAbilities?.getAbilityById(key.slice(5));
          effects.push(`+${def?.name || key.slice(5)}(${remaining})`);
        } else if (key.startsWith('debuff_')) {
          const def = window.MudAbilities?.getAbilityById(key.slice(7));
          effects.push(`-${def?.name || key.slice(7)}(${remaining})`);
        }
      }
      if (effects.length > 0) {
        output.push({ type: 'info', text: '' });
        output.push({ type: 'info', text: '--- Effects ---' });
        output.push({ type: 'info', text: `  ${effects.join('  ')}` });
      }

      // Karma
      if (player.karma !== undefined && player.karma !== 0) {
        output.push({ type: 'info', text: `  Karma: ${player.karma}` });
      }

      // === Location ===
      const room = rooms[player.currentRoom];
      const zoneId = Math.floor(player.currentRoom / 100);
      const ZONE_NAMES = {
        1: 'The Nexus', 11: 'Shattered Crown', 12: 'Neon Sprawl',
        13: 'Undercity', 14: 'Iron Wastes', 15: 'Void Reach',
        16: 'Temporal Rift', 17: 'Shadow Market', 18: 'Training Grounds',
        19: 'Ancient Ruins', 20: 'Wizard Tower'
      };
      const zoneName = ZONE_NAMES[zoneId] || `Zone ${zoneId}`;
      output.push({ type: 'info', text: '' });
      output.push({ type: 'info', text: '--- Location ---' });
      output.push({ type: 'info', text: `  ${room?.name || 'Unknown'}    Zone: ${zoneName}` });

      output.push({ type: 'info', text: '' });
      output.push({ type: 'info', text: "  Type 'abilities' for ability list, 'proficiency' for weapon mastery." });
      return output;
    }

    /** Build a compact progress bar string. */
    function makeBar(current, max, width = 10) {
      const pct = max > 0 ? current / max : 0;
      const filled = Math.round(pct * width);
      return '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled) + ']';
    }

    /**
     * List the player's unlocked abilities and their cooldown status.
     */
    function doAbilities() {
      if (player.abilities.length === 0) {
        return [{ type: 'info', text: 'You have no abilities yet.' }];
      }
      const output = [{ type: 'info', text: '─── Abilities ───' }];
      for (const abilityId of player.abilities) {
        const def = window.MudAbilities?.getAbilityById(abilityId);
        const cd = player.abilityCooldowns[abilityId] || 0;
        const cdText = cd > 0 ? ` [CD: ${cd} rounds]` : ' [READY]';
        if (def) {
          output.push({ type: 'info', text: `  ${def.name} - ${def.desc}${cdText}` });
        } else {
          // Fallback: show the raw ID so abilities are never silently hidden
          output.push({ type: 'info', text: `  ${abilityId}${cdText}` });
        }
      }
      output.push({ type: 'info', text: '' });
      output.push({ type: 'info', text: `  Focus: ${player.focus}/${player.maxFocus}` });
      output.push({ type: 'info', text: '  Type the ability name to use it in combat.' });
      return output;
    }

    /**
     * Show purchasable abilities at Training Hall (room 8).
     * Requires power threshold met + costs QP.
     */
    function doTrain(target) {
      // Check for weapon style teacher NPC first (advanced proficiency)
      if (window.MudWeaponTeachers) {
        const room = currentRoom();
        const aliveMobs = getAliveMobsInRoom(room);
        const teacherVnum = window.MudWeaponTeachers.findTeacherInRoom(aliveMobs);
        if (teacherVnum) {
          const mobName = getMobName(teacherVnum);
          // 'learn <styleId>' to learn a specific style
          if (target && target !== 'list') {
            const styleTarget = target.toLowerCase().replace(/\s+/g, '_');
            if (window.MudWeaponTeachers.STYLES[styleTarget]) {
              const result = window.MudWeaponTeachers.learnStyle(player, styleTarget);
              if (result.success) recalcStats();
              return result.output;
            }
          }
          // Show teacher menu (only if teacher has something to say)
          const menu = window.MudWeaponTeachers.getTeacherMenu(teacherVnum, player, mobName);
          if (menu.canLearn || menu.output.length > 1) {
            // If there's also a stat trainer, append both menus
            if (window.MudTrainers && window.MudTrainers.isTrainer(teacherVnum)) {
              const statMenu = window.MudTrainers.getTrainingMenu(teacherVnum, player);
              return [...menu.output, { type: 'info', text: '' }, ...statMenu.output];
            }
            return menu.output;
          }
        }
      }

      // Check for trainer NPC in the room first (stat training)
      if (window.MudTrainers) {
        const room = currentRoom();
        const aliveMobs = getAliveMobsInRoom(room);
        const trainerVnum = window.MudTrainers.findTrainerInRoom(aliveMobs);
        if (trainerVnum) {
          // If no target or target is 'list', show the trainer menu
          if (!target || target === 'list') {
            const menu = window.MudTrainers.getTrainingMenu(trainerVnum, player);
            return menu.output;
          }
          // Check if target matches a trainable stat
          const validStats = ['vigor', 'precision', 'grit', 'instinct'];
          const stat = target.toLowerCase();
          if (validStats.includes(stat)) {
            const result = window.MudTrainers.trainStat(trainerVnum, stat, player);
            if (result.success) recalcStats();
            return result.output;
          }
          // If target doesn't match a stat, fall through to ability training
        }
      }

      const TRAINING_ROOM = 8;
      if (player.currentRoom !== TRAINING_ROOM) {
        return [{ type: 'error', text: 'You must be in the Training Hall to learn new abilities.' }];
      }
      if (!player.baseClass || !player.specialization) {
        return [{ type: 'error', text: 'You have no specialization. Something went wrong.' }];
      }

      const purchasable = window.MudAbilities?.getPurchasableAbilities(
        player.baseClass, player.specialization, player.power, player.abilities
      ) || [];

      if (!target || target === 'list') {
        if (purchasable.length === 0) {
          return [
            { type: 'info', text: 'Instructor Vex studies you carefully.' },
            { type: 'info', text: '"You\'ve learned all you can at your current power level."' },
            { type: 'info', text: `  Your power: ${player.power}. Next tier unlocks more abilities.` },
        // Show core stats if available
        ...(window.MudStats && player.coreStats ? window.MudStats.formatStatDisplay(player.coreStats, player.power) : [])
          ];
        }
        const output = [
          { type: 'info', text: 'Instructor Vex nods. "I can teach you these:"' },
          { type: 'info', text: '' }
        ];
        purchasable.forEach((a, i) => {
          const cost = window.MudAbilities?.getAbilityCost(a.tier) || 5;
          output.push({ type: 'items', text: `  ${i + 1}. ${a.name} - ${a.desc}` });
          output.push({ type: 'info', text: `     Cost: ${cost} QP [you have ${player.questPoints}]` });
        });
        output.push({ type: 'info', text: '' });
        output.push({ type: 'success', text: "Type 'buy <number>' or 'buy <name>' to purchase." });
        return output;
      }

      // Redirect to buy
      return doBuy(target);
    }

    /**
     * Purchase an ability with Quest Points.
     */
    function doBuy(target) {
      if (!target) return [{ type: 'info', text: "Type 'train' to see what's available, then 'buy <name or number>'." }];

      const TRAINING_ROOM = 8;
      if (player.currentRoom !== TRAINING_ROOM) {
        return [{ type: 'error', text: 'You must be in the Training Hall to purchase abilities.' }];
      }

      const purchasable = window.MudAbilities?.getPurchasableAbilities(
        player.baseClass, player.specialization, player.power, player.abilities
      ) || [];

      if (purchasable.length === 0) {
        return [{ type: 'error', text: 'Nothing available to purchase right now.' }];
      }

      let chosen = null;
      const idx = parseInt(target, 10);
      if (idx >= 1 && idx <= purchasable.length) {
        chosen = purchasable[idx - 1];
      } else {
        chosen = purchasable.find(a =>
          a.name.toLowerCase().includes(target) || a.id.includes(target)
        );
      }

      if (!chosen) {
        return [{ type: 'error', text: `No ability matches '${target}'. Type 'train' to see options.` }];
      }

      const cost = window.MudAbilities?.getAbilityCost(chosen.tier) || 5;
      if (player.questPoints < cost) {
        return [{ type: 'error', text: `Not enough QP. Need ${cost}, have ${player.questPoints}.` }];
      }

      player.questPoints -= cost;
      player.abilities.push(chosen.id);

      return [
        { type: 'success', text: 'Instructor Vex guides you through the technique...' },
        { type: 'room-name', text: `─── ABILITY LEARNED: ${chosen.name} ───` },
        { type: 'info', text: `  ${chosen.desc}` },
        { type: 'info', text: `  QP remaining: ${player.questPoints}` },
        { type: 'success', text: "Type 'abilities' to see your full list." }
      ];
    }

    /**
     * Change specialization for 30 QP. Keeps old abilities.
     */
    function doRespec(target) {
      const TRAINING_ROOM = 8;
      if (player.currentRoom !== TRAINING_ROOM) {
        return [{ type: 'error', text: 'You must be in the Training Hall to change your path.' }];
      }

      const respecCost = window.MudAbilities?.RESPEC_COST || 30;
      const allSpecs = window.MudAbilities?.getSpecsForClass(player.baseClass) || {};
      const available = Object.entries(allSpecs).filter(([id]) => id !== player.specialization);

      if (!target || target === 'list') {
        const output = [
          { type: 'info', text: `Instructor Vex says: "Changing your path costs ${respecCost} QP."` },
          { type: 'info', text: `  You have ${player.questPoints} QP. Current path: ${player.specName || player.specialization}` },
          { type: 'info', text: '' },
          { type: 'info', text: '  Available paths:' }
        ];
        available.forEach(([id, spec], i) => {
          output.push({ type: 'items', text: `  ${i + 1}. ${spec.name}` });
        });
        output.push({ type: 'info', text: '' });
        output.push({ type: 'success', text: "Type 'respec <number>' or 'respec <name>' to switch." });
        return output;
      }

      if (player.questPoints < respecCost) {
        return [{ type: 'error', text: `Not enough QP. Need ${respecCost}, have ${player.questPoints}.` }];
      }

      let chosen = null;
      const idx = parseInt(target, 10);
      if (idx >= 1 && idx <= available.length) {
        chosen = available[idx - 1];
      } else {
        chosen = available.find(([id, spec]) =>
          spec.name.toLowerCase().includes(target) || id.includes(target)
        );
      }

      if (!chosen) {
        return [{ type: 'error', text: `No path matches '${target}'. Type 'respec' to see options.` }];
      }

      player.questPoints -= respecCost;
      player.specialization = chosen[0];
      player.specName = chosen[1].name;

      return [
        { type: 'success', text: `Instructor Vex nods solemnly. "Your path has changed."` },
        { type: 'room-name', text: `─── NEW PATH: ${chosen[1].name} ───` },
        { type: 'info', text: '  Your old abilities remain, but new ones will come from this tree.' },
        { type: 'info', text: `  QP remaining: ${player.questPoints}` }
      ];
    }

    /**
     * Try to use an ability by typing its name directly.
     * Returns output array if matched, or null if no match.
     */
    function tryUseAbilityByName(input) {
      if (!combatState) return null; // Only works in combat

      // Check if input matches any owned ability name
      const abilityId = player.abilities.find(id => {
        const def = window.MudAbilities?.getAbilityById(id);
        if (!def) return false;
        return def.name.toLowerCase() === input || id === input;
      });
      // Partial match fallback
      const partialId = !abilityId ? player.abilities.find(id => {
        const def = window.MudAbilities?.getAbilityById(id);
        if (!def) return false;
        return def.name.toLowerCase().includes(input);
      }) : null;

      const matchedId = abilityId || partialId;
      if (!matchedId) return null;

      return executeAbility(matchedId);
    }

    /**
     * Execute an ability by ID. Handles focus cost, cooldown, and effects.
     * If a glimmer sparks, the new ability REPLACES the original attack  - 
     * the player discovers and immediately uses the new technique.
     */
    function executeAbility(abilityId) {
      const def = window.MudAbilities?.getAbilityById(abilityId);
      if (!def) return [{ type: 'error', text: 'Ability data not found.' }];

      if (!combatState) {
        return [{ type: 'error', text: 'You can only use abilities in combat.' }];
      }

      // Check cooldown
      if ((player.abilityCooldowns[abilityId] || 0) > 0) {
        return [{ type: 'error', text: `${def.name} is on cooldown (${player.abilityCooldowns[abilityId]} rounds remaining).` }];
      }

      // Calculate focus cost: use ability's focusCost if defined, else tier-based fallback
      const tierCosts = [5, 10, 15, 20];
      const baseCost = def.focusCost != null ? def.focusCost : (tierCosts[def.tier || 0] || 5);
      const cost = Math.max(0, baseCost + (player.focusCostModifier || 0));

      if (player.focus < cost) {
        return [{ type: 'error', text: `Not enough focus. Need ${cost}, have ${player.focus}.` }];
      }

      // Check if this ability uses the charge system
      if (window.MudCharge && window.MudCharge.isChargeable(abilityId)) {
        player.focus -= cost;
        player.abilityCooldowns[abilityId] = def.cooldown || 3;
        const chargeData = window.MudCharge.beginCharge(abilityId);
        chargeData.abilityDef = def;
        chargeState = chargeData;
        const msg = window.MudCharge.getChargeMessage(abilityId, 0);
        return [
          { type: 'combat', text: `You begin charging ${def.name}...` },
          { type: 'info', text: msg },
          { type: 'info', text: `(${chargeData.requiredRounds} rounds to full power. Type 'release' early or 'cancel' to abort.)` }
        ];
      }

      // Spend focus and set cooldown
      player.focus -= cost;
      player.abilityCooldowns[abilityId] = def.cooldown || 3;

      const mob = mobs[combatState.mobVnum];
      const output = [];

      // ── Boss Counter: if telegraph is active and ability qualifies, resolve counter ──
      if (combatState.isBoss && combatState.bossCounter?.telegraphRound && window.MudBossCounter) {
        if (window.MudBossCounter.isValidCounter(abilityId)) {
          const baseDmg = Math.max(1, player.attackPower - Math.floor((mob.stats.defense || 0) / 2));
          const counter = window.MudBossCounter.resolveCounter(def, player, mob, baseDmg);
          combatState.mobHp -= counter.damage;
          const counterPwr = awardHitPower(counter.damage);
          output.push(...counter.output);
          if (counterPwr > 0) output.push({ type: 'success', text: `+${counterPwr} power` });
          if (player.momentum !== undefined) player.momentum = Math.min(12, player.momentum + counter.momentumDelta);
          combatState.bossCounter.telegraphRound = false;
          combatState.bossCounter.telegraphActive = false;
          combatState.bossCounter.roundsSinceLastTelegraph = 0;
          output.push({ type: 'combat', text: `[Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });
          if (combatState.mobHp <= 0) {
            output.push(...handleMobKill(mob));
          }
          return output;
        }
        // Ability was too low tier  -  it still fires normally but counter fails next round
      }

      // ── Glimmer Roll: BEFORE damage  -  check if a new ability sparks ──
      // If it does, the glimmered ability replaces the original for this attack.
      let activeDef = def; // The ability that actually fires
      let glimmered = null;
      if (window.MudGlimmer && combatState) {
        const mobPower = mob ? (mob.stats?.power || mob.stats?.hp || 100) : 100;
        glimmered = window.MudGlimmer.rollForGlimmer({
          usedAbilityId: abilityId,
          baseClass: player.baseClass,
          specId: player.specialization,
          ownedAbilities: player.abilities,
          playerPower: player.power,
          mobPower: mobPower,
          combatTick: combatTick,
          proficiency: player.proficiency || {},
          coreStats: player.coreStats || {},
          chainProgress: player.chainProgress || {}
        });
        if (glimmered) {
          // Show the initiation of the original ability
          output.push({ type: 'combat', text: `You use ${def.name}!` });
          // Dramatic glimmer discovery
          output.push({ type: 'glimmer', text: '\u2605 GLIMMER \u2605' });
          output.push({ type: 'glimmer', text: 'A spark of brilliance! In the heat of battle, you discover something new!' });
          output.push({ type: 'glimmer', text: `Learned "${glimmered.name}"!` });
          output.push({ type: 'glimmer', text: '' });
          // Register the glimmered def so all systems can find it via getAbilityById
          if (window.MudAbilities?.registerGlimmered) {
            window.MudAbilities.registerGlimmered(glimmered);
          }
          // Also persist in player save so it survives reload
          if (!player.glimmeredDefs) player.glimmeredDefs = {};
          player.glimmeredDefs[glimmered.id] = glimmered;

          // Chain evolutions REPLACE the previous rank in the abilities list
          if (glimmered.isChainEvolution || glimmered.chainBaseId) {
            const baseId = glimmered.chainBaseId || window.MudGlimmer.getBaseAbilityId(glimmered.id);
            // Find the previous rank to replace (base ability or earlier chain rank)
            const prevIdx = player.abilities.findIndex(id =>
              id === baseId || window.MudGlimmer.getBaseAbilityId(id) === baseId
            );
            if (prevIdx !== -1) {
              player.abilities[prevIdx] = glimmered.id; // Replace in-place
            } else {
              player.abilities.push(glimmered.id); // No previous rank found, just add
            }
            player.chainProgress = window.MudGlimmer.updateChainProgress(
              player.chainProgress || {}, glimmered
            );
          } else {
            // Non-chain glimmer  -  just add to the list
            player.abilities.push(glimmered.id);
          }
          // The glimmered ability replaces the original for this attack
          activeDef = glimmered;
        }
      }

      // Track last ability used for finishing moves
      lastAbilityUsed = { name: activeDef.name, type: activeDef.type || 'attack' };

      // Shift momentum on ability use (+2 for offensive, +1 for others)
      if (window.MudCombatSystems && player.momentum !== undefined) {
        const delta = (activeDef.type === 'attack') ? 2 : 1;
        const shift = window.MudCombatSystems.shiftMomentum(player.momentum, delta);
        player.momentum = shift.newValue;
        if (shift.message) output.push({ type: 'combat', text: shift.message });
      }

      // Apply ability effects based on type (using activeDef  -  either original or glimmered)
      switch (activeDef.type || 'attack') {
        case 'attack': {
          const mult = activeDef.multiplier || 1.5;
          const hits = activeDef.hits || 1;
          const aDerived = player._derived || {};

          for (let h = 0; h < hits; h++) {
            let dmg = Math.max(1, Math.floor(player.attackPower * mult));
            if (!activeDef.ignoresDef) {
              dmg = Math.max(1, dmg - Math.floor((mob?.stats?.defense || 0) / 2));
            }
            // Apply Precision-based damage variance and crit
            if (window.MudStats) {
              dmg = window.MudStats.applyDamageVariance(dmg, aDerived);
              const aCrit = window.MudStats.rollCrit(aDerived);
              if (aCrit.isCrit) {
                dmg = Math.floor(dmg * aCrit.multiplier);
                output.push({ type: 'combat', text: 'CRITICAL HIT!' });
              }
            }
            combatState.mobHp -= dmg;
            const abilPwr = awardHitPower(dmg);
            output.push({ type: 'combat', text: `${hits > 1 ? `[Hit ${h + 1}] ` : (glimmered ? '' : `You use ${activeDef.name}! `)}${dmg} damage!${abilPwr > 0 ? ` (+${abilPwr} pwr)` : ''} [Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });
            // Stop hitting if mob is dead
            if (combatState.mobHp <= 0) break;
          }

          // Precision grows from ability use
          if (window.MudStats && player.coreStats) {
            const killed = combatState.mobHp <= 0;
            const pGrowth = window.MudStats.onAbilityUsed(activeDef.tier || 0, killed);
            const pResult = window.MudStats.applyGrowth(player.coreStats, pGrowth);
            if (pResult.output.length > 0) { output.push(...pResult.output); recalcStats(); }
          }

          if (activeDef.healPercent) {
            const heal = Math.floor(player.maxHp * activeDef.healPercent);
            player.hp = Math.min(player.maxHp, player.hp + heal);
            output.push({ type: 'success', text: `You recover ${heal} HP. [HP: ${player.hp}/${player.maxHp}]` });
          }

          // Check if mob dies from ability
          if (combatState.mobHp <= 0) {
            output.push(...handleMobKill(mob));
          }
          break;
        }
        case 'heal': {
          const heal = Math.floor(player.maxHp * (activeDef.healPercent || 0.3));
          player.hp = Math.min(player.maxHp, player.hp + heal);
          output.push({ type: 'success', text: `${glimmered ? '' : `You use ${activeDef.name}. `}Restored ${heal} HP. [HP: ${player.hp}/${player.maxHp}]` });
          break;
        }
        case 'buff': {
          player.worldFlags[`buff_${activeDef.id || abilityId}`] = activeDef.duration || 2;
          output.push({ type: 'success', text: `${glimmered ? '' : `You use ${activeDef.name}. `}Active for ${activeDef.duration || 2} rounds.` });
          break;
        }
        case 'debuff': {
          player.worldFlags[`debuff_${activeDef.id || abilityId}`] = activeDef.duration || 2;
          output.push({ type: 'success', text: `${glimmered ? '' : `You use ${activeDef.name}. `}Enemy weakened for ${activeDef.duration || 2} rounds.` });
          break;
        }
        default:
          output.push({ type: 'info', text: `You use ${activeDef.name}.` });
      }

      output.push({ type: 'info', text: `[Focus: ${player.focus}/${player.maxFocus}]` });
      return output;
    }

    /**
     * Handle mob death: award power, loot, focus regen.
     * Shared between auto-attack kills and ability kills.
     */
    function handleMobKill(mob) {
      const output = [];

      // Beastkin animalNoKill: animals flee instead of dying
      const isAnimal = mob.flags && mob.flags.includes('animal');
      if (isAnimal && (player.raceMods || {}).animalNoKill) {
        output.push({ type: 'combat', text: `${mob.name} whimpers and flees into the distance.` });
        markMobDefeated(combatState.mobVnum);
        // Power still gained from the fight, but no kill credit, gold, or loot
        const fightPower = combatState.powerGained || 0;
        if (fightPower > 0) {
          output.push({ type: 'success', text: `Fight total: +${fightPower} power (total: ${player.power})` });
        }
        player.focus = Math.min(player.maxFocus, player.focus + 3);
        combatState = null;
        return output;
      }

      // Finishing move text if killed by an ability
      if (lastAbilityUsed && window.MudCombatSystems) {
        const finisher = window.MudCombatSystems.getFinishingMove(
          lastAbilityUsed.name, mob.name, lastAbilityUsed.type
        );
        output.push({ type: 'combat', text: finisher });
      } else {
        output.push({ type: 'combat', text: `${mob.name} has been defeated!` });
      }
      lastAbilityUsed = null;  // Reset after use
      markMobDefeated(combatState.mobVnum);
      player.killCounts[combatState.mobVnum] = (player.killCounts[combatState.mobVnum] || 0) + 1;

      // Power is gained per-hit during the fight, not on kill.
      // Show fight summary of total power gained.
      const fightPower = combatState.powerGained || 0;
      if (fightPower > 0) {
        output.push({ type: 'success', text: `Fight total: +${fightPower} power (total: ${player.power})` });
      }

      // Award gold based on relative strength
      const creaturePower = getCreaturePower(mob);
      const goldDrop = calcGoldDrop(creaturePower, player.power);
      if (goldDrop > 0) {
        player.gold += goldDrop;
        output.push({ type: 'success', text: `+${goldDrop} gold (total: ${player.gold})` });
      }

      // Restore focus on kill
      player.focus = Math.min(player.maxFocus, player.focus + 5);

      // Loot (only if creature is above the 50% power floor)
      const lootList = mob.loot_table || mob.loot;
      const ratio = player.power > 0 ? (creaturePower / player.power) : 2;
      if (ratio >= 0.5 && lootList && lootList.length > 0) {
        for (const lootVnum of lootList) {
          if (player.inventory.length < 99) {
            player.inventory.push(lootVnum);
            output.push({ type: 'success', text: `You loot: ${getItemName(lootVnum)}` });
          }
        }
      }

      combatState = null;
      combatTimer = 0;

      // Record ghost and auto-save after combat
      recordGhost('attack', String(mob.vnum));
      autoSave();

      return output;
    }

    // ─── Quest System ─────────────────────────────────────────────────────────

    /**
     * Handle the 'quest' command. Shows active quests, or accepts/completes quests.
     * Syntax: quest | quest list | quest accept <name> | quest complete <name>
     */
    function doQuest(target) {
      if (!target || target === 'list') {
        return showQuestLog();
      }
      if (target === 'available') {
        return showAvailableQuests();
      }
      // Accept or complete by partial name match
      const questId = findQuestByName(target);
      if (questId && player.activeQuests.includes(questId)) {
        return tryCompleteQuest(questId);
      }
      if (questId && !player.activeQuests.includes(questId)) {
        // Allow re-accepting completed quests (repeatable)
        return acceptQuest(questId);
      }
      return [{ type: 'info', text: "Type 'quest' to see your log, or 'quest available' to see what's offered nearby." }];
    }

    /**
     * Display the player's active quest log with objective progress.
     */
    function showQuestLog() {
      if (player.activeQuests.length === 0 && player.completedQuests.length === 0) {
        return [{ type: 'info', text: 'Your quest log is empty. Talk to NPCs to find quests.' }];
      }
      const output = [{ type: 'info', text: '─── Quest Log ───' }];
      for (const qid of player.activeQuests) {
        const q = quests[qid];
        if (!q) continue;
        output.push({ type: 'quest', text: `  [ACTIVE] ${q.name}` });
        output.push({ type: 'info', text: `    ${q.description}` });
        for (const obj of q.objectives) {
          const done = isObjectiveMet(obj);
          output.push({ type: done ? 'success' : 'info', text: `    ${done ? '[x]' : '[ ]'} ${obj.description}${obj.count ? ` (${getObjectiveProgress(obj)})` : ''}` });
        }
      }
      if (player.completedQuests.length > 0) {
        output.push({ type: 'info', text: `  Completed: ${player.completedQuests.length} quest(s)` });
      }
      return output;
    }

    /**
     * Show quests available from NPCs in the current room.
     */
    function showAvailableQuests() {
      const room = currentRoom();
      const roomMobVnums = getAliveMobsInRoom(room);
      // All quests from NPCs in this room that aren't currently active
      const available = Object.values(quests).filter(q => {
        if (player.activeQuests.includes(q.id)) return false;
        return roomMobVnums.includes(q.giver_vnum);
      });
      if (available.length === 0) {
        return [{ type: 'info', text: 'No new quests available here. Try talking to NPCs in other areas.' }];
      }
      const output = [{ type: 'info', text: '─── Available Quests ───' }];
      for (const q of available) {
        const giver = mobs[q.giver_vnum];
        const repeat = player.completedQuests.includes(q.id) ? ' [REPEATABLE]' : '';
        output.push({ type: 'quest', text: `  ${q.name}${repeat} (from ${giver?.name || 'Unknown'})` });
        output.push({ type: 'info', text: `    ${q.description}` });
      }
      output.push({ type: 'info', text: "  Talk to the NPC to accept, or type 'quest <name>' to accept." });
      return output;
    }

    /**
     * Accept a quest by ID. Adds to active quests and gives starting items.
     */
    function acceptQuest(questId) {
      const q = quests[questId];
      if (!q) return [{ type: 'error', text: 'Quest not found.' }];

      player.activeQuests.push(questId);
      player.worldFlags[`quest_${questId}_active`] = true;

      const output = [
        { type: 'quest', text: `─── Quest Accepted: ${q.name} ───` },
        { type: 'info', text: q.description }
      ];

      // Give starting item if specified
      if (q.give_on_accept && player.inventory.length < 99) {
        player.inventory.push(q.give_on_accept);
        output.push({ type: 'success', text: `You receive: ${getItemName(q.give_on_accept)}` });
      }

      return output;
    }

    /**
     * Attempt to complete an active quest. Checks all objectives.
     */
    function tryCompleteQuest(questId) {
      const q = quests[questId];
      if (!q) return [{ type: 'error', text: 'Quest not found.' }];

      const allMet = q.objectives.every(obj => isObjectiveMet(obj));
      if (!allMet) {
        return [
          { type: 'info', text: `Quest '${q.name}' is not yet complete.` },
          ...q.objectives.filter(obj => !isObjectiveMet(obj)).map(obj =>
            ({ type: 'info', text: `  [ ] ${obj.description}` })
          )
        ];
      }

      // Complete the quest
      player.activeQuests = player.activeQuests.filter(id => id !== questId);
      if (!player.completedQuests.includes(questId)) {
        player.completedQuests.push(questId);
      }
      player.worldFlags[`quest_${questId}_done`] = true;

      // Track completion count for QP calculation
      player.questCompletionCounts[questId] = (player.questCompletionCounts[questId] || 0) + 1;
      const timesCompleted = player.questCompletionCounts[questId];
      const isFirstTime = timesCompleted === 1;

      const output = [{ type: 'quest', text: `─── Quest Complete: ${q.name} ───` }];

      // Award Quest Points: 5 first time, 3 on repeats
      const qpReward = isFirstTime ? 5 : 3;
      player.questPoints += qpReward;
      output.push({ type: 'success', text: `+${qpReward} Quest Points${isFirstTime ? '' : ' (repeat)'}. (Total: ${player.questPoints} QP)` });

      // Apply rewards
      if (q.rewards) {
        if (q.rewards.gold) {
          player.gold += q.rewards.gold;
          output.push({ type: 'success', text: `Received ${q.rewards.gold} gold. (Total: ${player.gold})` });
        }
        if (q.rewards.item && player.inventory.length < 99) {
          player.inventory.push(q.rewards.item);
          output.push({ type: 'success', text: `Received: ${getItemName(q.rewards.item)}` });
        }
        // Stat bonuses only on first completion
        if (isFirstTime) {
          if (q.rewards.attack_bonus) {
            player.attackPower += q.rewards.attack_bonus;
            output.push({ type: 'success', text: `Attack power increased by ${q.rewards.attack_bonus}!` });
          }
          if (q.rewards.defense_bonus) {
            player.defense += q.rewards.defense_bonus;
            output.push({ type: 'success', text: `Defense increased by ${q.rewards.defense_bonus}!` });
          }
          if (q.rewards.heal_bonus) {
            player.maxHp += q.rewards.heal_bonus;
            player.hp += q.rewards.heal_bonus;
            output.push({ type: 'success', text: `Max HP increased by ${q.rewards.heal_bonus}!` });
          }
        }
        if (q.rewards.message) {
          output.push({ type: 'dialogue', text: q.rewards.message });
        }
      }

      return output;
    }

    /**
     * Check if a single quest objective is met.
     */
    function isObjectiveMet(obj) {
      switch (obj.type) {
        case 'visit':
          return player.visitedRooms.includes(obj.target);
        case 'has_item':
          if (obj.count) {
            return player.inventory.filter(v => v === obj.target).length >= obj.count;
          }
          return player.inventory.includes(obj.target);
        case 'kill_count':
          return (player.killCounts[obj.target] || 0) >= (obj.count || 1);
        case 'talk_npc':
          return !!player.worldFlags[`talked_${obj.target}`];
        case 'visit_with_flag':
          return player.visitedRooms.includes(obj.target) && !!player.worldFlags[obj.flag];
        default:
          return false;
      }
    }

    /**
     * Get progress string for a counted objective (e.g., "3/5").
     */
    function getObjectiveProgress(obj) {
      switch (obj.type) {
        case 'kill_count':
          return `${Math.min(player.killCounts[obj.target] || 0, obj.count)}/${obj.count}`;
        case 'has_item':
          if (obj.count) {
            return `${player.inventory.filter(v => v === obj.target).length}/${obj.count}`;
          }
          return player.inventory.includes(obj.target) ? '1/1' : '0/1';
        default:
          return '';
      }
    }

    /**
     * Find a quest ID by partial name match.
     */
    function findQuestByName(target) {
      const lower = target.toLowerCase();
      const match = Object.values(quests).find(q =>
        q.name.toLowerCase().includes(lower)
      );
      return match ? match.id : null;
    }

    // ─── Combat ──────────────────────────────────────────────────────────────

    /** Begin combat with a mob. Refuses quest NPCs and no_attack flagged mobs. */
    function initiateCombat(mobVnum) {
      const mob = mobs[mobVnum];
      if (!mob) return [{ type: 'error', text: 'Nothing to fight.' }];

      // Prevent attacking protected NPCs (quest givers, merchants, trainers)
      const mobFlags = mob.flags || [];
      if (mobFlags.includes('no_attack') || mobFlags.includes('quest_npc')) {
        return [{ type: 'info', text: `${mob.name} is not interested in fighting you.` }];
      }

      const isBoss = (mob.flags || []).includes('boss');
      combatState = {
        mobVnum,
        mobHp: mob.stats.max_hp || mob.stats.hp,
        mobMaxHp: mob.stats.max_hp || mob.stats.hp,
        // Boss counter state
        isBoss,
        bossCounter: isBoss ? window.MudBossCounter?.createBossCounterState() : null,
        // Mob ability tracking
        mobAbilities: getMobAbilities(mob),
        mobAbilityCooldowns: {},
        combatRound: 0
      };
      combatTimer = 0;

      return [{ type: 'combat', text: `─── COMBAT: ${mob.name} [HP: ${combatState.mobHp}/${combatState.mobMaxHp}] ───` }];
    }

    /**
     * Called each frame. Handles combat auto-attack ticks.
     */
    function update(dt) {
      // Advance engine clock for mob respawn tracking
      engineClock += dt;

      // Auto-save timer (runs even outside combat)
      autoSaveTimer += dt;  // dt is already in seconds from host frame loop
      if (autoSaveTimer >= AUTO_SAVE_INTERVAL) {
        autoSaveTimer = 0;
        autoSave();
      }

      // Ambient flavor text  -  only fires after player is truly idle (no input)
      if (!combatState) {
        ambientTimer += dt;
        if (ambientTimer >= AMBIENT_INTERVAL) {
          // Reset with jitter (45-75s) so subsequent messages feel organic
          ambientTimer = -(Math.random() * 30 + 15);
          const room = currentRoom();
          if (room?.ambient) {
            const msgs = Array.isArray(room.ambient) ? room.ambient : [room.ambient];
            const msg = msgs[Math.floor(Math.random() * msgs.length)];
            pushCombatOutput([{ type: 'info', text: msg }]);
          }
        }
      } else {
        ambientTimer = 0;
      }

      // Weather cycling - advance weather per zone periodically
      weatherTimer += dt;
      if (weatherTimer >= WEATHER_CYCLE_MIN) {
        weatherTimer = -(Math.random() * (WEATHER_CYCLE_MAX - WEATHER_CYCLE_MIN));
        const room = currentRoom();
        if (room) {
          const zone = room.zone;
          const prev = zoneWeather[zone] || 'clear';
          // Pick a new weather state different from current
          let next;
          do {
            next = WEATHER_STATES[Math.floor(Math.random() * WEATHER_STATES.length)];
          } while (next === prev && WEATHER_STATES.length > 1);
          zoneWeather[zone] = next;
          // Announce weather change
          const weatherMessages = {
            clear: 'The sky clears. Visibility improves.',
            overcast: 'Clouds gather overhead, dimming the light.',
            rain: 'Rain begins to fall, pattering against every surface.',
            fog: 'A thick fog rolls in, obscuring the distance.',
            storm: 'Thunder rumbles. A storm breaks overhead.'
          };
          pushCombatOutput([{ type: 'info', text: weatherMessages[next] }]);
        }
      }

      // Passive focus regen when out of combat
      if (!combatState && player.focus < player.maxFocus) {
        focusRegenTimer += dt;
        if (focusRegenTimer >= FOCUS_REGEN_INTERVAL) {
          focusRegenTimer -= FOCUS_REGEN_INTERVAL;
          player.focus = Math.min(player.maxFocus, player.focus + 1);
        }
      } else if (combatState) {
        focusRegenTimer = 0;
      }

      // Tick death_weakness out of combat (decays at same rate as combat rounds)
      if (!combatState && player.worldFlags?.death_weakness) {
        if (!player._dwOocTimer) player._dwOocTimer = 0;
        player._dwOocTimer += dt;
        if (player._dwOocTimer >= COMBAT_TICK_INTERVAL) {
          player._dwOocTimer -= COMBAT_TICK_INTERVAL;
          const dw = player.worldFlags.death_weakness;
          if (dw && dw.rounds > 0) {
            dw.rounds--;
            if (dw.rounds <= 0) {
              delete player.worldFlags.death_weakness;
              delete player._dwOocTimer;
              pushCombatOutput([{ type: 'success', text: 'Your strength returns to normal.' }]);
            }
          }
        }
      }

      if (!combatState) return;

      combatTimer += dt;
      if (combatTimer < COMBAT_TICK_INTERVAL) return;
      combatTimer -= COMBAT_TICK_INTERVAL;
      combatTick++;  // Increment once per combat round (every COMBAT_TICK_INTERVAL seconds)

      const mob = mobs[combatState.mobVnum];
      if (!mob) { combatState = null; return; }

      const output = [];

      // ─── Charge system: tick active charge instead of auto-attacking ───
      if (chargeState && chargeState.active && window.MudCharge) {
        // Check for charge interruption from mob damage
        const profLevel = (player.proficiency?.[chargeState.abilityId] || 0);
        if (window.MudCharge.checkChargeInterrupt(profLevel)) {
          output.push({ type: 'combat', text: `Your ${chargeState.abilityDef?.name || 'charge'} is interrupted!` });
          chargeState = null;
        } else {
          const tick = window.MudCharge.tickCharge(chargeState);
          output.push({ type: 'info', text: tick.message });
          if (tick.complete) {
            // Full charge: fire the ability at 2x multiplier
            const mult = window.MudCharge.getChargeDamageMultiplier(
              chargeState.roundsCharged, chargeState.requiredRounds
            );
            const aDef = chargeState.abilityDef;
            const baseMult = aDef?.multiplier || 1.5;
            const totalDmg = Math.floor(player.attackPower * baseMult * mult);
            combatState.mobHp -= totalDmg;
            const chargePwr = awardHitPower(totalDmg);
            output.push({ type: 'combat', text: `FULLY CHARGED! ${aDef?.name || 'Attack'} unleashes for ${totalDmg} damage!${chargePwr > 0 ? ` (+${chargePwr} pwr)` : ''} [Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });
            lastAbilityUsed = { name: aDef?.name || 'Charged Attack', type: aDef?.type || 'attack' };
            chargeState = null;
            if (combatState.mobHp <= 0) {
              output.push(...handleMobKill(mob));
              pushCombatOutput(output);
              return;
            }
          }
        }
        // Mob still attacks while player is charging
        // (fall through to mob attack section below)
        if (chargeState) {
          // Skip player auto-attack, go straight to cooldown/buff/mob attack
          // Tick down ability cooldowns
          for (const key of Object.keys(player.abilityCooldowns)) {
            player.abilityCooldowns[key] = Math.max(0, player.abilityCooldowns[key] - 1);
          }
          // Mob attacks player
          const mobAtk = mob.stats.attack || 10;
          let mobDmg = Math.max(1, mobAtk - Math.floor(player.defense / 2));
          if (window.MudStats) {
            const derived = player._derived || {};
            mobDmg = window.MudStats.applyBigHitReduction(mobDmg, player.maxHp, derived);
          }
          player.hp -= mobDmg;
          output.push({ type: 'combat', text: `${mob.name} hits you for ${mobDmg} damage while you charge. [HP: ${player.hp}/${player.maxHp}]` });
          if (player.hp <= 0) {
            output.push({ type: 'combat', text: 'You have been defeated...' });
            // Death penalty: lose fight gains + 2% total power
            const fightGains = combatState.powerGained || 0;
            const percentPenalty = Math.floor(player.power * 0.02);
            const totalLoss = fightGains + percentPenalty;
            player.power = Math.max(0, player.power - totalLoss);
            if (totalLoss > 0) {
              output.push({ type: 'error', text: `Lost ${totalLoss} power (${fightGains} from fight + ${percentPenalty} penalty). [Power: ${player.power}]` });
            }
            output.push({ type: 'info', text: 'You awaken back at the Nexus.' });
            if (window.MudEchoes) {
              const echo = window.MudEchoes.createEcho(player, player.currentRoom, mob.name);
              if (!player.echoes) player.echoes = [];
              player.echoes.push(echo);
              player.echoes = window.MudEchoes.pruneExpired(player.echoes);
              output.push({ type: 'info', text: 'A faint echo of your struggle lingers behind...' });
            }
            player.deaths = (player.deaths || 0) + 1;
            player.exhausted = false;
            if (!player.worldFlags) player.worldFlags = {};
            player.worldFlags.death_weakness = {
              rounds: 24, atkMod: 0.9, defMod: 0.9, hpMod: 0.9, focusMod: 0.9
            };
            output.push({ type: 'error', text: 'You feel weakened... (-10% ATK/DEF/HP/Focus for 1 minute)' });
            recalcStats();
            player.hp = player.maxHp;
            combatState = null;
            combatTimer = 0;
            chargeState = null;
            player.currentRoom = player.recallPoint || 1;
          }
          pushCombatOutput(output);
          return;
        }
      }

      // ─── Collect active buff/debuff modifiers ──────────────────────────
      let buffAtkMod = 1.0;  // Multiplier for player attack from buffs
      let buffDefMod = 1.0;  // Multiplier for player defense from buffs
      let debuffMobAtkMod = 1.0;  // Multiplier for mob attack from debuffs
      let debuffMobDefMod = 1.0;  // Multiplier for mob defense from debuffs

      // Apply stance modifiers to buff multipliers
      if (window.MudCombatSystems && player.stance) {
        const stanceDef = window.MudCombatSystems.STANCES[player.stance]
          || window.MudCombatSystems.SPEC_STANCES[player.spec];
        if (stanceDef && (player.stance === stanceDef.id || window.MudCombatSystems.STANCES[player.stance])) {
          const s = window.MudCombatSystems.STANCES[player.stance] || stanceDef;
          buffAtkMod *= s.atkMod || 1.0;
          buffDefMod *= s.defMod || 1.0;
        }
      }

      // Apply momentum damage modifier
      if (window.MudCombatSystems && player.momentum !== undefined) {
        const momMod = window.MudCombatSystems.getMomentumDamageMod(player.momentum);
        buffAtkMod *= momMod;
      }

      // Apply exhaustion penalties
      if (player.exhausted && window.MudCombatSystems) {
        buffAtkMod *= window.MudCombatSystems.EXHAUSTION_ATK_PENALTY;
        buffDefMod *= window.MudCombatSystems.EXHAUSTION_DEF_PENALTY;
      }

      // Apply transformation stat modifiers (secret class transforms)
      if (window.MudSecretClasses) {
        const tMods = window.MudSecretClasses.getTransformMods(player);
        if (tMods) {
          buffAtkMod *= tMods.atkMod;
          buffDefMod *= tMods.defMod;
        }
        // Drain focus per tick while transformed
        const drainOutput = window.MudSecretClasses.tickTransformDrain(player);
        if (drainOutput) output.push(...drainOutput);
      }
      for (const [key, remaining] of Object.entries(player.worldFlags)) {
        if (remaining <= 0) continue;
        if (key.startsWith('buff_')) {
          const abilityId = key.slice(5);
          const def = window.MudAbilities?.getAbilityById(abilityId);
          if (def?.atkMod) buffAtkMod *= def.atkMod;
          if (def?.defMod) buffDefMod *= def.defMod;
        } else if (key.startsWith('debuff_')) {
          const abilityId = key.slice(7);
          const def = window.MudAbilities?.getAbilityById(abilityId);
          if (def?.atkMod) debuffMobAtkMod *= def.atkMod;  // Reduces mob attack
          if (def?.defMod) debuffMobDefMod *= def.defMod;  // Reduces mob defense
        } else if (key === 'death_weakness') {
          // Death penalty: 10% reduction to player attack and defense
          const dw = player.worldFlags[key];
          if (dw && dw.atkMod) buffAtkMod *= dw.atkMod;
          if (dw && dw.defMod) buffDefMod *= dw.defMod;
        }
      }

      // Weather combat modifiers
      const room = currentRoom();
      const weather = room ? (zoneWeather[room.zone] || 'clear') : 'clear';
      if (weather === 'fog') {
        // Fog: -5% accuracy for both sides (reduces effective attack)
        buffAtkMod *= 0.95;
        debuffMobAtkMod *= 0.95;
      } else if (weather === 'storm') {
        // Storm: +10% damage dealt and received (volatile combat)
        buffAtkMod *= 1.10;
        debuffMobAtkMod *= 1.10;
      } else if (weather === 'rain') {
        // Rain: -3% defense (slippery footing)
        buffDefMod *= 0.97;
      }

      // Player attacks mob (with stat-derived variance, crit, initiative)
      const derived = player._derived || {};

      // Hit/miss check  -  base 15% miss chance, reduced by weapon proficiency
      let playerMissed = false;
      const BASE_MISS_CHANCE = 0.15;
      if (window.MudWeaponProficiency && player.equipped.weapon != null) {
        const wpnItem = items[player.equipped.weapon];
        const cat = wpnItem?.weapon_category;
        if (cat && !window.MudWeaponProficiency.cannotMiss(player, cat)) {
          const prof = window.MudWeaponProficiency.getProficiency(player, cat);
          const missChance = BASE_MISS_CHANCE * (1 - prof / 100);
          if (Math.random() < missChance) playerMissed = true;
        }
      } else if (window.MudWeaponProficiency) {
        // Unarmed proficiency reduces miss chance
        if (!window.MudWeaponProficiency.cannotMiss(player, 'unarmed')) {
          const prof = window.MudWeaponProficiency.getProficiency(player, 'unarmed');
          const missChance = BASE_MISS_CHANCE * (1 - prof / 100);
          if (Math.random() < missChance) playerMissed = true;
        }
      } else if (Math.random() < BASE_MISS_CHANCE) {
        playerMissed = true;
      }

      // Combat message variety pools
      const MISS_MSGS = [
        `You swing at ${mob.name} but miss!`,
        `Your attack goes wide - ${mob.name} sidesteps!`,
        `You lunge at ${mob.name} but find only air!`,
        `${mob.name} weaves aside as you strike!`,
        `Your blow glances off harmlessly!`
      ];
      if (playerMissed) {
        output.push({ type: 'combat', text: MISS_MSGS[Math.floor(Math.random() * MISS_MSGS.length)] });
      }

      if (!playerMissed) {
        const effectiveAtk = Math.floor(player.attackPower * buffAtkMod);
        const effectiveMobDef = Math.floor((mob.stats.defense || 0) * debuffMobDefMod);
        let rawPlayerDmg = Math.max(1, effectiveAtk - Math.floor(effectiveMobDef / 2));
        // Apply damage variance (Precision reduces randomness)
        if (window.MudStats) {
          rawPlayerDmg = window.MudStats.applyDamageVariance(rawPlayerDmg, derived);
        }
        // Roll for critical hit (Precision)
        let playerCrit = false;
        if (window.MudStats) {
          const critRoll = window.MudStats.rollCrit(derived);
          if (critRoll.isCrit) {
            rawPlayerDmg = Math.floor(rawPlayerDmg * critRoll.multiplier);
            playerCrit = true;
          }
        }
        const playerDmg = rawPlayerDmg;
        combatState.mobHp -= playerDmg;
        const hitPwr = awardHitPower(playerDmg);
        const critTag = playerCrit ? ' CRITICAL!' : '';
        const HIT_MSGS = [
          `You hit ${mob.name} for ${playerDmg} damage.`,
          `You strike ${mob.name} solidly for ${playerDmg} damage.`,
          `Your attack connects - ${playerDmg} damage to ${mob.name}.`,
          `You land a blow on ${mob.name} for ${playerDmg} damage.`,
          `${mob.name} staggers from your ${playerDmg} damage hit.`
        ];
        const CRIT_MSGS = [
          `CRITICAL! You devastate ${mob.name} for ${playerDmg} damage!`,
          `CRITICAL HIT! ${playerDmg} damage tears into ${mob.name}!`,
          `A perfect strike! ${playerDmg} CRITICAL damage to ${mob.name}!`
        ];
        const hitMsg = playerCrit
          ? CRIT_MSGS[Math.floor(Math.random() * CRIT_MSGS.length)]
          : HIT_MSGS[Math.floor(Math.random() * HIT_MSGS.length)];
        output.push({ type: 'combat', text: `${hitMsg}${hitPwr > 0 ? ` (+${hitPwr} pwr)` : ''} [Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });
        // Precision grows from landing basic attacks
        if (window.MudStats && player.coreStats) {
          const growth = window.MudStats.onBasicAttackLanded();
          const result = window.MudStats.applyGrowth(player.coreStats, growth);
          if (result.output.length > 0) output.push(...result.output);
          if (result.output.length > 0) recalcStats();
        }
        // Weapon proficiency gain for primary weapon category (or unarmed)
        if (window.MudWeaponProficiency) {
          const wpCat = player.equipped.weapon != null
            ? items[player.equipped.weapon]?.weapon_category
            : 'unarmed';
          if (wpCat) {
            const wpResult = window.MudWeaponProficiency.onWeaponUsed(player, wpCat);
            if (wpResult?.message) output.push({ type: 'info', text: wpResult.message });
            // Advanced style proficiency gain (same hit, separate track)
            if (window.MudWeaponTeachers) {
              const asResult = window.MudWeaponTeachers.onWeaponUsed(player, wpCat);
              if (asResult?.message) output.push({ type: 'info', text: asResult.message });
            }
          }
        }

        // Offhand attack (dual wield)  -  60% of offhand weapon damage
        if (player.equipped.offhand != null && combatState.mobHp > 0) {
          const ohItem = items[player.equipped.offhand];
          if (ohItem) {
            let ohDmg = Math.max(1, Math.floor((ohItem.stats?.attack || 3) * 0.6) - Math.floor((mob.stats.defense || 0) / 3));
            if (ohDmg < 1) ohDmg = 1;
            combatState.mobHp -= ohDmg;
            const ohPwr = awardHitPower(ohDmg);
            output.push({ type: 'combat', text: `Your off-hand ${ohItem.name} strikes ${mob.name} for ${ohDmg} damage.${ohPwr > 0 ? ` (+${ohPwr} pwr)` : ''} [Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });
            // Weapon proficiency gain for offhand category
            if (window.MudWeaponProficiency && ohItem.weapon_category) {
              const wpResult = window.MudWeaponProficiency.onWeaponUsed(player, ohItem.weapon_category);
              if (wpResult?.message) output.push({ type: 'info', text: wpResult.message });
              if (window.MudWeaponTeachers) {
                const asResult = window.MudWeaponTeachers.onWeaponUsed(player, ohItem.weapon_category);
                if (asResult?.message) output.push({ type: 'info', text: asResult.message });
              }
            }
          }
        }
      } // end !playerMissed

      // Multi-attack: extra hits from stances, training, and power progression
      if (!playerMissed && combatState.mobHp > 0 && window.MudCombatSystems) {
        const totalAttacks = window.MudCombatSystems.calcAttacksPerRound({
          power: player.power,
          stanceId: player.stance || 'balanced',
          specId: player.spec,
          hasMultiAttackTraining: !!player.worldFlags?.multi_attack_trained
        });
        for (let extra = 1; extra < totalAttacks && combatState.mobHp > 0; extra++) {
          const effectiveAtk = Math.floor(player.attackPower * buffAtkMod);
          const effectiveMobDef = Math.floor((mob.stats.defense || 0) * debuffMobDefMod);
          let extraDmg = Math.max(1, effectiveAtk - Math.floor(effectiveMobDef / 2));
          if (window.MudStats) extraDmg = window.MudStats.applyDamageVariance(extraDmg, derived);
          combatState.mobHp -= extraDmg;
          const extraPwr = awardHitPower(extraDmg);
          output.push({ type: 'combat', text: `Extra strike! You hit ${mob.name} for ${extraDmg} damage.${extraPwr > 0 ? ` (+${extraPwr} pwr)` : ''} [Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });
        }
      }

      // Check mob death
      if (combatState.mobHp <= 0) {
        output.push(...handleMobKill(mob));
        pushCombatOutput(output);
        return;
      }

      // Tick down ability cooldowns each combat round
      for (const key of Object.keys(player.abilityCooldowns)) {
        player.abilityCooldowns[key] = Math.max(0, player.abilityCooldowns[key] - 1);
      }

      // Tick down buff/debuff durations and remove expired ones
      for (const key of Object.keys(player.worldFlags)) {
        if (key.startsWith('buff_') || key.startsWith('debuff_')) {
          player.worldFlags[key]--;
          if (player.worldFlags[key] <= 0) {
            delete player.worldFlags[key];
            const abilityId = key.startsWith('buff_') ? key.slice(5) : key.slice(7);
            const def = window.MudAbilities?.getAbilityById(abilityId);
            const label = def?.name || abilityId;
            output.push({ type: 'info', text: `${key.startsWith('buff_') ? 'Buff' : 'Debuff'} faded: ${label}` });
          }
        } else if (key === 'death_weakness') {
          // Tick death weakness duration
          const dw = player.worldFlags[key];
          if (dw && dw.rounds > 0) {
            dw.rounds--;
            if (dw.rounds <= 0) {
              delete player.worldFlags[key];
              output.push({ type: 'success', text: 'Your strength returns to normal.' });
            }
          }
        }
      }

      // Drift momentum toward neutral each round
      if (window.MudCombatSystems && player.momentum !== undefined) {
        const drift = window.MudCombatSystems.driftMomentum(player.momentum);
        player.momentum = drift.newValue;
        if (drift.message) output.push({ type: 'combat', text: drift.message });
      }

      // Check exhaustion state transitions
      if (window.MudCombatSystems) {
        if (!player.exhausted && window.MudCombatSystems.shouldExhaust(player.focus)) {
          player.exhausted = true;
          output.push({ type: 'combat', text: 'You collapse from exhaustion! ATK and DEF reduced until you recover focus.' });
        } else if (player.exhausted && window.MudCombatSystems.shouldRecoverExhaustion(player.focus, player.maxFocus)) {
          player.exhausted = false;
          output.push({ type: 'combat', text: 'You catch your second wind - exhaustion fades!' });
        }
      }

      // Stance-based focus regen (some spec stances grant focus per tick)
      if (window.MudCombatSystems && player.stance) {
        const specStance = window.MudCombatSystems.SPEC_STANCES[player.spec];
        if (specStance && player.stance === specStance.id && specStance.focusRegen) {
          player.focus = Math.min(player.maxFocus, player.focus + specStance.focusRegen);
        }
      }

      // ─── Boss Counter System ─────────────────────────────────────────
      if (combatState.isBoss && combatState.bossCounter && window.MudBossCounter) {
        const bc = combatState.bossCounter;
        if (bc.telegraphRound) {
          // Player didn't counter in time  -  resolve failed counter
          const mobAtk = mob.stats.attack || 10;
          const fail = window.MudBossCounter.resolveFail(mob, mobAtk);
          player.hp -= fail.damage;
          output.push(...fail.output);
          if (player.momentum !== undefined) player.momentum = Math.max(0, player.momentum + fail.momentumDelta);
          bc.telegraphRound = false;
          bc.telegraphActive = false;
          bc.roundsSinceLastTelegraph = 0;
        } else {
          bc.roundsSinceLastTelegraph++;
          if (window.MudBossCounter.shouldTelegraph(bc.roundsSinceLastTelegraph, true)) {
            bc.telegraphActive = true;
            bc.telegraphRound = true;
            output.push({ type: 'error', text: window.MudBossCounter.getTelegraphMessage(mob) });
            output.push({ type: 'info', text: 'Use a Tier 2+ ability NOW to counter!' });
          }
        }
      }

      // Track combat rounds for mob ability cooldowns
      combatState.combatRound = (combatState.combatRound || 0) + 1;
      combatState.fleeAttempted = false; // Reset flee attempt for new round

      // ─── Mob Ability Usage (elite/boss only) ────────────────────────
      const mobAbilityResult = tryMobAbility(mob, output);
      if (mobAbilityResult) {
        // Mob used an ability instead of basic attack this round
      } else {
      // Mob attacks player (with dodge, big-hit reduction, stat growth)
      // Roll for dodge (Instinct)
      if (window.MudStats && window.MudStats.rollDodge(derived)) {
        const DODGE_MSGS = [
          `You dodge ${mob.name}'s attack!`,
          `You sidestep ${mob.name}'s strike!`,
          `${mob.name} swings - you duck just in time!`,
          `You roll away from ${mob.name}'s blow!`,
          `${mob.name}'s attack whiffs past you!`
        ];
        output.push({ type: 'combat', text: DODGE_MSGS[Math.floor(Math.random() * DODGE_MSGS.length)] });
        // Instinct grows from dodging
        if (player.coreStats) {
          const growth = window.MudStats.onDodge();
          const result = window.MudStats.applyGrowth(player.coreStats, growth);
          if (result.output.length > 0) { output.push(...result.output); recalcStats(); }
        }
      } else {
        const mobAtk = Math.floor((mob.stats.attack || 10) * debuffMobAtkMod);
        const effectivePlayerDef = Math.floor(player.defense * buffDefMod);
        let mobDmg = Math.max(1, mobAtk - Math.floor(effectivePlayerDef / 2));
        // Apply big-hit reduction (Grit)
        if (window.MudStats) {
          mobDmg = window.MudStats.applyBigHitReduction(mobDmg, player.maxHp, derived);
        }
        player.hp -= mobDmg;
        const MOB_HIT_MSGS = [
          `${mob.name} hits you for ${mobDmg} damage.`,
          `${mob.name} strikes you for ${mobDmg} damage.`,
          `${mob.name} lands a blow - ${mobDmg} damage.`,
          `You take ${mobDmg} damage from ${mob.name}'s attack.`,
          `${mob.name} connects - ${mobDmg} damage!`
        ];
        output.push({ type: 'combat', text: `${MOB_HIT_MSGS[Math.floor(Math.random() * MOB_HIT_MSGS.length)]} [HP: ${player.hp}/${player.maxHp}]` });
        // Vigor grows from taking damage and surviving
        if (window.MudStats && player.coreStats && player.hp > 0) {
          const vGrowth = window.MudStats.onDamageTaken(mobDmg, player.maxHp, player.hp);
          if (vGrowth) {
            const vResult = window.MudStats.applyGrowth(player.coreStats, vGrowth);
            if (vResult.output.length > 0) { output.push(...vResult.output); recalcStats(); }
          }
        }
        // Grit grows from being hit
        if (window.MudStats && player.coreStats) {
          const gGrowth = window.MudStats.onHitReceived(mobDmg, player.defense);
          const gResult = window.MudStats.applyGrowth(player.coreStats, gGrowth);
          if (gResult.output.length > 0) { output.push(...gResult.output); recalcStats(); }
        }
      }

      } // end of basic attack else-branch

      // Check player death
      if (player.hp <= 0) {
        output.push({ type: 'combat', text: 'You have been defeated...' });

        // Death penalty: lose all power gained this fight + 2% of total power
        const fightGains = combatState.powerGained || 0;
        const percentPenalty = Math.floor(player.power * 0.02);
        const totalLoss = fightGains + percentPenalty;
        player.power = Math.max(0, player.power - totalLoss);
        if (totalLoss > 0) {
          output.push({ type: 'error', text: `Lost ${totalLoss} power (${fightGains} from fight + ${percentPenalty} penalty). [Power: ${player.power}]` });
        }

        output.push({ type: 'info', text: 'You awaken back at the Nexus.' });

        // Create a death echo at the location where the player fell
        if (window.MudEchoes) {
          const echo = window.MudEchoes.createEcho(player, player.currentRoom, mob.name);
          if (!player.echoes) player.echoes = [];
          player.echoes.push(echo);
          player.echoes = window.MudEchoes.pruneExpired(player.echoes);
          output.push({ type: 'info', text: 'A faint echo of your struggle lingers behind...' });
        }

        // Increment death counter
        player.deaths = (player.deaths || 0) + 1;

        // Clear exhaustion on death
        player.exhausted = false;

        // Apply weakness debuff for 1 minute (24 rounds at 2.5s each)
        // -10% attack, -10% defense, -10% maxHp, -10% maxFocus
        if (!player.worldFlags) player.worldFlags = {};
        player.worldFlags.death_weakness = {
          rounds: 24, atkMod: 0.9, defMod: 0.9, hpMod: 0.9, focusMod: 0.9
        };
        output.push({ type: 'error', text: 'You feel weakened... (-10% ATK/DEF/HP/Focus for 1 minute)' });

        player.hp = player.maxHp;
        recalcStats();  // Recalc to apply weakness to maxHp/maxFocus
        player.hp = player.maxHp;  // Set HP to weakened max
        combatState = null;
        combatTimer = 0;
        player.currentRoom = player.recallPoint || 1;
        pushCombatOutput(output);
        return;
      }

      pushCombatOutput(output);
    }

    // Combat output is pushed to the UI asynchronously
    let pendingCombatOutput = [];

    function pushCombatOutput(lines) {
      pendingCombatOutput.push(...lines);
    }

    function flushCombatOutput() {
      const out = pendingCombatOutput.slice();
      pendingCombatOutput = [];
      return out;
    }

    // ─── Puzzle System ───────────────────────────────────────────────────────

    /**
     * Execute a puzzle action triggered by interacting with a room object.
     */
    function executePuzzleAction(actionId, target) {
      switch (actionId) {
        case 'use_scanner':
          return puzzleUseScannerZ2();
        case 'rotate_statue_1':
        case 'rotate_statue_2':
        case 'rotate_statue_3':
        case 'rotate_statue_4':
          return [{ type: 'info', text: "Try 'rotate statue <number> <direction>' to turn it." }];
        case 'inspect_throne':
          if (player.worldFlags.zone_1_puzzle_complete) {
            return [{ type: 'room-desc', text: 'The throne has slid aside, revealing a smooth circular tunnel leading down. The marble is long gone.' }];
          }
          return [{ type: 'info', text: 'The throne is massive and immovable. Perhaps if the statues were aligned correctly...' }];
        case 'use_safe':
          return puzzleUseSafeZ3();
        case 'use_console':
          return puzzleUseConsoleZ4();
        case 'use_flame':
          return puzzleUseFlameZ5();
        case 'use_gem':
          return puzzleUseGemZ6();
        case 'use_pipe_organ':
          return puzzleUsePipeOrganZ7();
        case 'use_mirror':
          return puzzleUseMirrorZ8();
        case 'use_hourglass':
          return puzzleUseHourglassZ9();
        case 'use_obelisk':
          return puzzleUseObeliskZ10();
        case 'use_void_anchor':
          return puzzleUseVoidAnchorZ11();
        default:
          return [{ type: 'info', text: `[Puzzle interaction: ${actionId}]` }];
      }
    }

    /**
     * Zone 3 puzzle: Enter the combination on the wall safe.
     * The combination is 1945 (year the war ended), hinted by the PI's desk note.
     */
    function puzzleUseSafeZ3() {
      const room = currentRoom();
      if (room?.vnum !== 3008) {
        return [{ type: 'error', text: "There's no safe here." }];
      }
      if (player.worldFlags.zone_3_safe_opened) {
        return [{ type: 'info', text: 'The safe is already open.' }];
      }
      // Check if the player has visited the PI's office (where the clue is)
      if (!player.worldFlags.zone_3_knows_combo) {
        return [{ type: 'info', text: 'The safe has a combination dial. You need to find the code.' }];
      }
      player.worldFlags.zone_3_safe_opened = true;
      // Give the brass key
      player.inventory.push(3003);
      return [
        { type: 'success', text: 'You dial 1-9-4-5. The safe clicks open.' },
        { type: 'success', text: 'Inside you find the Heavy Brass Key.' },
        { type: 'success', text: '--- ZONE 3 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Zone 4 puzzle: Enter the abort code at the silo console.
     * Code is DELTA-9, found on a sticky note in the control room.
     */
    function puzzleUseConsoleZ4() {
      const room = currentRoom();
      if (room?.vnum !== 4010) {
        return [{ type: 'error', text: "There's no console here." }];
      }
      if (player.worldFlags.zone_4_launch_aborted) {
        return [{ type: 'info', text: 'The launch has already been aborted.' }];
      }
      // Check if player has the abort code note
      if (!player.inventory.includes(4003)) {
        return [{ type: 'info', text: 'The console demands an abort code. You need to find it.' }];
      }
      player.worldFlags.zone_4_launch_aborted = true;
      return [
        { type: 'success', text: 'You type DELTA-9 into the console. The countdown stops.' },
        { type: 'room-desc', text: 'LAUNCH ABORTED. The silo powers down with a deep mechanical groan.' },
        { type: 'success', text: '--- ZONE 4 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Zone 5 puzzle: Light the braziers with the Flame of the Masters.
     * Requires the quest item from the West Pavilion.
     */
    function puzzleUseFlameZ5() {
      const room = currentRoom();
      if (room?.vnum !== 5008) {
        return [{ type: 'error', text: "There are no braziers here." }];
      }
      if (player.worldFlags.zone_5_braziers_lit) {
        return [{ type: 'info', text: 'The braziers are already lit. The gate is open.' }];
      }
      if (!player.inventory.includes(5003)) {
        return [{ type: 'info', text: 'The braziers are cold and dark. You need a special flame to light them.' }];
      }
      player.worldFlags.zone_5_braziers_lit = true;
      player.worldFlags[`door_5008_up`] = 'unlocked';
      return [
        { type: 'success', text: 'You hold the Flame of the Masters to each brazier. They ignite in sequence.' },
        { type: 'room-desc', text: 'The sealed gate above rumbles open, revealing the path to the Third Shard.' },
        { type: 'success', text: '--- ZONE 5 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Zone 6 puzzle: Insert the Lion's Eye gem into the mechanism.
     * Opens the path to the secret passage beneath the catacombs.
     */
    function puzzleUseGemZ6() {
      const room = currentRoom();
      if (room?.vnum !== 6012) {
        return [{ type: 'error', text: "There's no mechanism here." }];
      }
      if (player.worldFlags.zone_6_mechanism_opened) {
        return [{ type: 'info', text: 'The mechanism has already been activated.' }];
      }
      if (!player.inventory.includes(6003)) {
        return [{ type: 'info', text: 'The stone lion relief has an empty eye socket. It needs something...' }];
      }
      player.worldFlags.zone_6_mechanism_opened = true;
      player.worldFlags[`door_6012_down`] = 'unlocked';
      // Remove the gem from inventory
      player.inventory = player.inventory.filter(v => v !== 6003);
      return [
        { type: 'success', text: "You press the Lion's Eye gem into the socket. The wall grinds open." },
        { type: 'room-desc', text: 'A hidden passage is revealed, leading deeper beneath the catacombs.' },
        { type: 'success', text: '--- ZONE 6 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Zone 2 puzzle: Use the charged cyber-eye on the scanner.
     */
    function puzzleUseScannerZ2() {
      const room = currentRoom();
      if (room?.vnum !== 2018) {
        return [{ type: 'error', text: "There's no scanner here." }];
      }

      // Check if player has the Charged Cyber-Eye (vnum 2006)
      if (!player.inventory.includes(2006)) {
        return [{ type: 'error', text: "The scanner requires a valid retinal scan. You need a charged cyber-eye." }];
      }

      // Unlock the door
      player.worldFlags.zone_2_biometric_unlocked = true;
      player.worldFlags[`door_2018_north`] = 'unlocked';

      return [
        { type: 'success', text: 'You hold the charged cyber-eye up to the scanner. It pulses blue...' },
        { type: 'room-desc', text: 'BIOMETRIC SCAN ACCEPTED. The massive vault door hisses open, revealing the Mainframe Core beyond.' },
        { type: 'success', text: '─── ZONE 2 PUZZLE COMPLETE ───' }
      ];
    }

    /**
     * Zone 7 puzzle: Play the correct sequence on the pipe organ.
     * The notes are hinted by the stained glass windows (C-E-G-B).
     * Requires the player to have visited the Chapel Nave (room 7008).
     */
    function puzzleUsePipeOrganZ7() {
      const room = currentRoom();
      if (room?.vnum !== 7012) {
        return [{ type: 'error', text: "There's no pipe organ here." }];
      }
      if (player.worldFlags.zone_7_organ_played) {
        return [{ type: 'info', text: 'The organ has already been played. The crypt is open.' }];
      }
      if (!player.worldFlags.zone_7_saw_windows) {
        return [{ type: 'info', text: 'The organ has four colored keys. You need to find the correct sequence somewhere in this zone.' }];
      }
      player.worldFlags.zone_7_organ_played = true;
      player.worldFlags[`door_7012_down`] = 'unlocked';
      return [
        { type: 'success', text: 'You play C-E-G-B. The notes resonate through the cathedral.' },
        { type: 'room-desc', text: 'The floor beneath the organ slides away, revealing a staircase into the crypt below.' },
        { type: 'success', text: '--- ZONE 7 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Zone 8 puzzle: Align the gravity mirrors to redirect the beam.
     * Requires the Gravity Lens (item 8003) from the Observatory.
     */
    function puzzleUseMirrorZ8() {
      const room = currentRoom();
      if (room?.vnum !== 8012) {
        return [{ type: 'error', text: "There are no mirrors here." }];
      }
      if (player.worldFlags.zone_8_mirrors_aligned) {
        return [{ type: 'info', text: 'The mirrors are already aligned. The path is clear.' }];
      }
      if (!player.inventory.includes(8003)) {
        return [{ type: 'info', text: 'The mirrors reflect light in random directions. You need something to focus the beam.' }];
      }
      player.worldFlags.zone_8_mirrors_aligned = true;
      player.worldFlags[`door_8012_up`] = 'unlocked';
      player.inventory = player.inventory.filter(v => v !== 8003);
      return [
        { type: 'success', text: 'You insert the Gravity Lens. The beams converge into a single point of light.' },
        { type: 'room-desc', text: 'The concentrated beam burns through the ceiling, opening a passage upward.' },
        { type: 'success', text: '--- ZONE 8 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Zone 9 puzzle: Turn the hourglass at the correct moment.
     * Requires the Temporal Sand (item 9003) from the Ruins.
     */
    function puzzleUseHourglassZ9() {
      const room = currentRoom();
      if (room?.vnum !== 9012) {
        return [{ type: 'error', text: "There's no hourglass here." }];
      }
      if (player.worldFlags.zone_9_hourglass_turned) {
        return [{ type: 'info', text: 'The hourglass has already been turned. Time flows normally here now.' }];
      }
      if (!player.inventory.includes(9003)) {
        return [{ type: 'info', text: 'The hourglass is empty. It needs special sand to function.' }];
      }
      player.worldFlags.zone_9_hourglass_turned = true;
      player.worldFlags[`door_9012_east`] = 'unlocked';
      player.inventory = player.inventory.filter(v => v !== 9003);
      return [
        { type: 'success', text: 'You pour the Temporal Sand into the hourglass and flip it.' },
        { type: 'room-desc', text: 'Time ripples. A door that was never there before materializes to the east.' },
        { type: 'success', text: '--- ZONE 9 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Zone 10 puzzle: Activate the obelisk with the Shard of Reality.
     * The shard is found in the Fractured Corridor (item 10003).
     */
    function puzzleUseObeliskZ10() {
      const room = currentRoom();
      if (room?.vnum !== 10012) {
        return [{ type: 'error', text: "There's no obelisk here." }];
      }
      if (player.worldFlags.zone_10_obelisk_activated) {
        return [{ type: 'info', text: 'The obelisk pulses with stable energy. The rift is open.' }];
      }
      if (!player.inventory.includes(10003)) {
        return [{ type: 'info', text: 'The obelisk is cracked and dormant. It needs a fragment of reality to reactivate.' }];
      }
      player.worldFlags.zone_10_obelisk_activated = true;
      player.worldFlags[`door_10012_north`] = 'unlocked';
      player.inventory = player.inventory.filter(v => v !== 10003);
      return [
        { type: 'success', text: 'You press the Shard of Reality into the obelisk. It flares to life.' },
        { type: 'room-desc', text: 'Reality stabilizes around the obelisk. A rift opens to the north, leading deeper into the shattered realm.' },
        { type: 'success', text: '--- ZONE 10 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Zone 11 puzzle: Anchor yourself in the void to reach the final chamber.
     * Requires the Void Tether (item 11003) from the Edge of Nothing.
     */
    function puzzleUseVoidAnchorZ11() {
      const room = currentRoom();
      if (room?.vnum !== 11012) {
        return [{ type: 'error', text: "There's nothing to anchor to here." }];
      }
      if (player.worldFlags.zone_11_void_anchored) {
        return [{ type: 'info', text: 'The void anchor holds. The path to the center is stable.' }];
      }
      if (!player.inventory.includes(11003)) {
        return [{ type: 'info', text: 'The void stretches infinitely. Without an anchor, you cannot cross.' }];
      }
      player.worldFlags.zone_11_void_anchored = true;
      player.worldFlags[`door_11012_down`] = 'unlocked';
      player.inventory = player.inventory.filter(v => v !== 11003);
      return [
        { type: 'success', text: 'You cast the Void Tether into the darkness. It catches on something.' },
        { type: 'room-desc', text: 'A bridge of solidified void forms beneath your feet, leading down to the heart of everything.' },
        { type: 'success', text: '--- ZONE 11 PUZZLE COMPLETE ---' }
      ];
    }

    /**
     * Check if two item vnums form a known crafting recipe.
     * Returns { vnum } of the result item, or null.
     */
    function checkCombineRecipe(vnum1, vnum2) {
      // Check loaded recipes from data/mud/recipes.json
      if (!recipes || Object.keys(recipes).length === 0) return null;
      const inv = player.inventory;
      for (const recipe of Object.values(recipes)) {
        const ings = recipe.ingredients || [];
        // Check if all ingredients are present in inventory
        const needed = {};
        for (const ing of ings) {
          needed[ing.vnum] = (needed[ing.vnum] || 0) + ing.qty;
        }
        // For 2-item combine, check if both vnums satisfy a recipe
        if (ings.length <= 2) {
          const provided = {};
          provided[vnum1] = (provided[vnum1] || 0) + 1;
          provided[vnum2] = (provided[vnum2] || 0) + 1;
          let match = true;
          for (const [v, qty] of Object.entries(needed)) {
            if ((provided[parseInt(v)] || 0) < qty) { match = false; break; }
          }
          if (match) return { vnum: recipe.result.vnum, qty: recipe.result.qty || 1, name: recipe.name };
        }
      }
      return null;
    }

    // ─── Dialogue System ─────────────────────────────────────────────────────

    /**
     * Check if a dialogue condition is met.
     * Conditions are strings like "has_item:1002" or "flag:zone_1_puzzle_complete"
     */
    function checkDialogueCondition(condition) {
      if (condition.startsWith('has_item:')) {
        const vnum = parseInt(condition.split(':')[1]);
        return player.inventory.includes(vnum);
      }
      if (condition.startsWith('flag:')) {
        const flag = condition.split(':')[1];
        return !!player.worldFlags[flag];
      }
      if (condition.startsWith('!flag:')) {
        const flag = condition.split(':')[1];
        return !player.worldFlags[flag];
      }
      if (condition.startsWith('visited:')) {
        const vnum = parseInt(condition.split(':')[1]);
        return player.visitedRooms.includes(vnum);
      }
      return true;
    }

    /**
     * Apply effects from a dialogue entry.
     * Effects: { give_item: vnum, set_flag: "name", heal: amount }
     */
    function applyDialogueEffects(effects) {
      const output = [];

      if (effects.give_item && player.inventory.length < 99) {
        player.inventory.push(effects.give_item);
        output.push({ type: 'success', text: `You receive: ${getItemName(effects.give_item)}` });
      }
      if (effects.set_flag) {
        player.worldFlags[effects.set_flag] = true;
      }
      if (effects.heal) {
        player.hp = Math.min(player.maxHp, player.hp + effects.heal);
        output.push({ type: 'success', text: `You feel restored. [HP: ${player.hp}/${player.maxHp}]` });
      }

      return output;
    }

    // ─── Consumables ─────────────────────────────────────────────────────────

    /**
     * Use a consumable item from inventory.
     * Handles: heal, hp_restore, focus, attack_boost, damage, flee, cure.
     */
    function useConsumable(vnum) {
      const item = items[vnum];
      if (!item) return [{ type: 'error', text: 'Nothing happens.' }];
      const stats = item.stats || {};
      const output = [];
      let consumed = false;

      // Flee effect  -  guaranteed escape from combat
      if (stats.flee) {
        if (!combatState) {
          return [{ type: 'error', text: "You aren't in combat - no need for that." }];
        }
        combatState = null;
        combatTimer = 0;
        const room = currentRoom();
        const validExits = Object.keys(room?.exits || {}).filter(dir => {
          const ex = room.exits[dir];
          const target = typeof ex === 'object' ? ex.target_vnum : ex;
          return target != null && rooms[target];
        });
        if (validExits.length > 0) {
          const dir = validExits[Math.floor(Math.random() * validExits.length)];
          const ex = room.exits[dir];
          const targetVnum = typeof ex === 'object' ? ex.target_vnum : ex;
          output.push({ type: 'success', text: `You use the ${item.name} and vanish in a cloud of smoke!` });
          output.push(...moveToRoom(targetVnum));
        } else {
          output.push({ type: 'success', text: `You use the ${item.name} - combat ends!` });
        }
        consumed = true;
      }

      // Damage effect  -  deal damage to current combat target
      if (stats.damage && !consumed) {
        if (!combatState) {
          return [{ type: 'error', text: "No target - you need to be in combat to use that." }];
        }
        const dmg = stats.damage;
        combatState.mobHp -= dmg;
        const throwPwr = awardHitPower(dmg);
        const mob = mobs[combatState.mobVnum];
        output.push({ type: 'combat', text: `You hurl the ${item.name}! ${dmg} damage!${throwPwr > 0 ? ` (+${throwPwr} pwr)` : ''} [Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });
        if (combatState.mobHp <= 0) {
          output.push(...handleMobKill(mob));
        }
        consumed = true;
      }

      // HP healing (heal and hp_restore are equivalent)
      const healAmount = (stats.heal || 0) + (stats.hp_restore || 0);
      if (healAmount > 0 && !consumed) {
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + healAmount);
        const healed = player.hp - before;
        output.push({ type: 'success', text: `You use the ${item.name}. Restored ${healed} HP. [HP: ${player.hp}/${player.maxHp}]` });
        consumed = true;
      }

      // Focus restoration
      if (stats.focus && !consumed) {
        const before = player.focus;
        player.focus = Math.min(player.maxFocus, player.focus + stats.focus);
        const restored = player.focus - before;
        output.push({ type: 'success', text: `You use the ${item.name}. Restored ${restored} Focus. [Focus: ${player.focus}/${player.maxFocus}]` });
        consumed = true;
      } else if (stats.focus && consumed) {
        // Dual-effect items (e.g., Astral Nectar: heal + focus)
        player.focus = Math.min(player.maxFocus, player.focus + stats.focus);
        output.push({ type: 'info', text: `Also restored ${stats.focus} Focus. [Focus: ${player.focus}/${player.maxFocus}]` });
      }

      // Attack boost  -  temporary buff stored in worldFlags
      if (stats.attack_boost) {
        player.worldFlags['buff_consumable_atk'] = 5; // Lasts 5 combat rounds
        output.push({ type: 'success', text: `You use the ${item.name}. Attack boosted for 5 rounds!` });
        consumed = true;
      }

      // Cure  -  remove debuffs
      if (stats.cure) {
        let cured = 0;
        for (const key of Object.keys(player.worldFlags)) {
          if (key.startsWith('debuff_') || key === 'death_weakness') {
            delete player.worldFlags[key];
            cured++;
          }
        }
        if (!consumed) {
          output.push({ type: 'success', text: `You use the ${item.name}. ${cured > 0 ? `Cured ${cured} ailment${cured > 1 ? 's' : ''}!` : 'You feel refreshed.'}` });
          consumed = true;
        } else {
          output.push({ type: 'info', text: `Also cured ${cured} ailment${cured > 1 ? 's' : ''}.` });
        }
      }

      // Respec Token  -  reset specialization
      if (stats.respec && !consumed) {
        player.specialization = null;
        player.specName = null;
        player.worldFlags['needs_respec'] = true;
        output.push({ type: 'success', text: `You use the ${item.name}. Your specialization has been reset!` });
        output.push({ type: 'info', text: "Type 'train' to choose a new specialization." });
        consumed = true;
      }

      // XP Tome  -  boost all core stats
      if (stats.stat_boost && !consumed) {
        const boost = stats.stat_boost || 5;
        if (player.coreStats) {
          player.coreStats.vigor = (player.coreStats.vigor || 1) + boost;
          player.coreStats.precision = (player.coreStats.precision || 1) + boost;
          player.coreStats.grit = (player.coreStats.grit || 1) + boost;
          player.coreStats.instinct = (player.coreStats.instinct || 1) + boost;
          output.push({ type: 'success', text: `You read the ${item.name}. All core stats increased by ${boost}!` });
          recalcStats();
        } else {
          output.push({ type: 'error', text: 'Your stats are not yet initialized.' });
        }
        consumed = true;
      }

      // Treasure Map  -  reveal a hidden room
      if (stats.reveal_hidden && !consumed) {
        // Find rooms with hidden exits or locked doors the player hasn't found
        const hiddenRooms = Object.entries(rooms).filter(([rv, r]) => {
          return r.hidden || r.password || (r.exits && Object.values(r.exits).some(
            ex => typeof ex === 'object' && (ex.hidden || ex.locked)
          ));
        });
        if (hiddenRooms.length > 0) {
          const [rv, r] = hiddenRooms[Math.floor(Math.random() * hiddenRooms.length)];
          player.worldFlags[`map_revealed_${rv}`] = true;
          output.push({ type: 'success', text: `You study the ${item.name}...` });
          output.push({ type: 'quest', text: `  A hidden location is marked: "${r.name}" (room ${rv})` });
        } else {
          output.push({ type: 'info', text: `You study the ${item.name}, but it reveals nothing new.` });
        }
        consumed = true;
      }

      // Fallback for items with no recognized stats
      if (!consumed) {
        player.hp = Math.min(player.maxHp, player.hp + 20);
        output.push({ type: 'success', text: `You use the ${item.name}. [HP: ${player.hp}/${player.maxHp}]` });
      }

      // Remove from inventory
      const idx = player.inventory.indexOf(vnum);
      if (idx !== -1) player.inventory.splice(idx, 1);

      return output;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function getItemName(vnum) {
      return items[vnum]?.name || `item#${vnum}`;
    }

    function getMobName(vnum) {
      return mobs[vnum]?.name || `mob#${vnum}`;
    }

    /**
     * Match a keyword string against an item or mob's name (derived keywords).
     */
    function matchKeyword(entity, target) {
      const keywords = deriveKeywords(entity.name);
      return keywords.some(k => target.includes(k) || k.includes(target));
    }

    function findItemByKeyword(target) {
      // Check inventory first, then room
      const invItem = player.inventory.find(v => {
        const item = items[v];
        return item && matchKeyword(item, target);
      });
      if (invItem !== undefined) return invItem;

      const room = currentRoom();
      const groundItem = (room?.initial_items || []).find(v => {
        const item = items[v];
        return item && matchKeyword(item, target);
      });
      return groundItem !== undefined ? groundItem : null;
    }

    function findMobByKeyword(target) {
      const room = currentRoom();
      const roomMobs = getAliveMobsInRoom(room);
      const mob = roomMobs.find(v => {
        const m = mobs[v];
        return m && matchKeyword(m, target);
      });
      return mob !== undefined ? mob : null;
    }

    /**
     * Get alive (non-defeated) mobs in a room.
     */
    function getAliveMobsInRoom(room) {
      if (!room) return [];
      return (room.mobs || room.mob_spawns || []).filter(v => !isMobDefeated(v));
    }

    // Track taken items per room (keyed by vnum)
    const takenItems = {};

    function isItemTaken(room, itemVnum) {
      const key = `${room.vnum}_${itemVnum}`;
      return !!takenItems[key];
    }

    function markItemTaken(room, itemVnum) {
      const key = `${room.vnum}_${itemVnum}`;
      takenItems[key] = true;
    }

    // Track defeated mobs with timed respawn
    const MOB_RESPAWN_TIME = 60; // seconds until a defeated mob respawns
    const defeatedMobs = new Map(); // vnum -> defeatTime (seconds since engine start)
    let engineClock = 0; // running clock in seconds

    /** Check if a mob is currently defeated (not yet respawned). */
    function isMobDefeated(vnum) {
      if (!defeatedMobs.has(vnum)) return false;
      const elapsed = engineClock - defeatedMobs.get(vnum);
      if (elapsed >= MOB_RESPAWN_TIME) {
        defeatedMobs.delete(vnum); // respawned
        return false;
      }
      return true;
    }

    /** Mark a mob as defeated at the current engine clock time. */
    function markMobDefeated(vnum) {
      defeatedMobs.set(vnum, engineClock);
    }

    /**
     * Recalculate player attack/defense from equipped items.
     */
    function recalcStats() {
      let bonusAtk = 0;
      let bonusDef = 0;
      let bonusFocus = 0;
      for (const [slot, vnum] of Object.entries(player.equipped)) {
        if (vnum == null) continue;
        const item = items[vnum];
        if (!item) continue;
        // Offhand weapon contributes 60% of its attack bonus
        if (slot === 'offhand') {
          bonusAtk += Math.floor((item.stats?.attack || 0) * 0.6);
        } else {
          bonusAtk += item.stats?.attack || 0;
        }
        bonusDef += item.stats?.defense || 0;
        // Equipment can grant bonus max focus
        bonusFocus += item.stats?.focus_bonus || 0;
      }
      // Reset focus cost modifier from equipment (recalculated each time)
      let equipFocusMod = 0;
      for (const [slot, vnum] of Object.entries(player.equipped)) {
        if (vnum == null) continue;
        const item = items[vnum];
        if (!item) continue;
        equipFocusMod += item.stats?.focus_cost_modifier || 0;
      }
      player.focusCostModifier = equipFocusMod;
      // Add weapon proficiency attack bonus for equipped primary weapon
      if (window.MudWeaponProficiency) {
        if (player.equipped.weapon != null) {
          const wpnItem = items[player.equipped.weapon];
          if (wpnItem?.weapon_category) {
            bonusAtk += window.MudWeaponProficiency.getAttackBonus(player, wpnItem.weapon_category);
            // Advanced style attack bonus (stacks on top of base)
            if (window.MudWeaponTeachers) {
              bonusAtk += window.MudWeaponTeachers.getAttackBonus(player, wpnItem.weapon_category);
            }
          }
        } else {
          // Unarmed proficiency attack bonus when fighting bare-handed
          bonusAtk += window.MudWeaponProficiency.getAttackBonus(player, 'unarmed');
          if (window.MudWeaponTeachers) {
            bonusAtk += window.MudWeaponTeachers.getAttackBonus(player, 'unarmed');
          }
        }
      }
      // Apply stat-derived bonuses if MudStats is loaded
      const stats = player.coreStats;
      if (stats && window.MudStats) {
        const derived = window.MudStats.computeDerived(stats, player.power || 0);
        player.attackPower = 10 + bonusAtk;
        player.defense = 5 + bonusDef + (derived.bonusDefense || 0);
        player.maxHp = 100 + (derived.bonusMaxHp || 0);
        player.maxFocus = 50 + (derived.bonusMaxFocus || 0) + bonusFocus;
        // Store derived stats on player for combat tick access
        player._derived = derived;
      } else {
        player.attackPower = 10 + bonusAtk;
        player.defense = 5 + bonusDef;
      }

      // Apply advanced weapon style crit bonus to derived stats
      if (window.MudWeaponTeachers) {
        let styleCritBonus = 0;
        if (player.equipped.weapon != null) {
          const wpnItem = items[player.equipped.weapon];
          if (wpnItem?.weapon_category) {
            styleCritBonus = window.MudWeaponTeachers.getCritBonus(player, wpnItem.weapon_category);
          }
        } else {
          styleCritBonus = window.MudWeaponTeachers.getCritBonus(player, 'unarmed');
        }
        if (styleCritBonus > 0) {
          player._derived = player._derived || {};
          player._derived.critChance = (player._derived.critChance || 0.01) + styleCritBonus;
        }
      }

      // Apply racial percentage modifiers (from chargen raceMods)
      const rm = player.raceMods || {};
      if (rm.attack)  player.attackPower = Math.floor(player.attackPower * (1 + rm.attack));
      if (rm.defense) player.defense = Math.floor(player.defense * (1 + rm.defense));
      if (rm.hp)      player.maxHp = Math.floor(player.maxHp * (1 + rm.hp));
      if (rm.focus)   player.maxFocus = Math.floor(player.maxFocus * (1 + rm.focus));
      if (rm.dodge) {
        player._derived = player._derived || {};
        player._derived.dodgeChance = (player._derived.dodgeChance || 0) + rm.dodge;
      }

      // Apply death_weakness penalty to maxHp and maxFocus (-10% each)
      const dw = player.worldFlags?.death_weakness;
      if (dw) {
        if (dw.hpMod)    player.maxHp = Math.floor(player.maxHp * dw.hpMod);
        if (dw.focusMod) player.maxFocus = Math.floor(player.maxFocus * dw.focusMod);
      }
    }

    // ─── Public Interface ────────────────────────────────────────────────────

    /**
     * Return current game context for the UI to render quick-action buttons.
     * Separates hostile mobs from NPCs, and includes interactable keywords.
     */
    function getContext() {
      const room = currentRoom();
      const aliveMobs = getAliveMobsInRoom(room);
      const hostiles = aliveMobs.filter(v => {
        const mob = mobs[v];
        return mob && !mob.flags?.includes('npc');
      });
      const npcs = aliveMobs.filter(v => {
        const mob = mobs[v];
        return mob && mob.flags?.includes('npc');
      });
      const interactables = (room?.interactables || [])
        .filter(i => i.keyword && i.keyword.length > 0)
        .map(i => i.keyword[0]);

      return {
        roomName: room?.name || 'Unknown',
        exits: Object.keys(room?.exits || {}).filter(dir => {
          const ex = room.exits[dir];
          const target = typeof ex === 'object' ? ex.target_vnum : ex;
          return target != null && rooms[target];
        }),
        inCombat: !!combatState,
        combatTarget: combatState ? getMobName(combatState.mobVnum) : null,
        hp: player.hp,
        maxHp: player.maxHp,
        focus: player.focus,
        maxFocus: player.maxFocus,
        power: player.power,
        questPoints: player.questPoints,
        abilities: player.abilities,
        roomMobs: hostiles.map(getMobName),
        roomNpcs: npcs.map(getMobName),
        roomItems: (room?.initial_items || []).filter(v => !isItemTaken(room, v)).map(getItemName),
        roomInteractables: interactables
      };
    }

    function resume(savedState) {
      if (!savedState || !savedState.player) return;
      // Migrate old saves to current schema
      savedState = migrateSave(savedState);
      Object.assign(player, savedState.player);
      if (savedState.defeatedMobs) {
        // Support both old Set format (array of vnums) and new Map format (array of [vnum, remainingTime])
        if (Array.isArray(savedState.defeatedMobs)) {
          for (const entry of savedState.defeatedMobs) {
            if (Array.isArray(entry)) {
              // New format: [vnum, remainingSeconds]  -  schedule relative to current clock
              defeatedMobs.set(entry[0], engineClock - (MOB_RESPAWN_TIME - entry[1]));
            } else {
              // Old format: just a vnum  -  treat as freshly defeated
              defeatedMobs.set(entry, engineClock);
            }
          }
        }
      }
      if (savedState.takenItems) {
        Object.assign(takenItems, savedState.takenItems);
      }
      if (savedState.worldFlags) {
        Object.assign(player.worldFlags, savedState.worldFlags);
      }
      // Restore glimmered ability defs into the runtime cache
      if (player.glimmeredDefs && window.MudAbilities?.loadGlimmeredDefs) {
        window.MudAbilities.loadGlimmeredDefs(player.glimmeredDefs);
      }
      // Re-register purchased items so the engine recognises their vnums
      if (player.purchasedItems && window.MudMerchants?.restorePurchasedItems) {
        window.MudMerchants.restorePurchasedItems(player.purchasedItems, items);
      }
      recalcStats();
    }

    /** Current save schema version  -  increment when adding new fields. */
    const SAVE_VERSION = 4;

    function getSaveSlice() {
      return {
        _version: SAVE_VERSION,
        player: { ...player },
        // Save as [vnum, remainingSeconds] pairs for respawn persistence
        defeatedMobs: [...defeatedMobs.entries()]
          .filter(([v, t]) => engineClock - t < MOB_RESPAWN_TIME)
          .map(([v, t]) => [v, Math.max(0, MOB_RESPAWN_TIME - (engineClock - t))]),
        takenItems: { ...takenItems }
      };
    }

    /**
     * Migrate old save data to the current schema version.
     * Each version bump adds default values for new fields.
     */
    function migrateSave(savedState) {
      const v = savedState._version || 1;
      if (v < 2) {
        // v2 additions: meta_clues array, worldFlags defaults, focusCost support
        if (savedState.player) {
          if (!savedState.player.worldFlags) savedState.player.worldFlags = {};
          if (!savedState.player.worldFlags.meta_clues) savedState.player.worldFlags.meta_clues = [];
        }
      }
      if (v < 3) {
        // v3 additions: deaths counter, appearance fields
        if (savedState.player) {
          if (savedState.player.deaths === undefined) savedState.player.deaths = 0;
          if (!savedState.player.name) savedState.player.name = 'Traveler';
          if (!savedState.player.gender) savedState.player.gender = 'N';
          if (!savedState.player.hairColor) savedState.player.hairColor = 'Brown';
          if (!savedState.player.eyeColor) savedState.player.eyeColor = 'Brown';
          if (!savedState.player.bodyType) savedState.player.bodyType = 'Athletic';
          if (!savedState.player.description) savedState.player.description = 'A mysterious traveler from another place.';
        }
      }
      if (v < 4) {
        // v4 additions: raceMods for percentage-based racial bonuses
        if (savedState.player) {
          if (!savedState.player.raceMods) {
            // Look up race mods from chargen if available
            const raceId = savedState.player.race;
            const raceDef = window.MudChargen?.RACES?.find(r => r.id === raceId);
            savedState.player.raceMods = raceDef?.mods || {};
          }
        }
      }
      savedState._version = SAVE_VERSION;
      return savedState;
    }

    // ─── Expose internals for the command registry ─────────────────────────
    const _internals = {
      doGo, moveToRoom, doLook, doTake, doDrop, doInventory, doEquipment,
      doWear, doDualWield, doUnequip, doUse, doAttack, doFlee, doTalk,
      doCombine, doRotate, doQuest, doTrain, doAbilities,
      doStatus, doBuy, doRespec, doRecall, doSetRecall,
      doHelp, doWrite, doReadNotes, doShop,
      currentRoom, findItemByKeyword, findMobByKeyword,
      getAliveMobsInRoom, matchKeyword, getItemName, getMobName,
      initiateCombat, executeAbility, handleMobKill, pushCombatOutput,
      recalcStats, autoSave, recordGhost,
      /** Item data lookup  -  used by merchant/sell/inspect commands. */
      get items() { return items; },
      /** Room data lookup  -  used by merchant/say commands. */
      get rooms() { return rooms; },
      /** Mutable mob registry  -  allows injecting temporary mobs (e.g. echo invasions). */
      get mobs() { return mobs; },
      /** Direct reference to combatState for invasion checks. */
      get combatState() { return combatState; },
        get combatTick() { return combatTick; },
      /** Direct reference to player for invasion stat reads. */
      get player() { return player; },
      /** Charge state shared between engine and systems_integration. */
      get chargeState() { return chargeState; },
      set chargeState(v) { chargeState = v; },
      /** Pending system output queue (stat growth, etc.). */
      get pendingSystemOutput() { return pendingSystemOutput; },
      set pendingSystemOutput(v) { pendingSystemOutput = v; },
      /** Current zone weather state lookup. */
      get zoneWeather() { return zoneWeather; },
      doWeather
    };

    return {
      execute,
      update,
      getContext,
      getSaveSlice,
      resume,
      flushCombatOutput,
      _internals
    };
  }

  window.MudEngine = { create };
})();
