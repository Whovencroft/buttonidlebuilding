/**
 * mud_suppress.js — Power Suppression System
 *
 * Players can suppress their power to fight at a handicap. Fighting at
 * reduced power against mobs of similar or greater strength increases
 * Power gain rate. Must be trained/learned before it can be used.
 *
 * Mechanics:
 *   - 'suppress <percent>' sets output power (10–100%)
 *   - While suppressed: ATK and DEF reduced proportionally
 *   - Power gain multiplier increases inversely to suppression level
 *   - Must learn "Power Control" from Training Hall (costs 8 QP, requires 500 power)
 *   - Cannot suppress below 10% (safety floor)
 *
 * Exposes window.MudSuppress for integration with mud_engine.js.
 */
(() => {
  'use strict';

  const SUPPRESS_SKILL_ID = 'power_control';
  const SUPPRESS_MIN_PERCENT = 10;
  const SUPPRESS_DEFAULT = 100;

  /** Power threshold required to learn suppression. */
  const SUPPRESS_LEARN_POWER = 500;
  /** QP cost to learn suppression. */
  const SUPPRESS_LEARN_COST = 8;

  /**
   * Calculate the power gain multiplier from suppression.
   * At 100% power: 1.0x (normal)
   * At 50% power: 1.5x
   * At 25% power: 2.0x
   * At 10% power: 2.5x
   *
   * @param {number} suppressPercent - Current suppression level (10–100)
   * @returns {number} Power gain multiplier
   */
  function getPowerGainMultiplier(suppressPercent) {
    if (suppressPercent >= 100) return 1.0;
    // Inverse relationship: lower power = higher gain
    // Formula: 1.0 + (1.0 - percent/100) * 1.67
    const reduction = 1.0 - (suppressPercent / 100);
    return 1.0 + (reduction * 1.67);
  }

  /**
   * Calculate effective attack at current suppression level.
   * @param {number} baseAttack - Player's full attack power
   * @param {number} suppressPercent - Current suppression (10–100)
   * @returns {number} Effective attack
   */
  function getEffectiveAttack(baseAttack, suppressPercent) {
    return Math.max(1, Math.floor(baseAttack * (suppressPercent / 100)));
  }

  /**
   * Calculate effective defense at current suppression level.
   * @param {number} baseDefense - Player's full defense
   * @param {number} suppressPercent - Current suppression (10–100)
   * @returns {number} Effective defense
   */
  function getEffectiveDefense(baseDefense, suppressPercent) {
    return Math.max(0, Math.floor(baseDefense * (suppressPercent / 100)));
  }

  /**
   * Execute the 'suppress' command.
   * @param {string} target - The argument (a number 10–100, or 'off'/'release')
   * @param {object} player - Player state
   * @returns {{ output: Array, newPercent: number }}
   */
  function doSuppress(target, player) {
    // Check if player has learned the skill
    if (!player.learnedSkills || !player.learnedSkills.includes(SUPPRESS_SKILL_ID)) {
      return {
        output: [{ type: 'error', text: "You haven't learned Power Control yet. Train at the Training Hall." }],
        newPercent: player.suppressPercent || SUPPRESS_DEFAULT
      };
    }

    if (!target || target === 'off' || target === 'release' || target === '100') {
      return {
        output: [{ type: 'success', text: 'You release your suppression. Full power restored.' }],
        newPercent: SUPPRESS_DEFAULT
      };
    }

    const percent = parseInt(target, 10);
    if (isNaN(percent) || percent < SUPPRESS_MIN_PERCENT || percent > 100) {
      return {
        output: [{ type: 'error', text: `Suppress to what percentage? (${SUPPRESS_MIN_PERCENT}–100, or 'off')` }],
        newPercent: player.suppressPercent || SUPPRESS_DEFAULT
      };
    }

    const multiplier = getPowerGainMultiplier(percent);
    const output = [
      { type: 'success', text: `You suppress your power to ${percent}%.` },
      { type: 'info', text: `  Attack and defense reduced proportionally.` },
      { type: 'info', text: `  Power gain rate: ${multiplier.toFixed(1)}x` }
    ];

    if (percent <= 25) {
      output.push({ type: 'combat', text: '  Warning: Fighting at this level is extremely dangerous.' });
    }

    return { output, newPercent: percent };
  }

  /**
   * Get status text for the suppress command in the status display.
   * @param {number} suppressPercent - Current suppression level
   * @returns {string|null} Status text, or null if at full power
   */
  function getStatusText(suppressPercent) {
    if (!suppressPercent || suppressPercent >= 100) return null;
    const mult = getPowerGainMultiplier(suppressPercent);
    return `Suppressed to ${suppressPercent}% (gain: ${mult.toFixed(1)}x)`;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudSuppress = {
    SUPPRESS_SKILL_ID,
    SUPPRESS_LEARN_POWER,
    SUPPRESS_LEARN_COST,
    SUPPRESS_MIN_PERCENT,
    SUPPRESS_DEFAULT,
    getPowerGainMultiplier,
    getEffectiveAttack,
    getEffectiveDefense,
    doSuppress,
    getStatusText
  };
})();
