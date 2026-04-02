(() => {
  function createSceneManager({ host, onSceneChanged } = {}) {
    if (!(host instanceof HTMLElement)) {
      throw new Error('Scene manager requires a valid host element.');
    }

    const scenes = new Map();
    let activeSceneId = null;

    function getScene(id) {
      return scenes.get(id) || null;
    }

    function getSceneRoot(scene) {
      if (!scene) return null;
      if (scene.root instanceof HTMLElement) return scene.root;
      if (scene.rootId) return document.getElementById(scene.rootId);
      if (scene.rootSelector) return document.querySelector(scene.rootSelector);
      return host.querySelector(`[data-scene-id="${scene.id}"]`);
    }

    function normalizeScene(scene) {
      return {
        enter: () => undefined,
        exit: () => undefined,
        update: () => undefined,
        render: () => undefined,
        onStateLoaded: () => undefined,
        ...scene
      };
    }

    function registerScene(sceneDefinition) {
      if (!sceneDefinition || typeof sceneDefinition.id !== 'string' || !sceneDefinition.id) {
        throw new Error('Scene definitions must include a non-empty id.');
      }

      const scene = normalizeScene(sceneDefinition);
      scenes.set(scene.id, scene);
      return scene;
    }

    function showScene(scene) {
      const root = getSceneRoot(scene);
      if (!root) return;
      root.classList.add('active');
      root.setAttribute('aria-hidden', 'false');
    }

    function hideScene(scene) {
      const root = getSceneRoot(scene);
      if (!root) return;
      root.classList.remove('active');
      root.setAttribute('aria-hidden', 'true');
    }

    function setActiveScene(nextSceneId, context = {}) {
      const nextScene = getScene(nextSceneId);
      if (!nextScene) {
        throw new Error(`Cannot activate unknown scene "${nextSceneId}".`);
      }

      if (activeSceneId === nextSceneId) {
        nextScene.enter({ reenter: true, ...context });
        return nextScene;
      }

      const previousScene = getScene(activeSceneId);
      if (previousScene) {
        previousScene.exit({
          from: previousScene.id,
          to: nextSceneId,
          ...context
        });
        hideScene(previousScene);
      }

      activeSceneId = nextSceneId;
      showScene(nextScene);

      nextScene.enter({
        from: previousScene?.id || null,
        to: nextSceneId,
        ...context
      });

      if (typeof onSceneChanged === 'function') {
        onSceneChanged({
          previousSceneId: previousScene?.id || null,
          currentSceneId: nextSceneId,
          currentScene: nextScene
        });
      }

      return nextScene;
    }

    function update(dt, context = {}) {
      const activeScene = getScene(activeSceneId);
      if (!activeScene) return;
      activeScene.update(dt, context);
    }

    function render(context = {}) {
      const activeScene = getScene(activeSceneId);
      if (!activeScene) return;
      activeScene.render(context);
    }

    function notifyStateLoaded(context = {}) {
      for (const scene of scenes.values()) {
        scene.onStateLoaded(context);
      }
    }

    function getActiveSceneId() {
      return activeSceneId;
    }

    return {
      registerScene,
      setActiveScene,
      update,
      render,
      notifyStateLoaded,
      getActiveSceneId,
      getScene
    };
  }

  window.ButtonSceneManager = {
    createSceneManager
  };
})();