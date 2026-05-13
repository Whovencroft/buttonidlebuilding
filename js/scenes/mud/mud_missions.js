/**
 * mud_missions.js — Dynamic Mission Board System
 *
 * Generates procedural kill/fetch quests from the existing mob pool.
 * The Bounty Board (room 16) displays 3 active missions that rotate
 * on completion or expiry. Missions scale to the player's power level.
 *
 * Mission types:
 *   - Hunt: Kill N of a specific mob type
 *   - Retrieve: Kill a mob and collect a drop (simulated)
 *   - Challenge: Kill a specific mob that's stronger than average
 *
 * Rewards: QP + gold, scaling with difficulty.
 *
 * Exposes window.MudMissions for integration with mud_engine.js.
 */
(() => {
  'use strict';

  const BOUNTY_BOARD_VNUM = 16;
  const MAX_ACTIVE_MISSIONS = 3;
  const MISSION_EXPIRY_MINUTES = 15;

  /** Mission name templates by type. */
  const MISSION_NAMES = {
    hunt: [
      'Bounty: {mob}',
      'Eliminate {mob}',
      'Clear Out {mob}',
      'Hunt: {mob}'
    ],
    retrieve: [
      'Salvage from {mob}',
      'Recover Materials: {mob}',
      'Scavenge: {mob}'
    ],
    challenge: [
      'Challenge: {mob}',
      'Prove Yourself: {mob}',
      'Test of Strength: {mob}'
    ]
  };

  /** Description templates. */
  const MISSION_DESCS = {
    hunt: 'Defeat {count} {mob} and return to the Bounty Board.',
    retrieve: 'Defeat {mob} and bring back proof of the kill.',
    challenge: 'Seek out and defeat the powerful {mob}.'
  };

  /**
   * Generate a set of missions based on available mobs and player power.
   * @param {object} mobs - All mob definitions (from MudData)
   * @param {number} playerPower - Player's current power stat
   * @param {Array} completedMissionIds - Previously completed mission IDs (avoid repeats)
   * @returns {Array} Array of mission objects
   */
  function generateMissions(mobs, playerPower, completedMissionIds = []) {
    // Filter to hostile mobs within power range
    const hostileMobs = Object.entries(mobs).filter(([vnum, mob]) => {
      if (!mob.hostile && !mob.stats) return false;
      if (!mob.stats) return false;
      const cp = (mob.stats.hp || 0) + (mob.stats.attack || 0) * 3 + (mob.stats.defense || 0) * 2;
      // Within 25%–200% of player power
      return cp >= playerPower * 0.25 && cp <= playerPower * 2.5;
    });

    if (hostileMobs.length === 0) {
      // Fallback: use any hostile mob
      const anyHostile = Object.entries(mobs).filter(([, mob]) => mob.hostile || mob.stats?.hp > 0);
      if (anyHostile.length === 0) return [];
      hostileMobs.push(...anyHostile.slice(0, 5));
    }

    const missions = [];
    const usedMobs = new Set();

    for (let i = 0; i < MAX_ACTIVE_MISSIONS && i < hostileMobs.length; i++) {
      // Pick a random mob not yet used
      let attempts = 0;
      let pick;
      do {
        pick = hostileMobs[Math.floor(Math.random() * hostileMobs.length)];
        attempts++;
      } while (usedMobs.has(pick[0]) && attempts < 20);

      if (usedMobs.has(pick[0])) continue;
      usedMobs.add(pick[0]);

      const [mobVnum, mob] = pick;
      const cp = (mob.stats.hp || 0) + (mob.stats.attack || 0) * 3 + (mob.stats.defense || 0) * 2;
      const ratio = playerPower > 0 ? cp / playerPower : 1;

      // Determine mission type based on mob strength
      let type;
      if (ratio > 1.5) type = 'challenge';
      else if (Math.random() < 0.4) type = 'retrieve';
      else type = 'hunt';

      const count = type === 'hunt' ? Math.floor(Math.random() * 3) + 2 : 1;

      // Generate rewards (scale with difficulty)
      const difficultyMod = Math.max(1, Math.floor(ratio * 2));
      const qpReward = type === 'challenge' ? 4 + difficultyMod : 2 + difficultyMod;
      const goldReward = (type === 'challenge' ? 30 : 15) * difficultyMod;

      const missionId = `mission_${Date.now()}_${i}`;
      const nameTemplates = MISSION_NAMES[type];
      const name = nameTemplates[Math.floor(Math.random() * nameTemplates.length)]
        .replace('{mob}', mob.name);
      const desc = MISSION_DESCS[type]
        .replace('{mob}', mob.name)
        .replace('{count}', count);

      missions.push({
        id: missionId,
        type,
        name,
        description: desc,
        targetMobVnum: parseInt(mobVnum),
        targetMobName: mob.name,
        killsRequired: count,
        killsProgress: 0,
        rewards: { qp: qpReward, gold: goldReward },
        createdAt: Date.now(),
        expiresAt: Date.now() + (MISSION_EXPIRY_MINUTES * 60 * 1000)
      });
    }

    return missions;
  }

  /**
   * Check if a kill progresses any active mission.
   * @param {Array} activeMissions - Player's active missions
   * @param {number} killedMobVnum - Vnum of the killed mob
   * @returns {{ updated: boolean, completed: Array, messages: Array }}
   */
  function progressMission(activeMissions, killedMobVnum) {
    const messages = [];
    const completed = [];

    for (const mission of activeMissions) {
      if (mission.targetMobVnum === killedMobVnum) {
        mission.killsProgress += 1;
        if (mission.killsProgress >= mission.killsRequired) {
          completed.push(mission);
          messages.push({ type: 'quest', text: `Mission Complete: ${mission.name}!` });
          messages.push({ type: 'success', text: `  Return to the Bounty Board to claim your reward.` });
        } else {
          messages.push({ type: 'info', text: `  [Mission] ${mission.name}: ${mission.killsProgress}/${mission.killsRequired}` });
        }
      }
    }

    return { updated: messages.length > 0, completed, messages };
  }

  /**
   * Claim rewards for a completed mission.
   * @param {object} mission - The completed mission
   * @param {object} player - Player state (mutated)
   * @returns {Array} Output messages
   */
  function claimMission(mission, player) {
    const output = [];
    output.push({ type: 'quest', text: `─── Bounty Claimed: ${mission.name} ───` });

    if (mission.rewards.qp) {
      player.questPoints += mission.rewards.qp;
      output.push({ type: 'success', text: `  +${mission.rewards.qp} Quest Points (total: ${player.questPoints})` });
    }
    if (mission.rewards.gold) {
      player.gold += mission.rewards.gold;
      output.push({ type: 'success', text: `  +${mission.rewards.gold} gold (total: ${player.gold})` });
    }

    return output;
  }

  /**
   * Remove expired missions from the active list.
   * @param {Array} activeMissions - Player's active missions
   * @returns {{ remaining: Array, expired: Array, messages: Array }}
   */
  function pruneExpired(activeMissions) {
    const now = Date.now();
    const remaining = [];
    const expired = [];
    const messages = [];

    for (const m of activeMissions) {
      if (m.expiresAt && now > m.expiresAt) {
        expired.push(m);
        messages.push({ type: 'info', text: `Mission expired: ${m.name}` });
      } else {
        remaining.push(m);
      }
    }

    return { remaining, expired, messages };
  }

  /**
   * Display the bounty board (called when player uses 'mission' or interacts with board).
   * @param {Array} activeMissions - Player's active missions
   * @param {Array} availableMissions - Generated missions available to accept
   * @returns {Array} Output lines
   */
  function displayBoard(activeMissions, availableMissions) {
    const output = [{ type: 'info', text: '─── Bounty Board ───' }];

    if (activeMissions.length > 0) {
      output.push({ type: 'info', text: 'Active Missions:' });
      for (const m of activeMissions) {
        const progress = `${m.killsProgress}/${m.killsRequired}`;
        const done = m.killsProgress >= m.killsRequired;
        output.push({ type: done ? 'success' : 'quest', text: `  ${done ? '[COMPLETE]' : `[${progress}]`} ${m.name}` });
        output.push({ type: 'info', text: `    ${m.description}` });
        output.push({ type: 'info', text: `    Reward: ${m.rewards.qp} QP, ${m.rewards.gold} gold` });
      }
    }

    if (availableMissions.length > 0) {
      output.push({ type: 'info', text: '' });
      output.push({ type: 'info', text: 'Available Bounties:' });
      for (let i = 0; i < availableMissions.length; i++) {
        const m = availableMissions[i];
        output.push({ type: 'items', text: `  ${i + 1}. ${m.name}` });
        output.push({ type: 'info', text: `     ${m.description}` });
        output.push({ type: 'info', text: `     Reward: ${m.rewards.qp} QP, ${m.rewards.gold} gold` });
      }
      output.push({ type: 'info', text: '' });
      output.push({ type: 'success', text: "Type 'mission accept <number>' to take a bounty." });
      output.push({ type: 'success', text: "Type 'mission claim' to collect completed bounties." });
    } else if (activeMissions.length === 0) {
      output.push({ type: 'info', text: '  No bounties available. Check back later.' });
    }

    return output;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudMissions = {
    BOUNTY_BOARD_VNUM,
    MAX_ACTIVE_MISSIONS,
    generateMissions,
    progressMission,
    claimMission,
    pruneExpired,
    displayBoard
  };
})();
