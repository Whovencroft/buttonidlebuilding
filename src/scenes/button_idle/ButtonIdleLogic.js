import { loadLegacyScriptOnce } from '../legacy_loader.js';

/**
 * Creates the legacy-backed button-idle runtime.
 * Purpose: isolate runtime creation from renderer and UI wrappers.
 */
export async function createButtonIdleLogic(api) {
  await loadLegacyScriptOnce('/js/scenes/button_idle_scene.js');

  if (typeof window.ButtonIdleScene?.create !== 'function') {
    throw new Error('ButtonIdleScene.create is unavailable after loading legacy script.');
  }

  return window.ButtonIdleScene.create(api);
}
