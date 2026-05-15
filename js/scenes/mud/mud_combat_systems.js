/**
 * mud_combat_systems.js — Combat Enhancement Systems
 *
 * Adds five interlocking combat mechanics:
 *   1. Momentum (0–10 positional advantage tracker)
 *   2. Stances (Aggressive / Balanced / Defensive + spec-specific)
 *   3. Multi-attack (extra hits from abilities, stances, and progression)
 *   4. Exhaustion (locked state when Focus hits 0)
 *   5. Finishing Moves (dramatic kill text on ability kills)
 *
 * Exposes window.MudCombatSystems for integration with mud_engine.js.
 */
(() => {
  'use strict';

  // ─── Momentum System ────────────────────────────────────────────────────
  // Tracks positional advantage in combat (0–10, neutral at 5–6).
  // Shifts on hits/misses/abilities. Affects damage dealt/taken.

  const MOMENTUM_NEUTRAL = 6;
  const MOMENTUM_MIN = 0;
  const MOMENTUM_MAX = 10;

  /** Descriptive labels for momentum thresholds. */
  const MOMENTUM_LABELS = {
    0: 'Knocked down',
    1: 'Off-balance',
    2: 'Off-balance',
    3: 'Stumbling',
    4: 'Stumbling',
    5: 'Neutral',
    6: 'Neutral',
    7: 'Pressing',
    8: 'Pressing',
    9: 'Dominating',
    10: 'Dominating'
  };

  /**
   * Get the damage multiplier from momentum advantage.
   * High momentum = deal more; low momentum = take more.
   */
  function getMomentumDamageMod(momentum) {
    if (momentum >= 9) return 1.25;
    if (momentum >= 7) return 1.10;
    if (momentum <= 2) return 0.75;
    if (momentum <= 4) return 0.90;
    return 1.0;
  }

  /**
   * Shift momentum by a delta, clamped to [0, 10].
   * Returns { newValue, message } — message is null if no threshold crossed.
   */
  function shiftMomentum(current, delta) {
    const prev = current;
    const next = Math.max(MOMENTUM_MIN, Math.min(MOMENTUM_MAX, current + delta));
    let message = null;

    // Only announce when crossing a named threshold
    if (next !== prev) {
      if (next === 10 && prev < 10) message = 'You seize a dominating position!';
      else if (next === 9 && prev < 9) message = 'You press your advantage hard!';
      else if (next === 7 && prev < 7) message = 'You maneuver into a better position.';
      else if (next === 5 && prev !== 5 && prev !== 6) message = 'You regain your footing.';
      else if (next === 3 && prev > 3) message = 'You stumble, losing ground.';
      else if (next === 1 && prev > 1) message = 'You struggle to keep your balance!';
      else if (next === 0) message = 'You are knocked off your feet!';
    }

    return { newValue: next, message };
  }

  /**
   * Natural momentum drift toward neutral (called each combat round).
   * Drifts 1 point toward MOMENTUM_NEUTRAL.
   */
  function driftMomentum(current) {
    if (current > MOMENTUM_NEUTRAL) return shiftMomentum(current, -1);
    if (current < MOMENTUM_NEUTRAL) return shiftMomentum(current, 1);
    return { newValue: current, message: null };
  }

  // ─── Stance System ──────────────────────────────────────────────────────
  // Three universal stances + one unlockable per spec at Tier 2 power.

  const STANCES = {
    balanced:   { name: 'Balanced',   atkMod: 1.0, defMod: 1.0, desc: 'No modifiers. Steady and reliable.' },
    aggressive: { name: 'Aggressive', atkMod: 1.25, defMod: 0.80, desc: '+25% attack, -20% defense.' },
    defensive:  { name: 'Defensive',  atkMod: 0.80, defMod: 1.25, desc: '-20% attack, +25% defense.' }
  };

  /**
   * Spec-specific stances unlocked at Tier 2 (5000 power).
   * Key is the spec ID from mud_abilities.js.
   */
  const SPEC_STANCES = {
    // Fighter anime
    samurai:      { id: 'iaido',       name: 'Iaido',       atkMod: 1.40, defMod: 0.70, desc: '+40% attack, -30% defense. One-strike philosophy.', momentumGain: 1 },
    // Mage anime
    elementalist: { id: 'channeling',  name: 'Channeling',  atkMod: 1.15, defMod: 1.15, desc: '+15% attack and defense. Elemental harmony.', focusRegen: 2 },
    // Rogue anime
    ninja:        { id: 'shadow_form', name: 'Shadow Form', atkMod: 1.30, defMod: 0.90, desc: '+30% attack, -10% defense. Unseen blade.', multiAttackBonus: 1 },
    // Cleric anime
    monk:         { id: 'iron_lotus',  name: 'Iron Lotus',  atkMod: 1.10, defMod: 1.30, desc: '+10% attack, +30% defense. Unbreakable calm.', momentumGain: 1 },
    // Fighter others
    knight:       { id: 'bulwark',     name: 'Bulwark',     atkMod: 0.90, defMod: 1.50, desc: '-10% attack, +50% defense. Immovable wall.', momentumGain: 0 },
    commando:     { id: 'suppression', name: 'Suppression', atkMod: 1.20, defMod: 1.0,  desc: '+20% attack. Lay down fire.', multiAttackBonus: 1 },
    enforcer:     { id: 'brawler',     name: 'Brawler',     atkMod: 1.35, defMod: 0.75, desc: '+35% attack, -25% defense. Street rules.', momentumGain: 1 },
    mechpilot:    { id: 'overdrive',   name: 'Overdrive',   atkMod: 1.30, defMod: 0.85, desc: '+30% attack, -15% defense. Push the machine.', multiAttackBonus: 1 },
    gladiator:    { id: 'showman',     name: 'Showman',     atkMod: 1.20, defMod: 1.10, desc: '+20% attack, +10% defense. Play to the crowd.', momentumGain: 1 },
    // Mage others
    sorcerer:     { id: 'arcane_fury', name: 'Arcane Fury', atkMod: 1.40, defMod: 0.70, desc: '+40% attack, -30% defense. Unleash raw power.', momentumGain: 0 },
    hacker:       { id: 'overclock',   name: 'Overclock',   atkMod: 1.25, defMod: 0.85, desc: '+25% attack, -15% defense. CPU at max.', focusRegen: 1 },
    occultist:    { id: 'blood_pact',  name: 'Blood Pact',  atkMod: 1.35, defMod: 0.80, desc: '+35% attack, -20% defense. Pain is power.', momentumGain: 0 },
    demolitions:  { id: 'mad_bomber',  name: 'Mad Bomber',  atkMod: 1.50, defMod: 0.60, desc: '+50% attack, -40% defense. Reckless ordinance.', momentumGain: 0 },
    oracle:       { id: 'divine_sight',name: 'Divine Sight',atkMod: 1.10, defMod: 1.20, desc: '+10% attack, +20% defense. See the threads of fate.', focusRegen: 2 },
    // Rogue others
    assassin:     { id: 'killing_edge',name: 'Killing Edge',atkMod: 1.45, defMod: 0.65, desc: '+45% attack, -35% defense. One chance, one kill.', momentumGain: 1 },
    cyberthief:   { id: 'ghost_mode',  name: 'Ghost Mode',  atkMod: 1.15, defMod: 1.15, desc: '+15% attack, +15% defense. Off the grid.', focusRegen: 1 },
    detective:    { id: 'cold_read',   name: 'Cold Read',   atkMod: 1.20, defMod: 1.10, desc: '+20% attack, +10% defense. Read them like a book.', momentumGain: 1 },
    infiltrator:  { id: 'ghost_ops',   name: 'Ghost Ops',   atkMod: 1.30, defMod: 0.90, desc: '+30% attack, -10% defense. Surgical precision.', multiAttackBonus: 1 },
    scavenger:    { id: 'scrapper',    name: 'Scrapper',    atkMod: 1.25, defMod: 0.95, desc: '+25% attack, -5% defense. Use what you find.', momentumGain: 0 },
    // Cleric others
    paladin:      { id: 'righteous',   name: 'Righteous',   atkMod: 1.20, defMod: 1.20, desc: '+20% attack, +20% defense. Holy conviction.', momentumGain: 0 },
    fieldmedic:   { id: 'triage',      name: 'Triage',      atkMod: 0.85, defMod: 1.40, desc: '-15% attack, +40% defense. Keep everyone alive.', focusRegen: 2 },
    grifter:      { id: 'con_artist',  name: 'Con Artist',  atkMod: 1.20, defMod: 1.0,  desc: '+20% attack. Misdirection is key.', momentumGain: 1 },
    combatmedic:  { id: 'field_surge', name: 'Field Surge', atkMod: 1.10, defMod: 1.10, desc: '+10% attack, +10% defense. Adrenaline and training.', focusRegen: 1 },
    priest:       { id: 'zealot',      name: 'Zealot',      atkMod: 1.30, defMod: 0.90, desc: '+30% attack, -10% defense. Righteous fury.', momentumGain: 0 }
  };

  /**
   * Get all available stances for a player given their spec and power.
   * Returns array of stance objects with id and metadata.
   */
  function getAvailableStances(specId, power) {
    const stances = [
      { id: 'balanced', ...STANCES.balanced },
      { id: 'aggressive', ...STANCES.aggressive },
      { id: 'defensive', ...STANCES.defensive }
    ];

    // Spec stance unlocks at Tier 2 (5000 power)
    const specStance = SPEC_STANCES[specId];
    if (specStance && power >= 5000) {
      stances.push(specStance);
    }

    return stances;
  }

  // ─── Multi-Attack System ────────────────────────────────────────────────
  // Extra attacks per round based on stance bonuses, ability effects, and power.
  // Base is always 1 attack. Bonuses stack additively.

  /**
   * Calculate total attacks per round.
   * @param {object} opts - { power, stanceId, specId, hasMultiAttackTraining }
   * @returns {number} Total attacks this round (1–4).
   */
  function calcAttacksPerRound(opts) {
    const { power, stanceId, specId, hasMultiAttackTraining } = opts;
    let attacks = 1;

    // Stance bonus (some stances grant +1 attack)
    const specStance = SPEC_STANCES[specId];
    if (specStance && stanceId === specStance.id && specStance.multiAttackBonus) {
      attacks += specStance.multiAttackBonus;
    }

    // Training bonus (learned via training rooms at high power)
    if (hasMultiAttackTraining && power >= 5000) attacks += 1;

    // Power progression bonus (very late game)
    if (power >= 50000) attacks += 1;

    return Math.min(attacks, 4); // Cap at 4
  }

  // ─── Exhaustion System ──────────────────────────────────────────────────
  // When Focus reaches 0, player enters Exhausted state.
  // While exhausted: cannot use abilities, -30% attack, -30% defense.
  // Clears when Focus regenerates above 25% of max.

  const EXHAUSTION_THRESHOLD = 0;
  const EXHAUSTION_RECOVERY_PERCENT = 0.25;
  const EXHAUSTION_ATK_PENALTY = 0.70;
  const EXHAUSTION_DEF_PENALTY = 0.70;

  /**
   * Check if player should become exhausted.
   * @param {number} focus - Current focus
   * @returns {boolean}
   */
  function shouldExhaust(focus) {
    return focus <= EXHAUSTION_THRESHOLD;
  }

  /**
   * Check if player recovers from exhaustion.
   * @param {number} focus - Current focus
   * @param {number} maxFocus - Maximum focus
   * @returns {boolean}
   */
  function shouldRecoverExhaustion(focus, maxFocus) {
    return focus >= Math.floor(maxFocus * EXHAUSTION_RECOVERY_PERCENT);
  }

  // ─── Finishing Moves ────────────────────────────────────────────────────
  // When an ability kills a mob, show dramatic text instead of generic death.

  /** Finishing move templates by ability type. */
  const FINISHING_TEMPLATES = {
    attack: [
      'With a devastating {ability}, you obliterate {mob}!',
      'Your {ability} tears through {mob} - nothing remains!',
      '{mob} crumbles under the force of your {ability}!',
      'A perfect {ability} ends {mob} in a flash of brilliance!',
      'The final {ability} connects - {mob} is no more!'
    ],
    heal: [
      'As you recover, {mob} collapses from accumulated wounds!',
      '{mob} falls as your renewed strength overwhelms them!'
    ],
    buff: [
      'Empowered, you strike down {mob} with overwhelming force!',
      'Your enhanced state proves too much - {mob} is finished!'
    ],
    debuff: [
      'Weakened beyond recovery, {mob} collapses!',
      'Your curse takes hold - {mob} falls lifeless!'
    ]
  };

  /**
   * Generate a finishing move message for an ability kill.
   * @param {string} abilityName - Name of the ability used
   * @param {string} mobName - Name of the defeated mob
   * @param {string} abilityType - Type of ability (attack/heal/buff/debuff)
   * @returns {string} Dramatic kill message
   */
  function getFinishingMove(abilityName, mobName, abilityType) {
    const templates = FINISHING_TEMPLATES[abilityType] || FINISHING_TEMPLATES.attack;
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('{ability}', abilityName).replace('{mob}', mobName);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudCombatSystems = {
    // Momentum
    MOMENTUM_NEUTRAL,
    MOMENTUM_LABELS,
    getMomentumDamageMod,
    shiftMomentum,
    driftMomentum,

    // Stances
    STANCES,
    SPEC_STANCES,
    getAvailableStances,

    // Multi-attack
    calcAttacksPerRound,

    // Exhaustion
    EXHAUSTION_ATK_PENALTY,
    EXHAUSTION_DEF_PENALTY,
    shouldExhaust,
    shouldRecoverExhaustion,

    // Finishing Moves
    getFinishingMove
  };
})();
