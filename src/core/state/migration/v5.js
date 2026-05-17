/**
 * Adds normalized racing scene defaults for milestone 20 saves.
 */
export function migrateToV5(state) {
  const next = { ...(state || {}) };

  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }

  if (!next.scenes || typeof next.scenes !== 'object' || Array.isArray(next.scenes)) {
    next.scenes = {};
  }

  if (!next.scenes.racing || typeof next.scenes.racing !== 'object' || Array.isArray(next.scenes.racing)) {
    next.scenes.racing = {};
  }

  next.meta.saveVersion = 5;
  return next;
}
