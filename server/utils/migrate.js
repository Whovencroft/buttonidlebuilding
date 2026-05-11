/**
 * Database migration — creates all tables if they don't exist.
 * Run with: node utils/migrate.js
 */
const pool = require('./db');

const SCHEMA = `
  -- Players / Auth
  CREATE TABLE IF NOT EXISTS players (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(32) UNIQUE NOT NULL,
    password    VARCHAR(128) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
  );

  -- Save data (one save per player)
  CREATE TABLE IF NOT EXISTS saves (
    player_id   INTEGER PRIMARY KEY REFERENCES players(id),
    data        JSONB NOT NULL,
    updated_at  TIMESTAMP DEFAULT NOW()
  );

  -- Marketplace: rotating stock (refreshed by cron or on-demand)
  CREATE TABLE IF NOT EXISTS marketplace_stock (
    id          SERIAL PRIMARY KEY,
    item_vnum   INTEGER NOT NULL,
    price       INTEGER NOT NULL,
    quantity    INTEGER DEFAULT 1,
    expires_at  TIMESTAMP NOT NULL
  );

  -- Player-written notes (visible to all in a room)
  CREATE TABLE IF NOT EXISTS notes (
    id          SERIAL PRIMARY KEY,
    player_id   INTEGER REFERENCES players(id),
    room_vnum   INTEGER NOT NULL,
    content     VARCHAR(280) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_notes_room ON notes(room_vnum);

  -- Ghost recordings (player movement/action snapshots)
  CREATE TABLE IF NOT EXISTS ghosts (
    id          SERIAL PRIMARY KEY,
    player_id   INTEGER REFERENCES players(id),
    room_vnum   INTEGER NOT NULL,
    action      VARCHAR(64) NOT NULL,
    direction   VARCHAR(16),
    timestamp   TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_ghosts_room ON ghosts(room_vnum);
`;

async function migrate() {
  try {
    await pool.query(SCHEMA);
    console.log('Migration complete — all tables created.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
