/**
 * Adds normalized retro_rpg scene defaults for milestone 18 saves.
 */
export function migrateToV3(state) {
  const next = { ...(state || {}) };

  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }

  if (!next.scenes || typeof next.scenes !== 'object' || Array.isArray(next.scenes)) {
    next.scenes = {};
  }

  if (!next.scenes.retro_rpg || typeof next.scenes.retro_rpg !== 'object' || Array.isArray(next.scenes.retro_rpg)) {
    next.scenes.retro_rpg = {};
  }

  next.meta.saveVersion = 3;
  return next;
}
