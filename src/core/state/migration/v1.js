/**
 * Ensures legacy saves receive explicit schema version metadata.
 */
export function migrateToV1(state) {
  const next = { ...(state || {}) };

  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }

  next.meta.saveVersion = 1;
  return next;
}
