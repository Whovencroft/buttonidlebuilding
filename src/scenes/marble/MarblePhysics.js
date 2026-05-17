import { loadLegacyScriptOnce } from '../legacy_loader.js';

/**
 * Loads and returns the existing marble physics API.
 */
export async function getMarblePhysicsApi() {
  await loadLegacyScriptOnce('/js/scenes/marble/marble_physics.js');

  if (!window.MarblePhysics) {
    throw new Error('MarblePhysics API is unavailable after loading legacy script.');
  }

  return window.MarblePhysics;
}
