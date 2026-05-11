/**
 * mud_chargen.js — Character Creation System
 *
 * Handles the initial character creation flow when a player enters the MUD
 * for the first time (no existing save data). Presents race, class, and
 * personality questions, then initializes the player with starting stats.
 *
 * The flow is step-based: each step presents choices, the player types a
 * number or keyword, and the system advances to the next step.
 */
(() => {
  'use strict';

  /* ─── Race Definitions ──────────────────────────────────────────────────── */

  const RACES = [
    { id: 'human',      name: 'Human',      desc: 'Adaptable and versatile. No bonuses, no weaknesses.',
      stats: { hp: 0, attack: 0, defense: 0 }, zone_affinity: null },
    { id: 'elf',        name: 'Elf',        desc: 'Graceful and attuned to magic. Bonus to attack, less hardy.',
      stats: { hp: -5, attack: 2, defense: 0 }, zone_affinity: 'fantasy' },
    { id: 'dwarf',      name: 'Dwarf',      desc: 'Stout and resilient. Bonus to defense and HP.',
      stats: { hp: 10, attack: 0, defense: 2 }, zone_affinity: 'fantasy' },
    { id: 'android',    name: 'Android',    desc: 'Synthetic humanoid. High defense, reduced healing.',
      stats: { hp: 5, attack: 1, defense: 3 }, zone_affinity: 'scifi' },
    { id: 'mutant',     name: 'Mutant',     desc: 'Radiation-touched survivor. High attack, fragile.',
      stats: { hp: -5, attack: 4, defense: -1 }, zone_affinity: 'scifi' },
    { id: 'revenant',   name: 'Revenant',   desc: 'Undying spirit in borrowed flesh. Balanced with slow regen.',
      stats: { hp: 5, attack: 1, defense: 1 }, zone_affinity: 'noir' },
    { id: 'nephilim',   name: 'Nephilim',   desc: 'Half-divine bloodline. Strong but hunted by fate.',
      stats: { hp: 0, attack: 3, defense: 1 }, zone_affinity: 'historical' },
    { id: 'oni',        name: 'Oni',        desc: 'Horned warrior spirit. Devastating strength, poor stealth.',
      stats: { hp: 10, attack: 3, defense: -1 }, zone_affinity: 'anime' },
    { id: 'shade',      name: 'Shade',      desc: 'Living shadow. Excellent evasion, weak to light.',
      stats: { hp: -10, attack: 2, defense: 4 }, zone_affinity: 'noir' },
    { id: 'augmented',  name: 'Augmented',  desc: 'Cybernetically enhanced human. Jack of all trades.',
      stats: { hp: 5, attack: 2, defense: 1 }, zone_affinity: 'action' },
    { id: 'beastkin',   name: 'Beastkin',   desc: 'Animal-hybrid warrior. Fast and fierce.',
      stats: { hp: 0, attack: 3, defense: 1 }, zone_affinity: 'anime' },
    { id: 'golem',      name: 'Golem',      desc: 'Animated stone construct. Immense HP, slow.',
      stats: { hp: 20, attack: -1, defense: 4 }, zone_affinity: 'historical' }
  ];

  /* ─── Class Definitions ─────────────────────────────────────────────────── */

  const CLASSES = [
    { id: 'fighter', name: 'Fighter',
      desc: 'Masters of melee combat. High HP and attack. Specializes into Knight, Commando, Enforcer, Mech Pilot, Samurai, or Gladiator.',
      stats: { hp: 20, attack: 3, defense: 2 },
      abilities: ['power_strike'] },
    { id: 'mage', name: 'Mage',
      desc: 'Wielders of arcane and technological power. High attack, low defense. Specializes into Sorcerer, Hacker, Occultist, Demolitions, Elementalist, or Oracle.',
      stats: { hp: -5, attack: 5, defense: 0 },
      abilities: ['arcane_bolt'] },
    { id: 'rogue', name: 'Rogue',
      desc: 'Stealth and precision. Balanced stats with critical hit chance. Specializes into Assassin, Cyber-Thief, Detective, Infiltrator, Ninja, or Scavenger.',
      stats: { hp: 5, attack: 4, defense: 1 },
      abilities: ['backstab'] },
    { id: 'cleric', name: 'Cleric',
      desc: 'Healers and protectors. High defense and self-sustain. Specializes into Paladin, Field Medic, Grifter, Combat Medic, Monk, or Priest.',
      stats: { hp: 10, attack: 1, defense: 4 },
      abilities: ['heal'] }
  ];

  /* ─── Starting Abilities ────────────────────────────────────────────────── */

  const STARTING_ABILITIES = {
    power_strike: { name: 'Power Strike', desc: 'A heavy blow dealing 150% damage.', cooldown: 3, multiplier: 1.5 },
    arcane_bolt:  { name: 'Arcane Bolt',  desc: 'A ranged magical attack dealing 180% damage.', cooldown: 4, multiplier: 1.8 },
    backstab:     { name: 'Backstab',     desc: 'A precise strike dealing 200% damage. May miss.', cooldown: 4, multiplier: 2.0 },
    heal:         { name: 'Heal',         desc: 'Restore 30% of max HP.', cooldown: 5, healPercent: 0.3 }
  };

  /* ─── Chargen Steps ─────────────────────────────────────────────────────── */

  const STEPS = ['welcome', 'race', 'class', 'personality', 'confirm'];

  /**
   * Create a character generation session.
   * Returns an object with processInput(text) and getIntro() methods.
   * When complete, calls onComplete(playerData).
   */
  function create({ onComplete, onOutput }) {
    let step = 'welcome';
    let choices = { race: null, class: null, personality: [] };

    /** Emit lines to the UI */
    function emit(lines) {
      if (onOutput) onOutput(lines);
    }

    /** Get the welcome/intro text */
    function getIntro() {
      return [
        { type: 'room-name', text: '═══ CHARACTER CREATION ═══' },
        { type: 'info', text: '' },
        { type: 'info', text: 'You drift through formless space, drawn toward a distant light.' },
        { type: 'info', text: 'As you approach, the world takes shape around you.' },
        { type: 'info', text: 'But first — who are you?' },
        { type: 'info', text: '' },
        { type: 'success', text: 'Type "begin" to start character creation.' }
      ];
    }

    /** Show race selection */
    function showRaces() {
      const lines = [
        { type: 'room-name', text: '─── Choose Your Race ───' },
        { type: 'info', text: '' }
      ];
      RACES.forEach((r, i) => {
        lines.push({ type: 'items', text: `  ${i + 1}. ${r.name} — ${r.desc}` });
      });
      lines.push({ type: 'info', text: '' });
      lines.push({ type: 'success', text: 'Type the number or name of your choice.' });
      return lines;
    }

    /** Show class selection */
    function showClasses() {
      const lines = [
        { type: 'room-name', text: '─── Choose Your Class ───' },
        { type: 'info', text: '' }
      ];
      CLASSES.forEach((c, i) => {
        lines.push({ type: 'items', text: `  ${i + 1}. ${c.name} — ${c.desc}` });
      });
      lines.push({ type: 'info', text: '' });
      lines.push({ type: 'success', text: 'Type the number or name of your choice.' });
      return lines;
    }

    /** Show personality questions */
    function showPersonality() {
      return [
        { type: 'room-name', text: '─── A Few Questions ───' },
        { type: 'info', text: '' },
        { type: 'info', text: 'What draws you most? (Pick one)' },
        { type: 'info', text: '' },
        { type: 'items', text: '  1. Ancient ruins and forgotten lore' },
        { type: 'items', text: '  2. Neon cities and bleeding-edge technology' },
        { type: 'items', text: '  3. Rain-slicked streets and unsolved mysteries' },
        { type: 'items', text: '  4. Explosions, car chases, and one-liners' },
        { type: 'items', text: '  5. Legendary warriors and impossible battles' },
        { type: 'items', text: '  6. The weight of history and the clash of empires' },
        { type: 'info', text: '' },
        { type: 'success', text: 'Type the number of your choice.' }
      ];
    }

    /** Show confirmation */
    function showConfirm() {
      const race = RACES.find(r => r.id === choices.race);
      const cls = CLASSES.find(c => c.id === choices.class);
      const zoneMap = { 1: 'Fantasy', 2: 'Sci-Fi', 3: 'Noir', 4: 'Action', 5: 'Anime', 6: 'Historical' };
      const suggested = zoneMap[choices.personality[0]] || 'any';

      return [
        { type: 'room-name', text: '─── Confirm Your Character ───' },
        { type: 'info', text: '' },
        { type: 'items', text: `  Race:  ${race.name}` },
        { type: 'items', text: `  Class: ${cls.name}` },
        { type: 'items', text: `  Drawn to: ${suggested} (suggested starting zone)` },
        { type: 'info', text: '' },
        { type: 'success', text: 'Type "yes" to confirm or "restart" to start over.' }
      ];
    }

    /** Build the final player data object */
    function buildPlayer() {
      const race = RACES.find(r => r.id === choices.race);
      const cls = CLASSES.find(c => c.id === choices.class);

      const baseHp = 100;
      const baseAtk = 5;
      const baseDef = 3;

      return {
        race: race.id,
        raceName: race.name,
        class: cls.id,
        className: cls.name,
        specialization: null,
        hp: baseHp + race.stats.hp + cls.stats.hp,
        maxHp: baseHp + race.stats.hp + cls.stats.hp,
        attack: baseAtk + race.stats.attack + cls.stats.attack,
        defense: baseDef + race.stats.defense + cls.stats.defense,
        gold: 50,
        xp: 0,
        genreEchoes: { fantasy: 0, scifi: 0, noir: 0, action: 0, anime: 0, historical: 0 },
        abilities: [...cls.abilities],
        abilityData: { ...STARTING_ABILITIES },
        inventory: [],
        equipment: {},
        currentRoom: '0000',
        worldFlags: {},
        activeQuests: [],
        completedQuests: [],
        killCounts: {},
        suggestedZone: choices.personality[0] || 1
      };
    }

    /**
     * Process a line of input during character creation.
     * Returns true if chargen is still active, false if complete.
     */
    function processInput(text) {
      const input = text.trim().toLowerCase();

      switch (step) {
        case 'welcome':
          if (input === 'begin' || input === 'start' || input === 'yes') {
            step = 'race';
            emit(showRaces());
          } else {
            emit([{ type: 'error', text: 'Type "begin" to start character creation.' }]);
          }
          return true;

        case 'race': {
          const idx = parseInt(input, 10);
          let race = null;
          if (idx >= 1 && idx <= RACES.length) {
            race = RACES[idx - 1];
          } else {
            race = RACES.find(r => r.id === input || r.name.toLowerCase() === input);
          }
          if (!race) {
            emit([{ type: 'error', text: `Invalid choice. Pick 1-${RACES.length} or type a race name.` }]);
            return true;
          }
          choices.race = race.id;
          emit([{ type: 'success', text: `You chose: ${race.name}` }]);
          step = 'class';
          emit(showClasses());
          return true;
        }

        case 'class': {
          const idx = parseInt(input, 10);
          let cls = null;
          if (idx >= 1 && idx <= CLASSES.length) {
            cls = CLASSES[idx - 1];
          } else {
            cls = CLASSES.find(c => c.id === input || c.name.toLowerCase() === input);
          }
          if (!cls) {
            emit([{ type: 'error', text: `Invalid choice. Pick 1-${CLASSES.length} or type a class name.` }]);
            return true;
          }
          choices.class = cls.id;
          emit([{ type: 'success', text: `You chose: ${cls.name}` }]);
          step = 'personality';
          emit(showPersonality());
          return true;
        }

        case 'personality': {
          const idx = parseInt(input, 10);
          if (idx < 1 || idx > 6) {
            emit([{ type: 'error', text: 'Pick a number from 1-6.' }]);
            return true;
          }
          choices.personality.push(idx);
          step = 'confirm';
          emit(showConfirm());
          return true;
        }

        case 'confirm':
          if (input === 'yes' || input === 'y' || input === 'confirm') {
            const playerData = buildPlayer();
            onComplete(playerData);
            return false; // chargen done
          } else if (input === 'restart' || input === 'no' || input === 'n') {
            choices = { race: null, class: null, personality: [] };
            step = 'race';
            emit(showRaces());
            return true;
          } else {
            emit([{ type: 'error', text: 'Type "yes" to confirm or "restart" to start over.' }]);
            return true;
          }

        default:
          return false;
      }
    }

    return { processInput, getIntro };
  }

  // Expose globally
  window.MudChargen = { create, RACES, CLASSES, STARTING_ABILITIES };
})();
