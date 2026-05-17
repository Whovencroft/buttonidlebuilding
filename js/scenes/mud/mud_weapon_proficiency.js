/**
 * mud_weapon_proficiency.js  -  Weapon Proficiency System
 *
 * Tracks per-category weapon proficiency as a percentage (0-100%).
 * Categories are hidden until the player first uses a weapon of that type.
 *
 * Bonuses:
 *   +1 attack per 10% proficiency (max +10 at 100%)
 *   At 100%, attacks with that weapon type cannot miss
 *
 * Proficiency is stored on player.weaponProficiency as:
 *   { [category]: number }   -  where number is 0-100 (percentage)
 *
 * Gain rate scales inversely with current proficiency:
 *   Low proficiency  → faster gains
 *   High proficiency → slower gains (diminishing returns)
 */
(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** All valid weapon categories (matches item.weapon_category values). */
  const CATEGORIES = [
    'sword', 'dagger', 'axe', 'blunt', 'polearm',
    'bow', 'firearm', 'staff', 'exotic', 'unarmed'
  ];

  /** Display names for each category. */
  const CATEGORY_NAMES = {
    sword: 'Swords',
    dagger: 'Daggers',
    axe: 'Axes',
    blunt: 'Blunt Weapons',
    polearm: 'Polearms',
    bow: 'Bows',
    firearm: 'Firearms',
    staff: 'Staves',
    exotic: 'Exotic Weapons',
    unarmed: 'Unarmed'
  };

  /**
   * Base XP gain per weapon use. Actual gain is scaled by diminishing returns.
   * At 0% prof → gain ~1.0% per use
   * At 50% prof → gain ~0.5% per use
   * At 90% prof → gain ~0.1% per use
   */
  const BASE_GAIN = 1.0;

  /** Milestone thresholds that trigger a notification message. */
  const MILESTONES = [10, 25, 50, 75, 90, 100];

  // ─── Core Functions ─────────────────────────────────────────────────────────

  /**
   * Ensure the player has a weaponProficiency object.
   * @param {object} player - The player state object
   */
  function ensureData(player) {
    if (!player.weaponProficiency) {
      player.weaponProficiency = {};
    }
  }

  /**
   * Called each time the player lands an attack with a weapon.
   * Gains proficiency in that weapon's category.
   *
   * @param {object} player   - The player state object
   * @param {string} category - The weapon_category of the weapon used
   * @returns {{ message: string|null, unlocked: boolean, milestone: number|null }}
   */
  function onWeaponUsed(player, category) {
    if (!category || !CATEGORIES.includes(category)) return { message: null };
    ensureData(player);

    const prev = player.weaponProficiency[category] || 0;
    const isNew = prev === 0 && !(category in player.weaponProficiency);

    // Diminishing returns: gain decreases as proficiency rises
    const remaining = 100 - prev;
    const gain = Math.max(0.05, BASE_GAIN * (remaining / 100));
    const next = Math.min(100, +(prev + gain).toFixed(2));

    player.weaponProficiency[category] = next;

    // Check for milestone
    let milestone = null;
    for (const m of MILESTONES) {
      if (prev < m && next >= m) {
        milestone = m;
        break;
      }
    }

    // Build message
    let message = null;
    const catName = CATEGORY_NAMES[category] || category;

    if (isNew && prev === 0) {
      // First time using this weapon type  -  unlock notification
      message = `[Proficiency] You've begun training with ${catName}! (${Math.floor(next)}%)`;
    } else if (milestone === 100) {
      message = `[Proficiency] MASTERY! You've reached 100% proficiency with ${catName}! You can no longer miss with this weapon type. (+10 attack bonus)`;
    } else if (milestone) {
      const bonus = Math.floor(milestone / 10);
      message = `[Proficiency] Your ${catName} proficiency has reached ${milestone}%! (+${bonus} attack bonus)`;
    }

    return { message, unlocked: isNew, milestone };
  }

  /**
   * Get the attack bonus for a weapon category based on proficiency.
   * +1 per 10% (max +10 at 100%).
   *
   * @param {object} player   - The player state object
   * @param {string} category - The weapon category
   * @returns {number} Attack bonus (0-10)
   */
  function getAttackBonus(player, category) {
    ensureData(player);
    const prof = player.weaponProficiency[category] || 0;
    return Math.floor(prof / 10);
  }

  /**
   * Check if the player has mastered a weapon category (100% = can't miss).
   *
   * @param {object} player   - The player state object
   * @param {string} category - The weapon category
   * @returns {boolean} True if proficiency is 100%
   */
  function cannotMiss(player, category) {
    ensureData(player);
    return (player.weaponProficiency[category] || 0) >= 100;
  }

  /**
   * Get the current proficiency percentage for a category.
   *
   * @param {object} player   - The player state object
   * @param {string} category - The weapon category
   * @returns {number} Proficiency 0-100
   */
  function getProficiency(player, category) {
    ensureData(player);
    return player.weaponProficiency[category] || 0;
  }

  /**
   * Format the proficiency display for the player.
   * Only shows categories the player has unlocked (> 0%).
   *
   * @param {object} player - The player state object
   * @returns {object[]} Array of output message objects for display
   */
  function formatDisplay(player) {
    ensureData(player);
    const entries = Object.entries(player.weaponProficiency)
      .filter(([, val]) => val > 0)
      .sort((a, b) => b[1] - a[1]); // highest first

    if (entries.length === 0) {
      return [{ type: 'info', text: 'You have no weapon proficiencies yet. Use a weapon in combat to begin training.' }];
    }

    const output = [{ type: 'info', text: '═══ Weapon Proficiencies ═══' }];
    for (const [cat, val] of entries) {
      const name = CATEGORY_NAMES[cat] || cat;
      const pct = Math.floor(val);
      const bonus = Math.floor(val / 10);
      const bar = buildBar(val);
      const mastery = val >= 100 ? ' ★ MASTERY' : '';
      output.push({
        type: 'info',
        text: `  ${name.padEnd(16)} ${bar} ${pct}%  (+${bonus} atk)${mastery}`
      });
    }
    return output;
  }

  /**
   * Build a simple progress bar string.
   * @param {number} pct - Percentage 0-100
   * @returns {string} e.g. "[████████░░]"
   */
  function buildBar(pct) {
    const filled = Math.round(pct / 10);
    const empty = 10 - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  window.MudWeaponProficiency = {
    onWeaponUsed,
    getAttackBonus,
    cannotMiss,
    getProficiency,
    formatDisplay,
    CATEGORIES,
    CATEGORY_NAMES
  };
})();
