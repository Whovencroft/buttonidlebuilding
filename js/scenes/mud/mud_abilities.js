/**
 * mud_abilities.js  -  Expanded Ability Progression System
 *
 * Each specialization has:
 *   - 8 trainable abilities (tiers 0-3, bought with QP)
 *   - 10 spec-specific glimmers (discovered mid-combat via SaGa-style sparking)
 *   - 5 scaling chain abilities (progressive multi-hit, e.g. Slash → Double Slash → ...)
 *   - 10 cross-class glimmers (learnable by any spec)
 *
 * Glimmer abilities have: glimmer:true, sparkFrom:[], sparkChance
 * Scaling chains have: chainFamily, chainRank (1-5)
 * Cross-class have: crossClass:true, pool:'universal'|'affinity'
 */
(() => {
  'use strict';
  /** Power thresholds for each ability tier (0-3) */
  const POWER_TIERS = [50, 500, 5000, 50000];
  /** QP cost to purchase an ability at each tier */
  const QP_COSTS = [3, 5, 8, 12];
  /** QP cost to change specialization */
  const RESPEC_COST = 30;
  /* ─── Specialization Definitions ───────────────────────────────────────── */
  /* ── FIGHTER SPECS ──────────────────────────────────────────── */
  function knightAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'shield_wall', name: 'Shield Wall', tier: 0, focusCost: 3, type: 'buff', desc: 'Raise your shield. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'holy_strike', name: 'Holy Strike', tier: 0, focusCost: 5, type: 'attack', desc: 'A basic strike infused with holy light. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'rallying_cry', name: 'Rallying Cry', tier: 1, focusCost: 15, type: 'heal', desc: 'Shout to inspire, healing 30% of max HP.', healPercent: 0.3, cooldown: 5 },
      { id: 'divine_charge', name: 'Divine Charge', tier: 1, focusCost: 12, type: 'attack', desc: 'Charge at the enemy with divine force. 250% damage.', multiplier: 2.5, cooldown: 4 },
      { id: 'righteous_verdict', name: 'Righteous Verdict', tier: 2, focusCost: 18, type: 'attack', desc: 'Deliver a heavy blow of justice. 350% damage.', multiplier: 3.5, cooldown: 6 },
      { id: 'aura_of_protection', name: 'Aura of Protection', tier: 2, focusCost: 16, type: 'buff', desc: 'Surround yourself with holy energy. +100% defense for 4 rounds.', duration: 4, defMod: 2.0, cooldown: 7 },
      { id: 'lay_on_hands', name: 'Lay on Hands', tier: 3, focusCost: 28, type: 'heal', desc: 'Channel pure divine energy to heal 80% of max HP.', healPercent: 0.8, cooldown: 8 },
      { id: 'heavens_wrath', name: 'Heaven\'s Wrath', tier: 3, focusCost: 25, type: 'attack', desc: 'Call down the wrath of the heavens. 500% damage.', multiplier: 5.0, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'counter_bash', name: 'Counter Bash', type: 'attack', desc: 'Shield counter. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['shield_wall'], sparkChance: 0.05 },
      { id: 'blinding_smite', name: 'Blinding Smite', type: 'debuff', desc: 'A strike that blinds the enemy. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['holy_strike'], sparkChance: 0.06 },
      { id: 'crusaders_momentum', name: 'Crusader\'s Momentum', type: 'buff', desc: 'Gain momentum after a charge. +50% attack for 3 rounds.', duration: 3, atkMod: 1.5, cooldown: 5, glimmer: true, sparkFrom: ['divine_charge'], sparkChance: 0.05 },
      { id: 'holy_avenger', name: 'Holy Avenger', type: 'attack', desc: 'A devastating counter-attack. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['counter_bash'], sparkChance: 0.04 },
      { id: 'radiant_burst', name: 'Radiant Burst', type: 'attack', desc: 'An explosion of holy light. 400% damage.', multiplier: 4.0, cooldown: 7, glimmer: true, sparkFrom: ['blinding_smite'], sparkChance: 0.04 },
      { id: 'inspiring_presence', name: 'Inspiring Presence', type: 'heal', desc: 'Your presence heals wounds. 50% max HP.', healPercent: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['rallying_cry'], sparkChance: 0.05 },
      { id: 'absolute_bulwark', name: 'Absolute Bulwark', type: 'buff', desc: 'Become an immovable object. +150% defense for 4 rounds.', duration: 4, defMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['aura_of_protection'], sparkChance: 0.04 },
      { id: 'divine_judgment', name: 'Divine Judgment', type: 'attack', desc: 'The ultimate verdict. 450% damage.', multiplier: 4.5, cooldown: 8, glimmer: true, sparkFrom: ['righteous_verdict'], sparkChance: 0.05 },
      { id: 'miraculous_recovery', name: 'Miraculous Recovery', type: 'heal', desc: 'A miracle that fully restores health. 100% max HP.', healPercent: 1.0, cooldown: 10, glimmer: true, sparkFrom: ['lay_on_hands'], sparkChance: 0.03 },
      { id: 'apocalyptic_strike', name: 'Apocalyptic Strike', type: 'attack', desc: 'A strike that ends all things. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['heavens_wrath'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'sword_slash', name: 'Sword Slash', type: 'attack', desc: 'A clean sword strike. 160% damage.', multiplier: 1.6, cooldown: 3, glimmer: true, sparkFrom: ['holy_strike'], sparkChance: 0.06, chainFamily: 'sword_combo', chainRank: 1 },
      { id: 'double_slash', name: 'Double Slash', type: 'attack', desc: 'Two rapid slashes. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['sword_slash'], sparkChance: 0.049999999999999996, chainFamily: 'sword_combo', chainRank: 2 },
      { id: 'triple_slash', name: 'Triple Slash', type: 'attack', desc: 'Three precise cuts in succession. 260% damage.', multiplier: 2.6, cooldown: 5, glimmer: true, sparkFrom: ['double_slash'], sparkChance: 0.039999999999999994, chainFamily: 'sword_combo', chainRank: 3 },
      { id: 'quad_slash', name: 'Quad Slash', type: 'attack', desc: 'Four devastating blows. 340% damage.', multiplier: 3.4, cooldown: 6, glimmer: true, sparkFrom: ['triple_slash'], sparkChance: 0.03, chainFamily: 'sword_combo', chainRank: 4 },
      { id: 'pentastrike', name: 'Pentastrike', type: 'attack', desc: 'Five strikes in the blink of an eye. 450% damage.', multiplier: 4.5, cooldown: 7, glimmer: true, sparkFrom: ['quad_slash'], sparkChance: 0.03, chainFamily: 'sword_combo', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'quick_riposte', name: 'Quick Riposte', type: 'attack', desc: 'Fast counter after blocking. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['shield_wall'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A generic heavy strike. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['holy_strike'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath to heal 40% max HP.', healPercent: 0.4, cooldown: 6, glimmer: true, sparkFrom: ['rallying_cry'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'battle_focus', name: 'Battle Focus', type: 'buff', desc: 'Focus on the battle. +30% attack for 3 rounds.', duration: 3, atkMod: 1.3, cooldown: 5, glimmer: true, sparkFrom: ['aura_of_protection'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'intimidating_shout', name: 'Intimidating Shout', type: 'debuff', desc: 'Shout to intimidate. -30% enemy defense for 3 rounds.', duration: 3, defMod: 0.7, cooldown: 6, glimmer: true, sparkFrom: ['divine_charge'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'swift_thrust', name: 'Swift Thrust', type: 'attack', desc: 'A precise, fast thrust. 200% damage.', multiplier: 2.0, cooldown: 3, glimmer: true, sparkFrom: ['holy_strike'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'precise_parry', name: 'Precise Parry', type: 'buff', desc: 'Parry with precision. +80% defense for 2 rounds.', duration: 2, defMod: 1.8, cooldown: 5, glimmer: true, sparkFrom: ['shield_wall'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'evasive_maneuver', name: 'Evasive Maneuver', type: 'buff', desc: 'Move with rogue-like speed. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 6, glimmer: true, sparkFrom: ['divine_charge'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'vital_strike', name: 'Vital Strike', type: 'attack', desc: 'Strike a vital point. 350% damage.', multiplier: 3.5, cooldown: 5, glimmer: true, sparkFrom: ['righteous_verdict'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'shadow_step_strike', name: 'Shadow Step Strike', type: 'attack', desc: 'Step through shadows to strike. 450% damage.', multiplier: 4.5, cooldown: 7, glimmer: true, sparkFrom: ['heavens_wrath'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function commandoAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'burst_fire', name: 'Burst Fire', tier: 0, focusCost: 5, type: 'attack', desc: 'A quick 3-round burst from your assault rifle.', multiplier: 1.5, cooldown: 3 },
      { id: 'stim_pack', name: 'Stim Pack', tier: 0, focusCost: 8, type: 'heal', desc: 'Inject a rapid-healing stimulant.', healPercent: 0.3, cooldown: 5 },
      { id: 'frag_grenade', name: 'Frag Grenade', tier: 1, focusCost: 12, type: 'attack', desc: 'Toss a fragmentation grenade at the enemy.', multiplier: 2.5, cooldown: 4 },
      { id: 'combat_roll', name: 'Combat Roll', tier: 1, focusCost: 10, type: 'buff', desc: 'Roll into cover, increasing defense.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'plasma_rifle', name: 'Plasma Rifle', tier: 2, focusCost: 18, type: 'attack', desc: 'Fire a searing bolt of superheated plasma.', multiplier: 3.5, cooldown: 6 },
      { id: 'suppressive_fire', name: 'Suppressive Fire', tier: 2, focusCost: 17, type: 'debuff', desc: 'Pin the enemy down, reducing their attack.', duration: 3, atkMod: 0.6, cooldown: 6 },
      { id: 'orbital_strike', name: 'Orbital Strike', tier: 3, focusCost: 25, type: 'attack', desc: 'Call down a devastating laser from orbit.', multiplier: 5.5, cooldown: 10 },
      { id: 'nano_reconstruction', name: 'Nano Reconstruction', tier: 3, focusCost: 28, type: 'heal', desc: 'Deploy nanites to rapidly repair tissue damage.', healPercent: 0.8, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'full_auto', name: 'Full Auto', type: 'attack', desc: 'Unload your entire magazine into the target.', multiplier: 2.8, cooldown: 5, glimmer: true, sparkFrom: ['burst_fire'], sparkChance: 0.08 },
      { id: 'adrenaline_surge', name: 'Adrenaline Surge', type: 'buff', desc: 'The stim pack triggers a massive adrenaline rush.', duration: 3, atkMod: 1.5, cooldown: 6, glimmer: true, sparkFrom: ['stim_pack'], sparkChance: 0.06 },
      { id: 'incendiary_grenade', name: 'Incendiary Grenade', type: 'attack', desc: 'A grenade that engulfs the enemy in white phosphorus.', multiplier: 3.2, cooldown: 5, glimmer: true, sparkFrom: ['frag_grenade'], sparkChance: 0.07 },
      { id: 'tactical_retreat', name: 'Tactical Retreat', type: 'buff', desc: 'Fall back to a superior position.', duration: 2, defMod: 2.0, cooldown: 6, glimmer: true, sparkFrom: ['combat_roll'], sparkChance: 0.05 },
      { id: 'railgun_snipe', name: 'Railgun Snipe', type: 'attack', desc: 'A perfectly aimed hyper-velocity slug.', multiplier: 4.5, cooldown: 7, glimmer: true, sparkFrom: ['plasma_rifle'], sparkChance: 0.06 },
      { id: 'flashbang', name: 'Flashbang', type: 'debuff', desc: 'Blind the enemy, severely reducing their accuracy.', duration: 2, atkMod: 0.4, cooldown: 7, glimmer: true, sparkFrom: ['suppressive_fire'], sparkChance: 0.05 },
      { id: 'danger_close', name: 'Danger Close', type: 'attack', desc: 'Call an orbital strike directly on your position.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['orbital_strike'], sparkChance: 0.04 },
      { id: 'cybernetic_overdrive', name: 'Cybernetic Overdrive', type: 'buff', desc: 'Nanites overcharge your cybernetics.', duration: 4, atkMod: 2.0, cooldown: 8, glimmer: true, sparkFrom: ['nano_reconstruction'], sparkChance: 0.04 },
      { id: 'bullet_storm', name: 'Bullet Storm', type: 'attack', desc: 'An unrelenting hail of gunfire.', multiplier: 4.0, cooldown: 6, glimmer: true, sparkFrom: ['full_auto'], sparkChance: 0.05 },
      { id: 'emp_blast', name: 'EMP Blast', type: 'debuff', desc: 'Disable enemy electronics and shields.', duration: 3, defMod: 0.5, cooldown: 8, glimmer: true, sparkFrom: ['incendiary_grenade'], sparkChance: 0.05 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_tap', name: 'Double Tap', type: 'attack', desc: 'Two precise shots. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['burst_fire'], sparkChance: 0.06, chainFamily: 'burst_chain', chainRank: 1 },
      { id: 'triple_burst', name: 'Triple Burst', type: 'attack', desc: 'Three-round controlled burst. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['double_tap'], sparkChance: 0.049999999999999996, chainFamily: 'burst_chain', chainRank: 2 },
      { id: 'full_auto', name: 'Full Auto', type: 'attack', desc: 'Empty the magazine. 290% damage.', multiplier: 2.9, cooldown: 5, glimmer: true, sparkFrom: ['triple_burst'], sparkChance: 0.039999999999999994, chainFamily: 'burst_chain', chainRank: 3 },
      { id: 'bullet_hell', name: 'Bullet Hell', type: 'attack', desc: 'Suppressive fire tears through everything. 380% damage.', multiplier: 3.8, cooldown: 6, glimmer: true, sparkFrom: ['full_auto'], sparkChance: 0.03, chainFamily: 'burst_chain', chainRank: 4 },
      { id: 'lead_storm', name: 'Lead Storm', type: 'attack', desc: 'An unrelenting torrent of lead. 500% damage.', multiplier: 5.0, cooldown: 8, glimmer: true, sparkFrom: ['bullet_hell'], sparkChance: 0.03, chainFamily: 'burst_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A generic but powerful strike.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['burst_fire', 'plasma_rifle'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath to recover health.', healPercent: 0.4, cooldown: 6, glimmer: true, sparkFrom: ['stim_pack'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'battle_cry', name: 'Battle Cry', type: 'buff', desc: 'Shout to boost your morale and attack.', duration: 3, atkMod: 1.3, cooldown: 5, glimmer: true, sparkFrom: ['combat_roll'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'intimidating_shout', name: 'Intimidating Shout', type: 'debuff', desc: 'Demoralize the enemy.', duration: 3, atkMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['suppressive_fire'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'execution', name: 'Execution', type: 'attack', desc: 'A brutal finishing move.', multiplier: 3.0, cooldown: 7, glimmer: true, sparkFrom: ['orbital_strike'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'quick_draw', name: 'Quick Draw', type: 'attack', desc: 'Draw and fire with blinding speed.', multiplier: 2.2, cooldown: 3, glimmer: true, sparkFrom: ['burst_fire'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'evasive_maneuvers', name: 'Evasive Maneuvers', type: 'buff', desc: 'Dodge incoming attacks with rogue-like agility.', duration: 2, defMod: 1.8, cooldown: 5, glimmer: true, sparkFrom: ['combat_roll'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'pinpoint_accuracy', name: 'Pinpoint Accuracy', type: 'buff', desc: 'Focus your aim for maximum damage.', duration: 3, atkMod: 1.6, cooldown: 6, glimmer: true, sparkFrom: ['plasma_rifle'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'vital_strike', name: 'Vital Strike', type: 'attack', desc: 'Target a critical weak point.', multiplier: 3.8, cooldown: 6, glimmer: true, sparkFrom: ['railgun_snipe'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'phantom_step', name: 'Phantom Step', type: 'buff', desc: 'Move so fast you leave an afterimage.', duration: 2, defMod: 2.5, cooldown: 7, glimmer: true, sparkFrom: ['tactical_retreat'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  function enforcerAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'brass_knuckles', name: 'Brass Knuckles', tier: 0, focusCost: 5, type: 'attack', desc: 'A brutal punch with brass knuckles. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'intimidate', name: 'Intimidate', tier: 0, focusCost: 4, type: 'debuff', desc: 'Glare at the enemy, reducing their attack. -30% attack for 3 rounds.', duration: 3, atkMod: 0.7, cooldown: 5 },
      { id: 'last_stand', name: 'Last Stand', tier: 1, focusCost: 10, type: 'buff', desc: 'Refuse to go down. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 6 },
      { id: 'executioner', name: 'Executioner', tier: 1, focusCost: 12, type: 'attack', desc: 'A ruthless strike meant to finish the job. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'shakedown', name: 'Shakedown', tier: 2, focusCost: 18, type: 'attack', desc: 'Rough up the target. 300% damage.', multiplier: 3.0, cooldown: 6 },
      { id: 'concrete_shoes', name: 'Concrete Shoes', tier: 2, focusCost: 17, type: 'debuff', desc: 'Make them heavy. -50% defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 7 },
      { id: 'tommy_gun_sweep', name: 'Tommy Gun Sweep', tier: 3, focusCost: 25, type: 'attack', desc: 'Spray the area with lead. 450% damage.', multiplier: 4.5, cooldown: 8 },
      { id: 'mob_boss_aura', name: 'Mob Boss Aura', tier: 3, focusCost: 23, type: 'buff', desc: 'Command respect. +100% attack for 4 rounds.', duration: 4, atkMod: 2.0, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'sucker_punch', name: 'Sucker Punch', type: 'attack', desc: 'A dirty hit when they aren\'t looking. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['brass_knuckles'], sparkChance: 0.08 },
      { id: 'jawbreaker', name: 'Jawbreaker', type: 'attack', desc: 'A devastating uppercut. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['sucker_punch'], sparkChance: 0.05 },
      { id: 'stare_down', name: 'Stare Down', type: 'debuff', desc: 'A chilling look that breaks their will. -40% attack for 4 rounds.', duration: 4, atkMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['intimidate'], sparkChance: 0.07 },
      { id: 'breaking_point', name: 'Breaking Point', type: 'debuff', desc: 'Shatter their resolve completely. -60% defense for 4 rounds.', duration: 4, defMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['stare_down'], sparkChance: 0.04 },
      { id: 'vendetta', name: 'Vendetta', type: 'buff', desc: 'Swear revenge. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['last_stand'], sparkChance: 0.06 },
      { id: 'curb_stomp', name: 'Curb Stomp', type: 'attack', desc: 'A vicious stomp on a downed foe. 400% damage.', multiplier: 4.0, cooldown: 7, glimmer: true, sparkFrom: ['executioner'], sparkChance: 0.06 },
      { id: 'sleep_with_the_fishes', name: 'Sleep With The Fishes', type: 'attack', desc: 'The ultimate mafia execution. 600% damage.', multiplier: 6.0, cooldown: 10, glimmer: true, sparkFrom: ['curb_stomp'], sparkChance: 0.03 },
      { id: 'extortion', name: 'Extortion', type: 'attack', desc: 'Squeeze them for everything. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['shakedown'], sparkChance: 0.05 },
      { id: 'dead_weight', name: 'Dead Weight', type: 'debuff', desc: 'They can barely move. -70% attack for 2 rounds.', duration: 2, atkMod: 0.3, cooldown: 8, glimmer: true, sparkFrom: ['concrete_shoes'], sparkChance: 0.04 },
      { id: 'chicago_typewriter', name: 'Chicago Typewriter', type: 'attack', desc: 'Unload the entire drum. 550% damage.', multiplier: 5.5, cooldown: 9, glimmer: true, sparkFrom: ['tommy_gun_sweep'], sparkChance: 0.04 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'one_two_punch', name: 'One-Two Punch', type: 'attack', desc: 'A quick jab-cross. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['brass_knuckles'], sparkChance: 0.06, chainFamily: 'combo_hits', chainRank: 1 },
      { id: 'three_piece_combo', name: 'Three-Piece Combo', type: 'attack', desc: 'Jab, cross, hook - textbook. 229% damage.', multiplier: 2.3, cooldown: 4, glimmer: true, sparkFrom: ['one_two_punch'], sparkChance: 0.049999999999999996, chainFamily: 'combo_hits', chainRank: 2 },
      { id: 'five_hit_flurry', name: 'Five-Hit Flurry', type: 'attack', desc: 'A relentless five-hit barrage. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['three_piece_combo'], sparkChance: 0.039999999999999994, chainFamily: 'combo_hits', chainRank: 3 },
      { id: 'seven_strike_rush', name: 'Seven-Strike Rush', type: 'attack', desc: 'Seven savage strikes, no mercy. 390% damage.', multiplier: 3.9, cooldown: 6, glimmer: true, sparkFrom: ['five_hit_flurry'], sparkChance: 0.03, chainFamily: 'combo_hits', chainRank: 4 },
      { id: 'beatdown', name: 'Beatdown', type: 'attack', desc: 'You don\'t stop hitting until they stop moving. 520% damage.', multiplier: 5.2, cooldown: 8, glimmer: true, sparkFrom: ['seven_strike_rush'], sparkChance: 0.03, chainFamily: 'combo_hits', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'haymaker', name: 'Haymaker', type: 'attack', desc: 'A wild, powerful swing. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['brass_knuckles', 'executioner', 'shakedown', 'tommy_gun_sweep'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'adrenaline_rush', name: 'Adrenaline Rush', type: 'buff', desc: 'Combat high. +40% attack for 3 rounds.', duration: 3, atkMod: 1.4, cooldown: 6, glimmer: true, sparkFrom: ['last_stand', 'mob_boss_aura'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'cheap_shot', name: 'Cheap Shot', type: 'attack', desc: 'A low blow. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['brass_knuckles', 'executioner', 'shakedown', 'tommy_gun_sweep'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'battle_cry', name: 'Battle Cry', type: 'debuff', desc: 'A terrifying shout. -20% defense for 3 rounds.', duration: 3, defMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['intimidate', 'concrete_shoes'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath. Restores 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['last_stand', 'mob_boss_aura'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'switchblade_slash', name: 'Switchblade Slash', type: 'attack', desc: 'A quick, precise cut. 160% damage.', multiplier: 1.6, cooldown: 3, glimmer: true, sparkFrom: ['brass_knuckles', 'executioner', 'shakedown', 'tommy_gun_sweep'], sparkChance: 0.07, crossClass: true, pool: 'affinity' },
      { id: 'shadow_step', name: 'Shadow Step', type: 'buff', desc: 'Move like a ghost. +60% defense for 2 rounds.', duration: 2, defMod: 1.6, cooldown: 5, glimmer: true, sparkFrom: ['last_stand', 'mob_boss_aura'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'kidney_shot', name: 'Kidney Shot', type: 'debuff', desc: 'A painful strike to the vitals. -40% defense for 3 rounds.', duration: 3, defMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['brass_knuckles', 'executioner', 'shakedown', 'tommy_gun_sweep'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'vital_strike', name: 'Vital Strike', type: 'attack', desc: 'Hit them where it hurts. 280% damage.', multiplier: 2.8, cooldown: 5, glimmer: true, sparkFrom: ['brass_knuckles', 'executioner', 'shakedown', 'tommy_gun_sweep'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'evasive_maneuver', name: 'Evasive Maneuver', type: 'buff', desc: 'Dodge incoming attacks. +80% defense for 2 rounds.', duration: 2, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['last_stand', 'mob_boss_aura'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  function mechpilotAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'rocket_punch', name: 'Rocket Punch', tier: 0, focusCost: 5, type: 'attack', desc: 'Fire your mechanical fist at the enemy. 180% damage.', multiplier: 1.8, cooldown: 3 },
      { id: 'armor_mode', name: 'Armor Mode', tier: 0, focusCost: 3, type: 'buff', desc: 'Engage heavy armor plating. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'missile_salvo', name: 'Missile Salvo', tier: 1, focusCost: 12, type: 'attack', desc: 'Unleash a barrage of micro-missiles. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'overdrive', name: 'Overdrive', tier: 1, focusCost: 10, type: 'buff', desc: 'Push the reactor past safe limits. +80% attack for 2 rounds.', duration: 2, atkMod: 1.8, cooldown: 6 },
      { id: 'laser_cannon', name: 'Laser Cannon', tier: 2, focusCost: 18, type: 'attack', desc: 'Fire a concentrated beam of energy. 350% damage.', multiplier: 3.5, cooldown: 7 },
      { id: 'repair_drones', name: 'Repair Drones', tier: 2, focusCost: 21, type: 'heal', desc: 'Deploy drones to patch hull damage. Restores 40% HP.', healPercent: 0.4, cooldown: 6 },
      { id: 'orbital_strike', name: 'Orbital Strike', tier: 3, focusCost: 25, type: 'attack', desc: 'Call down a devastating laser from orbit. 550% damage.', multiplier: 5.5, cooldown: 10 },
      { id: 'core_meltdown', name: 'Core Meltdown', tier: 3, focusCost: 24, type: 'debuff', desc: 'Vent radioactive plasma, melting enemy armor. -60% enemy defense for 3 rounds.', duration: 3, defMod: 0.4, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'plasma_punch', name: 'Plasma Punch', type: 'attack', desc: 'Superheat the rocket fist before impact. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['rocket_punch'], sparkChance: 0.06 },
      { id: 'gigaton_smash', name: 'Gigaton Smash', type: 'attack', desc: 'A devastating downward strike with maximum thrusters. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['plasma_punch'], sparkChance: 0.04 },
      { id: 'reactive_plating', name: 'Reactive Plating', type: 'buff', desc: 'Armor that explodes outward on impact. +100% defense for 2 rounds.', duration: 2, defMod: 2.0, cooldown: 6, glimmer: true, sparkFrom: ['armor_mode'], sparkChance: 0.05 },
      { id: 'cluster_bomb', name: 'Cluster Bomb', type: 'attack', desc: 'Fire a large missile that splits into smaller explosives. 320% damage.', multiplier: 3.2, cooldown: 6, glimmer: true, sparkFrom: ['missile_salvo'], sparkChance: 0.05 },
      { id: 'nuclear_warhead', name: 'Nuclear Warhead', type: 'attack', desc: 'Launch a tactical nuke. 450% damage.', multiplier: 4.5, cooldown: 9, glimmer: true, sparkFrom: ['cluster_bomb'], sparkChance: 0.03 },
      { id: 'hyper_drive', name: 'Hyper Drive', type: 'buff', desc: 'Bypass all safety protocols. +120% attack for 2 rounds.', duration: 2, atkMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['overdrive'], sparkChance: 0.04 },
      { id: 'beam_sweep', name: 'Beam Sweep', type: 'attack', desc: 'Sweep the laser cannon across the battlefield. 400% damage.', multiplier: 4.0, cooldown: 8, glimmer: true, sparkFrom: ['laser_cannon'], sparkChance: 0.05 },
      { id: 'nano_reconstruction', name: 'Nano Reconstruction', type: 'heal', desc: 'Release nanites for rapid structural repair. Restores 70% HP.', healPercent: 0.7, cooldown: 8, glimmer: true, sparkFrom: ['repair_drones'], sparkChance: 0.05 },
      { id: 'emp_blast', name: 'EMP Blast', type: 'debuff', desc: 'Release an electromagnetic pulse. -50% enemy attack for 3 rounds.', duration: 3, atkMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['core_meltdown'], sparkChance: 0.06 },
      { id: 'system_lockdown', name: 'System Lockdown', type: 'debuff', desc: 'Hack enemy systems to disable their weapons. -70% enemy attack for 2 rounds.', duration: 2, atkMod: 0.3, cooldown: 8, glimmer: true, sparkFrom: ['emp_blast'], sparkChance: 0.04 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'twin_rockets', name: 'Twin Rockets', type: 'attack', desc: 'Two rockets from shoulder pods. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['missile_salvo'], sparkChance: 0.06, chainFamily: 'missile_chain', chainRank: 1 },
      { id: 'rocket_barrage', name: 'Rocket Barrage', type: 'attack', desc: 'A rapid salvo of rockets. 240% damage.', multiplier: 2.4, cooldown: 4, glimmer: true, sparkFrom: ['twin_rockets'], sparkChance: 0.049999999999999996, chainFamily: 'missile_chain', chainRank: 2 },
      { id: 'missile_swarm', name: 'Missile Swarm', type: 'attack', desc: 'Dozens of micro-missiles track the target. 310% damage.', multiplier: 3.1, cooldown: 5, glimmer: true, sparkFrom: ['rocket_barrage'], sparkChance: 0.039999999999999994, chainFamily: 'missile_chain', chainRank: 3 },
      { id: 'saturation_fire', name: 'Saturation Fire', type: 'attack', desc: 'Every weapon system fires at once. 400% damage.', multiplier: 4.0, cooldown: 7, glimmer: true, sparkFrom: ['missile_swarm'], sparkChance: 0.03, chainFamily: 'missile_chain', chainRank: 4 },
      { id: 'armageddon_volley', name: 'Armageddon Volley', type: 'attack', desc: 'The sky darkens with ordnance. 530% damage.', multiplier: 5.3, cooldown: 8, glimmer: true, sparkFrom: ['saturation_fire'], sparkChance: 0.03, chainFamily: 'missile_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'power_strike', name: 'Power Strike', type: 'attack', desc: 'A heavy, generic combat blow. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['rocket_punch', 'plasma_punch'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'tactical_guard', name: 'Tactical Guard', type: 'buff', desc: 'A standard defensive stance. +40% defense for 3 rounds.', duration: 3, defMod: 1.4, cooldown: 5, glimmer: true, sparkFrom: ['armor_mode', 'reactive_plating'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'combat_medic', name: 'Combat Medic', type: 'heal', desc: 'Basic field repairs. Restores 30% HP.', healPercent: 0.3, cooldown: 5, glimmer: true, sparkFrom: ['repair_drones'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A crushing generic attack. 280% damage.', multiplier: 2.8, cooldown: 6, glimmer: true, sparkFrom: ['missile_salvo', 'cluster_bomb'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'battle_cry', name: 'Battle Cry', type: 'debuff', desc: 'Intimidate the enemy. -30% enemy defense for 3 rounds.', duration: 3, defMod: 0.7, cooldown: 6, glimmer: true, sparkFrom: ['core_meltdown', 'emp_blast'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'quick_boost', name: 'Quick Boost', type: 'buff', desc: 'Rogue affinity: sudden burst of speed. +60% attack for 2 rounds.', duration: 2, atkMod: 1.6, cooldown: 5, glimmer: true, sparkFrom: ['overdrive'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'precision_laser', name: 'Precision Laser', type: 'attack', desc: 'Rogue affinity: target weak points exactly. 380% damage.', multiplier: 3.8, cooldown: 7, glimmer: true, sparkFrom: ['laser_cannon'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'evasive_maneuver', name: 'Evasive Maneuver', type: 'buff', desc: 'Rogue affinity: dodge incoming fire. +80% defense for 2 rounds.', duration: 2, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['armor_mode'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'weakpoint_targeting', name: 'Weakpoint Targeting', type: 'debuff', desc: 'Rogue affinity: expose enemy flaws. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['core_meltdown'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'rapid_fire', name: 'Rapid Fire', type: 'attack', desc: 'Rogue affinity: a flurry of quick shots. 260% damage.', multiplier: 2.6, cooldown: 4, glimmer: true, sparkFrom: ['missile_salvo'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
    ];
  }
  function samuraiAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'quick_draw', name: 'Quick Draw', tier: 0, focusCost: 5, type: 'attack', desc: 'A lightning-fast unsheathing strike. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'honor_guard', name: 'Honor Guard', tier: 0, focusCost: 3, type: 'buff', desc: 'Assume a defensive stance. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'blade_dance', name: 'Blade Dance', tier: 1, focusCost: 12, type: 'attack', desc: 'A flurry of elegant slashes. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'wind_slash', name: 'Wind Slash', tier: 1, focusCost: 12, type: 'attack', desc: 'A ranged slash that cuts the air. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'spirit_focus', name: 'Spirit Focus', tier: 2, focusCost: 16, type: 'buff', desc: 'Channel your inner ki. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 6 },
      { id: 'cherry_blossom_strike', name: 'Cherry Blossom Strike', tier: 2, focusCost: 18, type: 'attack', desc: 'A beautiful but deadly strike. 350% damage.', multiplier: 3.5, cooldown: 7 },
      { id: 'final_form', name: 'Final Form', tier: 3, focusCost: 25, type: 'attack', desc: 'Awaken your true anime power and strike. 500% damage.', multiplier: 5.0, cooldown: 10 },
      { id: 'thousand_cuts', name: 'Thousand Cuts', tier: 3, focusCost: 25, type: 'attack', desc: 'An imperceptible barrage of slashes. 600% damage.', multiplier: 6.0, cooldown: 12 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'iaijutsu', name: 'Iaijutsu', type: 'attack', desc: 'A perfected quick draw. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['quick_draw'], sparkChance: 0.08 },
      { id: 'void_slash', name: 'Void Slash', type: 'attack', desc: 'A slash that cuts through space. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['iaijutsu'], sparkChance: 0.05 },
      { id: 'phantom_dance', name: 'Phantom Dance', type: 'attack', desc: 'Move so fast you leave afterimages. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['blade_dance'], sparkChance: 0.07 },
      { id: 'tempest_strike', name: 'Tempest Strike', type: 'attack', desc: 'A massive tornado of blades. 400% damage.', multiplier: 4.0, cooldown: 8, glimmer: true, sparkFrom: ['wind_slash'], sparkChance: 0.06 },
      { id: 'ancestral_guard', name: 'Ancestral Guard', type: 'buff', desc: 'Spirits of past samurai protect you. +100% defense for 4 rounds.', duration: 4, defMod: 2.0, cooldown: 7, glimmer: true, sparkFrom: ['honor_guard'], sparkChance: 0.06 },
      { id: 'demon_aura', name: 'Demon Aura', type: 'buff', desc: 'Unleash a terrifying aura. +120% attack for 3 rounds.', duration: 3, atkMod: 2.2, cooldown: 7, glimmer: true, sparkFrom: ['spirit_focus'], sparkChance: 0.05 },
      { id: 'falling_petals', name: 'Falling Petals', type: 'attack', desc: 'A mesmerizing strike that bypasses guard. 450% damage.', multiplier: 4.5, cooldown: 9, glimmer: true, sparkFrom: ['cherry_blossom_strike'], sparkChance: 0.05 },
      { id: 'dimension_break', name: 'Dimension Break', type: 'attack', desc: 'A strike that shatters reality. 550% damage.', multiplier: 5.5, cooldown: 10, glimmer: true, sparkFrom: ['void_slash'], sparkChance: 0.03 },
      { id: 'true_bankai', name: 'True Bankai', type: 'attack', desc: 'The ultimate release of power. 700% damage.', multiplier: 7.0, cooldown: 11, glimmer: true, sparkFrom: ['final_form'], sparkChance: 0.04 },
      { id: 'million_cuts', name: 'Million Cuts', type: 'attack', desc: 'The pinnacle of sword mastery. 800% damage.', multiplier: 8.0, cooldown: 12, glimmer: true, sparkFrom: ['thousand_cuts'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'twin_cut', name: 'Twin Cut', type: 'attack', desc: 'Two cuts drawn from the sheath. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['quick_draw'], sparkChance: 0.06, chainFamily: 'iai_chain', chainRank: 1 },
      { id: 'triple_cut', name: 'Triple Cut', type: 'attack', desc: 'Three flashing arcs of steel. 240% damage.', multiplier: 2.4, cooldown: 4, glimmer: true, sparkFrom: ['twin_cut'], sparkChance: 0.049999999999999996, chainFamily: 'iai_chain', chainRank: 2 },
      { id: 'five_ring_slash', name: 'Five-Ring Slash', type: 'attack', desc: 'Five slashes, one for each element. 320% damage.', multiplier: 3.2, cooldown: 5, glimmer: true, sparkFrom: ['triple_cut'], sparkChance: 0.039999999999999994, chainFamily: 'iai_chain', chainRank: 3 },
      { id: 'seven_fold_slash', name: 'Seven-Fold Slash', type: 'attack', desc: 'Seven strikes faster than the eye can follow. 420% damage.', multiplier: 4.2, cooldown: 7, glimmer: true, sparkFrom: ['five_ring_slash'], sparkChance: 0.03, chainFamily: 'iai_chain', chainRank: 4 },
      { id: 'thousand_blades', name: 'Thousand Blades', type: 'attack', desc: 'The blade becomes a storm of steel. 550% damage.', multiplier: 5.5, cooldown: 8, glimmer: true, sparkFrom: ['seven_fold_slash'], sparkChance: 0.03, chainFamily: 'iai_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A generic powerful strike. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['quick_draw', 'blade_dance', 'wind_slash'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Recover some stamina. Heals 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['honor_guard', 'spirit_focus'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'battle_cry', name: 'Battle Cry', type: 'buff', desc: 'A generic shout to boost morale. +30% attack for 3 rounds.', duration: 3, atkMod: 1.3, cooldown: 5, glimmer: true, sparkFrom: ['honor_guard', 'spirit_focus'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'leg_sweep', name: 'Leg Sweep', type: 'debuff', desc: 'Knock the enemy off balance. -40% enemy defense for 2 rounds.', duration: 2, defMod: 0.6, cooldown: 5, glimmer: true, sparkFrom: ['quick_draw', 'blade_dance'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'wild_swing', name: 'Wild Swing', type: 'attack', desc: 'An unpredictable attack. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['cherry_blossom_strike', 'wind_slash'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'shadow_step', name: 'Shadow Step', type: 'buff', desc: 'Rogue-like speed to evade attacks. +80% defense for 2 rounds.', duration: 2, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['honor_guard', 'spirit_focus'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'vital_strike', name: 'Vital Strike', type: 'attack', desc: 'A precise strike to a weak point. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['quick_draw', 'iaijutsu'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'blinding_dust', name: 'Blinding Dust', type: 'debuff', desc: 'Throw dust in the enemy\'s eyes. -50% enemy attack for 3 rounds.', duration: 3, atkMod: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['wind_slash', 'blade_dance'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'assassins_mark', name: 'Assassin\'s Mark', type: 'debuff', desc: 'Expose the enemy\'s flaws. -60% enemy defense for 3 rounds.', duration: 3, defMod: 0.4, cooldown: 7, glimmer: true, sparkFrom: ['cherry_blossom_strike', 'spirit_focus'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'lethal_injection', name: 'Lethal Injection', type: 'attack', desc: 'A deadly precision attack. 400% damage.', multiplier: 4.0, cooldown: 8, glimmer: true, sparkFrom: ['thousand_cuts', 'phantom_dance'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function gladiatorAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'gladius_thrust', name: 'Gladius Thrust', tier: 0, focusCost: 5, type: 'attack', desc: 'A quick thrust with your short sword. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'crowd_roar', name: 'Crowd Roar', tier: 0, focusCost: 3, type: 'buff', desc: 'Play to the crowd. +20% attack for 3 rounds.', duration: 3, atkMod: 1.2, cooldown: 5 },
      { id: 'net_and_trident', name: 'Net and Trident', tier: 1, focusCost: 11, type: 'debuff', desc: 'Entangle the foe. -30% enemy defense for 3 rounds.', duration: 3, defMod: 0.7, cooldown: 6 },
      { id: 'arena_champion', name: 'Arena Champion', tier: 1, focusCost: 15, type: 'heal', desc: 'Bask in glory to recover health. Heals 30% HP.', healPercent: 0.3, cooldown: 5 },
      { id: 'blood_on_the_sand', name: 'Blood on the Sand', tier: 2, focusCost: 18, type: 'attack', desc: 'A vicious strike meant to entertain. 300% damage.', multiplier: 3.0, cooldown: 6 },
      { id: 'colosseum_glory', name: 'Colosseum Glory', tier: 2, focusCost: 16, type: 'buff', desc: 'Channel the spirit of the arena. +50% attack for 4 rounds.', duration: 4, atkMod: 1.5, cooldown: 7 },
      { id: 'executioners_blow', name: 'Executioner\'s Blow', tier: 3, focusCost: 25, type: 'attack', desc: 'The final strike demanded by the emperor. 500% damage.', multiplier: 5.0, cooldown: 10 },
      { id: 'immortal_victor', name: 'Immortal Victor', tier: 3, focusCost: 28, type: 'heal', desc: 'Refuse to fall before the crowd. Heals 80% HP.', healPercent: 0.8, cooldown: 9 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'brutal_lunge', name: 'Brutal Lunge', type: 'attack', desc: 'A deeper thrust catching the enemy off guard. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['gladius_thrust'], sparkChance: 0.06 },
      { id: 'heart_piercer', name: 'Heart Piercer', type: 'attack', desc: 'A lethal stab to the vitals. 350% damage.', multiplier: 3.5, cooldown: 7, glimmer: true, sparkFrom: ['brutal_lunge'], sparkChance: 0.04 },
      { id: 'emperors_favor', name: 'Emperor\'s Favor', type: 'buff', desc: 'The emperor acknowledges your skill. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['crowd_roar'], sparkChance: 0.05 },
      { id: 'thumbs_down', name: 'Thumbs Down', type: 'debuff', desc: 'The crowd demands death. -50% enemy defense for 2 rounds.', duration: 2, defMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['emperors_favor'], sparkChance: 0.03 },
      { id: 'ensnaring_strike', name: 'Ensnaring Strike', type: 'attack', desc: 'Strike while the enemy is tangled. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['net_and_trident'], sparkChance: 0.07 },
      { id: 'trident_flurry', name: 'Trident Flurry', type: 'attack', desc: 'A rapid series of stabs with the trident. 400% damage.', multiplier: 4.0, cooldown: 8, glimmer: true, sparkFrom: ['ensnaring_strike'], sparkChance: 0.04 },
      { id: 'roar_of_survival', name: 'Roar of Survival', type: 'heal', desc: 'A desperate roar that mends wounds. Heals 50% HP.', healPercent: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['arena_champion'], sparkChance: 0.05 },
      { id: 'sand_blinder', name: 'Sand Blinder', type: 'debuff', desc: 'Kick sand into the enemy\'s eyes. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['blood_on_the_sand'], sparkChance: 0.06 },
      { id: 'gilded_armor', name: 'Gilded Armor', type: 'buff', desc: 'Show off your prize armor. +100% defense for 3 rounds.', duration: 3, defMod: 2.0, cooldown: 7, glimmer: true, sparkFrom: ['colosseum_glory'], sparkChance: 0.04 },
      { id: 'decapitation_strike', name: 'Decapitation Strike', type: 'attack', desc: 'A flawless execution. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['executioners_blow'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_thrust', name: 'Double Thrust', type: 'attack', desc: 'Two quick thrusts of the gladius. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['gladius_thrust'], sparkChance: 0.06, chainFamily: 'arena_chain', chainRank: 1 },
      { id: 'triple_stab', name: 'Triple Stab', type: 'attack', desc: 'Three rapid stabs to the midsection. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['double_thrust'], sparkChance: 0.049999999999999996, chainFamily: 'arena_chain', chainRank: 2 },
      { id: 'gladius_flurry', name: 'Gladius Flurry', type: 'attack', desc: 'A whirlwind of gladius strikes. 290% damage.', multiplier: 2.9, cooldown: 5, glimmer: true, sparkFrom: ['triple_stab'], sparkChance: 0.039999999999999994, chainFamily: 'arena_chain', chainRank: 3 },
      { id: 'arena_frenzy', name: 'Arena Frenzy', type: 'attack', desc: 'The crowd roars as you unleash a savage combo. 380% damage.', multiplier: 3.8, cooldown: 6, glimmer: true, sparkFrom: ['gladius_flurry'], sparkChance: 0.03, chainFamily: 'arena_chain', chainRank: 4 },
      { id: 'crowd_pleaser_chain', name: 'Crowd Pleaser', type: 'attack', desc: 'A spectacular finishing sequence that brings the arena to its feet. 500% damage.', multiplier: 5.0, cooldown: 8, glimmer: true, sparkFrom: ['arena_frenzy'], sparkChance: 0.03, chainFamily: 'arena_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A standard heavy attack. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['gladius_thrust', 'blood_on_the_sand'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath in combat. Heals 25% HP.', healPercent: 0.25, cooldown: 5, glimmer: true, sparkFrom: ['arena_champion', 'immortal_victor'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'battle_cry', name: 'Battle Cry', type: 'buff', desc: 'A generic shout to boost morale. +30% attack for 3 rounds.', duration: 3, atkMod: 1.3, cooldown: 6, glimmer: true, sparkFrom: ['crowd_roar', 'colosseum_glory'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'leg_sweep', name: 'Leg Sweep', type: 'debuff', desc: 'Knock the enemy off balance. -20% enemy defense for 2 rounds.', duration: 2, defMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['net_and_trident'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'pummel', name: 'Pummel', type: 'attack', desc: 'Beat down the opponent. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['heavy_blow'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'precision_strike', name: 'Precision Strike', type: 'attack', desc: 'A rogue-like targeted attack. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['gladius_thrust', 'brutal_lunge'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'evasive_maneuver', name: 'Evasive Maneuver', type: 'buff', desc: 'Nimble footwork to avoid hits. +60% defense for 2 rounds.', duration: 2, defMod: 1.6, cooldown: 6, glimmer: true, sparkFrom: ['crowd_roar', 'colosseum_glory'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'vital_puncture', name: 'Vital Puncture', type: 'debuff', desc: 'Hit a nerve to weaken the foe. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['net_and_trident', 'sand_blinder'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'shadow_step', name: 'Shadow Step', type: 'attack', desc: 'Move like a rogue to strike from behind. 320% damage.', multiplier: 3.2, cooldown: 6, glimmer: true, sparkFrom: ['precision_strike'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
      { id: 'adrenaline_surge', name: 'Adrenaline Surge', type: 'heal', desc: 'A quick burst of rogue-like energy. Heals 40% HP.', healPercent: 0.4, cooldown: 6, glimmer: true, sparkFrom: ['arena_champion', 'roar_of_survival'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
    ];
  }
  /* ── MAGE SPECS ──────────────────────────────────────────── */
  function sorcererAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'fireball', name: 'Fireball', tier: 0, focusCost: 5, type: 'attack', desc: 'Hurl a ball of fire at the enemy. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'arcane_shield', name: 'Arcane Shield', tier: 0, focusCost: 3, type: 'buff', desc: 'Surround yourself with arcane energy. +20% defense for 3 rounds.', duration: 3, defMod: 1.2, cooldown: 5 },
      { id: 'chain_lightning', name: 'Chain Lightning', tier: 1, focusCost: 12, type: 'attack', desc: 'Unleash a bolt of lightning that strikes the enemy. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'mana_drain', name: 'Mana Drain', tier: 1, focusCost: 11, type: 'debuff', desc: 'Siphon the enemy\'s magical essence. -30% attack for 3 rounds.', duration: 3, atkMod: 0.7, cooldown: 6 },
      { id: 'meteor_storm', name: 'Meteor Storm', tier: 2, focusCost: 18, type: 'attack', desc: 'Call down flaming meteors from the sky. 400% damage.', multiplier: 4.0, cooldown: 8 },
      { id: 'time_warp', name: 'Time Warp', tier: 2, focusCost: 16, type: 'buff', desc: 'Bend time to your advantage. +50% attack for 2 rounds.', duration: 2, atkMod: 1.5, cooldown: 7 },
      { id: 'black_hole', name: 'Black Hole', tier: 3, focusCost: 25, type: 'attack', desc: 'Summon a singularity to crush the enemy. 600% damage.', multiplier: 6.0, cooldown: 12 },
      { id: 'arcane_ascension', name: 'Arcane Ascension', tier: 3, focusCost: 23, type: 'buff', desc: 'Become a being of pure magic. +100% attack for 4 rounds.', duration: 4, atkMod: 2.0, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'pyroblast', name: 'Pyroblast', type: 'attack', desc: 'A massive sphere of intense fire. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['fireball'], sparkChance: 0.06 },
      { id: 'inferno', name: 'Inferno', type: 'attack', desc: 'Engulf the enemy in an unquenchable blaze. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['pyroblast'], sparkChance: 0.04 },
      { id: 'prismatic_barrier', name: 'Prismatic Barrier', type: 'buff', desc: 'A shimmering shield of all elements. +50% defense for 4 rounds.', duration: 4, defMod: 1.5, cooldown: 6, glimmer: true, sparkFrom: ['arcane_shield'], sparkChance: 0.05 },
      { id: 'thunder_strike', name: 'Thunder Strike', type: 'attack', desc: 'A concentrated blast of thunderous energy. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['chain_lightning'], sparkChance: 0.05 },
      { id: 'storm_avatar', name: 'Storm Avatar', type: 'buff', desc: 'Embody the fury of the storm. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['thunder_strike'], sparkChance: 0.03 },
      { id: 'mind_shatter', name: 'Mind Shatter', type: 'debuff', desc: 'Fracture the enemy\'s psyche. -50% attack for 4 rounds.', duration: 4, atkMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['mana_drain'], sparkChance: 0.05 },
      { id: 'armageddon', name: 'Armageddon', type: 'attack', desc: 'The ultimate destruction from above. 500% damage.', multiplier: 5.0, cooldown: 10, glimmer: true, sparkFrom: ['meteor_storm'], sparkChance: 0.04 },
      { id: 'chronosphere', name: 'Chronosphere', type: 'debuff', desc: 'Trap the enemy in a time bubble. -60% defense for 3 rounds.', duration: 3, defMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['time_warp'], sparkChance: 0.04 },
      { id: 'event_horizon', name: 'Event Horizon', type: 'attack', desc: 'Tear apart reality itself. 700% damage.', multiplier: 7.0, cooldown: 12, glimmer: true, sparkFrom: ['black_hole'], sparkChance: 0.03 },
      { id: 'god_mind', name: 'God Mind', type: 'buff', desc: 'Achieve omniscience. +150% attack for 3 rounds.', duration: 3, atkMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['arcane_ascension'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'twin_fireball', name: 'Twin Fireball', type: 'attack', desc: 'Two fireballs launched in quick succession. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['fireball'], sparkChance: 0.06, chainFamily: 'fireball_chain', chainRank: 1 },
      { id: 'fireball_barrage', name: 'Fireball Barrage', type: 'attack', desc: 'A rapid volley of fireballs. 240% damage.', multiplier: 2.4, cooldown: 4, glimmer: true, sparkFrom: ['twin_fireball'], sparkChance: 0.049999999999999996, chainFamily: 'fireball_chain', chainRank: 2 },
      { id: 'fire_storm_chain', name: 'Fire Storm', type: 'attack', desc: 'A storm of flame engulfs the area. 310% damage.', multiplier: 3.1, cooldown: 5, glimmer: true, sparkFrom: ['fireball_barrage'], sparkChance: 0.039999999999999994, chainFamily: 'fireball_chain', chainRank: 3 },
      { id: 'inferno_cascade', name: 'Inferno Cascade', type: 'attack', desc: 'Cascading waves of fire consume everything. 400% damage.', multiplier: 4.0, cooldown: 7, glimmer: true, sparkFrom: ['fire_storm_chain'], sparkChance: 0.03, chainFamily: 'fireball_chain', chainRank: 4 },
      { id: 'meteor_swarm_chain', name: 'Meteor Swarm', type: 'attack', desc: 'Meteors rain from the sky. 520% damage.', multiplier: 5.2, cooldown: 8, glimmer: true, sparkFrom: ['inferno_cascade'], sparkChance: 0.03, chainFamily: 'fireball_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'arcane_blast', name: 'Arcane Blast', type: 'attack', desc: 'A quick burst of raw magic. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['fireball', 'chain_lightning', 'meteor_storm', 'black_hole'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'quick_step', name: 'Quick Step', type: 'buff', desc: 'A sudden burst of speed. +30% defense for 2 rounds.', duration: 2, defMod: 1.3, cooldown: 5, glimmer: true, sparkFrom: ['arcane_shield', 'time_warp', 'arcane_ascension'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'disorient', name: 'Disorient', type: 'debuff', desc: 'Confuse the enemy\'s senses. -20% attack for 2 rounds.', duration: 2, atkMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['mana_drain'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'magic_missile', name: 'Magic Missile', type: 'attack', desc: 'Unerring darts of magical force. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['fireball', 'chain_lightning'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'power_surge', name: 'Power Surge', type: 'buff', desc: 'A sudden influx of energy. +40% attack for 2 rounds.', duration: 2, atkMod: 1.4, cooldown: 6, glimmer: true, sparkFrom: ['meteor_storm', 'black_hole'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'spirit_ward', name: 'Spirit Ward', type: 'buff', desc: 'A spiritual barrier that protects the soul. +60% defense for 3 rounds.', duration: 3, defMod: 1.6, cooldown: 6, glimmer: true, sparkFrom: ['arcane_shield'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'soul_leech', name: 'Soul Leech', type: 'heal', desc: 'Drain life force to heal yourself. Restores 30% HP.', healPercent: 0.3, cooldown: 5, glimmer: true, sparkFrom: ['mana_drain'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'divine_haste', name: 'Divine Haste', type: 'buff', desc: 'Channel holy energy to move faster. +70% attack for 2 rounds.', duration: 2, atkMod: 1.7, cooldown: 7, glimmer: true, sparkFrom: ['time_warp'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'holy_nova', name: 'Holy Nova', type: 'attack', desc: 'An explosion of divine light. 450% damage.', multiplier: 4.5, cooldown: 9, glimmer: true, sparkFrom: ['black_hole'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
      { id: 'celestial_grace', name: 'Celestial Grace', type: 'heal', desc: 'Call upon the heavens for restoration. Restores 80% HP.', healPercent: 0.8, cooldown: 8, glimmer: true, sparkFrom: ['arcane_ascension'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function hackerAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'data_spike', name: 'Data Spike', tier: 0, focusCost: 5, type: 'attack', desc: 'Inject malicious code into the target\'s neural port. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'firewall', name: 'Firewall', tier: 0, focusCost: 3, type: 'buff', desc: 'Erect a basic ICE barrier. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'logic_bomb', name: 'Logic Bomb', tier: 1, focusCost: 12, type: 'attack', desc: 'Plant a delayed execution script. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'ping_sweep', name: 'Ping Sweep', tier: 1, focusCost: 11, type: 'debuff', desc: 'Scan for vulnerabilities, reducing target defense. -30% defense for 3 rounds.', duration: 3, defMod: 0.7, cooldown: 6 },
      { id: 'system_crash', name: 'System Crash', tier: 2, focusCost: 18, type: 'attack', desc: 'Overload the target\'s cybernetics. 400% damage.', multiplier: 4.0, cooldown: 8 },
      { id: 'overclock', name: 'Overclock', tier: 2, focusCost: 16, type: 'buff', desc: 'Push your processors beyond safe limits. +100% attack for 2 rounds.', duration: 2, atkMod: 2.0, cooldown: 7 },
      { id: 'neural_burnout', name: 'Neural Burnout', tier: 3, focusCost: 25, type: 'attack', desc: 'Fry the target\'s brain with raw data. 600% damage.', multiplier: 6.0, cooldown: 12 },
      { id: 'root_access', name: 'Root Access', tier: 3, focusCost: 23, type: 'buff', desc: 'Gain ultimate control over the local subnet. +150% attack and defense for 4 rounds.', duration: 4, atkMod: 2.5, defMod: 2.5, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'trojan_horse', name: 'Trojan Horse', type: 'attack', desc: 'Sneak an attack past defenses. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['data_spike'], sparkChance: 0.08 },
      { id: 'zero_day_exploit', name: 'Zero-Day Exploit', type: 'attack', desc: 'Unleash an unknown vulnerability. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['trojan_horse'], sparkChance: 0.05 },
      { id: 'packet_sniffer', name: 'Packet Sniffer', type: 'debuff', desc: 'Intercept target\'s data streams. -50% attack for 3 rounds.', duration: 3, atkMod: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['ping_sweep'], sparkChance: 0.06 },
      { id: 'botnet_swarm', name: 'Botnet Swarm', type: 'attack', desc: 'Coordinate a massive distributed attack. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['logic_bomb'], sparkChance: 0.07 },
      { id: 'ddos_strike', name: 'DDoS Strike', type: 'attack', desc: 'Overwhelm the target with garbage data. 450% damage.', multiplier: 4.5, cooldown: 9, glimmer: true, sparkFrom: ['botnet_swarm'], sparkChance: 0.04 },
      { id: 'proxy_shield', name: 'Proxy Shield', type: 'buff', desc: 'Route damage through dummy servers. +80% defense for 3 rounds.', duration: 3, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['firewall'], sparkChance: 0.07 },
      { id: 'ice_barrier', name: 'ICE Barrier', type: 'buff', desc: 'Deploy military-grade Intrusion Countermeasures. +120% defense for 4 rounds.', duration: 4, defMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['proxy_shield'], sparkChance: 0.04 },
      { id: 'kernel_panic', name: 'Kernel Panic', type: 'attack', desc: 'Force a critical system failure. 500% damage.', multiplier: 5.0, cooldown: 10, glimmer: true, sparkFrom: ['system_crash'], sparkChance: 0.05 },
      { id: 'ghost_in_the_machine', name: 'Ghost in the Machine', type: 'buff', desc: 'Become untraceable in the net. +120% attack for 3 rounds.', duration: 3, atkMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['overclock'], sparkChance: 0.05 },
      { id: 'black_ice', name: 'Black ICE', type: 'attack', desc: 'Lethal defensive countermeasure. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['firewall', 'proxy_shield'], sparkChance: 0.06 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_spike', name: 'Double Spike', type: 'attack', desc: 'Two data spikes in rapid succession. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['data_spike'], sparkChance: 0.06, chainFamily: 'spike_chain', chainRank: 1 },
      { id: 'triple_inject', name: 'Triple Inject', type: 'attack', desc: 'Three injections overwhelm defenses. 229% damage.', multiplier: 2.3, cooldown: 4, glimmer: true, sparkFrom: ['double_spike'], sparkChance: 0.049999999999999996, chainFamily: 'spike_chain', chainRank: 2 },
      { id: 'cascade_exploit', name: 'Cascade Exploit', type: 'attack', desc: 'Exploits cascade through every system. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['triple_inject'], sparkChance: 0.039999999999999994, chainFamily: 'spike_chain', chainRank: 3 },
      { id: 'worm_swarm', name: 'Worm Swarm', type: 'attack', desc: 'Self-replicating worms consume the target. 390% damage.', multiplier: 3.9, cooldown: 6, glimmer: true, sparkFrom: ['cascade_exploit'], sparkChance: 0.03, chainFamily: 'spike_chain', chainRank: 4 },
      { id: 'zero_day_storm', name: 'Zero Day Storm', type: 'attack', desc: 'A storm of zero-day exploits tears through all barriers. 509% damage.', multiplier: 5.1, cooldown: 8, glimmer: true, sparkFrom: ['worm_swarm'], sparkChance: 0.03, chainFamily: 'spike_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'vital_strike', name: 'Vital Strike', type: 'attack', desc: 'A universally effective precision hit. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['data_spike', 'logic_bomb', 'system_crash', 'neural_burnout'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'tactical_retreat', name: 'Tactical Retreat', type: 'buff', desc: 'Fall back to a better position. +40% defense for 2 rounds.', duration: 2, defMod: 1.4, cooldown: 5, glimmer: true, sparkFrom: ['firewall', 'overclock', 'root_access'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath in the heat of battle. Restores 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['firewall', 'overclock', 'root_access'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'crippling_blow', name: 'Crippling Blow', type: 'debuff', desc: 'A strike that hinders the enemy. -20% attack for 2 rounds.', duration: 2, atkMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['data_spike', 'logic_bomb', 'system_crash', 'neural_burnout'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'defensive_stance', name: 'Defensive Stance', type: 'buff', desc: 'Prepare for incoming attacks. +60% defense for 3 rounds.', duration: 3, defMod: 1.6, cooldown: 6, glimmer: true, sparkFrom: ['firewall', 'overclock', 'root_access'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'digital_mantra', name: 'Digital Mantra', type: 'heal', desc: 'Chant binary prayers to restore integrity. Restores 40% HP.', healPercent: 0.4, cooldown: 5, glimmer: true, sparkFrom: ['firewall', 'proxy_shield'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'soul_upload', name: 'Soul Upload', type: 'heal', desc: 'Backup your consciousness to mend wounds. Restores 60% HP.', healPercent: 0.6, cooldown: 8, glimmer: true, sparkFrom: ['overclock', 'ghost_in_the_machine'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'techno_exorcism', name: 'Techno Exorcism', type: 'debuff', desc: 'Purge the target\'s digital spirit. -40% defense for 3 rounds.', duration: 3, defMod: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['ping_sweep', 'packet_sniffer'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'cyber_meditation', name: 'Cyber Meditation', type: 'buff', desc: 'Align your chakras with the mainframe. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['proxy_shield', 'ice_barrier'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'ghost_protocol', name: 'Ghost Protocol', type: 'heal', desc: 'A spiritual reboot of your physical form. Restores 80% HP.', healPercent: 0.8, cooldown: 10, glimmer: true, sparkFrom: ['ghost_in_the_machine'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function occultistAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'hex_bolt', name: 'Hex Bolt', tier: 0, focusCost: 5, type: 'attack', desc: 'A basic bolt of dark energy. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'shadow_ward', name: 'Shadow Ward', tier: 0, focusCost: 3, type: 'buff', desc: 'Cloak yourself in shadows. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'soul_drain', name: 'Soul Drain', tier: 1, focusCost: 12, type: 'attack', desc: 'Drain the enemy\'s life force. 200% damage.', multiplier: 2.0, cooldown: 5 },
      { id: 'eldritch_blast', name: 'Eldritch Blast', tier: 1, focusCost: 12, type: 'attack', desc: 'A powerful blast of otherworldly energy. 250% damage.', multiplier: 2.5, cooldown: 6 },
      { id: 'creeping_dread', name: 'Creeping Dread', tier: 2, focusCost: 17, type: 'debuff', desc: 'Instill deep fear. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 6 },
      { id: 'abyssal_pact', name: 'Abyssal Pact', tier: 2, focusCost: 16, type: 'buff', desc: 'Make a dark pact. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 7 },
      { id: 'void_eruption', name: 'Void Eruption', tier: 3, focusCost: 25, type: 'attack', desc: 'Unleash the void. 400% damage.', multiplier: 4.0, cooldown: 8 },
      { id: 'dark_ritual', name: 'Dark Ritual', tier: 3, focusCost: 28, type: 'heal', desc: 'A forbidden healing ritual. Restores 60% HP.', healPercent: 0.6, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'curse_of_agony', name: 'Curse of Agony', type: 'debuff', desc: 'A lingering curse. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['hex_bolt'], sparkChance: 0.05 },
      { id: 'shadow_mantle', name: 'Shadow Mantle', type: 'buff', desc: 'A thicker cloak of shadows. +80% defense for 4 rounds.', duration: 4, defMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['shadow_ward'], sparkChance: 0.05 },
      { id: 'essence_theft', name: 'Essence Theft', type: 'heal', desc: 'Steal pure essence. Restores 40% HP.', healPercent: 0.4, cooldown: 6, glimmer: true, sparkFrom: ['soul_drain'], sparkChance: 0.06 },
      { id: 'doom_bolt', name: 'Doom Bolt', type: 'attack', desc: 'A bolt of pure doom. 350% damage.', multiplier: 3.5, cooldown: 7, glimmer: true, sparkFrom: ['eldritch_blast'], sparkChance: 0.04 },
      { id: 'mind_shatter', name: 'Mind Shatter', type: 'debuff', desc: 'Shatter the enemy\'s mind. -60% enemy attack for 4 rounds.', duration: 4, atkMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['creeping_dread'], sparkChance: 0.05 },
      { id: 'blood_sacrifice', name: 'Blood Sacrifice', type: 'buff', desc: 'Sacrifice for power. +120% attack for 3 rounds.', duration: 3, atkMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['abyssal_pact'], sparkChance: 0.04 },
      { id: 'black_hole', name: 'Black Hole', type: 'attack', desc: 'Summon a black hole. 550% damage.', multiplier: 5.5, cooldown: 10, glimmer: true, sparkFrom: ['void_eruption'], sparkChance: 0.03 },
      { id: 'soul_harvest', name: 'Soul Harvest', type: 'heal', desc: 'Harvest souls for massive healing. Restores 90% HP.', healPercent: 0.9, cooldown: 10, glimmer: true, sparkFrom: ['dark_ritual'], sparkChance: 0.03 },
      { id: 'creeping_death', name: 'Creeping Death', type: 'debuff', desc: 'The ultimate curse. -70% enemy defense for 4 rounds.', duration: 4, defMod: 0.3, cooldown: 8, glimmer: true, sparkFrom: ['curse_of_agony'], sparkChance: 0.03 },
      { id: 'oblivion_ray', name: 'Oblivion Ray', type: 'attack', desc: 'A ray of pure oblivion. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['doom_bolt'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_hex', name: 'Double Hex', type: 'attack', desc: 'Two hexes strike simultaneously. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['hex_bolt'], sparkChance: 0.06, chainFamily: 'hex_chain', chainRank: 1 },
      { id: 'triple_curse', name: 'Triple Curse', type: 'attack', desc: 'Three curses layer upon the target. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['double_hex'], sparkChance: 0.049999999999999996, chainFamily: 'hex_chain', chainRank: 2 },
      { id: 'hex_storm', name: 'Hex Storm', type: 'attack', desc: 'A storm of dark magic. 290% damage.', multiplier: 2.9, cooldown: 5, glimmer: true, sparkFrom: ['triple_curse'], sparkChance: 0.039999999999999994, chainFamily: 'hex_chain', chainRank: 3 },
      { id: 'curse_cascade', name: 'Curse Cascade', type: 'attack', desc: 'Curses cascade and multiply. 370% damage.', multiplier: 3.7, cooldown: 6, glimmer: true, sparkFrom: ['hex_storm'], sparkChance: 0.03, chainFamily: 'hex_chain', chainRank: 4 },
      { id: 'doom_spiral', name: 'Doom Spiral', type: 'attack', desc: 'An inescapable spiral of doom. 490% damage.', multiplier: 4.9, cooldown: 8, glimmer: true, sparkFrom: ['curse_cascade'], sparkChance: 0.03, chainFamily: 'hex_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'desperate_strike', name: 'Desperate Strike', type: 'attack', desc: 'A wild, desperate attack. 200% damage.', multiplier: 2.0, cooldown: 5, glimmer: true, sparkFrom: ['hex_bolt', 'soul_drain', 'eldritch_blast', 'void_eruption'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'evasive_step', name: 'Evasive Step', type: 'buff', desc: 'A quick dodge. +40% defense for 2 rounds.', duration: 2, defMod: 1.4, cooldown: 5, glimmer: true, sparkFrom: ['shadow_ward', 'abyssal_pact'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath. Restores 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['dark_ritual'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'crippling_blow', name: 'Crippling Blow', type: 'debuff', desc: 'A blow that cripples. -30% enemy attack for 2 rounds.', duration: 2, atkMod: 0.7, cooldown: 5, glimmer: true, sparkFrom: ['creeping_dread'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'power_surge', name: 'Power Surge', type: 'buff', desc: 'A sudden surge of power. +50% attack for 2 rounds.', duration: 2, atkMod: 1.5, cooldown: 6, glimmer: true, sparkFrom: ['shadow_ward', 'abyssal_pact'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'spirit_channel', name: 'Spirit Channel', type: 'buff', desc: 'Channel spiritual energy. +60% defense for 3 rounds.', duration: 3, defMod: 1.6, cooldown: 6, glimmer: true, sparkFrom: ['shadow_ward', 'abyssal_pact'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'soul_mending', name: 'Soul Mending', type: 'heal', desc: 'Mend the soul. Restores 50% HP.', healPercent: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['dark_ritual'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'divine_wrath', name: 'Divine Wrath', type: 'attack', desc: 'Unleash spiritual wrath. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['hex_bolt', 'soul_drain', 'eldritch_blast', 'void_eruption'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'holy_ward', name: 'Holy Ward', type: 'buff', desc: 'A spiritual ward. +70% defense for 3 rounds.', duration: 3, defMod: 1.7, cooldown: 7, glimmer: true, sparkFrom: ['shadow_ward', 'abyssal_pact'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'spiritual_cleanse', name: 'Spiritual Cleanse', type: 'heal', desc: 'Cleanse the spirit. Restores 70% HP.', healPercent: 0.7, cooldown: 8, glimmer: true, sparkFrom: ['dark_ritual'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  function demolitionsAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'pipe_bomb', name: 'Pipe Bomb', tier: 0, focusCost: 5, type: 'attack', desc: 'Toss a crude explosive. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'blast_shield', name: 'Blast Shield', tier: 0, focusCost: 3, type: 'buff', desc: 'Deploy a portable shield. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'c4_charge', name: 'C4 Charge', tier: 1, focusCost: 12, type: 'attack', desc: 'Plant and detonate plastic explosives. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'flashbang', name: 'Flashbang', tier: 1, focusCost: 11, type: 'debuff', desc: 'Blind the enemy. -40% enemy attack for 2 rounds.', duration: 2, atkMod: 0.6, cooldown: 6 },
      { id: 'cluster_grenade', name: 'Cluster Grenade', tier: 2, focusCost: 18, type: 'attack', desc: 'Throw a grenade that splits into smaller explosives. 350% damage.', multiplier: 3.5, cooldown: 7 },
      { id: 'shaped_charge', name: 'Shaped Charge', tier: 2, focusCost: 18, type: 'attack', desc: 'A focused explosion that pierces armor. 400% damage.', multiplier: 4.0, cooldown: 8 },
      { id: 'tactical_nuke', name: 'Tactical Nuke', tier: 3, focusCost: 25, type: 'attack', desc: 'Call in a devastating nuclear strike. 600% damage.', multiplier: 6.0, cooldown: 12 },
      { id: 'bunker_buster', name: 'Bunker Buster', tier: 3, focusCost: 25, type: 'attack', desc: 'A massive earth-penetrating bomb. 550% damage.', multiplier: 5.5, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'shrapnel_burst', name: 'Shrapnel Burst', type: 'attack', desc: 'A pipe bomb explosion that sends deadly shrapnel flying. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['pipe_bomb'], sparkChance: 0.08 },
      { id: 'reactive_armor', name: 'Reactive Armor', type: 'buff', desc: 'Explosive plating that reinforces your shield. +80% defense for 3 rounds.', duration: 3, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['blast_shield'], sparkChance: 0.06 },
      { id: 'remote_detonation', name: 'Remote Detonation', type: 'attack', desc: 'Trigger explosives from a safe distance for maximum impact. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['c4_charge'], sparkChance: 0.07 },
      { id: 'thermite_burn', name: 'Thermite Burn', type: 'debuff', desc: 'Ignite shrapnel to melt enemy armor. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['shrapnel_burst'], sparkChance: 0.05 },
      { id: 'concussion_wave', name: 'Concussion Wave', type: 'debuff', desc: 'A deafening blast that disorients the target. -60% enemy attack for 3 rounds.', duration: 3, atkMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['flashbang'], sparkChance: 0.06 },
      { id: 'carpet_bomb', name: 'Carpet Bomb', type: 'attack', desc: 'A relentless series of cluster explosions. 450% damage.', multiplier: 4.5, cooldown: 9, glimmer: true, sparkFrom: ['cluster_grenade'], sparkChance: 0.05 },
      { id: 'breaching_blast', name: 'Breaching Blast', type: 'attack', desc: 'A perfectly placed shaped charge that obliterates defenses. 500% damage.', multiplier: 5.0, cooldown: 9, glimmer: true, sparkFrom: ['shaped_charge'], sparkChance: 0.04 },
      { id: 'shockwave_pulse', name: 'Shockwave Pulse', type: 'attack', desc: 'Weaponize the concussion wave into pure kinetic force. 380% damage.', multiplier: 3.8, cooldown: 7, glimmer: true, sparkFrom: ['concussion_wave'], sparkChance: 0.04 },
      { id: 'fallout_zone', name: 'Fallout Zone', type: 'debuff', desc: 'Irradiate the area after a nuke. -70% enemy attack and defense for 4 rounds.', duration: 4, atkMod: 0.3, defMod: 0.3, cooldown: 12, glimmer: true, sparkFrom: ['tactical_nuke'], sparkChance: 0.03 },
      { id: 'chain_reaction', name: 'Chain Reaction', type: 'attack', desc: 'Set off a cascading series of remote detonations. 420% damage.', multiplier: 4.2, cooldown: 8, glimmer: true, sparkFrom: ['remote_detonation'], sparkChance: 0.04 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_blast', name: 'Double Blast', type: 'attack', desc: 'Two explosions in quick succession. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['pipe_bomb'], sparkChance: 0.06, chainFamily: 'blast_chain', chainRank: 1 },
      { id: 'chain_detonation', name: 'Chain Detonation', type: 'attack', desc: 'Explosions chain from one to the next. 240% damage.', multiplier: 2.4, cooldown: 4, glimmer: true, sparkFrom: ['double_blast'], sparkChance: 0.049999999999999996, chainFamily: 'blast_chain', chainRank: 2 },
      { id: 'carpet_bomb', name: 'Carpet Bomb', type: 'attack', desc: 'The entire area is blanketed in fire. 320% damage.', multiplier: 3.2, cooldown: 5, glimmer: true, sparkFrom: ['chain_detonation'], sparkChance: 0.039999999999999994, chainFamily: 'blast_chain', chainRank: 3 },
      { id: 'shock_and_awe', name: 'Shock and Awe', type: 'attack', desc: 'Overwhelming explosive force. 409% damage.', multiplier: 4.1, cooldown: 7, glimmer: true, sparkFrom: ['carpet_bomb'], sparkChance: 0.03, chainFamily: 'blast_chain', chainRank: 4 },
      { id: 'total_annihilation', name: 'Total Annihilation', type: 'attack', desc: 'Nothing survives. 540% damage.', multiplier: 5.4, cooldown: 8, glimmer: true, sparkFrom: ['shock_and_awe'], sparkChance: 0.03, chainFamily: 'blast_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'adrenaline_surge', name: 'Adrenaline Surge', type: 'buff', desc: 'Combat instincts kick in. +40% attack for 3 rounds.', duration: 3, atkMod: 1.4, cooldown: 6, glimmer: true, sparkFrom: ['blast_shield', 'reactive_armor'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'desperate_strike', name: 'Desperate Strike', type: 'attack', desc: 'A wild, universal combat swing. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['pipe_bomb', 'c4_charge'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'combat_roll', name: 'Combat Roll', type: 'buff', desc: 'Evasive maneuvers. +60% defense for 2 rounds.', duration: 2, defMod: 1.6, cooldown: 5, glimmer: true, sparkFrom: ['blast_shield'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'tactical_retreat', name: 'Tactical Retreat', type: 'heal', desc: 'Fall back and patch up wounds. Restores 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['blast_shield', 'flashbang'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A universally recognized heavy hit. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['c4_charge', 'shaped_charge'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'spirit_bomb', name: 'Spirit Bomb', type: 'attack', desc: 'Channel spiritual energy into an explosive sphere. 280% damage.', multiplier: 2.8, cooldown: 6, glimmer: true, sparkFrom: ['pipe_bomb', 'c4_charge'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'aura_of_destruction', name: 'Aura of Destruction', type: 'buff', desc: 'A cleric\'s channeling applied to explosive force. +100% attack for 2 rounds.', duration: 2, atkMod: 2.0, cooldown: 8, glimmer: true, sparkFrom: ['blast_shield', 'reactive_armor'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
      { id: 'soul_burn', name: 'Soul Burn', type: 'debuff', desc: 'Spiritual flames that weaken the enemy\'s resolve. -40% enemy defense for 4 rounds.', duration: 4, defMod: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['flashbang', 'concussion_wave'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'divine_detonation', name: 'Divine Detonation', type: 'attack', desc: 'A holy explosion that purges the wicked. 320% damage.', multiplier: 3.2, cooldown: 7, glimmer: true, sparkFrom: ['c4_charge', 'cluster_grenade'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'holy_shrapnel', name: 'Holy Shrapnel', type: 'heal', desc: 'Explosive fragments that miraculously heal allies. Restores 50% HP.', healPercent: 0.5, cooldown: 8, glimmer: true, sparkFrom: ['cluster_grenade', 'shrapnel_burst'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function elementalistAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'flame_burst', name: 'Flame Burst', tier: 0, focusCost: 5, type: 'attack', desc: 'A basic burst of fire.', multiplier: 1.5, cooldown: 3 },
      { id: 'mana_barrier', name: 'Mana Barrier', tier: 0, focusCost: 3, type: 'buff', desc: 'A basic mana shield.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'thunder_call', name: 'Thunder Call', tier: 1, focusCost: 12, type: 'attack', desc: 'Call down lightning.', multiplier: 2.5, cooldown: 5 },
      { id: 'spirit_bomb', name: 'Spirit Bomb', tier: 1, focusCost: 12, type: 'attack', desc: 'Gather energy for a big attack.', multiplier: 3.0, cooldown: 6 },
      { id: 'glacial_spike', name: 'Glacial Spike', tier: 2, focusCost: 18, type: 'attack', desc: 'A massive spike of ice.', multiplier: 4.0, cooldown: 8 },
      { id: 'elemental_overdrive', name: 'Elemental Overdrive', tier: 2, focusCost: 16, type: 'buff', desc: 'Overclock your magic circuits.', duration: 3, atkMod: 2.0, cooldown: 7 },
      { id: 'meteor_strike', name: 'Meteor Strike', tier: 3, focusCost: 25, type: 'attack', desc: 'Summon a meteor from the heavens.', multiplier: 6.0, cooldown: 12 },
      { id: 'absolute_zero', name: 'Absolute Zero', tier: 3, focusCost: 24, type: 'debuff', desc: 'Freeze the enemy to the core.', duration: 4, defMod: 0.4, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'crimson_flare', name: 'Crimson Flare', type: 'attack', desc: 'A hotter, redder flame.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['flame_burst'], sparkChance: 0.08 },
      { id: 'prominence_burn', name: 'Prominence Burn', type: 'attack', desc: 'A devastating pillar of fire.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['crimson_flare'], sparkChance: 0.05 },
      { id: 'aegis_reflector', name: 'Aegis Reflector', type: 'buff', desc: 'A barrier that reflects attacks.', duration: 3, defMod: 2.0, cooldown: 6, glimmer: true, sparkFrom: ['mana_barrier'], sparkChance: 0.06 },
      { id: 'lightning_plasma', name: 'Lightning Plasma', type: 'attack', desc: 'A barrage of lightning strikes.', multiplier: 3.2, cooldown: 6, glimmer: true, sparkFrom: ['thunder_call'], sparkChance: 0.07 },
      { id: 'keraunos_blast', name: 'Keraunos Blast', type: 'attack', desc: 'The ultimate lightning bolt.', multiplier: 4.5, cooldown: 8, glimmer: true, sparkFrom: ['lightning_plasma'], sparkChance: 0.04 },
      { id: 'super_spirit_bomb', name: 'Super Spirit Bomb', type: 'attack', desc: 'An even larger gathering of energy.', multiplier: 4.5, cooldown: 9, glimmer: true, sparkFrom: ['spirit_bomb'], sparkChance: 0.05 },
      { id: 'diamond_dust', name: 'Diamond Dust', type: 'attack', desc: 'A freezing wind that shatters foes.', multiplier: 4.8, cooldown: 9, glimmer: true, sparkFrom: ['glacial_spike'], sparkChance: 0.06 },
      { id: 'limit_break', name: 'Limit Break', type: 'buff', desc: 'Push past your magical limits.', duration: 2, atkMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['elemental_overdrive'], sparkChance: 0.05 },
      { id: 'starlight_breaker', name: 'Starlight Breaker', type: 'attack', desc: 'A massive beam of concentrated starlight.', multiplier: 5.5, cooldown: 10, glimmer: true, sparkFrom: ['meteor_strike'], sparkChance: 0.04 },
      { id: 'time_freeze', name: 'Time Freeze', type: 'debuff', desc: 'Stop time for the enemy.', duration: 3, defMod: 0.3, cooldown: 8, glimmer: true, sparkFrom: ['absolute_zero'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'twin_flame', name: 'Twin Flame', type: 'attack', desc: 'Two pillars of flame erupt. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['flame_burst'], sparkChance: 0.06, chainFamily: 'element_chain', chainRank: 1 },
      { id: 'tri_element_burst', name: 'Tri-Element Burst', type: 'attack', desc: 'Fire, ice, and lightning strike as one. 250% damage.', multiplier: 2.5, cooldown: 4, glimmer: true, sparkFrom: ['twin_flame'], sparkChance: 0.049999999999999996, chainFamily: 'element_chain', chainRank: 2 },
      { id: 'elemental_convergence', name: 'Elemental Convergence', type: 'attack', desc: 'All elements converge on the target. 330% damage.', multiplier: 3.3, cooldown: 5, glimmer: true, sparkFrom: ['tri_element_burst'], sparkChance: 0.039999999999999994, chainFamily: 'element_chain', chainRank: 3 },
      { id: 'primal_storm', name: 'Primal Storm', type: 'attack', desc: 'A primal storm of raw elemental fury. 430% damage.', multiplier: 4.3, cooldown: 7, glimmer: true, sparkFrom: ['elemental_convergence'], sparkChance: 0.03, chainFamily: 'element_chain', chainRank: 4 },
      { id: 'avatar_of_elements', name: 'Avatar of Elements', type: 'attack', desc: 'You become the elements themselves. 560% damage.', multiplier: 5.6, cooldown: 9, glimmer: true, sparkFrom: ['primal_storm'], sparkChance: 0.03, chainFamily: 'element_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'power_strike', name: 'Power Strike', type: 'attack', desc: 'A universal heavy hit.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['flame_burst', 'thunder_call', 'spirit_bomb', 'glacial_spike', 'meteor_strike'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'A universal burst of healing.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['mana_barrier', 'elemental_overdrive'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'battle_focus', name: 'Battle Focus', type: 'buff', desc: 'A universal combat focus.', duration: 3, atkMod: 1.5, cooldown: 6, glimmer: true, sparkFrom: ['mana_barrier', 'elemental_overdrive'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'armor_break', name: 'Armor Break', type: 'debuff', desc: 'A universal armor shattering strike.', duration: 3, defMod: 0.7, cooldown: 5, glimmer: true, sparkFrom: ['flame_burst', 'thunder_call', 'spirit_bomb', 'glacial_spike', 'meteor_strike'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'desperate_blow', name: 'Desperate Blow', type: 'attack', desc: 'A universal all-out attack.', multiplier: 3.0, cooldown: 7, glimmer: true, sparkFrom: ['flame_burst', 'thunder_call', 'spirit_bomb', 'glacial_spike', 'meteor_strike'], sparkChance: 0.03, crossClass: true, pool: 'universal' },
      { id: 'holy_light', name: 'Holy Light', type: 'heal', desc: 'A spiritual healing light.', healPercent: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['mana_barrier', 'elemental_overdrive'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'divine_seal', name: 'Divine Seal', type: 'debuff', desc: 'A spiritual seal that weakens the enemy.', duration: 3, atkMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['absolute_zero'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'spirit_ward', name: 'Spirit Ward', type: 'buff', desc: 'A spiritual ward against damage.', duration: 4, defMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['mana_barrier', 'elemental_overdrive'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'soul_strike', name: 'Soul Strike', type: 'attack', desc: 'A spiritual attack that bypasses armor.', multiplier: 2.8, cooldown: 5, glimmer: true, sparkFrom: ['spirit_bomb', 'meteor_strike'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'chakra_burst', name: 'Chakra Burst', type: 'heal', desc: 'A massive burst of spiritual healing.', healPercent: 0.8, cooldown: 9, glimmer: true, sparkFrom: ['mana_barrier', 'elemental_overdrive'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  function oracleAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'prophecy_bolt', name: 'Prophecy Bolt', tier: 0, focusCost: 5, type: 'attack', desc: 'A bolt of energy foreseen in ancient texts. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'fate_shield', name: 'Fate Shield', tier: 0, focusCost: 3, type: 'buff', desc: 'Bend fate to protect yourself. +30% defense for 3 rounds.', duration: 3, defMod: 1.3, cooldown: 5 },
      { id: 'divine_wrath', name: 'Divine Wrath', tier: 1, focusCost: 12, type: 'attack', desc: 'Call down the anger of the gods. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'future_sight', name: 'Future Sight', tier: 1, focusCost: 10, type: 'buff', desc: 'See the enemy\'s moves before they happen. +50% attack for 3 rounds.', duration: 3, atkMod: 1.5, cooldown: 6 },
      { id: 'apocalypse', name: 'Apocalypse', tier: 2, focusCost: 18, type: 'attack', desc: 'Unleash the foretold end times. 400% damage.', multiplier: 4.0, cooldown: 8 },
      { id: 'doom_prophecy', name: 'Doom Prophecy', tier: 2, focusCost: 17, type: 'debuff', desc: 'Speak a prophecy of ruin. -40% enemy defense for 4 rounds.', duration: 4, defMod: 0.6, cooldown: 7 },
      { id: 'timeline_collapse', name: 'Timeline Collapse', tier: 3, focusCost: 25, type: 'attack', desc: 'Crush the enemy with collapsing timelines. 600% damage.', multiplier: 6.0, cooldown: 12 },
      { id: 'rewrite_destiny', name: 'Rewrite Destiny', tier: 3, focusCost: 28, type: 'heal', desc: 'Rewrite your fate to undo wounds. Restores 80% HP.', healPercent: 0.8, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'oracle_strike', name: 'Oracle Strike', type: 'attack', desc: 'A precise strike guided by visions. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['prophecy_bolt'], sparkChance: 0.08 },
      { id: 'prophetic_blast', name: 'Prophetic Blast', type: 'attack', desc: 'A devastating blast of pure foresight. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['oracle_strike'], sparkChance: 0.05 },
      { id: 'aegis_of_time', name: 'Aegis of Time', type: 'buff', desc: 'Time itself hardens around you. +80% defense for 4 rounds.', duration: 4, defMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['fate_shield'], sparkChance: 0.06 },
      { id: 'celestial_judgment', name: 'Celestial Judgment', type: 'attack', desc: 'The heavens pass judgment. 350% damage.', multiplier: 3.5, cooldown: 7, glimmer: true, sparkFrom: ['divine_wrath'], sparkChance: 0.07 },
      { id: 'wrath_of_the_ancients', name: 'Wrath of the Ancients', type: 'attack', desc: 'The ultimate fury of the old gods. 500% damage.', multiplier: 5.0, cooldown: 9, glimmer: true, sparkFrom: ['celestial_judgment'], sparkChance: 0.04 },
      { id: 'omniscient_gaze', name: 'Omniscient Gaze', type: 'buff', desc: 'Know all things. +100% attack for 4 rounds.', duration: 4, atkMod: 2.0, cooldown: 8, glimmer: true, sparkFrom: ['future_sight'], sparkChance: 0.05 },
      { id: 'inevitable_ruin', name: 'Inevitable Ruin', type: 'debuff', desc: 'Their doom is sealed. -60% enemy defense for 4 rounds.', duration: 4, defMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['doom_prophecy'], sparkChance: 0.06 },
      { id: 'end_of_days', name: 'End of Days', type: 'attack', desc: 'The final prophecy fulfilled. 550% damage.', multiplier: 5.5, cooldown: 10, glimmer: true, sparkFrom: ['apocalypse'], sparkChance: 0.04 },
      { id: 'miracle_of_ages', name: 'Miracle of Ages', type: 'heal', desc: 'A legendary miracle restores you. Restores 100% HP.', healPercent: 1.0, cooldown: 10, glimmer: true, sparkFrom: ['rewrite_destiny'], sparkChance: 0.03 },
      { id: 'vision_of_pain', name: 'Vision of Pain', type: 'debuff', desc: 'Show the enemy their own demise. -30% enemy attack for 3 rounds.', duration: 3, atkMod: 0.7, cooldown: 6, glimmer: true, sparkFrom: ['prophecy_bolt'], sparkChance: 0.07 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'twin_prophecy', name: 'Twin Prophecy', type: 'attack', desc: 'Two bolts of prophetic energy. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['prophecy_bolt'], sparkChance: 0.06, chainFamily: 'prophecy_chain', chainRank: 1 },
      { id: 'threefold_vision', name: 'Threefold Vision', type: 'attack', desc: 'Three visions made manifest. 229% damage.', multiplier: 2.3, cooldown: 4, glimmer: true, sparkFrom: ['twin_prophecy'], sparkChance: 0.049999999999999996, chainFamily: 'prophecy_chain', chainRank: 2 },
      { id: 'fate_barrage', name: 'Fate Barrage', type: 'attack', desc: 'A barrage of fate-woven strikes. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['threefold_vision'], sparkChance: 0.039999999999999994, chainFamily: 'prophecy_chain', chainRank: 3 },
      { id: 'destiny_storm', name: 'Destiny Storm', type: 'attack', desc: 'The storm of destiny itself. 390% damage.', multiplier: 3.9, cooldown: 7, glimmer: true, sparkFrom: ['fate_barrage'], sparkChance: 0.03, chainFamily: 'prophecy_chain', chainRank: 4 },
      { id: 'ragnarok', name: 'Ragnarok', type: 'attack', desc: 'The end of all things, foretold. 520% damage.', multiplier: 5.2, cooldown: 8, glimmer: true, sparkFrom: ['destiny_storm'], sparkChance: 0.03, chainFamily: 'prophecy_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'focused_strike', name: 'Focused Strike', type: 'attack', desc: 'A universal technique of pure focus. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['prophecy_bolt', 'divine_wrath', 'apocalypse', 'timeline_collapse'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'inner_focus', name: 'Inner Focus', type: 'buff', desc: 'Center your mind. +40% attack for 3 rounds.', duration: 3, atkMod: 1.4, cooldown: 6, glimmer: true, sparkFrom: ['fate_shield', 'future_sight'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'power_surge', name: 'Power Surge', type: 'attack', desc: 'A sudden burst of universal energy. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['prophecy_bolt', 'divine_wrath', 'apocalypse', 'timeline_collapse'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'weaken_resolve', name: 'Weaken Resolve', type: 'debuff', desc: 'Break the enemy\'s will. -20% enemy attack for 3 rounds.', duration: 3, atkMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['doom_prophecy'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'A universal survival technique. Restores 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['rewrite_destiny'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'spiritual_ward', name: 'Spiritual Ward', type: 'buff', desc: 'Cleric affinity: A ward of spiritual energy. +60% defense for 3 rounds.', duration: 3, defMod: 1.6, cooldown: 6, glimmer: true, sparkFrom: ['fate_shield', 'future_sight'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'channeled_grace', name: 'Channeled Grace', type: 'heal', desc: 'Cleric affinity: Channel divine grace. Restores 50% HP.', healPercent: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['rewrite_destiny'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'holy_smite', name: 'Holy Smite', type: 'attack', desc: 'Cleric affinity: Smite with spiritual power. 280% damage.', multiplier: 2.8, cooldown: 6, glimmer: true, sparkFrom: ['divine_wrath', 'apocalypse'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'divine_censure', name: 'Divine Censure', type: 'debuff', desc: 'Cleric affinity: Condemn the wicked. -50% enemy attack for 3 rounds.', duration: 3, atkMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['doom_prophecy'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'spirit_blast', name: 'Spirit Blast', type: 'attack', desc: 'Cleric affinity: A blast of pure spirit. 320% damage.', multiplier: 3.2, cooldown: 7, glimmer: true, sparkFrom: ['apocalypse', 'timeline_collapse'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  /* ── ROGUE SPECS ──────────────────────────────────────────── */
  function assassinAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'backstab', name: 'Backstab', tier: 0, focusCost: 5, type: 'attack', desc: 'A quick strike from the shadows. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'smoke_bomb', name: 'Smoke Bomb', tier: 0, focusCost: 4, type: 'debuff', desc: 'Throw a smoke bomb to blind the enemy. -30% enemy attack for 2 rounds.', duration: 2, atkMod: 0.7, cooldown: 5 },
      { id: 'poison_blade', name: 'Poison Blade', tier: 1, focusCost: 12, type: 'attack', desc: 'Coat your blade in poison before striking. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'shadow_step', name: 'Shadow Step', tier: 1, focusCost: 10, type: 'buff', desc: 'Step into the shadows, increasing evasion. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 6 },
      { id: 'death_mark', name: 'Death Mark', tier: 2, focusCost: 18, type: 'attack', desc: 'Mark the target for death and strike. 350% damage.', multiplier: 3.5, cooldown: 6 },
      { id: 'throat_slit', name: 'Throat Slit', tier: 2, focusCost: 18, type: 'attack', desc: 'A lethal strike aimed at the neck. 400% damage.', multiplier: 4.0, cooldown: 7 },
      { id: 'shadow_clone', name: 'Shadow Clone', tier: 3, focusCost: 25, type: 'attack', desc: 'Create a clone to strike simultaneously. 500% damage.', multiplier: 5.0, cooldown: 9 },
      { id: 'phantom_assassination', name: 'Phantom Assassination', tier: 3, focusCost: 25, type: 'attack', desc: 'The ultimate shadow technique. 600% damage.', multiplier: 6.0, cooldown: 12 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'eviscerate', name: 'Eviscerate', type: 'attack', desc: 'A brutal follow-up to a backstab. 250% damage.', multiplier: 2.5, cooldown: 4, glimmer: true, sparkFrom: ['backstab'], sparkChance: 0.08 },
      { id: 'blinding_powder', name: 'Blinding Powder', type: 'debuff', desc: 'A more potent blinding agent. -50% enemy attack for 3 rounds.', duration: 3, atkMod: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['smoke_bomb'], sparkChance: 0.07 },
      { id: 'venomous_strike', name: 'Venomous Strike', type: 'attack', desc: 'A strike with deadly venom. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['poison_blade'], sparkChance: 0.06 },
      { id: 'shadow_dance', name: 'Shadow Dance', type: 'buff', desc: 'Move unpredictably through shadows. +80% defense for 4 rounds.', duration: 4, defMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['shadow_step'], sparkChance: 0.06 },
      { id: 'execution', name: 'Execution', type: 'attack', desc: 'A flawless execution strike. 450% damage.', multiplier: 4.5, cooldown: 7, glimmer: true, sparkFrom: ['death_mark'], sparkChance: 0.05 },
      { id: 'silent_kill', name: 'Silent Kill', type: 'attack', desc: 'A strike so fast it makes no sound. 500% damage.', multiplier: 5.0, cooldown: 8, glimmer: true, sparkFrom: ['throat_slit'], sparkChance: 0.05 },
      { id: 'shadow_barrage', name: 'Shadow Barrage', type: 'attack', desc: 'A flurry of strikes from multiple clones. 550% damage.', multiplier: 5.5, cooldown: 10, glimmer: true, sparkFrom: ['shadow_clone'], sparkChance: 0.04 },
      { id: 'eclipse_strike', name: 'Eclipse Strike', type: 'attack', desc: 'Plunge the battlefield into darkness and strike. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['phantom_assassination'], sparkChance: 0.03 },
      { id: 'lethal_toxin', name: 'Lethal Toxin', type: 'debuff', desc: 'A toxin that severely weakens the enemy. -60% enemy defense for 4 rounds.', duration: 4, defMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['venomous_strike'], sparkChance: 0.04 },
      { id: 'assassinate', name: 'Assassinate', type: 'attack', desc: 'The perfect kill. 600% damage.', multiplier: 6.0, cooldown: 10, glimmer: true, sparkFrom: ['execution'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_stab', name: 'Double Stab', type: 'attack', desc: 'Two quick stabs to vital points. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['backstab'], sparkChance: 0.06, chainFamily: 'stab_chain', chainRank: 1 },
      { id: 'triple_pierce', name: 'Triple Pierce', type: 'attack', desc: 'Three piercing strikes in rapid succession. 240% damage.', multiplier: 2.4, cooldown: 4, glimmer: true, sparkFrom: ['double_stab'], sparkChance: 0.049999999999999996, chainFamily: 'stab_chain', chainRank: 2 },
      { id: 'five_point_strike', name: 'Five-Point Strike', type: 'attack', desc: 'Five precise strikes to pressure points. 320% damage.', multiplier: 3.2, cooldown: 5, glimmer: true, sparkFrom: ['triple_pierce'], sparkChance: 0.039999999999999994, chainFamily: 'stab_chain', chainRank: 3 },
      { id: 'shadow_flurry', name: 'Shadow Flurry', type: 'attack', desc: 'A flurry of shadow-cloaked blades. 420% damage.', multiplier: 4.2, cooldown: 7, glimmer: true, sparkFrom: ['five_point_strike'], sparkChance: 0.03, chainFamily: 'stab_chain', chainRank: 4 },
      { id: 'death_thousand_cuts', name: 'Death of a Thousand Cuts', type: 'attack', desc: 'Too many cuts to count. 550% damage.', multiplier: 5.5, cooldown: 8, glimmer: true, sparkFrom: ['shadow_flurry'], sparkChance: 0.03, chainFamily: 'stab_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'quick_strike', name: 'Quick Strike', type: 'attack', desc: 'A fast, generic combat strike. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['backstab', 'poison_blade'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'evasive_maneuver', name: 'Evasive Maneuver', type: 'buff', desc: 'A basic dodge technique. +30% defense for 2 rounds.', duration: 2, defMod: 1.3, cooldown: 5, glimmer: true, sparkFrom: ['shadow_step'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'dirty_trick', name: 'Dirty Trick', type: 'debuff', desc: 'A cheap shot to weaken the enemy. -20% enemy defense for 2 rounds.', duration: 2, defMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['smoke_bomb'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'vital_strike', name: 'Vital Strike', type: 'attack', desc: 'A strike to a generic vital point. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['throat_slit', 'death_mark'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath to recover health. Restores 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['shadow_step'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A powerful impact strike learned from fighters. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['backstab'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'crushing_impact', name: 'Crushing Impact', type: 'attack', desc: 'A devastating blow that crushes armor. 320% damage.', multiplier: 3.2, cooldown: 6, glimmer: true, sparkFrom: ['poison_blade'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'brutal_takedown', name: 'Brutal Takedown', type: 'attack', desc: 'A savage takedown maneuver. 420% damage.', multiplier: 4.2, cooldown: 8, glimmer: true, sparkFrom: ['throat_slit'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'overwhelming_force', name: 'Overwhelming Force', type: 'buff', desc: 'Channel fighter strength. +60% attack for 3 rounds.', duration: 3, atkMod: 1.6, cooldown: 7, glimmer: true, sparkFrom: ['shadow_step'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'shattering_strike', name: 'Shattering Strike', type: 'attack', desc: 'A strike that shatters defenses. 520% damage.', multiplier: 5.2, cooldown: 10, glimmer: true, sparkFrom: ['phantom_assassination'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function cyberthiefAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'emp_dart', name: 'EMP Dart', tier: 0, focusCost: 5, type: 'attack', desc: 'Fires a small EMP dart. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'cloak_field', name: 'Cloak Field', tier: 0, focusCost: 3, type: 'buff', desc: 'Activates a personal cloaking field. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'neural_hack', name: 'Neural Hack', tier: 1, focusCost: 11, type: 'debuff', desc: 'Hacks the target\'s neural implants. -30% attack for 3 rounds.', duration: 3, atkMod: 0.7, cooldown: 6 },
      { id: 'data_spike', name: 'Data Spike', tier: 1, focusCost: 12, type: 'attack', desc: 'Jams a data spike into the target\'s port. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'blackout_protocol', name: 'Blackout Protocol', tier: 2, focusCost: 18, type: 'attack', desc: 'Initiates a localized blackout, striking in the dark. 350% damage.', multiplier: 3.5, cooldown: 7 },
      { id: 'ghost_in_the_shell', name: 'Ghost in the Shell', tier: 2, focusCost: 16, type: 'buff', desc: 'Uploads consciousness to evade attacks. +100% defense for 2 rounds.', duration: 2, defMod: 2.0, cooldown: 8 },
      { id: 'system_crash', name: 'System Crash', tier: 3, focusCost: 24, type: 'debuff', desc: 'Causes a total system crash in the target. -60% defense for 4 rounds.', duration: 4, defMod: 0.4, cooldown: 8 },
      { id: 'orbital_strike_designator', name: 'Orbital Strike Designator', tier: 3, focusCost: 25, type: 'attack', desc: 'Paints the target for an orbital kinetic strike. 600% damage.', multiplier: 6.0, cooldown: 12 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'emp_burst', name: 'EMP Burst', type: 'attack', desc: 'Overloads the EMP dart into a burst. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['emp_dart'], sparkChance: 0.08 },
      { id: 'emp_cascade', name: 'EMP Cascade', type: 'attack', desc: 'A cascading EMP wave. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['emp_burst'], sparkChance: 0.05 },
      { id: 'active_camo', name: 'Active Camo', type: 'buff', desc: 'Advanced cloaking. +80% defense for 3 rounds.', duration: 3, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['cloak_field'], sparkChance: 0.07 },
      { id: 'phase_shift', name: 'Phase Shift', type: 'buff', desc: 'Shifts out of phase. +150% defense for 2 rounds.', duration: 2, defMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['active_camo'], sparkChance: 0.04 },
      { id: 'synapse_burn', name: 'Synapse Burn', type: 'debuff', desc: 'Overheats neural pathways. -50% attack for 3 rounds.', duration: 3, atkMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['neural_hack'], sparkChance: 0.06 },
      { id: 'logic_bomb', name: 'Logic Bomb', type: 'attack', desc: 'Plants a logic bomb that detonates violently. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['data_spike'], sparkChance: 0.06 },
      { id: 'zero_day_exploit', name: 'Zero-Day Exploit', type: 'attack', desc: 'Unleashes an unpatchable exploit. 500% damage.', multiplier: 5.0, cooldown: 9, glimmer: true, sparkFrom: ['logic_bomb'], sparkChance: 0.03 },
      { id: 'grid_collapse', name: 'Grid Collapse', type: 'attack', desc: 'Brings down the entire local grid on the target. 450% damage.', multiplier: 4.5, cooldown: 8, glimmer: true, sparkFrom: ['blackout_protocol'], sparkChance: 0.05 },
      { id: 'digital_ascension', name: 'Digital Ascension', type: 'buff', desc: 'Pure digital form. +120% attack for 3 rounds.', duration: 3, atkMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['ghost_in_the_shell'], sparkChance: 0.04 },
      { id: 'total_wipe', name: 'Total Wipe', type: 'debuff', desc: 'Wipes the target\'s memory banks. -70% attack for 4 rounds.', duration: 4, atkMod: 0.3, cooldown: 8, glimmer: true, sparkFrom: ['system_crash'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'twin_dart', name: 'Twin Dart', type: 'attack', desc: 'Two EMP darts fired simultaneously. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['emp_dart'], sparkChance: 0.06, chainFamily: 'dart_chain', chainRank: 1 },
      { id: 'triple_shot_ct', name: 'Triple Shot', type: 'attack', desc: 'Three darts in a tight spread. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['twin_dart'], sparkChance: 0.049999999999999996, chainFamily: 'dart_chain', chainRank: 2 },
      { id: 'dart_swarm', name: 'Dart Swarm', type: 'attack', desc: 'A swarm of micro-darts. 290% damage.', multiplier: 2.9, cooldown: 5, glimmer: true, sparkFrom: ['triple_shot_ct'], sparkChance: 0.039999999999999994, chainFamily: 'dart_chain', chainRank: 3 },
      { id: 'emp_barrage', name: 'EMP Barrage', type: 'attack', desc: 'A barrage of EMP pulses. 380% damage.', multiplier: 3.8, cooldown: 6, glimmer: true, sparkFrom: ['dart_swarm'], sparkChance: 0.03, chainFamily: 'dart_chain', chainRank: 4 },
      { id: 'overload_cascade', name: 'Overload Cascade', type: 'attack', desc: 'Systems overload in a cascading chain reaction. 500% damage.', multiplier: 5.0, cooldown: 8, glimmer: true, sparkFrom: ['emp_barrage'], sparkChance: 0.03, chainFamily: 'dart_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'basic_strike', name: 'Basic Strike', type: 'attack', desc: 'A universal combat strike. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['emp_dart', 'data_spike'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'evasive_roll', name: 'Evasive Roll', type: 'buff', desc: 'Roll out of danger. +40% defense for 2 rounds.', duration: 2, defMod: 1.4, cooldown: 5, glimmer: true, sparkFrom: ['cloak_field'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'quick_patch', name: 'Quick Patch', type: 'heal', desc: 'A universal quick heal. Restores 30% HP.', healPercent: 0.3, cooldown: 5, glimmer: true, sparkFrom: ['cloak_field', 'ghost_in_the_shell'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'leg_sweep', name: 'Leg Sweep', type: 'debuff', desc: 'Sweeps the target\'s legs. -20% defense for 2 rounds.', duration: 2, defMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['neural_hack'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'adrenaline_surge', name: 'Adrenaline Surge', type: 'buff', desc: 'A universal combat surge. +30% attack for 3 rounds.', duration: 3, atkMod: 1.3, cooldown: 6, glimmer: true, sparkFrom: ['ghost_in_the_shell'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'power_blow', name: 'Power Blow', type: 'attack', desc: 'A heavy fighter strike. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['data_spike', 'blackout_protocol'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'crushing_impact', name: 'Crushing Impact', type: 'attack', desc: 'A devastating fighter impact. 350% damage.', multiplier: 3.5, cooldown: 7, glimmer: true, sparkFrom: ['power_blow', 'orbital_strike_designator'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'armor_break', name: 'Armor Break', type: 'debuff', desc: 'Shatters target armor. -40% defense for 3 rounds.', duration: 3, defMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['system_crash', 'neural_hack'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'heavy_slam', name: 'Heavy Slam', type: 'attack', desc: 'Slams the target with immense force. 400% damage.', multiplier: 4.0, cooldown: 8, glimmer: true, sparkFrom: ['crushing_impact', 'blackout_protocol'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
      { id: 'unstoppable_force', name: 'Unstoppable Force', type: 'buff', desc: 'Channels fighter power. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['ghost_in_the_shell', 'cloak_field'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  function detectiveAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'sucker_punch', name: 'Sucker Punch', tier: 0, focusCost: 5, type: 'attack', desc: 'A quick, unexpected strike. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'trench_coat', name: 'Trench Coat', tier: 0, focusCost: 3, type: 'buff', desc: 'Blend into the shadows. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'expose_weakness', name: 'Expose Weakness', tier: 1, focusCost: 11, type: 'debuff', desc: 'Find a flaw in their guard. -30% enemy defense for 3 rounds.', duration: 3, defMod: 0.7, cooldown: 6 },
      { id: 'rough_interrogation', name: 'Rough Interrogation', tier: 1, focusCost: 12, type: 'attack', desc: 'Beat the answers out of them. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'hard_boiled', name: 'Hard Boiled', tier: 2, focusCost: 21, type: 'heal', desc: 'Shrug off the pain. Restore 40% HP.', healPercent: 0.4, cooldown: 6 },
      { id: 'smoke_screen', name: 'Smoke Screen', tier: 2, focusCost: 17, type: 'debuff', desc: 'Obscure vision. -40% enemy attack for 4 rounds.', duration: 4, atkMod: 0.6, cooldown: 7 },
      { id: 'case_closed', name: 'Case Closed', tier: 3, focusCost: 25, type: 'attack', desc: 'The final blow. 500% damage.', multiplier: 5.0, cooldown: 10 },
      { id: 'final_deduction', name: 'Final Deduction', tier: 3, focusCost: 23, type: 'buff', desc: 'See all the angles. +100% attack for 3 rounds.', duration: 3, atkMod: 2.0, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'cheap_shot', name: 'Cheap Shot', type: 'attack', desc: 'A dirty follow-up. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['sucker_punch'], sparkChance: 0.08 },
      { id: 'brass_knuckles', name: 'Brass Knuckles', type: 'attack', desc: 'A brutal strike. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['cheap_shot'], sparkChance: 0.05 },
      { id: 'shadow_slip', name: 'Shadow Slip', type: 'buff', desc: 'Vanish completely. +80% defense for 2 rounds.', duration: 2, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['trench_coat'], sparkChance: 0.06 },
      { id: 'pinpoint_flaw', name: 'Pinpoint Flaw', type: 'debuff', desc: 'Exploit a critical weakness. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['expose_weakness'], sparkChance: 0.07 },
      { id: 'third_degree', name: 'Third Degree', type: 'attack', desc: 'Relentless questioning. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['rough_interrogation'], sparkChance: 0.06 },
      { id: 'liquid_courage', name: 'Liquid Courage', type: 'heal', desc: 'A quick swig. Restore 60% HP.', healPercent: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['hard_boiled'], sparkChance: 0.05 },
      { id: 'choking_gas', name: 'Choking Gas', type: 'debuff', desc: 'Toxic fumes. -60% enemy attack for 3 rounds.', duration: 3, atkMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['smoke_screen'], sparkChance: 0.05 },
      { id: 'smoking_gun', name: 'Smoking Gun', type: 'attack', desc: 'The undeniable proof. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['case_closed'], sparkChance: 0.04 },
      { id: 'eureka_moment', name: 'Eureka Moment', type: 'buff', desc: 'Everything connects. +150% attack for 2 rounds.', duration: 2, atkMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['final_deduction'], sparkChance: 0.04 },
      { id: 'fatal_flaw', name: 'Fatal Flaw', type: 'debuff', desc: 'The ultimate vulnerability. -70% enemy defense for 2 rounds.', duration: 2, defMod: 0.3, cooldown: 8, glimmer: true, sparkFrom: ['pinpoint_flaw'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_shot_det', name: 'Double Shot', type: 'attack', desc: 'Two shots from the hip. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['sucker_punch'], sparkChance: 0.06, chainFamily: 'shot_chain', chainRank: 1 },
      { id: 'fan_the_hammer', name: 'Fan the Hammer', type: 'attack', desc: 'Fan the revolver hammer. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['double_shot_det'], sparkChance: 0.049999999999999996, chainFamily: 'shot_chain', chainRank: 2 },
      { id: 'quick_draw_volley', name: 'Quick Draw Volley', type: 'attack', desc: 'A rapid volley of precise shots. 290% damage.', multiplier: 2.9, cooldown: 5, glimmer: true, sparkFrom: ['fan_the_hammer'], sparkChance: 0.039999999999999994, chainFamily: 'shot_chain', chainRank: 3 },
      { id: 'dead_eye_barrage', name: 'Dead Eye Barrage', type: 'attack', desc: 'Every shot finds its mark. 370% damage.', multiplier: 3.7, cooldown: 6, glimmer: true, sparkFrom: ['quick_draw_volley'], sparkChance: 0.03, chainFamily: 'shot_chain', chainRank: 4 },
      { id: 'final_verdict', name: 'Final Verdict', type: 'attack', desc: 'The final verdict is delivered in lead. 490% damage.', multiplier: 4.9, cooldown: 8, glimmer: true, sparkFrom: ['dead_eye_barrage'], sparkChance: 0.03, chainFamily: 'shot_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'basic_strike', name: 'Basic Strike', type: 'attack', desc: 'A fundamental attack. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['sucker_punch', 'rough_interrogation', 'case_closed'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'quick_patch', name: 'Quick Patch', type: 'heal', desc: 'Basic first aid. Restore 30% HP.', healPercent: 0.3, cooldown: 5, glimmer: true, sparkFrom: ['hard_boiled'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'combat_stance', name: 'Combat Stance', type: 'buff', desc: 'Prepare for battle. +30% attack for 3 rounds.', duration: 3, atkMod: 1.3, cooldown: 6, glimmer: true, sparkFrom: ['final_deduction'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'trip_up', name: 'Trip Up', type: 'debuff', desc: 'Knock them off balance. -20% enemy defense for 3 rounds.', duration: 3, defMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['expose_weakness', 'smoke_screen'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A solid hit. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['sucker_punch', 'rough_interrogation', 'case_closed'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'haymaker', name: 'Haymaker', type: 'attack', desc: 'A wild, powerful swing. 400% damage.', multiplier: 4.0, cooldown: 7, glimmer: true, sparkFrom: ['rough_interrogation', 'case_closed'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'iron_jaw', name: 'Iron Jaw', type: 'buff', desc: 'Take the hit. +100% defense for 2 rounds.', duration: 2, defMod: 2.0, cooldown: 6, glimmer: true, sparkFrom: ['trench_coat'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'shattering_strike', name: 'Shattering Strike', type: 'debuff', desc: 'Break their guard. -40% enemy defense for 3 rounds.', duration: 3, defMod: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['expose_weakness'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Push through the pain. Restore 50% HP.', healPercent: 0.5, cooldown: 8, glimmer: true, sparkFrom: ['hard_boiled'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'devastating_impact', name: 'Devastating Impact', type: 'attack', desc: 'A crushing blow. 550% damage.', multiplier: 5.5, cooldown: 10, glimmer: true, sparkFrom: ['case_closed'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function infiltratorAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'silenced_shot', name: 'Silenced Shot', tier: 0, focusCost: 5, type: 'attack', desc: 'A quiet, precise shot. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'tactical_cloak', name: 'Tactical Cloak', tier: 0, focusCost: 3, type: 'buff', desc: 'Engage optical camouflage. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'flashbang', name: 'Flashbang', tier: 1, focusCost: 11, type: 'debuff', desc: 'Blinds the enemy. -40% attack for 2 rounds.', duration: 2, atkMod: 0.6, cooldown: 6 },
      { id: 'cqc_takedown', name: 'CQC Takedown', tier: 1, focusCost: 12, type: 'attack', desc: 'Close quarters combat strike. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'ghost_protocol', name: 'Ghost Protocol', tier: 2, focusCost: 18, type: 'attack', desc: 'Strike from the shadows. 400% damage.', multiplier: 4.0, cooldown: 8 },
      { id: 'emp_grenade', name: 'EMP Grenade', tier: 2, focusCost: 17, type: 'debuff', desc: 'Disables enemy electronics and shields. -50% defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 7 },
      { id: 'orbital_strike_designator', name: 'Orbital Strike Designator', tier: 3, focusCost: 25, type: 'attack', desc: 'Paint the target for orbital bombardment. 600% damage.', multiplier: 6.0, cooldown: 12 },
      { id: 'nanite_stim', name: 'Nanite Stim', tier: 3, focusCost: 28, type: 'heal', desc: 'Inject medical nanites. Restores 50% HP.', healPercent: 0.5, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'double_tap', name: 'Double Tap', type: 'attack', desc: 'Two quick shots to center mass. 220% damage.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['silenced_shot'], sparkChance: 0.08 },
      { id: 'headshot', name: 'Headshot', type: 'attack', desc: 'A lethal shot to the head. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['double_tap'], sparkChance: 0.05 },
      { id: 'active_camo', name: 'Active Camo', type: 'buff', desc: 'Advanced cloaking field. +80% defense for 4 rounds.', duration: 4, defMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['tactical_cloak'], sparkChance: 0.06 },
      { id: 'shadow_strike', name: 'Shadow Strike', type: 'attack', desc: 'Attack without breaking stealth. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['active_camo'], sparkChance: 0.04 },
      { id: 'concussive_blast', name: 'Concussive Blast', type: 'debuff', desc: 'A disorienting explosion. -60% attack for 3 rounds.', duration: 3, atkMod: 0.4, cooldown: 7, glimmer: true, sparkFrom: ['flashbang'], sparkChance: 0.07 },
      { id: 'neck_snap', name: 'Neck Snap', type: 'attack', desc: 'A brutal, silent takedown. 450% damage.', multiplier: 4.5, cooldown: 7, glimmer: true, sparkFrom: ['cqc_takedown'], sparkChance: 0.05 },
      { id: 'phantom_assassination', name: 'Phantom Assassination', type: 'attack', desc: 'An untraceable kill. 550% damage.', multiplier: 5.5, cooldown: 10, glimmer: true, sparkFrom: ['ghost_protocol'], sparkChance: 0.04 },
      { id: 'system_override', name: 'System Override', type: 'debuff', desc: 'Total system failure for the enemy. -70% defense for 4 rounds.', duration: 4, defMod: 0.3, cooldown: 8, glimmer: true, sparkFrom: ['emp_grenade'], sparkChance: 0.05 },
      { id: 'precision_airstrike', name: 'Precision Airstrike', type: 'attack', desc: 'A perfectly targeted bombing run. 500% damage.', multiplier: 5.0, cooldown: 9, glimmer: true, sparkFrom: ['orbital_strike_designator'], sparkChance: 0.06 },
      { id: 'combat_triage', name: 'Combat Triage', type: 'heal', desc: 'Emergency battlefield healing. Restores 80% HP.', healPercent: 0.8, cooldown: 10, glimmer: true, sparkFrom: ['nanite_stim'], sparkChance: 0.05 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_strike_inf', name: 'Double Strike', type: 'attack', desc: 'Two precise strikes from the shadows. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['silenced_shot'], sparkChance: 0.06, chainFamily: 'strike_chain', chainRank: 1 },
      { id: 'triple_takedown', name: 'Triple Takedown', type: 'attack', desc: 'Three targets neutralized in seconds. 229% damage.', multiplier: 2.3, cooldown: 4, glimmer: true, sparkFrom: ['double_strike_inf'], sparkChance: 0.049999999999999996, chainFamily: 'strike_chain', chainRank: 2 },
      { id: 'rapid_elimination', name: 'Rapid Elimination', type: 'attack', desc: 'Rapid, clinical elimination. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['triple_takedown'], sparkChance: 0.039999999999999994, chainFamily: 'strike_chain', chainRank: 3 },
      { id: 'ghost_strike_barrage', name: 'Ghost Strike Barrage', type: 'attack', desc: 'Ghost-like strikes from every angle. 390% damage.', multiplier: 3.9, cooldown: 6, glimmer: true, sparkFrom: ['rapid_elimination'], sparkChance: 0.03, chainFamily: 'strike_chain', chainRank: 4 },
      { id: 'phantom_assault', name: 'Phantom Assault', type: 'attack', desc: 'You were never here. 509% damage.', multiplier: 5.1, cooldown: 8, glimmer: true, sparkFrom: ['ghost_strike_barrage'], sparkChance: 0.03, chainFamily: 'strike_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'evasive_roll', name: 'Evasive Roll', type: 'buff', desc: 'Roll out of danger. +40% defense for 2 rounds.', duration: 2, defMod: 1.4, cooldown: 5, glimmer: true, sparkFrom: ['tactical_cloak'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'quick_draw', name: 'Quick Draw', type: 'attack', desc: 'Fire before the enemy can react. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['silenced_shot'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'adrenaline_rush', name: 'Adrenaline Rush', type: 'heal', desc: 'A surge of energy. Restores 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['nanite_stim'], sparkChance: 0.08, crossClass: true, pool: 'universal' },
      { id: 'dirty_trick', name: 'Dirty Trick', type: 'debuff', desc: 'Fight dirty. -30% attack for 2 rounds.', duration: 2, atkMod: 0.7, cooldown: 5, glimmer: true, sparkFrom: ['flashbang'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'counter_fire', name: 'Counter Fire', type: 'attack', desc: 'Return fire immediately. 200% damage.', multiplier: 2.0, cooldown: 5, glimmer: true, sparkFrom: ['cqc_takedown'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'brutal_haymaker', name: 'Brutal Haymaker', type: 'attack', desc: 'A devastating punch with raw power. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['cqc_takedown'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'shattering_blow', name: 'Shattering Blow', type: 'debuff', desc: 'A strike that breaks armor. -40% defense for 3 rounds.', duration: 3, defMod: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['neck_snap'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'iron_grip', name: 'Iron Grip', type: 'buff', desc: 'Tense muscles to resist damage. +60% defense for 3 rounds.', duration: 3, defMod: 1.6, cooldown: 6, glimmer: true, sparkFrom: ['tactical_cloak'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'heavy_ordnance', name: 'Heavy Ordnance', type: 'attack', desc: 'Unleash explosive power. 450% damage.', multiplier: 4.5, cooldown: 9, glimmer: true, sparkFrom: ['orbital_strike_designator'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'unstoppable_force', name: 'Unstoppable Force', type: 'attack', desc: 'A relentless assault. 380% damage.', multiplier: 3.8, cooldown: 8, glimmer: true, sparkFrom: ['ghost_protocol'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
    ];
  }
  function ninjaAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'shuriken_barrage', name: 'Shuriken Barrage', tier: 0, focusCost: 5, type: 'attack', desc: 'Throw a flurry of basic shurikens. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'shadow_step', name: 'Shadow Step', tier: 0, focusCost: 3, type: 'buff', desc: 'Melt into the shadows. +20% evasion for 3 rounds.', duration: 3, defMod: 1.2, cooldown: 5 },
      { id: 'kunai_rain', name: 'Kunai Rain', tier: 1, focusCost: 12, type: 'attack', desc: 'Leap into the air and rain kunai down. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'smoke_bomb', name: 'Smoke Bomb', tier: 1, focusCost: 11, type: 'debuff', desc: 'Throw a smoke bomb to blind enemies. -30% enemy accuracy for 3 rounds.', duration: 3, atkMod: 0.7, cooldown: 6 },
      { id: 'forbidden_jutsu', name: 'Forbidden Jutsu', tier: 2, focusCost: 18, type: 'attack', desc: 'Unleash a dark, forbidden technique. 400% damage.', multiplier: 4.0, cooldown: 8 },
      { id: 'chakra_flow', name: 'Chakra Flow', tier: 2, focusCost: 21, type: 'heal', desc: 'Channel inner chakra to heal wounds. Restores 40% HP.', healPercent: 0.4, cooldown: 6 },
      { id: 'demon_wind_shuriken', name: 'Demon Wind Shuriken', tier: 3, focusCost: 25, type: 'attack', desc: 'Hurl a massive, folding shuriken. 550% damage.', multiplier: 5.5, cooldown: 10 },
      { id: 'susanoo_aura', name: 'Susanoo Aura', tier: 3, focusCost: 23, type: 'buff', desc: 'Manifest a spectral warrior aura. +100% defense for 4 rounds.', duration: 4, defMod: 2.0, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'phantom_shuriken', name: 'Phantom Shuriken', type: 'attack', desc: 'A shuriken that multiplies in mid-air. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['shuriken_barrage'], sparkChance: 0.06 },
      { id: 'shadow_clone_strike', name: 'Shadow Clone Strike', type: 'attack', desc: 'Create clones to strike simultaneously. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['phantom_shuriken'], sparkChance: 0.04 },
      { id: 'substitution_jutsu', name: 'Substitution Jutsu', type: 'buff', desc: 'Replace yourself with a log to avoid damage. +50% defense for 2 rounds.', duration: 2, defMod: 1.5, cooldown: 6, glimmer: true, sparkFrom: ['shadow_step'], sparkChance: 0.05 },
      { id: 'explosive_kunai', name: 'Explosive Kunai', type: 'attack', desc: 'Attach explosive tags to kunai. 350% damage.', multiplier: 3.5, cooldown: 7, glimmer: true, sparkFrom: ['kunai_rain'], sparkChance: 0.05 },
      { id: 'blinding_ash', name: 'Blinding Ash', type: 'debuff', desc: 'Blow burning ash into the enemy\'s eyes. -50% enemy attack for 3 rounds.', duration: 3, atkMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['smoke_bomb'], sparkChance: 0.06 },
      { id: 'amaterasu_flame', name: 'Amaterasu Flame', type: 'attack', desc: 'Ignite the target with inextinguishable black flames. 450% damage.', multiplier: 4.5, cooldown: 9, glimmer: true, sparkFrom: ['forbidden_jutsu'], sparkChance: 0.04 },
      { id: 'tsukuyomi_nightmare', name: 'Tsukuyomi Nightmare', type: 'debuff', desc: 'Trap the enemy in an illusionary world. -60% enemy attack for 4 rounds.', duration: 4, atkMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['amaterasu_flame'], sparkChance: 0.03 },
      { id: 'nine_tails_cloak', name: 'Nine Tails Cloak', type: 'buff', desc: 'Envelop yourself in demon fox chakra. +150% attack for 3 rounds.', duration: 3, atkMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['chakra_flow'], sparkChance: 0.04 },
      { id: 'rasen_shuriken', name: 'Rasen Shuriken', type: 'attack', desc: 'A spiraling sphere of wind chakra. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['demon_wind_shuriken'], sparkChance: 0.03 },
      { id: 'perfect_susanoo', name: 'Perfect Susanoo', type: 'buff', desc: 'The ultimate spectral armor. +150% defense for 4 rounds.', duration: 4, defMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['susanoo_aura'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'twin_shuriken', name: 'Twin Shuriken', type: 'attack', desc: 'Two shuriken thrown simultaneously. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['shuriken_barrage'], sparkChance: 0.06, chainFamily: 'shuriken_chain', chainRank: 1 },
      { id: 'triple_shuriken', name: 'Triple Shuriken', type: 'attack', desc: 'Three shuriken in a fan pattern. 240% damage.', multiplier: 2.4, cooldown: 4, glimmer: true, sparkFrom: ['twin_shuriken'], sparkChance: 0.049999999999999996, chainFamily: 'shuriken_chain', chainRank: 2 },
      { id: 'shuriken_storm', name: 'Shuriken Storm', type: 'attack', desc: 'A storm of spinning steel. 320% damage.', multiplier: 3.2, cooldown: 5, glimmer: true, sparkFrom: ['triple_shuriken'], sparkChance: 0.039999999999999994, chainFamily: 'shuriken_chain', chainRank: 3 },
      { id: 'thousand_needles', name: 'Thousand Needles', type: 'attack', desc: 'Needles rain from every direction. 420% damage.', multiplier: 4.2, cooldown: 7, glimmer: true, sparkFrom: ['shuriken_storm'], sparkChance: 0.03, chainFamily: 'shuriken_chain', chainRank: 4 },
      { id: 'shuriken_shadow_barrage', name: 'Shuriken Shadow Clone Barrage', type: 'attack', desc: 'Shadow clones each throw a barrage. 550% damage.', multiplier: 5.5, cooldown: 8, glimmer: true, sparkFrom: ['thousand_needles'], sparkChance: 0.03, chainFamily: 'shuriken_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'basic_parry', name: 'Basic Parry', type: 'buff', desc: 'Deflect an incoming attack. +30% defense for 2 rounds.', duration: 2, defMod: 1.3, cooldown: 5, glimmer: true, sparkFrom: ['shadow_step'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'swift_strike', name: 'Swift Strike', type: 'attack', desc: 'A fast, generic attack. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['shuriken_barrage'], sparkChance: 0.08, crossClass: true, pool: 'universal' },
      { id: 'adrenaline_rush', name: 'Adrenaline Rush', type: 'heal', desc: 'A burst of energy restores health. Restores 30% HP.', healPercent: 0.3, cooldown: 5, glimmer: true, sparkFrom: ['chakra_flow'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'trip_attack', name: 'Trip Attack', type: 'debuff', desc: 'Knock the enemy off balance. -20% enemy defense for 2 rounds.', duration: 2, defMod: 0.8, cooldown: 5, glimmer: true, sparkFrom: ['smoke_bomb'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'desperate_blow', name: 'Desperate Blow', type: 'attack', desc: 'A wild swing when cornered. 250% damage.', multiplier: 2.5, cooldown: 6, glimmer: true, sparkFrom: ['forbidden_jutsu'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'heavy_cleave', name: 'Heavy Cleave', type: 'attack', desc: 'A powerful, sweeping strike. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['kunai_rain'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'crushing_blow', name: 'Crushing Blow', type: 'attack', desc: 'A devastating impact that shatters armor. 400% damage.', multiplier: 4.0, cooldown: 8, glimmer: true, sparkFrom: ['demon_wind_shuriken'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'iron_skin', name: 'Iron Skin', type: 'buff', desc: 'Harden your body to resist blows. +80% defense for 3 rounds.', duration: 3, defMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['susanoo_aura'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'war_cry', name: 'War Cry', type: 'debuff', desc: 'An intimidating shout. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['blinding_ash'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'brutal_smash', name: 'Brutal Smash', type: 'attack', desc: 'A raw display of physical power. 350% damage.', multiplier: 3.5, cooldown: 7, glimmer: true, sparkFrom: ['shadow_clone_strike'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  function scavengerAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'sling_shot', name: 'Sling Shot', tier: 0, focusCost: 5, type: 'attack', desc: 'Fire a makeshift projectile. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'makeshift_armor', name: 'Makeshift Armor', tier: 0, focusCost: 3, type: 'buff', desc: 'Strap on scrap metal. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'caltrops', name: 'Caltrops', tier: 1, focusCost: 11, type: 'debuff', desc: 'Scatter spikes. -20% attack and defense for 3 rounds.', duration: 3, atkMod: 0.8, defMod: 0.8, cooldown: 6 },
      { id: 'salvage_strike', name: 'Salvage Strike', tier: 1, focusCost: 12, type: 'attack', desc: 'A vicious strike with a rusted blade. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'scavenged_stim', name: 'Scavenged Stim', tier: 2, focusCost: 21, type: 'heal', desc: 'Inject a questionable stimulant. Restores 40% HP.', healPercent: 0.4, cooldown: 6 },
      { id: 'dirty_trick', name: 'Dirty Trick', tier: 2, focusCost: 17, type: 'debuff', desc: 'Fight dirty. -50% defense for 2 rounds.', duration: 2, defMod: 0.5, cooldown: 7 },
      { id: 'survivalist_instinct', name: 'Survivalist Instinct', tier: 3, focusCost: 23, type: 'buff', desc: 'Tap into primal survival. +100% attack and defense for 4 rounds.', duration: 4, atkMod: 2.0, defMod: 2.0, cooldown: 8 },
      { id: 'scrap_bomb', name: 'Scrap Bomb', tier: 3, focusCost: 25, type: 'attack', desc: 'Detonate a homemade explosive. 500% damage.', multiplier: 5.0, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'ricochet_shot', name: 'Ricochet Shot', type: 'attack', desc: 'Bounce a shot off the environment. 200% damage.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['sling_shot'], sparkChance: 0.08 },
      { id: 'reinforced_plating', name: 'Reinforced Plating', type: 'buff', desc: 'Better scrap armor. +80% defense for 4 rounds.', duration: 4, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['makeshift_armor'], sparkChance: 0.07 },
      { id: 'poisoned_caltrops', name: 'Poisoned Caltrops', type: 'debuff', desc: 'Tainted spikes. -40% attack and defense for 4 rounds.', duration: 4, atkMod: 0.6, defMod: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['caltrops'], sparkChance: 0.06 },
      { id: 'vital_salvage', name: 'Vital Salvage', type: 'attack', desc: 'Strike a weak point with jagged metal. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['salvage_strike'], sparkChance: 0.06 },
      { id: 'adrenaline_surge', name: 'Adrenaline Surge', type: 'heal', desc: 'A potent mix of scavenged chemicals. Restores 70% HP.', healPercent: 0.7, cooldown: 8, glimmer: true, sparkFrom: ['scavenged_stim'], sparkChance: 0.05 },
      { id: 'blinding_sand', name: 'Blinding Sand', type: 'debuff', desc: 'Throw debris in the eyes. -60% attack for 3 rounds.', duration: 3, atkMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['dirty_trick'], sparkChance: 0.05 },
      { id: 'apex_survivor', name: 'Apex Survivor', type: 'buff', desc: 'Become the ultimate predator. +150% attack and defense for 4 rounds.', duration: 4, atkMod: 2.5, defMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['survivalist_instinct'], sparkChance: 0.04 },
      { id: 'shrapnel_storm', name: 'Shrapnel Storm', type: 'attack', desc: 'A devastating blast of jagged scrap. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['scrap_bomb'], sparkChance: 0.04 },
      { id: 'lethal_ricochet', name: 'Lethal Ricochet', type: 'attack', desc: 'A perfectly angled deadly bounce. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['ricochet_shot'], sparkChance: 0.03 },
      { id: 'master_salvager', name: 'Master Salvager', type: 'attack', desc: 'Flawless execution with scavenged weapons. 450% damage.', multiplier: 4.5, cooldown: 8, glimmer: true, sparkFrom: ['vital_salvage'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_sling', name: 'Double Sling', type: 'attack', desc: 'Two stones in quick succession. 160% damage.', multiplier: 1.6, cooldown: 3, glimmer: true, sparkFrom: ['sling_shot'], sparkChance: 0.06, chainFamily: 'sling_chain', chainRank: 1 },
      { id: 'triple_volley_sc', name: 'Triple Volley', type: 'attack', desc: 'Three stones launched in a spread. 210% damage.', multiplier: 2.1, cooldown: 4, glimmer: true, sparkFrom: ['double_sling'], sparkChance: 0.049999999999999996, chainFamily: 'sling_chain', chainRank: 2 },
      { id: 'stone_barrage', name: 'Stone Barrage', type: 'attack', desc: 'A barrage of stones and debris. 280% damage.', multiplier: 2.8, cooldown: 5, glimmer: true, sparkFrom: ['triple_volley_sc'], sparkChance: 0.039999999999999994, chainFamily: 'sling_chain', chainRank: 3 },
      { id: 'hailstorm_sc', name: 'Hailstorm', type: 'attack', desc: 'A hailstorm of improvised projectiles. 360% damage.', multiplier: 3.6, cooldown: 6, glimmer: true, sparkFrom: ['stone_barrage'], sparkChance: 0.03, chainFamily: 'sling_chain', chainRank: 4 },
      { id: 'avalanche_sc', name: 'Avalanche', type: 'attack', desc: 'Everything that isn\'t nailed down becomes a weapon. 480% damage.', multiplier: 4.8, cooldown: 8, glimmer: true, sparkFrom: ['hailstorm_sc'], sparkChance: 0.03, chainFamily: 'sling_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'basic_strike', name: 'Basic Strike', type: 'attack', desc: 'A fundamental combat maneuver. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['sling_shot', 'salvage_strike'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'quick_patch', name: 'Quick Patch', type: 'heal', desc: 'Basic first aid. Restores 30% HP.', healPercent: 0.3, cooldown: 5, glimmer: true, sparkFrom: ['scavenged_stim'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'combat_focus', name: 'Combat Focus', type: 'buff', desc: 'Center yourself for battle. +30% attack for 3 rounds.', duration: 3, atkMod: 1.3, cooldown: 6, glimmer: true, sparkFrom: ['makeshift_armor', 'survivalist_instinct'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'trip_attack', name: 'Trip Attack', type: 'debuff', desc: 'Knock the enemy off balance. -30% defense for 2 rounds.', duration: 2, defMod: 0.7, cooldown: 5, glimmer: true, sparkFrom: ['caltrops', 'dirty_trick'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A solid, weighty strike. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['scrap_bomb'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'crushing_blow', name: 'Crushing Blow', type: 'attack', desc: 'A powerful impact that shatters defenses. 350% damage.', multiplier: 3.5, cooldown: 7, glimmer: true, sparkFrom: ['salvage_strike'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'iron_skin', name: 'Iron Skin', type: 'buff', desc: 'Harden your body against attacks. +100% defense for 3 rounds.', duration: 3, defMod: 2.0, cooldown: 7, glimmer: true, sparkFrom: ['makeshift_armor'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'brutal_tackle', name: 'Brutal Tackle', type: 'debuff', desc: 'Slam into the enemy with raw power. -50% attack and defense for 2 rounds.', duration: 2, atkMod: 0.5, defMod: 0.5, cooldown: 8, glimmer: true, sparkFrom: ['dirty_trick'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Push through the pain. Restores 60% HP.', healPercent: 0.6, cooldown: 9, glimmer: true, sparkFrom: ['scavenged_stim'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'devastating_smash', name: 'Devastating Smash', type: 'attack', desc: 'An overwhelming strike of pure force. 550% damage.', multiplier: 5.5, cooldown: 11, glimmer: true, sparkFrom: ['scrap_bomb'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  /* ── CLERIC SPECS ──────────────────────────────────────────── */
  function paladinAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'lay_on_hands', name: 'Lay on Hands', tier: 0, focusCost: 8, type: 'heal', desc: 'Channel holy energy to restore minor wounds.', healPercent: 0.3, cooldown: 4 },
      { id: 'smite', name: 'Smite', tier: 0, focusCost: 5, type: 'attack', desc: 'Strike the enemy with a burst of holy light.', multiplier: 1.8, cooldown: 3 },
      { id: 'divine_shield', name: 'Divine Shield', tier: 1, focusCost: 10, type: 'buff', desc: 'Envelop yourself in a protective barrier of light.', duration: 3, defMod: 1.5, cooldown: 6 },
      { id: 'holy_nova', name: 'Holy Nova', tier: 1, focusCost: 15, type: 'heal', desc: 'Release an explosion of divine energy to heal yourself.', healPercent: 0.5, cooldown: 6 },
      { id: 'righteous_fury', name: 'Righteous Fury', tier: 2, focusCost: 16, type: 'buff', desc: 'Fill yourself with holy zeal, increasing attack power.', duration: 3, atkMod: 1.8, cooldown: 7 },
      { id: 'hammer_of_justice', name: 'Hammer of Justice', tier: 2, focusCost: 18, type: 'attack', desc: 'Summon a massive ethereal hammer to crush the wicked.', multiplier: 3.5, cooldown: 6 },
      { id: 'aura_of_devotion', name: 'Aura of Devotion', tier: 3, focusCost: 23, type: 'buff', desc: 'Project an aura of absolute protection.', duration: 4, defMod: 2.0, cooldown: 8 },
      { id: 'resurrection_light', name: 'Resurrection Light', tier: 3, focusCost: 28, type: 'heal', desc: 'Call upon the ultimate light to fully restore vitality.', healPercent: 1.0, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'flash_of_light', name: 'Flash of Light', type: 'heal', desc: 'A quick burst of healing energy.', healPercent: 0.4, cooldown: 4, glimmer: true, sparkFrom: ['lay_on_hands'], sparkChance: 0.08 },
      { id: 'blinding_light', name: 'Blinding Light', type: 'debuff', desc: 'A flash so bright it disorients the enemy.', duration: 2, atkMod: 0.6, cooldown: 5, glimmer: true, sparkFrom: ['smite'], sparkChance: 0.06 },
      { id: 'aegis_of_light', name: 'Aegis of Light', type: 'buff', desc: 'A stronger shield that deflects heavy blows.', duration: 3, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['divine_shield'], sparkChance: 0.05 },
      { id: 'cleansing_flame', name: 'Cleansing Flame', type: 'attack', desc: 'Holy fire that burns the impure.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['holy_nova'], sparkChance: 0.05 },
      { id: 'avenging_wrath', name: 'Avenging Wrath', type: 'buff', desc: 'Sprout wings of light, massively boosting attack.', duration: 3, atkMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['righteous_fury'], sparkChance: 0.04 },
      { id: 'executioners_verdict', name: 'Executioner\'s Verdict', type: 'attack', desc: 'A devastating final blow from the heavens.', multiplier: 4.5, cooldown: 8, glimmer: true, sparkFrom: ['hammer_of_justice'], sparkChance: 0.04 },
      { id: 'beacon_of_hope', name: 'Beacon of Hope', type: 'heal', desc: 'A lingering light that restores significant health.', healPercent: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['flash_of_light'], sparkChance: 0.04 },
      { id: 'radiant_glory', name: 'Radiant Glory', type: 'buff', desc: 'Become an untouchable avatar of light.', duration: 4, defMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['aegis_of_light'], sparkChance: 0.03 },
      { id: 'divine_storm', name: 'Divine Storm', type: 'attack', desc: 'A maelstrom of holy energy tearing through foes.', multiplier: 3.8, cooldown: 7, glimmer: true, sparkFrom: ['cleansing_flame'], sparkChance: 0.03 },
      { id: 'word_of_glory', name: 'Word of Glory', type: 'heal', desc: 'A single spoken word that brings near-total restoration.', healPercent: 0.8, cooldown: 8, glimmer: true, sparkFrom: ['beacon_of_hope'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_smite', name: 'Double Smite', type: 'attack', desc: 'Two smites of holy light. 170% damage.', multiplier: 1.7, cooldown: 3, glimmer: true, sparkFrom: ['smite'], sparkChance: 0.06, chainFamily: 'smite_chain', chainRank: 1 },
      { id: 'triple_judgment', name: 'Triple Judgment', type: 'attack', desc: 'Three judgments rain down. 229% damage.', multiplier: 2.3, cooldown: 4, glimmer: true, sparkFrom: ['double_smite'], sparkChance: 0.049999999999999996, chainFamily: 'smite_chain', chainRank: 2 },
      { id: 'holy_barrage', name: 'Holy Barrage', type: 'attack', desc: 'A barrage of divine strikes. 300% damage.', multiplier: 3.0, cooldown: 5, glimmer: true, sparkFrom: ['triple_judgment'], sparkChance: 0.039999999999999994, chainFamily: 'smite_chain', chainRank: 3 },
      { id: 'divine_wrath_pal', name: 'Divine Wrath', type: 'attack', desc: 'The wrath of the heavens. 390% damage.', multiplier: 3.9, cooldown: 7, glimmer: true, sparkFrom: ['holy_barrage'], sparkChance: 0.03, chainFamily: 'smite_chain', chainRank: 4 },
      { id: 'archangels_fury', name: 'Archangel\'s Fury', type: 'attack', desc: 'An archangel\'s fury made manifest. 520% damage.', multiplier: 5.2, cooldown: 8, glimmer: true, sparkFrom: ['divine_wrath_pal'], sparkChance: 0.03, chainFamily: 'smite_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath to restore some health.', healPercent: 0.25, cooldown: 5, glimmer: true, sparkFrom: ['lay_on_hands', 'holy_nova'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'defensive_stance', name: 'Defensive Stance', type: 'buff', desc: 'Adopt a guarded posture.', duration: 2, defMod: 1.3, cooldown: 5, glimmer: true, sparkFrom: ['divine_shield', 'aura_of_devotion'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A generic but powerful strike.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['smite', 'hammer_of_justice'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'intimidating_shout', name: 'Intimidating Shout', type: 'debuff', desc: 'A loud yell that weakens the enemy\'s resolve.', duration: 2, atkMod: 0.7, cooldown: 6, glimmer: true, sparkFrom: ['hammer_of_justice'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'adrenaline_rush', name: 'Adrenaline Rush', type: 'buff', desc: 'A surge of energy increasing attack power.', duration: 2, atkMod: 1.4, cooldown: 6, glimmer: true, sparkFrom: ['righteous_fury'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'arcane_infusion', name: 'Arcane Infusion', type: 'buff', desc: 'Infuse your weapon with raw magical energy.', duration: 3, atkMod: 1.5, cooldown: 6, glimmer: true, sparkFrom: ['divine_shield', 'righteous_fury'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'plasma_smite', name: 'Plasma Smite', type: 'attack', desc: 'A strike superheated by elemental magic.', multiplier: 2.8, cooldown: 5, glimmer: true, sparkFrom: ['smite'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'static_field', name: 'Static Field', type: 'debuff', desc: 'Electrify the air, lowering enemy defenses.', duration: 3, defMod: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['hammer_of_justice'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'energy_barrier', name: 'Energy Barrier', type: 'buff', desc: 'A shimmering shield of pure mana.', duration: 3, defMod: 1.7, cooldown: 7, glimmer: true, sparkFrom: ['aura_of_devotion'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'cauterizing_heal', name: 'Cauterizing Heal', type: 'heal', desc: 'Use magical fire to quickly seal wounds.', healPercent: 0.45, cooldown: 5, glimmer: true, sparkFrom: ['lay_on_hands'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
    ];
  }
  function fieldmedicAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'nano_heal', name: 'Nano Heal', tier: 0, focusCost: 8, type: 'heal', desc: 'Deploy nanobots to repair tissue. Restores 30% HP.', healPercent: 0.3, cooldown: 4 },
      { id: 'energy_barrier', name: 'Energy Barrier', tier: 0, focusCost: 3, type: 'buff', desc: 'Project a hard-light shield. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'plasma_scalpel', name: 'Plasma Scalpel', tier: 1, focusCost: 12, type: 'attack', desc: 'A precise, superheated cut. 180% damage.', multiplier: 1.8, cooldown: 4 },
      { id: 'stim_pack', name: 'Stim Pack', tier: 1, focusCost: 10, type: 'buff', desc: 'Inject combat stimulants. +40% attack for 3 rounds.', duration: 3, atkMod: 1.4, cooldown: 6 },
      { id: 'full_restore', name: 'Full Restore', tier: 2, focusCost: 21, type: 'heal', desc: 'Advanced medical suite activation. Restores 80% HP.', healPercent: 0.8, cooldown: 8 },
      { id: 'stasis_field', name: 'Stasis Field', tier: 2, focusCost: 17, type: 'debuff', desc: 'Trap the target in localized time dilation. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 7 },
      { id: 'orbital_strike', name: 'Orbital Strike', tier: 3, focusCost: 25, type: 'attack', desc: 'Call down a medical-grade laser bombardment. 400% damage.', multiplier: 4.0, cooldown: 10 },
      { id: 'resurrection_protocol', name: 'Resurrection Protocol', tier: 3, focusCost: 28, type: 'heal', desc: 'Defibrillate and fully repair. Restores 100% HP.', healPercent: 1.0, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'micro_bots', name: 'Micro Bots', type: 'heal', desc: 'Swarm of healing bots. Restores 45% HP.', healPercent: 0.45, cooldown: 5, glimmer: true, sparkFrom: ['nano_heal'], sparkChance: 0.06 },
      { id: 'cellular_regeneration', name: 'Cellular Regeneration', type: 'heal', desc: 'Rapid cell division. Restores 60% HP.', healPercent: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['micro_bots'], sparkChance: 0.04 },
      { id: 'deflector_shield', name: 'Deflector Shield', type: 'buff', desc: 'Advanced energy shield. +80% defense for 3 rounds.', duration: 3, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['energy_barrier'], sparkChance: 0.05 },
      { id: 'kinetic_absorber', name: 'Kinetic Absorber', type: 'buff', desc: 'Absorbs incoming force. +120% defense for 2 rounds.', duration: 2, defMod: 2.2, cooldown: 7, glimmer: true, sparkFrom: ['deflector_shield'], sparkChance: 0.03 },
      { id: 'laser_incision', name: 'Laser Incision', type: 'attack', desc: 'Deep cutting laser. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['plasma_scalpel'], sparkChance: 0.06 },
      { id: 'surgical_strike', name: 'Surgical Strike', type: 'attack', desc: 'Targeted vital organ strike. 350% damage.', multiplier: 3.5, cooldown: 7, glimmer: true, sparkFrom: ['laser_incision'], sparkChance: 0.04 },
      { id: 'neural_inhibitor', name: 'Neural Inhibitor', type: 'debuff', desc: 'Scrambles enemy nervous system. -60% enemy attack for 2 rounds.', duration: 2, atkMod: 0.4, cooldown: 6, glimmer: true, sparkFrom: ['stasis_field'], sparkChance: 0.05 },
      { id: 'adrenaline_surge', name: 'Adrenaline Surge', type: 'buff', desc: 'Massive combat stimulant dose. +80% attack for 2 rounds.', duration: 2, atkMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['stim_pack'], sparkChance: 0.05 },
      { id: 'ion_cannon', name: 'Ion Cannon', type: 'attack', desc: 'Concentrated orbital blast. 500% damage.', multiplier: 5.0, cooldown: 11, glimmer: true, sparkFrom: ['orbital_strike'], sparkChance: 0.04 },
      { id: 'triage_matrix', name: 'Triage Matrix', type: 'heal', desc: 'Emergency multi-target heal protocol. Restores 70% HP.', healPercent: 0.7, cooldown: 7, glimmer: true, sparkFrom: ['full_restore'], sparkChance: 0.05 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_incision', name: 'Double Incision', type: 'attack', desc: 'Two precise incisions. 160% damage.', multiplier: 1.6, cooldown: 3, glimmer: true, sparkFrom: ['plasma_scalpel'], sparkChance: 0.06, chainFamily: 'scalpel_chain', chainRank: 1 },
      { id: 'triple_cut_fm', name: 'Triple Cut', type: 'attack', desc: 'Three surgical cuts. 210% damage.', multiplier: 2.1, cooldown: 4, glimmer: true, sparkFrom: ['double_incision'], sparkChance: 0.049999999999999996, chainFamily: 'scalpel_chain', chainRank: 2 },
      { id: 'surgical_barrage', name: 'Surgical Barrage', type: 'attack', desc: 'A barrage of scalpel strikes. 280% damage.', multiplier: 2.8, cooldown: 5, glimmer: true, sparkFrom: ['triple_cut_fm'], sparkChance: 0.039999999999999994, chainFamily: 'scalpel_chain', chainRank: 3 },
      { id: 'precision_storm_fm', name: 'Precision Storm', type: 'attack', desc: 'A storm of surgical precision. 360% damage.', multiplier: 3.6, cooldown: 6, glimmer: true, sparkFrom: ['surgical_barrage'], sparkChance: 0.03, chainFamily: 'scalpel_chain', chainRank: 4 },
      { id: 'vivisection', name: 'Vivisection', type: 'attack', desc: 'You know exactly where to cut. 480% damage.', multiplier: 4.8, cooldown: 8, glimmer: true, sparkFrom: ['precision_storm_fm'], sparkChance: 0.03, chainFamily: 'scalpel_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'tactical_roll', name: 'Tactical Roll', type: 'buff', desc: 'Evade incoming fire. +40% defense for 2 rounds.', duration: 2, defMod: 1.4, cooldown: 5, glimmer: true, sparkFrom: ['energy_barrier', 'stim_pack'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'combat_medic_strike', name: 'Combat Medic Strike', type: 'attack', desc: 'A quick jab while treating. 150% damage.', multiplier: 1.5, cooldown: 4, glimmer: true, sparkFrom: ['plasma_scalpel', 'orbital_strike'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'field_bandage', name: 'Field Bandage', type: 'heal', desc: 'Quick patch up. Restores 25% HP.', healPercent: 0.25, cooldown: 4, glimmer: true, sparkFrom: ['nano_heal', 'full_restore'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'suppressive_fire', name: 'Suppressive Fire', type: 'debuff', desc: 'Pin down the enemy. -30% enemy attack for 2 rounds.', duration: 2, atkMod: 0.7, cooldown: 5, glimmer: true, sparkFrom: ['stasis_field'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'battle_cry', name: 'Battle Cry', type: 'buff', desc: 'Inspire allies. +30% attack for 3 rounds.', duration: 3, atkMod: 1.3, cooldown: 6, glimmer: true, sparkFrom: ['stim_pack'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'plasma_discharge', name: 'Plasma Discharge', type: 'attack', desc: 'Release excess energy as a blast. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['plasma_scalpel'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'energy_siphon', name: 'Energy Siphon', type: 'heal', desc: 'Drain energy to heal. Restores 35% HP.', healPercent: 0.35, cooldown: 5, glimmer: true, sparkFrom: ['nano_heal'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'overcharge_shield', name: 'Overcharge Shield', type: 'buff', desc: 'Infuse shield with raw magic. +70% defense for 2 rounds.', duration: 2, defMod: 1.7, cooldown: 6, glimmer: true, sparkFrom: ['energy_barrier'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'static_field', name: 'Static Field', type: 'debuff', desc: 'Electrify the air. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['stasis_field'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'arcane_infusion', name: 'Arcane Infusion', type: 'buff', desc: 'Magical energy boost. +60% attack for 3 rounds.', duration: 3, atkMod: 1.6, cooldown: 7, glimmer: true, sparkFrom: ['stim_pack'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  function grifterAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'snake_oil', name: 'Snake Oil', tier: 0, focusCost: 8, type: 'heal', desc: 'A dubious concoction that somehow knits wounds. Restores 20% HP.', healPercent: 0.2, cooldown: 4 },
      { id: 'misdirection', name: 'Misdirection', tier: 0, focusCost: 4, type: 'debuff', desc: 'Distract the mark. -30% enemy attack for 2 rounds.', duration: 2, atkMod: 0.7, cooldown: 5 },
      { id: 'loaded_dice', name: 'Loaded Dice', tier: 1, focusCost: 10, type: 'buff', desc: 'Tip the odds in your favor. +50% attack for 3 rounds.', duration: 3, atkMod: 1.5, cooldown: 6 },
      { id: 'cheap_shot', name: 'Cheap Shot', tier: 1, focusCost: 12, type: 'attack', desc: 'A dirty strike when they aren\'t looking. 150% damage.', multiplier: 1.5, cooldown: 3 },
      { id: 'ace_in_the_hole', name: 'Ace in the Hole', tier: 2, focusCost: 21, type: 'heal', desc: 'Reveal your hidden advantage. Restores 50% HP.', healPercent: 0.5, cooldown: 6 },
      { id: 'smoke_and_mirrors', name: 'Smoke and Mirrors', tier: 2, focusCost: 17, type: 'debuff', desc: 'Confuse the enemy completely. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 6 },
      { id: 'the_long_con', name: 'The Long Con', tier: 3, focusCost: 24, type: 'debuff', desc: 'The culmination of your scheme. -70% enemy attack and defense for 4 rounds.', duration: 4, atkMod: 0.3, defMod: 0.3, cooldown: 8 },
      { id: 'payoff', name: 'Payoff', tier: 3, focusCost: 25, type: 'attack', desc: 'Cash in your chips for a massive strike. 400% damage.', multiplier: 4.0, cooldown: 8 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'miracle_cure', name: 'Miracle Cure', type: 'heal', desc: 'A surprisingly effective remedy. Restores 40% HP.', healPercent: 0.4, cooldown: 5, glimmer: true, sparkFrom: ['snake_oil'], sparkChance: 0.08 },
      { id: 'false_trail', name: 'False Trail', type: 'debuff', desc: 'Lead them down the wrong path. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['misdirection'], sparkChance: 0.07 },
      { id: 'rigged_game', name: 'Rigged Game', type: 'buff', desc: 'Ensure your victory. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['loaded_dice'], sparkChance: 0.06 },
      { id: 'sucker_punch', name: 'Sucker Punch', type: 'attack', desc: 'A brutal unexpected blow. 250% damage.', multiplier: 2.5, cooldown: 4, glimmer: true, sparkFrom: ['cheap_shot'], sparkChance: 0.08 },
      { id: 'double_cross', name: 'Double Cross', type: 'attack', desc: 'Betray their trust for severe damage. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['sucker_punch'], sparkChance: 0.05 },
      { id: 'panacea', name: 'Panacea', type: 'heal', desc: 'The ultimate cure-all. Restores 80% HP.', healPercent: 0.8, cooldown: 8, glimmer: true, sparkFrom: ['miracle_cure'], sparkChance: 0.04 },
      { id: 'shell_game', name: 'Shell Game', type: 'debuff', desc: 'Keep them guessing. -60% enemy defense for 3 rounds.', duration: 3, defMod: 0.4, cooldown: 7, glimmer: true, sparkFrom: ['smoke_and_mirrors'], sparkChance: 0.06 },
      { id: 'house_always_wins', name: 'House Always Wins', type: 'buff', desc: 'Unbeatable odds. +120% attack for 4 rounds.', duration: 4, atkMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['rigged_game'], sparkChance: 0.04 },
      { id: 'royal_flush', name: 'Royal Flush', type: 'attack', desc: 'The perfect hand. 500% damage.', multiplier: 5.0, cooldown: 10, glimmer: true, sparkFrom: ['payoff'], sparkChance: 0.05 },
      { id: 'ultimate_betrayal', name: 'Ultimate Betrayal', type: 'attack', desc: 'The knife in the back. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['double_cross'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_cross_gr', name: 'Double Cross', type: 'attack', desc: 'A double-cross they never saw coming. 160% damage.', multiplier: 1.6, cooldown: 3, glimmer: true, sparkFrom: ['snake_oil'], sparkChance: 0.06, chainFamily: 'trick_chain', chainRank: 1 },
      { id: 'triple_bluff', name: 'Triple Bluff', type: 'attack', desc: 'Three layers of deception. 210% damage.', multiplier: 2.1, cooldown: 4, glimmer: true, sparkFrom: ['double_cross_gr'], sparkChance: 0.049999999999999996, chainFamily: 'trick_chain', chainRank: 2 },
      { id: 'shell_game', name: 'Shell Game', type: 'attack', desc: 'Now you see it, now you don\'t. 270% damage.', multiplier: 2.7, cooldown: 5, glimmer: true, sparkFrom: ['triple_bluff'], sparkChance: 0.039999999999999994, chainFamily: 'trick_chain', chainRank: 3 },
      { id: 'long_con', name: 'Long Con', type: 'attack', desc: 'The long con pays off. 350% damage.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['shell_game'], sparkChance: 0.03, chainFamily: 'trick_chain', chainRank: 4 },
      { id: 'house_always_wins', name: 'House Always Wins', type: 'attack', desc: 'The house always wins. 470% damage.', multiplier: 4.7, cooldown: 8, glimmer: true, sparkFrom: ['long_con'], sparkChance: 0.03, chainFamily: 'trick_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'basic_strike', name: 'Basic Strike', type: 'attack', desc: 'A fundamental combat maneuver. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['cheap_shot', 'sucker_punch', 'payoff'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'defensive_stance', name: 'Defensive Stance', type: 'buff', desc: 'Adopt a guarded posture. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5, glimmer: true, sparkFrom: ['loaded_dice', 'rigged_game'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'quick_step', name: 'Quick Step', type: 'buff', desc: 'Increase your evasion and speed. +40% defense for 2 rounds.', duration: 2, defMod: 1.4, cooldown: 5, glimmer: true, sparkFrom: ['loaded_dice'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'heavy_blow', name: 'Heavy Blow', type: 'attack', desc: 'A weighty strike that crushes armor. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['sucker_punch', 'double_cross'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'tactical_retreat', name: 'Tactical Retreat', type: 'heal', desc: 'Fall back to recover. Restores 30% HP.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['snake_oil', 'miracle_cure'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'energy_drain', name: 'Energy Drain', type: 'attack', desc: 'Siphon arcane energy from the target. 200% damage.', multiplier: 2.0, cooldown: 5, glimmer: true, sparkFrom: ['cheap_shot', 'payoff'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'static_shock', name: 'Static Shock', type: 'debuff', desc: 'Jolt the enemy\'s nervous system. -40% enemy attack for 2 rounds.', duration: 2, atkMod: 0.6, cooldown: 5, glimmer: true, sparkFrom: ['misdirection', 'smoke_and_mirrors'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'arcane_barrier', name: 'Arcane Barrier', type: 'buff', desc: 'A shield of pure energy. +80% defense for 3 rounds.', duration: 3, defMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['loaded_dice', 'rigged_game'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'healing_spark', name: 'Healing Spark', type: 'heal', desc: 'Cauterize wounds with magical energy. Restores 45% HP.', healPercent: 0.45, cooldown: 6, glimmer: true, sparkFrom: ['snake_oil', 'ace_in_the_hole'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'mind_wipe', name: 'Mind Wipe', type: 'debuff', desc: 'Erase their short-term memory. -60% enemy attack and defense for 2 rounds.', duration: 2, atkMod: 0.4, defMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['the_long_con', 'smoke_and_mirrors'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }
  function combatmedicAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'field_patch', name: 'Field Patch', tier: 0, focusCost: 8, type: 'heal', desc: 'Quickly bandage wounds. Restores 30% HP.', healPercent: 0.3, cooldown: 4 },
      { id: 'suppressive_fire', name: 'Suppressive Fire', tier: 0, focusCost: 4, type: 'debuff', desc: 'Pin down the enemy. -30% enemy attack for 2 rounds.', duration: 2, atkMod: 0.7, cooldown: 5 },
      { id: 'combat_revive', name: 'Combat Revive', tier: 1, focusCost: 15, type: 'heal', desc: 'Shock a fallen ally back to life. Restores 50% HP.', healPercent: 0.5, cooldown: 8 },
      { id: 'adrenaline_shot', name: 'Adrenaline Shot', tier: 1, focusCost: 10, type: 'buff', desc: 'Inject combat stimulants. +50% attack for 3 rounds.', duration: 3, atkMod: 1.5, cooldown: 6 },
      { id: 'medevac', name: 'Medevac', tier: 2, focusCost: 21, type: 'heal', desc: 'Call in a medical evacuation chopper. Restores 80% HP.', healPercent: 0.8, cooldown: 10 },
      { id: 'smoke_grenade', name: 'Smoke Grenade', tier: 2, focusCost: 17, type: 'debuff', desc: 'Obscure vision. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 6 },
      { id: 'trauma_center', name: 'Trauma Center', tier: 3, focusCost: 28, type: 'heal', desc: 'Deploy a mobile hospital. Restores 100% HP.', healPercent: 1.0, cooldown: 10 },
      { id: 'gunship_support', name: 'Gunship Support', tier: 3, focusCost: 25, type: 'attack', desc: 'Call in heavy air support. 500% damage.', multiplier: 5.0, cooldown: 12 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'rapid_patch', name: 'Rapid Patch', type: 'heal', desc: 'Apply bandages with lightning speed. Restores 40% HP.', healPercent: 0.4, cooldown: 4, glimmer: true, sparkFrom: ['field_patch'], sparkChance: 0.08 },
      { id: 'covering_fire', name: 'Covering Fire', type: 'attack', desc: 'Shoot while moving. 150% damage.', multiplier: 1.5, cooldown: 3, glimmer: true, sparkFrom: ['suppressive_fire'], sparkChance: 0.07 },
      { id: 'defibrillator_shock', name: 'Defibrillator Shock', type: 'attack', desc: 'Use paddles offensively. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['combat_revive'], sparkChance: 0.05 },
      { id: 'combat_stim', name: 'Combat Stim', type: 'buff', desc: 'Advanced stimulants. +80% attack for 3 rounds.', duration: 3, atkMod: 1.8, cooldown: 7, glimmer: true, sparkFrom: ['adrenaline_shot'], sparkChance: 0.06 },
      { id: 'mass_evac', name: 'Mass Evac', type: 'heal', desc: 'Evacuate the whole squad. Restores 90% HP.', healPercent: 0.9, cooldown: 10, glimmer: true, sparkFrom: ['medevac'], sparkChance: 0.04 },
      { id: 'tear_gas', name: 'Tear Gas', type: 'debuff', desc: 'Choking gas. -60% enemy attack for 4 rounds.', duration: 4, atkMod: 0.4, cooldown: 8, glimmer: true, sparkFrom: ['smoke_grenade'], sparkChance: 0.05 },
      { id: 'triage_protocol', name: 'Triage Protocol', type: 'heal', desc: 'Prioritize critical wounds. Restores 100% HP.', healPercent: 1.0, cooldown: 8, glimmer: true, sparkFrom: ['trauma_center'], sparkChance: 0.03 },
      { id: 'danger_close', name: 'Danger Close', type: 'attack', desc: 'Call artillery on your own position. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['gunship_support'], sparkChance: 0.03 },
      { id: 'auto_injector', name: 'Auto Injector', type: 'heal', desc: 'Automated healing system. Restores 60% HP.', healPercent: 0.6, cooldown: 5, glimmer: true, sparkFrom: ['rapid_patch'], sparkChance: 0.04 },
      { id: 'heavy_suppression', name: 'Heavy Suppression', type: 'debuff', desc: 'Overwhelming fire. -70% enemy defense for 3 rounds.', duration: 3, defMod: 0.3, cooldown: 7, glimmer: true, sparkFrom: ['covering_fire'], sparkChance: 0.04 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_patch', name: 'Double Patch', type: 'heal', desc: 'Two quick patches. Heal 25% HP.', healPercent: 0.25, cooldown: 4, glimmer: true, sparkFrom: ['field_patch'], sparkChance: 0.06, chainFamily: 'triage_chain', chainRank: 1 },
      { id: 'triple_triage', name: 'Triple Triage', type: 'heal', desc: 'Three rapid triage applications. Heal 35% HP.', healPercent: 0.35, cooldown: 5, glimmer: true, sparkFrom: ['double_patch'], sparkChance: 0.049999999999999996, chainFamily: 'triage_chain', chainRank: 2 },
      { id: 'field_surgery', name: 'Field Surgery', type: 'heal', desc: 'Emergency field surgery. Heal 45% HP.', healPercent: 0.45, cooldown: 6, glimmer: true, sparkFrom: ['triple_triage'], sparkChance: 0.039999999999999994, chainFamily: 'triage_chain', chainRank: 3 },
      { id: 'mass_heal_cm', name: 'Mass Heal', type: 'heal', desc: 'Healing on a massive scale. Heal 60% HP.', healPercent: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['field_surgery'], sparkChance: 0.03, chainFamily: 'triage_chain', chainRank: 4 },
      { id: 'miracle_worker', name: 'Miracle Worker', type: 'heal', desc: 'They said it couldn\'t be done. Heal 80% HP.', healPercent: 0.8, cooldown: 9, glimmer: true, sparkFrom: ['mass_heal_cm'], sparkChance: 0.03, chainFamily: 'triage_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'tactical_roll', name: 'Tactical Roll', type: 'buff', desc: 'Evade incoming fire. +50% defense for 2 rounds.', duration: 2, defMod: 1.5, cooldown: 5, glimmer: true, sparkFrom: ['adrenaline_shot', 'combat_stim'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'quick_strike', name: 'Quick Strike', type: 'attack', desc: 'A fast melee attack. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['covering_fire', 'defibrillator_shock'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'desperate_block', name: 'Desperate Block', type: 'buff', desc: 'Block with whatever is handy. +100% defense for 2 rounds.', duration: 2, defMod: 2.0, cooldown: 6, glimmer: true, sparkFrom: ['field_patch', 'rapid_patch'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'counter_shot', name: 'Counter Shot', type: 'attack', desc: 'Return fire immediately. 200% damage.', multiplier: 2.0, cooldown: 5, glimmer: true, sparkFrom: ['suppressive_fire', 'heavy_suppression'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Push through the pain. Restores 40% HP.', healPercent: 0.4, cooldown: 6, glimmer: true, sparkFrom: ['combat_revive', 'medevac'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'plasma_cauterize', name: 'Plasma Cauterize', type: 'heal', desc: 'Use energy to seal wounds. Restores 70% HP.', healPercent: 0.7, cooldown: 7, glimmer: true, sparkFrom: ['field_patch', 'rapid_patch'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'laser_designator', name: 'Laser Designator', type: 'debuff', desc: 'Paint the target with energy. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['suppressive_fire', 'smoke_grenade'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'energy_shield', name: 'Energy Shield', type: 'buff', desc: 'Deploy a hard-light barrier. +120% defense for 3 rounds.', duration: 3, defMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['adrenaline_shot', 'combat_stim'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'ion_blast', name: 'Ion Blast', type: 'attack', desc: 'Discharge stored energy. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['defibrillator_shock', 'danger_close'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
      { id: 'stasis_field', name: 'Stasis Field', type: 'debuff', desc: 'Trap enemies in time. -60% enemy attack for 2 rounds.', duration: 2, atkMod: 0.4, cooldown: 7, glimmer: true, sparkFrom: ['smoke_grenade', 'tear_gas'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function monkAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'ki_heal', name: 'Ki Heal', tier: 0, focusCost: 8, type: 'heal', desc: 'Channel basic ki to restore health.', healPercent: 0.3, cooldown: 4 },
      { id: 'iron_body', name: 'Iron Body', tier: 0, focusCost: 3, type: 'buff', desc: 'Harden your body with ki. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'pressure_point', name: 'Pressure Point', tier: 1, focusCost: 12, type: 'attack', desc: 'Strike a vital point. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'inner_peace', name: 'Inner Peace', tier: 1, focusCost: 15, type: 'heal', desc: 'Meditate to restore significant health.', healPercent: 0.5, cooldown: 6 },
      { id: 'aura_blast', name: 'Aura Blast', tier: 2, focusCost: 18, type: 'attack', desc: 'Project your ki as a destructive wave. 350% damage.', multiplier: 3.5, cooldown: 6 },
      { id: 'crippling_strike', name: 'Crippling Strike', tier: 2, focusCost: 17, type: 'debuff', desc: 'Strike nerves to weaken the enemy. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 6 },
      { id: 'thousand_fists', name: 'Thousand Fists', tier: 3, focusCost: 25, type: 'attack', desc: 'A blinding flurry of strikes. 550% damage.', multiplier: 5.5, cooldown: 10 },
      { id: 'nirvana_rebirth', name: 'Nirvana Rebirth', tier: 3, focusCost: 28, type: 'heal', desc: 'Ultimate healing technique. Restores full health.', healPercent: 1.0, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'ki_wave', name: 'Ki Wave', type: 'attack', desc: 'A ranged ki attack. 250% damage.', multiplier: 2.5, cooldown: 5, glimmer: true, sparkFrom: ['pressure_point'], sparkChance: 0.06 },
      { id: 'diamond_body', name: 'Diamond Body', type: 'buff', desc: 'Perfected defensive stance. +100% defense for 4 rounds.', duration: 4, defMod: 2.0, cooldown: 7, glimmer: true, sparkFrom: ['iron_body'], sparkChance: 0.05 },
      { id: 'healing_wind', name: 'Healing Wind', type: 'heal', desc: 'A soothing aura of ki. Restores 45% health.', healPercent: 0.45, cooldown: 5, glimmer: true, sparkFrom: ['ki_heal'], sparkChance: 0.07 },
      { id: 'tenketsu_seal', name: 'Tenketsu Seal', type: 'debuff', desc: 'Block the enemy\'s energy flow. -50% enemy attack for 4 rounds.', duration: 4, atkMod: 0.5, cooldown: 7, glimmer: true, sparkFrom: ['pressure_point', 'crippling_strike'], sparkChance: 0.05 },
      { id: 'spirit_bomb', name: 'Spirit Bomb', type: 'attack', desc: 'Gather ambient energy for a massive attack. 450% damage.', multiplier: 4.5, cooldown: 8, glimmer: true, sparkFrom: ['aura_blast'], sparkChance: 0.04 },
      { id: 'asura_strike', name: 'Asura Strike', type: 'attack', desc: 'Unleash demonic martial prowess. 600% damage.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['thousand_fists'], sparkChance: 0.03 },
      { id: 'lotus_blossom', name: 'Lotus Blossom', type: 'heal', desc: 'Advanced meditation technique. Restores 70% health.', healPercent: 0.7, cooldown: 8, glimmer: true, sparkFrom: ['inner_peace'], sparkChance: 0.05 },
      { id: 'void_palm', name: 'Void Palm', type: 'attack', desc: 'An attack that strikes empty space to hit the target. 300% damage.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['ki_wave'], sparkChance: 0.04 },
      { id: 'celestial_mantle', name: 'Celestial Mantle', type: 'buff', desc: 'Wrap yourself in divine ki. +150% defense for 3 rounds.', duration: 3, defMod: 2.5, cooldown: 8, glimmer: true, sparkFrom: ['diamond_body'], sparkChance: 0.03 },
      { id: 'samsara_cycle', name: 'Samsara Cycle', type: 'heal', desc: 'Transcend mortality. Restores 90% health.', healPercent: 0.9, cooldown: 9, glimmer: true, sparkFrom: ['nirvana_rebirth'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'twin_palm', name: 'Twin Palm', type: 'attack', desc: 'Two palm strikes in rapid succession. 180% damage.', multiplier: 1.8, cooldown: 3, glimmer: true, sparkFrom: ['pressure_point'], sparkChance: 0.06, chainFamily: 'palm_chain', chainRank: 1 },
      { id: 'triple_strike_mk', name: 'Triple Strike', type: 'attack', desc: 'Three strikes channeling ki. 240% damage.', multiplier: 2.4, cooldown: 4, glimmer: true, sparkFrom: ['twin_palm'], sparkChance: 0.049999999999999996, chainFamily: 'palm_chain', chainRank: 2 },
      { id: 'five_point_palm', name: 'Five-Point Palm', type: 'attack', desc: 'Five precise palm strikes to pressure points. 320% damage.', multiplier: 3.2, cooldown: 5, glimmer: true, sparkFrom: ['triple_strike_mk'], sparkChance: 0.039999999999999994, chainFamily: 'palm_chain', chainRank: 3 },
      { id: 'hundred_fists', name: 'Hundred Fists', type: 'attack', desc: 'A hundred fists rain down. 420% damage.', multiplier: 4.2, cooldown: 7, glimmer: true, sparkFrom: ['five_point_palm'], sparkChance: 0.03, chainFamily: 'palm_chain', chainRank: 4 },
      { id: 'fist_north_star', name: 'Fist of the North Star', type: 'attack', desc: 'You are already dead. 550% damage.', multiplier: 5.5, cooldown: 8, glimmer: true, sparkFrom: ['hundred_fists'], sparkChance: 0.03, chainFamily: 'palm_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'quick_step', name: 'Quick Step', type: 'buff', desc: 'A sudden burst of speed. +50% defense for 2 rounds.', duration: 2, defMod: 1.5, cooldown: 5, glimmer: true, sparkFrom: ['iron_body'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'counter_throw', name: 'Counter Throw', type: 'attack', desc: 'Use the enemy\'s momentum against them. 180% damage.', multiplier: 1.8, cooldown: 4, glimmer: true, sparkFrom: ['pressure_point'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'adrenaline_rush', name: 'Adrenaline Rush', type: 'heal', desc: 'Push past the pain. Restores 25% health.', healPercent: 0.25, cooldown: 5, glimmer: true, sparkFrom: ['ki_heal'], sparkChance: 0.07, crossClass: true, pool: 'universal' },
      { id: 'leg_sweep', name: 'Leg Sweep', type: 'debuff', desc: 'Knock the enemy off balance. -30% enemy attack for 2 rounds.', duration: 2, atkMod: 0.7, cooldown: 5, glimmer: true, sparkFrom: ['crippling_strike'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'haymaker', name: 'Haymaker', type: 'attack', desc: 'A wild, powerful swing. 220% damage.', multiplier: 2.2, cooldown: 5, glimmer: true, sparkFrom: ['thousand_fists'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'plasma_fist', name: 'Plasma Fist', type: 'attack', desc: 'Infuse your strike with electrical energy. 320% damage.', multiplier: 3.2, cooldown: 6, glimmer: true, sparkFrom: ['aura_blast'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'static_field', name: 'Static Field', type: 'debuff', desc: 'Electrify the air to slow the enemy. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 6, glimmer: true, sparkFrom: ['crippling_strike'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'energy_shield', name: 'Energy Shield', type: 'buff', desc: 'A barrier of pure magic. +80% defense for 3 rounds.', duration: 3, defMod: 1.8, cooldown: 6, glimmer: true, sparkFrom: ['iron_body'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'cauterize_wounds', name: 'Cauterize Wounds', type: 'heal', desc: 'Use heat to seal injuries. Restores 35% health.', healPercent: 0.35, cooldown: 5, glimmer: true, sparkFrom: ['ki_heal'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'nova_burst', name: 'Nova Burst', type: 'attack', desc: 'An explosive release of energy. 400% damage.', multiplier: 4.0, cooldown: 7, glimmer: true, sparkFrom: ['spirit_bomb'], sparkChance: 0.03, crossClass: true, pool: 'affinity' },
    ];
  }
  function priestAbilities() {
    return [
      // ── Trainable (bought with QP) ──
      { id: 'blessing', name: 'Blessing', tier: 0, focusCost: 8, type: 'heal', desc: 'A basic prayer that restores health.', healPercent: 0.3, cooldown: 4 },
      { id: 'holy_strike', name: 'Holy Strike', tier: 0, focusCost: 5, type: 'attack', desc: 'Strike the enemy with holy power.', multiplier: 1.5, cooldown: 3 },
      { id: 'sanctuary', name: 'Sanctuary', tier: 1, focusCost: 10, type: 'buff', desc: 'Create a safe haven. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'exorcism', name: 'Exorcism', tier: 1, focusCost: 12, type: 'attack', desc: 'Expel evil spirits, dealing heavy damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'miracle', name: 'Miracle', tier: 2, focusCost: 21, type: 'heal', desc: 'A miraculous healing that restores significant health.', healPercent: 0.6, cooldown: 6 },
      { id: 'divine_ward', name: 'Divine Ward', tier: 2, focusCost: 16, type: 'buff', desc: 'A powerful ward. +80% defense for 4 rounds.', duration: 4, defMod: 1.8, cooldown: 7 },
      { id: 'resurrection', name: 'Resurrection', tier: 3, focusCost: 28, type: 'heal', desc: 'Bring back from the brink of death. Fully restores health.', healPercent: 1.0, cooldown: 10 },
      { id: 'wrath_of_god', name: 'Wrath of God', tier: 3, focusCost: 25, type: 'attack', desc: 'Unleash divine fury upon the enemy.', multiplier: 5.0, cooldown: 10 },
      // ── Spec Glimmers (discovered mid-combat) ──
      { id: 'greater_blessing', name: 'Greater Blessing', type: 'heal', desc: 'An empowered blessing.', healPercent: 0.45, cooldown: 5, glimmer: true, sparkFrom: ['blessing'], sparkChance: 0.06 },
      { id: 'mass_blessing', name: 'Mass Blessing', type: 'heal', desc: 'A blessing that covers all allies.', healPercent: 0.6, cooldown: 7, glimmer: true, sparkFrom: ['greater_blessing'], sparkChance: 0.04 },
      { id: 'smite', name: 'Smite', type: 'attack', desc: 'A focused strike of holy energy.', multiplier: 2.2, cooldown: 4, glimmer: true, sparkFrom: ['holy_strike'], sparkChance: 0.07 },
      { id: 'holy_nova', name: 'Holy Nova', type: 'attack', desc: 'An explosion of holy light.', multiplier: 3.5, cooldown: 6, glimmer: true, sparkFrom: ['smite'], sparkChance: 0.05 },
      { id: 'sacred_ground', name: 'Sacred Ground', type: 'buff', desc: 'Consecrate the ground. +100% defense for 3 rounds.', duration: 3, defMod: 2.0, cooldown: 6, glimmer: true, sparkFrom: ['sanctuary'], sparkChance: 0.05 },
      { id: 'banish', name: 'Banish', type: 'attack', desc: 'Attempt to banish the enemy to another realm.', multiplier: 3.8, cooldown: 7, glimmer: true, sparkFrom: ['exorcism'], sparkChance: 0.06 },
      { id: 'divine_intervention', name: 'Divine Intervention', type: 'heal', desc: 'The gods intervene to save you.', healPercent: 0.8, cooldown: 8, glimmer: true, sparkFrom: ['miracle'], sparkChance: 0.04 },
      { id: 'aura_of_light', name: 'Aura of Light', type: 'buff', desc: 'Radiate holy light. +120% defense for 4 rounds.', duration: 4, defMod: 2.2, cooldown: 8, glimmer: true, sparkFrom: ['divine_ward'], sparkChance: 0.05 },
      { id: 'breath_of_life', name: 'Breath of Life', type: 'heal', desc: 'Breathe life into the dying.', healPercent: 0.9, cooldown: 9, glimmer: true, sparkFrom: ['resurrection'], sparkChance: 0.03 },
      { id: 'judgment', name: 'Judgment', type: 'attack', desc: 'The final judgment.', multiplier: 6.0, cooldown: 12, glimmer: true, sparkFrom: ['wrath_of_god'], sparkChance: 0.03 },
      // ── Scaling Chains (progressive multi-hit) ──
      { id: 'double_blessing', name: 'Double Blessing', type: 'heal', desc: 'Two blessings in quick succession. Heal 30% HP.', healPercent: 0.3, cooldown: 4, glimmer: true, sparkFrom: ['blessing'], sparkChance: 0.06, chainFamily: 'prayer_chain', chainRank: 1 },
      { id: 'triple_prayer', name: 'Triple Prayer', type: 'heal', desc: 'Three prayers answered. Heal 40% HP.', healPercent: 0.4, cooldown: 5, glimmer: true, sparkFrom: ['double_blessing'], sparkChance: 0.049999999999999996, chainFamily: 'prayer_chain', chainRank: 2 },
      { id: 'mass_benediction', name: 'Mass Benediction', type: 'heal', desc: 'A benediction for all. Heal 50% HP.', healPercent: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['triple_prayer'], sparkChance: 0.039999999999999994, chainFamily: 'prayer_chain', chainRank: 3 },
      { id: 'divine_grace', name: 'Divine Grace', type: 'heal', desc: 'Divine grace flows through you. Heal 65% HP.', healPercent: 0.65, cooldown: 7, glimmer: true, sparkFrom: ['mass_benediction'], sparkChance: 0.03, chainFamily: 'prayer_chain', chainRank: 4 },
      { id: 'hand_of_god', name: 'Hand of God', type: 'heal', desc: 'The hand of God reaches down. Heal 85% HP.', healPercent: 0.85, cooldown: 9, glimmer: true, sparkFrom: ['divine_grace'], sparkChance: 0.03, chainFamily: 'prayer_chain', chainRank: 5 },
      // ── Cross-Class Glimmers (learnable by other specs) ──
      { id: 'quick_dodge', name: 'Quick Dodge', type: 'buff', desc: 'A sudden burst of speed to avoid attacks.', duration: 2, defMod: 1.5, cooldown: 5, glimmer: true, sparkFrom: ['holy_strike', 'smite'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'precise_strike', name: 'Precise Strike', type: 'attack', desc: 'A carefully aimed attack.', multiplier: 2.0, cooldown: 4, glimmer: true, sparkFrom: ['holy_strike', 'exorcism'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'second_wind', name: 'Second Wind', type: 'heal', desc: 'Catch your breath and recover.', healPercent: 0.3, cooldown: 6, glimmer: true, sparkFrom: ['blessing', 'miracle'], sparkChance: 0.05, crossClass: true, pool: 'universal' },
      { id: 'defensive_stance', name: 'Defensive Stance', type: 'buff', desc: 'Adopt a defensive posture.', duration: 3, defMod: 1.4, cooldown: 5, glimmer: true, sparkFrom: ['sanctuary', 'divine_ward'], sparkChance: 0.06, crossClass: true, pool: 'universal' },
      { id: 'counter_attack', name: 'Counter Attack', type: 'attack', desc: 'Strike back immediately after being hit.', multiplier: 1.8, cooldown: 5, glimmer: true, sparkFrom: ['holy_strike', 'wrath_of_god'], sparkChance: 0.04, crossClass: true, pool: 'universal' },
      { id: 'holy_fire', name: 'Holy Fire', type: 'attack', desc: 'Burn the enemy with sacred flames.', multiplier: 2.8, cooldown: 5, glimmer: true, sparkFrom: ['exorcism', 'smite'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'energy_shield', name: 'Energy Shield', type: 'buff', desc: 'A shield of pure magical energy.', duration: 3, defMod: 1.6, cooldown: 6, glimmer: true, sparkFrom: ['sanctuary', 'divine_ward'], sparkChance: 0.06, crossClass: true, pool: 'affinity' },
      { id: 'cleansing_flame', name: 'Cleansing Flame', type: 'heal', desc: 'Flames that heal rather than burn.', healPercent: 0.5, cooldown: 6, glimmer: true, sparkFrom: ['miracle', 'greater_blessing'], sparkChance: 0.05, crossClass: true, pool: 'affinity' },
      { id: 'lightning_smite', name: 'Lightning Smite', type: 'attack', desc: 'A smite infused with lightning.', multiplier: 3.0, cooldown: 6, glimmer: true, sparkFrom: ['smite', 'holy_nova'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
      { id: 'radiant_beam', name: 'Radiant Beam', type: 'attack', desc: 'A concentrated beam of holy energy.', multiplier: 4.0, cooldown: 8, glimmer: true, sparkFrom: ['holy_nova', 'wrath_of_god'], sparkChance: 0.04, crossClass: true, pool: 'affinity' },
    ];
  }

  /* ─── SPECS Registry ───────────────────────────────────────────────────── */
  const SPECS = {
    fighter: {
      knight:     { name: 'Knight',      genre: 'fantasy',    abilities: knightAbilities() },
      commando:   { name: 'Commando',    genre: 'scifi',      abilities: commandoAbilities() },
      enforcer:   { name: 'Enforcer',    genre: 'noir',       abilities: enforcerAbilities() },
      mechpilot:  { name: 'Mech Pilot',  genre: 'action',     abilities: mechpilotAbilities() },
      samurai:    { name: 'Samurai',      genre: 'anime',      abilities: samuraiAbilities() },
      gladiator:  { name: 'Gladiator',   genre: 'historical', abilities: gladiatorAbilities() }
    },
    mage: {
      sorcerer:     { name: 'Sorcerer',      genre: 'fantasy',    abilities: sorcererAbilities() },
      hacker:       { name: 'Hacker',        genre: 'scifi',      abilities: hackerAbilities() },
      occultist:    { name: 'Occultist',     genre: 'noir',       abilities: occultistAbilities() },
      demolitions:  { name: 'Demolitions',   genre: 'action',     abilities: demolitionsAbilities() },
      elementalist: { name: 'Elementalist',  genre: 'anime',      abilities: elementalistAbilities() },
      oracle:       { name: 'Oracle',        genre: 'historical', abilities: oracleAbilities() }
    },
    rogue: {
      assassin:    { name: 'Assassin',    genre: 'fantasy',    abilities: assassinAbilities() },
      cyberthief:  { name: 'Cyberthief',  genre: 'scifi',      abilities: cyberthiefAbilities() },
      detective:   { name: 'Detective',   genre: 'noir',       abilities: detectiveAbilities() },
      infiltrator: { name: 'Infiltrator', genre: 'action',     abilities: infiltratorAbilities() },
      ninja:       { name: 'Ninja',       genre: 'anime',      abilities: ninjaAbilities() },
      scavenger:   { name: 'Scavenger',   genre: 'historical', abilities: scavengerAbilities() }
    },
    cleric: {
      paladin:     { name: 'Paladin',      genre: 'fantasy',    abilities: paladinAbilities() },
      fieldmedic:  { name: 'Field Medic',  genre: 'scifi',      abilities: fieldmedicAbilities() },
      grifter:     { name: 'Grifter',      genre: 'noir',       abilities: grifterAbilities() },
      combatmedic: { name: 'Combat Medic', genre: 'action',     abilities: combatmedicAbilities() },
      monk:        { name: 'Monk',         genre: 'anime',      abilities: monkAbilities() },
      priest:      { name: 'Priest',       genre: 'historical', abilities: priestAbilities() }
    }
  };
  /* ─── Genre-to-Spec mapping (used by chargen quiz) ─────────────────────── */
  const GENRE_TO_SPEC = {
    fighter: { fantasy: 'knight', scifi: 'commando', noir: 'enforcer', action: 'mechpilot', anime: 'samurai', historical: 'gladiator' },
    mage:    { fantasy: 'sorcerer', scifi: 'hacker', noir: 'occultist', action: 'demolitions', anime: 'elementalist', historical: 'oracle' },
    rogue:   { fantasy: 'assassin', scifi: 'cyberthief', noir: 'detective', action: 'infiltrator', anime: 'ninja', historical: 'scavenger' },
    cleric:  { fantasy: 'paladin', scifi: 'fieldmedic', noir: 'grifter', action: 'combatmedic', anime: 'monk', historical: 'priest' }
  };
  /* ─── Public API ───────────────────────────────────────────────────────── */
  /** Get the spec ID for a class + genre combination (used by chargen). */
  function getSpecForGenre(baseClass, genre) {
    return GENRE_TO_SPEC[baseClass]?.[genre] || null;
  }
  /** Get the spec definition object. */
  function getSpec(baseClass, specId) {
    return SPECS[baseClass]?.[specId] || null;
  }
  /** Get all specs for a given class (for respec menu). */
  function getSpecsForClass(baseClass) {
    return SPECS[baseClass] || {};
  }
  /**
   * Get TRAINABLE abilities available at the player's current power level.
   * Returns all trainable abilities with an `available` flag.
   */
  function getSpecAbilities(baseClass, specId, power) {
    const spec = SPECS[baseClass]?.[specId];
    if (!spec) return [];
    return spec.abilities
      .filter(a => !a.glimmer)
      .map(a => ({ ...a, available: power >= POWER_TIERS[a.tier] }));
  }
  /**
   * Get trainable abilities the player can purchase (meets power, not yet owned).
   */
  function getPurchasableAbilities(baseClass, specId, power, ownedAbilities) {
    const all = getSpecAbilities(baseClass, specId, power);
    return all.filter(a => a.available && !ownedAbilities.includes(a.id));
  }
  /**
   * Get ALL abilities for a spec (trainable + glimmers + cross-class).
   */
  function getAllSpecAbilities(baseClass, specId) {
    const spec = SPECS[baseClass]?.[specId];
    if (!spec) return [];
    return spec.abilities;
  }
  /**
   * Get all glimmerable abilities for a spec (spec glimmers + cross-class).
   */
  function getGlimmerableAbilities(baseClass, specId) {
    const spec = SPECS[baseClass]?.[specId];
    if (!spec) return [];
    return spec.abilities.filter(a => a.glimmer);
  }
  /**
   * Get cross-class glimmers that can be learned by any spec.
   * Collects from all specs and deduplicates by ID.
   */
  function getCrossClassPool() {
    const seen = new Set();
    const pool = [];
    for (const classSpecs of Object.values(SPECS)) {
      for (const spec of Object.values(classSpecs)) {
        for (const a of spec.abilities) {
          if (a.crossClass && !seen.has(a.id)) {
            seen.add(a.id);
            pool.push(a);
          }
        }
      }
    }
    return pool;
  }
  /**
   * Runtime cache for dynamically discovered abilities (chain evolutions).
   * Populated by registerGlimmered() when a glimmer is learned.
   * @type {Object<string, object>}
   */
  const _runtimeDefs = {};

  /**
   * Register a dynamically discovered ability (chain evolution / glimmer)
   * so all systems can find it via getAbilityById / getAbilityByName.
   * @param {object} def - The ability definition to cache
   */
  function registerGlimmered(def) {
    if (def && def.id) _runtimeDefs[def.id] = def;
  }

  /**
   * Bulk-load glimmered defs (e.g., from a save's glimmeredDefs map).
   * @param {Object<string, object>} defs - Map of { [abilityId]: def }
   */
  function loadGlimmeredDefs(defs) {
    if (!defs) return;
    for (const [id, def] of Object.entries(defs)) {
      _runtimeDefs[id] = def;
    }
  }

  /** Look up any ability by ID across all specs + runtime cache. */
  function getAbilityById(abilityId) {
    // Check runtime cache first (chain evolutions)
    if (_runtimeDefs[abilityId]) return _runtimeDefs[abilityId];
    for (const classSpecs of Object.values(SPECS)) {
      for (const spec of Object.values(classSpecs)) {
        const found = spec.abilities.find(a => a.id === abilityId);
        if (found) return found;
      }
    }
    return null;
  }
  /** Look up an ability by name (case-insensitive partial match). Includes runtime cache. */
  function getAbilityByName(name) {
    const lower = name.toLowerCase();
    // Check runtime cache first
    for (const def of Object.values(_runtimeDefs)) {
      if (def.name.toLowerCase() === lower) return def;
    }
    for (const classSpecs of Object.values(SPECS)) {
      for (const spec of Object.values(classSpecs)) {
        const found = spec.abilities.find(a => a.name.toLowerCase() === lower);
        if (found) return found;
      }
    }
    // Partial match fallback
    for (const def of Object.values(_runtimeDefs)) {
      if (def.name.toLowerCase().includes(lower)) return def;
    }
    for (const classSpecs of Object.values(SPECS)) {
      for (const spec of Object.values(classSpecs)) {
        const found = spec.abilities.find(a => a.name.toLowerCase().includes(lower));
        if (found) return found;
      }
    }
    return null;
  }
  /** Get the QP cost for an ability at a given tier. */
  function getAbilityCost(tier) {
    return QP_COSTS[tier] || 5;
  }
  // Expose globally
  window.MudAbilities = {
    POWER_TIERS,
    QP_COSTS,
    RESPEC_COST,
    SPECS,
    GENRE_TO_SPEC,
    getSpecForGenre,
    getSpec,
    getSpecsForClass,
    getSpecAbilities,
    getPurchasableAbilities,
    getAllSpecAbilities,
    getGlimmerableAbilities,
    getCrossClassPool,
    getAbilityById,
    getAbilityByName,
    getAbilityCost,
    registerGlimmered,
    loadGlimmeredDefs
  };
})();
