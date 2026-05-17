/**
 * mud_weapon_teachers.js  -  Advanced Weapon Style Teachers
 *
 * Adds an advanced proficiency layer on top of the base weapon proficiency
 * system. Players who reach 100% base proficiency in a weapon category can
 * seek out a teacher NPC to learn an advanced combat style.
 *
 * Requirements to learn:
 *   - 100% base proficiency in the weapon category
 *   - Must be in the same room as the teacher NPC
 *   - Must not already have an active advanced style at < 100%
 *     (finish current style before learning another)
 *
 * Advanced style bonuses (stacks on top of base):
 *   - +1 attack per 10% advanced proficiency (same as base)
 *   - +1% crit chance per 10% advanced proficiency
 *   - At 100%: unique style-specific passive effect
 *
 * Gain rate: Same diminishing-returns formula as base proficiency,
 * but only advances while the style's weapon category is used in combat.
 *
 * Data stored on player.advancedWeaponStyles as:
 *   { [styleId]: { pct: number, learned: boolean } }
 *
 * Exposes window.MudWeaponTeachers for integration with mud_engine.js.
 */
(() => {
  'use strict';

  // ─── Advanced Style Definitions ──────────────────────────────────────────
  // Each style belongs to one weapon category and is taught by one NPC.
  // Multiple styles can exist per category (different teachers).

  const STYLES = {
    // ── Sword Styles ──
    kenjutsu: {
      name: 'Kenjutsu',
      category: 'sword',
      teacherVnum: '1813',  // Monastery - Blade Monk
      zone: 'historical',
      description: 'The way of the sword. Precise, economical strikes that waste nothing.',
      mastery_bonus: 'Attacks ignore 20% of enemy defense'
    },
    riposte: {
      name: 'Riposte Fencing',
      category: 'sword',
      teacherVnum: '3015',  // Noir zone - Fencing Master
      zone: 'noir',
      description: 'A gentleman\'s art. Turn every parry into a counter-thrust.',
      mastery_bonus: '15% chance to counter-attack when hit'
    },
    beam_blade: {
      name: 'Beam Blade Technique',
      category: 'sword',
      teacherVnum: '2018',  // Cyberpunk zone - Holo-Sensei
      zone: 'cyberpunk',
      description: 'Channel energy through the blade. Each swing leaves a burning arc.',
      mastery_bonus: 'Attacks deal 10% bonus damage as energy (ignores defense)'
    },

    // ── Unarmed Styles ──
    iron_fist: {
      name: 'Iron Fist',
      category: 'unarmed',
      teacherVnum: '1814',  // Monastery - Grandmaster
      zone: 'fantasy',
      description: 'Harden your body into a weapon. Every surface becomes a striking point.',
      mastery_bonus: 'Unarmed attacks gain +5 flat damage'
    },
    void_palm: {
      name: 'Void Palm',
      category: 'unarmed',
      teacherVnum: '8021',  // Gravity Chamber - Void Adept
      zone: 'sci-fi',
      description: 'Strike with the force of collapsed space. Hits resonate beyond the physical.',
      mastery_bonus: 'Each hit drains 2% of enemy max HP'
    },

    // ── Axe Styles ──
    berserker_cleave: {
      name: 'Berserker Cleave',
      category: 'axe',
      teacherVnum: '1133',  // Crown City Dungeon - Scarred Veteran Grimjaw
      zone: 'fantasy',
      description: 'Abandon defense. Every swing carries the weight of fury.',
      mastery_bonus: 'Attacks deal +30% damage but reduce defense by 10%'
    },

    // ── Blunt Styles ──
    earthbreaker: {
      name: 'Earthbreaker',
      category: 'blunt',
      teacherVnum: '4015',  // Warzone - Siege Engineer
      zone: 'warzone',
      description: 'Swing with the force of a battering ram. Armor means nothing.',
      mastery_bonus: 'Attacks ignore 30% of enemy defense'
    },

    // ── Dagger Styles ──
    shadow_step: {
      name: 'Shadow Step',
      category: 'dagger',
      teacherVnum: '1721',  // Noir Zone - Whisper (Jazz Club)
      zone: 'noir',
      description: 'Move between heartbeats. Strike from angles that don\'t exist.',
      mastery_bonus: '+10% dodge chance while wielding daggers'
    },

    // ── Polearm Styles ──
    dragon_sweep: {
      name: 'Dragon Sweep',
      category: 'polearm',
      teacherVnum: '6015',  // Historical zone - Terracotta General
      zone: 'historical',
      description: 'The reach of the polearm becomes absolute. Control the battlefield.',
      mastery_bonus: 'First attack each combat round cannot be dodged'
    },

    // ── Bow Styles ──
    zen_archery: {
      name: 'Zen Archery',
      category: 'bow',
      teacherVnum: '1815',  // Monastery - Archery Master
      zone: 'fantasy',
      description: 'Release the arrow before you think. Let instinct guide the shaft.',
      mastery_bonus: '+15% crit chance with bows'
    },

    // ── Firearm Styles ──
    dead_eye: {
      name: 'Dead Eye',
      category: 'firearm',
      teacherVnum: '4016',  // Warzone - Sniper Instructor
      zone: 'warzone',
      description: 'One shot, one kill. Patience is the deadliest weapon.',
      mastery_bonus: 'First attack each combat deals double damage'
    },

    // ── Staff Styles ──
    arcane_conduit: {
      name: 'Arcane Conduit',
      category: 'staff',
      teacherVnum: '2019',  // Wizard Tower - Archmage
      zone: 'fantasy',
      description: 'The staff becomes an extension of will. Focus flows like water.',
      mastery_bonus: 'Staff attacks restore 3% max focus on hit'
    },

    // ── Exotic Styles ──
    chaos_weave: {
      name: 'Chaos Weave',
      category: 'exotic',
      teacherVnum: '6016',  // Temporal zone - Paradox Smith
      zone: 'sci-fi',
      description: 'Unpredictable. Even you don\'t know what comes next.',
      mastery_bonus: 'Each hit has a 20% chance to strike twice'
    }
  };

  /** Base XP gain per hit (same diminishing curve as base proficiency). */
  const BASE_GAIN = 0.8;

  /** Milestones that trigger notifications. */
  const MILESTONES = [10, 25, 50, 75, 100];

  // ─── Core Functions ─────────────────────────────────────────────────────

  /**
   * Ensure the player has the advancedWeaponStyles data structure.
   * @param {object} player - Player state object
   */
  function ensureData(player) {
    if (!player.advancedWeaponStyles) {
      player.advancedWeaponStyles = {};
    }
  }

  /**
   * Check if a mob vnum is a weapon teacher.
   * @param {string} mobVnum - The mob's vnum
   * @returns {boolean}
   */
  function isTeacher(mobVnum) {
    return Object.values(STYLES).some(s => s.teacherVnum === String(mobVnum));
  }

  /**
   * Get all styles taught by a specific teacher NPC.
   * @param {string} mobVnum - The teacher's mob vnum
   * @returns {object[]} Array of style definitions (with id added)
   */
  function getStylesByTeacher(mobVnum) {
    const results = [];
    for (const [id, style] of Object.entries(STYLES)) {
      if (style.teacherVnum === String(mobVnum)) {
        results.push({ ...style, id });
      }
    }
    return results;
  }

  /**
   * Get all styles available for a weapon category.
   * @param {string} category - Weapon category name
   * @returns {object[]} Array of style definitions (with id added)
   */
  function getStylesForCategory(category) {
    const results = [];
    for (const [id, style] of Object.entries(STYLES)) {
      if (style.category === category) {
        results.push({ ...style, id });
      }
    }
    return results;
  }

  /**
   * Attempt to learn an advanced style from a teacher NPC.
   * Validates all requirements before granting the style.
   *
   * @param {object} player - Player state (mutated on success)
   * @param {string} styleId - The style to learn
   * @returns {{ success: boolean, output: Array }}
   */
  function learnStyle(player, styleId) {
    ensureData(player);
    const style = STYLES[styleId];
    if (!style) {
      return { success: false, output: [{ type: 'error', text: 'Unknown style.' }] };
    }

    // Check: already learned?
    if (player.advancedWeaponStyles[styleId]?.learned) {
      return { success: false, output: [{ type: 'info', text: `You have already learned ${style.name}.` }] };
    }

    // Check: base proficiency at 100%?
    const basePct = (player.weaponProficiency || {})[style.category] || 0;
    if (basePct < 100) {
      return {
        success: false,
        output: [{ type: 'error', text: `You must reach 100% base ${style.category} proficiency before learning ${style.name}. (Current: ${Math.floor(basePct)}%)` }]
      };
    }

    // Check: any other advanced style in progress (< 100%)?
    for (const [existingId, data] of Object.entries(player.advancedWeaponStyles)) {
      if (data.learned && data.pct < 100 && existingId !== styleId) {
        const existingStyle = STYLES[existingId];
        return {
          success: false,
          output: [{ type: 'error', text: `You must complete your training in ${existingStyle?.name || existingId} (${Math.floor(data.pct)}%) before learning a new style.` }]
        };
      }
    }

    // Learn the style
    player.advancedWeaponStyles[styleId] = { pct: 0, learned: true };

    return {
      success: true,
      output: [
        { type: 'success', text: `═══ ADVANCED STYLE LEARNED ═══` },
        { type: 'success', text: `You have begun training in ${style.name}!` },
        { type: 'info', text: `  "${style.description}"` },
        { type: 'info', text: `  Category: ${style.category}` },
        { type: 'info', text: `  Bonuses: +1 attack and +1% crit per 10% mastery` },
        { type: 'info', text: `  At 100%: ${style.mastery_bonus}` },
        { type: 'info', text: `  Train by using ${style.category} weapons in combat.` }
      ]
    };
  }

  /**
   * Called when the player lands a hit with a weapon category.
   * Advances any learned advanced style matching that category.
   *
   * @param {object} player - Player state (mutated)
   * @param {string} category - Weapon category used
   * @returns {{ message: string|null, milestone: number|null }}
   */
  function onWeaponUsed(player, category) {
    ensureData(player);
    if (!category) return { message: null };

    // Find an active (learned, < 100%) style for this category
    let activeStyle = null;
    let activeId = null;
    for (const [id, data] of Object.entries(player.advancedWeaponStyles)) {
      if (!data.learned || data.pct >= 100) continue;
      const style = STYLES[id];
      if (style && style.category === category) {
        activeStyle = style;
        activeId = id;
        break;
      }
    }

    if (!activeId) return { message: null };

    // Diminishing returns gain (same formula as base)
    const prev = player.advancedWeaponStyles[activeId].pct;
    const remaining = 100 - prev;
    const gain = Math.max(0.03, BASE_GAIN * (remaining / 100));
    const next = Math.min(100, +(prev + gain).toFixed(2));
    player.advancedWeaponStyles[activeId].pct = next;

    // Check milestones
    let milestone = null;
    for (const m of MILESTONES) {
      if (prev < m && next >= m) {
        milestone = m;
        break;
      }
    }

    let message = null;
    if (milestone === 100) {
      message = `[${activeStyle.name}] MASTERY COMPLETE! ${activeStyle.mastery_bonus}`;
    } else if (milestone) {
      const atkBonus = Math.floor(milestone / 10);
      const critBonus = Math.floor(milestone / 10);
      message = `[${activeStyle.name}] ${milestone}% (+${atkBonus} atk, +${critBonus}% crit)`;
    }

    return { message, milestone };
  }

  /**
   * Get the total attack bonus from all mastered/in-progress advanced styles
   * for a given weapon category.
   *
   * @param {object} player - Player state
   * @param {string} category - Weapon category
   * @returns {number} Bonus attack (0-10 per style)
   */
  function getAttackBonus(player, category) {
    ensureData(player);
    let bonus = 0;
    for (const [id, data] of Object.entries(player.advancedWeaponStyles)) {
      if (!data.learned) continue;
      const style = STYLES[id];
      if (style && style.category === category) {
        bonus += Math.floor(data.pct / 10);
      }
    }
    return bonus;
  }

  /**
   * Get the total crit bonus from all mastered/in-progress advanced styles
   * for a given weapon category.
   *
   * @param {object} player - Player state
   * @param {string} category - Weapon category
   * @returns {number} Bonus crit chance as decimal (e.g., 0.05 = 5%)
   */
  function getCritBonus(player, category) {
    ensureData(player);
    let bonus = 0;
    for (const [id, data] of Object.entries(player.advancedWeaponStyles)) {
      if (!data.learned) continue;
      const style = STYLES[id];
      if (style && style.category === category) {
        bonus += Math.floor(data.pct / 10) * 0.01;
      }
    }
    return bonus;
  }

  /**
   * Check if a player has fully mastered a specific style (100%).
   * Used to apply the unique mastery_bonus passive.
   *
   * @param {object} player - Player state
   * @param {string} styleId - The style ID to check
   * @returns {boolean}
   */
  function hasMastery(player, styleId) {
    ensureData(player);
    const data = player.advancedWeaponStyles[styleId];
    return data && data.learned && data.pct >= 100;
  }

  /**
   * Get the interaction output when a player talks to a teacher NPC.
   * Handles all gating logic and presents available styles.
   *
   * @param {string} mobVnum - Teacher mob vnum
   * @param {object} player - Player state
   * @param {string} mobName - Display name of the NPC
   * @returns {{ output: Array, canLearn: boolean, styles: object[] }}
   */
  function getTeacherMenu(mobVnum, player, mobName) {
    ensureData(player);
    const teacherStyles = getStylesByTeacher(mobVnum);
    if (teacherStyles.length === 0) {
      return { output: [{ type: 'info', text: `${mobName} has nothing to teach you.` }], canLearn: false, styles: [] };
    }

    const output = [];
    const learnableStyles = [];

    for (const style of teacherStyles) {
      const basePct = (player.weaponProficiency || {})[style.category] || 0;
      const alreadyLearned = player.advancedWeaponStyles[style.id]?.learned;

      if (alreadyLearned) {
        const pct = player.advancedWeaponStyles[style.id].pct;
        if (pct >= 100) {
          output.push({ type: 'info', text: `  ${style.name} - MASTERED ★` });
        } else {
          output.push({ type: 'info', text: `  ${style.name} - In progress (${Math.floor(pct)}%)` });
        }
      } else if (basePct < 100) {
        // Don't even mention the style if base isn't at 100%
        // Teacher won't bring it up
        continue;
      } else {
        // Eligible to learn
        learnableStyles.push(style);
        output.push({ type: 'info', text: `  ${style.name} (${style.category}) - "${style.description}"` });
        output.push({ type: 'info', text: `    Type 'learn ${style.id}' to begin training.` });
      }
    }

    if (output.length === 0) {
      // Teacher has nothing to say (player hasn't hit 100% in any relevant category)
      return {
        output: [{ type: 'dialogue', text: `${mobName} studies you briefly, then returns to their practice.` }],
        canLearn: false,
        styles: []
      };
    }

    // Add header
    output.unshift({ type: 'info', text: '--- Advanced Combat Styles ---' });
    output.unshift({ type: 'dialogue', text: `${mobName} says: "I see you've mastered the basics. Perhaps you're ready for something more."` });

    return { output, canLearn: learnableStyles.length > 0, styles: learnableStyles };
  }

  /**
   * Find a weapon teacher NPC in the current room's mob list.
   * @param {Array} mobsInRoom - Array of mob vnums present
   * @returns {string|null} Teacher mob vnum, or null
   */
  function findTeacherInRoom(mobsInRoom) {
    for (const vnum of mobsInRoom) {
      if (isTeacher(String(vnum))) return String(vnum);
    }
    return null;
  }

  /**
   * Format advanced style display for the proficiency command.
   * @param {object} player - Player state
   * @returns {object[]} Output messages
   */
  function formatDisplay(player) {
    ensureData(player);
    const entries = Object.entries(player.advancedWeaponStyles)
      .filter(([, data]) => data.learned)
      .sort((a, b) => b[1].pct - a[1].pct);

    if (entries.length === 0) return [];

    const output = [{ type: 'info', text: '' }, { type: 'info', text: '─── Advanced Styles ───' }];
    for (const [id, data] of entries) {
      const style = STYLES[id];
      if (!style) continue;
      const pct = Math.floor(data.pct);
      const atkBonus = Math.floor(data.pct / 10);
      const critBonus = Math.floor(data.pct / 10);
      const filled = Math.round(data.pct / 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const mastery = data.pct >= 100 ? ' ★' : '';
      output.push({
        type: 'info',
        text: `  ${style.name.padEnd(20)} [${bar}] ${pct}%  (+${atkBonus} atk, +${critBonus}% crit)${mastery}`
      });
      if (data.pct >= 100) {
        output.push({ type: 'success', text: `    Passive: ${style.mastery_bonus}` });
      }
    }
    return output;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudWeaponTeachers = {
    STYLES,
    isTeacher,
    getStylesByTeacher,
    getStylesForCategory,
    learnStyle,
    onWeaponUsed,
    getAttackBonus,
    getCritBonus,
    hasMastery,
    getTeacherMenu,
    findTeacherInRoom,
    formatDisplay
  };
})();
