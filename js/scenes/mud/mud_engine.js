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
    quest: 'quest', quests: 'quest', journal: 'quest', log: 'quest',
    write: 'write', note: 'write', notes: 'readnotes',
    shop: 'shop', market: 'shop', marketplace: 'shop',
    combine: 'combine', merge: 'combine', craft: 'combine',
    rotate: 'rotate', turn: 'rotate', spin: 'rotate',
    train: 'train', learn: 'train',
    abilities: 'abilities', skills: 'abilities', spells: 'abilities',
    status: 'status', stats: 'status', power: 'status', score: 'status',
    buy: 'buy', purchase: 'buy',
    respec: 'respec'
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

    let quests = {};

    // Load world data from global (set by data loader script)
    if (window.MudData) {
      rooms = window.MudData.rooms || {};
      mobs = window.MudData.mobs || {};
      items = window.MudData.items || {};
      quests = window.MudData.quests || {};
    }

    // Restore from save if available
    if (savedState && savedState.player) {
      player = { ...createDefaultPlayer(), ...savedState.player };
    }

    function createDefaultPlayer() {
      return {
        currentRoom: 1,
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
        focusCostModifier: 0
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

      // If no recognized verb, check if the full input matches an ability name
      if (!verb) {
        const abilityResult = tryUseAbilityByName(input.trim().toLowerCase());
        if (abilityResult) return abilityResult;
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
        case 'quest': return doQuest(target);
        case 'train': return doTrain(target);
        case 'abilities': return doAbilities();
        case 'status': return doStatus();
        case 'buy': return doBuy(target);
        case 'respec': return doRespec(target);
        case 'help': return doHelp();
        case 'say': return [{ type: 'info', text: `You say: "${target}"` }];
        case 'write': return doWrite(target);
        case 'readnotes': return doReadNotes();
        case 'shop': return doShop(target);
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

      // Record ghost and auto-save on room change
      recordGhost('move', String(vnum));
      autoSave();

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
          output.push({ type: 'quest', text: `  "${q.name}" — ${q.description}` });
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
        { type: 'info', text: '  <ability name>       — Use an ability in combat' },
        { type: 'info', text: '  abilities            — List your abilities' },
        { type: 'info', text: '  status               — View power, QP, and stats' },
        { type: 'info', text: '  train                — See purchasable abilities (Training Hall)' },
        { type: 'info', text: '  buy <name>           — Purchase an ability with QP' },
        { type: 'info', text: '  respec               — Change specialization (30 QP)' },
        { type: 'info', text: '  quest [name]         — View quest log or accept/complete' },
        { type: 'info', text: '  write <message>      — Leave a note in this room' },
        { type: 'info', text: '  notes                — Read notes left by other players' },
        { type: 'info', text: '  shop                 — Browse the marketplace' },
        { type: 'info', text: '  help                 — Show this list' },
        { type: 'info', text: '─── Shortcuts ───' },
        { type: 'info', text: '  n/s/e/w/u/d          — Move in that direction' },
        { type: 'info', text: '  l                    — Look around' },
        { type: 'info', text: '  i                    — Inventory' },
        { type: 'info', text: '  eq                   — Equipment' }
      ];
    }

    // ─── Server-Backed Commands ──────────────────────────────────────────────

    /** Auto-save interval tracker (saves every 60 seconds of play). */
    let autoSaveTimer = 0;
    const AUTO_SAVE_INTERVAL = 60;

    /**
     * Write a note in the current room (max 280 chars).
     * Async — returns a pending message, then posts to server.
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

      // Fire and forget — post to server
      window.MudAPI.postNote(room.vnum, target).catch(err => {
        combatOutput.push({ type: 'error', text: `Note failed: ${err.message}` });
      });

      return [{ type: 'success', text: `You scratch a note into the wall: "${target}"` }];
    }

    /**
     * Read notes left by other players in the current room.
     * Async — returns a pending message, then fetches from server.
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
     * Async — fetches stock from server.
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
            combatOutput.push({ type: 'info', text: `  [${s.id}] ${name} — ${s.price} gold (qty: ${s.quantity})` });
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
     * Calculate creature power from its stats (hp + attack*3 + defense*2).
     * Used for the power-gain formula.
     */
    function getCreaturePower(mob) {
      if (!mob || !mob.stats) return 10;
      return (mob.stats.hp || 0) + (mob.stats.attack || 0) * 3 + (mob.stats.defense || 0) * 2;
    }

    /**
     * Calculate power gained from a fight.
     * - Kill: 10% of creature power (base), modified by relative strength
     * - Death: 2% of creature power
     * - If creature is 10%+ weaker than you: only 2%
     * - If creature is 10%+ stronger: +1% per 5% beyond the 10% threshold
     */
    function calcPowerGain(creaturePower, playerPower, killed) {
      if (!killed) return Math.max(1, Math.floor(creaturePower * 0.02));

      const ratio = playerPower > 0 ? (creaturePower / playerPower) : 2;
      const threshold = 0.10;

      // Creature is 10%+ weaker → only 2%
      if (ratio < (1 - threshold)) {
        return Math.max(1, Math.floor(creaturePower * 0.02));
      }

      // Creature is within ±10% → standard 10%
      if (ratio <= (1 + threshold)) {
        return Math.max(1, Math.floor(creaturePower * 0.10));
      }

      // Creature is 10%+ stronger → 10% + 1% per 5% beyond threshold
      const excessPercent = (ratio - (1 + threshold)) * 100; // e.g. 40 for 50% stronger
      const bonusPercent = Math.floor(excessPercent / 5);
      const totalPercent = 10 + bonusPercent;
      return Math.max(1, Math.floor(creaturePower * totalPercent / 100));
    }

    /**
     * Show player status: power, QP, spec, focus.
     */
    function doStatus() {
      const spec = window.MudAbilities?.getSpec(player.baseClass, player.specialization);
      const tiers = window.MudAbilities?.POWER_TIERS || [10, 25, 50, 100];
      const currentTier = tiers.filter(t => player.power >= t).length;
      const nextTier = tiers[currentTier] || 'MAX';

      return [
        { type: 'info', text: '─── Status ───' },
        { type: 'info', text: `  Path:         ${spec?.name || player.specName || 'None'}` },
        { type: 'info', text: `  Power:        ${player.power}${nextTier !== 'MAX' ? ` (next tier at ${nextTier})` : ' (MAX TIER)'}` },
        { type: 'info', text: `  Quest Points: ${player.questPoints}` },
        { type: 'info', text: `  Focus:        ${player.focus}/${player.maxFocus}` },
        { type: 'info', text: `  HP:           ${player.hp}/${player.maxHp}` },
        { type: 'info', text: `  Attack:       ${player.attackPower}` },
        { type: 'info', text: `  Defense:      ${player.defense}` },
        { type: 'info', text: `  Gold:         ${player.gold}` }
      ];
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
        if (!def) continue;
        const cd = player.abilityCooldowns[abilityId] || 0;
        const cdText = cd > 0 ? ` [CD: ${cd} rounds]` : ' [READY]';
        output.push({ type: 'info', text: `  ${def.name} — ${def.desc}${cdText}` });
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
            { type: 'info', text: `  Your power: ${player.power}. Next tier unlocks more abilities.` }
          ];
        }
        const output = [
          { type: 'info', text: 'Instructor Vex nods. "I can teach you these:"' },
          { type: 'info', text: '' }
        ];
        purchasable.forEach((a, i) => {
          const cost = window.MudAbilities?.getAbilityCost(a.tier) || 5;
          output.push({ type: 'items', text: `  ${i + 1}. ${a.name} — ${a.desc}` });
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

      // Calculate focus cost (tier-based + modifier)
      const tierCosts = [5, 10, 15, 20];
      const baseCost = tierCosts[def.tier || 0] || 5;
      const cost = Math.max(0, baseCost + (player.focusCostModifier || 0));

      if (player.focus < cost) {
        return [{ type: 'error', text: `Not enough focus. Need ${cost}, have ${player.focus}.` }];
      }

      // Spend focus and set cooldown
      player.focus -= cost;
      player.abilityCooldowns[abilityId] = def.cooldown || 3;

      const mob = mobs[combatState.mobVnum];
      const output = [];

      // Apply ability effects based on type
      switch (def.type || 'attack') {
        case 'attack': {
          const mult = def.multiplier || 1.5;
          let dmg = Math.max(1, Math.floor(player.attackPower * mult));
          if (!def.ignoresDef) {
            dmg = Math.max(1, dmg - Math.floor((mob?.stats?.defense || 0) / 2));
          }
          combatState.mobHp -= dmg;
          output.push({ type: 'combat', text: `You use ${def.name}! ${dmg} damage! [Mob HP: ${Math.max(0, combatState.mobHp)}/${combatState.mobMaxHp}]` });

          if (def.healPercent) {
            const heal = Math.floor(player.maxHp * def.healPercent);
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
          const heal = Math.floor(player.maxHp * (def.healPercent || 0.3));
          player.hp = Math.min(player.maxHp, player.hp + heal);
          output.push({ type: 'success', text: `You use ${def.name}. Restored ${heal} HP. [HP: ${player.hp}/${player.maxHp}]` });
          break;
        }
        case 'buff': {
          player.worldFlags[`buff_${abilityId}`] = def.duration || 2;
          output.push({ type: 'success', text: `You use ${def.name}. Active for ${def.duration || 2} rounds.` });
          break;
        }
        case 'debuff': {
          player.worldFlags[`debuff_${abilityId}`] = def.duration || 2;
          output.push({ type: 'success', text: `You use ${def.name}. Enemy weakened for ${def.duration || 2} rounds.` });
          break;
        }
        default:
          output.push({ type: 'info', text: `You use ${def.name}.` });
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
      output.push({ type: 'combat', text: `${mob.name} has been defeated!` });
      markMobDefeated(combatState.mobVnum);
      player.killCounts[combatState.mobVnum] = (player.killCounts[combatState.mobVnum] || 0) + 1;

      // Award power based on relative strength
      const creaturePower = getCreaturePower(mob);
      const gained = calcPowerGain(creaturePower, player.power, true);
      player.power += gained;
      output.push({ type: 'success', text: `+${gained} power (total: ${player.power})` });

      // Restore focus on kill
      player.focus = Math.min(player.maxFocus, player.focus + 5);

      // Loot
      const lootList = mob.loot_table || mob.loot;
      if (lootList && lootList.length > 0) {
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
      // Auto-save timer (runs even outside combat)
      autoSaveTimer += dt / 1000;
      if (autoSaveTimer >= AUTO_SAVE_INTERVAL) {
        autoSaveTimer = 0;
        autoSave();
      }

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
        output.push(...handleMobKill(mob));
        pushCombatOutput(output);
        return;
      }

      // Tick down ability cooldowns each combat round
      for (const key of Object.keys(player.abilityCooldowns)) {
        player.abilityCooldowns[key] = Math.max(0, player.abilityCooldowns[key] - 1);
      }

      // Mob attacks player
      const mobAtk = mob.stats.attack || 10;
      const mobDmg = Math.max(1, mobAtk - Math.floor(player.defense / 2));
      player.hp -= mobDmg;
      output.push({ type: 'combat', text: `${mob.name} hits you for ${mobDmg} damage. [HP: ${player.hp}/${player.maxHp}]` });

      // Check player death
      if (player.hp <= 0) {
        output.push({ type: 'combat', text: 'You have been defeated...' });
        // Award small power on death (2% of creature power)
        const deathPower = calcPowerGain(getCreaturePower(mob), player.power, false);
        player.power += deathPower;
        output.push({ type: 'info', text: `+${deathPower} power from the struggle. (total: ${player.power})` });
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
        case 'use_safe':
          return puzzleUseSafeZ3();
        case 'use_console':
          return puzzleUseConsoleZ4();
        case 'use_flame':
          return puzzleUseFlameZ5();
        case 'use_gem':
          return puzzleUseGemZ6();
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
      return (room.mobs || []).filter(v => !isMobDefeated(v));
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
        exits: Object.keys(room?.exits || {}),
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
