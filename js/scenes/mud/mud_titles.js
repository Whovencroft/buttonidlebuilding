/**
 * mud_titles.js — Title Progression System
 *
 * Players earn cosmetic titles as they reach power milestones.
 * Titles are displayed in status and can be shown to other players
 * via notes/ghosts. Each base class has its own title chain.
 *
 * Exposes window.MudTitles for integration with mud_engine.js.
 */
(() => {
  'use strict';

  /**
   * Title chains by base class. Each entry: [powerThreshold, title].
   * Ordered ascending — player gets the highest title they qualify for.
   */
  const TITLE_CHAINS = {
    fighter: [
      [0,      'Recruit'],
      [25,     'Brawler'],
      [50,     'Warrior'],
      [150,    'Veteran'],
      [500,    'Champion'],
      [1500,   'Warlord'],
      [5000,   'Battlemaster'],
      [15000,  'Conqueror'],
      [50000,  'Legendary Warrior'],
      [100000, 'Godslayer']
    ],
    mage: [
      [0,      'Initiate'],
      [25,     'Apprentice'],
      [50,     'Adept'],
      [150,    'Channeler'],
      [500,    'Magus'],
      [1500,   'Archmage'],
      [5000,   'Sage'],
      [15000,  'Archon'],
      [50000,  'Legendary Caster'],
      [100000, 'Reality Weaver']
    ],
    rogue: [
      [0,      'Pickpocket'],
      [25,     'Cutpurse'],
      [50,     'Prowler'],
      [150,    'Shadow'],
      [500,    'Phantom'],
      [1500,   'Ghost'],
      [5000,   'Specter'],
      [15000,  'Wraith'],
      [50000,  'Legendary Shadow'],
      [100000, 'Void Walker']
    ],
    cleric: [
      [0,      'Acolyte'],
      [25,     'Devotee'],
      [50,     'Healer'],
      [150,    'Shepherd'],
      [500,    'Templar'],
      [1500,   'High Priest'],
      [5000,   'Saint'],
      [15000,  'Ascendant'],
      [50000,  'Legendary Healer'],
      [100000, 'Divine Avatar']
    ]
  };

  /** Universal titles (override class titles at extreme power). */
  const UNIVERSAL_TITLES = [
    [250000, 'Transcendent'],
    [500000, 'Mythic'],
    [1000000, 'Eternal']
  ];

  /**
   * Get the player's current title based on class and power.
   * @param {string} baseClass - Player's base class (fighter/mage/rogue/cleric)
   * @param {number} power - Player's current power stat
   * @returns {string} The title
   */
  function getTitle(baseClass, power) {
    // Check universal titles first (highest power)
    for (let i = UNIVERSAL_TITLES.length - 1; i >= 0; i--) {
      if (power >= UNIVERSAL_TITLES[i][0]) return UNIVERSAL_TITLES[i][1];
    }

    // Class-specific titles
    const chain = TITLE_CHAINS[baseClass] || TITLE_CHAINS.fighter;
    let title = chain[0][1];
    for (const [threshold, t] of chain) {
      if (power >= threshold) title = t;
      else break;
    }
    return title;
  }

  /**
   * Get the next title and its power requirement.
   * @param {string} baseClass - Player's base class
   * @param {number} power - Player's current power
   * @returns {{ title: string, powerNeeded: number }|null} Next title info, or null if at max
   */
  function getNextTitle(baseClass, power) {
    const chain = TITLE_CHAINS[baseClass] || TITLE_CHAINS.fighter;
    for (const [threshold, title] of chain) {
      if (power < threshold) return { title, powerNeeded: threshold };
    }
    // Check universal
    for (const [threshold, title] of UNIVERSAL_TITLES) {
      if (power < threshold) return { title, powerNeeded: threshold };
    }
    return null;
  }

  /**
   * Check if the player just earned a new title (compare before/after power).
   * @param {string} baseClass - Player's base class
   * @param {number} oldPower - Power before gain
   * @param {number} newPower - Power after gain
   * @returns {string|null} New title earned, or null
   */
  function checkTitleUp(baseClass, oldPower, newPower) {
    const oldTitle = getTitle(baseClass, oldPower);
    const newTitle = getTitle(baseClass, newPower);
    if (newTitle !== oldTitle) return newTitle;
    return null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudTitles = {
    TITLE_CHAINS,
    getTitle,
    getNextTitle,
    checkTitleUp
  };
})();
