/**
 * Startup script: runs migration on first boot, then starts the server.
 * Safe to run every deploy — CREATE IF NOT EXISTS is idempotent.
 */
const { execSync } = require('child_process');

try {
  console.log('Running database migration...');
  execSync('node utils/migrate.js', { stdio: 'inherit', cwd: __dirname });
} catch (err) {
  console.warn('Migration skipped or failed (DB may not be connected yet):', err.message);
}

require('./index.js');
