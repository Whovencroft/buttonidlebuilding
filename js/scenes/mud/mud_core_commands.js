/**
 * mud_core_commands.js — Core Command Registration
 *
 * Registers all original engine commands (go, look, take, etc.) with the
 * unified MudCommands registry. Each command wraps the engine's internal
 * do* functions, which are exposed via engine._internals.
 *
 * This file is loaded AFTER mud_commands.js, mud_parser.js, and mud_engine.js.
 * It hooks into the engine creation via a factory wrapper.
 *
 * Categories:
 *   Movement    — go, recall, setrecall
 *   Interaction — look, take, drop, use, combine, rotate, talk, say
 *   Inventory   — inventory, equipment, wear, unequip
 *   Combat      — attack, flee
 *   Progression — train, buy, respec, abilities, status, quest
 *   Social      — write, notes, shop
 *   System      — help
 */
(() => {
  'use strict';

  // Store the original create function (may already be wrapped by integration)
  const previousCreate = window.MudEngine.create;

  /**
   * Wrap engine creation to register core commands after engine is built.
   * This ensures _internals is available for command handlers.
   */
  window.MudEngine.create = function(opts) {
    const engine = previousCreate(opts);
    const fn = engine._internals;

    // Only register once (guard against double-wrapping)
    if (window.MudCommands.get('go')) return engine;

    // ─── Movement ───────────────────────────────────────────────────────
    window.MudCommands.registerAll([
      {
        name: 'go',
        aliases: ['walk', 'move', 'head'],
        category: 'Movement',
        help: 'Move in a direction',
        usage: 'go <direction>',
        handler: (parsed) => fn.doGo(parsed.direction || parsed.target)
      },
      {
        name: 'recall',
        aliases: ['warp', 'home'],
        category: 'Movement',
        help: 'Warp to your save point',
        usage: 'recall',
        requires: { noCombat: true },
        handler: () => fn.doRecall()
      },
      {
        name: 'setrecall',
        aliases: ['bind', 'sethome'],
        category: 'Movement',
        help: 'Set current room as save point',
        usage: 'setrecall',
        handler: () => fn.doSetRecall()
      },
      {
        name: 'enter',
        aliases: ['goto', 'visit'],
        category: 'Movement',
        help: 'Enter a named location (e.g. enter training hall)',
        usage: 'enter <place>',
        requires: { noCombat: true },
        handler: (parsed) => {
          const target = (parsed.target || '').toLowerCase().trim();
          if (!target) return [{ type: 'error', text: 'Enter where? Specify a place name.' }];
          const room = engine._internals.rooms[engine._internals.player.currentRoom];
          if (!room) return [{ type: 'error', text: 'You are nowhere.' }];
          // Check named_exits on the current room
          const named = room.named_exits || {};
          const match = named[target];
          if (match != null) return fn.moveToRoom(match);
          // Fuzzy: check if target is a substring of any named_exit key
          for (const [key, vnum] of Object.entries(named)) {
            if (key.includes(target) || target.includes(key)) {
              return fn.moveToRoom(vnum);
            }
          }
          // Also check exit room names for a match
          for (const [dir, exit] of Object.entries(room.exits || {})) {
            const exitVnum = typeof exit === 'object' ? exit.target_vnum : exit;
            const exitRoom = engine._internals.rooms[exitVnum];
            if (exitRoom) {
              const exitName = (exitRoom.name || '').toLowerCase();
              if (exitName.includes(target) || target.includes(exitName.split('\u2014')[0].trim())) {
                return fn.moveToRoom(exitVnum);
              }
            }
          }
          return [{ type: 'error', text: `There is no '${target}' to enter from here.` }];
        }
      }
    ]);

    // ─── Interaction ────────────────────────────────────────────────────
    window.MudCommands.registerAll([
      {
        name: 'look',
        aliases: ['l', 'examine', 'x', 'read'],
        category: 'Interaction',
        help: 'Examine room or object',
        usage: 'look [target]',
        handler: (parsed) => fn.doLook(parsed.target)
      },
      {
        name: 'take',
        aliases: ['get', 'grab', 'pick'],
        category: 'Interaction',
        help: 'Pick up an item',
        usage: 'take <item>',
        handler: (parsed) => fn.doTake(parsed.target)
      },
      {
        name: 'drop',
        aliases: ['leave', 'discard'],
        category: 'Interaction',
        help: 'Drop an item',
        usage: 'drop <item>',
        handler: (parsed) => fn.doDrop(parsed.target)
      },
      {
        name: 'use',
        aliases: ['activate', 'pull', 'push'],
        category: 'Interaction',
        help: 'Interact with something',
        usage: 'use <object>',
        handler: (parsed) => fn.doUse(parsed.target)
      },
      {
        name: 'combine',
        aliases: ['merge', 'craft'],
        category: 'Interaction',
        help: 'Combine two items',
        usage: 'combine <a> <b>',
        handler: (parsed) => fn.doCombine(parsed.target)
      },
      {
        name: 'rotate',
        aliases: ['turn', 'spin'],
        category: 'Interaction',
        help: 'Rotate a puzzle object',
        usage: 'rotate <obj> <dir>',
        handler: (parsed) => fn.doRotate(parsed.target)
      },
      {
        name: 'talk',
        aliases: ['ask', 'chat'],
        category: 'Interaction',
        help: 'Speak to an NPC',
        usage: 'talk <npc>',
        handler: (parsed) => fn.doTalk(parsed.target)
      },
      {
        name: 'say',
        aliases: ['speak'],
        category: 'Interaction',
        help: 'Say something aloud — NPCs may respond to keywords',
        usage: 'say <message>',
        handler: (parsed) => {
          const msg = parsed.raw.replace(/^(say|speak)\s*/i, '');
          if (!msg) return [{ type: 'info', text: 'Say what?' }];
          // Use NPC response system if available
          if (window.MudNpcSay && engine._internals) {
            const room = engine._internals.rooms[engine._internals.player.currentRoom];
            const aliveMobs = engine._internals.getAliveMobsInRoom(room);
            const allMobs = engine._internals.mobs;
            const player = engine._internals.player;
            const quests = window.MudData ? window.MudData.quests : {};
            return window.MudNpcSay.processSay(msg, aliveMobs, allMobs, player, player.currentRoom, quests);
          }
          return [{ type: 'info', text: `You say: "${msg}"` }];
        }
      }
    ]);

    // ─── Inventory ──────────────────────────────────────────────────────
    window.MudCommands.registerAll([
      {
        name: 'inventory',
        aliases: ['i', 'inv', 'bag'],
        category: 'Inventory',
        help: 'List carried items',
        usage: 'inventory',
        handler: () => fn.doInventory()
      },
      {
        name: 'equipment',
        aliases: ['eq', 'worn'],
        category: 'Inventory',
        help: 'List worn gear',
        usage: 'equipment',
        handler: () => fn.doEquipment()
      },
      {
        name: 'wear',
        aliases: ['equip', 'wield'],
        category: 'Inventory',
        help: 'Equip an item',
        usage: 'wear <item>',
        handler: (parsed) => fn.doWear(parsed.target)
      },
      {
        name: 'dual',
        aliases: ['offhand', 'dualwield'],
        category: 'Inventory',
        help: 'Equip a weapon in your off hand for dual wielding',
        usage: 'dual <weapon>',
        handler: (parsed) => fn.doDualWield(parsed.target)
      },
      {
        name: 'unequip',
        aliases: ['remove', 'takeoff'],
        category: 'Inventory',
        help: 'Unequip an item',
        usage: 'unequip <item>',
        handler: (parsed) => fn.doUnequip(parsed.target)
      },
      {
        name: 'inspect',
        aliases: ['examine', 'id', 'identify'],
        category: 'Inventory',
        help: 'View detailed stats of an item in your inventory or equipment',
        usage: 'inspect <item>',
        handler: (parsed) => {
          const target = parsed.target;
          if (!target) return [{ type: 'error', text: 'Inspect what? Usage: inspect <item>' }];
          const items = engine._internals.items;
          const player = engine._internals.player;
          const targetLC = target.toLowerCase();

          // Search inventory first, then equipped slots
          let itemDef = null;
          let source = '';
          // Check inventory
          for (const vnum of player.inventory) {
            const def = items[vnum];
            if (def && (def.name.toLowerCase().includes(targetLC) || String(def.vnum) === targetLC)) {
              itemDef = def;
              source = 'inventory';
              break;
            }
          }
          // Check equipped items
          if (!itemDef) {
            for (const [slot, vnum] of Object.entries(player.equipped)) {
              if (vnum == null) continue;
              const def = items[vnum];
              if (def && (def.name.toLowerCase().includes(targetLC) || String(def.vnum) === targetLC)) {
                itemDef = def;
                source = `equipped (${slot})`;
                break;
              }
            }
          }
          // Check purchasedItems
          if (!itemDef && player.purchasedItems) {
            const pi = player.purchasedItems.find(i => i && i.name.toLowerCase().includes(targetLC));
            if (pi) {
              itemDef = pi;
              source = 'inventory';
            }
          }
          if (!itemDef) return [{ type: 'error', text: `You don't have '${target}'.` }];

          // Build the inspection output
          const out = [
            { type: 'info', text: `\u2500\u2500\u2500 ${itemDef.name} \u2500\u2500\u2500` },
            { type: 'info', text: `  ${itemDef.description || 'No description.'}` },
            { type: 'info', text: `  Type: ${itemDef.type || 'unknown'}  |  Rarity: ${itemDef.rarity || 'common'}` }
          ];
          if (itemDef.slot) {
            out.push({ type: 'info', text: `  Slot: ${itemDef.slot}` });
          }
          // Display stats
          if (itemDef.stats && typeof itemDef.stats === 'object') {
            const statLines = [];
            for (const [k, v] of Object.entries(itemDef.stats)) {
              if (v == null || v === 0) continue;
              const label = k.charAt(0).toUpperCase() + k.slice(1);
              const prefix = typeof v === 'number' && v > 0 ? '+' : '';
              statLines.push(`${label}: ${prefix}${v}`);
            }
            if (statLines.length > 0) {
              out.push({ type: 'info', text: `  Stats: ${statLines.join('  |  ')}` });
            }
          }
          if (itemDef.value != null) {
            out.push({ type: 'info', text: `  Value: ${itemDef.value} gold  (sells for ${Math.max(1, Math.floor(itemDef.value * 0.5))})` });
          }
          out.push({ type: 'info', text: `  Location: ${source}` });
          return out;
        }
      }
    ]);

    // ─── Combat ─────────────────────────────────────────────────────────
    window.MudCommands.registerAll([
      {
        name: 'attack',
        aliases: ['kill', 'hit', 'fight'],
        category: 'Combat',
        help: 'Start combat with a target',
        usage: 'attack [target]',
        handler: (parsed) => fn.doAttack(parsed.target)
      },
      {
        name: 'flee',
        aliases: ['run', 'escape'],
        category: 'Combat',
        help: 'Attempt to escape combat',
        usage: 'flee',
        requires: { combat: true },
        handler: () => fn.doFlee()
      }
    ]);

    // ─── Progression ────────────────────────────────────────────────────
    window.MudCommands.registerAll([
      {
        name: 'train',
        aliases: ['learn'],
        category: 'Progression',
        help: 'See purchasable abilities (Training Hall)',
        usage: 'train',
        handler: (parsed) => fn.doTrain(parsed.target)
      },
      {
        name: 'buy',
        aliases: ['purchase'],
        category: 'Progression',
        help: 'Buy an ability (QP) or item from a merchant (gold)',
        usage: 'buy <name|number>',
        handler: (parsed) => {
          // Check if there's a merchant in the room first
          if (window.MudMerchants && engine._internals) {
            const room = engine._internals.rooms[engine._internals.player.currentRoom];
            const aliveMobs = engine._internals.getAliveMobsInRoom(room);
            const allMobs = engine._internals.mobs;
            const player = engine._internals.player;
            const merchant = window.MudMerchants.findMerchantInRoom(aliveMobs, allMobs, player.currentRoom);
            if (merchant) {
              return window.MudMerchants.processBuy(parsed.target, merchant.shop, merchant.mob, player, engine._internals.items);
            }
          }
          // Fallback to ability purchase
          return fn.doBuy(parsed.target);
        }
      },
      {
        name: 'respec',
        aliases: [],
        category: 'Progression',
        help: 'Change specialization (30 QP)',
        usage: 'respec [name]',
        handler: (parsed) => fn.doRespec(parsed.target)
      },
      {
        name: 'abilities',
        aliases: ['skills', 'spells'],
        category: 'Progression',
        help: 'List your abilities',
        usage: 'abilities',
        handler: () => fn.doAbilities()
      },
      {
        name: 'status',
        aliases: ['stat', 'stats', 'power', 'score'],
        category: 'Progression',
        help: 'View power, QP, and stats',
        usage: 'status',
        handler: () => fn.doStatus()
      },
      {
        name: 'proficiency',
        aliases: ['prof', 'profs', 'weaponprof'],
        category: 'Progression',
        help: 'View your weapon proficiencies (hidden until unlocked)',
        usage: 'proficiency',
        handler: () => {
          if (!window.MudWeaponProficiency) return [{ type: 'error', text: 'Weapon proficiency system not loaded.' }];
          return window.MudWeaponProficiency.formatDisplay(engine._internals.player);
        }
      },
      {
        name: 'quest',
        aliases: ['quests', 'journal', 'log'],
        category: 'Progression',
        help: 'View quest log or interact with the Bulletin Board',
        usage: 'quest [accept|board|name]',
        subcommands: {
          accept: (parsed, ctx) => fn.doQuest('accept ' + parsed.subTarget),
          complete: (parsed, ctx) => fn.doQuest('complete ' + parsed.subTarget),
          list: (parsed, ctx) => fn.doQuest('list'),
          /** Redirect 'quest board' to the bulletin board system. */
          board: () => {
            if (!window.MudCommands) return [{ type: 'error', text: 'Command system unavailable.' }];
            return window.MudCommands.execute(
              { verb: 'board', target: '', args: [], raw: 'board' },
              { inCombat: false, currentRoom: engine._internals.player.currentRoom }
            );
          }
        },
        /** Show quest log; if empty, hint toward the Bulletin Board. */
        handler: (parsed) => {
          const result = fn.doQuest(parsed.target);
          // If the quest log is empty, also mention the board
          if (result && result.length === 1 && result[0].text?.includes('empty')) {
            result.push({ type: 'info', text: "Tip: Use 'board' at the Bulletin Board to get procedural quests." });
          }
          return result;
        }
      }
    ]);

    // ─── Social ─────────────────────────────────────────────────────────
    window.MudCommands.registerAll([
      {
        name: 'write',
        aliases: ['note'],
        category: 'Social',
        help: 'Leave a note in this room',
        usage: 'write <message>',
        handler: (parsed) => fn.doWrite(parsed.raw.replace(/^(write|note)\s*/i, ''))
      },
      {
        name: 'readnotes',
        aliases: ['notes'],
        category: 'Social',
        help: 'Read notes left by other players',
        usage: 'notes',
        handler: () => fn.doReadNotes()
      },
      {
        name: 'shop',
        aliases: ['market', 'marketplace', 'wares'],
        category: 'Social',
        help: 'Browse a local merchant or the marketplace',
        usage: 'shop [id]',
        handler: (parsed) => {
          // Check for local merchant first
          if (window.MudMerchants && engine._internals) {
            const room = engine._internals.rooms[engine._internals.player.currentRoom];
            const aliveMobs = engine._internals.getAliveMobsInRoom(room);
            const allMobs = engine._internals.mobs;
            const player = engine._internals.player;
            const merchant = window.MudMerchants.findMerchantInRoom(aliveMobs, allMobs, player.currentRoom);
            if (merchant) {
              return window.MudMerchants.formatShopListing(merchant.mob, merchant.shop, player.gold);
            }
          }
          // Fallback to server marketplace
          return fn.doShop(parsed.target);
        }
      },
      {
        name: 'sell',
        aliases: [],
        category: 'Social',
        help: 'Sell an item to a local merchant',
        usage: 'sell <item>',
        handler: (parsed) => {
          if (!window.MudMerchants || !engine._internals) {
            return [{ type: 'error', text: 'There is no merchant here.' }];
          }
          const room = engine._internals.rooms[engine._internals.player.currentRoom];
          const aliveMobs = engine._internals.getAliveMobsInRoom(room);
          const allMobs = engine._internals.mobs;
          const player = engine._internals.player;
          const merchant = window.MudMerchants.findMerchantInRoom(aliveMobs, allMobs, player.currentRoom);
          if (!merchant) {
            return [{ type: 'error', text: 'There is no merchant here to sell to.' }];
          }
          return window.MudMerchants.processSell(parsed.target, merchant.mob, player);
        }
      }
    ]);

    // ─── System ─────────────────────────────────────────────────────────
    window.MudCommands.register({
      name: 'help',
      aliases: ['?', 'commands'],
      category: 'System',
      help: 'Show available commands',
      usage: 'help [command]',
      handler: (parsed) => {
        // If a specific command is requested, show its details
        if (parsed.target) {
          const cmd = window.MudCommands.get(parsed.target) ||
                      window.MudCommands.get(window.MudCommands.resolve(parsed.target));
          if (cmd) {
            const output = [
              { type: 'info', text: `─── ${cmd.name} ───` },
              { type: 'info', text: `  ${cmd.help}` },
              { type: 'info', text: `  Usage: ${cmd.usage || cmd.name}` }
            ];
            if (cmd.aliases && cmd.aliases.length > 0) {
              output.push({ type: 'info', text: `  Aliases: ${cmd.aliases.join(', ')}` });
            }
            if (cmd.subcommands) {
              output.push({ type: 'info', text: `  Sub-commands: ${Object.keys(cmd.subcommands).join(', ')}` });
            }
            return output;
          }
        }
        // Show full help
        const output = window.MudCommands.generateHelp();
        output.push({ type: 'info', text: '─── Shortcuts ───' });
        output.push({ type: 'info', text: '  n/s/e/w/u/d          — Move in that direction' });
        output.push({ type: 'info', text: '  l                    — Look around' });
        output.push({ type: 'info', text: '  i                    — Inventory' });
        output.push({ type: 'info', text: '  eq                   — Equipment' });
        output.push({ type: 'info', text: '' });
        output.push({ type: 'info', text: "  Type 'help <command>' for details on a specific command." });
        output.push({ type: 'info', text: '  Type an ability name to use it in combat.' });
        return output;
      }
    });

    // ─── Character Reset ──────────────────────────────────────────────
    window.MudCommands.register({
      name: 'reset',
      aliases: ['deletechar'],
      category: 'System',
      help: 'Permanently delete your character and start over',
      usage: 'reset confirm',
      handler: (parsed) => {
        if (parsed.target !== 'confirm') {
          return [
            { type: 'error', text: '═══ CHARACTER RESET ═══' },
            { type: 'error', text: 'This will PERMANENTLY delete your character,' },
            { type: 'error', text: 'all progress, items, and abilities.' },
            { type: 'info', text: '' },
            { type: 'info', text: "Type 'reset confirm' to proceed." },
            { type: 'info', text: 'There is no undo.' }
          ];
        }
        // Wipe the server save and reload
        const output = [
          { type: 'info', text: 'Erasing character data...' },
          { type: 'info', text: 'The world dissolves around you...' }
        ];
        if (window.MudAPI?.isLoggedIn()) {
          window.MudAPI.storeSave({}).then(() => {
            setTimeout(() => location.reload(), 800);
          }).catch(() => {
            setTimeout(() => location.reload(), 800);
          });
        } else {
          setTimeout(() => location.reload(), 800);
        }
        return output;
      }
    });

    return engine;
  };
})();
