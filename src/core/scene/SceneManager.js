/**
 * SceneManager is the modular runtime scene coordinator used by the host app.
 * It keeps scene registration, activation, update, and render logic out of App.js.
 */
export class SceneManager {
  #host;
  #onSceneChanged;
  #scenes = new Map();
  #activeSceneId = null;

  constructor({ host, onSceneChanged } = {}) {
    if (!(host instanceof HTMLElement)) {
      throw new Error('Scene manager requires a valid host element.');
    }

    this.#host = host;
    this.#onSceneChanged = onSceneChanged;
  }

  registerScene(sceneDefinition) {
    if (!sceneDefinition || typeof sceneDefinition.id !== 'string' || !sceneDefinition.id) {
      throw new Error('Scene definitions must include a non-empty id.');
    }

    const scene = this.#normalizeScene(sceneDefinition);
    this.#scenes.set(scene.id, scene);
    return scene;
  }

  getActiveSceneId() {
    return this.#activeSceneId;
  }

  setActiveScene(nextSceneId, context = {}) {
    const nextScene = this.#getScene(nextSceneId);
    if (!nextScene) {
      throw new Error(`Cannot activate unknown scene "${nextSceneId}".`);
    }

    if (this.#activeSceneId === nextSceneId) {
      nextScene.enter({ reenter: true, ...context });
      return nextScene;
    }

    const previousScene = this.#getScene(this.#activeSceneId);
    if (previousScene) {
      previousScene.exit({ from: previousScene.id, to: nextSceneId, ...context });
      this.#hideScene(previousScene);
    }

    this.#activeSceneId = nextSceneId;
    this.#showScene(nextScene);

    nextScene.enter({ from: previousScene?.id ?? null, to: nextSceneId, ...context });

    if (typeof this.#onSceneChanged === 'function') {
      this.#onSceneChanged({
        previousSceneId: previousScene?.id ?? null,
        currentSceneId: nextSceneId,
        currentScene: nextScene
      });
    }

    return nextScene;
  }

  update(dt, context = {}) {
    const activeScene = this.#getScene(this.#activeSceneId);
    activeScene?.update(dt, context);
  }

  render(context = {}) {
    const activeScene = this.#getScene(this.#activeSceneId);
    activeScene?.render(context);
  }

  notifyStateLoaded(context = {}) {
    for (const scene of this.#scenes.values()) {
      scene.onStateLoaded(context);
    }
  }

  #getScene(sceneId) {
    if (!sceneId) return null;
    return this.#scenes.get(sceneId) ?? null;
  }

  #resolveSceneRoot(scene) {
    if (scene.root instanceof HTMLElement) return scene.root;
    if (scene.rootId) return document.getElementById(scene.rootId);
    if (scene.rootSelector) return document.querySelector(scene.rootSelector);
    return this.#host.querySelector(`[data-scene-id="${scene.id}"]`);
  }

  #normalizeScene(scene) {
    return {
      enter: () => undefined,
      exit: () => undefined,
      update: () => undefined,
      render: () => undefined,
      onStateLoaded: () => undefined,
      ...scene
    };
  }

  #showScene(scene) {
    const root = this.#resolveSceneRoot(scene);
    if (!root) return;
    root.classList.add('active');
    root.setAttribute('aria-hidden', 'false');
  }

  #hideScene(scene) {
    const root = this.#resolveSceneRoot(scene);
    if (!root) return;
    root.classList.remove('active');
    root.setAttribute('aria-hidden', 'true');
  }
}
