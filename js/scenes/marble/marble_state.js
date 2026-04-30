(() => {
  const FIXED_DT = 1 / 120;
  const MAX_PHYSICS_STEPS = 8;
  const MAX_REPLAY_FRAMES = 21600; // 3 minutes at 120fps — prevents GC pressure from unbounded arrays

  function create(api) {
    const { config, elements, getState, applyMarbleReward, switchScene, saveNow } = api;
    const root = elements.marbleSceneRoot;
    const replayStorageKey = `${config.meta.saveKey}.marble.lastReplay.v2`;

    let runtime = null;
    let input = null;
    let playback = null;
    let built = false;
    let levelStripSignature = '';

    const refs = {
      canvas: null,
      stageName: null,
      timer: null,
      best: null,
      overlay: null,
      overlayTitle: null,
      overlayBody: null,
      restartBtn: null,
      nextBtn: null,
      returnBtn: null,
      levelStrip: null
    };

    function marbleSlice() {
      return getState().scenes.marble;
    }

    function currentLevelId() {
      return marbleSlice().currentLevelId || 'fork_rejoin_test';
    }

    function buildDom() {
      if (built) return;
      built = true;
      root.innerHTML = `
        <div class="marble-stage">
          <canvas class="marble-canvas"></canvas>
          <div class="marble-hud">
            <div class="pill-line">
              <span class="pill">Stage: <strong data-marble-stage-name></strong></span>
              <span class="pill">Time: <strong data-marble-timer>0.00s</strong></span>
              <span class="pill">Best: <strong data-marble-best>--</strong></span>
            </div>
            <div class="marble-level-strip" data-marble-level-strip></div>
          </div>
          <div class="marble-help">Drag to roll • Tap to jump • R restart • Esc return</div>
          <div class="marble-overlay" data-marble-overlay hidden>
            <div class="marble-overlay-card">
              <div class="popup-title" data-marble-overlay-title>Marble Branch</div>
              <div class="small" data-marble-overlay-body></div>
              <div class="marble-overlay-actions">
                <button class="action-btn" data-marble-restart>Restart</button>
                <button class="action-btn" data-marble-next hidden>Next Level</button>
                <button class="action-btn" data-marble-return>Return to Button Scene</button>
              </div>
            </div>
          </div>
        </div>
      `;

      refs.canvas = root.querySelector('.marble-canvas');
      refs.stageName = root.querySelector('[data-marble-stage-name]');
      refs.timer = root.querySelector('[data-marble-timer]');
      refs.best = root.querySelector('[data-marble-best]');
      refs.overlay = root.querySelector('[data-marble-overlay]');
      refs.overlayTitle = root.querySelector('[data-marble-overlay-title]');
      refs.overlayBody = root.querySelector('[data-marble-overlay-body]');
      refs.restartBtn = root.querySelector('[data-marble-restart]');
      refs.nextBtn = root.querySelector('[data-marble-next]');
      refs.returnBtn = root.querySelector('[data-marble-return]');
      refs.levelStrip = root.querySelector('[data-marble-level-strip]');

      refs.restartBtn.addEventListener('click', () => restartRun());
      refs.nextBtn.addEventListener('click', () => goToNextLevel());
      refs.returnBtn.addEventListener('click', () => switchScene('button_idle', { force: true }));
      refs.levelStrip.addEventListener('click', (event) => {
        const button = event.target.closest('[data-marble-level]');
        if (!button || button.disabled) return;
        openLevel(button.dataset.marbleLevel);
      });
    }

    function ensureInput() {
      if (!input) input = window.MarbleInput.createInput();
    }

    function saveReplayToStorage(replayData) {
      localStorage.setItem(replayStorageKey, JSON.stringify(replayData));
      return replayData;
    }

    function loadReplayFromStorage() {
      try {
        const raw = localStorage.getItem(replayStorageKey);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (error) {
        console.error(error);
        return null;
      }
    }

    function serializeReplay(result = null) {
      if (!runtime?.replay) return null;
      return { ...runtime.replay, result: result || runtime.replay.result || null };
    }

    function getLevelStripSignature() {
      const slice = marbleSlice();
      const activeLevelId = runtime?.level?.id || '';
      const unlockedIds = window.MarbleLevels.getUnlockedLevelIds(slice.clearedLevels).join('|');
      return `${activeLevelId}::${unlockedIds}`;
    }

    function renderLevelStrip(force = false) {
      if (!refs.levelStrip) return;
      const signature = getLevelStripSignature();
      if (!force && signature === levelStripSignature) return;
      levelStripSignature = signature;
      const slice = marbleSlice();
      refs.levelStrip.innerHTML = window.MarbleLevels.LEVELS.map((level, index) => {
        const unlocked = window.MarbleLevels.isLevelUnlocked(slice.clearedLevels, level.id);
        const active = runtime && runtime.level.id === level.id;
        return `
          <button class="marble-level-btn ${active ? 'active' : ''}" data-marble-level="${level.id}" ${unlocked ? '' : 'disabled'} type="button" title="${level.name}">
            ${index + 1}. ${level.name}
          </button>
        `;
      }).join('');
    }

    function applyRuntimeLevel(levelRef, options = {}) {
      const level = typeof levelRef === 'string' ? window.MarbleLevels.getLevelById(levelRef) : levelRef;
      marbleSlice().currentLevelId = level.id;
      runtime = window.MarbleState.createRuntime(level);
      runtime.fixedStep = FIXED_DT;
      runtime.accumulator = 0;
      window._marbleRuntime = runtime; // debug
      playback = options.playReplayData ? { data: options.playReplayData, cursor: 0 } : null;
      if (playback?.data?.radii) {
        runtime.marble.renderRadius = playback.data.radii.renderRadius ?? runtime.marble.renderRadius;
        runtime.marble.collisionRadius = playback.data.radii.collisionRadius ?? runtime.marble.collisionRadius;
        runtime.marble.supportRadius = playback.data.radii.supportRadius ?? runtime.marble.supportRadius;
      }
      hideOverlay();
      renderLevelStrip(true);
      render();
      if (!options.silentSave) saveNow();
      return runtime;
    }

    function openLevel(levelRef, options = {}) {
      buildDom();
      ensureInput();
      return applyRuntimeLevel(levelRef, options);
    }

    function ensureRuntime() {
      if (!runtime) openLevel(currentLevelId(), { silentSave: true });
      else ensureInput();
    }

    function prepare() {
      buildDom();
      ensureRuntime();
      if (window.MarbleRenderer && typeof window.MarbleRenderer.prepare === 'function') {
        window.MarbleRenderer.prepare(runtime, refs.canvas);
      }
    }

    function restartRun(options = {}) {
      ensureRuntime();
      playback = options.playReplayData ? { data: options.playReplayData, cursor: 0 } : playback;
      window.MarbleState.restartRuntime(runtime);
      runtime.fixedStep = FIXED_DT;
      runtime.accumulator = 0;
      hideOverlay();
      renderLevelStrip(true);
      render();
      if (!options.silentSave) saveNow();
    }

    function hideOverlay() {
      refs.overlay.hidden = true;
      refs.nextBtn.hidden = true;
      refs.nextBtn.disabled = true;
    }

    function showOverlay(title, body, options = {}) {
      refs.overlayTitle.textContent = title;
      refs.overlayBody.textContent = body;
      refs.overlay.hidden = false;
      refs.nextBtn.hidden = !options.showNext;
      refs.nextBtn.disabled = !options.showNext;
    }

    function goToNextLevel() {
      const nextLevelId = window.MarbleLevels.getNextLevelId(currentLevelId());
      if (!nextLevelId) return;
      if (!window.MarbleLevels.isLevelUnlocked(marbleSlice().clearedLevels, nextLevelId)) return;
      openLevel(nextLevelId);
    }

    function persistCompletedReplay(result) {
      if (!runtime?.replay) return null;
      runtime.replay.result = result;
      return saveReplayToStorage(serializeReplay(result));
    }

    function applyCompletion(result) {
      const mainLevelIndex = window.MarbleLevels.getLevelIndex(result.levelId);
      const slice = marbleSlice();
      let nextLevelId = null;
      let nextWasUnlocked = false;

      if (mainLevelIndex >= 0) {
        nextLevelId = window.MarbleLevels.getNextLevelId(result.levelId);
        nextWasUnlocked = nextLevelId ? window.MarbleLevels.isLevelUnlocked(slice.clearedLevels, nextLevelId) : false;
      }

      const claimKey = result.reward?.claimKey;
      const alreadyClaimed = claimKey ? !!slice.rewardClaims[claimKey] : false;

      if (mainLevelIndex >= 0) {
        if (!alreadyClaimed) {
          applyMarbleReward(result);
        } else {
          if (!slice.clearedLevels.includes(result.levelId)) slice.clearedLevels.push(result.levelId);
          const existingBest = slice.bestTimes[result.levelId];
          if (!existingBest || result.bestTimeMs < existingBest) slice.bestTimes[result.levelId] = result.bestTimeMs;
        }
      }

      runtime.resultApplied = true;
      persistCompletedReplay(result);
      const nextIsUnlocked = nextLevelId ? window.MarbleLevels.isLevelUnlocked(slice.clearedLevels, nextLevelId) : false;
      renderLevelStrip(true);

      const rewardText = mainLevelIndex < 0
        ? 'Generated graph course complete. Replay saved for inspection.'
        : alreadyClaimed
          ? 'Reward already claimed. Best time updated if improved.'
          : `Reward granted: ${result.reward?.presses || 0} presses.`;

      const unlockText = nextLevelId && !nextWasUnlocked && nextIsUnlocked
        ? ` Level ${window.MarbleLevels.getLevelIndex(nextLevelId) + 1} unlocked.`
        : '';

      showOverlay(
        playback ? 'Replay Complete' : 'Stage Cleared',
        `${runtime.level.name} complete in ${(result.bestTimeMs / 1000).toFixed(2)}s. ${rewardText}${unlockText}`,
        { showNext: !playback && !!(nextLevelId && nextIsUnlocked) }
      );
    }

    function applyFailure(result) {
      persistCompletedReplay(result);
      let reasonText = 'Run failed. Restart and try again.';
      if (result.reason === 'fall') reasonText = 'You fell off the course. Restart and try again.';
      else if (String(result.reason).includes('hazard') || String(result.reason).includes('bar') || String(result.reason).includes('sweeper')) reasonText = 'A hazard caught the marble. Restart and try again.';
      showOverlay(playback ? 'Replay Failed' : 'Course Failed', reasonText);
    }

    function buildLiveStepInput() {
      return input.buildStepInput();
    }

    function buildPlaybackStepInput() {
      const frame = playback?.data?.frames?.[playback.cursor] || { x: 0, y: 0, j: 0 };
      playback.cursor += 1;
      return input.applyReplayFrame(frame);
    }

    function recordStepInput(stepInput) {
      if (playback || !runtime?.replay) return;
      if (runtime.replay.frames.length >= MAX_REPLAY_FRAMES) return; // cap to prevent GC pressure
      const ax = Math.round(stepInput.axis.x * 10000) / 10000;
      const ay = Math.round(stepInput.axis.y * 10000) / 10000;
      runtime.replay.frames.push({ x: ax, y: ay, j: stepInput.jumpPressed ? 1 : 0 });
    }

    function stepSimulation(dt) {
      const stepInput = playback ? buildPlaybackStepInput() : buildLiveStepInput();
      recordStepInput(stepInput);
      const result = window.MarblePhysics.updatePhysics(runtime, stepInput, dt);
      runtime.simTick += 1;
      return result;
    }

    function update(dt) {
      if (!runtime || !input) return;

      if (!playback && input.consumeBufferedPress('Escape')) {
        switchScene('button_idle', { force: true });
        input.endFrame();
        return;
      }
      if (!playback && input.consumeBufferedPress('KeyR')) {
        restartRun();
        input.endFrame();
        return;
      }
      if (!playback && input.consumeBufferedPress('KeyG')) {
        runtime.debug.showRouteGraph = !runtime.debug.showRouteGraph;
      }

      if (runtime.status === 'running') {
        runtime.accumulator = Math.min(runtime.accumulator + dt, runtime.fixedStep * MAX_PHYSICS_STEPS);
        let steps = 0;
        const _physStart = performance.now();
        while (runtime.accumulator >= runtime.fixedStep && steps < MAX_PHYSICS_STEPS) {
          const result = stepSimulation(runtime.fixedStep);
          runtime.accumulator -= runtime.fixedStep;
          steps += 1;

          if (result?.type === 'failed') {
            applyFailure(result);
            break;
          }

          if (result?.type === 'completed' && !runtime.resultApplied) {
            applyCompletion(result);
            break;
          }
        }
        const _physMs = performance.now() - _physStart;
        // Log physics cost every ~120 frames or when it spikes above 4ms
        if (!window._physFrameCount) window._physFrameCount = 0;
        window._physFrameCount++;
        if (window._physFrameCount % 120 === 0 || _physMs > 4) {
          console.log(`[Physics] steps=${steps} ms=${_physMs.toFixed(2)} tick=${runtime.simTick}`);
        }
      }

      render();
      input.endFrame();
    }

    function render() {
      if (!runtime || !refs.canvas) return;
      refs.stageName.textContent = runtime.level.name;
      refs.timer.textContent = `${(runtime.timerMs / 1000).toFixed(2)}s`;
      const bestMs = marbleSlice().bestTimes[runtime.level.id];
      refs.best.textContent = bestMs ? `${(bestMs / 1000).toFixed(2)}s` : '--';
      // Expose drag state to renderer for arrow overlay
      if (input) runtime.dragInput = input.getDragState();
      window.MarbleRenderer.render(runtime, refs.canvas);
    }

    function startReplay(replayData) {
      if (!replayData?.levelId) return null;
      openLevel(replayData.levelId, { silentSave: true, playReplayData: replayData });
      hideOverlay();
      return replayData;
    }

    function loadGeneratedSpec(spec) {
      const level = window.MarbleLevels.registerGeneratedLevel(window.MarbleLevels.generateCourseFromSpec(spec));
      openLevel(level, { silentSave: true });
      return level;
    }

    function exposeDebugApi() {
      window.MarbleSceneDebug = {
        listLevels() {
          return window.MarbleLevels.LEVELS.map((level) => ({ id: level.id, name: level.name, templates: level.templates, routeGraph: level.routeGraph }));
        },
        loadLevel(id) {
          const level = window.MarbleLevels.getLevelById(id);
          switchScene('marble', { force: true, silentSave: true, startLevelId: level.id });
          openLevel(level, { silentSave: true });
          return level;
        },
        generate(spec) {
          const level = loadGeneratedSpec(spec);
          switchScene('marble', { force: true, silentSave: true, startLevelId: level.id });
          return level;
        },
        exportLastReplay() {
          const replay = loadReplayFromStorage();
          return replay ? JSON.stringify(replay, null, 2) : null;
        },
        importReplay(replayInput) {
          const replay = typeof replayInput === 'string' ? JSON.parse(replayInput) : replayInput;
          switchScene('marble', { force: true, silentSave: true, startLevelId: replay.levelId, playReplayData: replay });
          startReplay(replay);
          return replay;
        },
        startSavedReplay() {
          const replay = loadReplayFromStorage();
          if (!replay) return null;
          switchScene('marble', { force: true, silentSave: true, startLevelId: replay.levelId, playReplayData: replay });
          startReplay(replay);
          return replay;
        },
        toggleRouteGraph(value) {
          if (!runtime) return false;
          runtime.debug.showRouteGraph = typeof value === 'boolean' ? value : !runtime.debug.showRouteGraph;
          return runtime.debug.showRouteGraph;
        }
      };
    }

    function onStateLoaded() {
      const slice = marbleSlice();
      if (!slice.currentLevelId) slice.currentLevelId = 'fork_rejoin_test';
      prepare();
      renderLevelStrip(true);
      render();
      exposeDebugApi();
    }

    return {
      id: 'marble',
      root,
      enter(context = {}) {
        prepare();
        ensureInput();
        input.attach(refs.canvas);

        if (!runtime || (context.startLevelId && context.startLevelId !== runtime.level.id)) {
          openLevel(context.startLevelId || currentLevelId(), { silentSave: true, playReplayData: context.playReplayData || null });
        } else if (context.playReplayData) {
          startReplay(context.playReplayData);
        }

        if (context.restartLevel) restartRun({ silentSave: true, playReplayData: context.playReplayData || null });
        hideOverlay();
        renderLevelStrip(true);
        render();
        exposeDebugApi();
      },
      exit() {
        if (input) input.detach();
      },
      update,
      render,
      onStateLoaded,
      prepare,
      startReplay,
      loadGeneratedSpec
    };
  }

  window.MarbleScene = { create };
})();