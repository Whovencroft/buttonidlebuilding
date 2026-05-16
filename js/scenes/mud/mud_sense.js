/**
 * mud_sense.js  -  Sense & Scan System
 *
 * Provides the 'sense' command to gauge relative mob power in the current
 * room and adjacent rooms. Shows descriptive tiers rather than raw numbers.
 *
 * Exposes window.MudSense for integration with mud_engine.js.
 */
(() => {
  'use strict';

  /**
   * Descriptive power comparison tiers.
   * Each entry: [maxRatio, label, color]
   * Ratio = mobPower / playerPower
   */
  const POWER_TIERS = [
    [0.10, 'Pathetically weak',       'dim'],
    [0.50, 'Much weaker',             'dim'],
    [0.90, 'Weaker',                  'info'],
    [1.10, 'About your equal',        'info'],
    [2.00, 'Stronger',                'combat'],
    [5.00, 'Much stronger',           'combat'],
    [Infinity, 'Overwhelmingly powerful', 'error']
  ];

  /**
   * Get a descriptive label for a mob's power relative to the player.
   * @param {number} mobPower - Creature power (hp + atk*3 + def*2)
   * @param {number} playerPower - Player's accumulated power stat
   * @returns {{ label: string, type: string }}
   */
  function comparePower(mobPower, playerPower) {
    if (playerPower <= 0) return { label: 'Unknown', type: 'info' };
    const ratio = mobPower / playerPower;
    for (const [maxRatio, label, type] of POWER_TIERS) {
      if (ratio <= maxRatio) return { label, type };
    }
    return { label: 'Unknown', type: 'info' };
  }

  /**
   * Calculate creature power from mob stats (mirrors engine formula).
   * @param {object} mob - Mob definition with stats
   * @returns {number}
   */
  function getCreaturePower(mob) {
    if (!mob || !mob.stats) return 10;
    return (mob.stats.hp || 0) + (mob.stats.attack || 0) * 3 + (mob.stats.defense || 0) * 2;
  }

  /**
   * Execute the 'sense' command.
   * Shows all mobs in the current room with relative power descriptions.
   * If target specified, senses a specific mob.
   *
   * @param {object} opts - { target, currentRoom, rooms, mobs, player, getAliveMobsInRoom }
   * @returns {Array} Output lines
   */
  function doSense(opts) {
    const { target, currentRoom, rooms, mobs, player, getAliveMobsInRoom } = opts;

    if (!currentRoom) return [{ type: 'error', text: 'You sense nothing here.' }];

    const output = [];

    if (!target) {
      // Sense all mobs in current room
      const roomMobs = getAliveMobsInRoom(currentRoom);
      if (roomMobs.length === 0) {
        output.push({ type: 'info', text: 'You reach out with your senses... nothing hostile nearby.' });
      } else {
        output.push({ type: 'info', text: 'You focus your awareness...' });
        for (const mobVnum of roomMobs) {
          const mob = mobs[mobVnum];
          if (!mob) continue;
          const cp = getCreaturePower(mob);
          const { label, type } = comparePower(cp, player.power);
          output.push({ type, text: `  ${mob.name} - ${label}` });
        }
      }

      // Scan adjacent rooms (brief)
      const exits = Object.entries(currentRoom.exits || {});
      if (exits.length > 0) {
        let adjacentFound = false;
        for (const [dir, exit] of exits) {
          const targetVnum = typeof exit === 'object' ? exit.target_vnum : exit;
          const adjRoom = rooms[targetVnum];
          if (!adjRoom) continue;
          const adjMobs = getAliveMobsInRoom(adjRoom);
          if (adjMobs.length > 0) {
            if (!adjacentFound) {
              output.push({ type: 'info', text: '' });
              output.push({ type: 'info', text: 'Nearby presences:' });
              adjacentFound = true;
            }
            for (const mobVnum of adjMobs) {
              const mob = mobs[mobVnum];
              if (!mob) continue;
              const cp = getCreaturePower(mob);
              const { label, type } = comparePower(cp, player.power);
              output.push({ type, text: `  [${dir}] ${mob.name} - ${label}` });
            }
          }
        }
      }
    } else {
      // Sense a specific mob
      const roomMobs = getAliveMobsInRoom(currentRoom);
      const mobVnum = roomMobs.find(v => {
        const mob = mobs[v];
        return mob && mob.name.toLowerCase().includes(target.toLowerCase());
      });
      if (mobVnum === undefined) {
        return [{ type: 'error', text: `You don't sense '${target}' here.` }];
      }
      const mob = mobs[mobVnum];
      const cp = getCreaturePower(mob);
      const { label, type } = comparePower(cp, player.power);
      output.push({ type: 'info', text: `You focus on ${mob.name}...` });
      output.push({ type, text: `  Power reading: ${label}` });

      // Extra detail for stronger mobs
      if (cp > player.power * 2) {
        output.push({ type: 'combat', text: '  Caution advised. This foe could end you quickly.' });
      } else if (cp < player.power * 0.5) {
        output.push({ type: 'dim', text: '  Hardly worth your time.' });
      }
    }

    return output;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  window.MudSense = {
    comparePower,
    getCreaturePower,
    doSense
  };
})();
