/**
 * Auth routes: register and login.
 * POST /api/auth/register  { username, password }
 * POST /api/auth/login     { username, password }
 */
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../utils/db');
const { signToken } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

/** Register a new player account. */
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 3-32 characters.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO players (username, password) VALUES ($1, $2) RETURNING id',
      [username.toLowerCase(), hash]
    );
    const token = signToken(result.rows[0].id);
    res.status(201).json({ token, username: username.toLowerCase() });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken.' });
    }
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

/** Login with existing credentials. */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, password FROM players WHERE username = $1',
      [username.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const player = result.rows[0];
    const valid = await bcrypt.compare(password, player.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = signToken(player.id);
    res.json({ token, username: username.toLowerCase() });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
