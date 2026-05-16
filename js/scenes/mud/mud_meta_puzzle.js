/**
 * mud_meta_puzzle.js  -  Meta-Puzzle Tracking & Marble Confrontation
 *
 * Tracks the player's discovery of marble passage clues across all zones.
 * When all 11 clues are found, unlocks the final confrontation with the marble.
 *
 * The marble is the final "boss"  -  not a creature, but an entity.
 * The confrontation is a narrative event, not a combat encounter.
 *
 * Exposes window.MudMetaPuzzle for integration.
 */
(() => {
  'use strict';

  /** Total number of meta clues scattered across the world. */
  const TOTAL_CLUES = 11;

  /** Room vnum of the final confrontation. */
  const CONFRONTATION_ROOM = 11099;

  /** All clue IDs that must be discovered. */
  const ALL_CLUE_IDS = [
    'marble_passage_1', 'marble_passage_2', 'marble_passage_3',
    'marble_passage_4', 'marble_passage_5', 'marble_passage_6',
    'marble_passage_7', 'marble_passage_8', 'marble_passage_9',
    'marble_passage_10', 'marble_fragment_11'
  ];

  /**
   * Check if a room contains a meta clue and record discovery.
   * Called when the player enters a room.
   * @param {object} room    - The room data object
   * @param {object} player  - Player state (worldFlags mutated)
   * @returns {Array} Output messages (empty if no clue)
   */
  function checkRoomForClue(room, player) {
    if (!room || !room.meta_clue) return [];
    const clueId = room.meta_clue;

    // Already discovered?
    if (!player.worldFlags) player.worldFlags = {};
    if (!player.worldFlags.meta_clues) player.worldFlags.meta_clues = [];

    if (player.worldFlags.meta_clues.includes(clueId)) return [];

    // Record discovery
    player.worldFlags.meta_clues.push(clueId);
    const found = player.worldFlags.meta_clues.length;

    const output = [
      { type: 'quest', text: '═══ MARBLE TRAIL ═══' },
      { type: 'success', text: `  You sense the marble's passage here. A trace of its energy lingers.` },
      { type: 'info', text: `  Clues discovered: ${found}/${TOTAL_CLUES}` }
    ];

    // Check if all clues found
    if (found >= TOTAL_CLUES) {
      output.push({ type: 'quest', text: '' });
      output.push({ type: 'quest', text: '  *** ALL TRACES FOUND ***' });
      output.push({ type: 'success', text: '  You now know where the marble is. It waits at the heart of everything.' });
      output.push({ type: 'info', text: "  A new path has opened. Type 'go void' from the Edge of the Void." });
      player.worldFlags.marble_confrontation_unlocked = true;
    }

    return output;
  }

  /**
   * Get the current clue progress for display.
   * @param {object} player - Player state
   * @returns {{ found: number, total: number, missing: Array }}
   */
  function getProgress(player) {
    const found = player.worldFlags?.meta_clues || [];
    const missing = ALL_CLUE_IDS.filter(id => !found.includes(id));
    return { found: found.length, total: TOTAL_CLUES, missing };
  }

  /**
   * Check if the player can enter the confrontation room.
   * @param {object} player - Player state
   * @returns {boolean}
   */
  function canConfront(player) {
    return player.worldFlags?.marble_confrontation_unlocked === true;
  }

  /**
   * Execute the marble confrontation  -  the final narrative event.
   * Returns a sequence of messages that form the ending.
   * @param {object} player - Player state
   * @returns {Array} Output messages
   */
  function executeConfrontation(player) {
    if (player.worldFlags?.marble_acquired) {
      return [{ type: 'info', text: 'The marble rests in your inventory. The journey is complete.' }];
    }

    player.worldFlags.marble_acquired = true;
    player.worldFlags.game_complete = true;

    return [
      { type: 'quest', text: '═══════════════════════════════════════' },
      { type: 'quest', text: '         THE MARBLE' },
      { type: 'quest', text: '═══════════════════════════════════════' },
      { type: 'info', text: '' },
      { type: 'info', text: 'It floats before you. Small enough to hold in one hand.' },
      { type: 'info', text: 'Dense enough to punch through wizard towers.' },
      { type: 'info', text: 'Aware enough to have led you here.' },
      { type: 'info', text: '' },
      { type: 'info', text: 'You reach out.' },
      { type: 'info', text: '' },
      { type: 'info', text: 'It does not flee. It does not fight.' },
      { type: 'info', text: 'It simply... allows itself to be held.' },
      { type: 'info', text: '' },
      { type: 'info', text: 'The weight of it is impossible. The weight of it is nothing.' },
      { type: 'info', text: 'It is exactly what you remember from before the tunnel.' },
      { type: 'info', text: '' },
      { type: 'success', text: 'You have acquired the marble.' },
      { type: 'quest', text: '' },
      { type: 'quest', text: '═══ CONGRATULATIONS ═══' },
      { type: 'quest', text: 'You have completed the meta-puzzle.' },
      { type: 'info', text: 'The world remains. There are still things to find.' },
      { type: 'info', text: 'But the marble is yours now. It always was.' }
    ];
  }

  /**
   * One-time marble sighting messages per clue room.
   * Each fires only on the player's FIRST visit to that room, before the
   * clue discovery message. Uses worldFlags.marble_seen_<vnum> to track.
   */
  const MARBLE_SIGHTINGS = {
    1050: 'Something small and luminous rolls across the tower floor and vanishes over the edge.',
    2030: 'A flash of light catches your eye - something round ricochets off the junkyard gate and disappears into the scrap.',
    3025: 'For an instant, you see it - a perfect sphere skipping across the water before sinking without a ripple.',
    4030: 'A glint of impossible light arcs over the bunker wall. By the time you look up, it is gone.',
    5030: 'The gravity well pulses once. At its center, something round and bright winks out of existence.',
    6030: 'A sphere of light rolls down the chapel aisle and passes through the far wall as if it were not there.',
    7015: 'In the darkness of the chamber, something perfectly round catches the faintest light - then it is swallowed by shadow.',
    8014: 'A target downrange shatters. You glimpse something small and round embedded in the wall before it dissolves.',
    9015: 'The pool ripples. For one heartbeat, you see a marble resting at the bottom. Then the water goes still and it is gone.',
    10012: 'The obelisk cracks further. Through the gap, you see a sphere of pure light roll away into the void.',
    10097: 'The chamber hums. A marble-sized point of light hovers at eye level for a single breath, then blinks away.'
  };

  /**
   * Check if a marble sighting should fire for this room.
   * Only triggers once per room, only in meta-clue rooms.
   * @param {object} room   - Room data
   * @param {object} player - Player state (worldFlags mutated)
   * @returns {Array} Output messages (empty if no sighting or already seen)
   */
  function checkMarbleSighting(room, player) {
    if (!room || !room.meta_clue) return [];
    const vnum = room.vnum || 0;
    const sightingText = MARBLE_SIGHTINGS[vnum];
    if (!sightingText) return [];

    if (!player.worldFlags) player.worldFlags = {};
    const flag = `marble_seen_${vnum}`;
    if (player.worldFlags[flag]) return [];

    // Mark as seen - this will never fire again
    player.worldFlags[flag] = true;

    return [
      { type: 'info', text: '' },
      { type: 'quest', text: sightingText },
      { type: 'info', text: '' }
    ];
  }

  /* ─── Public API ──────────────────────────────────────────────────────────── */

  window.MudMetaPuzzle = {
    TOTAL_CLUES,
    CONFRONTATION_ROOM,
    ALL_CLUE_IDS,
    checkRoomForClue,
    checkMarbleSighting,
    getProgress,
    canConfront,
    executeConfrontation
  };
})();