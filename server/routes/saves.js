/**
 * Save routes: load and store player game state.
 * GET  /api/saves  — Load save (requires auth)
 * PUT  /api/saves  — Store save (requires auth)
 */
const express = require('express');
const pool = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** Load player save data. Returns null if no save exists. */
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT data FROM saves WHERE player_id = $1',
      [req.playerId]
    );
    if (result.rows.length === 0) {
      return res.json({ data: null });
    }
    res.json({ data: result.rows[0].data });
  } catch (err) {
    console.error('Load save error:', err.message);
    res.status(500).json({ error: 'Failed to load save.' });
  }
});

/** Store player save data (upsert). */
router.put('/', requireAuth, async (req, res) => {
  const { data } = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Save data required.' });
  }

  try {
    await pool.query(
      `INSERT INTO saves (player_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (player_id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [req.playerId, JSON.stringify(data)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Store save error:', err.message);
    res.status(500).json({ error: 'Failed to store save.' });
  }
});

module.exports = router;
