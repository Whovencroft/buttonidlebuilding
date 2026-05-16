/**
 * mud_chargen.js  -  Character Creation System
 *
 * Flow:
 *  1. Pick race (12 options)
 *  2. Enter name
 *  3. Choose appearance (gender, hair color, eye color, body type)
 *  4. Ultima-style tournament quiz (7 questions, 8 traits in bracket elimination)
 *     - Round 1: 4 questions (each trait appears once) → 4 eliminated
 *     - Round 2: 2 questions (remaining 4 traits, each appears once) → 2 eliminated
 *     - Round 3: 1 final question between last 2 traits → winner determined
 *  5. Pick specialization from top 6 scoring results
 *  6. Confirm  -  race + specialization + appearance. Base class derived from spec.
 *
 * 28 unique dilemma questions cover every possible trait pairing (8 choose 2).
 * Brackets are shuffled each playthrough for variety.
 */
(() => {
  'use strict';

  /* ─── Race Definitions ──────────────────────────────────────────────────── */

  const RACES = [
    { id: 'human',      name: 'Human',      desc: 'Adaptable and versatile. No bonuses, no weaknesses.',
      mods: {} },
    { id: 'elf',        name: 'Elf',        desc: 'Graceful and attuned to magic. Bonus focus.',
      mods: { focus: 0.02 } },
    { id: 'dwarf',      name: 'Dwarf',      desc: 'Stout and resilient. Bonus to defense.',
      mods: { defense: 0.03 } },
    { id: 'android',    name: 'Android',    desc: 'Synthetic humanoid. High defense, reduced healing.',
      mods: { defense: 0.03, healing: -0.10 } },
    { id: 'mutant',     name: 'Mutant',     desc: 'Radiation-touched survivor. High attack, fragile.',
      mods: { attack: 0.05 } },
    { id: 'revenant',   name: 'Revenant',   desc: 'Undying spirit in borrowed flesh. Balanced with slow regen.',
      mods: { attack: 0.02, defense: 0.02, regen: -0.20 } },
    { id: 'nephilim',   name: 'Nephilim',   desc: 'Half-divine bloodline. Strong but hunted by fate.',
      mods: { attack: 0.03, defense: 0.03, ghostEncounter: 0.20, invasionChance: 0.20 } },
    { id: 'oni',        name: 'Oni',        desc: 'Horned warrior spirit. Devastating strength, all enemies aggro.',
      mods: { hp: 0.05, allAggro: true } },
    { id: 'shade',      name: 'Shade',      desc: 'Living shadow. Excellent evasion.',
      mods: { dodge: 0.05 } },
    { id: 'augmented',  name: 'Augmented',  desc: 'Jack of all trades, master of none. Cannot glimmer above tier 6, but glimmers faster.',
      mods: { glimmerCap: 6, glimmerSpeed: 0.50 } },
    { id: 'beastkin',   name: 'Beastkin',   desc: 'Animal-hybrid warrior. Bonus to ATK/DEF, animals are sacred.',
      mods: { attack: 0.03, defense: 0.03, animalNoKill: true } },
    { id: 'golem',      name: 'Golem',      desc: 'Animated stone construct. Immense HP, slow cooldowns.',
      mods: { hp: 0.05, cooldownPenalty: 2 } }
  ];

  /* ─── Base Class Stats (hidden from player, keyed by class id) ──────────── */

  const CLASS_STATS = {
    fighter: { hp: 20, attack: 3, defense: 2 },
    mage:    { hp: -5, attack: 5, defense: 0 },
    rogue:   { hp: 5,  attack: 4, defense: 1 },
    cleric:  { hp: 10, attack: 1, defense: 4 }
  };
  /* --- Starting Abilities (one per base class) --- */

  const CLASS_STARTING_ABILITY = {
    fighter: 'power_strike',
    mage:    'arcane_bolt',
    rogue:   'backstab',
    cleric:  'heal'
  };

  /* --- Appearance Options --- */

  const HAIR_COLORS = ['Black', 'Brown', 'Blonde', 'Red', 'White', 'Silver', 'Blue', 'Green', 'Purple', 'Bald'];
  const EYE_COLORS = ['Brown', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber', 'Red', 'Violet', 'Gold', 'Black'];
  const BODY_TYPES = ['Lean', 'Athletic', 'Stocky', 'Tall', 'Short', 'Heavy', 'Wiry', 'Broad'];

  /** Class-flavor sentence fragments for the generated description. */
  const CLASS_DESC_FLAVOR = {
    knight:      'An aura of holy discipline surrounds them.',
    commando:    'They carry themselves with military precision.',
    enforcer:    'Scars and bruises mark a life of street violence.',
    mechpilot:   'Faint hydraulic hums emanate from hidden augments.',
    samurai:     'Every movement is deliberate, economical, lethal.',
    gladiator:   'Their body is a map of arena victories.',
    sorcerer:    'Arcane energy crackles faintly at their fingertips.',
    hacker:      'Their eyes flicker with scrolling data feeds.',
    occultist:   'Shadows cling to them like loyal pets.',
    demolitions: 'The faint smell of cordite follows them everywhere.',
    elementalist:'Elemental energy ripples across their skin.',
    oracle:      'Their gaze seems fixed on something beyond the visible.',
    assassin:    'They are difficult to look at directly, as if light avoids them.',
    cyberthief:  'Fiber-optic threads glint beneath their skin.',
    detective:   'Sharp eyes miss nothing; every detail is catalogued.',
    infiltrator: 'They blend into any crowd without effort.',
    ninja:       'Silence follows them like a second shadow.',
    scavenger:   'Jury-rigged gear hangs from every available strap.',
    paladin:     'A faint golden light outlines their silhouette.',
    fieldmedic:  'Medical nanites shimmer across their hands.',
    grifter:     'Their smile promises everything and guarantees nothing.',
    combatmedic: 'Bandages and ammunition share equal pocket space.',
    monk:        'Perfect stillness radiates outward from their center.',
    priest:      'Whispered prayers trail behind them like incense.'
  };

  /**
   * Build a character description from appearance choices and class.
   * Returns a single descriptive sentence block.
   */
  function buildDescription(choices, specId) {
    const genderWord = { M: 'male', F: 'female', N: '' };
    const pronouns = { M: 'him', F: 'her', N: 'them' };
    const race = RACES.find(r => r.id === choices.race);
    const raceName = race?.name || 'being';
    const g = genderWord[choices.gender] || '';
    const hair = (choices.hairColor || 'dark').toLowerCase();
    const eyes = (choices.eyeColor || 'dark').toLowerCase();
    const body = (choices.bodyType || 'average').toLowerCase();
    const hairDesc = hair === 'bald' ? 'a bald head' : `${hair} hair`;
    const classFlavor = CLASS_DESC_FLAVOR[specId] || '';
    return `A ${body} ${g} ${raceName} with ${hairDesc} and ${eyes} eyes. ${classFlavor}`.trim();
  }

  /** Show gender selection prompt. */
  function showGenderChoice() {
    return [
      { type: 'room-name', text: '--- Appearance ---' },
      { type: 'info', text: '' },
      { type: 'items', text: '  1. Male' },
      { type: 'items', text: '  2. Female' },
      { type: 'items', text: '  3. Neutral' },
      { type: 'info', text: '' },
      { type: 'success', text: 'Choose your gender (1-3).' }
    ];
  }

  /** Show hair color selection prompt. */
  function showHairChoice() {
    const lines = [
      { type: 'room-name', text: '--- Hair Color ---' },
      { type: 'info', text: '' }
    ];
    HAIR_COLORS.forEach((c, i) => lines.push({ type: 'items', text: `  ${i + 1}. ${c}` }));
    lines.push({ type: 'info', text: '' });
    lines.push({ type: 'success', text: `Choose 1-${HAIR_COLORS.length} or type a color.` });
    return lines;
  }

  /** Show eye color selection prompt. */
  function showEyeChoice() {
    const lines = [
      { type: 'room-name', text: '--- Eye Color ---' },
      { type: 'info', text: '' }
    ];
    EYE_COLORS.forEach((c, i) => lines.push({ type: 'items', text: `  ${i + 1}. ${c}` }));
    lines.push({ type: 'info', text: '' });
    lines.push({ type: 'success', text: `Choose 1-${EYE_COLORS.length} or type a color.` });
    return lines;
  }

  /** Show body type selection prompt. */
  function showBodyChoice() {
    const lines = [
      { type: 'room-name', text: '--- Body Type ---' },
      { type: 'info', text: '' }
    ];
    BODY_TYPES.forEach((b, i) => lines.push({ type: 'items', text: `  ${i + 1}. ${b}` }));
    lines.push({ type: 'info', text: '' });
    lines.push({ type: 'success', text: `Choose 1-${BODY_TYPES.length} or type a body type.` });
    return lines;
  } /* ─── Specialization Flavor Text ────────────────────────────────────────── */

  const SPEC_FLAVOR = {
    knight:      'Holy warrior. Heavy armor, radiant strikes, defensive mastery.',
    commando:    'Tactical soldier. Burst fire, stim packs, orbital support.',
    enforcer:    'Street bruiser. Dirty fighting, intimidation, execution.',
    mechpilot:   'Armored pilot. Rocket fists, missile salvos, overdrive.',
    samurai:     'Blade master. Lightning draws, honor guard, one perfect strike.',
    gladiator:   'Arena champion. Roman steel, crowd fury, relentless endurance.',
    sorcerer:    'Classic wizard. Fireballs, chain lightning, meteor storms.',
    hacker:      'Digital intruder. Data spikes, firewalls, zero-day exploits.',
    occultist:   'Dark mystic. Hex bolts, soul drain, void rifts.',
    demolitions: 'Explosives expert. C4, napalm, tactical nukes.',
    elementalist:'Spirit channeler. Ki waves, dragon breath, ultimate transformation.',
    oracle:      'Divine seer. Prophecy, plagues, apocalyptic wrath.',
    assassin:    'Shadow killer. Poison blades, vanish, death marks.',
    cyberthief:  'High-tech burglar. EMP darts, cloaking, quantum blades.',
    detective:   'Noir investigator. Sucker punches, cold cases, perfect crimes.',
    infiltrator: 'Covert operative. Wire trips, silenced shots, ghost protocol.',
    ninja:       'Silent warrior. Shuriken storms, shadow clones, forbidden seals.',
    scavenger:   'Wasteland survivor. Jury rigs, ambushes, impossible luck.',
    paladin:     'Holy defender. Smite, divine shields, resurrection.',
    fieldmedic:  'Sci-fi healer. Nano-injection, energy barriers, full restore.',
    grifter:     'Con artist healer. Snake oil, double crosses, insurance fraud.',
    combatmedic: 'Battlefield surgeon. Field patches, suppressive fire, medevac.',
    monk:        'Ki master. Iron body, pressure points, inner peace.',
    priest:      'Temple guardian. Blessings, sanctuary, miracles.'
  };

  /* ─── 8 Traits (Ultima-style virtues) ──────────────────────────────────── */
  /*
   * Each trait maps to 3 specializations. The tournament bracket eliminates
   * traits; the winning trait's 3 specs + runner-up's 3 specs = 6 choices.
   */

  const TRAITS = [
    { id: 'valor',    name: 'Valor',    specs: ['knight', 'gladiator', 'samurai'] },
    { id: 'cunning',  name: 'Cunning',  specs: ['detective', 'cyberthief', 'infiltrator'] },
    { id: 'wisdom',   name: 'Wisdom',   specs: ['sorcerer', 'oracle', 'elementalist'] },
    { id: 'mercy',    name: 'Mercy',    specs: ['paladin', 'fieldmedic', 'priest'] },
    { id: 'fury',     name: 'Fury',     specs: ['mechpilot', 'demolitions', 'enforcer'] },
    { id: 'shadow',   name: 'Shadow',   specs: ['ninja', 'assassin', 'scavenger'] },
    { id: 'devotion', name: 'Devotion', specs: ['monk', 'combatmedic', 'commando'] },
    { id: 'guile',    name: 'Guile',    specs: ['hacker', 'grifter', 'occultist'] }
  ];

  /* ─── 28 Dilemma Questions (every trait pairing) ───────────────────────── */
  /*
   * Key format: "traitA_vs_traitB" (alphabetical order).
   * Answer A favors the first trait, Answer B favors the second.
   */

  const DILEMMAS = {
    cunning_valor: {
      text: 'A warlord offers you a duel for safe passage. Do you face him blade to blade, or find the hidden path his scouts missed?',
      a: 'Meet his challenge head-on. Strength earns respect.',
      b: 'Slip past unseen. The clever survive longer than the brave.'
    },
    valor_wisdom: {
      text: 'An ancient library burns. Soldiers guard the only exit. Do you fight through them or search for knowledge worth saving?',
      a: 'Cut a path through. Action saves more than hesitation.',
      b: 'Salvage what knowledge you can. Swords rust; wisdom endures.'
    },
    mercy_valor: {
      text: 'A wounded enemy begs for mercy on the battlefield. Your allies urge you to finish it.',
      a: 'End the fight cleanly. A warrior finishes what they start.',
      b: 'Spare them. Compassion is the hardest kind of strength.'
    },
    fury_valor: {
      text: 'Your fortress is surrounded. Do you lead a disciplined defense or unleash everything in a devastating counterattack?',
      a: 'Hold the line. Discipline wins wars.',
      b: 'Unleash hell. Overwhelming force breaks any siege.'
    },
    shadow_valor: {
      text: 'A tyrant sleeps in his tower. You could challenge him at dawn or end it tonight in silence.',
      a: 'Challenge him openly. Let the people see him fall.',
      b: 'Strike from the dark. The result matters more than the method.'
    },
    devotion_valor: {
      text: 'Your squad is pinned down. Do you charge to draw fire, or stay and keep the wounded alive?',
      a: 'Charge. One life risked to save many.',
      b: 'Stay. The ones already hurt need you most.'
    },
    guile_valor: {
      text: 'A rival challenges you to a contest of arms. You know his weakness but exploiting it would be dishonorable.',
      a: 'Fight fair. Victory means nothing if it is stolen.',
      b: 'Use every advantage. Honor is a luxury the dead cannot afford.'
    },
    cunning_wisdom: {
      text: 'You intercept a coded message that could prevent a war. Do you study it carefully or act on what you can guess?',
      a: 'Act now with what you know. Speed saves lives.',
      b: 'Decode it fully. A wrong guess could start the very war you fear.'
    },
    cunning_mercy: {
      text: 'A thief stole medicine meant for plague victims. You have tracked them to their hideout.',
      a: 'Recover the medicine by any means necessary.',
      b: 'Discover why they stole it. Perhaps they need it too.'
    },
    cunning_fury: {
      text: 'An enemy convoy carries weapons through a narrow pass. You have a small team.',
      a: 'Set an ambush. Precision and timing over brute force.',
      b: 'Blow the pass and bury them. Overkill is underrated.'
    },
    cunning_shadow: {
      text: 'Two rival gangs control the district. You need something from both of them.',
      a: 'Play them against each other. Let them weaken themselves.',
      b: 'Rob them both in the same night. Leave no trail.'
    },
    cunning_devotion: {
      text: 'Your informant is in danger. Saving them exposes your network. Leaving them preserves it.',
      a: 'Preserve the network. One person cannot outweigh the mission.',
      b: 'Save them. Loyalty to your people comes first.'
    },
    cunning_guile: {
      text: 'A merchant offers you a deal that seems too good. Your gut says trap; your mind says opportunity.',
      a: 'Investigate quietly. Trust your instincts but verify.',
      b: 'Take the deal but prepare a counter-trap. Turn their scheme against them.'
    },
    mercy_wisdom: {
      text: 'A dangerous prisoner holds the key to an ancient mystery. They will only speak if released.',
      a: 'Seek the knowledge another way. Some prices are too high.',
      b: 'Release them under guard. Understanding is worth the risk.'
    },
    fury_wisdom: {
      text: 'You have discovered a weapon of terrible power. It could end the war in a day or poison the land for centuries.',
      a: 'Study it. Knowledge of its nature may reveal a safer path.',
      b: 'Use it. The war has already poisoned enough lives.'
    },
    shadow_wisdom: {
      text: 'A sage offers forbidden knowledge, but only if you steal a sacred relic from a temple.',
      a: 'Refuse. Some knowledge is not worth the cost of obtaining it.',
      b: 'Take the relic. The temple hoards what should be shared.'
    },
    devotion_wisdom: {
      text: 'Your mentor asks you to abandon your research and tend to the wounded. Lives hang in the balance either way.',
      a: 'The research could save thousands. Stay the course.',
      b: 'The wounded need help now. Theory can wait.'
    },
    guile_wisdom: {
      text: 'A rival scholar publishes your stolen research. You can expose them or use their fame to advance your true work.',
      a: 'Expose the fraud. Truth must be defended.',
      b: 'Let them have the spotlight. Use their visibility to mask your real project.'
    },
    fury_mercy: {
      text: 'A village harbors the soldiers who burned your home. The villagers claim ignorance.',
      a: 'Show mercy. Vengeance would make you no different from them.',
      b: 'Burn it down. They chose their side when they sheltered your enemies.'
    },
    mercy_shadow: {
      text: 'An assassin who once spared your life is now your target. Your employer demands proof of the kill.',
      a: 'Repay the debt. Help them disappear.',
      b: 'Complete the contract. Sentiment is a liability in this work.'
    },
    devotion_mercy: {
      text: 'A plague ship approaches port. The sick aboard will die without help, but docking risks the city.',
      a: 'Let them dock. We do not abandon the suffering.',
      b: 'Send supplies by boat but keep the port sealed. Protect the many.'
    },
    guile_mercy: {
      text: 'A con artist has been swindling the poor. You catch them, but they offer to split the take if you look away.',
      a: 'Turn them in. The victims deserve justice.',
      b: 'Take the deal and use the money to help the victims yourself.'
    },
    fury_shadow: {
      text: 'Your enemy hides behind hostages. A direct assault risks them all.',
      a: 'Strike hard and fast. Hesitation kills more than action.',
      b: 'Infiltrate silently. Free the hostages before they know you are there.'
    },
    devotion_fury: {
      text: 'Your commander orders a scorched-earth retreat. Your wounded cannot be moved.',
      a: 'Defy orders. Stay with the wounded.',
      b: 'Follow orders. The retreat saves the army; the wounded would want that.'
    },
    fury_guile: {
      text: 'An arms dealer offers you prototype weapons. Powerful, but they come with strings attached.',
      a: 'Take the weapons. Power now, consequences later.',
      b: 'Negotiate. Find out what the strings are and cut the ones you do not like.'
    },
    devotion_shadow: {
      text: 'Your closest friend has been secretly working for the enemy. They beg you to keep their secret.',
      a: 'Keep the secret. Loyalty runs deeper than politics.',
      b: 'Report them. The mission is bigger than any friendship.'
    },
    guile_shadow: {
      text: 'You discover a hidden passage into the enemy stronghold. Do you sell the information or use it yourself?',
      a: 'Sell it to the highest bidder. Information is currency.',
      b: 'Use it yourself. The best secrets are the ones nobody else knows.'
    },
    devotion_guile: {
      text: 'Your order asks you to deceive an ally for the greater good. The deception would save lives but destroy trust.',
      a: 'Refuse. Trust, once broken, cannot be rebuilt.',
      b: 'Do it. The lives saved are worth more than one relationship.'
    }
  };

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

  /** Fallback if MudAbilities not loaded yet. */
  function getClassForSpec(specId) {
    if (SPEC_TO_CLASS[specId]) return SPEC_TO_CLASS[specId];
    const fighters = ['knight','commando','enforcer','mechpilot','samurai','gladiator'];
    const mages = ['sorcerer','hacker','occultist','demolitions','elementalist','oracle'];
    const rogues = ['assassin','cyberthief','detective','infiltrator','ninja','scavenger'];
    if (fighters.includes(specId)) return 'fighter';
    if (mages.includes(specId)) return 'mage';
    if (rogues.includes(specId)) return 'rogue';
    return 'cleric';
  }

  /* ─── Tournament Bracket Logic ─────────────────────────────────────────── */

  /**
   * Create a bracket with opposing-trait seeding for maximum differentiation.
   * Pairs thematically opposed traits in round 1 so answers matter more.
   * Also tracks cumulative scores for all traits across all rounds.
   */
  function createBracket() {
    // Opposing pairs: valor/shadow, cunning/devotion, wisdom/fury, mercy/guile
    const OPPOSING = [
      ['valor', 'shadow'],
      ['cunning', 'devotion'],
      ['wisdom', 'fury'],
      ['mercy', 'guile']
    ];
    // Shuffle the order of pairs and randomize which side is A/B
    const pairs = [...OPPOSING].sort(() => Math.random() - 0.5);
    const matchups = pairs.map(([a, b]) => {
      const tA = TRAITS.find(t => t.id === a);
      const tB = TRAITS.find(t => t.id === b);
      return Math.random() < 0.5 ? [tA, tB] : [tB, tA];
    });
    // Initialize scores for all traits
    const scores = {};
    TRAITS.forEach(t => { scores[t.id] = 0; });
    return {
      round: 1,
      matchups,
      matchIndex: 0,
      survivors: [],
      eliminated: [],
      scores,         // cumulative score per trait across all rounds
      questionNum: 0
    };
  }

  /**
   * Get the dilemma question for a given trait matchup.
   * Returns { text, a, b, traitA, traitB }.
   */
  function getDilemma(traitA, traitB) {
    // Key is alphabetical
    const ids = [traitA.id, traitB.id].sort();
    const key = `${ids[0]}_${ids[1]}`;
    const d = DILEMMAS[key];
    if (!d) return null;

    // If traitA is alphabetically first, A answer = traitA wins
    // Otherwise swap so the answer labels match correctly
    const aIsFirst = traitA.id === ids[0];
    return {
      text: d.text,
      a: aIsFirst ? d.a : d.b,
      b: aIsFirst ? d.b : d.a,
      traitA,
      traitB
    };
  }

  /**
   * Advance the bracket after a choice. Returns the next dilemma or null if done.
   * Scores both traits: winner gets 3 points, loser gets 1 (still contributes).
   * Later rounds award more points so they carry more weight.
   */
  function advanceBracket(bracket, choice) {
    const matchup = bracket.matchups[bracket.matchIndex];
    const winner = choice === 'a' ? matchup[0] : matchup[1];
    const loser = choice === 'a' ? matchup[1] : matchup[0];

    // Score based on round weight (later rounds matter more)
    const roundWeight = bracket.round === 1 ? 1 : bracket.round === 2 ? 2 : 3;
    bracket.scores[winner.id] += 3 * roundWeight;
    bracket.scores[loser.id] += 1 * roundWeight;

    bracket.survivors.push(winner);
    bracket.eliminated.push(loser);
    bracket.matchIndex++;
    bracket.questionNum++;

    // Check if current round is complete
    if (bracket.matchIndex >= bracket.matchups.length) {
      if (bracket.round === 1) {
        // Round 1 done (4 survivors). Set up round 2 (2 matchups).
        bracket.round = 2;
        bracket.matchups = [
          [bracket.survivors[0], bracket.survivors[1]],
          [bracket.survivors[2], bracket.survivors[3]]
        ];
        bracket.matchIndex = 0;
        bracket.survivors = [];
      } else if (bracket.round === 2) {
        // Round 2 done (2 survivors). Set up final.
        bracket.round = 3;
        bracket.matchups = [
          [bracket.survivors[0], bracket.survivors[1]]
        ];
        bracket.matchIndex = 0;
        bracket.survivors = [];
      } else {
        // Final done. Winner is the sole survivor.
        bracket.round = 0; // signals completion
        return null;
      }
    }

    // Return next dilemma
    const next = bracket.matchups[bracket.matchIndex];
    return getDilemma(next[0], next[1]);
  }

  /* ─── Chargen Steps ─────────────────────────────────────────────────────── */

  /**
   * Create a character generation session.
   * Returns an object with processInput(text) and getIntro() methods.
   * When complete, calls onComplete(playerData).
   */
  function create({ onComplete, onOutput }) {
    let step = 'welcome';
    let choices = { race: null, spec: null, name: null, gender: null, hairColor: null, eyeColor: null, bodyType: null };
    let bracket = null;
    let currentDilemma = null;
    let topSpecs = [];  // the 6 spec ids presented to the player

    /** Emit lines to the UI. */
    function emit(lines) {
      if (onOutput) onOutput(lines);
    }

    /** Get the welcome/intro text. */
    function getIntro() {
      return [
        { type: 'room-name', text: '═══ CHARACTER CREATION ═══' },
        { type: 'info', text: '' },
        { type: 'info', text: 'You drift through formless space, drawn toward a distant light.' },
        { type: 'info', text: 'As you approach, the world takes shape around you.' },
        { type: 'info', text: 'But first - who are you?' },
        { type: 'info', text: '' },
        { type: 'success', text: 'Type "begin" to start character creation.' }
      ];
    }

    /** Show race selection with percentage-based mods. */
    function showRaces() {
      const lines = [
        { type: 'room-name', text: '--- Choose Your Race ---' },
        { type: 'info', text: '' }
      ];
      RACES.forEach((r, i) => {
        const m = r.mods || {};
        const tags = [];
        if (m.attack)   tags.push(`ATK +${Math.round(m.attack * 100)}%`);
        if (m.defense)  tags.push(`DEF +${Math.round(m.defense * 100)}%`);
        if (m.hp)       tags.push(`HP +${Math.round(m.hp * 100)}%`);
        if (m.focus)    tags.push(`Focus +${Math.round(m.focus * 100)}%`);
        if (m.dodge)    tags.push(`Dodge +${Math.round(m.dodge * 100)}%`);
        if (m.healing)  tags.push(`Healing ${Math.round(m.healing * 100)}%`);
        if (m.regen)    tags.push(`Regen ${Math.round(m.regen * 100)}%`);
        const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
        lines.push({ type: 'items', text: `  ${i + 1}. ${r.name}${tagStr}` });
        lines.push({ type: 'info', text: `      ${r.desc}` });
      });
      lines.push({ type: 'info', text: '' });
      lines.push({ type: 'success', text: 'Type the number or name of your choice.' });
      return lines;
    }

    /** Show the current tournament dilemma. */
    function showDilemma() {
      if (!currentDilemma) return [];
      const roundLabel = bracket.round === 1 ? 'I' : bracket.round === 2 ? 'II' : 'Final';
      return [
        { type: 'room-name', text: `─── Round ${roundLabel} - Question ${bracket.questionNum + 1} of 7 ───` },
        { type: 'info', text: '' },
        { type: 'info', text: currentDilemma.text },
        { type: 'info', text: '' },
        { type: 'items', text: `  A. ${currentDilemma.a}` },
        { type: 'items', text: `  B. ${currentDilemma.b}` },
        { type: 'info', text: '' },
        { type: 'success', text: 'Type A or B.' }
      ];
    }

    /**
     * Calculate the top 6 specs using cumulative scores from all rounds.
     * Ranks all 8 traits by score, takes top 2 traits' specs (3 each = 6).
     * This ensures every answer contributes to the final result.
     */
    function calculateTopSpecs() {
      const ranked = [...TRAITS].sort((a, b) => bracket.scores[b.id] - bracket.scores[a.id]);
      // Top 2 scoring traits provide the 6 spec choices
      return [...ranked[0].specs, ...ranked[1].specs];
    }

    /** Show specialization choices. */
    function showSpecChoices() {
      const lines = [
        { type: 'room-name', text: '─── Choose Your Path ───' },
        { type: 'info', text: '' },
        { type: 'info', text: 'The trials have revealed your nature. These paths call to you:' },
        { type: 'info', text: '' }
      ];
      topSpecs.forEach((specId, i) => {
        const spec = window.MudAbilities?.getSpec(getClassForSpec(specId), specId);
        const name = spec?.name || specId.charAt(0).toUpperCase() + specId.slice(1);
        const flavor = SPEC_FLAVOR[specId] || '';
        lines.push({ type: 'items', text: `  ${i + 1}. ${name} - ${flavor}` });
      });
      lines.push({ type: 'info', text: '' });
      lines.push({ type: 'success', text: 'Type the number or name of your choice.' });
      return lines;
    }

    /** Show confirmation with full appearance summary. */
    function showConfirm() {
      const race = RACES.find(r => r.id === choices.race);
      const specId = choices.spec;
      const cls = getClassForSpec(specId);
      const spec = window.MudAbilities?.getSpec(cls, specId);
      const specName = spec?.name || specId.charAt(0).toUpperCase() + specId.slice(1);
      const desc = buildDescription(choices, specId);

      return [
        { type: 'room-name', text: '--- Confirm Your Character ---' },
        { type: 'info', text: '' },
        { type: 'items', text: `  Name:  ${choices.name}` },
        { type: 'items', text: `  Race:  ${race.name}` },
        { type: 'items', text: `  Path:  ${specName}` },
        { type: 'items', text: `         ${SPEC_FLAVOR[specId] || ''}` },
        { type: 'info', text: '' },
        { type: 'info', text: `  ${desc}` },
        { type: 'info', text: '' },
        { type: 'success', text: 'Type "yes" to confirm or "restart" to start over.' }
      ];
    }

    /** Build the final player data object. */
    function buildPlayer() {
      const race = RACES.find(r => r.id === choices.race);
      const specId = choices.spec;
      const baseClass = getClassForSpec(specId);
      const cStats = CLASS_STATS[baseClass];
      const specAbilities = window.MudAbilities?.getSpecAbilities(baseClass, specId, 0) || [];
      const tier0 = specAbilities.find(a => a.tier === 0);
      const startAbility = tier0 ? tier0.id : null;

      const baseHp = 100;
      const baseAtk = 5;
      const baseDef = 3;

      return {
        name: choices.name,
        gender: choices.gender,
        hairColor: choices.hairColor,
        eyeColor: choices.eyeColor,
        bodyType: choices.bodyType,
        description: buildDescription(choices, specId),
        race: race.id,
        raceName: race.name,
        raceMods: race.mods || {},
        baseClass: baseClass,
        specialization: specId,
        specName: window.MudAbilities?.getSpec(baseClass, specId)?.name || specId,
        hp: baseHp + cStats.hp,
        maxHp: baseHp + cStats.hp,
        attackPower: baseAtk + cStats.attack,
        defense: baseDef + cStats.defense,
        gold: 50,
        power: 0,
        questPoints: 0,
        focus: 50,
        maxFocus: 50,
        focusCostModifier: 0,
        deaths: 0,
        abilities: startAbility ? [startAbility] : [],
        abilityCooldowns: {},
        inventory: [],
        equipped: {},
        currentRoom: 101,
        visitedRooms: [],
        worldFlags: {},
        activeQuests: [],
        completedQuests: [],
        questCompletionCounts: {},
        killCounts: {}
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
          if (['begin','start','yes','y','go','ready','ok','okay','create','new'].includes(input)) {
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
          emit([
            { type: 'success', text: `You chose: ${race.name}` },
            { type: 'info', text: '' },
            { type: 'info', text: 'A shape begins to form in the light. Your shape.' },
            { type: 'info', text: '' },
            { type: 'success', text: 'What is your name?' }
          ]);
          step = 'name';
          return true;
        }

        case 'name': {
          if (!input || input.length < 2 || input.length > 20) {
            emit([{ type: 'error', text: 'Name must be 2-20 characters.' }]);
            return true;
          }
          if (!/^[a-zA-Z][a-zA-Z0-9_ -]*$/.test(text.trim())) {
            emit([{ type: 'error', text: 'Name must start with a letter. Letters, numbers, spaces, hyphens allowed.' }]);
            return true;
          }
          choices.name = text.trim();
          emit([
            { type: 'success', text: `Name: ${choices.name}` },
            { type: 'info', text: '' }
          ]);
          step = 'gender';
          emit(showGenderChoice());
          return true;
        }

        case 'gender': {
          const gMap = { '1': 'M', '2': 'F', '3': 'N', 'm': 'M', 'f': 'F', 'n': 'N', 'male': 'M', 'female': 'F', 'neutral': 'N', 'nonbinary': 'N', 'non-binary': 'N' };
          const g = gMap[input];
          if (!g) {
            emit([{ type: 'error', text: 'Choose 1 (Male), 2 (Female), or 3 (Neutral).' }]);
            return true;
          }
          choices.gender = g;
          step = 'hair';
          emit(showHairChoice());
          return true;
        }

        case 'hair': {
          const hairIdx = parseInt(input, 10);
          const hair = (hairIdx >= 1 && hairIdx <= HAIR_COLORS.length) ? HAIR_COLORS[hairIdx - 1] : HAIR_COLORS.find(h => h.toLowerCase() === input);
          if (!hair) {
            emit([{ type: 'error', text: `Choose 1-${HAIR_COLORS.length} or type a color name.` }]);
            return true;
          }
          choices.hairColor = hair;
          step = 'eyes';
          emit(showEyeChoice());
          return true;
        }

        case 'eyes': {
          const eyeIdx = parseInt(input, 10);
          const eye = (eyeIdx >= 1 && eyeIdx <= EYE_COLORS.length) ? EYE_COLORS[eyeIdx - 1] : EYE_COLORS.find(e => e.toLowerCase() === input);
          if (!eye) {
            emit([{ type: 'error', text: `Choose 1-${EYE_COLORS.length} or type a color name.` }]);
            return true;
          }
          choices.eyeColor = eye;
          step = 'body';
          emit(showBodyChoice());
          return true;
        }

        case 'body': {
          const bodyIdx = parseInt(input, 10);
          const body = (bodyIdx >= 1 && bodyIdx <= BODY_TYPES.length) ? BODY_TYPES[bodyIdx - 1] : BODY_TYPES.find(b => b.toLowerCase() === input);
          if (!body) {
            emit([{ type: 'error', text: `Choose 1-${BODY_TYPES.length} or type a body type.` }]);
            return true;
          }
          choices.bodyType = body;
          emit([
            { type: 'success', text: `Appearance set.` },
            { type: 'info', text: '' },
            { type: 'info', text: 'Before you stands a weathered woman at a crossroads.' },
            { type: 'info', text: 'She deals no cards, reads no palms. Only asks questions.' },
            { type: 'info', text: '"Answer honestly," she says. "There are no wrong answers."' },
            { type: 'info', text: '' }
          ]);
          bracket = createBracket();
          currentDilemma = getDilemma(bracket.matchups[0][0], bracket.matchups[0][1]);
          step = 'quiz';
          emit(showDilemma());
          return true;
        }

        case 'quiz': {
          // Accept A/B, 1/2, or the first word of the answer text
          let choice = null;
          if (input === 'a' || input === '1') {
            choice = 'a';
          } else if (input === 'b' || input === '2') {
            choice = 'b';
          } else {
            // Try matching the beginning of the answer text
            const aStart = currentDilemma.a.toLowerCase().split(/\s+/)[0];
            const bStart = currentDilemma.b.toLowerCase().split(/\s+/)[0];
            if (input.startsWith(aStart)) choice = 'a';
            else if (input.startsWith(bStart)) choice = 'b';
          }

          if (!choice) {
            emit([{ type: 'error', text: 'Type A or B to choose your answer.' }]);
            return true;
          }

          const nextDilemma = advanceBracket(bracket, choice);

          if (bracket.round === 0) {
            // Tournament complete
            topSpecs = calculateTopSpecs();
            step = 'spec';
            emit([
              { type: 'info', text: '' },
              { type: 'info', text: 'The woman nods slowly, gathering her things.' },
              { type: 'info', text: '"I see your path clearly now," she whispers.' },
              { type: 'info', text: '' }
            ]);
            emit(showSpecChoices());
          } else {
            currentDilemma = nextDilemma;
            emit(showDilemma());
          }
          return true;
        }

        case 'spec': {
          const idx = parseInt(input, 10);
          let specId = null;
          if (idx >= 1 && idx <= topSpecs.length) {
            specId = topSpecs[idx - 1];
          } else {
            // Try matching by spec name or id
            specId = topSpecs.find(s => {
              const spec = window.MudAbilities?.getSpec(getClassForSpec(s), s);
              const name = spec?.name?.toLowerCase() || '';
              return s === input || name === input || name.startsWith(input);
            });
          }
          if (!specId) {
            emit([{ type: 'error', text: `Invalid choice. Pick 1-${topSpecs.length} or type the path name.` }]);
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
          if (['yes','y','confirm','ok','okay','accept','sure','yep','yeah'].includes(input)) {
            const playerData = buildPlayer();
            onComplete(playerData);
            return false;
          } else if (['restart','no','n','nope','redo','back','reset','start over'].includes(input)) {
            choices = { race: null, spec: null, name: null, gender: null, hairColor: null, eyeColor: null, bodyType: null };
            bracket = null;
            currentDilemma = null;
            topSpecs = [];
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
  window.MudChargen = { create, RACES, CLASS_STATS, SPEC_FLAVOR, TRAITS };
})();
