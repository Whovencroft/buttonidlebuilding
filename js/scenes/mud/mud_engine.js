/**
 * mud_engine.js — MUD Engine Core
 *
 * Manages the room graph, parser, player state, combat loop, and command execution.
 * Exposes a simple interface: create(), execute(input), update(dt), getSaveSlice().
 */
(() => {
  // ─── Parser ────────────────────────────────────────────────────────────────

  const STOP_WORDS = new Set(['the', 'a', 'an', 'to', 'at', 'in', 'on', 'with', 'from', 'is', 'it']);

  const DIRECTION_ALIASES = {
    n: 'north', s: 'south', e: 'east', w: 'west',
    u: 'up', d: 'down',
    north: 'north', south: 'south', east: 'east', west: 'west',
    up: 'up', down: 'down',
    ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
    northeast: 'northeast', northwest: 'northwest', southeast: 'southeast', southwest: 'southwest'
  };

  const VERB_ALIASES = {
    go: 'go', walk: 'go', move: 'go', head: 'go',
    look: 'look', l: 'look', examine: 'look', x: 'look', read: 'look',
    take: 'take', get: 'take', grab: 'take', pick: 'take',
    drop: 'drop', leave: 'drop', discard: 'drop',
    inventory: 'inventory', i: 'inventory', inv: 'inventory', bag: 'inventory',
    equipment: 'equipment', eq: 'equipment', worn: 'equipment',
    wear: 'wear', equip: 'wear', wield: 'wear',
    remove: 'unequip', unequip: 'unequip', takeoff: 'unequip',
    use: 'use', activate: 'use', pull: 'use', push: 'use',
    attack: 'attack', kill: 'attack', hit: 'attack', fight: 'attack',
    flee: 'flee', run: 'flee', escape: 'flee',
    say: 'say', speak: 'say',
    talk: 'talk', ask: 'talk', chat: 'talk',
    help: 'help', '?': 'help', commands: 'help',
    write: 'write', note: 'write',
    combine: 'combine', merge: 'combine', craft: 'combine',
    rotate: 'rotate', turn: 'rotate', spin: 'rotate'
  };

  /**
   * Tokenize and normalize raw input into verb + target tokens.
   * Preserves multi-word targets for item/puzzle matching.
   */
  function parse(input) {
    const cleaned = input.toLowerCase().replace(/[.,!?;:'"]/g, '').trim();
    const tokens = cleaned.split(/\s+/).filter(t => !STOP_WORDS.has(t));

    if (tokens.length === 0) return { verb: null, target: '' };

    const firstToken = tokens[0];

    // Check if the entire input is a direction (shortcut for movement)
    if (DIRECTION_ALIASES[firstToken] && tokens.length === 1) {
      return { verb: 'go', target: DIRECTION_ALIASES[firstToken] };
    }

    const verb = VERB_ALIASES[firstToken] || null;
    const targetTokens = tokens.slice(1);

    // If verb is 'go', resolve the direction from the target
    if (verb === 'go' && targetTokens.length > 0) {
      const dir = DIRECTION_ALIASES[targetTokens[0]];
      if (dir) return { verb: 'go', target: dir };
    }

    return { verb, target: targetTokens.join(' ') };
  }

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

    const COMBAT_TICK_INTERVAL = 2.5; // seconds per auto-attack round

    // Load world data from global (set by data loader script)
    if (window.MudData) {
      rooms = window.MudData.rooms || {};
      mobs = window.MudData.mobs || {};
      items = window.MudData.items || {};
    }

    // Restore from save if available
    if (savedState && savedState.player) {
      player = { ...createDefaultPlayer(), ...savedState.player };
    }

    function createDefaultPlayer() {
      return {
        currentRoom: 0,
        hp: 100,
        maxHp: 100,
        attackPower: 10,
        defense: 5,
        inventory: [],
        equipped: {},
        gold: 0,
        visitedRooms: [],
        worldFlags: {},
        baseClass: null,
        specialization: null,
        abilities: [],
        genreEchoes: {}
      };
    }

    /**
     * Get the current room object.
     */
    function currentRoom() {
      return rooms[player.currentRoom] || null;
    }

    /**
     * Execute a parsed command and return output lines.
     */
    function execute(input) {
      const { verb, target } = parse(input);

      if (!verb) {
        return [{ type: 'error', text: "I don't understand that. Type 'help' for commands." }];
      }

      switch (verb) {
        case 'go': return doGo(target);
        case 'look': return doLook(target);
        case 'take': return doTake(target);
        case 'drop': return doDrop(target);
        case 'inventory': return doInventory();
        case 'equipment': return doEquipment();
        case 'wear': return doWear(target);
        case 'unequip': return doUnequip(target);
        case 'use': return doUse(target);
        case 'attack': return doAttack(target);
        case 'flee': return doFlee();
        case 'talk': return doTalk(target);
        case 'combine': return doCombine(target);
        case 'rotate': return doRotate(target);
        case 'help': return doHelp();
        case 'say': return [{ type: 'info', text: `You say: "${target}"` }];
        case 'write': return [{ type: 'info', text: '[Notes system requires server connection]' }];
        default:
          return [{ type: 'error', text: `Unknown command: '${verb}'. Type 'help' for a list.` }];
      }
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
      if (!exit) {
        return [{ type: 'error', text: `There is no exit to the ${direction}.` }];
      }

      // Check for locked doors
      if (exit.door && exit.door.state === 'locked') {
        const keyVnum = exit.door.key_vnum;
        if (keyVnum && player.inventory.includes(keyVnum)) {
          // Unlock permanently via world flag
          player.worldFlags[`door_${room.vnum}_${direction}`] = 'unlocked';
          return [
            { type: 'success', text: `You unlock the door with your key.` },
            ...moveToRoom(exit.target_vnum)
          ];
        }
        // Check if already unlocked via world flag
        if (player.worldFlags[`door_${room.vnum}_${direction}`] === 'unlocked') {
          return moveToRoom(exit.target_vnum);
        }
        return [{ type: 'error', text: 'The way is locked.' }];
      }

      return moveToRoom(exit.target_vnum);
    }

    function moveToRoom(vnum) {
      player.currentRoom = vnum;
      if (!player.visitedRooms.includes(vnum)) {
        player.visitedRooms.push(vnum);
      }

      const room = currentRoom();
      if (!room) return [{ type: 'error', text: 'You step into the void...' }];

      const output = [];
      output.push({ type: 'room-name', text: room.name });
      output.push({ type: 'room-desc', text: room.description });

      // List exits
      const exits = Object.keys(room.exits || {});
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

      // List mobs
      const roomMobs = getAliveMobsInRoom(room);
      if (roomMobs.length > 0) {
        const names = roomMobs.map(v => getMobName(v)).filter(Boolean);
        if (names.length > 0) {
          output.push({ type: 'mobs', text: `Present: ${names.join(', ')}` });
        }
      }

      // Check for aggressive mobs
      const aggressive = roomMobs.find(v => {
        const mob = mobs[v];
        return mob && mob.flags && mob.flags.includes('aggressive');
      });
      if (aggressive) {
        output.push(...initiateCombat(aggressive));
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
        return [{ type: 'info', text: interactable.description }];
      }

      // Look at an item in the room or inventory
      const itemVnum = findItemByKeyword(target);
      if (itemVnum !== null) {
        const item = items[itemVnum];
        if (item) return [{ type: 'info', text: item.description }];
      }

      // Look at a mob
      const mobVnum = findMobByKeyword(target);
      if (mobVnum !== null) {
        const mob = mobs[mobVnum];
        if (mob) return [{ type: 'info', text: mob.description }];
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
      const slot = item?.stats?.slot || (item?.type === 'weapon' ? 'weapon' : null);
      if (!slot) {
        return [{ type: 'error', text: `You can't wear that.` }];
      }

      // Unequip current item in that slot
      const currentlyEquipped = player.equipped[slot];
      if (currentlyEquipped != null) {
        player.inventory.push(currentlyEquipped);
      }

      player.inventory.splice(idx, 1);
      player.equipped[slot] = vnum;

      // Recalculate stats
      recalcStats();
      return [{ type: 'success', text: `You equip the ${item.name}.` }];
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
      player.inventory.push(result.vnum);

      return [{ type: 'success', text: `You combine them into: ${getItemName(result.vnum)}` }];
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
        output.push({ type: 'room-desc', text: 'The four statues lock into position with a thunderous CLICK. The throne shudders and slides backward, revealing a perfectly smooth, circular tunnel leading downward. A faint rolling sound echoes from the darkness below — something was here moments ago. The tunnel is too small for you to follow.' });
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

      // 50% chance to flee
      if (Math.random() < 0.5) {
        const room = currentRoom();
        const exits = Object.keys(room?.exits || {});
        if (exits.length > 0) {
          const dir = exits[Math.floor(Math.random() * exits.length)];
          combatState = null;
          combatTimer = 0;
          const exit = room.exits[dir];
          return [
            { type: 'combat', text: `You flee to the ${dir}!` },
            ...moveToRoom(exit.target_vnum)
          ];
        }
      }

      return [{ type: 'combat', text: 'You fail to escape!' }];
    }

    function doHelp() {
      return [
        { type: 'info', text: '─── Available Commands ───' },
        { type: 'info', text: '  go <direction>       — Move (n/s/e/w/u/d)' },
        { type: 'info', text: '  look [target]        — Examine room or object' },
        { type: 'info', text: '  take <item>          — Pick up an item' },
        { type: 'info', text: '  drop <item>          — Drop an item' },
        { type: 'info', text: '  inventory            — List carried items' },
        { type: 'info', text: '  equipment            — List worn gear' },
        { type: 'info', text: '  wear <item>          — Equip an item' },
        { type: 'info', text: '  remove <item>        — Unequip an item' },
        { type: 'info', text: '  use <object>         — Interact with something' },
        { type: 'info', text: '  combine <a> <b>      — Combine two items' },
        { type: 'info', text: '  rotate <obj> <dir>   — Rotate a puzzle object' },
        { type: 'info', text: '  talk <npc>           — Speak to an NPC' },
        { type: 'info', text: '  attack [target]      — Start combat' },
        { type: 'info', text: '  flee                 — Attempt to escape combat' },
        { type: 'info', text: '  help                 — Show this list' },
        { type: 'info', text: '─── Shortcuts ───' },
        { type: 'info', text: '  n/s/e/w/u/d          — Move in that direction' },
        { type: 'info', text: '  l                    — Look around' },
        { type: 'info', text: '  i                    — Inventory' },
        { type: 'info', text: '  eq                   — Equipment' }
      ];
    }

    // ─── Combat ──────────────────────────────────────────────────────────────

    function initiateCombat(mobVnum) {
      const mob = mobs[mobVnum];
      if (!mob) return [{ type: 'error', text: 'Nothing to fight.' }];

      combatState = {
        mobVnum,
        mobHp: mob.stats.hp,
        mobMaxHp: mob.stats.max_hp || mob.stats.hp
      };
      combatTimer = 0;

      return [{ type: 'combat', text: `─── COMBAT: ${mob.name} [HP: ${combatState.mobHp}/${combatState.mobMaxHp}] ───` }];
    }

    /**
     * Called each frame. Handles combat auto-attack ticks.
     */
    function update(dt) {
      if (!combatState) return;

      combatTimer += dt / 1000; // dt is in ms
      if (combatTimer < COMBAT_TICK_INTERVAL) return;
      combatTimer -= COMBAT_TICK_INTERVAL;

      const mob = mobs[combatState.mobVnum];
      if (!mob) { combatState = null; return; }

      const output = [];

      // Player attacks mob
      const playerDmg = Math.max(1, player.attackPower - Math.floor((mob.stats.defense || 0) / 2));
      combatState.mobHp -= playerDmg;
      output.push({ type: 'combat', text: `You hit ${mob.name} for ${playerDmg} damage. [Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });

      // Check mob death
      if (combatState.mobHp <= 0) {
        output.push({ type: 'combat', text: `${mob.name} has been defeated!` });
        markMobDefeated(combatState.mobVnum);

        // Loot
        if (mob.loot_table && mob.loot_table.length > 0) {
          for (const lootVnum of mob.loot_table) {
            if (player.inventory.length < 99) {
              player.inventory.push(lootVnum);
              output.push({ type: 'success', text: `You loot: ${getItemName(lootVnum)}` });
            }
          }
        }

        combatState = null;
        combatTimer = 0;
        pushCombatOutput(output);
        return;
      }

      // Mob attacks player
      const mobAtk = mob.stats.attack || 10;
      const mobDmg = Math.max(1, mobAtk - Math.floor(player.defense / 2));
      player.hp -= mobDmg;
      output.push({ type: 'combat', text: `${mob.name} hits you for ${mobDmg} damage. [HP: ${player.hp}/${player.maxHp}]` });

      // Check player death
      if (player.hp <= 0) {
        output.push({ type: 'combat', text: 'You have been defeated...' });
        output.push({ type: 'info', text: 'You awaken back at the Nexus.' });
        player.hp = player.maxHp;
        combatState = null;
        combatTimer = 0;
        player.currentRoom = 0;
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
        default:
          return [{ type: 'info', text: `[Puzzle interaction: ${actionId}]` }];
      }
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
     * Check if two item vnums form a known crafting recipe.
     * Returns { vnum } of the result item, or null.
     */
    function checkCombineRecipe(vnum1, vnum2) {
      // Recipes are order-independent
      const pair = [vnum1, vnum2].sort((a, b) => a - b);
      const key = `${pair[0]}_${pair[1]}`;

      const RECIPES = {
        // Severed Cyber-Eye (2001) + Power Cell (2002) = Charged Cyber-Eye (2006)
        '2001_2002': { vnum: 2006 }
      };

      return RECIPES[key] || null;
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
     */
    function useConsumable(vnum) {
      const item = items[vnum];
      if (!item) return [{ type: 'error', text: 'Nothing happens.' }];

      const output = [];
      const healAmount = item.stats?.heal || 20;
      player.hp = Math.min(player.maxHp, player.hp + healAmount);

      // Remove from inventory
      const idx = player.inventory.indexOf(vnum);
      if (idx !== -1) player.inventory.splice(idx, 1);

      output.push({ type: 'success', text: `You use the ${item.name}. [HP: ${player.hp}/${player.maxHp}]` });
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
      return (room.initial_mobs || []).filter(v => !isMobDefeated(v));
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

    // Track defeated mobs
    const defeatedMobs = new Set();

    function isMobDefeated(vnum) {
      return defeatedMobs.has(vnum);
    }

    function markMobDefeated(vnum) {
      defeatedMobs.add(vnum);
    }

    /**
     * Recalculate player attack/defense from equipped items.
     */
    function recalcStats() {
      let bonusAtk = 0;
      let bonusDef = 0;
      for (const vnum of Object.values(player.equipped)) {
        if (vnum == null) continue;
        const item = items[vnum];
        if (!item) continue;
        bonusAtk += item.stats?.attack || 0;
        bonusDef += item.stats?.defense || 0;
      }
      player.attackPower = 10 + bonusAtk;
      player.defense = 5 + bonusDef;
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
        const mob = data.mobs[v];
        return mob && !mob.flags?.includes('npc');
      });
      const npcs = aliveMobs.filter(v => {
        const mob = data.mobs[v];
        return mob && mob.flags?.includes('npc');
      });
      const interactables = (room?.interactables || [])
        .filter(i => i.keyword && i.keyword.length > 0)
        .map(i => i.keyword[0]);

      return {
        roomName: room?.name || 'Unknown',
        exits: Object.keys(room?.exits || {}),
        inCombat: !!combatState,
        combatTarget: combatState ? getMobName(combatState.mobVnum) : null,
        hp: player.hp,
        maxHp: player.maxHp,
        roomMobs: hostiles.map(getMobName),
        roomNpcs: npcs.map(getMobName),
        roomItems: (room?.initial_items || []).filter(v => !isItemTaken(room, v)).map(getItemName),
        roomInteractables: interactables
      };
    }

    function resume(savedState) {
      if (!savedState || !savedState.player) return;
      Object.assign(player, savedState.player);
      if (savedState.defeatedMobs) {
        savedState.defeatedMobs.forEach(v => defeatedMobs.add(v));
      }
      if (savedState.takenItems) {
        Object.assign(takenItems, savedState.takenItems);
      }
      if (savedState.worldFlags) {
        Object.assign(player.worldFlags, savedState.worldFlags);
      }
      recalcStats();
    }

    function getSaveSlice() {
      return {
        player: { ...player },
        defeatedMobs: [...defeatedMobs],
        takenItems: { ...takenItems }
      };
    }

    return {
      execute,
      update,
      getContext,
      getSaveSlice,
      resume,
      flushCombatOutput
    };
  }

  window.MudEngine = { create };
})();
