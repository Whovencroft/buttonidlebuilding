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
        help: 'Say something aloud',
        usage: 'say <message>',
        handler: (parsed) => [{ type: 'info', text: `You say: "${parsed.target}"` }]
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
        name: 'unequip',
        aliases: ['remove', 'takeoff'],
        category: 'Inventory',
        help: 'Unequip an item',
        usage: 'unequip <item>',
        handler: (parsed) => fn.doUnequip(parsed.target)
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
        help: 'Purchase an ability with QP',
        usage: 'buy <name|number>',
        handler: (parsed) => fn.doBuy(parsed.target)
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
        name: 'quest',
        aliases: ['quests', 'journal', 'log'],
        category: 'Progression',
        help: 'View quest log or accept/complete',
        usage: 'quest [name]',
        subcommands: {
          accept: (parsed, ctx) => fn.doQuest('accept ' + parsed.subTarget),
          complete: (parsed, ctx) => fn.doQuest('complete ' + parsed.subTarget),
          list: (parsed, ctx) => fn.doQuest('list')
        },
        handler: (parsed) => fn.doQuest(parsed.target)
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
        aliases: ['market', 'marketplace'],
        category: 'Social',
        help: 'Browse the marketplace',
        usage: 'shop [id]',
        handler: (parsed) => fn.doShop(parsed.target)
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

    return engine;
  };
})();
