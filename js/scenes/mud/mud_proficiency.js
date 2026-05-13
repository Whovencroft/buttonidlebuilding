/**
 * mud_proficiency.js — Ability Proficiency System
 *
 * Abilities improve through use. Each ability tracks a proficiency level (0–10).
 * Higher proficiency grants:
 *   - Reduced cooldown (-1 round at level 5, -2 at level 10)
 *   - Reduced focus cost (-1 at level 3, -2 at level 7)
 *   - Slight damage/heal bonus (+5% per level)
 *
 * Proficiency increases each time the ability is used in combat against
 * a mob of appropriate difficulty. Gains are slower against weak mobs.
 *
 * Exposes window.MudProficiency for integration with mud_engine.js.
 */
(() => {
  'use strict';

  const MAX_PROFICIENCY = 10;

  /**
   * XP required to reach each proficiency level.
   * Progression is roughly: use the ability ~10 times per level early,
   * scaling to ~30 uses per level at high proficiency.
   */
  const XP_PER_LEVEL = [10, 15, 20, 25, 30, 35, 40, 50, 60, 75];

  /**
   * Calculate XP gained from a single ability use.
   * @param {number} mobPower - Creature power of the target
   * @param {number} playerPower - Player's power stat
   * @returns {number} XP gained (0 if mob is too weak)
   */
  function calcProficiencyXP(mobPower, playerPower) {
    if (playerPower <= 0) return 1;
    const ratio = mobPower / playerPower;

    // Too weak — no proficiency gain
    if (ratio < 0.25) return 0;
    // Weak — reduced gain
    if (ratio < 0.75) return 1;
    // Appropriate — standard gain
    if (ratio < 1.5) return 2;
    // Stronger — bonus gain
    return 3;
  }

  /**
   * Apply proficiency XP to an ability and check for level-up.
   * Mutates the proficiency data object in place.
   *
   * @param {object} profData - Player's proficiency data { [abilityId]: { level, xp } }
   * @param {string} abilityId - The ability used
   * @param {number} xpGain - XP to add
   * @returns {{ leveledUp: boolean, newLevel: number, message: string|null }}
   */
  function addProficiencyXP(profData, abilityId, xpGain) {
    if (!profData[abilityId]) {
      profData[abilityId] = { level: 0, xp: 0 };
    }

    const entry = profData[abilityId];
    if (entry.level >= MAX_PROFICIENCY) {
      return { leveledUp: false, newLevel: entry.level, message: null };
    }

    entry.xp += xpGain;
    const needed = XP_PER_LEVEL[entry.level] || 75;

    if (entry.xp >= needed) {
      entry.xp -= needed;
      entry.level += 1;
      const abilityDef = window.MudAbilities?.getAbilityById(abilityId);
      const name = abilityDef?.name || abilityId;
      return {
        leveledUp: true,
        newLevel: entry.level,
        message: `Your ${name} proficiency has increased to level ${entry.level}!`
      };
    }

    return { leveledUp: false, newLevel: entry.level, message: null };
  }

  /**
   * Get the cooldown reduction from proficiency level.
   * @param {number} level - Proficiency level (0–10)
   * @returns {number} Rounds reduced from base cooldown
   */
  function getCooldownReduction(level) {
    if (level >= 10) return 2;
    if (level >= 5) return 1;
    return 0;
  }

  /**
   * Get the focus cost reduction from proficiency level.
   * @param {number} level - Proficiency level (0–10)
   * @returns {number} Focus cost reduction (flat)
   */
  function getFocusCostReduction(level) {
    if (level >= 7) return 2;
    if (level >= 3) return 1;
    return 0;
  }

  /**
   * Get the damage/heal multiplier bonus from proficiency level.
   * @param {number} level - Proficiency level (0–10)
   * @returns {number} Multiplier (e.g., 1.25 at level 5)
   */
  function getDamageBonus(level) {
    return 1.0 + (level * 0.05);
  }

  /**
   * Get the current proficiency level for an ability.
   * @param {object} profData - Player's proficiency data
   * @param {string} abilityId - Ability ID
   * @returns {number} Level (0–10)
   */
  function getLevel(profData, abilityId) {
    return profData[abilityId]?.level || 0;
  }

  /**
   * Get progress toward next level as a fraction string.
   * @param {object} profData - Player's proficiency data
   * @param {string} abilityId - Ability ID
   * @returns {string} e.g., "7/20"
   */
  function getProgressString(profData, abilityId) {
    const entry = profData[abilityId];
    if (!entry) return '0/' + XP_PER_LEVEL[0];
    if (entry.level >= MAX_PROFICIENCY) return 'MAX';
    const needed = XP_PER_LEVEL[entry.level] || 75;
    return `${entry.xp}/${needed}`;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudProficiency = {
    MAX_PROFICIENCY,
    calcProficiencyXP,
    addProficiencyXP,
    getCooldownReduction,
    getFocusCostReduction,
    getDamageBonus,
    getLevel,
    getProgressString
  };
})();
