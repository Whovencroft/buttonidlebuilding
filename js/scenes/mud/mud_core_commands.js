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
        aliases: ['walk', 'move', 'head', 'travel', 'proceed'],
        category: 'Movement',
        help: 'Move in a direction',
        usage: 'go <direction>',
        handler: (parsed) => fn.doGo(parsed.direction || parsed.target)
      },
      {
        name: 'recall',
        aliases: ['warp', 'home', 'return', 'hearth'],
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
        aliases: ['l', 'x', 'read', 'check', 'peek', 'view', 'search'],
        category: 'Interaction',
        help: 'Examine room or object',
        usage: 'look [target]',
        handler: (parsed) => fn.doLook(parsed.target)
      },
      {
        name: 'take',
        aliases: ['get', 'grab', 'pick', 'loot', 'pickup'],
        category: 'Interaction',
        help: 'Pick up an item',
        usage: 'take <item>',
        handler: (parsed) => fn.doTake(parsed.target)
      },
      {
        name: 'drop',
        aliases: ['leave', 'discard', 'toss'],
        category: 'Interaction',
        help: 'Drop an item',
        usage: 'drop <item>',
        handler: (parsed) => fn.doDrop(parsed.target)
      },
      {
        name: 'use',
        aliases: ['activate', 'pull', 'push', 'interact', 'open'],
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
        aliases: ['ask', 'chat', 'converse', 'greet'],
        category: 'Interaction',
        help: 'Speak to an NPC',
        usage: 'talk <npc>',
        handler: (parsed) => fn.doTalk(parsed.target)
      },
      {
        name: 'say',
        aliases: ['shout', 'yell'],
        category: 'Interaction',
        help: 'Say something aloud - NPCs may respond to keywords',
        usage: 'say <message>',
        handler: (parsed) => {
          const msg = parsed.raw.replace(/^(say|shout|yell)\s*/i, '');
          if (!msg) return [{ type: 'info', text: 'Say what?' }];

          // Check for password-gated rooms (say the word to enter)
          if (engine._internals) {
            const room = engine._internals.rooms[engine._internals.player.currentRoom];
            if (room && room.password && msg.toLowerCase().trim() === room.password.toLowerCase()) {
              const dest = room.password_destination;
              if (dest && engine._internals.rooms[dest]) {
                const output = [{ type: 'success', text: `You speak the word: "${msg}"` }];
                output.push({ type: 'info', text: 'The way opens before you...' });
                output.push(...engine._internals.moveToRoom(dest));
                return output;
              }
            }
          }

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
        aliases: ['i', 'inv', 'bag', 'pack', 'backpack'],
        category: 'Inventory',
        help: 'List carried items',
        usage: 'inventory',
        handler: () => fn.doInventory()
      },
      {
        name: 'equipment',
        aliases: ['eq', 'worn', 'gear', 'loadout'],
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
        aliases: ['offhand', 'dualwield', 'dw'],
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
        aliases: ['examine', 'id', 'identify', 'appraise', 'eval'],
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
          if (itemDef.weapon_category) {
            const cat = itemDef.weapon_category.charAt(0).toUpperCase() + itemDef.weapon_category.slice(1);
            out.push({ type: 'info', text: `  Weapon Type: ${cat}` });
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
        aliases: ['kill', 'hit', 'fight', 'strike', 'engage'],
        category: 'Combat',
        help: 'Start combat with a target',
        usage: 'attack [target]',
        handler: (parsed) => fn.doAttack(parsed.target)
      },
      {
        name: 'flee',
        aliases: ['run', 'escape', 'retreat', 'withdraw'],
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
        aliases: ['learn', 'study'],
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
        aliases: ['skills', 'spells', 'abs', 'abil'],
        category: 'Progression',
        help: 'List your abilities',
        usage: 'abilities',
        handler: () => fn.doAbilities()
      },
      {
        name: 'status',
        aliases: ['stat', 'sc', 'score', 'info', 'me', 'whoami'],
        category: 'Progression',
        help: 'View power, QP, and stats',
        usage: 'status',
        handler: () => fn.doStatus()
      },

      {
        name: 'quest',
        aliases: ['quests', 'journal', 'log', 'tasks', 'objectives'],
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
      ,{
        name: 'progress',
        aliases: ['story', 'puzzles'],
        category: 'Progression',
        help: 'View story progress, puzzles solved, and marble trail clues',
        usage: 'progress',
        handler: () => {
          const p = engine._internals.player;
          const flags = p.worldFlags || {};
          const output = [{ type: 'info', text: '--- Story Progress ---' }];

          // Puzzle completion by zone
          const puzzles = [
            { zone: 1, flag: 'zone_1_puzzle_complete', name: 'The Nexus: Statue Alignment' },
            { zone: 2, flag: 'zone_2_biometric_unlocked', name: 'Neon Sprawl: Biometric Scanner' },
            { zone: 3, flag: 'zone_3_safe_opened', name: 'Undercity: Safe Cracking' },
            { zone: 4, flag: 'zone_4_launch_aborted', name: 'Iron Wastes: Launch Abort' },
            { zone: 5, flag: 'zone_5_braziers_lit', name: 'Void Reach: Brazier Ritual' },
            { zone: 6, flag: 'zone_6_mechanism_opened', name: 'Temporal Rift: Mechanism' },
            { zone: 7, flag: 'zone_7_organ_played', name: 'Shadow Market: Pipe Organ' },
            { zone: 8, flag: 'zone_8_mirrors_aligned', name: 'Training Grounds: Gravity Mirrors' },
            { zone: 9, flag: 'zone_9_hourglass_turned', name: 'Ancient Ruins: Hourglass' },
            { zone: 10, flag: 'zone_10_obelisk_activated', name: 'Wizard Tower: Obelisk' },
            { zone: 11, flag: 'zone_11_void_anchored', name: 'Edge of the Void: Anchor' }
          ];

          const solved = puzzles.filter(pz => flags[pz.flag]);
          output.push({ type: 'info', text: `  Puzzles Solved: ${solved.length}/${puzzles.length}` });
          for (const pz of puzzles) {
            const mark = flags[pz.flag] ? '[x]' : '[ ]';
            output.push({ type: flags[pz.flag] ? 'success' : 'info', text: `    ${mark} ${pz.name}` });
          }

          // Marble trail clues
          output.push({ type: 'info', text: '' });
          const clues = flags.meta_clues || [];
          const totalClues = 11;
          output.push({ type: 'info', text: `  Marble Trail: ${clues.length}/${totalClues} traces found` });
          if (flags.marble_confrontation_unlocked) {
            output.push({ type: 'success', text: '  *** The path to the marble is OPEN ***' });
          } else if (clues.length > 0) {
            output.push({ type: 'info', text: '  Keep exploring to find more traces of the marble\'s passage.' });
          } else {
            output.push({ type: 'info', text: '  You have not yet found any sign of the marble.' });
          }

          // Overall stats
          output.push({ type: 'info', text: '' });
          output.push({ type: 'info', text: '--- Summary ---' });
          output.push({ type: 'info', text: `  Power: ${p.power}  |  Quests Done: ${(p.completedQuests || []).length}  |  Deaths: ${p.deaths || 0}` });

          return output;
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
        aliases: ['market', 'marketplace', 'wares', 'store', 'browse'],
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
        aliases: ['pawn'],
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

    // ─── Information ────────────────────────────────────────────────────────
    window.MudCommands.registerAll([
      {
        name: 'consider',
        aliases: ['con', 'assess', 'gauge'],
        category: 'Information',
        help: 'Gauge how dangerous a mob is relative to your power',
        usage: 'consider <target>',
        handler: (parsed) => {
          if (!parsed.target) return [{ type: 'error', text: 'Consider what? Usage: consider <target>' }];
          const room = engine._internals.rooms[engine._internals.player.currentRoom];
          const aliveMobs = engine._internals.getAliveMobsInRoom(room);
          const allMobs = engine._internals.mobs;
          const player = engine._internals.player;
          const target = parsed.target.toLowerCase();
          let foundVnum = null;
          for (const mv of aliveMobs) {
            const mob = allMobs[mv];
            if (!mob) continue;
            const kws = mob.keywords || mob.name.toLowerCase().split(' ');
            if (kws.some(k => k.includes(target) || target.includes(k))) {
              foundVnum = mv;
              break;
            }
          }
          if (!foundVnum) return [{ type: 'error', text: `You don't see '${parsed.target}' here.` }];
          const mob = allMobs[foundVnum];
          const mobPower = (mob.stats.hp || 0) + (mob.stats.attack || 0) * 3 + (mob.stats.defense || 0) * 2;
          const ratio = mobPower / Math.max(1, player.power);
          let assessment, color;
          if (ratio < 0.25) { assessment = 'is barely worth your time.'; color = 'info'; }
          else if (ratio < 0.5) { assessment = 'would be easy prey.'; color = 'info'; }
          else if (ratio < 0.8) { assessment = 'looks like a fair fight.'; color = 'success'; }
          else if (ratio < 1.2) { assessment = 'is well-matched to you.'; color = 'success'; }
          else if (ratio < 2.0) { assessment = 'looks dangerous!'; color = 'combat'; }
          else if (ratio < 4.0) { assessment = 'would likely destroy you.'; color = 'error'; }
          else { assessment = 'radiates overwhelming power. Run.'; color = 'error'; }
          const isBoss = (mob.flags || []).includes('boss');
          const output = [{ type: color, text: `${mob.name} ${assessment}` }];
          if (isBoss) output.push({ type: 'error', text: '  \u2620 BOSS \u2014 telegraphed attacks require Tier 2+ counters!' });
          return output;
        }
      },
      {
        name: 'map',
        aliases: ['area', 'zone'],
        category: 'Information',
        help: 'Show a mini-map of nearby rooms you have visited',
        usage: 'map',
        handler: () => {
          const player = engine._internals.player;
          const rooms = engine._internals.rooms;
          const current = player.currentRoom;
          const room = rooms[current];
          if (!room) return [{ type: 'error', text: 'You are nowhere.' }];
          const output = [{ type: 'info', text: '\u2500\u2500\u2500 Area Map \u2500\u2500\u2500' }];
          const exits = room.exits || {};
          const dirSymbols = { north: 'N', south: 'S', east: 'E', west: 'W', up: 'U', down: 'D' };
          output.push({ type: 'info', text: `  [*] ${room.name || 'Here'} (you are here)` });
          output.push({ type: 'info', text: '' });
          for (const [dir, ex] of Object.entries(exits)) {
            const targetVnum = typeof ex === 'object' ? ex.target_vnum : ex;
            const targetRoom = rooms[targetVnum];
            const visited = player.visitedRooms?.[targetVnum];
            const name = visited ? (targetRoom?.name || '???') : '(unexplored)';
            const sym = dirSymbols[dir] || dir.charAt(0).toUpperCase();
            output.push({ type: 'info', text: `   ${sym} \u2192 ${name}` });
          }
          const zoneNum = Math.floor(current / 100);
          const zoneRooms = Object.keys(rooms).filter(v => Math.floor(parseInt(v) / 100) === zoneNum);
          const visitedInZone = zoneRooms.filter(v => player.visitedRooms?.[v]);
          output.push({ type: 'info', text: '' });
          output.push({ type: 'info', text: `  Zone explored: ${visitedInZone.length}/${zoneRooms.length} rooms` });
          return output;
        }
      },
      {
        name: 'compare',
        aliases: ['comp'],
        category: 'Information',
        help: 'Compare an item to your currently equipped gear',
        usage: 'compare <item>',
        handler: (parsed) => {
          if (!parsed.target) return [{ type: 'error', text: 'Compare what? Usage: compare <item>' }];
          const player = engine._internals.player;
          const items = engine._internals.items;
          const target = parsed.target.toLowerCase();
          const invVnum = player.inventory.find(v => {
            const item = items[v];
            if (!item) return false;
            return item.name.toLowerCase().includes(target);
          });
          if (invVnum === undefined) return [{ type: 'error', text: `You don't have '${parsed.target}' in your inventory.` }];
          const item = items[invVnum];
          if (!item) return [{ type: 'error', text: 'Item not found.' }];
          const slot = item.slot || (item.type === 'weapon' ? 'weapon' : null);
          if (!slot) return [{ type: 'info', text: `${item.name} is not equippable.` }];
          const equippedVnum = player.equipped[slot];
          const equipped = equippedVnum != null ? items[equippedVnum] : null;
          const output = [{ type: 'info', text: `\u2500\u2500\u2500 Compare: ${item.name} vs ${equipped ? equipped.name : '(nothing)'} [${slot}] \u2500\u2500\u2500` }];
          const stats = ['attack', 'defense', 'hp', 'focus'];
          for (const stat of stats) {
            const newVal = item.stats?.[stat] || 0;
            const oldVal = equipped?.stats?.[stat] || 0;
            if (newVal === 0 && oldVal === 0) continue;
            const diff = newVal - oldVal;
            const sign = diff > 0 ? '+' : '';
            const indicator = diff > 0 ? '\u25b2' : (diff < 0 ? '\u25bc' : '\u2550');
            output.push({ type: diff > 0 ? 'success' : (diff < 0 ? 'error' : 'info'), text: `  ${stat.padEnd(8)} ${String(oldVal).padStart(4)} \u2192 ${String(newVal).padStart(4)}  (${sign}${diff}) ${indicator}` });
          }
          if (item.weapon_category && (!equipped || item.weapon_category !== equipped.weapon_category)) {
            output.push({ type: 'info', text: `  Type: ${item.weapon_category}${equipped?.weapon_category ? ` (was: ${equipped.weapon_category})` : ''}` });
          }
          return output;
        }
      }
    ]);

    // ─── System ─────────────────────────────────────────────────────────────
    window.MudCommands.register({
      name: 'help',
      aliases: ['?', 'commands', 'manual', 'guide'],
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
        // Show full help grouped by category with topic filter
        const allCmds = window.MudCommands.getAll ? window.MudCommands.getAll() : [];
        const categories = {};
        for (const cmd of allCmds) {
          const cat = cmd.category || 'Other';
          if (!categories[cat]) categories[cat] = [];
          categories[cat].push(cmd);
        }
        const output = [{ type: 'info', text: '═══ Command Reference ═══' }];
        const catOrder = ['Movement', 'Combat', 'Information', 'Items', 'Social', 'System'];
        for (const cat of catOrder) {
          if (!categories[cat]) continue;
          output.push({ type: 'info', text: '' });
          output.push({ type: 'info', text: `─── ${cat} ───` });
          for (const cmd of categories[cat]) {
            const aliases = cmd.aliases?.length ? ` (${cmd.aliases.slice(0, 3).join(', ')})` : '';
            output.push({ type: 'info', text: `  ${cmd.name.padEnd(14)} ${cmd.help}${aliases}` });
          }
        }
        // Remaining categories not in catOrder
        for (const [cat, cmds] of Object.entries(categories)) {
          if (catOrder.includes(cat)) continue;
          output.push({ type: 'info', text: '' });
          output.push({ type: 'info', text: `─── ${cat} ───` });
          for (const cmd of cmds) {
            output.push({ type: 'info', text: `  ${cmd.name.padEnd(14)} ${cmd.help}` });
          }
        }
        output.push({ type: 'info', text: '' });
        output.push({ type: 'info', text: '─── Shortcuts ───' });
        output.push({ type: 'info', text: '  n/s/e/w/u/d          - Move in that direction' });
        output.push({ type: 'info', text: '  l                    - Look around' });
        output.push({ type: 'info', text: '  i                    - Inventory' });
        output.push({ type: 'info', text: '  eq                   - Equipment' });
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
