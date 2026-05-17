import { loadLegacyScriptOnce } from '../legacy_loader.js';

/**
 * Loads and returns the existing marble renderer API.
 */
export async function getMarbleRendererApi() {
  await loadLegacyScriptOnce('/js/scenes/marble/marble_renderer.js');

  if (!window.MarbleRenderer) {
    throw new Error('MarbleRenderer API is unavailable after loading legacy script.');
  }

  return window.MarbleRenderer;
}
