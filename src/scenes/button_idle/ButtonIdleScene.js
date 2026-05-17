import { createButtonIdleLogic } from './ButtonIdleLogic.js';
import { ButtonIdleRenderer } from './ButtonIdleRenderer.js';
import { ButtonIdleUI } from './ButtonIdleUI.js';
import { loadButtonIdleData } from './data.js';

/**
 * Loads and exposes the existing button idle scene implementation.
 */
export async function createButtonIdleScene(api) {
  // Purpose: consume external button text data through AssetService before scene boot.
  const buttonTextData = await loadButtonIdleData(api.assetService);
  if (buttonTextData) {
    window.ButtonIdleSceneTextData = buttonTextData;
  }

  const legacyScene = await createButtonIdleLogic(api);
  const renderer = new ButtonIdleRenderer(legacyScene);
  const ui = new ButtonIdleUI(legacyScene);

  return {
    ...legacyScene,
    // Purpose: retain existing scene behavior while making renderer ownership explicit.
    update: (dt, context) => renderer.update(dt, context),
    render: (context) => renderer.render(context),
    // Purpose: keep UI/lifecycle flow grouped for later ButtonIdleUI expansion.
    enter: (context) => ui.enter(context),
    exit: (context) => ui.exit(context),
    onStateLoaded: (context) => ui.onStateLoaded(context)
  };
}
