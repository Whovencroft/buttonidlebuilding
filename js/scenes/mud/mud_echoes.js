/**
 * mud_echoes.js — Skill Echoes (Ghost-Based Learning)
 *
 * When a player dies, they leave behind a "ghost" (echo) at the death
 * location. Other players (or the same player on return) can interact
 * with echoes to learn from them:
 *   - View the echo's last used abilities
 *   - Gain a small proficiency XP boost for those abilities
 *   - Rare chance to learn a new ability hint (reduces QP cost by 1)
 *
 * Echoes persist for a limited time and fade after being read once.
 * In single-player mode, echoes from your own deaths still provide
 * a "reflection" bonus — learning from your mistakes.
 *
 * Exposes window.MudEchoes for integration with mud_engine.js.
 */
(() => {
  'use strict';

  const MAX_ECHOES_PER_ROOM = 3;
  const ECHO_DURATION_MINUTES = 30;
  const PROFICIENCY_XP_BONUS = 3;
  const HINT_CHANCE = 0.15; // 15% chance to get a QP discount hint

  /**
   * Create an echo at the player's death location.
   * @param {object} player - Player state at time of death
   * @param {number} roomVnum - Room where death occurred
   * @param {string} killedBy - Name of the mob that killed the player
   * @returns {object} Echo object to store
   */
  function createEcho(player, roomVnum, killedBy) {
    // Record last 3 abilities used (from cooldown tracking)
    const recentAbilities = Object.keys(player.abilityCooldowns || {})
      .filter(id => player.abilityCooldowns[id] > 0)
      .slice(0, 3);

    return {
      id: `echo_${Date.now()}_${roomVnum}`,
      roomVnum,
      playerName: player.name || 'Unknown',
      playerClass: player.baseClass || 'fighter',
      playerSpec: player.spec || null,
      power: player.power || 0,
      killedBy,
      recentAbilities,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ECHO_DURATION_MINUTES * 60 * 1000),
      read: false
    };
  }

  /**
   * Get all active (non-expired) echoes in a room.
   * @param {Array} allEchoes - All stored echoes
   * @param {number} roomVnum - Room to check
   * @returns {Array} Active echoes in this room
   */
  function getEchoesInRoom(allEchoes, roomVnum) {
    const now = Date.now();
    return allEchoes.filter(e =>
      e.roomVnum === roomVnum && !e.read && now < e.expiresAt
    );
  }

  /**
   * Interact with an echo (read/absorb it).
   * @param {object} echo - The echo to interact with
   * @param {object} player - Player state (mutated for proficiency bonus)
   * @returns {{ output: Array, hint: string|null }}
   */
  function readEcho(echo, player) {
    echo.read = true;
    const output = [];

    output.push({ type: 'info', text: `─── Echo of ${echo.playerName} ───` });
    output.push({ type: 'info', text: `  A ${echo.playerClass} who fell to ${echo.killedBy}.` });

    if (echo.recentAbilities.length > 0) {
      output.push({ type: 'info', text: '  Last techniques used:' });
      for (const abilityId of echo.recentAbilities) {
        const abilityDef = window.MudAbilities?.getAbilityById(abilityId);
        const name = abilityDef?.name || abilityId;
        output.push({ type: 'items', text: `    - ${name}` });

        // Grant proficiency XP bonus
        if (player.proficiency) {
          const result = window.MudProficiency?.addProficiencyXP(
            player.proficiency, abilityId, PROFICIENCY_XP_BONUS
          );
          if (result?.message) {
            output.push({ type: 'success', text: `    ${result.message}` });
          }
        }
      }
      output.push({ type: 'success', text: `  You absorb insight from the echo. (+${PROFICIENCY_XP_BONUS} proficiency XP)` });
    } else {
      output.push({ type: 'info', text: '  The echo fades before you can learn much.' });
    }

    // Chance for ability hint (QP discount)
    let hint = null;
    if (Math.random() < HINT_CHANCE && echo.recentAbilities.length > 0) {
      const hintAbility = echo.recentAbilities[Math.floor(Math.random() * echo.recentAbilities.length)];
      const abilityDef = window.MudAbilities?.getAbilityById(hintAbility);
      if (abilityDef) {
        hint = hintAbility;
        output.push({ type: 'quest', text: `  Revelation! You gain deeper understanding of ${abilityDef.name}. (-1 QP to learn it)` });
      }
    }

    output.push({ type: 'info', text: '  The echo dissipates.' });

    return { output, hint };
  }

  /**
   * Prune expired echoes from storage.
   * @param {Array} allEchoes - All stored echoes
   * @returns {Array} Remaining valid echoes
   */
  function pruneExpired(allEchoes) {
    const now = Date.now();
    return allEchoes.filter(e => now < e.expiresAt && !e.read);
  }

  /**
   * Get room description addition when echoes are present.
   * @param {Array} allEchoes - All stored echoes
   * @param {number} roomVnum - Current room
   * @returns {string|null} Description text, or null if no echoes
   */
  function getRoomEchoText(allEchoes, roomVnum) {
    const echoes = getEchoesInRoom(allEchoes, roomVnum);
    if (echoes.length === 0) return null;
    if (echoes.length === 1) {
      return `A faint shimmer lingers here - an echo of ${echoes[0].playerName}.`;
    }
    return `${echoes.length} faint echoes shimmer in the air.`;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudEchoes = {
    MAX_ECHOES_PER_ROOM,
    createEcho,
    getEchoesInRoom,
    readEcho,
    pruneExpired,
    getRoomEchoText
  };
})();
