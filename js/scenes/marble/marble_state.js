(() => {
  const FIXED_DT = 1 / 60;
  const MAX_PHYSICS_STEPS = 8;

  function create(api) {
    const { config, elements, getState, applyMarbleReward, switchScene, saveNow } = api;
    const root = elements.marbleSceneRoot;

    let runtime = null;
    let input = null;
    let built = false;
    let levelStripSignature = '';

    const refs = {
      canvas: null,
      stageName: null,
      countdown: null,
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
      return marbleSlice().currentLevelId || 'training_ground';
    }

    function buildDom() {
      if (built) return;
      built = true;
      root.innerHTML = `
        <div class="marble-stage">
          <canvas class="marble-canvas"></canvas>
          <div class="marble-hud">
            <div class="marble-countdown" data-marble-countdown>60</div>
            <div class="marble-stage-label"><span data-marble-stage-name></span></div>
            <div class="marble-level-strip" data-marble-level-strip></div>
          </div>
          <div class="marble-help">Drag to roll • Hold to sprint • R restart • P pause timer • C coords • Esc return</div>
          <div class="marble-overlay" data-marble-overlay hidden>
            <div class="marble-overlay-card">
              <div class="popup-title" data-marble-overlay-title>Marble Branch</div>
              <div class="small" data-marble-overlay-body></div>
              <div class="marble-overlay-actions">
                <button class="action-btn" data-marble-restart>Restart</button>
                <button class="action-btn" data-marble-next hidden>Next Level</button>
                <button class="action-btn" data-marble-return>Return</button>
              </div>
            </div>
          </div>
        </div>
      `;

      refs.canvas = root.querySelector('.marble-canvas');
      refs.stageName = root.querySelector('[data-marble-stage-name]');
      refs.countdown = root.querySelector('[data-marble-countdown]');
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
      // Set secret tunnel reveal state based on cleared levels
      runtime.secretRevealed = window.MarbleLevels.isSecretRevealed(marbleSlice().clearedLevels);
      if (window.MarbleRenderer && window.MarbleRenderer.setSecretRevealed) {
        window.MarbleRenderer.setSecretRevealed(runtime.secretRevealed);
      }
      window._marbleRuntime = runtime; // debug
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
      // Pass carry-forward time to next level
      const carryMs = runtime?._carryForwardMs || 0;
      openLevel(nextLevelId);
      if (runtime && carryMs > 0) {
        runtime.bonusTimeMs = carryMs;
      }
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
      const nextIsUnlocked = nextLevelId ? window.MarbleLevels.isLevelUnlocked(slice.clearedLevels, nextLevelId) : false;
      renderLevelStrip(true);

      const rewardText = mainLevelIndex < 0
        ? 'Generated graph course complete.'
        : alreadyClaimed
          ? 'Best time updated if improved.'
          : '';

      const unlockText = nextLevelId && !nextWasUnlocked && nextIsUnlocked
        ? ` Level ${window.MarbleLevels.getLevelIndex(nextLevelId) + 1} unlocked.`
        : '';

      const remainingSec = (result.remainingMs || 0) / 1000;
      const carryText = remainingSec > 0 ? ` +${remainingSec.toFixed(1)}s banked for next level.` : '';
      const completionBody = `${runtime.level.name} cleared in ${(result.bestTimeMs / 1000).toFixed(2)}s.${carryText}${unlockText}${rewardText ? ' ' + rewardText : ''}`;
      // Store carry-forward time for next level
      runtime._carryForwardMs = result.remainingMs || 0;
      showOverlay('Stage Cleared', completionBody, { showNext: !!(nextLevelId && nextIsUnlocked) });
    }

    function applyPenalty(result) {
      // Brief visual feedback - flash the countdown red
      if (refs.countdown) {
        refs.countdown.classList.add('marble-countdown--penalty');
        setTimeout(() => refs.countdown.classList.remove('marble-countdown--penalty'), 600);
      }
      // No overlay - game continues
    }

    function applyFailure(result) {
      let reasonText = "Time's up! You ran out of time.";
      if (result.reason === 'timeout') reasonText = "Time's up! You ran out of time. Restart to try again.";
      showOverlay('Time Expired', reasonText);
    }

    function applySecretUnlock(result) {
      runtime.resultApplied = true;
      // Apply the secret unlock reward
      applyMarbleReward({
        type: 'secret_unlocked',
        levelId: result.levelId,
        reward: { presses: 0, unlocks: ['next_game_unlocked'], claimKey: 'secret_tunnel' }
      });
      showOverlay('\u2728 Secret Discovered \u2728', 'You found the secret passage through the mountain! A new world awaits...');
      saveNow();
    }

    function stepSimulation(dt) {
      const stepInput = input.buildStepInput();
      const result = window.MarblePhysics.updatePhysics(runtime, stepInput, dt);
      runtime.simTick += 1;
      return result;
    }

    function update(dt) {
      if (!runtime || !input) return;

      if (input.consumeBufferedPress('Escape')) {
        switchScene('button_idle', { force: true });
        input.endFrame();
        return;
      }
      if (input.consumeBufferedPress('KeyR')) {
        restartRun();
        input.endFrame();
        return;
      }
      if (input.consumeBufferedPress('KeyG')) {
        runtime.debug.showRouteGraph = !runtime.debug.showRouteGraph;
      }
      if (input.consumeBufferedPress('KeyC')) {
        runtime.debug.showCoords = !runtime.debug.showCoords;
      }
      if (input.consumeBufferedPress('KeyP')) {
        runtime.timerPaused = !runtime.timerPaused;
      }

      if (runtime.status === 'running') {
        runtime.accumulator = Math.min(runtime.accumulator + dt, runtime.fixedStep * MAX_PHYSICS_STEPS);
        let steps = 0;
        while (runtime.accumulator >= runtime.fixedStep && steps < MAX_PHYSICS_STEPS) {
          const result = stepSimulation(runtime.fixedStep);
          runtime.accumulator -= runtime.fixedStep;
          steps += 1;

          if (result?.type === 'penalized') {
            applyPenalty(result);
            break;
          }

          if (result?.type === 'failed') {
            applyFailure(result);
            break;
          }

          if (result?.type === 'completed' && !runtime.resultApplied) {
            applyCompletion(result);
            break;
          }

          if (result?.type === 'secret_unlocked' && !runtime.resultApplied) {
            applySecretUnlock(result);
            break;
          }
        }
        render();
      } else {
        // Throttle rendering to ~10fps when game is paused/failed/completed
        runtime._idleRenderAcc = (runtime._idleRenderAcc || 0) + dt;
        if (runtime._idleRenderAcc >= 0.1) {
          runtime._idleRenderAcc = 0;
          render();
        }
      }

      input.endFrame();
    }

    function render() {
      if (!runtime || !refs.canvas) return;
      refs.stageName.textContent = runtime.level.name;
      const baseTimeLimit = runtime.level.timeLimit ?? 60;
      if (baseTimeLimit === 0) {
        // Training level - no timer
        refs.countdown.textContent = '\u221E'; // infinity symbol
        refs.countdown.classList.remove('marble-countdown--urgent', 'marble-countdown--critical');
      } else {
        const totalTimeLimit = baseTimeLimit + (runtime.bonusTimeMs || 0) / 1000;
        const remaining = Math.max(0, totalTimeLimit - runtime.timerMs / 1000);
        const remainingCeil = Math.ceil(remaining);
        refs.countdown.textContent = remainingCeil;
        refs.countdown.classList.toggle('marble-countdown--urgent', remainingCeil <= 10);
        refs.countdown.classList.toggle('marble-countdown--critical', remainingCeil <= 5);
      }
      // Expose drag state to renderer for arrow overlay
      if (input) runtime.dragInput = input.getDragState();
      window.MarbleRenderer.render(runtime, refs.canvas);
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
        toggleRouteGraph(value) {
          if (!runtime) return false;
          runtime.debug.showRouteGraph = typeof value === 'boolean' ? value : !runtime.debug.showRouteGraph;
          return runtime.debug.showRouteGraph;
        },
        toggleCoords(value) {
          if (!runtime) return false;
          runtime.debug.showCoords = typeof value === 'boolean' ? value : !runtime.debug.showCoords;
          return runtime.debug.showCoords;
        }
      };
    }

    function onStateLoaded() {
      const slice = marbleSlice();
      if (!slice.currentLevelId) slice.currentLevelId = 'training_ground';
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
          openLevel(context.startLevelId || currentLevelId(), { silentSave: true });
        }

        if (context.restartLevel) restartRun({ silentSave: true });
        hideOverlay();
        renderLevelStrip(true);
        render();
        exposeDebugApi();
      },
      exit() {
        if (input) input.detach();
        // Release GPU resources when leaving the marble scene
        if (window.MarbleRenderer && typeof window.MarbleRenderer.dispose === 'function') {
          window.MarbleRenderer.dispose();
        }
      },
      update,
      render,
      onStateLoaded,
      prepare,
      loadGeneratedSpec
    };
  }

  window.MarbleScene = { create };
})();
