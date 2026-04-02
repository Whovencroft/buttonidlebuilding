(() => {
  const FALLBACK_SAVE_KEY = 'buttonLearnsToPressItselfSave';

  function resolveSaveKey() {
    try {
      const rawConfig = document.getElementById('gameData')?.textContent || '{}';
      const config = JSON.parse(rawConfig);
      return config?.meta?.saveKey || FALLBACK_SAVE_KEY;
    } catch (error) {
      return FALLBACK_SAVE_KEY;
    }
  }

  function normalizeHostedSave(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;

    if (!data.app || typeof data.app !== 'object' || Array.isArray(data.app)) {
      data.app = {};
    }

    if (!data.scenes || typeof data.scenes !== 'object' || Array.isArray(data.scenes)) {
      data.scenes = {};
    }

    if (!data.scenes.button_idle || typeof data.scenes.button_idle !== 'object' || Array.isArray(data.scenes.button_idle)) {
      data.scenes.button_idle = {};
    }

    if (!data.scenes.marble || typeof data.scenes.marble !== 'object' || Array.isArray(data.scenes.marble)) {
      data.scenes.marble = {};
    }

    if (typeof data.app.activeScene !== 'string' || !data.app.activeScene) {
      data.app.activeScene = 'button_idle';
    }

    return data;
  }

  function patchStorage(saveKey) {
    if (!window.localStorage) return;

    const originalGetItem = window.localStorage.getItem.bind(window.localStorage);
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);

    window.localStorage.getItem = (key) => {
      const raw = originalGetItem(key);
      if (key !== saveKey || !raw) return raw;

      try {
        const parsed = JSON.parse(raw);
        return JSON.stringify(normalizeHostedSave(parsed));
      } catch (error) {
        return raw;
      }
    };

    window.localStorage.setItem = (key, value) => {
      if (key !== saveKey || typeof value !== 'string') {
        return originalSetItem(key, value);
      }

      try {
        const parsed = JSON.parse(value);
        return originalSetItem(key, JSON.stringify(normalizeHostedSave(parsed)));
      } catch (error) {
        return originalSetItem(key, value);
      }
    };
  }

  function createSceneManager({ host, activeSceneId = null } = {}) {
    if (!host) {
      throw new Error('Scene manager requires a host element.');
    }

    const scenes = new Map();
    let currentSceneId = null;

    function getScene(id) {
      return scenes.get(id) || null;
    }

    function getSceneRoot(scene) {
      if (!scene) return null;
      if (scene.root instanceof HTMLElement) return scene.root;
      if (scene.rootSelector) return host.querySelector(scene.rootSelector);
      return host.querySelector(`[data-scene-id="${scene.id}"]`);
    }

    function showSceneRoot(scene) {
      const root = getSceneRoot(scene);
      if (!root) return;
      root.classList.add('active');
      root.setAttribute('aria-hidden', 'false');
    }

    function hideSceneRoot(scene) {
      const root = getSceneRoot(scene);
      if (!root) return;
      root.classList.remove('active');
      root.setAttribute('aria-hidden', 'true');
    }

    function registerScene(sceneDefinition) {
      if (!sceneDefinition || !sceneDefinition.id) {
        throw new Error('Scene definitions must include an id.');
      }

      scenes.set(sceneDefinition.id, {
        enter: () => undefined,
        exit: () => undefined,
        update: () => undefined,
        render: () => undefined,
        ...sceneDefinition
      });

      return getScene(sceneDefinition.id);
    }

    function setActiveScene(nextSceneId, context = {}) {
      if (!scenes.has(nextSceneId)) {
        throw new Error(`Unknown scene: ${nextSceneId}`);
      }

      if (currentSceneId === nextSceneId) {
        return getScene(nextSceneId);
      }

      const previousScene = getScene(currentSceneId);
      if (previousScene) {
        previousScene.exit({ from: currentSceneId, to: nextSceneId, host, ...context });
        hideSceneRoot(previousScene);
      }

      currentSceneId = nextSceneId;
      const nextScene = getScene(currentSceneId);
      showSceneRoot(nextScene);
      nextScene.enter({ from: previousScene?.id || null, to: currentSceneId, host, ...context });
      return nextScene;
    }

    function update(dt, context = {}) {
      const scene = getScene(currentSceneId);
      if (!scene) return;
      scene.update(dt, { host, sceneId: currentSceneId, ...context });
    }

    function render(context = {}) {
      const scene = getScene(currentSceneId);
      if (!scene) return;
      scene.render({ host, sceneId: currentSceneId, ...context });
    }

    function getActiveSceneId() {
      return currentSceneId;
    }

    if (activeSceneId) {
      currentSceneId = activeSceneId;
    }

    return {
      registerScene,
      setActiveScene,
      update,
      render,
      getScene,
      getActiveSceneId
    };
  }

  function bootstrapSceneHost() {
    const sceneHost = document.getElementById('sceneHost');
    if (!sceneHost) return null;

    const sceneManager = createSceneManager({
      host: sceneHost,
      activeSceneId: 'button_idle'
    });

    sceneManager.registerScene({
      id: 'button_idle',
      root: document.getElementById('buttonIdleSceneRoot')
    });

    sceneManager.registerScene({
      id: 'marble'
    });

    sceneManager.setActiveScene('button_idle');
    return sceneManager;
  }

  const saveKey = resolveSaveKey();
  patchStorage(saveKey);

  window.ButtonSceneManager = {
    createSceneManager,
    normalizeHostedSave,
    saveKey,
    bootstrap: bootstrapSceneHost
  };

  window.ButtonSceneHost = {
    manager: bootstrapSceneHost()
  };
})();