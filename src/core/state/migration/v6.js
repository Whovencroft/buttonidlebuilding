/**
 * Adds normalized pokemon_like scene defaults for milestone 21 saves.
 */
export function migrateToV6(state) {
  const next = { ...(state || {}) };

  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }

  if (!next.scenes || typeof next.scenes !== 'object' || Array.isArray(next.scenes)) {
    next.scenes = {};
  }

  if (!next.scenes.pokemon_like || typeof next.scenes.pokemon_like !== 'object' || Array.isArray(next.scenes.pokemon_like)) {
    next.scenes.pokemon_like = {};
  }

  next.meta.saveVersion = 6;
  return next;
}
