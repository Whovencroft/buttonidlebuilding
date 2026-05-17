/**
 * ButtonIdleRenderer forwards render/update responsibilities to legacy runtime.
 * Purpose: create a stable split point for future renderer-specific refactors.
 */
export class ButtonIdleRenderer {
  #legacyScene;

  constructor(legacyScene) {
    this.#legacyScene = legacyScene;
  }

  update(dt, context) {
    this.#legacyScene.update?.(dt, context);
  }

  render(context) {
    this.#legacyScene.render?.(context);
  }
}
