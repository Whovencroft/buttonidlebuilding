/**
 * mud_invasions.js  -  Echo Invasion System
 *
 * When a ghost appears in a room, there is a small chance it "solidifies"
 * into a hostile Echo  -  a corrupted version of another player that must
 * be fought. Inspired by Dark Souls invasions, adapted for async MUD play.
 *
 * Key mechanics:
 *   - Base 2% invasion chance per ghost encounter
 *   - Kill streak bonus: +1% per 20 mobs killed since last safe zone visit
 *   - Karma penalty: permanent +% for killing friendly NPCs (with warning)
 *   - Echo stats scale to player (0.8-1.2x HP/ATK/DEF)
 *   - Echo uses the ghost player's specialization abilities
 *   - Rewards: bonus power/XP + possible item from ghost's inventory
 *   - Ghost player is notified their echo was used
 *   - 10-minute cooldown between invasions
 *
 * Exposes window.MudInvasions for integration.
 */
(() => {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────

  const BASE_INVASION_CHANCE = 0.02;       // 2% base
  const KILL_STREAK_INTERVAL = 20;         // +1% per this many kills
  const KILL_STREAK_BONUS = 0.01;          // +1% per interval
  const KARMA_PENALTY_PER_NPC_KILL = 0.005; // +0.5% permanent per NPC killed
  const INVASION_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
  const STAT_SCALE_MIN = 0.8;
  const STAT_SCALE_MAX = 1.2;
  const BONUS_POWER_MULTIPLIER = 2.5;      // 2.5x normal power gain
  const ITEM_DROP_CHANCE = 0.30;           // 30% chance to drop an item

  /** Rooms where invasions cannot trigger (Nexus hub, shops, etc.). */
  const SAFE_ZONE_PREFIXES = ['nexus', 'training_grounds'];

  /** Dramatic invasion announcement messages. */
  const INVASION_MESSAGES = [
    'The air crackles with hostile energy. A ghost solidifies, eyes burning with malice!',
    'A shimmer in the air twists into something wrong. An echo turns hostile!',
    'The temperature drops. A phantom takes form - and it wants blood.',
    'Reality fractures. A corrupted echo steps through, weapon raised.',
    'A ghost\'s eyes snap open, glowing red. It lunges at you!'
  ];

  /** Karma warning messages shown before the first NPC kill. */
  const KARMA_WARNINGS = [
    'A chill runs down your spine. Something watches. Something remembers.',
    'The shadows seem to lean closer. Your actions have consequences.',
    'You feel a weight settle on your soul. The echoes will remember this.'
  ];

  // ─── State Tracking ─────────────────────────────────────────────────────

  /**
   * Initialize invasion tracking state for a player.
   * Called once when the engine creates or loads a player.
   * @returns {object} Default invasion state
   */
  function createInvasionState() {
    return {
      killStreakSinceSafe: 0,   // Mobs killed since last safe zone visit
      karmaDebt: 0,            // Permanent invasion % from NPC kills
      lastInvasionTime: 0,     // Timestamp of last invasion
      invasionKills: 0,        // Total echo invasions defeated
      invasionDeaths: 0,       // Total deaths to echo invasions
      pendingNotifications: [] // Notifications for the ghost player
    };
  }

  /**
   * Load invasion state from saved player data, filling defaults.
   * @param {object} saved - Saved invasion state (may be partial)
   * @returns {object} Complete invasion state
   */
  function loadInvasionState(saved) {
    return { ...createInvasionState(), ...(saved || {}) };
  }

  // ─── Kill Streak Tracking ──────────────────────────────────────────────

  /**
   * Increment the kill streak counter after a mob kill.
   * @param {object} invasionState - Player's invasion state
   */
  function recordMobKill(invasionState) {
    invasionState.killStreakSinceSafe += 1;
  }

  /**
   * Reset the kill streak when the player enters a safe zone.
   * @param {object} invasionState - Player's invasion state
   */
  function resetKillStreak(invasionState) {
    invasionState.killStreakSinceSafe = 0;
  }

  /**
   * Check if a room is in a safe zone (no invasions, resets streak).
   * @param {object} room - Room object with sector field
   * @returns {boolean}
   */
  function isSafeZone(room) {
    if (!room) return true;
    const sector = (room.sector || room.zone_name || '').toLowerCase();
    return SAFE_ZONE_PREFIXES.some(prefix => sector.includes(prefix));
  }

  // ─── Karma System ──────────────────────────────────────────────────────

  /**
   * Record an NPC kill and increase permanent karma debt.
   * Returns a warning message for the player.
   * @param {object} invasionState - Player's invasion state
   * @returns {Array} Output messages (karma warning)
   */
  function recordNpcKill(invasionState) {
    invasionState.karmaDebt += KARMA_PENALTY_PER_NPC_KILL;
    const warning = KARMA_WARNINGS[Math.floor(Math.random() * KARMA_WARNINGS.length)];
    return [
      { type: 'danger', text: warning },
      { type: 'danger', text: `  Your karma darkens. Hostile echoes grow more frequent. (+${(KARMA_PENALTY_PER_NPC_KILL * 100).toFixed(1)}% invasion chance, permanent)` }
    ];
  }

  /**
   * Check if a mob is a friendly NPC (non-hostile with dialogue).
   * @param {object} mob - Mob object
   * @returns {boolean}
   */
  function isFriendlyNpc(mob) {
    if (!mob) return false;
    const hostile = mob.hostile || mob.stats?.hostile;
    if (hostile === true || hostile === 'true') return false;
    // Has dialogue or is flagged as NPC
    const flags = mob.flags || mob.stats?.flags || '';
    return flags.includes('npc') || !!(mob.dialogue || mob.stats?.dialogue);
  }

  // ─── Invasion Chance Calculation ────────────────────────────────────────

  /**
   * Calculate the current invasion chance for a player.
   * @param {object} invasionState - Player's invasion state
   * @returns {number} Probability (0.0-1.0)
   */
  function getInvasionChance(invasionState) {
    let chance = BASE_INVASION_CHANCE;

    // Kill streak bonus: +1% per 20 kills since safe zone
    const streakBonuses = Math.floor(invasionState.killStreakSinceSafe / KILL_STREAK_INTERVAL);
    chance += streakBonuses * KILL_STREAK_BONUS;

    // Permanent karma debt
    chance += invasionState.karmaDebt;

    return Math.min(chance, 0.50); // Cap at 50% to prevent constant invasions
  }

  // ─── Invasion Roll ──────────────────────────────────────────────────────

  /**
   * Attempt to trigger an invasion when a ghost is encountered.
   * Checks cooldown, safe zone, combat state, and rolls against chance.
   * @param {object} opts - { invasionState, room, inCombat, isBossFight }
   * @returns {boolean} Whether an invasion should trigger
   */
  function shouldInvade(opts) {
    const { invasionState, room, inCombat, isBossFight } = opts;

    // Never invade in safe zones
    if (isSafeZone(room)) return false;

    // Never invade during existing combat or boss fights
    if (inCombat || isBossFight) return false;

    // Cooldown check
    const now = Date.now();
    if (now - invasionState.lastInvasionTime < INVASION_COOLDOWN_MS) return false;

    // Roll against invasion chance
    const chance = getInvasionChance(invasionState);
    return Math.random() < chance;
  }

  // ─── Echo Mob Generation ───────────────────────────────────────────────

  /**
   * Generate a hostile echo mob from ghost data, scaled to the player.
   * @param {object} ghost - Ghost data { username, action, direction }
   * @param {object} player - Current player state
   * @param {object} ghostSaveData - The ghost player's save data (if available)
   * @returns {object} A mob-like object for combat
   */
  function generateEchoMob(ghost, player, ghostSaveData) {
    const echoName = `Echo of ${ghost.username || 'Unknown'}`;

    // Scale stats to the player with random 0.8-1.2 variance
    const scaleFactor = () => STAT_SCALE_MIN + Math.random() * (STAT_SCALE_MAX - STAT_SCALE_MIN);

    const hp = Math.max(20, Math.round(player.maxHp * scaleFactor()));
    const attack = Math.max(5, Math.round(player.attackPower * scaleFactor()));
    const defense = Math.max(2, Math.round(player.defense * scaleFactor()));

    // Determine the echo's spec and abilities from ghost save data
    let echoSpec = null;
    let echoAbilities = [];
    let echoInventory = [];

    if (ghostSaveData?.player) {
      const gp = ghostSaveData.player;
      echoSpec = gp.specialization || gp.spec || null;
      echoAbilities = (gp.abilities || []).slice(0, 4); // Up to 4 abilities
      echoInventory = gp.inventory || [];
    }

    return {
      vnum: `echo_${ghost.username}_${Date.now()}`,
      name: echoName,
      desc: `A corrupted echo of ${ghost.username}. Its eyes glow with hostile intent.`,
      isEchoInvasion: true,
      echoUsername: ghost.username,
      echoSpec,
      echoAbilities,
      echoInventory,
      stats: {
        hp,
        maxHp: hp,
        attack,
        defense,
        hostile: true
      },
      // Echo mobs don't have normal loot tables  -  handled by invasion reward
      loot_table: [],
      flags: 'hostile,roaming'
    };
  }

  /**
   * Generate a fallback echo mob when ghost save data isn't available.
   * Uses only the player's stats for scaling.
   * @param {object} ghost - Ghost data { username }
   * @param {object} player - Current player state
   * @returns {object} A mob-like object for combat
   */
  function generateFallbackEchoMob(ghost, player) {
    return generateEchoMob(ghost, player, null);
  }

  // ─── Invasion Rewards ──────────────────────────────────────────────────

  /**
   * Calculate rewards for defeating an echo invasion.
   * @param {object} echoMob - The defeated echo mob
   * @param {object} player - Player state
   * @returns {{ output: Array, powerGain: number, itemDrop: number|null }}
   */
  function calculateInvasionRewards(echoMob, player) {
    const output = [];

    // Bonus power: 2.5x what a normal mob of equivalent strength would give
    const echoPower = echoMob.stats.maxHp + echoMob.stats.attack * 3 + echoMob.stats.defense * 2;
    const basePowerGain = Math.max(1, Math.floor(echoPower * 0.10));
    const powerGain = Math.floor(basePowerGain * BONUS_POWER_MULTIPLIER);

    output.push({ type: 'quest', text: `═══ INVASION DEFEATED ═══` });
    output.push({ type: 'success', text: `The echo of ${echoMob.echoUsername || 'Unknown'} dissolves into shimmering fragments.` });
    output.push({ type: 'success', text: `+${powerGain} power (invasion bonus!)` });

    // Item drop chance  -  random item from the echo's inventory
    let itemDrop = null;
    if (echoMob.echoInventory && echoMob.echoInventory.length > 0 && Math.random() < ITEM_DROP_CHANCE) {
      itemDrop = echoMob.echoInventory[Math.floor(Math.random() * echoMob.echoInventory.length)];
      output.push({ type: 'success', text: `Something falls from the fading echo - you snatch it before it vanishes!` });
    }

    return { output, powerGain, itemDrop };
  }

  // ─── Notification System ───────────────────────────────────────────────

  /**
   * Create a notification for the ghost player whose echo was used.
   * @param {string} invaderName - Name of the player who fought the echo
   * @param {boolean} echoWon - Whether the echo defeated the player
   * @param {string} echoUsername - The ghost player's username
   * @returns {object} Notification object to store
   */
  function createInvasionNotification(invaderName, echoWon, echoUsername) {
    const outcome = echoWon
      ? `Your echo defeated ${invaderName}!`
      : `Your echo was defeated by ${invaderName}.`;

    return {
      type: 'echo_invasion',
      message: outcome,
      invaderName,
      echoWon,
      timestamp: Date.now()
    };
  }

  /**
   * Get the invasion announcement text when an echo solidifies.
   * @param {string} ghostUsername - The ghost player's name
   * @returns {Array} Output messages for the dramatic announcement
   */
  function getInvasionAnnouncement(ghostUsername) {
    const msg = INVASION_MESSAGES[Math.floor(Math.random() * INVASION_MESSAGES.length)];
    return [
      { type: 'danger', text: '' },
      { type: 'danger', text: `═══ ECHO INVASION ═══` },
      { type: 'danger', text: msg },
      { type: 'danger', text: `  ${ghostUsername}'s Echo turns hostile!` },
      { type: 'danger', text: '' }
    ];
  }

  /**
   * Get the death message when a player is killed by an echo invasion.
   * @param {string} echoUsername - The ghost player's name
   * @returns {Array} Output messages
   */
  function getInvasionDeathMessage(echoUsername) {
    return [
      { type: 'danger', text: `═══ INVASION FAILED ═══` },
      { type: 'danger', text: `The echo of ${echoUsername} overwhelms you.` },
      { type: 'info', text: `You collapse as the corrupted echo fades, satisfied.` }
    ];
  }

  /**
   * Get the current invasion chance as a readable string (for status/debug).
   * @param {object} invasionState - Player's invasion state
   * @returns {string} Human-readable chance description
   */
  function getInvasionChanceText(invasionState) {
    const chance = getInvasionChance(invasionState);
    const pct = (chance * 100).toFixed(1);
    const streakBonuses = Math.floor(invasionState.killStreakSinceSafe / KILL_STREAK_INTERVAL);
    const parts = [`${pct}% (base ${(BASE_INVASION_CHANCE * 100).toFixed(0)}%`];
    if (streakBonuses > 0) parts.push(`+${streakBonuses}% streak`);
    if (invasionState.karmaDebt > 0) parts.push(`+${(invasionState.karmaDebt * 100).toFixed(1)}% karma`);
    return parts.join(', ') + ')';
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudInvasions = {
    // State management
    createInvasionState,
    loadInvasionState,

    // Kill tracking
    recordMobKill,
    resetKillStreak,
    isSafeZone,

    // Karma
    recordNpcKill,
    isFriendlyNpc,

    // Invasion logic
    getInvasionChance,
    shouldInvade,
    generateEchoMob,
    generateFallbackEchoMob,

    // Rewards
    calculateInvasionRewards,
    BONUS_POWER_MULTIPLIER,

    // Notifications
    createInvasionNotification,
    getInvasionAnnouncement,
    getInvasionDeathMessage,
    getInvasionChanceText,

    // Constants (exposed for integration/testing)
    INVASION_COOLDOWN_MS,
    ITEM_DROP_CHANCE
  };
})();
