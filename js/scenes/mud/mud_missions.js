/**
 * mud_missions.js — Bulletin Board Quest System
 *
 * Generates procedural quests from the mob/item/room pools.
 * The Bulletin Board (room 12) offers one quest at a time.
 * Players must complete or quit their current quest before
 * requesting a new one.
 *
 * Quest types:
 *   - Hunt:  Kill a specific mob (with a hint of where to find it)
 *   - Fetch: Find a specific item (spawned somewhere in the world with a hint)
 *
 * Rewards: Quest Points + gold, scaling with difficulty.
 *
 * Exposes window.MudMissions for integration with mud_systems_integration.js.
 */
(() => {
  'use strict';

  const BOARD_ROOM_VNUM = 12;

  /* ─── Name / description templates ──────────────────────────────────────── */

  const QUEST_NAMES = {
    hunt: [
      'Bounty: {mob}',
      'Eliminate {mob}',
      'Hunt Down {mob}',
      'Wanted: {mob}'
    ],
    fetch: [
      'Lost Artifact: {item}',
      'Recover the {item}',
      'Salvage Request: {item}',
      'Retrieve: {item}'
    ]
  };

  const QUEST_DESCS = {
    hunt: 'Track down and defeat {mob}. {hint} Return to the Bulletin Board when done.',
    fetch: 'Find the lost {item}. {hint} Bring it back to the Bulletin Board.'
  };

  /* ─── Zone / area hint helpers ──────────────────────────────────────────── */

  /**
   * Build a human-readable hint for where a mob can be found.
   * Checks the mob's zone field or scans rooms for its vnum.
   * @param {number} mobVnum - The mob's vnum
   * @param {object} rooms  - All room data (keyed by vnum)
   * @param {object} mob    - The mob definition
   * @returns {string} A hint sentence
   */
  function buildMobHint(mobVnum, rooms, mob) {
    // Try to find a room that spawns this mob and use its name
    for (const [rvnum, room] of Object.entries(rooms)) {
      const spawns = room.mob_spawns || room.mobs || [];
      if (spawns.includes(mobVnum) || spawns.includes(Number(mobVnum))) {
        const roomName = room.name || 'an unknown area';
        return `They were last seen near ${roomName}.`;
      }
    }
    return 'Their whereabouts are uncertain \u2014 explore and ask around.';
  }

  /**
   * Build a hint for a fetch-quest item placement.
   * @param {string} zoneName - Zone the item was placed in
   * @param {string} roomName - Room the item was placed in
   * @returns {string}
   */
  function buildItemHint(zoneName, roomName) {
    if (roomName) return `It was last seen near ${roomName}.`;
    return 'Search the world \u2014 it could be anywhere.';
  }

  /* ─── Quest generation ──────────────────────────────────────────────────── */

  /**
   * Generate a single quest scaled to the player.
   * Type is randomly chosen between hunt and fetch.
   * @param {object} mobs        - All mob definitions
   * @param {object} rooms       - All room definitions
   * @param {object} items       - All item definitions
   * @param {number} playerPower - Player's current power
   * @param {Array}  completedIds - Previously completed quest IDs
   * @returns {object|null} A quest object, or null if nothing suitable
   */
  function generateQuest(mobs, rooms, items, playerPower, completedIds = []) {
    const roll = Math.random();

    if (roll < 0.55) {
      return generateHuntQuest(mobs, rooms, playerPower, completedIds);
    }
    return generateFetchQuest(items, rooms, playerPower, completedIds);
  }

  /**
   * Generate a hunt quest — kill a specific mob.
   */
  function generateHuntQuest(mobs, rooms, playerPower, completedIds) {
    // Filter to hostile mobs within a reasonable power range
    const candidates = Object.entries(mobs).filter(([vnum, mob]) => {
      if (!mob.hostile && !mob.stats) return false;
      if (!mob.stats) return false;
      const cp = (mob.stats.hp || 0) + (mob.stats.attack || 0) * 3 + (mob.stats.defense || 0) * 2;
      return cp >= Math.max(1, playerPower * 0.2) && cp <= playerPower * 3;
    });

    if (candidates.length === 0) {
      // Fallback: any hostile mob
      const any = Object.entries(mobs).filter(([, m]) => m.hostile || m.stats?.hp > 0);
      if (any.length === 0) return null;
      candidates.push(...any.slice(0, 10));
    }

    const [mobVnum, mob] = candidates[Math.floor(Math.random() * candidates.length)];
    const cp = (mob.stats.hp || 0) + (mob.stats.attack || 0) * 3 + (mob.stats.defense || 0) * 2;
    const ratio = playerPower > 0 ? cp / playerPower : 1;
    const diffMod = Math.max(1, Math.floor(ratio * 2));

    const killCount = Math.floor(Math.random() * 3) + 1;
    const hint = buildMobHint(Number(mobVnum), rooms, mob);

    const nameTemplates = QUEST_NAMES.hunt;
    const name = nameTemplates[Math.floor(Math.random() * nameTemplates.length)]
      .replace('{mob}', mob.name);
    const desc = QUEST_DESCS.hunt
      .replace('{mob}', mob.name)
      .replace('{hint}', hint);

    return {
      id: `quest_hunt_${Date.now()}_${mobVnum}`,
      type: 'hunt',
      name,
      description: desc,
      targetMobVnum: Number(mobVnum),
      targetMobName: mob.name,
      killsRequired: killCount,
      killsProgress: 0,
      rewards: {
        qp: 2 + diffMod + (killCount > 2 ? 1 : 0),
        gold: 15 * diffMod
      },
      createdAt: Date.now()
    };
  }

  /**
   * Generate a fetch quest — find a specific item placed in the world.
   * Returns the quest object with a spawnRoomVnum for the engine to place the item.
   */
  function generateFetchQuest(items, rooms, playerPower, completedIds) {
    // Pick a random item from the expanded gear pool (vnums 100-299)
    const candidates = Object.entries(items).filter(([vnum]) => {
      const v = Number(vnum);
      return v >= 100 && v < 300;
    });

    if (candidates.length === 0) {
      // Fallback: any item
      const any = Object.entries(items);
      if (any.length === 0) return null;
      candidates.push(...any.slice(0, 10));
    }

    const [itemVnum, item] = candidates[Math.floor(Math.random() * candidates.length)];

    // Pick a random room to place the item in (avoid training tower and special rooms)
    const roomCandidates = Object.entries(rooms).filter(([rvnum]) => {
      const v = Number(rvnum);
      return v > 115 && v !== 150; // Not training tower or quest shop
    });

    if (roomCandidates.length === 0) return null;

    const [roomVnum, room] = roomCandidates[Math.floor(Math.random() * roomCandidates.length)];
    const hint = buildItemHint(room.zone_name || room.zone, room.name);

    const nameTemplates = QUEST_NAMES.fetch;
    const name = nameTemplates[Math.floor(Math.random() * nameTemplates.length)]
      .replace('{item}', item.name);
    const desc = QUEST_DESCS.fetch
      .replace('{item}', item.name)
      .replace('{hint}', hint);

    return {
      id: `quest_fetch_${Date.now()}_${itemVnum}`,
      type: 'fetch',
      name,
      description: desc,
      targetItemVnum: Number(itemVnum),
      targetItemName: item.name,
      spawnRoomVnum: Number(roomVnum),
      collected: false,
      rewards: {
        qp: 3 + Math.floor(Math.random() * 3),
        gold: 20 + Math.floor(Math.random() * 30)
      },
      createdAt: Date.now()
    };
  }

  /* ─── Quest progression ─────────────────────────────────────────────────── */

  /**
   * Check if a mob kill progresses the active quest.
   * @param {object|null} activeQuest - The player's current quest (or null)
   * @param {number} killedMobVnum    - Vnum of the killed mob
   * @returns {{ updated: boolean, completed: boolean, messages: Array }}
   */
  function progressHunt(activeQuest, killedMobVnum) {
    if (!activeQuest || activeQuest.type !== 'hunt') {
      return { updated: false, completed: false, messages: [] };
    }
    if (activeQuest.targetMobVnum !== killedMobVnum) {
      return { updated: false, completed: false, messages: [] };
    }

    activeQuest.killsProgress += 1;
    const messages = [];

    if (activeQuest.killsProgress >= activeQuest.killsRequired) {
      messages.push({ type: 'quest', text: `Quest Complete: ${activeQuest.name}!` });
      messages.push({ type: 'success', text: "  Return to the Bulletin Board to claim your reward." });
      return { updated: true, completed: true, messages };
    }

    messages.push({
      type: 'info',
      text: `  [Quest] ${activeQuest.name}: ${activeQuest.killsProgress}/${activeQuest.killsRequired}`
    });
    return { updated: true, completed: false, messages };
  }

  /**
   * Check if picking up an item progresses a fetch quest.
   * @param {object|null} activeQuest - The player's current quest
   * @param {number} pickedItemVnum   - Vnum of the picked-up item
   * @returns {{ updated: boolean, completed: boolean, messages: Array }}
   */
  function progressFetch(activeQuest, pickedItemVnum) {
    if (!activeQuest || activeQuest.type !== 'fetch') {
      return { updated: false, completed: false, messages: [] };
    }
    if (activeQuest.targetItemVnum !== pickedItemVnum) {
      return { updated: false, completed: false, messages: [] };
    }

    activeQuest.collected = true;
    const messages = [
      { type: 'quest', text: `Quest Item Found: ${activeQuest.targetItemName}!` },
      { type: 'success', text: "  Return to the Bulletin Board to claim your reward." }
    ];
    return { updated: true, completed: true, messages };
  }

  /* ─── Reward claiming ───────────────────────────────────────────────────── */

  /**
   * Claim rewards for a completed quest.
   * @param {object} quest  - The completed quest
   * @param {object} player - Player state (mutated directly)
   * @returns {Array} Output messages
   */
  function claimQuest(quest, player) {
    const output = [];
    output.push({ type: 'quest', text: `─── Quest Claimed: ${quest.name} ───` });

    if (quest.rewards.qp) {
      player.questPoints = (player.questPoints || 0) + quest.rewards.qp;
      output.push({ type: 'success', text: `  +${quest.rewards.qp} Quest Points (total: ${player.questPoints})` });
    }
    if (quest.rewards.gold) {
      player.gold = (player.gold || 0) + quest.rewards.gold;
      output.push({ type: 'success', text: `  +${quest.rewards.gold} gold (total: ${player.gold})` });
    }

    // Track completion count for repeat-reward scaling
    if (!player.questCompletionCounts) player.questCompletionCounts = {};
    const baseId = quest.type === 'hunt'
      ? `hunt_${quest.targetMobVnum}`
      : `fetch_${quest.targetItemVnum}`;
    player.questCompletionCounts[baseId] = (player.questCompletionCounts[baseId] || 0) + 1;

    return output;
  }

  /* ─── Board display ─────────────────────────────────────────────────────── */

  /**
   * Display the bulletin board status.
   * @param {object|null} activeQuest - Current active quest (or null)
   * @returns {Array} Output lines
   */
  function displayBoard(activeQuest) {
    const output = [{ type: 'info', text: '═══ Bulletin Board ═══' }];

    if (activeQuest) {
      const isHunt = activeQuest.type === 'hunt';
      const isComplete = isHunt
        ? (activeQuest.killsProgress >= activeQuest.killsRequired)
        : activeQuest.collected;

      output.push({ type: 'info', text: 'Current Quest:' });
      if (isComplete) {
        output.push({ type: 'success', text: `  [COMPLETE] ${activeQuest.name}` });
      } else if (isHunt) {
        output.push({ type: 'quest', text: `  [${activeQuest.killsProgress}/${activeQuest.killsRequired}] ${activeQuest.name}` });
      } else {
        output.push({ type: 'quest', text: `  [In Progress] ${activeQuest.name}` });
      }
      output.push({ type: 'info', text: `  ${activeQuest.description}` });
      output.push({ type: 'info', text: `  Reward: ${activeQuest.rewards.qp} QP, ${activeQuest.rewards.gold} gold` });
      output.push({ type: 'info', text: '' });

      if (isComplete) {
        output.push({ type: 'success', text: "Type 'board claim' to collect your reward." });
      } else {
        output.push({ type: 'info', text: "Type 'board quit' to abandon this quest." });
      }
    } else {
      output.push({ type: 'info', text: '  No active quest.' });
      output.push({ type: 'info', text: '' });
      output.push({ type: 'success', text: "Type 'board quest' to request a new quest." });
    }

    return output;
  }

  /* ─── Public API ────────────────────────────────────────────────────────── */

  window.MudMissions = {
    BOARD_ROOM_VNUM,
    generateQuest,
    progressHunt,
    progressFetch,
    claimQuest,
    displayBoard
  };
})();
