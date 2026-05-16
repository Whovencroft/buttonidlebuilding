/**
 * mud_parser.js  -  Smart Input Parser
 *
 * Replaces the original flat tokenizer with a parser that:
 *   - Resolves verbs through MudCommands registry (not a hardcoded map)
 *   - Preserves prepositions as structural markers (in, on, to, with, from, at)
 *   - Detects direction shortcuts (n/s/e/w/u/d)
 *   - Supports multi-word targets without losing meaning
 *   - Provides a clean ParsedInput object for command handlers
 *
 * Does NOT strip stop words  -  that was causing ambiguity. Instead, it
 * identifies structural prepositions and splits around them.
 *
 * Exposes window.MudParser for use by mud_engine.js.
 */
(() => {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────

  /** Prepositions that carry structural meaning in commands. */
  const PREPOSITIONS = new Set(['in', 'on', 'to', 'with', 'from', 'at', 'into', 'onto']);

  /** Direction shortcuts → canonical direction names. */
  const DIRECTION_MAP = {
    n: 'north', s: 'south', e: 'east', w: 'west',
    u: 'up', d: 'down',
    north: 'north', south: 'south', east: 'east', west: 'west',
    up: 'up', down: 'down',
    ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
    northeast: 'northeast', northwest: 'northwest',
    southeast: 'southeast', southwest: 'southwest'
  };

  /** Articles to strip from the beginning of noun phrases (not from middle). */
  const ARTICLES = new Set(['the', 'a', 'an']);

  // ─── Parser ─────────────────────────────────────────────────────────────

  /**
   * Parse raw player input into a structured ParsedInput object.
   * @param {string} raw - Raw input string from the player
   * @returns {ParsedInput} Structured parse result
   */
  function parse(raw) {
    const result = {
      verb: null,
      target: '',
      args: [],
      subcommand: null,
      subTarget: '',
      preposition: null,
      indirectObject: null,
      direction: null,
      raw: raw
    };

    if (!raw || typeof raw !== 'string') return result;

    // Normalize: lowercase, strip punctuation (but keep apostrophes in words)
    const cleaned = raw.toLowerCase().replace(/[.,!?;:"]/g, '').trim();
    if (!cleaned) return result;

    // Tokenize
    const tokens = cleaned.split(/\s+/);
    if (tokens.length === 0) return result;

    const firstToken = tokens[0];

    // ─── Direction Shortcut ─────────────────────────────────────────
    // Single token that's a direction → movement command
    if (tokens.length === 1 && DIRECTION_MAP[firstToken]) {
      result.verb = 'go';
      result.target = DIRECTION_MAP[firstToken];
      result.direction = DIRECTION_MAP[firstToken];
      result.args = [result.target];
      return result;
    }

    // ─── Resolve Verb ───────────────────────────────────────────────
    // Try to resolve through the command registry
    const resolved = window.MudCommands?.resolve(firstToken);
    if (resolved) {
      result.verb = resolved;
    } else {
      // Not a registered command  -  store as-is for ability name matching
      result.verb = null;
      result.target = cleaned;
      result.args = tokens;
      return result;
    }

    // ─── Extract Target ─────────────────────────────────────────────
    const restTokens = tokens.slice(1);

    // Strip leading article from target (e.g., "look at the sword" → "sword")
    let targetTokens = [...restTokens];
    if (targetTokens.length > 0 && ARTICLES.has(targetTokens[0])) {
      targetTokens = targetTokens.slice(1);
    }

    // ─── Handle 'go' + direction ────────────────────────────────────
    if (result.verb === 'go' && targetTokens.length > 0) {
      // Strip preposition "to" if present (e.g., "go to the north")
      if (targetTokens[0] === 'to') targetTokens = targetTokens.slice(1);
      if (targetTokens.length > 0 && ARTICLES.has(targetTokens[0])) {
        targetTokens = targetTokens.slice(1);
      }
      const dir = DIRECTION_MAP[targetTokens[0]];
      if (dir) {
        result.target = dir;
        result.direction = dir;
        result.args = [dir];
        return result;
      }
    }

    // ─── Find Preposition Split ─────────────────────────────────────
    // Look for a structural preposition to split target into
    // direct object + preposition + indirect object
    // e.g., "put sword in chest" → target="sword", prep="in", indirect="chest"
    let prepIndex = -1;
    for (let i = 0; i < targetTokens.length; i++) {
      if (PREPOSITIONS.has(targetTokens[i])) {
        // Don't split on the first token (it's part of the target)
        if (i > 0) {
          prepIndex = i;
          break;
        }
        // If preposition is first token after verb, it's a structural prefix
        // e.g., "look at sword"  -  "at" is structural, "sword" is target
        if (i === 0 && targetTokens.length > 1) {
          // Strip the preposition, rest is target
          targetTokens = targetTokens.slice(1);
          // Strip article after preposition
          if (targetTokens.length > 0 && ARTICLES.has(targetTokens[0])) {
            targetTokens = targetTokens.slice(1);
          }
          break;
        }
      }
    }

    if (prepIndex > 0) {
      const directTokens = targetTokens.slice(0, prepIndex);
      result.preposition = targetTokens[prepIndex];
      let indirectTokens = targetTokens.slice(prepIndex + 1);
      // Strip article from indirect object
      if (indirectTokens.length > 0 && ARTICLES.has(indirectTokens[0])) {
        indirectTokens = indirectTokens.slice(1);
      }
      result.target = directTokens.join(' ');
      result.indirectObject = indirectTokens.join(' ');
      result.args = directTokens;
    } else {
      result.target = targetTokens.join(' ');
      result.args = targetTokens;
    }

    // ─── Direction Detection (for 'go' with full name) ──────────────
    if (result.verb === 'go' && result.target) {
      const dir = DIRECTION_MAP[result.target];
      if (dir) result.direction = dir;
    }

    return result;
  }

  /**
   * Quick check if a string is a bare direction shortcut.
   * @param {string} input - Input to check
   * @returns {boolean}
   */
  function isDirection(input) {
    return !!DIRECTION_MAP[input.toLowerCase().trim()];
  }

  /**
   * Resolve a direction alias to canonical name.
   * @param {string} input - Direction input
   * @returns {string|null} Canonical direction or null
   */
  function resolveDirection(input) {
    return DIRECTION_MAP[input.toLowerCase().trim()] || null;
  }

  /**
   * Get all known direction names and aliases (for tab-completion).
   * @returns {string[]}
   */
  function getDirectionNames() {
    return Object.keys(DIRECTION_MAP);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudParser = {
    parse,
    isDirection,
    resolveDirection,
    getDirectionNames,
    DIRECTION_MAP,
    PREPOSITIONS
  };
})();
