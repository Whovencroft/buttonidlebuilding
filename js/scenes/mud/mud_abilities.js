/**
 * mud_abilities.js — Genre Echoes Ability Progression System
 *
 * Manages the DBZ-style ability unlock system. Players earn Genre Echoes by
 * defeating mobs in themed zones. Echoes are spent at the Training Hall to
 * unlock new abilities tied to class specializations.
 *
 * Zone → Echo type mapping:
 *   Zone 1 (Fantasy)    → fantasy echoes
 *   Zone 2 (Sci-Fi)     → scifi echoes
 *   Zone 3 (Noir)       → noir echoes
 *   Zone 4 (Action)     → action echoes
 *   Zone 5 (Anime)      → anime echoes
 *   Zone 6 (Historical) → historical echoes
 *
 * Ability tiers unlock at 10 / 25 / 50 / 100 echoes of the matching type.
 * Each class has a unique specialization per zone (4 classes × 6 zones = 24).
 */
(() => {
  'use strict';

  /* ─── Zone-to-Echo Mapping ─────────────────────────────────────────────── */

  const ZONE_ECHO_MAP = {
    1: 'fantasy',
    2: 'scifi',
    3: 'noir',
    4: 'action',
    5: 'anime',
    6: 'historical'
  };

  /** Echo thresholds for each tier */
  const TIERS = [10, 25, 50, 100];

  /* ─── Specialization Definitions ───────────────────────────────────────── */

  /**
   * SPECIALIZATIONS[classId][zoneEchoType] = { name, abilities[] }
   * Each ability: { id, name, desc, tier (0-3), type, ...params }
   */
  const SPECIALIZATIONS = {
    fighter: {
      fantasy:    { name: 'Knight',      abilities: buildFighterFantasy() },
      scifi:      { name: 'Commando',    abilities: buildFighterScifi() },
      noir:       { name: 'Enforcer',    abilities: buildFighterNoir() },
      action:     { name: 'Mech Pilot',  abilities: buildFighterAction() },
      anime:      { name: 'Samurai',     abilities: buildFighterAnime() },
      historical: { name: 'Gladiator',   abilities: buildFighterHistorical() }
    },
    mage: {
      fantasy:    { name: 'Sorcerer',     abilities: buildMageFantasy() },
      scifi:      { name: 'Hacker',       abilities: buildMageScifi() },
      noir:       { name: 'Occultist',    abilities: buildMageNoir() },
      action:     { name: 'Demolitions',  abilities: buildMageAction() },
      anime:      { name: 'Elementalist', abilities: buildMageAnime() },
      historical: { name: 'Oracle',       abilities: buildMageHistorical() }
    },
    rogue: {
      fantasy:    { name: 'Assassin',    abilities: buildRogueFantasy() },
      scifi:      { name: 'Cyber-Thief', abilities: buildRogueScifi() },
      noir:       { name: 'Detective',   abilities: buildRogueNoir() },
      action:     { name: 'Infiltrator', abilities: buildRogueAction() },
      anime:      { name: 'Ninja',       abilities: buildRogueAnime() },
      historical: { name: 'Scavenger',   abilities: buildRogueHistorical() }
    },
    cleric: {
      fantasy:    { name: 'Paladin',      abilities: buildClericFantasy() },
      scifi:      { name: 'Field Medic',  abilities: buildClericScifi() },
      noir:       { name: 'Grifter',      abilities: buildClericNoir() },
      action:     { name: 'Combat Medic', abilities: buildClericAction() },
      anime:      { name: 'Monk',         abilities: buildClericAnime() },
      historical: { name: 'Priest',       abilities: buildClericHistorical() }
    }
  };

  /* ─── Ability Builders (per class × zone) ──────────────────────────────── */

  function buildFighterFantasy() {
    return [
      { id: 'shield_wall',    name: 'Shield Wall',    tier: 0, type: 'buff',   desc: 'Raise your shield. +50% defense for 3 rounds.', duration: 3, defMod: 1.5 },
      { id: 'holy_strike',    name: 'Holy Strike',    tier: 1, type: 'attack', desc: 'Smite with radiant force. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'rallying_cry',   name: 'Rallying Cry',   tier: 2, type: 'heal',   desc: 'Battle cry restores 40% HP.', healPercent: 0.4, cooldown: 6 },
      { id: 'divine_charge',  name: 'Divine Charge',  tier: 3, type: 'attack', desc: 'Unstoppable charge. 300% damage, ignores defense.', multiplier: 3.0, ignoresDef: true, cooldown: 8 }
    ];
  }
  function buildFighterScifi() {
    return [
      { id: 'burst_fire',     name: 'Burst Fire',     tier: 0, type: 'attack', desc: 'Three-round burst. 160% damage.', multiplier: 1.6, cooldown: 3 },
      { id: 'stim_pack',      name: 'Stim Pack',      tier: 1, type: 'heal',   desc: 'Inject combat stims. Heal 30% HP.', healPercent: 0.3, cooldown: 5 },
      { id: 'frag_grenade',   name: 'Frag Grenade',   tier: 2, type: 'attack', desc: 'Explosive ordnance. 250% damage.', multiplier: 2.5, cooldown: 6 },
      { id: 'orbital_strike', name: 'Orbital Strike', tier: 3, type: 'attack', desc: 'Call in fire from above. 350% damage.', multiplier: 3.5, cooldown: 10 }
    ];
  }
  function buildFighterNoir() {
    return [
      { id: 'brass_knuckles', name: 'Brass Knuckles', tier: 0, type: 'attack', desc: 'Dirty fighting. 170% damage.', multiplier: 1.7, cooldown: 3 },
      { id: 'intimidate',     name: 'Intimidate',     tier: 1, type: 'debuff', desc: 'Weaken enemy resolve. -30% enemy attack for 3 rounds.', duration: 3, atkMod: 0.7 },
      { id: 'last_stand',     name: 'Last Stand',     tier: 2, type: 'buff',   desc: 'When below 30% HP, gain +100% attack for 2 rounds.', duration: 2, atkMod: 2.0, hpThreshold: 0.3 },
      { id: 'executioner',    name: 'Executioner',    tier: 3, type: 'attack', desc: 'Finish them. 400% damage if target below 25% HP.', multiplier: 4.0, hpThreshold: 0.25, cooldown: 8 }
    ];
  }
  function buildFighterAction() {
    return [
      { id: 'rocket_punch',   name: 'Rocket Punch',   tier: 0, type: 'attack', desc: 'Mechanized fist. 180% damage.', multiplier: 1.8, cooldown: 3 },
      { id: 'armor_mode',     name: 'Armor Mode',     tier: 1, type: 'buff',   desc: 'Activate plating. +80% defense for 3 rounds.', duration: 3, defMod: 1.8 },
      { id: 'missile_salvo',  name: 'Missile Salvo',  tier: 2, type: 'attack', desc: 'Shoulder-mounted missiles. 280% damage.', multiplier: 2.8, cooldown: 6 },
      { id: 'overdrive',      name: 'Overdrive',      tier: 3, type: 'buff',   desc: 'Push systems to the limit. +100% attack and defense for 2 rounds.', duration: 2, atkMod: 2.0, defMod: 2.0, cooldown: 10 }
    ];
  }
  function buildFighterAnime() {
    return [
      { id: 'quick_draw',     name: 'Quick Draw',     tier: 0, type: 'attack', desc: 'Lightning-fast slash. 175% damage.', multiplier: 1.75, cooldown: 3 },
      { id: 'blade_dance',    name: 'Blade Dance',    tier: 1, type: 'attack', desc: 'Flurry of cuts. 220% damage.', multiplier: 2.2, cooldown: 5 },
      { id: 'honor_guard',    name: 'Honor Guard',    tier: 2, type: 'buff',   desc: 'Perfect stance. +60% defense, +30% attack for 3 rounds.', duration: 3, defMod: 1.6, atkMod: 1.3 },
      { id: 'final_form',     name: 'Final Form',     tier: 3, type: 'attack', desc: 'One perfect strike. 500% damage. 1 use per combat.', multiplier: 5.0, cooldown: 99 }
    ];
  }
  function buildFighterHistorical() {
    return [
      { id: 'gladius_thrust', name: 'Gladius Thrust', tier: 0, type: 'attack', desc: 'Precise Roman thrust. 165% damage.', multiplier: 1.65, cooldown: 3 },
      { id: 'testudo',        name: 'Testudo',        tier: 1, type: 'buff',   desc: 'Tortoise formation. +100% defense for 2 rounds.', duration: 2, defMod: 2.0 },
      { id: 'crowd_roar',     name: 'Crowd Roar',     tier: 2, type: 'heal',   desc: 'The crowd fuels you. Heal 50% HP.', healPercent: 0.5, cooldown: 7 },
      { id: 'arena_champion', name: 'Arena Champion', tier: 3, type: 'attack', desc: 'Legendary finishing blow. 350% damage + heal 20% HP.', multiplier: 3.5, healPercent: 0.2, cooldown: 8 }
    ];
  }

  function buildMageFantasy() {
    return [
      { id: 'fireball',       name: 'Fireball',       tier: 0, type: 'attack', desc: 'Classic fireball. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'mana_shield',    name: 'Mana Shield',    tier: 1, type: 'buff',   desc: 'Arcane barrier. +70% defense for 3 rounds.', duration: 3, defMod: 1.7 },
      { id: 'chain_lightning', name: 'Chain Lightning', tier: 2, type: 'attack', desc: 'Arcing electricity. 280% damage.', multiplier: 2.8, cooldown: 6 },
      { id: 'meteor_storm',   name: 'Meteor Storm',   tier: 3, type: 'attack', desc: 'Rain destruction. 400% damage.', multiplier: 4.0, cooldown: 10 }
    ];
  }
  function buildMageScifi() {
    return [
      { id: 'data_spike',     name: 'Data Spike',     tier: 0, type: 'attack', desc: 'Neural intrusion. 190% damage.', multiplier: 1.9, cooldown: 3 },
      { id: 'firewall',       name: 'Firewall',       tier: 1, type: 'buff',   desc: 'Digital barrier. +60% defense for 3 rounds.', duration: 3, defMod: 1.6 },
      { id: 'system_crash',   name: 'System Crash',   tier: 2, type: 'debuff', desc: 'Crash enemy systems. -50% enemy attack for 2 rounds.', duration: 2, atkMod: 0.5 },
      { id: 'zero_day',       name: 'Zero Day',       tier: 3, type: 'attack', desc: 'Exploit everything. 450% damage, ignores defense.', multiplier: 4.5, ignoresDef: true, cooldown: 10 }
    ];
  }
  function buildMageNoir() {
    return [
      { id: 'hex_bolt',       name: 'Hex Bolt',       tier: 0, type: 'attack', desc: 'Cursed energy. 185% damage.', multiplier: 1.85, cooldown: 3 },
      { id: 'shadow_cloak',   name: 'Shadow Cloak',   tier: 1, type: 'buff',   desc: 'Melt into darkness. +80% defense for 2 rounds.', duration: 2, defMod: 1.8 },
      { id: 'soul_drain',     name: 'Soul Drain',     tier: 2, type: 'attack', desc: 'Steal life force. 200% damage + heal 25% HP.', multiplier: 2.0, healPercent: 0.25, cooldown: 5 },
      { id: 'void_rift',      name: 'Void Rift',      tier: 3, type: 'attack', desc: 'Tear reality. 380% damage.', multiplier: 3.8, cooldown: 9 }
    ];
  }
  function buildMageAction() {
    return [
      { id: 'c4_charge',      name: 'C4 Charge',      tier: 0, type: 'attack', desc: 'Planted explosive. 210% damage.', multiplier: 2.1, cooldown: 4 },
      { id: 'smoke_screen',   name: 'Smoke Screen',   tier: 1, type: 'buff',   desc: 'Obscuring cloud. +50% defense for 3 rounds.', duration: 3, defMod: 1.5 },
      { id: 'napalm_strike',  name: 'Napalm Strike',  tier: 2, type: 'attack', desc: 'Area denial. 300% damage.', multiplier: 3.0, cooldown: 7 },
      { id: 'tactical_nuke',  name: 'Tactical Nuke',  tier: 3, type: 'attack', desc: 'The big one. 500% damage. 1 use per combat.', multiplier: 5.0, cooldown: 99 }
    ];
  }
  function buildMageAnime() {
    return [
      { id: 'spirit_blast',   name: 'Spirit Blast',   tier: 0, type: 'attack', desc: 'Focused ki wave. 195% damage.', multiplier: 1.95, cooldown: 3 },
      { id: 'elemental_ward', name: 'Elemental Ward', tier: 1, type: 'buff',   desc: 'Elemental barrier. +65% defense for 3 rounds.', duration: 3, defMod: 1.65 },
      { id: 'dragon_breath',  name: 'Dragon Breath',  tier: 2, type: 'attack', desc: 'Summon draconic fire. 320% damage.', multiplier: 3.2, cooldown: 7 },
      { id: 'ultimate_form',  name: 'Ultimate Form',  tier: 3, type: 'buff',   desc: 'Transcend limits. +150% attack for 3 rounds.', duration: 3, atkMod: 2.5, cooldown: 10 }
    ];
  }
  function buildMageHistorical() {
    return [
      { id: 'divine_wrath',   name: 'Divine Wrath',   tier: 0, type: 'attack', desc: 'Invoke the gods. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'prophecy',       name: 'Prophecy',       tier: 1, type: 'buff',   desc: 'Foresee attacks. +90% defense for 2 rounds.', duration: 2, defMod: 1.9 },
      { id: 'plague',         name: 'Plague',         tier: 2, type: 'debuff', desc: 'Weaken the enemy. -40% attack and defense for 3 rounds.', duration: 3, atkMod: 0.6, defMod: 0.6 },
      { id: 'apocalypse',     name: 'Apocalypse',     tier: 3, type: 'attack', desc: 'End of days. 420% damage.', multiplier: 4.2, cooldown: 10 }
    ];
  }

  function buildRogueFantasy() {
    return [
      { id: 'shadow_step',    name: 'Shadow Step',    tier: 0, type: 'attack', desc: 'Teleport behind. 190% damage.', multiplier: 1.9, cooldown: 3 },
      { id: 'poison_blade',   name: 'Poison Blade',   tier: 1, type: 'attack', desc: 'Venomed strike. 150% damage + 50% over 3 rounds.', multiplier: 1.5, dot: 0.5, dotDuration: 3, cooldown: 5 },
      { id: 'vanish',         name: 'Vanish',         tier: 2, type: 'buff',   desc: 'Become invisible. Next attack deals 300% damage.', nextAtkMod: 3.0, cooldown: 6 },
      { id: 'death_mark',     name: 'Death Mark',     tier: 3, type: 'attack', desc: 'Mark for death. 400% damage + ignore defense.', multiplier: 4.0, ignoresDef: true, cooldown: 9 }
    ];
  }
  function buildRogueScifi() {
    return [
      { id: 'emp_dart',       name: 'EMP Dart',       tier: 0, type: 'attack', desc: 'Disabling shot. 175% damage.', multiplier: 1.75, cooldown: 3 },
      { id: 'cloak_device',   name: 'Cloak Device',   tier: 1, type: 'buff',   desc: 'Active camo. +100% defense for 2 rounds.', duration: 2, defMod: 2.0 },
      { id: 'virus_inject',   name: 'Virus Inject',   tier: 2, type: 'debuff', desc: 'Corrupt systems. -50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5 },
      { id: 'quantum_blade',  name: 'Quantum Blade',  tier: 3, type: 'attack', desc: 'Phase through armor. 380% damage, ignores defense.', multiplier: 3.8, ignoresDef: true, cooldown: 8 }
    ];
  }
  function buildRogueNoir() {
    return [
      { id: 'sucker_punch',   name: 'Sucker Punch',   tier: 0, type: 'attack', desc: 'Cheap shot. 180% damage.', multiplier: 1.8, cooldown: 3 },
      { id: 'false_alibi',    name: 'False Alibi',    tier: 1, type: 'buff',   desc: 'Misdirection. +70% defense for 3 rounds.', duration: 3, defMod: 1.7 },
      { id: 'cold_case',      name: 'Cold Case',      tier: 2, type: 'attack', desc: 'Exploit weakness. 260% damage.', multiplier: 2.6, cooldown: 5 },
      { id: 'perfect_crime',  name: 'Perfect Crime',  tier: 3, type: 'attack', desc: 'Untraceable strike. 420% damage.', multiplier: 4.2, cooldown: 9 }
    ];
  }
  function buildRogueAction() {
    return [
      { id: 'wire_trip',      name: 'Wire Trip',      tier: 0, type: 'debuff', desc: 'Trip wire trap. -40% enemy attack for 2 rounds.', duration: 2, atkMod: 0.6 },
      { id: 'smoke_bomb',     name: 'Smoke Bomb',     tier: 1, type: 'buff',   desc: 'Vanish in smoke. +90% defense for 2 rounds.', duration: 2, defMod: 1.9 },
      { id: 'silenced_shot',  name: 'Silenced Shot',  tier: 2, type: 'attack', desc: 'Clean kill. 280% damage.', multiplier: 2.8, cooldown: 5 },
      { id: 'ghost_protocol', name: 'Ghost Protocol', tier: 3, type: 'attack', desc: 'You were never here. 400% damage + full heal.', multiplier: 4.0, healPercent: 1.0, cooldown: 10 }
    ];
  }
  function buildRogueAnime() {
    return [
      { id: 'shuriken_storm', name: 'Shuriken Storm', tier: 0, type: 'attack', desc: 'Thrown blades. 185% damage.', multiplier: 1.85, cooldown: 3 },
      { id: 'substitution',   name: 'Substitution',   tier: 1, type: 'buff',   desc: 'Replace with a log. Negate next attack.', negateNext: true, cooldown: 5 },
      { id: 'shadow_clone',   name: 'Shadow Clone',   tier: 2, type: 'attack', desc: 'Clone assault. 300% damage.', multiplier: 3.0, cooldown: 6 },
      { id: 'forbidden_seal', name: 'Forbidden Seal', tier: 3, type: 'attack', desc: 'Seal their power. 350% damage + -70% enemy attack for 2 rounds.', multiplier: 3.5, duration: 2, atkMod: 0.3, cooldown: 9 }
    ];
  }
  function buildRogueHistorical() {
    return [
      { id: 'scavenge',       name: 'Scavenge',       tier: 0, type: 'heal',   desc: 'Find supplies. Heal 25% HP.', healPercent: 0.25, cooldown: 4 },
      { id: 'jury_rig',       name: 'Jury Rig',       tier: 1, type: 'buff',   desc: 'Improvised armor. +60% defense for 3 rounds.', duration: 3, defMod: 1.6 },
      { id: 'ambush',         name: 'Ambush',         tier: 2, type: 'attack', desc: 'Spring a trap. 270% damage.', multiplier: 2.7, cooldown: 5 },
      { id: 'survivors_luck', name: "Survivor's Luck", tier: 3, type: 'attack', desc: 'Against all odds. 380% damage + heal 30% HP.', multiplier: 3.8, healPercent: 0.3, cooldown: 8 }
    ];
  }

  function buildClericFantasy() {
    return [
      { id: 'smite',          name: 'Smite',          tier: 0, type: 'attack', desc: 'Holy judgment. 170% damage.', multiplier: 1.7, cooldown: 3 },
      { id: 'divine_shield',  name: 'Divine Shield',  tier: 1, type: 'buff',   desc: 'Invulnerable for 1 round.', duration: 1, defMod: 99, cooldown: 7 },
      { id: 'greater_heal',   name: 'Greater Heal',   tier: 2, type: 'heal',   desc: 'Restore 60% HP.', healPercent: 0.6, cooldown: 6 },
      { id: 'resurrection',   name: 'Resurrection',   tier: 3, type: 'heal',   desc: 'Cheat death. Full heal when below 10% HP.', healPercent: 1.0, hpThreshold: 0.1, cooldown: 99 }
    ];
  }
  function buildClericScifi() {
    return [
      { id: 'nano_inject',    name: 'Nano Inject',    tier: 0, type: 'heal',   desc: 'Nanobots repair. Heal 35% HP.', healPercent: 0.35, cooldown: 4 },
      { id: 'energy_barrier', name: 'Energy Barrier', tier: 1, type: 'buff',   desc: 'Force field. +80% defense for 2 rounds.', duration: 2, defMod: 1.8 },
      { id: 'adrenaline',     name: 'Adrenaline',     tier: 2, type: 'buff',   desc: 'Combat drugs. +60% attack for 3 rounds.', duration: 3, atkMod: 1.6 },
      { id: 'full_restore',   name: 'Full Restore',   tier: 3, type: 'heal',   desc: 'Complete system reset. Full heal.', healPercent: 1.0, cooldown: 10 }
    ];
  }
  function buildClericNoir() {
    return [
      { id: 'con_job',        name: 'Con Job',        tier: 0, type: 'debuff', desc: 'Trick them. -30% enemy defense for 3 rounds.', duration: 3, defMod: 0.7 },
      { id: 'snake_oil',      name: 'Snake Oil',      tier: 1, type: 'heal',   desc: 'Questionable medicine. Heal 40% HP.', healPercent: 0.4, cooldown: 5 },
      { id: 'double_cross',   name: 'Double Cross',   tier: 2, type: 'attack', desc: 'Betray their trust. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'insurance_fraud', name: 'Insurance Fraud', tier: 3, type: 'heal', desc: 'Always have a backup plan. Heal 80% HP + +50% attack for 2 rounds.', healPercent: 0.8, duration: 2, atkMod: 1.5, cooldown: 9 }
    ];
  }
  function buildClericAction() {
    return [
      { id: 'field_patch',    name: 'Field Patch',    tier: 0, type: 'heal',   desc: 'Quick patch-up. Heal 30% HP.', healPercent: 0.3, cooldown: 4 },
      { id: 'suppressive_fire', name: 'Suppressive Fire', tier: 1, type: 'debuff', desc: 'Pin them down. -40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6 },
      { id: 'combat_revive',  name: 'Combat Revive',  tier: 2, type: 'heal',   desc: 'Emergency revival. Heal 55% HP.', healPercent: 0.55, cooldown: 6 },
      { id: 'medevac',        name: 'Medevac',        tier: 3, type: 'heal',   desc: 'Full extraction. Full heal + +30% defense for 3 rounds.', healPercent: 1.0, duration: 3, defMod: 1.3, cooldown: 10 }
    ];
  }
  function buildClericAnime() {
    return [
      { id: 'ki_heal',        name: 'Ki Heal',        tier: 0, type: 'heal',   desc: 'Channel inner energy. Heal 30% HP.', healPercent: 0.3, cooldown: 4 },
      { id: 'iron_body',      name: 'Iron Body',      tier: 1, type: 'buff',   desc: 'Harden your body. +100% defense for 2 rounds.', duration: 2, defMod: 2.0 },
      { id: 'pressure_point', name: 'Pressure Point', tier: 2, type: 'attack', desc: 'Strike a nerve cluster. 240% damage.', multiplier: 2.4, cooldown: 5 },
      { id: 'inner_peace',    name: 'Inner Peace',    tier: 3, type: 'heal',   desc: 'Perfect meditation. Full heal + +50% attack for 2 rounds.', healPercent: 1.0, duration: 2, atkMod: 1.5, cooldown: 10 }
    ];
  }
  function buildClericHistorical() {
    return [
      { id: 'blessing',       name: 'Blessing',       tier: 0, type: 'heal',   desc: 'Divine favor. Heal 35% HP.', healPercent: 0.35, cooldown: 4 },
      { id: 'sanctuary',      name: 'Sanctuary',      tier: 1, type: 'buff',   desc: 'Holy ground. +70% defense for 3 rounds.', duration: 3, defMod: 1.7 },
      { id: 'exorcism',       name: 'Exorcism',       tier: 2, type: 'attack', desc: 'Banish evil. 250% damage.', multiplier: 2.5, cooldown: 6 },
      { id: 'miracle',        name: 'Miracle',        tier: 3, type: 'heal',   desc: 'Divine intervention. Full heal + remove all debuffs.', healPercent: 1.0, cleanse: true, cooldown: 10 }
    ];
  }

  /* ─── Public API ───────────────────────────────────────────────────────── */

  /**
   * Determine how many echoes a mob kill awards based on room vnum.
   * Returns { type: string, amount: number } or null if not in a zone.
   */
  function getEchoReward(roomVnum) {
    const zone = Math.floor(roomVnum / 1000);
    const echoType = ZONE_ECHO_MAP[zone];
    if (!echoType) return null;
    return { type: echoType, amount: 1 };
  }

  /**
   * Get all abilities available to a player based on class and current echo totals.
   * Returns array of { ability, echoType, specName, unlocked: bool }
   */
  function getAvailableAbilities(playerClass, genreEchoes) {
    if (!playerClass || !SPECIALIZATIONS[playerClass]) return [];

    const results = [];
    for (const [echoType, spec] of Object.entries(SPECIALIZATIONS[playerClass])) {
      const echoes = genreEchoes[echoType] || 0;
      for (const ability of spec.abilities) {
        const threshold = TIERS[ability.tier];
        results.push({
          ability,
          echoType,
          specName: spec.name,
          threshold,
          unlocked: echoes >= threshold
        });
      }
    }
    return results;
  }

  /**
   * Get abilities the player can train (has enough echoes but hasn't unlocked yet).
   * Returns array of { ability, echoType, specName, cost }
   */
  function getTrainableAbilities(playerClass, genreEchoes, unlockedAbilities) {
    const all = getAvailableAbilities(playerClass, genreEchoes);
    return all.filter(entry =>
      entry.unlocked && !unlockedAbilities.includes(entry.ability.id)
    ).map(entry => ({
      ...entry,
      cost: TIERS[entry.ability.tier]
    }));
  }

  /**
   * Get the specialization name for a class in a given echo type.
   */
  function getSpecName(playerClass, echoType) {
    return SPECIALIZATIONS[playerClass]?.[echoType]?.name || null;
  }

  /**
   * Look up an ability definition by ID across all specializations.
   */
  function getAbilityById(abilityId) {
    for (const classSpecs of Object.values(SPECIALIZATIONS)) {
      for (const spec of Object.values(classSpecs)) {
        const found = spec.abilities.find(a => a.id === abilityId);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Look up an ability from the starting abilities (chargen).
   */
  function getStartingAbility(abilityId) {
    const STARTING = window.MudChargen?.STARTING_ABILITIES || {};
    return STARTING[abilityId] || null;
  }

  // Expose globally
  window.MudAbilities = {
    getEchoReward,
    getAvailableAbilities,
    getTrainableAbilities,
    getSpecName,
    getAbilityById,
    getStartingAbility,
    ZONE_ECHO_MAP,
    TIERS,
    SPECIALIZATIONS
  };
})();
