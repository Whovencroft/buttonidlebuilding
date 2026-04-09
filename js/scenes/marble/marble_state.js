(() => {
  function create(api) {
    const { elements, getState, applyMarbleReward, switchScene, saveNow } = api;

    const root = elements.marbleSceneRoot;
    let runtime = null;
    let input = null;
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
      return marbleSlice().currentLevelId || 'training_run';
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

          <div class="marble-help">WASD / Arrow Keys move • Space jump • Blue above you • Gold below you • R restart • Esc return</div>

          <div class="marble-overlay" data-marble-overlay hidden>
            <div class="marble-overlay-card">
              <div class="popup-title" data-marble-overlay-title>Marble Test</div>
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
        if (!button) return;
        if (button.disabled) return;
        loadLevel(button.dataset.marbleLevel);
      });
    }

    function ensureInput() {
      if (!input) {
        input = window.MarbleInput.createInput();
      }
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
      if (!force && signature === levelStripSignature) {
        return;
      }

      levelStripSignature = signature;

      const slice = marbleSlice();

      refs.levelStrip.innerHTML = window.MarbleLevels.LEVELS.map((level, index) => {
        const unlocked = window.MarbleLevels.isLevelUnlocked(slice.clearedLevels, level.id);
        const active = runtime && runtime.level.id === level.id;

        return `
          <button
            class="marble-level-btn ${active ? 'active' : ''}"
            data-marble-level="${level.id}"
            ${unlocked ? '' : 'disabled'}
            title="${level.name}"
            type="button"
          >
            ${index + 1}. ${level.name}
          </button>
        `;
      }).join('');
    }

    function loadLevel(levelId, options = {}) {
      buildDom();
      ensureInput();

      const level = window.MarbleLevels.getLevelById(levelId);
      marbleSlice().currentLevelId = level.id;
      runtime = window.MarbleState.createRuntime(level.id);

      hideOverlay();
      renderLevelStrip(true);
      render();

      if (!options.silentSave) {
        saveNow();
      }

      return runtime;
    }

    function ensureRuntime() {
      if (!runtime) {
        loadLevel(currentLevelId(), { silentSave: true });
      } else {
        ensureInput();
      }
    }

    function prepare(source = elements.sceneHost) {
      buildDom();
      ensureRuntime();

      if (window.MarbleRenderer && typeof window.MarbleRenderer.prepare === 'function') {
        window.MarbleRenderer.prepare(runtime, source);
      }
    }

    function restartRun(options = {}) {
      ensureRuntime();
      window.MarbleState.restartRuntime(runtime);
      hideOverlay();
      renderLevelStrip(true);
      render();

      if (!options.silentSave) {
        saveNow();
      }
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

      loadLevel(nextLevelId);
    }

    function applyCompletion(result) {
      const slice = marbleSlice();
      const nextLevelId = window.MarbleLevels.getNextLevelId(result.levelId);
      const nextWasUnlocked = nextLevelId
        ? window.MarbleLevels.isLevelUnlocked(slice.clearedLevels, nextLevelId)
        : false;

      const claimKey = result.reward?.claimKey;
      const alreadyClaimed = claimKey ? !!slice.rewardClaims[claimKey] : false;

      if (!alreadyClaimed) {
        applyMarbleReward(result);
      } else {
        if (!slice.clearedLevels.includes(result.levelId)) {
          slice.clearedLevels.push(result.levelId);
        }

        const existingBest = slice.bestTimes[result.levelId];
        if (!existingBest || result.bestTimeMs < existingBest) {
          slice.bestTimes[result.levelId] = result.bestTimeMs;
        }
      }

      runtime.resultApplied = true;

      const nextIsUnlocked = nextLevelId
        ? window.MarbleLevels.isLevelUnlocked(slice.clearedLevels, nextLevelId)
        : false;

      renderLevelStrip(true);

      const rewardText = alreadyClaimed
        ? 'Reward already claimed. Best time updated if improved.'
        : `Reward granted: ${result.reward?.presses || 0} presses.`;

      const unlockText =
        nextLevelId && !nextWasUnlocked && nextIsUnlocked
          ? ` Level ${window.MarbleLevels.getLevelIndex(nextLevelId) + 1} unlocked.`
          : '';

      showOverlay(
        'Stage Cleared',
        `${runtime.level.name} complete in ${(result.bestTimeMs / 1000).toFixed(2)}s. ${rewardText}${unlockText}`,
        { showNext: !!(nextLevelId && nextIsUnlocked) }
      );
    }

    function update(dt) {
      if (!runtime || !input) return;

      if (input.consumePressed('Escape')) {
        switchScene('button_idle', { force: true });
        input.endFrame();
        return;
      }

      if (input.consumePressed('KeyR')) {
        restartRun();
        input.endFrame();
        return;
      }

      if (runtime.status === 'running') {
        const result = window.MarblePhysics.updatePhysics(
          runtime,
          {
            axis: input.getAxis(),
            jumpPressed: input.consumePressed('Space')
          },
          dt
        );

        if (result?.type === 'failed') {
          let reasonText = 'Run failed. Restart and try again.';

          if (result.reason === 'fall') {
            reasonText = 'You fell off the course. Restart and try again.';
          } else if (result.reason === 'hazard') {
            reasonText = 'You hit a hazard. Restart and try again.';
          }

          showOverlay('Course Failed', reasonText);
        } else if (result?.type === 'completed' && !runtime.resultApplied) {
          applyCompletion(result);
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

      window.MarbleRenderer.render(runtime, refs.canvas);
    }

    function onStateLoaded() {
      const slice = marbleSlice();

      if (!slice.currentLevelId) {
        slice.currentLevelId = 'training_run';
      }

      prepare(elements.sceneHost);
      renderLevelStrip(true);
      render();
    }

    return {
      id: 'marble',
      root,

      enter(context = {}) {
        prepare(elements.sceneHost);
        ensureInput();
        input.attach();

        if (!runtime || (context.startLevelId && context.startLevelId !== runtime.level.id)) {
          loadLevel(context.startLevelId || currentLevelId(), { silentSave: true });
        }

        if (context.restartLevel) {
          restartRun({ silentSave: true });
        }

        hideOverlay();
        renderLevelStrip(true);
        render();
      },

      exit() {
        if (input) {
          input.detach();
        }
      },

      update,
      render,
      onStateLoaded,
      prepare
    };
  }

  window.MarbleScene = {
    create
  };
})();