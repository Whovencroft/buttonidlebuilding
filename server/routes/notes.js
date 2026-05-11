/**
 * Notes routes: player-written notes visible to all in a room.
 * GET  /api/notes/:room  — Get notes in a room (most recent 20)
 * POST /api/notes        — Leave a note { roomVnum, content }
 *
 * Notes are limited to 280 characters and filtered server-side.
 */
const express = require('express');
const pool = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_NOTE_LENGTH = 280;
const MAX_NOTES_PER_ROOM = 20;
const COOLDOWN_MS = 60 * 1000; // 1 minute between notes

// Simple in-memory cooldown tracker (resets on server restart)
const lastNoteTime = {};

/** Get notes for a specific room. */
router.get('/:room', async (req, res) => {
  const roomVnum = parseInt(req.params.room);
  if (isNaN(roomVnum)) {
    return res.status(400).json({ error: 'Invalid room vnum.' });
  }

  try {
    const result = await pool.query(
      `SELECT n.id, n.content, n.created_at, p.username
       FROM notes n JOIN players p ON n.player_id = p.id
       WHERE n.room_vnum = $1
       ORDER BY n.created_at DESC LIMIT $2`,
      [roomVnum, MAX_NOTES_PER_ROOM]
    );
    res.json({ notes: result.rows });
  } catch (err) {
    console.error('Get notes error:', err.message);
    res.status(500).json({ error: 'Failed to load notes.' });
  }
});

/** Leave a note in a room. */
router.post('/', requireAuth, async (req, res) => {
  const { roomVnum, content } = req.body;

  if (!roomVnum || !content) {
    return res.status(400).json({ error: 'roomVnum and content required.' });
  }
  if (content.length > MAX_NOTE_LENGTH) {
    return res.status(400).json({ error: `Note must be ${MAX_NOTE_LENGTH} characters or less.` });
  }

  // Cooldown check
  const now = Date.now();
  if (lastNoteTime[req.playerId] && now - lastNoteTime[req.playerId] < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - lastNoteTime[req.playerId])) / 1000);
    return res.status(429).json({ error: `Wait ${wait}s before leaving another note.` });
  }

  try {
    await pool.query(
      'INSERT INTO notes (player_id, room_vnum, content) VALUES ($1, $2, $3)',
      [req.playerId, roomVnum, content]
    );
    lastNoteTime[req.playerId] = now;

    // Prune old notes if room exceeds limit
    await pool.query(
      `DELETE FROM notes WHERE id IN (
        SELECT id FROM notes WHERE room_vnum = $1
        ORDER BY created_at DESC OFFSET $2
      )`,
      [roomVnum, MAX_NOTES_PER_ROOM]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Post note error:', err.message);
    res.status(500).json({ error: 'Failed to save note.' });
  }
});

module.exports = router;
