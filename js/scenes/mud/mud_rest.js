/**
 * mud_rest.js  -  Rest & Sleep System
 *
 * Provides 'rest' and 'sleep' commands for out-of-combat HP/Focus recovery.
 *   - rest: Moderate regen (5% HP + 10% Focus per tick), can still look/inventory
 *   - sleep: Fast regen (10% HP + 20% Focus per tick), blocks most commands
 *
 * Resting/sleeping is interrupted by combat, movement, or 'wake' command.
 * The Rest Hall (room 14) provides a bonus multiplier to regen.
 *
 * Exposes window.MudRest for integration with mud_engine.js.
 */
(() => {
  'use strict';

  const REST_HALL_VNUM = 14;
  const REST_TICK_INTERVAL = 3.0; // seconds between regen ticks

  /** Regen rates as percent of max per tick. */
  const REGEN_RATES = {
    rest:  { hp: 0.05, focus: 0.10 },
    sleep: { hp: 0.10, focus: 0.20 }
  };

  /** Bonus multiplier when resting in the Rest Hall. */
  const REST_HALL_BONUS = 1.5;

  /** Commands allowed while resting. */
  const REST_ALLOWED = new Set(['look', 'inventory', 'equipment', 'status', 'abilities', 'quest', 'help', 'wake', 'stand', 'notes', 'readnotes']);

  /** Commands allowed while sleeping (very limited). */
  const SLEEP_ALLOWED = new Set(['wake', 'stand', 'help']);

  /**
   * Attempt to begin resting.
   * @param {object} player - Player state
   * @param {boolean} inCombat - Whether player is in combat
   * @returns {{ success: boolean, output: Array, state: string|null }}
   */
  function doRest(player, inCombat) {
    if (inCombat) {
      return { success: false, output: [{ type: 'error', text: "You can't rest while in combat!" }], state: null };
    }
    if (player.restState === 'rest') {
      return { success: false, output: [{ type: 'info', text: 'You are already resting.' }], state: 'rest' };
    }
    if (player.hp >= player.maxHp && player.focus >= player.maxFocus) {
      return { success: false, output: [{ type: 'info', text: 'You are already at full health and focus.' }], state: null };
    }

    const inRestHall = player.currentRoom === REST_HALL_VNUM;
    const output = [];
    if (inRestHall) {
      output.push({ type: 'success', text: 'You settle into a comfortable cot. The Rest Hall soothes your wounds.' });
    } else {
      output.push({ type: 'info', text: 'You sit down and rest.' });
    }
    output.push({ type: 'info', text: "Type 'wake' or 'stand' to get up. Moving or combat will interrupt rest." });

    return { success: true, output, state: 'rest' };
  }

  /**
   * Attempt to begin sleeping.
   * @param {object} player - Player state
   * @param {boolean} inCombat - Whether player is in combat
   * @returns {{ success: boolean, output: Array, state: string|null }}
   */
  function doSleep(player, inCombat) {
    if (inCombat) {
      return { success: false, output: [{ type: 'error', text: "You can't sleep while in combat!" }], state: null };
    }
    if (player.restState === 'sleep') {
      return { success: false, output: [{ type: 'info', text: 'You are already sleeping.' }], state: 'sleep' };
    }
    if (player.hp >= player.maxHp && player.focus >= player.maxFocus) {
      return { success: false, output: [{ type: 'info', text: 'You are already at full health and focus.' }], state: null };
    }

    const inRestHall = player.currentRoom === REST_HALL_VNUM;
    const output = [];
    if (inRestHall) {
      output.push({ type: 'success', text: 'You lie down on a cot and drift into deep sleep. The Rest Hall accelerates your recovery.' });
    } else {
      output.push({ type: 'info', text: 'You lie down and fall asleep.' });
    }
    output.push({ type: 'info', text: "Type 'wake' to get up. Most commands are unavailable while sleeping." });

    return { success: true, output, state: 'sleep' };
  }

  /**
   * Wake up from rest or sleep.
   * @param {string|null} restState - Current rest state
   * @returns {{ output: Array, state: null }}
   */
  function doWake(restState) {
    if (!restState) {
      return { output: [{ type: 'info', text: 'You are already awake.' }], state: null };
    }
    return {
      output: [{ type: 'info', text: restState === 'sleep' ? 'You wake up and stand.' : 'You stand up.' }],
      state: null
    };
  }

  /**
   * Process a regen tick while resting/sleeping.
   * @param {object} player - Player state (mutated in place)
   * @returns {Array|null} Output messages, or null if no regen happened
   */
  function processRegenTick(player) {
    if (!player.restState) return null;

    const rates = REGEN_RATES[player.restState];
    if (!rates) return null;

    const inRestHall = player.currentRoom === REST_HALL_VNUM;
    const bonus = inRestHall ? REST_HALL_BONUS : 1.0;

    const hpGain = Math.max(1, Math.floor(player.maxHp * rates.hp * bonus));
    const focusGain = Math.max(1, Math.floor(player.maxFocus * rates.focus * bonus));

    const prevHp = player.hp;
    const prevFocus = player.focus;

    player.hp = Math.min(player.maxHp, player.hp + hpGain);
    player.focus = Math.min(player.maxFocus, player.focus + focusGain);

    // If already full, auto-wake
    if (player.hp >= player.maxHp && player.focus >= player.maxFocus) {
      player.restState = null;
      return [{ type: 'success', text: `Fully recovered! HP: ${player.hp}/${player.maxHp} | Focus: ${player.focus}/${player.maxFocus}. You stand up.` }];
    }

    // Only show message if something changed
    if (player.hp !== prevHp || player.focus !== prevFocus) {
      return [{ type: 'info', text: `... [HP: ${player.hp}/${player.maxHp} | Focus: ${player.focus}/${player.maxFocus}]` }];
    }

    return null;
  }

  /**
   * Check if a command is allowed in the current rest state.
   * @param {string} verb - The parsed command verb
   * @param {string|null} restState - Current rest state ('rest', 'sleep', or null)
   * @returns {{ allowed: boolean, message: string|null }}
   */
  function isCommandAllowed(verb, restState) {
    if (!restState) return { allowed: true, message: null };

    if (restState === 'sleep') {
      if (SLEEP_ALLOWED.has(verb)) return { allowed: true, message: null };
      return { allowed: false, message: "You are asleep. Type 'wake' to get up first." };
    }

    if (restState === 'rest') {
      if (REST_ALLOWED.has(verb)) return { allowed: true, message: null };
      // Movement and combat interrupt rest automatically
      if (verb === 'go' || verb === 'enter' || verb === 'attack') {
        return { allowed: true, message: null }; // Engine should clear restState
      }
      return { allowed: false, message: "You are resting. Type 'wake' to stand, or just move to get up." };
    }

    return { allowed: true, message: null };
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudRest = {
    REST_TICK_INTERVAL,
    doRest,
    doSleep,
    doWake,
    processRegenTick,
    isCommandAllowed
  };
})();
