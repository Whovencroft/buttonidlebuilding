/**
 * Adds normalized jrpg scene defaults for milestone 24 saves.
 */
export function migrateToV8(state) {
  const next = { ...(state || {}) };

  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }

  if (!next.scenes || typeof next.scenes !== 'object' || Array.isArray(next.scenes)) {
    next.scenes = {};
  }

  if (!next.scenes.jrpg || typeof next.scenes.jrpg !== 'object' || Array.isArray(next.scenes.jrpg)) {
    next.scenes.jrpg = {};
  }

  next.meta.saveVersion = 8;
  return next;
}
