import { loadLegacyScriptOnce } from '../legacy_loader.js';

/**
 * Loads and returns the existing marble runtime/state API.
 */
export async function getMarbleRuntimeApi() {
  await loadLegacyScriptOnce('/js/scenes/marble_scene.js');

  if (!window.MarbleState) {
    throw new Error('MarbleState API is unavailable after loading legacy script.');
  }

  return window.MarbleState;
}
