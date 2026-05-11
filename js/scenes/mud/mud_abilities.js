/**
 * mud_abilities.js — Ability Progression System
 *
 * Players earn Power from kills and Quest Points (QP) from quests.
 * Power thresholds gate which tier of abilities becomes available.
 * QP is spent to purchase individual abilities from the player's
 * current specialization tree.
 *
 * Specialization is determined at character creation via a personality
 * quiz. Players can spend 30 QP to switch specialization; old abilities
 * are kept but new ones only come from the current tree.
 *
 * Abilities are activated by typing their name directly as a command.
 */
(() => {
  'use strict';

  /** Power thresholds for each ability tier (0-3) */
  const POWER_TIERS = [10, 25, 50, 100];

  /** QP cost to purchase an ability at each tier */
  const QP_COSTS = [3, 5, 8, 12];

  /** QP cost to change specialization */
  const RESPEC_COST = 30;

  /* ─── Specialization Definitions ───────────────────────────────────────── */

  /**
   * SPECS[classId][specId] = { name, genre, abilities[] }
   * Each ability: { id, name, desc, tier (0-3), type, ...params }
   *
   * type: 'attack' | 'heal' | 'buff' | 'debuff'
   */
  const SPECS = {
    fighter: {
      knight:     { name: 'Knight',     genre: 'fantasy',    abilities: knightAbilities() },
      commando:   { name: 'Commando',   genre: 'scifi',      abilities: commandoAbilities() },
      enforcer:   { name: 'Enforcer',   genre: 'noir',       abilities: enforcerAbilities() },
      mechpilot:  { name: 'Mech Pilot', genre: 'action',     abilities: mechpilotAbilities() },
      samurai:    { name: 'Samurai',     genre: 'anime',      abilities: samuraiAbilities() },
      gladiator:  { name: 'Gladiator',  genre: 'historical', abilities: gladiatorAbilities() }
    },
    mage: {
      sorcerer:     { name: 'Sorcerer',     genre: 'fantasy',    abilities: sorcererAbilities() },
      hacker:       { name: 'Hacker',       genre: 'scifi',      abilities: hackerAbilities() },
      occultist:    { name: 'Occultist',    genre: 'noir',       abilities: occultistAbilities() },
      demolitions:  { name: 'Demolitions',  genre: 'action',     abilities: demolitionsAbilities() },
      elementalist: { name: 'Elementalist', genre: 'anime',      abilities: elementalistAbilities() },
      oracle:       { name: 'Oracle',       genre: 'historical', abilities: oracleAbilities() }
    },
    rogue: {
      assassin:   { name: 'Assassin',    genre: 'fantasy',    abilities: assassinAbilities() },
      cyberthief: { name: 'Cyber-Thief', genre: 'scifi',      abilities: cyberthiefAbilities() },
      detective:  { name: 'Detective',   genre: 'noir',       abilities: detectiveAbilities() },
      infiltrator:{ name: 'Infiltrator', genre: 'action',     abilities: infiltratorAbilities() },
      ninja:      { name: 'Ninja',       genre: 'anime',      abilities: ninjaAbilities() },
      scavenger:  { name: 'Scavenger',   genre: 'historical', abilities: scavengerAbilities() }
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

  /* ─── Ability Builders ─────────────────────────────────────────────────── */

  function knightAbilities() {
    return [
      { id: 'shield_wall',   name: 'Shield Wall',   tier: 0, type: 'buff',   desc: 'Raise your shield. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'holy_strike',   name: 'Holy Strike',   tier: 1, type: 'attack', desc: 'Smite with radiant force. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'rallying_cry',  name: 'Rallying Cry',  tier: 2, type: 'heal',   desc: 'Battle cry restores 40% HP.', healPercent: 0.4, cooldown: 6 },
      { id: 'divine_charge', name: 'Divine Charge', tier: 3, type: 'attack', desc: 'Unstoppable charge. 300% damage, ignores defense.', multiplier: 3.0, ignoresDef: true, cooldown: 8 }
    ];
  }
  function commandoAbilities() {
    return [
      { id: 'burst_fire',     name: 'Burst Fire',     tier: 0, type: 'attack', desc: 'Three-round burst. 160% damage.', multiplier: 1.6, cooldown: 3 },
      { id: 'stim_pack',      name: 'Stim Pack',      tier: 1, type: 'heal',   desc: 'Inject combat stims. Heal 30% HP.', healPercent: 0.3, cooldown: 5 },
      { id: 'frag_grenade',   name: 'Frag Grenade',   tier: 2, type: 'attack', desc: 'Explosive ordnance. 250% damage.', multiplier: 2.5, cooldown: 6 },
      { id: 'orbital_strike', name: 'Orbital Strike', tier: 3, type: 'attack', desc: 'Call in fire from above. 350% damage.', multiplier: 3.5, cooldown: 10 }
    ];
  }
  function enforcerAbilities() {
    return [
      { id: 'brass_knuckles', name: 'Brass Knuckles', tier: 0, type: 'attack', desc: 'Dirty fighting. 170% damage.', multiplier: 1.7, cooldown: 3 },
      { id: 'intimidate',     name: 'Intimidate',     tier: 1, type: 'debuff', desc: 'Weaken enemy resolve. -30% enemy attack for 3 rounds.', duration: 3, atkMod: 0.7, cooldown: 5 },
      { id: 'last_stand',     name: 'Last Stand',     tier: 2, type: 'buff',   desc: 'Below 30% HP: +100% attack for 2 rounds.', duration: 2, atkMod: 2.0, cooldown: 7 },
      { id: 'executioner',    name: 'Executioner',    tier: 3, type: 'attack', desc: '400% damage if target below 25% HP, else 200%.', multiplier: 4.0, fallbackMult: 2.0, hpThreshold: 0.25, cooldown: 8 }
    ];
  }
  function mechpilotAbilities() {
    return [
      { id: 'rocket_punch',  name: 'Rocket Punch',  tier: 0, type: 'attack', desc: 'Mechanized fist. 180% damage.', multiplier: 1.8, cooldown: 3 },
      { id: 'armor_mode',    name: 'Armor Mode',    tier: 1, type: 'buff',   desc: 'Activate plating. +80% defense for 3 rounds.', duration: 3, defMod: 1.8, cooldown: 5 },
      { id: 'missile_salvo', name: 'Missile Salvo', tier: 2, type: 'attack', desc: 'Shoulder-mounted missiles. 280% damage.', multiplier: 2.8, cooldown: 6 },
      { id: 'overdrive',     name: 'Overdrive',     tier: 3, type: 'buff',   desc: '+100% attack and defense for 2 rounds.', duration: 2, atkMod: 2.0, defMod: 2.0, cooldown: 10 }
    ];
  }
  function samuraiAbilities() {
    return [
      { id: 'quick_draw',  name: 'Quick Draw',  tier: 0, type: 'attack', desc: 'Lightning-fast slash. 175% damage.', multiplier: 1.75, cooldown: 3 },
      { id: 'blade_dance', name: 'Blade Dance', tier: 1, type: 'attack', desc: 'Flurry of cuts. 220% damage.', multiplier: 2.2, cooldown: 5 },
      { id: 'honor_guard', name: 'Honor Guard', tier: 2, type: 'buff',   desc: '+60% defense, +30% attack for 3 rounds.', duration: 3, defMod: 1.6, atkMod: 1.3, cooldown: 6 },
      { id: 'final_form',  name: 'Final Form',  tier: 3, type: 'attack', desc: 'One perfect strike. 500% damage. Once per combat.', multiplier: 5.0, cooldown: 99 }
    ];
  }
  function gladiatorAbilities() {
    return [
      { id: 'gladius_thrust', name: 'Gladius Thrust', tier: 0, type: 'attack', desc: 'Precise Roman thrust. 165% damage.', multiplier: 1.65, cooldown: 3 },
      { id: 'testudo',        name: 'Testudo',        tier: 1, type: 'buff',   desc: 'Tortoise formation. +100% defense for 2 rounds.', duration: 2, defMod: 2.0, cooldown: 5 },
      { id: 'crowd_roar',     name: 'Crowd Roar',     tier: 2, type: 'heal',   desc: 'The crowd fuels you. Heal 50% HP.', healPercent: 0.5, cooldown: 7 },
      { id: 'arena_champion', name: 'Arena Champion', tier: 3, type: 'attack', desc: '350% damage + heal 20% HP.', multiplier: 3.5, healPercent: 0.2, cooldown: 8 }
    ];
  }

  function sorcererAbilities() {
    return [
      { id: 'fireball',        name: 'Fireball',        tier: 0, type: 'attack', desc: 'Classic fireball. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'mana_shield',     name: 'Mana Shield',     tier: 1, type: 'buff',   desc: 'Arcane barrier. +70% defense for 3 rounds.', duration: 3, defMod: 1.7, cooldown: 5 },
      { id: 'chain_lightning', name: 'Chain Lightning', tier: 2, type: 'attack', desc: 'Arcing electricity. 280% damage.', multiplier: 2.8, cooldown: 6 },
      { id: 'meteor_storm',    name: 'Meteor Storm',    tier: 3, type: 'attack', desc: 'Rain destruction. 400% damage.', multiplier: 4.0, cooldown: 10 }
    ];
  }
  function hackerAbilities() {
    return [
      { id: 'data_spike',   name: 'Data Spike',   tier: 0, type: 'attack', desc: 'Neural intrusion. 190% damage.', multiplier: 1.9, cooldown: 3 },
      { id: 'firewall',     name: 'Firewall',     tier: 1, type: 'buff',   desc: 'Digital barrier. +60% defense for 3 rounds.', duration: 3, defMod: 1.6, cooldown: 5 },
      { id: 'system_crash', name: 'System Crash', tier: 2, type: 'debuff', desc: '-50% enemy attack for 2 rounds.', duration: 2, atkMod: 0.5, cooldown: 6 },
      { id: 'zero_day',     name: 'Zero Day',     tier: 3, type: 'attack', desc: '450% damage, ignores defense.', multiplier: 4.5, ignoresDef: true, cooldown: 10 }
    ];
  }
  function occultistAbilities() {
    return [
      { id: 'hex_bolt',     name: 'Hex Bolt',     tier: 0, type: 'attack', desc: 'Cursed energy. 185% damage.', multiplier: 1.85, cooldown: 3 },
      { id: 'shadow_cloak', name: 'Shadow Cloak', tier: 1, type: 'buff',   desc: 'Melt into darkness. +80% defense for 2 rounds.', duration: 2, defMod: 1.8, cooldown: 5 },
      { id: 'soul_drain',   name: 'Soul Drain',   tier: 2, type: 'attack', desc: '200% damage + heal 25% HP.', multiplier: 2.0, healPercent: 0.25, cooldown: 5 },
      { id: 'void_rift',    name: 'Void Rift',    tier: 3, type: 'attack', desc: 'Tear reality. 380% damage.', multiplier: 3.8, cooldown: 9 }
    ];
  }
  function demolitionsAbilities() {
    return [
      { id: 'c4_charge',     name: 'C4 Charge',     tier: 0, type: 'attack', desc: 'Planted explosive. 210% damage.', multiplier: 2.1, cooldown: 4 },
      { id: 'smoke_screen',  name: 'Smoke Screen',  tier: 1, type: 'buff',   desc: 'Obscuring cloud. +50% defense for 3 rounds.', duration: 3, defMod: 1.5, cooldown: 5 },
      { id: 'napalm_strike', name: 'Napalm Strike', tier: 2, type: 'attack', desc: 'Area denial. 300% damage.', multiplier: 3.0, cooldown: 7 },
      { id: 'tactical_nuke', name: 'Tactical Nuke', tier: 3, type: 'attack', desc: '500% damage. Once per combat.', multiplier: 5.0, cooldown: 99 }
    ];
  }
  function elementalistAbilities() {
    return [
      { id: 'spirit_blast',   name: 'Spirit Blast',   tier: 0, type: 'attack', desc: 'Focused ki wave. 195% damage.', multiplier: 1.95, cooldown: 3 },
      { id: 'elemental_ward', name: 'Elemental Ward', tier: 1, type: 'buff',   desc: 'Elemental barrier. +65% defense for 3 rounds.', duration: 3, defMod: 1.65, cooldown: 5 },
      { id: 'dragon_breath',  name: 'Dragon Breath',  tier: 2, type: 'attack', desc: 'Summon draconic fire. 320% damage.', multiplier: 3.2, cooldown: 7 },
      { id: 'ultimate_form',  name: 'Ultimate Form',  tier: 3, type: 'buff',   desc: '+150% attack for 3 rounds.', duration: 3, atkMod: 2.5, cooldown: 10 }
    ];
  }
  function oracleAbilities() {
    return [
      { id: 'divine_wrath', name: 'Divine Wrath', tier: 0, type: 'attack', desc: 'Invoke the gods. 200% damage.', multiplier: 2.0, cooldown: 4 },
      { id: 'prophecy',     name: 'Prophecy',     tier: 1, type: 'buff',   desc: 'Foresee attacks. +90% defense for 2 rounds.', duration: 2, defMod: 1.9, cooldown: 5 },
      { id: 'plague',        name: 'Plague',        tier: 2, type: 'debuff', desc: '-40% enemy attack and defense for 3 rounds.', duration: 3, atkMod: 0.6, defMod: 0.6, cooldown: 7 },
      { id: 'apocalypse',    name: 'Apocalypse',    tier: 3, type: 'attack', desc: 'End of days. 420% damage.', multiplier: 4.2, cooldown: 10 }
    ];
  }

  function assassinAbilities() {
    return [
      { id: 'shadow_step',  name: 'Shadow Step',  tier: 0, type: 'attack', desc: 'Teleport behind. 190% damage.', multiplier: 1.9, cooldown: 3 },
      { id: 'poison_blade', name: 'Poison Blade', tier: 1, type: 'attack', desc: 'Venomed strike. 150% + 50% over 3 rounds.', multiplier: 1.5, dot: 0.5, dotDuration: 3, cooldown: 5 },
      { id: 'vanish',       name: 'Vanish',       tier: 2, type: 'buff',   desc: 'Invisible. Next attack deals 300%.', nextAtkMod: 3.0, cooldown: 6 },
      { id: 'death_mark',   name: 'Death Mark',   tier: 3, type: 'attack', desc: '400% damage, ignores defense.', multiplier: 4.0, ignoresDef: true, cooldown: 9 }
    ];
  }
  function cyberthiefAbilities() {
    return [
      { id: 'emp_dart',      name: 'EMP Dart',      tier: 0, type: 'attack', desc: 'Disabling shot. 175% damage.', multiplier: 1.75, cooldown: 3 },
      { id: 'cloak_device',  name: 'Cloak Device',  tier: 1, type: 'buff',   desc: 'Active camo. +100% defense for 2 rounds.', duration: 2, defMod: 2.0, cooldown: 5 },
      { id: 'virus_inject',  name: 'Virus Inject',  tier: 2, type: 'debuff', desc: '-50% enemy defense for 3 rounds.', duration: 3, defMod: 0.5, cooldown: 6 },
      { id: 'quantum_blade', name: 'Quantum Blade', tier: 3, type: 'attack', desc: '380% damage, ignores defense.', multiplier: 3.8, ignoresDef: true, cooldown: 8 }
    ];
  }
  function detectiveAbilities() {
    return [
      { id: 'sucker_punch',  name: 'Sucker Punch',  tier: 0, type: 'attack', desc: 'Cheap shot. 180% damage.', multiplier: 1.8, cooldown: 3 },
      { id: 'false_alibi',   name: 'False Alibi',   tier: 1, type: 'buff',   desc: 'Misdirection. +70% defense for 3 rounds.', duration: 3, defMod: 1.7, cooldown: 5 },
      { id: 'cold_case',     name: 'Cold Case',     tier: 2, type: 'attack', desc: 'Exploit weakness. 260% damage.', multiplier: 2.6, cooldown: 5 },
      { id: 'perfect_crime', name: 'Perfect Crime', tier: 3, type: 'attack', desc: 'Untraceable strike. 420% damage.', multiplier: 4.2, cooldown: 9 }
    ];
  }
  function infiltratorAbilities() {
    return [
      { id: 'wire_trip',      name: 'Wire Trip',      tier: 0, type: 'debuff', desc: '-40% enemy attack for 2 rounds.', duration: 2, atkMod: 0.6, cooldown: 4 },
      { id: 'smoke_bomb',     name: 'Smoke Bomb',     tier: 1, type: 'buff',   desc: '+90% defense for 2 rounds.', duration: 2, defMod: 1.9, cooldown: 5 },
      { id: 'silenced_shot',  name: 'Silenced Shot',  tier: 2, type: 'attack', desc: 'Clean kill. 280% damage.', multiplier: 2.8, cooldown: 5 },
      { id: 'ghost_protocol', name: 'Ghost Protocol', tier: 3, type: 'attack', desc: '400% damage + full heal.', multiplier: 4.0, healPercent: 1.0, cooldown: 10 }
    ];
  }
  function ninjaAbilities() {
    return [
      { id: 'shuriken_storm',  name: 'Shuriken Storm',  tier: 0, type: 'attack', desc: 'Thrown blades. 185% damage.', multiplier: 1.85, cooldown: 3 },
      { id: 'substitution',    name: 'Substitution',    tier: 1, type: 'buff',   desc: 'Negate next attack.', negateNext: true, duration: 1, defMod: 99, cooldown: 5 },
      { id: 'shadow_clone',    name: 'Shadow Clone',    tier: 2, type: 'attack', desc: 'Clone assault. 300% damage.', multiplier: 3.0, cooldown: 6 },
      { id: 'forbidden_seal',  name: 'Forbidden Seal',  tier: 3, type: 'attack', desc: '350% damage + -70% enemy attack for 2 rounds.', multiplier: 3.5, duration: 2, atkMod: 0.3, cooldown: 9 }
    ];
  }
  function scavengerAbilities() {
    return [
      { id: 'scavenge',       name: 'Scavenge',        tier: 0, type: 'heal',   desc: 'Find supplies. Heal 25% HP.', healPercent: 0.25, cooldown: 4 },
      { id: 'jury_rig',       name: 'Jury Rig',        tier: 1, type: 'buff',   desc: 'Improvised armor. +60% defense for 3 rounds.', duration: 3, defMod: 1.6, cooldown: 5 },
      { id: 'ambush',         name: 'Ambush',          tier: 2, type: 'attack', desc: 'Spring a trap. 270% damage.', multiplier: 2.7, cooldown: 5 },
      { id: 'survivors_luck', name: "Survivor's Luck", tier: 3, type: 'attack', desc: '380% damage + heal 30% HP.', multiplier: 3.8, healPercent: 0.3, cooldown: 8 }
    ];
  }

  function paladinAbilities() {
    return [
      { id: 'smite',         name: 'Smite',         tier: 0, type: 'attack', desc: 'Holy judgment. 170% damage.', multiplier: 1.7, cooldown: 3 },
      { id: 'divine_shield', name: 'Divine Shield', tier: 1, type: 'buff',   desc: 'Invulnerable for 1 round.', duration: 1, defMod: 99, cooldown: 7 },
      { id: 'greater_heal',  name: 'Greater Heal',  tier: 2, type: 'heal',   desc: 'Restore 60% HP.', healPercent: 0.6, cooldown: 6 },
      { id: 'resurrection',  name: 'Resurrection',  tier: 3, type: 'heal',   desc: 'Full heal. Once per combat.', healPercent: 1.0, cooldown: 99 }
    ];
  }
  function fieldmedicAbilities() {
    return [
      { id: 'nano_inject',    name: 'Nano Inject',    tier: 0, type: 'heal',   desc: 'Nanobots repair. Heal 35% HP.', healPercent: 0.35, cooldown: 4 },
      { id: 'energy_barrier', name: 'Energy Barrier', tier: 1, type: 'buff',   desc: 'Force field. +80% defense for 2 rounds.', duration: 2, defMod: 1.8, cooldown: 5 },
      { id: 'adrenaline',     name: 'Adrenaline',     tier: 2, type: 'buff',   desc: '+60% attack for 3 rounds.', duration: 3, atkMod: 1.6, cooldown: 6 },
      { id: 'full_restore',   name: 'Full Restore',   tier: 3, type: 'heal',   desc: 'Complete system reset. Full heal.', healPercent: 1.0, cooldown: 10 }
    ];
  }
  function grifterAbilities() {
    return [
      { id: 'con_job',         name: 'Con Job',         tier: 0, type: 'debuff', desc: '-30% enemy defense for 3 rounds.', duration: 3, defMod: 0.7, cooldown: 4 },
      { id: 'snake_oil',       name: 'Snake Oil',       tier: 1, type: 'heal',   desc: 'Questionable medicine. Heal 40% HP.', healPercent: 0.4, cooldown: 5 },
      { id: 'double_cross',    name: 'Double Cross',    tier: 2, type: 'attack', desc: 'Betray their trust. 250% damage.', multiplier: 2.5, cooldown: 5 },
      { id: 'insurance_fraud', name: 'Insurance Fraud', tier: 3, type: 'heal',   desc: 'Heal 80% HP + +50% attack for 2 rounds.', healPercent: 0.8, duration: 2, atkMod: 1.5, cooldown: 9 }
    ];
  }
  function combatmedicAbilities() {
    return [
      { id: 'field_patch',       name: 'Field Patch',       tier: 0, type: 'heal',   desc: 'Quick patch-up. Heal 30% HP.', healPercent: 0.3, cooldown: 4 },
      { id: 'suppressive_fire',  name: 'Suppressive Fire',  tier: 1, type: 'debuff', desc: '-40% enemy attack for 3 rounds.', duration: 3, atkMod: 0.6, cooldown: 5 },
      { id: 'combat_revive',     name: 'Combat Revive',     tier: 2, type: 'heal',   desc: 'Emergency revival. Heal 55% HP.', healPercent: 0.55, cooldown: 6 },
      { id: 'medevac',           name: 'Medevac',           tier: 3, type: 'heal',   desc: 'Full heal + +30% defense for 3 rounds.', healPercent: 1.0, duration: 3, defMod: 1.3, cooldown: 10 }
    ];
  }
  function monkAbilities() {
    return [
      { id: 'ki_heal',        name: 'Ki Heal',        tier: 0, type: 'heal',   desc: 'Channel inner energy. Heal 30% HP.', healPercent: 0.3, cooldown: 4 },
      { id: 'iron_body',      name: 'Iron Body',      tier: 1, type: 'buff',   desc: 'Harden your body. +100% defense for 2 rounds.', duration: 2, defMod: 2.0, cooldown: 5 },
      { id: 'pressure_point', name: 'Pressure Point', tier: 2, type: 'attack', desc: 'Strike a nerve cluster. 240% damage.', multiplier: 2.4, cooldown: 5 },
      { id: 'inner_peace',    name: 'Inner Peace',    tier: 3, type: 'heal',   desc: 'Full heal + +50% attack for 2 rounds.', healPercent: 1.0, duration: 2, atkMod: 1.5, cooldown: 10 }
    ];
  }
  function priestAbilities() {
    return [
      { id: 'blessing',  name: 'Blessing',  tier: 0, type: 'heal',   desc: 'Divine favor. Heal 35% HP.', healPercent: 0.35, cooldown: 4 },
      { id: 'sanctuary', name: 'Sanctuary', tier: 1, type: 'buff',   desc: 'Holy ground. +70% defense for 3 rounds.', duration: 3, defMod: 1.7, cooldown: 5 },
      { id: 'exorcism',  name: 'Exorcism',  tier: 2, type: 'attack', desc: 'Banish evil. 250% damage.', multiplier: 2.5, cooldown: 6 },
      { id: 'miracle',   name: 'Miracle',   tier: 3, type: 'heal',   desc: 'Divine intervention. Full heal.', healPercent: 1.0, cooldown: 10 }
    ];
  }

  /* ─── Public API ───────────────────────────────────────────────────────── */

  /**
   * Get the spec ID for a class + genre combination (used by chargen).
   */
  function getSpecForGenre(baseClass, genre) {
    return GENRE_TO_SPEC[baseClass]?.[genre] || null;
  }

  /**
   * Get the spec definition object.
   */
  function getSpec(baseClass, specId) {
    return SPECS[baseClass]?.[specId] || null;
  }

  /**
   * Get all specs for a given class (for respec menu).
   */
  function getSpecsForClass(baseClass) {
    return SPECS[baseClass] || {};
  }

  /**
   * Get abilities available at the player's current power level for their spec.
   * Returns all abilities in the tree with an `available` flag.
   */
  function getSpecAbilities(baseClass, specId, power) {
    const spec = SPECS[baseClass]?.[specId];
    if (!spec) return [];
    return spec.abilities.map(a => ({
      ...a,
      available: power >= POWER_TIERS[a.tier]
    }));
  }

  /**
   * Get abilities the player can purchase (meets power threshold, not yet owned).
   */
  function getPurchasableAbilities(baseClass, specId, power, ownedAbilities) {
    const all = getSpecAbilities(baseClass, specId, power);
    return all.filter(a => a.available && !ownedAbilities.includes(a.id));
  }

  /**
   * Look up any ability by ID across all specs.
   */
  function getAbilityById(abilityId) {
    for (const classSpecs of Object.values(SPECS)) {
      for (const spec of Object.values(classSpecs)) {
        const found = spec.abilities.find(a => a.id === abilityId);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Look up an ability by name (case-insensitive partial match).
   * Returns the ability def or null.
   */
  function getAbilityByName(name) {
    const lower = name.toLowerCase();
    for (const classSpecs of Object.values(SPECS)) {
      for (const spec of Object.values(classSpecs)) {
        const found = spec.abilities.find(a => a.name.toLowerCase() === lower);
        if (found) return found;
      }
    }
    // Partial match fallback
    for (const classSpecs of Object.values(SPECS)) {
      for (const spec of Object.values(classSpecs)) {
        const found = spec.abilities.find(a => a.name.toLowerCase().includes(lower));
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Get the QP cost for an ability at a given tier.
   */
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
    getAbilityById,
    getAbilityByName,
    getAbilityCost
  };
})();
