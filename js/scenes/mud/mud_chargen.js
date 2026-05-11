/**
 * mud_chargen.js — Character Creation System
 *
 * Flow:
 *  1. Pick race (12 options)
 *  2. Ultima-style dilemma quiz (4 questions, each weights specializations)
 *  3. Pick specialization from top 6 scoring results
 *  4. Confirm — race + specialization. Base class derived from spec.
 *
 * Specialization determines the ability tree. Base class (fighter/mage/rogue/cleric)
 * is implicit and used only for stat calculations.
 */
(() => {
  'use strict';

  /* ─── Race Definitions ──────────────────────────────────────────────────── */

  const RACES = [
    { id: 'human',      name: 'Human',      desc: 'Adaptable and versatile. No bonuses, no weaknesses.',
      stats: { hp: 0, attack: 0, defense: 0 } },
    { id: 'elf',        name: 'Elf',        desc: 'Graceful and attuned to magic. Bonus to attack, less hardy.',
      stats: { hp: -5, attack: 2, defense: 0 } },
    { id: 'dwarf',      name: 'Dwarf',      desc: 'Stout and resilient. Bonus to defense and HP.',
      stats: { hp: 10, attack: 0, defense: 2 } },
    { id: 'android',    name: 'Android',    desc: 'Synthetic humanoid. High defense, reduced healing.',
      stats: { hp: 5, attack: 1, defense: 3 } },
    { id: 'mutant',     name: 'Mutant',     desc: 'Radiation-touched survivor. High attack, fragile.',
      stats: { hp: -5, attack: 4, defense: -1 } },
    { id: 'revenant',   name: 'Revenant',   desc: 'Undying spirit in borrowed flesh. Balanced with slow regen.',
      stats: { hp: 5, attack: 1, defense: 1 } },
    { id: 'nephilim',   name: 'Nephilim',   desc: 'Half-divine bloodline. Strong but hunted by fate.',
      stats: { hp: 0, attack: 3, defense: 1 } },
    { id: 'oni',        name: 'Oni',        desc: 'Horned warrior spirit. Devastating strength, poor stealth.',
      stats: { hp: 10, attack: 3, defense: -1 } },
    { id: 'shade',      name: 'Shade',      desc: 'Living shadow. Excellent evasion, weak to light.',
      stats: { hp: -10, attack: 2, defense: 4 } },
    { id: 'augmented',  name: 'Augmented',  desc: 'Cybernetically enhanced human. Jack of all trades.',
      stats: { hp: 5, attack: 2, defense: 1 } },
    { id: 'beastkin',   name: 'Beastkin',   desc: 'Animal-hybrid warrior. Fast and fierce.',
      stats: { hp: 0, attack: 3, defense: 1 } },
    { id: 'golem',      name: 'Golem',      desc: 'Animated stone construct. Immense HP, slow.',
      stats: { hp: 20, attack: -1, defense: 4 } }
  ];

  /* ─── Base Class Stats (hidden from player, keyed by class id) ──────────── */

  const CLASS_STATS = {
    fighter: { hp: 20, attack: 3, defense: 2 },
    mage:    { hp: -5, attack: 5, defense: 0 },
    rogue:   { hp: 5,  attack: 4, defense: 1 },
    cleric:  { hp: 10, attack: 1, defense: 4 }
  };

  /* ─── Starting Abilities (one per base class) ───────────────────────────── */

  const CLASS_STARTING_ABILITY = {
    fighter: 'power_strike',
    mage:    'arcane_bolt',
    rogue:   'backstab',
    cleric:  'heal'
  };

  /* ─── Specialization Flavor Text ────────────────────────────────────────── */

  const SPEC_FLAVOR = {
    // Fighter specs
    knight:      'Holy warrior. Heavy armor, radiant strikes, defensive mastery.',
    commando:    'Tactical soldier. Burst fire, stim packs, orbital support.',
    enforcer:    'Street bruiser. Dirty fighting, intimidation, execution.',
    mechpilot:   'Armored pilot. Rocket fists, missile salvos, overdrive.',
    samurai:     'Blade master. Lightning draws, honor guard, one perfect strike.',
    gladiator:   'Arena champion. Roman steel, crowd fury, relentless endurance.',
    // Mage specs
    sorcerer:    'Classic wizard. Fireballs, chain lightning, meteor storms.',
    hacker:      'Digital intruder. Data spikes, firewalls, zero-day exploits.',
    occultist:   'Dark mystic. Hex bolts, soul drain, void rifts.',
    demolitions: 'Explosives expert. C4, napalm, tactical nukes.',
    elementalist:'Spirit channeler. Ki waves, dragon breath, ultimate transformation.',
    oracle:      'Divine seer. Prophecy, plagues, apocalyptic wrath.',
    // Rogue specs
    assassin:    'Shadow killer. Poison blades, vanish, death marks.',
    cyberthief:  'High-tech burglar. EMP darts, cloaking, quantum blades.',
    detective:   'Noir investigator. Sucker punches, cold cases, perfect crimes.',
    infiltrator: 'Covert operative. Wire trips, silenced shots, ghost protocol.',
    ninja:       'Silent warrior. Shuriken storms, shadow clones, forbidden seals.',
    scavenger:   'Wasteland survivor. Jury rigs, ambushes, impossible luck.',
    // Cleric specs
    paladin:     'Holy defender. Smite, divine shields, resurrection.',
    fieldmedic:  'Sci-fi healer. Nano-injection, energy barriers, full restore.',
    grifter:     'Con artist healer. Snake oil, double crosses, insurance fraud.',
    combatmedic: 'Battlefield surgeon. Field patches, suppressive fire, medevac.',
    monk:        'Ki master. Iron body, pressure points, inner peace.',
    priest:      'Temple guardian. Blessings, sanctuary, miracles.'
  };

  /* ─── Dilemma Quiz ──────────────────────────────────────────────────────── */

  /**
   * Each question has 4 answers. Each answer weights multiple specs.
   * Weights are additive across all 4 questions. Top 6 specs are shown.
   *
   * Weight keys: specId → points (typically 2-3 per answer)
   */
  const QUIZ = [
    {
      text: 'A stranger collapses at your feet, clutching a sealed letter. Behind you, armed pursuers close in. What do you do?',
      answers: [
        { text: 'Stand between them and the stranger. No one passes.',
          weights: { knight: 3, paladin: 3, gladiator: 2, samurai: 2, combatmedic: 1 } },
        { text: 'Grab the letter and vanish before anyone notices.',
          weights: { assassin: 3, ninja: 3, cyberthief: 2, detective: 2, infiltrator: 1 } },
        { text: 'Analyze the situation — who sent them, and why?',
          weights: { hacker: 3, oracle: 2, occultist: 2, detective: 2, sorcerer: 1 } },
        { text: 'Tend to the stranger first. The rest can wait.',
          weights: { fieldmedic: 3, priest: 3, monk: 2, grifter: 1, paladin: 1 } }
      ]
    },
    {
      text: 'You discover a weapon of terrible power locked behind a puzzle. What draws you to it?',
      answers: [
        { text: 'The thrill of wielding something unstoppable.',
          weights: { commando: 3, mechpilot: 3, demolitions: 2, enforcer: 2, gladiator: 1 } },
        { text: 'Understanding how it works — knowledge is the real weapon.',
          weights: { sorcerer: 3, hacker: 3, oracle: 2, elementalist: 2, occultist: 1 } },
        { text: 'Ensuring no one else can use it against the innocent.',
          weights: { paladin: 3, knight: 2, priest: 2, combatmedic: 2, monk: 1 } },
        { text: 'Selling it to the highest bidder — or keeping it as leverage.',
          weights: { grifter: 3, scavenger: 3, cyberthief: 2, infiltrator: 2, detective: 1 } }
      ]
    },
    {
      text: 'Your team is pinned down and outnumbered. The mission is failing. What\'s your move?',
      answers: [
        { text: 'Charge headfirst. Overwhelm them with sheer force.',
          weights: { gladiator: 3, enforcer: 3, samurai: 2, commando: 2, mechpilot: 1 } },
        { text: 'Find a way around. Hit them where they don\'t expect.',
          weights: { ninja: 3, infiltrator: 3, assassin: 2, cyberthief: 2, scavenger: 1 } },
        { text: 'Unleash something devastating. End it in one stroke.',
          weights: { demolitions: 3, sorcerer: 2, elementalist: 3, oracle: 2, hacker: 1 } },
        { text: 'Keep everyone alive. We regroup and try again.',
          weights: { combatmedic: 3, fieldmedic: 3, monk: 2, priest: 2, paladin: 1 } }
      ]
    },
    {
      text: 'In a quiet moment, what occupies your thoughts?',
      answers: [
        { text: 'Legends of old — heroes, honor, and the weight of duty.',
          weights: { knight: 3, samurai: 3, gladiator: 2, paladin: 2, priest: 1 } },
        { text: 'The future — what we could build, hack, or become.',
          weights: { hacker: 3, commando: 2, fieldmedic: 2, mechpilot: 3, cyberthief: 1 } },
        { text: 'The shadows between — what people hide, and why.',
          weights: { detective: 3, occultist: 3, enforcer: 2, grifter: 2, ninja: 1 } },
        { text: 'The raw chaos of the world — surviving, adapting, thriving.',
          weights: { scavenger: 3, demolitions: 2, elementalist: 2, infiltrator: 2, monk: 2 } }
      ]
    }
  ];

  /* ─── Spec-to-Class Mapping ─────────────────────────────────────────────── */

  const SPEC_TO_CLASS = {};
  (function buildMap() {
    const map = window.MudAbilities?.GENRE_TO_SPEC;
    if (map) {
      for (const [cls, genres] of Object.entries(map)) {
        for (const specId of Object.values(genres)) {
          SPEC_TO_CLASS[specId] = cls;
        }
      }
    }
  })();

  /** Fallback if MudAbilities not loaded yet */
  function getClassForSpec(specId) {
    if (SPEC_TO_CLASS[specId]) return SPEC_TO_CLASS[specId];
    // Hardcoded fallback
    const fighters = ['knight','commando','enforcer','mechpilot','samurai','gladiator'];
    const mages = ['sorcerer','hacker','occultist','demolitions','elementalist','oracle'];
    const rogues = ['assassin','cyberthief','detective','infiltrator','ninja','scavenger'];
    const clerics = ['paladin','fieldmedic','grifter','combatmedic','monk','priest'];
    if (fighters.includes(specId)) return 'fighter';
    if (mages.includes(specId)) return 'mage';
    if (rogues.includes(specId)) return 'rogue';
    if (clerics.includes(specId)) return 'cleric';
    return 'fighter';
  }

  /* ─── Chargen Steps ─────────────────────────────────────────────────────── */

  const STEPS = ['welcome', 'race', 'quiz', 'spec', 'confirm'];

  /**
   * Create a character generation session.
   * Returns an object with processInput(text) and getIntro() methods.
   * When complete, calls onComplete(playerData).
   */
  function create({ onComplete, onOutput }) {
    let step = 'welcome';
    let choices = { race: null, spec: null };
    let quizIndex = 0;
    let specScores = {}; // specId → cumulative score

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

    /** Show the current quiz question */
    function showQuizQuestion() {
      const q = QUIZ[quizIndex];
      const lines = [
        { type: 'room-name', text: `─── Question ${quizIndex + 1} of ${QUIZ.length} ───` },
        { type: 'info', text: '' },
        { type: 'info', text: q.text },
        { type: 'info', text: '' }
      ];
      q.answers.forEach((a, i) => {
        lines.push({ type: 'items', text: `  ${i + 1}. ${a.text}` });
      });
      lines.push({ type: 'info', text: '' });
      lines.push({ type: 'success', text: 'Type the number of your answer.' });
      return lines;
    }

    /** Calculate top 6 specs from scores and show selection */
    function showSpecChoices() {
      const sorted = Object.entries(specScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      const lines = [
        { type: 'room-name', text: '─── Choose Your Path ───' },
        { type: 'info', text: '' },
        { type: 'info', text: 'Based on your answers, these paths call to you:' },
        { type: 'info', text: '' }
      ];
      sorted.forEach(([specId], i) => {
        const spec = window.MudAbilities?.getSpec(getClassForSpec(specId), specId);
        const name = spec?.name || specId;
        const flavor = SPEC_FLAVOR[specId] || '';
        lines.push({ type: 'items', text: `  ${i + 1}. ${name} — ${flavor}` });
      });
      lines.push({ type: 'info', text: '' });
      lines.push({ type: 'success', text: 'Type the number of your choice.' });
      return lines;
    }

    /** Show confirmation */
    function showConfirm() {
      const race = RACES.find(r => r.id === choices.race);
      const specId = choices.spec;
      const cls = getClassForSpec(specId);
      const spec = window.MudAbilities?.getSpec(cls, specId);
      const specName = spec?.name || specId;

      return [
        { type: 'room-name', text: '─── Confirm Your Character ───' },
        { type: 'info', text: '' },
        { type: 'items', text: `  Race:  ${race.name}` },
        { type: 'items', text: `  Path:  ${specName}` },
        { type: 'items', text: `         ${SPEC_FLAVOR[specId] || ''}` },
        { type: 'info', text: '' },
        { type: 'success', text: 'Type "yes" to confirm or "restart" to start over.' }
      ];
    }

    /** Build the final player data object */
    function buildPlayer() {
      const race = RACES.find(r => r.id === choices.race);
      const specId = choices.spec;
      const baseClass = getClassForSpec(specId);
      const cStats = CLASS_STATS[baseClass];
      const startAbility = CLASS_STARTING_ABILITY[baseClass];

      const baseHp = 100;
      const baseAtk = 5;
      const baseDef = 3;

      return {
        race: race.id,
        raceName: race.name,
        baseClass: baseClass,
        specialization: specId,
        specName: window.MudAbilities?.getSpec(baseClass, specId)?.name || specId,
        hp: baseHp + race.stats.hp + cStats.hp,
        maxHp: baseHp + race.stats.hp + cStats.hp,
        attackPower: baseAtk + race.stats.attack + cStats.attack,
        defense: baseDef + race.stats.defense + cStats.defense,
        gold: 50,
        power: 0,
        questPoints: 0,
        focus: 50,
        maxFocus: 50,
        focusCostModifier: 0,
        abilities: startAbility ? [startAbility] : [],
        abilityCooldowns: {},
        inventory: [],
        equipped: {},
        currentRoom: 0,
        visitedRooms: [],
        worldFlags: {},
        activeQuests: [],
        completedQuests: [],
        questCompletionCounts: {},
        killCounts: {}
      };
    }

    /** Get the sorted top 6 spec IDs (for input matching) */
    function getTop6() {
      return Object.entries(specScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(e => e[0]);
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
          step = 'quiz';
          quizIndex = 0;
          specScores = {};
          emit(showQuizQuestion());
          return true;
        }

        case 'quiz': {
          const q = QUIZ[quizIndex];
          const idx = parseInt(input, 10);
          if (idx < 1 || idx > q.answers.length) {
            emit([{ type: 'error', text: `Pick a number from 1-${q.answers.length}.` }]);
            return true;
          }
          // Apply weights from chosen answer
          const answer = q.answers[idx - 1];
          for (const [specId, weight] of Object.entries(answer.weights)) {
            specScores[specId] = (specScores[specId] || 0) + weight;
          }
          quizIndex++;
          if (quizIndex < QUIZ.length) {
            emit(showQuizQuestion());
          } else {
            step = 'spec';
            emit(showSpecChoices());
          }
          return true;
        }

        case 'spec': {
          const top6 = getTop6();
          const idx = parseInt(input, 10);
          let specId = null;
          if (idx >= 1 && idx <= 6) {
            specId = top6[idx - 1];
          } else {
            // Try matching by name
            specId = top6.find(s => {
              const spec = window.MudAbilities?.getSpec(getClassForSpec(s), s);
              return spec?.name?.toLowerCase() === input || s === input;
            });
          }
          if (!specId) {
            emit([{ type: 'error', text: 'Invalid choice. Pick 1-6 or type the path name.' }]);
            return true;
          }
          choices.spec = specId;
          const spec = window.MudAbilities?.getSpec(getClassForSpec(specId), specId);
          emit([{ type: 'success', text: `You chose: ${spec?.name || specId}` }]);
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
            choices = { race: null, spec: null };
            quizIndex = 0;
            specScores = {};
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
  window.MudChargen = { create, RACES, CLASS_STATS, SPEC_FLAVOR };
})();
