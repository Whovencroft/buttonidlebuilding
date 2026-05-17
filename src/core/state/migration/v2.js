/**
 * Adds normalized point_click scene defaults for milestone 17 saves.
 */
export function migrateToV2(state) {
  const next = { ...(state || {}) };

  if (!next.meta || typeof next.meta !== 'object' || Array.isArray(next.meta)) {
    next.meta = {};
  }

  if (!next.scenes || typeof next.scenes !== 'object' || Array.isArray(next.scenes)) {
    next.scenes = {};
  }

  if (!next.scenes.point_click || typeof next.scenes.point_click !== 'object' || Array.isArray(next.scenes.point_click)) {
    next.scenes.point_click = {};
  }

  next.meta.saveVersion = 2;
  return next;
}
