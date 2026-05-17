import { SAVE_SCHEMA_VERSION } from '../SaveSchema.js';
import { migrateToV1 } from './v1.js';
import { migrateToV2 } from './v2.js';
import { migrateToV3 } from './v3.js';
import { migrateToV4 } from './v4.js';
import { migrateToV5 } from './v5.js';
import { migrateToV6 } from './v6.js';
import { migrateToV7 } from './v7.js';
import { migrateToV8 } from './v8.js';

const migrations = {
  1: migrateToV1,
  2: migrateToV2,
  3: migrateToV3,
  4: migrateToV4,
  5: migrateToV5,
  6: migrateToV6,
  7: migrateToV7,
  8: migrateToV8
};

/**
 * Applies save migrations in version order until the current schema version.
 */
export function migrateSaveData(rawState) {
  let nextState = rawState;
  let version = Number(rawState?.meta?.saveVersion) || 0;

  while (version < SAVE_SCHEMA_VERSION) {
    const targetVersion = version + 1;
    const migration = migrations[targetVersion];

    if (typeof migration !== 'function') {
      throw new Error(`Missing save migration for version ${targetVersion}.`);
    }

    nextState = migration(nextState);
    version = targetVersion;
  }

  return nextState;
}
