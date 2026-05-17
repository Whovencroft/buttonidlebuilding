/**
 * PostgreSQL connection pool.
 * Reads DATABASE_URL from environment (Railway provides this automatically).
 * Handles missing DATABASE_URL gracefully so the server can start for healthchecks.
 */
const { Pool } = require('pg');

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  console.warn('WARNING: DATABASE_URL not set. DB routes will return 503.');
}

/** Wrapper that returns 503 if pool is not available. */
const db = {
  query(...args) {
    if (!pool) throw new Error('Database not configured');
    return pool.query(...args);
  }
};

module.exports = db;
