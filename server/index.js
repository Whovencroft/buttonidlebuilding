/**
 * MUD Backend — Express + PostgreSQL
 *
 * Starts the HTTP server immediately so Railway's healthcheck passes,
 * then lazily connects to PostgreSQL when the first API call arrives.
 */
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway's reverse proxy (required for rate limiting behind proxy)
app.set('trust proxy', 1);

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

// Health check — responds immediately, no DB dependency
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Routes (each route connects to DB on demand via the pool)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/saves', require('./routes/saves'));
app.use('/api/marketplace', require('./routes/marketplace'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/ghosts', require('./routes/ghosts'));

// Start listening immediately
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MUD backend listening on port ${PORT}`);
});
