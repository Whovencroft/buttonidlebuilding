/**
 * ButtonIdleUI forwards host/UI lifecycle events to the legacy runtime.
 * Purpose: reserve a clean home for later scene-local UI modularization.
 */
export class ButtonIdleUI {
  #legacyScene;

  constructor(legacyScene) {
    this.#legacyScene = legacyScene;
  }

  enter(context) {
    this.#legacyScene.enter?.(context);
  }

  exit(context) {
    this.#legacyScene.exit?.(context);
  }

  onStateLoaded(context) {
    this.#legacyScene.onStateLoaded?.(context);
  }
}
