/**
 * mud_stats.js — Expanded Character Stat System
 *
 * Four core attributes that grow organically through gameplay:
 *   Vigor     — Physical toughness. Affects max HP, HP regen, exhaustion recovery.
 *   Precision — Accuracy and technique. Affects damage variance, crit, cooldown reduction.
 *   Grit      — Resilience and willpower. Affects defense, momentum retention, damage reduction.
 *   Instinct  — Awareness and reaction. Affects dodge, sense range, initiative, multi-attack.
 *
 * Stats grow through USE, not menus:
 *   Vigor     grows from taking damage and surviving combat.
 *   Precision grows from using abilities and landing hits.
 *   Grit      grows from being hit and blocking damage.
 *   Instinct  grows from dodging, sensing, exploring new rooms.
 *
 * Exposes window.MudStats for integration with the engine.
 */
(() => {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────────────

  /** Starting value for all attributes. */
  const BASE_STAT = 1;

  /** Soft cap — growth slows dramatically beyond this. */
  const SOFT_CAP = 100;

  /** Hard cap — cannot exceed. */
  const HARD_CAP = 200;

  /** Base XP needed to gain 1 point in any stat at level 1. */
  const BASE_XP_PER_LEVEL = 25;

  /**
   * XP scaling factor — each level costs more.
   * Cost for level N = BASE_XP_PER_LEVEL * (1 + (N - 1) * SCALING_FACTOR)
   * Beyond soft cap, scaling triples.
   */
  const SCALING_FACTOR = 0.35;

  // ─── Derived Stat Formulas ─────────────────────────────────────────────

  /**
   * Calculate all derived stats from the four core attributes.
   * Returns a flat object of computed values the engine can apply.
   *
   * @param {object} attrs - { vigor, precision, grit, instinct }
   * @param {number} basePower - Player's current power level (for scaling)
   * @returns {object} Derived stat modifiers
   */
  function computeDerived(attrs, basePower) {
    const v = attrs.vigor || BASE_STAT;
    const p = attrs.precision || BASE_STAT;
    const g = attrs.grit || BASE_STAT;
    const i = attrs.instinct || BASE_STAT;

    return {
      // ── Vigor derivatives ──
      /** Bonus max HP: +3 per Vigor point. */
      bonusMaxHp: v * 3,
      /** HP regen per rest tick: base 2 + 0.5 per Vigor (floored). */
      hpRegenPerTick: 2 + Math.floor(v * 0.5),
      /** Exhaustion recovery speed multiplier (1.0 = normal). */
      exhaustionRecoveryMod: 1.0 + (v - 1) * 0.015,
      /** Max Focus bonus: +2 per 5 Vigor + 1 per 10 Instinct. */
      bonusMaxFocus: Math.floor(v / 5) * 2 + Math.floor(i / 10),

      // ── Precision derivatives ──
      /** Damage consistency: reduces random variance. 0 = full variance, 1 = no variance. */
      damageFloor: Math.min(0.85, 0.5 + p * 0.004),
      /** Critical hit chance (0.0 to 0.25 max). */
      critChance: Math.min(0.25, 0.02 + p * 0.0025),
      /** Critical hit damage multiplier. */
      critMultiplier: 1.5 + Math.min(0.5, p * 0.005),
      /** Cooldown reduction: rounds shaved off ability cooldowns (floored). */
      cooldownReduction: Math.floor(p / 25),

      // ── Grit derivatives ──
      /** Flat defense bonus. */
      bonusDefense: Math.floor(g * 1.5),
      /** Momentum loss resistance: chance to resist losing momentum on being hit. */
      momentumResist: Math.min(0.40, g * 0.005),
      /** Damage reduction from hits exceeding 20% of max HP (big-hit shield). */
      bigHitReduction: Math.min(0.30, g * 0.003),
      /** Focus cost reduction (flat). */
      focusCostReduction: Math.floor(g / 20),

      // ── Instinct derivatives ──
      /** Dodge chance (0.0 to 0.20 max). */
      dodgeChance: Math.min(0.20, 0.01 + i * 0.002),
      /** Sense accuracy bonus (higher = more precise power readings). */
      senseAccuracy: Math.min(0.95, 0.3 + i * 0.007),
      /** Initiative bonus: chance to attack first each round. */
      initiativeChance: Math.min(0.50, 0.05 + i * 0.005),
      /** Multi-attack unlock threshold reduction. */
      multiAttackBonus: Math.floor(i / 30),
      /** Invasion warning: chance to get a heads-up before echo attacks. */
      invasionWarning: Math.min(0.60, i * 0.008)
    };
  }

  // ─── Stat Growth ───────────────────────────────────────────────────────

  /**
   * Calculate XP required to reach the next level for a given stat.
   *
   * @param {number} currentLevel - Current stat level
   * @returns {number} XP needed for next level
   */
  function xpForNextLevel(currentLevel) {
    if (currentLevel >= HARD_CAP) return Infinity;
    let scale = SCALING_FACTOR;
    if (currentLevel >= SOFT_CAP) scale *= 3;
    return Math.ceil(BASE_XP_PER_LEVEL * (1 + (currentLevel - 1) * scale));
  }

  /**
   * Award XP to a stat and check for level-up.
   * Returns { leveled: bool, newLevel: number, newXp: number, overflow: number }.
   *
   * @param {number} currentLevel - Current stat level
   * @param {number} currentXp - Current XP toward next level
   * @param {number} xpGain - XP to award
   * @returns {object} Growth result
   */
  function awardStatXp(currentLevel, currentXp, xpGain) {
    if (currentLevel >= HARD_CAP) {
      return { leveled: false, newLevel: currentLevel, newXp: 0, overflow: 0 };
    }
    const needed = xpForNextLevel(currentLevel);
    const total = currentXp + xpGain;
    if (total >= needed) {
      return {
        leveled: true,
        newLevel: Math.min(HARD_CAP, currentLevel + 1),
        newXp: total - needed,
        overflow: Math.max(0, total - needed)
      };
    }
    return { leveled: false, newLevel: currentLevel, newXp: total, overflow: 0 };
  }

  // ─── Growth Event Handlers ─────────────────────────────────────────────
  // Each returns { stat, xp } describing how much XP to award.

  /**
   * Vigor grows when the player takes damage and survives.
   *
   * @param {number} damageTaken - Raw damage taken this hit
   * @param {number} maxHp - Player's max HP
   * @param {number} currentHp - Player's HP after damage
   * @returns {object|null} { stat: 'vigor', xp } or null
   */
  function onDamageTaken(damageTaken, maxHp, currentHp) {
    if (currentHp <= 0) return null; // Died - no growth
    // More XP for bigger hits relative to max HP
    const ratio = Math.min(1.0, damageTaken / Math.max(1, maxHp));
    const xp = Math.max(1, Math.ceil(ratio * 8));
    return { stat: 'vigor', xp };
  }

  /**
   * Precision grows when the player uses an ability successfully.
   *
   * @param {number} abilityTier - Tier of the ability used (0-3)
   * @param {boolean} killedTarget - Whether the ability killed the target
   * @returns {object} { stat: 'precision', xp }
   */
  function onAbilityUsed(abilityTier, killedTarget) {
    const base = 2 + abilityTier * 2;
    const bonus = killedTarget ? 3 : 0;
    return { stat: 'precision', xp: base + bonus };
  }

  /**
   * Precision also grows from landing basic attacks.
   *
   * @returns {object} { stat: 'precision', xp }
   */
  function onBasicAttackLanded() {
    return { stat: 'precision', xp: 1 };
  }

  /**
   * Grit grows when the player is hit (survives the round).
   *
   * @param {number} damageTaken - Damage taken
   * @param {number} defense - Player's effective defense
   * @returns {object} { stat: 'grit', xp }
   */
  function onHitReceived(damageTaken, defense) {
    // More XP if defense mitigated a meaningful portion
    const mitigated = Math.max(0, Math.floor(defense / 2));
    const xp = Math.max(1, 1 + Math.floor(mitigated / 10));
    return { stat: 'grit', xp };
  }

  /**
   * Instinct grows from dodging attacks.
   *
   * @returns {object} { stat: 'instinct', xp }
   */
  function onDodge() {
    return { stat: 'instinct', xp: 4 };
  }

  /**
   * Instinct grows from exploring new rooms.
   *
   * @param {boolean} isNewRoom - Whether this room was never visited before
   * @returns {object|null} { stat: 'instinct', xp } or null
   */
  function onRoomEntered(isNewRoom) {
    if (!isNewRoom) return null;
    return { stat: 'instinct', xp: 3 };
  }

  /**
   * Instinct grows from using the sense command.
   *
   * @returns {object} { stat: 'instinct', xp }
   */
  function onSenseUsed() {
    return { stat: 'instinct', xp: 2 };
  }

  // ─── Stat Application Helpers ──────────────────────────────────────────

  /**
   * Apply a stat growth event to the player's stat data.
   * Returns output messages (level-up notifications) and the updated stats object.
   *
   * @param {object} statData - Player's stat data: { vigor, precision, grit, instinct, xp: { vigor, ... } }
   * @param {object} growth - { stat: string, xp: number }
   * @returns {{ output: Array, statData: object }}
   */
  function applyGrowth(statData, growth) {
    if (!growth || !growth.stat) return { output: [], statData };

    const stat = growth.stat;
    const currentLevel = statData[stat] || BASE_STAT;
    const currentXp = (statData.xp && statData.xp[stat]) || 0;

    const result = awardStatXp(currentLevel, currentXp, growth.xp);
    statData[stat] = result.newLevel;
    if (!statData.xp) statData.xp = {};
    statData.xp[stat] = result.newXp;

    const output = [];
    if (result.leveled) {
      const label = STAT_LABELS[stat] || stat;
      output.push({
        type: 'success',
        text: `Your ${label} has grown to ${result.newLevel}!`
      });
    }

    return { output, statData };
  }

  /** Human-readable stat names. */
  const STAT_LABELS = {
    vigor: 'Vigor',
    precision: 'Precision',
    grit: 'Grit',
    instinct: 'Instinct'
  };

  /**
   * Create default stat data for a new player.
   *
   * @returns {object} Initial stat data
   */
  function createDefaultStats() {
    return {
      vigor: BASE_STAT,
      precision: BASE_STAT,
      grit: BASE_STAT,
      instinct: BASE_STAT,
      xp: { vigor: 0, precision: 0, grit: 0, instinct: 0 }
    };
  }

  /**
   * Format stat data for the status display.
   *
   * @param {object} statData - Player's stat data
   * @param {number} basePower - Player's power level
   * @returns {Array} Output messages for status display
   */
  function formatStatDisplay(statData, basePower) {
    const d = computeDerived(statData, basePower);
    const output = [];

    output.push({ type: 'info', text: '─── Attributes ───' });
    output.push({ type: 'info', text: `  Vigor:     ${statData.vigor || 1}  (${xpProgressBar(statData, 'vigor')})` });
    output.push({ type: 'info', text: `  Precision: ${statData.precision || 1}  (${xpProgressBar(statData, 'precision')})` });
    output.push({ type: 'info', text: `  Grit:      ${statData.grit || 1}  (${xpProgressBar(statData, 'grit')})` });
    output.push({ type: 'info', text: `  Instinct:  ${statData.instinct || 1}  (${xpProgressBar(statData, 'instinct')})` });

    output.push({ type: 'info', text: '─── Derived ───' });
    output.push({ type: 'info', text: `  Crit:  ${(d.critChance * 100).toFixed(1)}%  |  Dodge: ${(d.dodgeChance * 100).toFixed(1)}%` });
    output.push({ type: 'info', text: `  Init:  ${(d.initiativeChance * 100).toFixed(0)}%  |  Dmg Floor: ${(d.damageFloor * 100).toFixed(0)}%` });

    return output;
  }

  /**
   * Generate a small XP progress bar string.
   *
   * @param {object} statData - Player's stat data
   * @param {string} stat - Stat name
   * @returns {string} Progress bar like "████░░░░ 52%"
   */
  function xpProgressBar(statData, stat) {
    const level = statData[stat] || BASE_STAT;
    if (level >= HARD_CAP) return 'MAX';
    const currentXp = (statData.xp && statData.xp[stat]) || 0;
    const needed = xpForNextLevel(level);
    const pct = Math.min(1, currentXp / needed);
    const filled = Math.round(pct * 8);
    const empty = 8 - filled;
    return '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ` ${Math.floor(pct * 100)}%`;
  }

  // ─── Damage Formula Helpers ────────────────────────────────────────────

  /**
   * Apply precision-based damage variance to a raw damage number.
   * Without precision, damage ranges from 50%-100% of base.
   * With max precision, damage ranges from 85%-100% of base.
   *
   * @param {number} baseDmg - Raw calculated damage
   * @param {object} derived - Output of computeDerived()
   * @returns {number} Final damage after variance
   */
  function applyDamageVariance(baseDmg, derived) {
    const floor = derived.damageFloor || 0.5;
    const roll = floor + Math.random() * (1 - floor);
    return Math.max(1, Math.floor(baseDmg * roll));
  }

  /**
   * Roll for a critical hit.
   *
   * @param {object} derived - Output of computeDerived()
   * @returns {{ isCrit: boolean, multiplier: number }}
   */
  function rollCrit(derived) {
    if (Math.random() < (derived.critChance || 0)) {
      return { isCrit: true, multiplier: derived.critMultiplier || 1.5 };
    }
    return { isCrit: false, multiplier: 1.0 };
  }

  /**
   * Roll for a dodge.
   *
   * @param {object} derived - Output of computeDerived()
   * @returns {boolean} True if the attack was dodged
   */
  function rollDodge(derived) {
    return Math.random() < (derived.dodgeChance || 0);
  }

  /**
   * Roll for initiative (player attacks first this round).
   *
   * @param {object} derived - Output of computeDerived()
   * @returns {boolean} True if player acts first
   */
  function rollInitiative(derived) {
    return Math.random() < (derived.initiativeChance || 0.05);
  }

  /**
   * Apply big-hit damage reduction (Grit).
   * Reduces damage from hits that exceed 20% of max HP.
   *
   * @param {number} damage - Incoming damage
   * @param {number} maxHp - Player's max HP
   * @param {object} derived - Output of computeDerived()
   * @returns {number} Reduced damage
   */
  function applyBigHitReduction(damage, maxHp, derived) {
    const threshold = Math.floor(maxHp * 0.2);
    if (damage <= threshold) return damage;
    const excess = damage - threshold;
    const reduced = Math.floor(excess * (1 - (derived.bigHitReduction || 0)));
    return threshold + reduced;
  }

  // ─── Public API ────────────────────────────────────────────────────────

  window.MudStats = {
    // Constants
    BASE_STAT,
    SOFT_CAP,
    HARD_CAP,
    STAT_LABELS,

    // Core
    createDefaultStats,
    computeDerived,
    xpForNextLevel,
    awardStatXp,
    applyGrowth,

    // Growth events
    onDamageTaken,
    onAbilityUsed,
    onBasicAttackLanded,
    onHitReceived,
    onDodge,
    onRoomEntered,
    onSenseUsed,

    // Display
    formatStatDisplay,
    xpProgressBar,

    // Combat helpers
    applyDamageVariance,
    rollCrit,
    rollDodge,
    rollInitiative,
    applyBigHitReduction
  };
})();
