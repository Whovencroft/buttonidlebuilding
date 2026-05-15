/**
 * mud_commands.js — Unified Command Registry & Middleware Pipeline
 *
 * Replaces the flat VERB_ALIASES + switch statement pattern with a
 * centralized registry. Any module can register commands with metadata.
 *
 * Features:
 *   - Single source of truth for all commands and aliases
 *   - Before/after middleware hooks (rest-check, exhaustion, proficiency, etc.)
 *   - Sub-command support (e.g., 'mission accept', 'quest complete')
 *   - Category grouping for help display
 *   - Context requirements (inCombat, notInCombat, specificRoom)
 *
 * Exposes window.MudCommands for use by mud_engine.js and all modules.
 */
(() => {
  'use strict';

  // ─── Registry Storage ───────────────────────────────────────────────────

  /** @type {Map<string, CommandDef>} Primary command name → definition */
  const commands = new Map();

  /** @type {Map<string, string>} Alias → primary command name */
  const aliases = new Map();

  /** @type {Array<MiddlewareFn>} Before-execute hooks (run in order) */
  const beforeHooks = [];

  /** @type {Array<MiddlewareFn>} After-execute hooks (run in order) */
  const afterHooks = [];

  // ─── Types (documented via JSDoc) ───────────────────────────────────────

  /**
   * @typedef {object} CommandDef
   * @property {string} name - Primary command name (lowercase)
   * @property {string[]} aliases - Alternative names/shortcuts
   * @property {string} category - Grouping for help display
   * @property {string} help - One-line help text
   * @property {string} [usage] - Usage syntax (e.g., 'stance <name>')
   * @property {Function} handler - (parsed, context) => output[]
   * @property {object} [requires] - Context requirements
   * @property {boolean} [requires.combat] - Must be in combat
   * @property {boolean} [requires.noCombat] - Must NOT be in combat
   * @property {number} [requires.room] - Must be in specific room vnum
   * @property {object} [subcommands] - Map of subcommand name → handler
   */

  /**
   * @typedef {object} ParsedInput
   * @property {string} verb - Resolved primary command name
   * @property {string} target - Full target string (everything after verb)
   * @property {string[]} args - Target split into tokens
   * @property {string|null} subcommand - First arg if it matches a registered subcommand
   * @property {string} subTarget - Remaining args after subcommand
   * @property {string|null} preposition - Detected preposition (in, on, to, with, from, at)
   * @property {string|null} indirectObject - Text after the preposition
   * @property {string} raw - Original unmodified input
   */

  // ─── Registration ───────────────────────────────────────────────────────

  /**
   * Register a command with the registry.
   * @param {CommandDef} def - Command definition
   */
  function register(def) {
    if (!def || !def.name || !def.handler) {
      console.warn('[MudCommands] Invalid command registration:', def);
      return;
    }

    const name = def.name.toLowerCase();
    commands.set(name, { ...def, name });

    // Register aliases
    if (def.aliases && Array.isArray(def.aliases)) {
      for (const alias of def.aliases) {
        aliases.set(alias.toLowerCase(), name);
      }
    }
    // The primary name also maps to itself
    aliases.set(name, name);
  }

  /**
   * Register multiple commands at once.
   * @param {CommandDef[]} defs - Array of command definitions
   */
  function registerAll(defs) {
    for (const def of defs) {
      register(def);
    }
  }

  /**
   * Unregister a command by primary name.
   * @param {string} name - Primary command name
   */
  function unregister(name) {
    const def = commands.get(name.toLowerCase());
    if (!def) return;
    commands.delete(name.toLowerCase());
    // Remove aliases
    for (const [alias, target] of aliases.entries()) {
      if (target === name.toLowerCase()) {
        aliases.delete(alias);
      }
    }
  }

  // ─── Middleware ─────────────────────────────────────────────────────────

  /**
   * Add a before-execute middleware hook.
   * Hook signature: (parsed, context) => output[] | null
   * Return output[] to short-circuit (command won't execute).
   * Return null to continue.
   * @param {Function} fn - Middleware function
   */
  function before(fn) {
    beforeHooks.push(fn);
  }

  /**
   * Add an after-execute middleware hook.
   * Hook signature: (parsed, context, result) => void
   * Can modify result in-place or trigger side effects.
   * @param {Function} fn - Middleware function
   */
  function after(fn) {
    afterHooks.push(fn);
  }

  // ─── Resolution ─────────────────────────────────────────────────────────

  /**
   * Resolve an alias or command name to the primary command name.
   * @param {string} input - Alias or command name
   * @returns {string|null} Primary command name, or null if not found
   */
  function resolve(input) {
    return aliases.get(input.toLowerCase()) || null;
  }

  /**
   * Get a command definition by primary name.
   * @param {string} name - Primary command name
   * @returns {CommandDef|null}
   */
  function get(name) {
    return commands.get(name.toLowerCase()) || null;
  }

  /**
   * Check if a string is a registered command or alias.
   * @param {string} input - String to check
   * @returns {boolean}
   */
  function isCommand(input) {
    return aliases.has(input.toLowerCase());
  }

  // ─── Execution ──────────────────────────────────────────────────────────

  /**
   * Execute a parsed command through the registry.
   * Runs before-hooks, checks requirements, executes handler, runs after-hooks.
   * @param {ParsedInput} parsed - Parsed input from MudParser
   * @param {object} context - Engine context (player state, combat state, room, etc.)
   * @returns {Array} Output lines
   */
  function execute(parsed, context) {
    if (!parsed || !parsed.verb) {
      return null; // Let the engine handle unrecognized input
    }

    const def = commands.get(parsed.verb);
    if (!def) return null; // Not a registered command

    // ─── Before Hooks ─────────────────────────────────────────────
    for (const hook of beforeHooks) {
      const blocked = hook(parsed, context);
      if (blocked) return blocked; // Short-circuit
    }

    // ─── Requirement Checks ───────────────────────────────────────
    if (def.requires) {
      if (def.requires.combat && !context.inCombat) {
        return [{ type: 'error', text: 'You can only do that in combat.' }];
      }
      if (def.requires.noCombat && context.inCombat) {
        return [{ type: 'error', text: "You can't do that while in combat!" }];
      }
      if (def.requires.room != null && context.currentRoom !== def.requires.room) {
        return [{ type: 'error', text: def.requires.roomError || 'You are not in the right place for that.' }];
      }
    }

    // ─── Sub-command Routing ──────────────────────────────────────
    if (def.subcommands && parsed.args.length > 0) {
      const subName = parsed.args[0].toLowerCase();
      const subHandler = def.subcommands[subName];
      if (subHandler) {
        // Rebuild parsed with subcommand info
        const subParsed = {
          ...parsed,
          subcommand: subName,
          subTarget: parsed.args.slice(1).join(' '),
          args: parsed.args.slice(1)
        };
        const result = subHandler(subParsed, context);
        // After hooks
        for (const hook of afterHooks) {
          hook(parsed, context, result);
        }
        return result;
      }
    }

    // ─── Main Handler ─────────────────────────────────────────────
    const result = def.handler(parsed, context);

    // ─── After Hooks ──────────────────────────────────────────────
    for (const hook of afterHooks) {
      hook(parsed, context, result);
    }

    return result;
  }

  // ─── Query ──────────────────────────────────────────────────────────────

  /**
   * Get all registered commands, optionally filtered by category.
   * @param {string|null} category - Filter by category, or null for all
   * @returns {CommandDef[]}
   */
  function getAll(category) {
    const all = [...commands.values()];
    if (category) return all.filter(c => c.category === category);
    return all;
  }

  /**
   * Get all registered command names and aliases (for tab-completion).
   * @returns {string[]}
   */
  function getAllNames() {
    return [...aliases.keys()];
  }

  /**
   * Get command categories (for organized help display).
   * @returns {string[]}
   */
  function getCategories() {
    const cats = new Set();
    for (const def of commands.values()) {
      if (def.category) cats.add(def.category);
    }
    return [...cats];
  }

  /**
   * Generate help output for all commands or a specific category.
   * @param {string|null} category - Category filter
   * @returns {Array} Output lines
   */
  function generateHelp(category) {
    const output = [];
    const categories = category ? [category] : getCategories();

    for (const cat of categories) {
      const cmds = getAll(cat);
      if (cmds.length === 0) continue;
      output.push({ type: 'info', text: `─── ${cat} ───` });
      for (const cmd of cmds) {
        const usage = cmd.usage || cmd.name;
        const pad = ' '.repeat(Math.max(1, 20 - usage.length));
        output.push({ type: 'info', text: `  ${usage}${pad}- ${cmd.help}` });
      }
    }

    return output;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudCommands = {
    register,
    registerAll,
    unregister,
    before,
    after,
    resolve,
    get,
    isCommand,
    execute,
    getAll,
    getAllNames,
    getCategories,
    generateHelp
  };
})();
