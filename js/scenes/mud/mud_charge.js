/**
 * mud_charge.js  -  Charge-and-Release System
 *
 * Certain abilities require charging before release. While charging:
 *   - The player is vulnerable (cannot use other abilities)
 *   - Damage scales with charge time (up to 2x at full charge)
 *   - Player can 'release' early for reduced damage
 *   - Player can 'cancel' to abort (wastes the focus cost)
 *   - Getting hit while charging has a chance to interrupt
 *
 * Only applies to flavor-appropriate abilities (beams, energy blasts,
 * high-power spells). Physical attacks, explosives, and bullets are instant.
 *
 * Abilities opt-in via a 'chargeRounds' field in their definition.
 * If chargeRounds is set, the ability uses this system.
 *
 * Exposes window.MudCharge for integration with mud_engine.js.
 */
(() => {
  'use strict';

  /**
   * Ability IDs that use the charge system.
   * These are beam/energy/spell abilities where charging makes thematic sense.
   * Mapped to their required charge rounds for full power.
   */
  const CHARGEABLE_ABILITIES = {
    // Anime specs  -  beam/energy attacks
    spirit_blast:   2,  // Elementalist T0 - ki wave
    dragon_breath:  3,  // Elementalist T2 - draconic fire
    ultimate_form:  2,  // Elementalist T3 - power-up (charge to transform)
    pressure_point: 2,  // Monk T2 - focused strike
    inner_peace:    2,  // Monk T3 - deep meditation
    // Fantasy specs  -  high-power spells
    divine_charge:  2,  // Knight T3 - holy energy
    void_rift:      3,  // Occultist T3 - tear reality
    exorcism:       2,  // Priest T2 - banishment
    miracle:        2,  // Priest T3 - divine intervention
    apocalypse:     3,  // Oracle T3 - end of days
    divine_wrath:   2,  // Oracle T0 - invoke the gods
    // Sci-fi specs  -  energy weapons
    orbital_strike: 3,  // Commando T3 - calling in fire from orbit
    zero_day:       2,  // Hacker T3 - system exploit (digital charge)
    quantum_blade:  2   // Cyber-Thief T3 - quantum energy
  };

  /**
   * Charge phase messages shown each round while charging.
   * Keyed by ability ID; falls back to generic if not found.
   */
  const CHARGE_MESSAGES = {
    spirit_blast:   ['You gather ki energy between your palms...', 'The energy crackles and grows!'],
    dragon_breath:  ['You inhale deeply, heat building in your chest...', 'Flames lick at your lips...', 'Draconic fire surges within you!'],
    ultimate_form:  ['Energy swirls around you...', 'Your aura intensifies!'],
    divine_charge:  ['Holy light gathers at your blade...', 'Radiant energy surges forward!'],
    void_rift:      ['The air tears around your hands...', 'Reality warps and bends...', 'A rift begins to form!'],
    orbital_strike: ['You key the targeting beacon...', 'Satellite lock confirmed...', 'Firing solution computed!'],
    apocalypse:     ['The sky darkens...', 'Thunder rolls in the distance...', 'The end approaches!'],
    _generic:       ['You focus your power...', 'Energy builds...', 'Almost ready!']
  };

  /**
   * Check if an ability uses the charge system.
   * @param {string} abilityId - Ability ID
   * @returns {boolean}
   */
  function isChargeable(abilityId) {
    return abilityId in CHARGEABLE_ABILITIES;
  }

  /**
   * Get the required charge rounds for full power.
   * @param {string} abilityId - Ability ID
   * @returns {number} Rounds required (0 if not chargeable)
   */
  function getChargeRounds(abilityId) {
    return CHARGEABLE_ABILITIES[abilityId] || 0;
  }

  /**
   * Get the charge message for the current round.
   * @param {string} abilityId - Ability ID
   * @param {number} currentRound - Current charge round (0-indexed)
   * @returns {string}
   */
  function getChargeMessage(abilityId, currentRound) {
    const messages = CHARGE_MESSAGES[abilityId] || CHARGE_MESSAGES._generic;
    return messages[Math.min(currentRound, messages.length - 1)];
  }

  /**
   * Calculate damage multiplier based on charge progress.
   * Full charge = 2.0x multiplier on top of ability base.
   * Early release scales linearly from 0.5x to 2.0x.
   *
   * @param {number} chargedRounds - Rounds spent charging
   * @param {number} requiredRounds - Total rounds needed for full charge
   * @returns {number} Multiplier (0.5 to 2.0)
   */
  function getChargeDamageMultiplier(chargedRounds, requiredRounds) {
    if (requiredRounds <= 0) return 1.0;
    const progress = Math.min(chargedRounds / requiredRounds, 1.0);
    // Linear scale from 0.5 (instant release) to 2.0 (full charge)
    return 0.5 + (progress * 1.5);
  }

  /**
   * Check if charging is interrupted by taking damage.
   * 30% base chance, reduced by 10% per proficiency level (min 5%).
   *
   * @param {number} proficiencyLevel - Ability proficiency level (0-10)
   * @returns {boolean} True if interrupted
   */
  function checkChargeInterrupt(proficiencyLevel) {
    const baseChance = 0.30;
    const reduction = proficiencyLevel * 0.025; // -2.5% per level
    const chance = Math.max(0.05, baseChance - reduction);
    return Math.random() < chance;
  }

  /**
   * Begin charging an ability. Returns the initial charge state.
   * @param {string} abilityId - Ability being charged
   * @returns {object} Charge state object
   */
  function beginCharge(abilityId) {
    return {
      abilityId,
      roundsCharged: 0,
      requiredRounds: CHARGEABLE_ABILITIES[abilityId] || 2,
      active: true
    };
  }

  /**
   * Advance charge by one round. Returns message and whether charge is complete.
   * @param {object} chargeState - Current charge state
   * @returns {{ message: string, complete: boolean }}
   */
  function tickCharge(chargeState) {
    chargeState.roundsCharged += 1;
    const message = getChargeMessage(chargeState.abilityId, chargeState.roundsCharged - 1);
    const complete = chargeState.roundsCharged >= chargeState.requiredRounds;
    return { message, complete };
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudCharge = {
    CHARGEABLE_ABILITIES,
    isChargeable,
    getChargeRounds,
    getChargeMessage,
    getChargeDamageMultiplier,
    checkChargeInterrupt,
    beginCharge,
    tickCharge
  };
})();
