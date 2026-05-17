/**
 * Adds normalized metroidvania scene defaults for milestone 23 saves.
 */
export function migrateToV7(state) {
  const next = { ...(state || {}) };

  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }

  if (!next.scenes || typeof next.scenes !== 'object' || Array.isArray(next.scenes)) {
    next.scenes = {};
  }

  if (!next.scenes.metroidvania || typeof next.scenes.metroidvania !== 'object' || Array.isArray(next.scenes.metroidvania)) {
    next.scenes.metroidvania = {};
  }

  next.meta.saveVersion = 7;
  return next;
}
