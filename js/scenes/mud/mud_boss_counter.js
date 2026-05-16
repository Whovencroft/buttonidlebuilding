/**
 * mud_boss_counter.js  -  Boss Counter-Attack System
 *
 * Bosses (mobs flagged as boss: true) periodically telegraph a powerful
 * attack. The player has a 1-round window to use any Tier 2+ ability
 * to "counter" the attack. Successful counters:
 *   - Negate the boss's big hit entirely
 *   - Deal 150% of the ability's normal damage
 *   - Grant +2 momentum
 *
 * Failed counters (no ability used or Tier 0/1 used):
 *   - Boss deals 200% of its normal damage
 *   - Player loses 2 momentum
 *
 * This system is universal  -  any spec's Tier 2+ ability can counter.
 *
 * Exposes window.MudBossCounter for integration with mud_engine.js.
 */
(() => {
  'use strict';

  /** How often a boss telegraphs (every N combat rounds). */
  const TELEGRAPH_INTERVAL_MIN = 4;
  const TELEGRAPH_INTERVAL_MAX = 7;

  /** Damage multiplier on successful counter. */
  const COUNTER_DAMAGE_MOD = 1.5;
  /** Damage multiplier on boss's big hit if player fails to counter. */
  const BOSS_BIG_HIT_MOD = 2.0;
  /** Momentum shift on successful counter. */
  const COUNTER_MOMENTUM_GAIN = 2;
  /** Momentum shift on failed counter. */
  const FAIL_MOMENTUM_LOSS = -2;

  /** Minimum ability tier required to counter. */
  const MIN_COUNTER_TIER = 2;

  /**
   * Telegraph messages by mob type/name (falls back to generic).
   * Keyed by mob vnum or '_generic'.
   */
  const TELEGRAPH_MESSAGES = {
    _generic: [
      '{mob} draws back for a devastating strike!',
      '{mob} gathers power for a massive attack!',
      '{mob} winds up a crushing blow!',
      '{mob} prepares to unleash its full force!'
    ]
  };

  /**
   * Determine if this round should trigger a telegraph.
   * @param {number} roundsSinceLastTelegraph - Rounds since last telegraph
   * @param {boolean} isBoss - Whether the mob is a boss
   * @returns {boolean}
   */
  function shouldTelegraph(roundsSinceLastTelegraph, isBoss) {
    if (!isBoss) return false;
    if (roundsSinceLastTelegraph < TELEGRAPH_INTERVAL_MIN) return false;
    if (roundsSinceLastTelegraph >= TELEGRAPH_INTERVAL_MAX) return true;
    // Random chance between min and max
    const chance = (roundsSinceLastTelegraph - TELEGRAPH_INTERVAL_MIN) /
                   (TELEGRAPH_INTERVAL_MAX - TELEGRAPH_INTERVAL_MIN);
    return Math.random() < chance;
  }

  /**
   * Get the telegraph message for a boss.
   * @param {object} mob - Mob definition
   * @returns {string} Telegraph message
   */
  function getTelegraphMessage(mob) {
    const messages = TELEGRAPH_MESSAGES[mob.vnum] || TELEGRAPH_MESSAGES._generic;
    const template = messages[Math.floor(Math.random() * messages.length)];
    return template.replace('{mob}', mob.name);
  }

  /**
   * Check if a player's ability qualifies as a counter.
   * @param {string} abilityId - Ability used by the player
   * @returns {boolean} True if the ability is Tier 2+
   */
  function isValidCounter(abilityId) {
    const ability = window.MudAbilities?.getAbilityById(abilityId);
    if (!ability) return false;
    return ability.tier >= MIN_COUNTER_TIER;
  }

  /**
   * Resolve a successful counter.
   * @param {object} ability - The ability definition used to counter
   * @param {object} player - Player state
   * @param {object} mob - Boss mob
   * @param {number} baseDamage - Normal ability damage
   * @returns {{ damage: number, output: Array, momentumDelta: number }}
   */
  function resolveCounter(ability, player, mob, baseDamage) {
    const damage = Math.floor(baseDamage * COUNTER_DAMAGE_MOD);
    const output = [
      { type: 'combat', text: `COUNTER! You intercept ${mob.name}'s attack with ${ability.name}!` },
      { type: 'success', text: `Your counter deals ${damage} damage! (${Math.floor(COUNTER_DAMAGE_MOD * 100)}% power)` }
    ];
    return { damage, output, momentumDelta: COUNTER_MOMENTUM_GAIN };
  }

  /**
   * Resolve a failed counter (player didn't use a valid ability).
   * @param {object} mob - Boss mob
   * @param {number} baseMobDamage - Normal mob attack damage
   * @returns {{ damage: number, output: Array, momentumDelta: number }}
   */
  function resolveFail(mob, baseMobDamage) {
    const damage = Math.floor(baseMobDamage * BOSS_BIG_HIT_MOD);
    const output = [
      { type: 'error', text: `${mob.name} unleashes a devastating attack!` },
      { type: 'combat', text: `You take ${damage} damage! (${Math.floor(BOSS_BIG_HIT_MOD * 100)}% power)` }
    ];
    return { damage, output, momentumDelta: FAIL_MOMENTUM_LOSS };
  }

  /**
   * Create the combat state for boss telegraph tracking.
   * @returns {object} Boss counter state
   */
  function createBossCounterState() {
    return {
      roundsSinceLastTelegraph: 0,
      telegraphActive: false,
      telegraphRound: false // True during the response window
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudBossCounter = {
    TELEGRAPH_INTERVAL_MIN,
    TELEGRAPH_INTERVAL_MAX,
    COUNTER_DAMAGE_MOD,
    BOSS_BIG_HIT_MOD,
    MIN_COUNTER_TIER,
    shouldTelegraph,
    getTelegraphMessage,
    isValidCounter,
    resolveCounter,
    resolveFail,
    createBossCounterState
  };
})();
