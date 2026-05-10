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
    say: 'say', talk: 'say', speak: 'say',
    help: 'help', '?': 'help', commands: 'help',
    write: 'write', note: 'write'
  };

  /**
   * Tokenize and normalize raw input into verb + target tokens.
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
          return [
            { type: 'info', text: `You unlock the door with your key.` },
            ...moveToRoom(exit.target_vnum)
          ];
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
      const groundItems = (room.initial_items || []).filter(vnum => !isItemTaken(room, vnum));
      if (groundItems.length > 0) {
        const names = groundItems.map(v => getItemName(v)).filter(Boolean);
        if (names.length > 0) {
          output.push({ type: 'items', text: `You see: ${names.join(', ')}` });
        }
      }

      // List mobs
      const roomMobs = (room.initial_mobs || []).filter(v => !isMobDefeated(v));
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
        // Look at the room
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
      const groundItems = room?.initial_items || [];
      const itemVnum = groundItems.find(v => {
        const item = items[v];
        return item && item.keywords.some(k => target.includes(k));
      });

      if (itemVnum === undefined) {
        return [{ type: 'error', text: `You don't see '${target}' here to take.` }];
      }

      // Mark item as taken from this room
      markItemTaken(room, itemVnum);
      player.inventory.push(itemVnum);
      return [{ type: 'success', text: `You take the ${getItemName(itemVnum)}.` }];
    }

    function doDrop(target) {
      if (!target) return [{ type: 'error', text: 'Drop what?' }];

      const idx = player.inventory.findIndex(v => {
        const item = items[v];
        return item && item.keywords.some(k => target.includes(k));
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
        return item && item.keywords.some(k => target.includes(k));
      });

      if (idx === -1) return [{ type: 'error', text: `You don't have '${target}'.` }];

      const vnum = player.inventory[idx];
      const item = items[vnum];
      if (!item || !item.wear_slot) {
        return [{ type: 'error', text: `You can't wear that.` }];
      }

      // Unequip current item in that slot
      const currentlyEquipped = player.equipped[item.wear_slot];
      if (currentlyEquipped != null) {
        player.inventory.push(currentlyEquipped);
      }

      player.inventory.splice(idx, 1);
      player.equipped[item.wear_slot] = vnum;
      return [{ type: 'success', text: `You equip the ${item.name}.` }];
    }

    function doUnequip(target) {
      if (!target) return [{ type: 'error', text: 'Remove what?' }];

      const entry = Object.entries(player.equipped).find(([, vnum]) => {
        if (vnum == null) return false;
        const item = items[vnum];
        return item && item.keywords.some(k => target.includes(k));
      });

      if (!entry) return [{ type: 'error', text: `You don't have '${target}' equipped.` }];

      if (player.inventory.length >= 99) {
        return [{ type: 'error', text: 'Inventory full. Drop something first.' }];
      }

      const [slot, vnum] = entry;
      player.equipped[slot] = null;
      player.inventory.push(vnum);
      return [{ type: 'success', text: `You remove the ${getItemName(vnum)}.` }];
    }

    function doUse(target) {
      if (!target) return [{ type: 'error', text: 'Use what?' }];

      const room = currentRoom();
      const interactable = (room?.interactables || []).find(i =>
        i.keyword.some(k => target.includes(k))
      );

      if (interactable && interactable.action) {
        return executePuzzleAction(interactable.action);
      }

      return [{ type: 'error', text: `You can't use '${target}' here.` }];
    }

    function doAttack(target) {
      if (combatState) {
        return [{ type: 'info', text: 'You are already in combat!' }];
      }

      const room = currentRoom();
      const roomMobs = (room?.initial_mobs || []).filter(v => !isMobDefeated(v));

      if (!target && roomMobs.length > 0) {
        return initiateCombat(roomMobs[0]);
      }

      const mobVnum = roomMobs.find(v => {
        const mob = mobs[v];
        return mob && mob.keywords.some(k => target.includes(k));
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
        { type: 'info', text: '  go <direction>  — Move (n/s/e/w/u/d or full name)' },
        { type: 'info', text: '  look [target]   — Examine room or object' },
        { type: 'info', text: '  take <item>     — Pick up an item' },
        { type: 'info', text: '  drop <item>     — Drop an item' },
        { type: 'info', text: '  inventory       — List carried items' },
        { type: 'info', text: '  equipment       — List worn gear' },
        { type: 'info', text: '  wear <item>     — Equip an item' },
        { type: 'info', text: '  remove <item>   — Unequip an item' },
        { type: 'info', text: '  use <object>    — Interact with something' },
        { type: 'info', text: '  attack [target] — Start combat' },
        { type: 'info', text: '  flee            — Attempt to escape combat' },
        { type: 'info', text: '  help            — Show this list' },
        { type: 'info', text: '─── Shortcuts ───' },
        { type: 'info', text: '  n/s/e/w/u/d     — Move in that direction' },
        { type: 'info', text: '  l               — Look around' },
        { type: 'info', text: '  i               — Inventory' },
        { type: 'info', text: '  eq              — Equipment' }
      ];
    }

    // ─── Combat ──────────────────────────────────────────────────────────────

    function initiateCombat(mobVnum) {
      const mob = mobs[mobVnum];
      if (!mob) return [{ type: 'error', text: 'Nothing to fight.' }];

      combatState = {
        mobVnum,
        mobHp: mob.stats.hp,
        mobMaxHp: mob.stats.hp
      };
      combatTimer = 0;

      return [{ type: 'combat', text: `─── COMBAT: ${mob.name} ───` }];
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
      const playerDmg = Math.max(1, player.attackPower - Math.floor(mob.stats.ac / 4));
      combatState.mobHp -= playerDmg;
      output.push({ type: 'combat', text: `You hit ${mob.name} for ${playerDmg} damage.` });

      // Check mob death
      if (combatState.mobHp <= 0) {
        output.push({ type: 'combat', text: `${mob.name} has been defeated!` });
        markMobDefeated(combatState.mobVnum);

        // Loot
        if (mob.loot_table) {
          for (const loot of mob.loot_table) {
            if (Math.random() <= loot.chance && player.inventory.length < 99) {
              player.inventory.push(loot.item_vnum);
              output.push({ type: 'success', text: `You loot: ${getItemName(loot.item_vnum)}` });
            }
          }
        }

        combatState = null;
        combatTimer = 0;
        pushCombatOutput(output);
        return;
      }

      // Mob attacks player
      const mobDmg = Math.max(1,
        Math.floor(Math.random() * (mob.stats.damage_max - mob.stats.damage_min + 1)) +
        mob.stats.damage_min - Math.floor(player.defense / 2)
      );
      player.hp -= mobDmg;
      output.push({ type: 'combat', text: `${mob.name} hits you for ${mobDmg} damage. [HP: ${player.hp}/${player.maxHp}]` });

      // Check player death
      if (player.hp <= 0) {
        output.push({ type: 'combat', text: 'You have been defeated...' });
        output.push({ type: 'info', text: 'You awaken back at the Nexus.' });
        player.hp = player.maxHp;
        combatState = null;
        combatTimer = 0;
        // Respawn at hub (vnum 0)
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

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function getItemName(vnum) {
      return items[vnum]?.name || `item#${vnum}`;
    }

    function getMobName(vnum) {
      return mobs[vnum]?.name || `mob#${vnum}`;
    }

    function findItemByKeyword(target) {
      // Check inventory first, then room
      const invItem = player.inventory.find(v => {
        const item = items[v];
        return item && item.keywords.some(k => target.includes(k));
      });
      if (invItem !== undefined) return invItem;

      const room = currentRoom();
      const groundItem = (room?.initial_items || []).find(v => {
        const item = items[v];
        return item && item.keywords.some(k => target.includes(k));
      });
      return groundItem !== undefined ? groundItem : null;
    }

    function findMobByKeyword(target) {
      const room = currentRoom();
      const mob = (room?.initial_mobs || []).find(v => {
        const m = mobs[v];
        return m && m.keywords.some(k => target.includes(k));
      });
      return mob !== undefined ? mob : null;
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

    // Puzzle actions (stub — will be expanded per zone)
    function executePuzzleAction(actionId) {
      return [{ type: 'info', text: `[Puzzle interaction: ${actionId}]` }];
    }

    // ─── Public Interface ────────────────────────────────────────────────────

    function getContext() {
      const room = currentRoom();
      return {
        roomName: room?.name || 'Unknown',
        exits: Object.keys(room?.exits || {}),
        inCombat: !!combatState,
        combatTarget: combatState ? getMobName(combatState.mobVnum) : null,
        hp: player.hp,
        maxHp: player.maxHp,
        roomMobs: (room?.initial_mobs || []).filter(v => !isMobDefeated(v)).map(getMobName),
        roomItems: (room?.initial_items || []).filter(v => !isItemTaken(room, v)).map(getItemName)
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
