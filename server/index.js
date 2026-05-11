/**
 * MUD Backend — Express + PostgreSQL
 *
 * Endpoints:
 *   POST /api/auth/register   — Create account
 *   POST /api/auth/login      — Get JWT token
 *   GET  /api/saves           — Load player save
 *   PUT  /api/saves           — Store player save
 *   GET  /api/marketplace     — Get rotating shop stock
 *   POST /api/marketplace/buy — Purchase item from shop
 *   GET  /api/notes/:room     — Get notes in a room
 *   POST /api/notes           — Leave a note in a room
 *   GET  /api/ghosts/:room    — Get ghost recordings for a room
 *   POST /api/ghosts          — Record a ghost action
 */
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const saveRoutes = require('./routes/saves');
const marketRoutes = require('./routes/marketplace');
const noteRoutes = require('./routes/notes');
const ghostRoutes = require('./routes/ghosts');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/saves', saveRoutes);
app.use('/api/marketplace', marketRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/ghosts', ghostRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`MUD backend listening on port ${PORT}`);
});
