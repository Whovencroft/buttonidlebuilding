(() => {
  const CONFIG = JSON.parse(document.getElementById('gameData').textContent);
  const $ = (id) => document.getElementById(id);
  const now = () => Date.now();

  function defaultState() {
    return normalizeHostedState({
      presses: 0,
      totalPressesEarned: 0,
      totalManualPresses: 0,
      totalGeneratedPresses: 0,
      regret: 0,
      metaPresses: 0,
      hyperPresses: 0,
      pressDerivatives: 0,
      autonomy: 0,
      debt: 0,
      larceny: 0,
      upgrades: Object.fromEntries(CONFIG.upgrades.map((u) => [u.id, 0])),
      activeModules: [],
      unlockedLayers: [],
      stats: {
        clicks: 0,
        realClicks: 0,
        fakeClicks: 0,
        popupsClosed: 0,
        prestiges: 0,
        dumbDowns: 0,
        imports: 0,
        exports: 0
      },
      session: {
        lastTick: now(),
        lastSave: 0,
        lastClick: now(),
        currentMessage: 0,
        buttonNameIndex: 0,
        liarsShown: 0,
        lastButtonJump: 0,
        fakeCrashCount: 0,
        offlineSeconds: 0,
        pointerHoldingButton: false,
        autonomySuppressedUntil: 0,
        autonomyEndingCooldownUntil: 0,
        lastFakeCrashAt: 0
      },
      ui: {
        activeTab: 'play',
        mainButtonPos: { x: 50, y: 50 },
        fakeButtons: [],
        popups: [],
        autonomyEndingOpen: false
      },
      flags: {
        introducedDebt: false,
        introducedFakeButtons: false,
        introducedLayers: false,
        autonomyEndingSeen: false
      },
      app: {
        activeScene: 'button_idle'
      },
      scenes: {
        button_idle: {},
        marble: {
          unlocked: true,
          bestTimes: {},
          clearedLevels: [],
          rewardClaims: {},
          unlockedFlags: []
        }
      }
    });
  }

  function normalizeHostedState(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return data;
    }

    if (!data.app || typeof data.app !== 'object' || Array.isArray(data.app)) {
      data.app = {};
    }

    if (typeof data.app.activeScene !== 'string' || !data.app.activeScene) {
      data.app.activeScene = 'button_idle';
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

    data.scenes.marble.unlocked = data.scenes.marble.unlocked !== false;
    data.scenes.marble.bestTimes = data.scenes.marble.bestTimes || {};
    data.scenes.marble.clearedLevels = Array.isArray(data.scenes.marble.clearedLevels) ? data.scenes.marble.clearedLevels : [];
    data.scenes.marble.rewardClaims = data.scenes.marble.rewardClaims || {};
    data.scenes.marble.unlockedFlags = Array.isArray(data.scenes.marble.unlockedFlags) ? data.scenes.marble.unlockedFlags : [];

    return data;
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue)
      ) {
        if (!targetValue || typeof targetValue !== 'object' || Array.isArray(targetValue)) {
          target[key] = {};
        }
        deepMerge(target[key], sourceValue);
      } else {
        target[key] = sourceValue;
      }
    }

    return target;
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(CONFIG.meta.saveKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return normalizeHostedState(deepMerge(defaultState(), parsed));
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  let state = loadGame() || defaultState();

  const elements = {
    tabs: $('tabs'),
    displayedPresses: $('displayedPresses'),
    truePressesSub: $('truePressesSub'),
    pps: $('pps'),
    manualValue: $('manualValue'),
    autonomyValue: $('autonomyValue'),
    autonomySub: $('autonomySub'),
    debtValue: $('debtValue'),
    debtSub: $('debtSub'),
    regretValue: $('regretValue'),
    layerSummary: $('layerSummary'),
    activeRulesValue: $('activeRulesValue'),
    comboSummary: $('comboSummary'),
    buttonModeLabel: $('buttonModeLabel'),
    buttonNote: $('buttonNote'),
    mainButton: $('mainButton'),
    buttonSandbox: $('buttonSandbox'),
    fakeButtonLayer: $('fakeButtonLayer'),
    popupZone: $('popupZone'),
    autonomyEndingModal: $('autonomyEndingModal'),
    endingBody: $('endingBody'),
    endingObserveBtn: $('endingObserveBtn'),
    endingReassertBtn: $('endingReassertBtn'),
    endingPrestigeBtn: $('endingPrestigeBtn'),
    dumbDownBtn: $('dumbDownBtn'),
    dumbDownFormula: $('dumbDownFormula'),
    dumbDownDesc: $('dumbDownDesc'),
    larcenyValue: $('larcenyValue'),
    upgradeList: $('upgradeList'),
    moduleList: $('moduleList'),
    activeLoadoutList: $('activeLoadoutList'),
    comboList: $('comboList'),
    layerList: $('layerList'),
    resourceList: $('resourceList'),
    formulaList: $('formulaList'),
    frameworkNotes: $('frameworkNotes'),
    configPreview: $('configPreview'),
    recentLog: $('recentLog'),
    messageBar: $('messageBar'),
    autosaveStatus: $('autosaveStatus'),
    clockStatus: $('clockStatus'),
    versionStatus: $('versionStatus'),
    automationSummary: $('automationSummary'),
    efficiencyValue: $('efficiencyValue'),
    formulaEfficiency: $('formulaEfficiency'),
    inflationValue: $('inflationValue'),
    formulaInflation: $('formulaInflation'),
    idleMeter: $('idleMeter'),
    idleStatus: $('idleStatus'),
    idleDesc: $('idleDesc'),
    loadoutSummary: $('loadoutSummary'),
    sessionStats: $('sessionStats'),
    saveField: $('saveField'),
    saveStatus: $('saveStatus'),
    saveBtn: $('saveBtn'),
    exportBtn: $('exportBtn'),
    importBtn: $('importBtn'),
    resetBtn: $('resetBtn'),
    fakeCrashBtn: $('fakeCrashBtn'),
    sceneHost: $('sceneHost'),
    playGameGrid: $('playGameGrid'),
    buttonIdleSceneRoot: $('buttonIdleSceneRoot'),
    marbleSceneRoot: $('marbleSceneRoot'),
    switchButtonSceneBtn: $('switchButtonSceneBtn'),
    switchMarbleSceneBtn: $('switchMarbleSceneBtn')
  };

  let sceneManager = null;
  let buttonScene = null;
  let marbleScene = null;
  let frameHandle = null;
  let saveHandle = null;
  const TEST_SCENE_SEQUENCE = ['button_idle', 'marble'];
  const DEBUG_TYPED_COMMAND = 'NEXTSCENE';
  let debugCommandBuffer = '';
  let debugCommandLastKeyAt = 0;
  let lastFrame = performance.now();

  function getState() {
    return state;
  }

  function saveGame(showStatus = false) {
    state = normalizeHostedState(state);
    state.session.lastTick = now();
    state.session.lastSave = now();

    localStorage.setItem(CONFIG.meta.saveKey, JSON.stringify(state));
    elements.autosaveStatus.textContent = `Autosave: ${new Date(state.session.lastSave).toLocaleTimeString()}`;

    if (showStatus) {
      elements.saveStatus.textContent = `Saved at ${new Date(state.session.lastSave).toLocaleTimeString()}. The button remains.`;
    }
  }

  function encodeSave() {
    return btoa(unescape(encodeURIComponent(JSON.stringify(normalizeHostedState(state)))));
  }

  function importEncodedState(encoded) {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    return normalizeHostedState(deepMerge(defaultState(), parsed));
  }

  function replaceState(nextState, options = {}) {
    state = normalizeHostedState(deepMerge(defaultState(), nextState));

    if (sceneManager) {
      sceneManager.notifyStateLoaded({ state });
      sceneManager.setActiveScene(state.app.activeScene, { state });
      sceneManager.render({ state });
    }

    renderShell();

    if (options.save) {
      saveGame(true);
    }
  }

  function exportSave() {
    elements.saveField.value = encodeSave();
    state.stats.exports += 1;
    saveGame();
    elements.saveStatus.textContent = 'Exported save string to the text box.';
  }

  function importSave() {
    try {
      const raw = elements.saveField.value.trim();
      if (!raw) {
        elements.saveStatus.textContent = 'Import failed. Save string is not valid.';
        return;
      }

      const imported = importEncodedState(raw);
      imported.stats.imports = (imported.stats.imports || 0) + 1;
      replaceState(imported, { save: true });
      elements.saveStatus.textContent = 'Import succeeded.';
    } catch (error) {
      console.error(error);
      elements.saveStatus.textContent = 'Import failed. Save string is not valid.';
    }
  }

  function hardReset() {
    replaceState(defaultState(), { save: true });
    elements.saveField.value = '';
    elements.saveStatus.textContent = 'Hard reset complete.';
  }

  function renderTabs() {
    elements.tabs.innerHTML = CONFIG.tabs.map((tab) => `
      <button class="tab-btn ${state.ui.activeTab === tab.id ? 'active' : ''}" data-tab-target="${tab.id}">${tab.label}</button>
    `).join('');

    Array.from(elements.tabs.querySelectorAll('.tab-btn')).forEach((btn) => {
      btn.addEventListener('click', () => {
        state.ui.activeTab = btn.dataset.tabTarget;
        document.querySelectorAll('.tab-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.dataset.tab === state.ui.activeTab);
        });
        renderTabs();
      });
    });
  }

  function renderShell() {
    renderTabs();

    const activeSceneId = sceneManager ? sceneManager.getActiveSceneId() : state.app.activeScene;
    const isMarble = activeSceneId === 'marble';

    elements.playGameGrid.classList.toggle('scene-marble-active', isMarble);
    elements.switchButtonSceneBtn.classList.toggle('active', activeSceneId === 'button_idle');
    elements.switchMarbleSceneBtn.classList.toggle('active', activeSceneId === 'marble');
  }

    function getNextSceneId(currentSceneId) {
    const index = TEST_SCENE_SEQUENCE.indexOf(currentSceneId);
    if (index === -1) return TEST_SCENE_SEQUENCE[0] || 'button_idle';
    return TEST_SCENE_SEQUENCE[(index + 1) % TEST_SCENE_SEQUENCE.length];
  }

  function advanceToNextSceneForTesting() {
    const currentSceneId = sceneManager ? sceneManager.getActiveSceneId() : state.app.activeScene;
    const nextSceneId = getNextSceneId(currentSceneId);

    state.app.activeScene = nextSceneId;
    sceneManager.setActiveScene(nextSceneId, { state });
    renderShell();
    saveGame();

    elements.saveStatus.textContent = `Debug scene advance: ${currentSceneId} → ${nextSceneId}`;
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      target.isContentEditable
    );
  }

  function handleDebugSceneCommand(event) {
    if (isTypingTarget(event.target)) return;

    const nowMs = performance.now();
    if (nowMs - debugCommandLastKeyAt > 1800) {
      debugCommandBuffer = '';
    }
    debugCommandLastKeyAt = nowMs;

    if (event.key === 'Escape') {
      debugCommandBuffer = '';
      return;
    }

    if (event.key.length !== 1) return;

    debugCommandBuffer += event.key.toUpperCase();

    if (!DEBUG_TYPED_COMMAND.startsWith(debugCommandBuffer)) {
      debugCommandBuffer = event.key.toUpperCase();
      if (!DEBUG_TYPED_COMMAND.startsWith(debugCommandBuffer)) {
        debugCommandBuffer = '';
        return;
      }
    }

    if (debugCommandBuffer === DEBUG_TYPED_COMMAND) {
      debugCommandBuffer = '';
      advanceToNextSceneForTesting();
    }
  }

  function applyMarbleReward(result) {
    const reward = result.reward || {};
    const marbleSlice = state.scenes.marble;

    if (result.levelId) {
      if (!marbleSlice.clearedLevels.includes(result.levelId)) {
        marbleSlice.clearedLevels.push(result.levelId);
      }

      const existingBest = marbleSlice.bestTimes[result.levelId];
      if (!existingBest || result.bestTimeMs < existingBest) {
        marbleSlice.bestTimes[result.levelId] = result.bestTimeMs;
      }
    }

    if (typeof reward.presses === 'number' && reward.presses > 0) {
      state.presses += reward.presses;
      state.totalPressesEarned += reward.presses;
    }

    if (Array.isArray(reward.unlocks)) {
      for (const unlock of reward.unlocks) {
        if (!marbleSlice.unlockedFlags.includes(unlock)) {
          marbleSlice.unlockedFlags.push(unlock);
        }
      }
    }

    if (typeof reward.claimKey === 'string' && reward.claimKey) {
      marbleSlice.rewardClaims[reward.claimKey] = true;
    }

    saveGame();
  }

  function switchScene(sceneId) {
    if (!sceneManager) return;
    state.app.activeScene = sceneId;
    sceneManager.setActiveScene(sceneId, { state });
    renderShell();
    saveGame();
  }

  const api = {
    config: CONFIG,
    elements,
    getState,
    saveNow: saveGame,
    renderShell,
    switchScene,
    applyMarbleReward,
    replaceState,
    encodeSave,
    importEncodedState,
    setSaveStatus(text) {
      elements.saveStatus.textContent = text;
    }
  };

  buttonScene = window.ButtonIdleScene.create(api);
  marbleScene = window.MarbleScene.create(api);

  sceneManager = window.ButtonSceneManager.createSceneManager({
    host: elements.sceneHost,
    onSceneChanged: ({ currentSceneId }) => {
      state.app.activeScene = currentSceneId;
      renderShell();
    }
  });

  sceneManager.registerScene(buttonScene);
  sceneManager.registerScene(marbleScene);

  function attachShellEvents() {
    elements.switchButtonSceneBtn.addEventListener('click', () => switchScene('button_idle'));
    elements.switchMarbleSceneBtn.addEventListener('click', () => switchScene('marble'));

    elements.saveBtn.addEventListener('click', () => saveGame(true));
    elements.exportBtn.addEventListener('click', exportSave);
    elements.importBtn.addEventListener('click', importSave);
    document.addEventListener('keydown', handleDebugSceneCommand);
    elements.resetBtn.addEventListener('click', hardReset);
    elements.fakeCrashBtn.addEventListener('click', () => {
      if (buttonScene && typeof buttonScene.simulateFakeCrash === 'function') {
        buttonScene.simulateFakeCrash();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        if (buttonScene && typeof buttonScene.applyOfflineProgress === 'function') {
          buttonScene.applyOfflineProgress();
        }
        lastFrame = performance.now();
        sceneManager.render({ state });
        renderShell();
      } else {
        saveGame();
      }
    });

    window.addEventListener('beforeunload', () => saveGame());
  }

  function frame(timestamp) {
    let dt = (timestamp - lastFrame) / 1000;
    lastFrame = timestamp;

    if (!Number.isFinite(dt) || dt <= 0) {
      dt = 1 / 60;
    }

    dt = Math.min(dt, 1);
    sceneManager.update(dt, { state });
    frameHandle = requestAnimationFrame(frame);
  }

  function init() {
    renderShell();
    sceneManager.notifyStateLoaded({ state });
    sceneManager.setActiveScene(state.app.activeScene, { state });
    sceneManager.render({ state });
    attachShellEvents();

    lastFrame = performance.now();
    frameHandle = requestAnimationFrame(frame);
    saveHandle = setInterval(() => saveGame(), 5000);
  }

  init();
})();