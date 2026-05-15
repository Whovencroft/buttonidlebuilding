/**
 * mud_trainers.js -- Trainer NPC System
 *
 * Trainer NPCs allow players to spend Quest Points (QP) to permanently
 * increase base attributes. Each trainer has a stat cap based on their
 * zone tier. "Hidden" trainers (found in secret/locked rooms) can train
 * past the normal cap.
 *
 * Usage:
 *   - 'train' near a trainer NPC to see available training options
 *   - 'train <stat>' to spend QP and increase that stat
 *
 * Stat caps scale by zone:
 *   Zone 10-13: cap +5 per stat
 *   Zone 14-16: cap +10 per stat
 *   Zone 17-19: cap +15 per stat
 *   Zone 80+:   cap +20 per stat
 *   Hidden:     cap +30 per stat (overrides zone cap)
 *
 * Exposes window.MudTrainers for integration with mud_engine.js.
 */
(() => {
  'use strict';

  // ─── Trainer Registry ───────────────────────────────────────────────────
  // Maps mob vnum to trainer config. Hidden trainers have `hidden: true`.
  const TRAINERS = {
    // Zone 1 (Training Tower) - Instructor Kael
    '120': { stats: ['vigor', 'precision', 'grit', 'instinct'], hidden: false },
    // Zone 11 (Crown City) - Old Hermit (hidden in back alley)
    '1131': { stats: ['vigor', 'grit'], hidden: true },
    // Zone 16 (Temporal Nexus) - Gladiator Trainer
    '1632': { stats: ['vigor', 'precision', 'grit', 'instinct'], hidden: false },
    // Zone 18 (Monastery) - Training Master
    '1811': { stats: ['vigor', 'precision', 'grit', 'instinct'], hidden: false },
    // Zone 18 (Monastery) - Meditation Guide
    '1812': { stats: ['instinct', 'precision'], hidden: false },
    // Zone 80 (Gravity Chamber) - Technician
    '8020': { stats: ['vigor', 'grit'], hidden: false },
    // Zone 19 (Spirit Realm) - Spirit Healer (hidden)
    '1919': { stats: ['vigor', 'precision', 'grit', 'instinct'], hidden: true }
  };

  // ─── Zone Cap Tiers ─────────────────────────────────────────────────────
  // Returns the max stat bonus a trainer in this zone can grant per stat.
  function getZoneCap(mobVnum, isHidden) {
    if (isHidden) return 30;
    const zone = Math.floor(parseInt(mobVnum, 10) / 100);
    if (zone <= 1) return 3;
    if (zone <= 13) return 5;
    if (zone <= 16) return 10;
    if (zone <= 19) return 15;
    return 20; // Zone 80+
  }

  // ─── QP Cost per Training Point ─────────────────────────────────────────
  // Cost increases with how many points you've already trained in that stat.
  function getTrainingCost(currentBonus) {
    return 2 + Math.floor(currentBonus * 1.5);
  }

  // ─── Core Functions ─────────────────────────────────────────────────────

  /**
   * Check if a mob is a trainer.
   * @param {string} mobVnum - The mob's vnum
   * @returns {boolean}
   */
  function isTrainer(mobVnum) {
    return !!TRAINERS[String(mobVnum)];
  }

  /**
   * Get training options for a specific trainer mob.
   * @param {string} mobVnum - The trainer mob's vnum
   * @param {object} player - Player state (needs player.trainerBonuses)
   * @returns {{ output: Array }} Display output for the player
   */
  function getTrainingMenu(mobVnum, player) {
    const config = TRAINERS[String(mobVnum)];
    if (!config) return { output: [{ type: 'error', text: 'This NPC cannot train you.' }] };

    const cap = getZoneCap(mobVnum, config.hidden);
    const bonuses = player.trainerBonuses || {};
    const output = [];

    output.push({ type: 'info', text: '--- Available Training ---' });
    output.push({ type: 'info', text: `  Stat cap at this trainer: +${cap}` });
    output.push({ type: 'info', text: '' });

    for (const stat of config.stats) {
      const current = bonuses[stat] || 0;
      const cost = getTrainingCost(current);
      const atCap = current >= cap;
      const label = stat.charAt(0).toUpperCase() + stat.slice(1);
      if (atCap) {
        output.push({ type: 'info', text: `  ${label}: +${current} (MAXED at this trainer)` });
      } else {
        output.push({ type: 'info', text: `  ${label}: +${current} / ${cap}  --  Cost: ${cost} QP` });
      }
    }

    output.push({ type: 'info', text: '' });
    output.push({ type: 'info', text: "  Type 'train <stat>' to train. Example: train vigor" });
    output.push({ type: 'info', text: `  Your QP: ${player.questPoints || 0}` });

    return { output };
  }

  /**
   * Attempt to train a stat at a trainer NPC.
   * @param {string} mobVnum - The trainer mob's vnum
   * @param {string} statTarget - Which stat to train
   * @param {object} player - Player state (mutated on success)
   * @returns {{ success: boolean, output: Array }}
   */
  function trainStat(mobVnum, statTarget, player) {
    const config = TRAINERS[String(mobVnum)];
    if (!config) return { success: false, output: [{ type: 'error', text: 'This NPC cannot train you.' }] };

    const stat = statTarget.toLowerCase();
    if (!config.stats.includes(stat)) {
      return {
        success: false,
        output: [{ type: 'error', text: `This trainer doesn't teach ${stat}. Available: ${config.stats.join(', ')}` }]
      };
    }

    const cap = getZoneCap(mobVnum, config.hidden);
    if (!player.trainerBonuses) player.trainerBonuses = {};
    const current = player.trainerBonuses[stat] || 0;

    if (current >= cap) {
      return {
        success: false,
        output: [{ type: 'error', text: `You've reached this trainer's limit for ${stat} (+${cap}). Find a more advanced trainer.` }]
      };
    }

    const cost = getTrainingCost(current);
    const qp = player.questPoints || 0;
    if (qp < cost) {
      return {
        success: false,
        output: [{ type: 'error', text: `Not enough QP. Need ${cost}, have ${qp}.` }]
      };
    }

    // Apply training
    player.questPoints -= cost;
    player.trainerBonuses[stat] = current + 1;

    // Apply the bonus to the actual core stat
    if (player.coreStats && player.coreStats[stat] !== undefined) {
      player.coreStats[stat] += 1;
    }

    const label = stat.charAt(0).toUpperCase() + stat.slice(1);
    return {
      success: true,
      output: [
        { type: 'success', text: `Your ${label} has been trained! (+1, now +${current + 1} from trainers)` },
        { type: 'info', text: `  QP remaining: ${player.questPoints}` }
      ]
    };
  }

  /**
   * Find a trainer mob in the current room.
   * @param {Array} mobsInRoom - Array of mob vnums present in the room
   * @returns {string|null} The trainer mob vnum, or null
   */
  function findTrainerInRoom(mobsInRoom) {
    for (const vnum of mobsInRoom) {
      if (TRAINERS[String(vnum)]) return String(vnum);
    }
    return null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudTrainers = {
    TRAINERS,
    isTrainer,
    getTrainingMenu,
    trainStat,
    findTrainerInRoom,
    getZoneCap,
    getTrainingCost
  };
})();
