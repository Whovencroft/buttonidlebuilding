/**
 * Ghost routes: record and replay player movement/actions.
 *
 * Ghosts are brief snapshots of player actions in rooms.
 * When another player enters a room, they may see a ghost
 * "moving ahead" — replaying a recent player's path.
 *
 * GET  /api/ghosts/:room  — Get recent ghost actions in a room
 * POST /api/ghosts        — Record a ghost action
 *
 * Ghost data is ephemeral: entries older than 24 hours are pruned.
 */
const express = require('express');
const pool = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const GHOST_TTL_HOURS = 24;
const MAX_GHOSTS_PER_ROOM = 10;

/** Get ghost recordings for a room (most recent actions by other players). */
router.get('/:room', requireAuth, async (req, res) => {
  const roomVnum = parseInt(req.params.room);
  if (isNaN(roomVnum)) {
    return res.status(400).json({ error: 'Invalid room vnum.' });
  }

  try {
    // Prune old ghosts
    await pool.query(
      "DELETE FROM ghosts WHERE timestamp < NOW() - INTERVAL '1 hour' * $1",
      [GHOST_TTL_HOURS]
    );

    // Get recent ghosts from OTHER players in this room
    const result = await pool.query(
      `SELECT g.action, g.direction, g.timestamp, p.username
       FROM ghosts g JOIN players p ON g.player_id = p.id
       WHERE g.room_vnum = $1 AND g.player_id != $2
       ORDER BY g.timestamp DESC LIMIT $3`,
      [roomVnum, req.playerId, MAX_GHOSTS_PER_ROOM]
    );

    res.json({ ghosts: result.rows });
  } catch (err) {
    console.error('Get ghosts error:', err.message);
    res.status(500).json({ error: 'Failed to load ghosts.' });
  }
});

/** Record a ghost action (called when player moves or performs key actions). */
router.post('/', requireAuth, async (req, res) => {
  const { roomVnum, action, direction } = req.body;

  if (!roomVnum || !action) {
    return res.status(400).json({ error: 'roomVnum and action required.' });
  }

  // Only record meaningful actions
  const validActions = ['move', 'attack', 'flee', 'quest', 'train', 'buy', 'look'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action type.' });
  }

  try {
    await pool.query(
      'INSERT INTO ghosts (player_id, room_vnum, action, direction) VALUES ($1, $2, $3, $4)',
      [req.playerId, roomVnum, action, direction || null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Record ghost error:', err.message);
    res.status(500).json({ error: 'Failed to record ghost.' });
  }
});

module.exports = router;
