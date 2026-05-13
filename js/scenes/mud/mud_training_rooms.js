/**
 * mud_training_rooms.js — Training Room System
 *
 * Specific rooms allow passive stat training through exercises.
 * The Sparring Pit (room 17) allows physical training.
 * Training costs Focus, takes time, and has diminishing returns.
 *
 * Exercises:
 *   - 'train attack'  — Improve attack power
 *   - 'train defense' — Improve defense
 *   - 'train focus'   — Improve max focus
 *   - 'train hp'      — Improve max HP
 *
 * Each exercise costs Focus, takes multiple ticks, and has a chance
 * to grant +1 to the stat. Diminishing returns prevent AFK farming.
 *
 * Exposes window.MudTrainingRooms for integration with mud_engine.js.
 */
(() => {
  'use strict';

  const SPARRING_PIT_VNUM = 17;
  const TRAINING_TICK_INTERVAL = 5.0; // seconds per training tick
  const TRAINING_TICKS_PER_SESSION = 4; // ticks to complete one exercise
  const FOCUS_COST_PER_SESSION = 10;

  /** Maximum training sessions before diminishing returns kick in hard. */
  const DIMINISHING_THRESHOLD = 20;

  /** Training exercise definitions. */
  const EXERCISES = {
    attack:  { stat: 'attackPower', name: 'Attack',  flavor: 'You strike the training dummy with increasing force.' },
    defense: { stat: 'defense',     name: 'Defense', flavor: 'You practice blocking and parrying against the construct.' },
    focus:   { stat: 'maxFocus',    name: 'Focus',   flavor: 'You meditate, expanding your mental reserves.' },
    hp:      { stat: 'maxHp',       name: 'HP',      flavor: 'You push your body to its limits, building endurance.' }
  };

  /**
   * Calculate the chance of gaining a stat point from training.
   * Base 60%, reduced by 2% per session past the diminishing threshold.
   * Minimum 10%.
   *
   * @param {number} sessionCount - Total sessions completed today
   * @returns {number} Probability (0.0–1.0)
   */
  function getTrainingChance(sessionCount) {
    const base = 0.60;
    if (sessionCount <= DIMINISHING_THRESHOLD) return base;
    const penalty = (sessionCount - DIMINISHING_THRESHOLD) * 0.02;
    return Math.max(0.10, base - penalty);
  }

  /**
   * Begin a training session.
   * @param {string} statTarget - Which stat to train (attack/defense/focus/hp)
   * @param {object} player - Player state
   * @param {boolean} inCombat - Whether player is in combat
   * @returns {{ success: boolean, output: Array, trainingState: object|null }}
   */
  function beginTraining(statTarget, player, inCombat) {
    if (inCombat) {
      return { success: false, output: [{ type: 'error', text: "You can't train while in combat!" }], trainingState: null };
    }

    if (player.currentRoom !== SPARRING_PIT_VNUM) {
      return { success: false, output: [{ type: 'error', text: 'You must be in the Sparring Pit to train stats.' }], trainingState: null };
    }

    const exercise = EXERCISES[statTarget];
    if (!exercise) {
      const validTargets = Object.keys(EXERCISES).join(', ');
      return {
        success: false,
        output: [
          { type: 'error', text: `Train what? Options: ${validTargets}` },
          { type: 'info', text: "  Usage: train <attack|defense|focus|hp>" }
        ],
        trainingState: null
      };
    }

    if (player.focus < FOCUS_COST_PER_SESSION) {
      return { success: false, output: [{ type: 'error', text: `Not enough focus to train. Need ${FOCUS_COST_PER_SESSION}, have ${player.focus}.` }], trainingState: null };
    }

    // Deduct focus cost
    player.focus -= FOCUS_COST_PER_SESSION;

    return {
      success: true,
      output: [
        { type: 'info', text: exercise.flavor },
        { type: 'info', text: `Training ${exercise.name}... [Focus: ${player.focus}/${player.maxFocus}]` }
      ],
      trainingState: {
        exercise: statTarget,
        ticksRemaining: TRAINING_TICKS_PER_SESSION,
        active: true
      }
    };
  }

  /**
   * Process a training tick. Called each TRAINING_TICK_INTERVAL while training.
   * @param {object} trainingState - Current training state
   * @param {object} player - Player state (mutated on success)
   * @returns {{ done: boolean, output: Array }}
   */
  function tickTraining(trainingState, player) {
    if (!trainingState || !trainingState.active) {
      return { done: true, output: [] };
    }

    trainingState.ticksRemaining -= 1;

    if (trainingState.ticksRemaining > 0) {
      return { done: false, output: [{ type: 'info', text: `  ...training... (${trainingState.ticksRemaining} ticks remaining)` }] };
    }

    // Training complete — roll for stat gain
    const exercise = EXERCISES[trainingState.exercise];
    const sessionCount = player.trainingCounts?.[trainingState.exercise] || 0;
    const chance = getTrainingChance(sessionCount);
    const success = Math.random() < chance;

    // Track session count
    if (!player.trainingCounts) player.trainingCounts = {};
    player.trainingCounts[trainingState.exercise] = sessionCount + 1;

    const output = [];
    if (success) {
      player[exercise.stat] = (player[exercise.stat] || 0) + 1;
      // If we increased maxHp or maxFocus, also heal that amount
      if (exercise.stat === 'maxHp') player.hp = Math.min(player.maxHp, player.hp + 1);
      if (exercise.stat === 'maxFocus') player.focus = Math.min(player.maxFocus, player.focus + 1);

      output.push({ type: 'success', text: `Your ${exercise.name} has improved! (+1, now ${player[exercise.stat]})` });
    } else {
      output.push({ type: 'info', text: `You finish training but don't feel any stronger. Keep at it.` });
    }

    if (sessionCount + 1 >= DIMINISHING_THRESHOLD) {
      output.push({ type: 'info', text: '  (Diminishing returns — consider resting or fighting instead.)' });
    }

    trainingState.active = false;
    return { done: true, output };
  }

  /**
   * Reset daily training counts (called on new day or long rest).
   * @param {object} player - Player state
   */
  function resetTrainingCounts(player) {
    player.trainingCounts = {};
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudTrainingRooms = {
    SPARRING_PIT_VNUM,
    TRAINING_TICK_INTERVAL,
    EXERCISES,
    beginTraining,
    tickTraining,
    resetTrainingCounts
  };
})();
