/**
 * Adds normalized platformer scene defaults for milestone 19 saves.
 */
export function migrateToV4(state) {
  const next = { ...(state || {}) };

  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }

  if (!next.scenes || typeof next.scenes !== 'object' || Array.isArray(next.scenes)) {
    next.scenes = {};
  }

  if (!next.scenes.platformer || typeof next.scenes.platformer !== 'object' || Array.isArray(next.scenes.platformer)) {
    next.scenes.platformer = {};
  }

  next.meta.saveVersion = 4;
  return next;
}
