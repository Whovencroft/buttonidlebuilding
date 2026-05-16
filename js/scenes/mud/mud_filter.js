/**
 * mud_filter.js  -  Client-Side Moderation Filter
 *
 * Filters player-typed input for profanity, slurs, and abusive content.
 * Designed to run client-side before any text is sent to the server
 * (notes, chat, etc.). Uses a tiered approach:
 *
 * 1. Exact match against a blocklist (common slurs/profanity)
 * 2. Pattern match for leet-speak and obfuscation attempts
 * 3. Returns a sanitized string or a rejection flag
 *
 * Usage:
 *   const result = window.MudFilter.check(inputString);
 *   if (result.blocked) { // show warning }
 *   else { // use result.clean }
 */
(() => {
  'use strict';

  // ─── Blocklist ───────────────────────────────────────────────────────────
  // Kept minimal and categorical. Extend as needed.
  // Categories: slurs, sexual, threats, spam patterns
  const BLOCKED_EXACT = new Set([
    // Racial slurs (abbreviated to first letters for source readability)
    'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded',
    'tranny', 'kike', 'spic', 'wetback', 'chink', 'gook',
    'coon', 'darkie', 'raghead', 'towelhead', 'beaner',
    // Sexual
    'cunt', 'cock', 'dick', 'pussy', 'tits', 'boobs',
    'penis', 'vagina', 'blowjob', 'handjob', 'cumshot',
    'anal', 'dildo', 'masturbate', 'orgasm', 'porn',
    // Extreme profanity
    'fuck', 'shit', 'ass', 'bitch', 'whore', 'slut',
    'bastard', 'damn', 'hell',
    // Threats
    'kill yourself', 'kys', 'die', 'rape'
  ]);

  // Patterns that catch leet-speak and character substitution
  const BLOCKED_PATTERNS = [
    /n[i1!|][gq]{1,2}[e3a@]?[r]/i,         // n-word variants
    /f[a@4][gq]{1,2}[o0]?[t7]?/i,           // f-slur variants
    /r[e3][t7][a@4]rd/i,                      // r-word variants
    /k[i1!]ll?\s*(your|ur)\s*s[e3]lf/i,      // kys variants
    /[s$5][h#][i1!][t7]/i,                    // shit variants
    /[f][u][c][k]/i,                          // fuck (already exact but catches compounds)
  ];

  // Words that are fine in MUD context but might false-positive
  const WHITELIST = new Set([
    'assassin', 'assault', 'bass', 'class', 'grass',
    'pass', 'mass', 'compass', 'brass', 'glass',
    'classic', 'cockatrice', 'cocktail', 'peacock',
    'dictate', 'dictionary', 'addiction', 'prediction',
    'therapist', 'analyst', 'title', 'butter',
    'scunthorpe', 'penistone', 'shitterton',
    'hellfire', 'damnation', 'hellhound', 'damned',
    'shell', 'hello', 'basement'
  ]);

  /**
   * Normalize a string for comparison: lowercase, strip extra spaces,
   * collapse repeated characters.
   */
  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * De-leet a string: replace common substitutions with letters.
   */
  function deleet(text) {
    return text
      .replace(/[0oO]/g, 'o')
      .replace(/[1!|iI]/g, 'i')
      .replace(/[3]/g, 'e')
      .replace(/[4@]/g, 'a')
      .replace(/[5$]/g, 's')
      .replace(/[7]/g, 't')
      .replace(/[8]/g, 'b')
      .replace(/[9]/g, 'g');
  }

  /**
   * Check if a word is whitelisted (MUD-safe context).
   */
  function isWhitelisted(word) {
    return WHITELIST.has(word.toLowerCase());
  }

  /**
   * Check input text against the filter.
   * @param {string} text - Raw player input
   * @returns {{ blocked: boolean, reason: string|null, clean: string }}
   */
  function check(text) {
    if (!text || typeof text !== 'string') {
      return { blocked: false, reason: null, clean: '' };
    }

    const normalized = normalize(text);
    const words = normalized.split(/\s+/);

    // Phase 1: Exact word match
    for (const word of words) {
      if (isWhitelisted(word)) continue;
      if (BLOCKED_EXACT.has(word)) {
        return {
          blocked: true,
          reason: 'prohibited language',
          clean: censor(text, word)
        };
      }
    }

    // Phase 2: Multi-word exact phrases
    for (const phrase of BLOCKED_EXACT) {
      if (phrase.includes(' ') && normalized.includes(phrase)) {
        return {
          blocked: true,
          reason: 'prohibited language',
          clean: censor(text, phrase)
        };
      }
    }

    // Phase 3: Pattern matching (catches leet-speak)
    const deleeted = deleet(normalized);
    for (const pattern of BLOCKED_PATTERNS) {
      const match = deleeted.match(pattern);
      if (match && !isWhitelisted(match[0])) {
        return {
          blocked: true,
          reason: 'prohibited language (obfuscated)',
          clean: censor(text, match[0])
        };
      }
    }

    return { blocked: false, reason: null, clean: text };
  }

  /**
   * Replace a matched word/phrase with asterisks in the original text.
   */
  function censor(original, matched) {
    const regex = new RegExp(escapeRegex(matched), 'gi');
    return original.replace(regex, '*'.repeat(matched.length));
  }

  /** Escape special regex characters in a string. */
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Sanitize text by replacing all blocked content with asterisks.
   * Unlike check(), this always returns a usable string.
   * @param {string} text - Raw player input
   * @returns {string} Sanitized text
   */
  function sanitize(text) {
    if (!text || typeof text !== 'string') return '';

    let result = text;
    const normalized = normalize(text);
    const words = normalized.split(/\s+/);

    // Replace exact matches
    for (const word of words) {
      if (isWhitelisted(word)) continue;
      if (BLOCKED_EXACT.has(word)) {
        result = censor(result, word);
      }
    }

    // Replace pattern matches
    const deleeted = deleet(normalize(result));
    for (const pattern of BLOCKED_PATTERNS) {
      const match = deleeted.match(pattern);
      if (match && !isWhitelisted(match[0])) {
        result = censor(result, match[0]);
      }
    }

    return result;
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  window.MudFilter = {
    check,
    sanitize,
    // Expose for server-side extension: add words at runtime
    addBlocked(word) { BLOCKED_EXACT.add(word.toLowerCase()); },
    addWhitelist(word) { WHITELIST.add(word.toLowerCase()); }
  };
})();
