(() => {
  function create(api) {
    const { elements, getState, applyMarbleReward, switchScene, saveNow } = api;

    const root = elements.marbleSceneRoot;
    let runtime = null;
    let input = null;
    let built = false;

    const refs = {
      canvas: null,
      stageName: null,
      timer: null,
      best: null,
      overlay: null,
      overlayTitle: null,
      overlayBody: null,
      restartBtn: null,
      returnBtn: null
    };

    function marbleSlice() {
      return getState().scenes.marble;
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
          </div>

          <div class="marble-help">WASD / Arrow Keys to move • R restart • Esc return</div>

          <div class="marble-overlay" data-marble-overlay hidden>
            <div class="marble-overlay-card">
              <div class="popup-title" data-marble-overlay-title>Marble Test</div>
              <div class="small" data-marble-overlay-body></div>
              <div class="marble-overlay-actions">
                <button class="action-btn" data-marble-restart>Restart</button>
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
      refs.returnBtn = root.querySelector('[data-marble-return]');

      refs.restartBtn.addEventListener('click', restartRun);
      refs.returnBtn.addEventListener('click', () => switchScene('button_idle'));
    }

    function ensureRuntime() {
      if (!runtime) {
        runtime = window.MarbleState.createRuntime('training_run');
      }
      if (!input) {
        input = window.MarbleInput.createInput();
      }
    }

    function warmVisibleCanvas() {
      if (!runtime || !refs.canvas) return;
      if (!window.MarbleRenderer || typeof window.MarbleRenderer.prepare !== 'function') return;

      window.MarbleRenderer.prepare(runtime, refs.canvas);

      requestAnimationFrame(() => {
        if (!runtime || !refs.canvas) return;
        window.MarbleRenderer.prepare(runtime, refs.canvas);
      });
    }

    function restartRun() {
      ensureRuntime();
      window.MarbleState.restartRuntime(runtime);
      hideOverlay();
      render();
      saveNow();
    }

    function hideOverlay() {
      refs.overlay.hidden = true;
    }

    function showOverlay(title, body) {
      refs.overlayTitle.textContent = title;
      refs.overlayBody.textContent = body;
      refs.overlay.hidden = false;
    }

    function applyCompletion(result) {
      const slice = marbleSlice();

      if (!slice.clearedLevels.includes(result.levelId)) {
        slice.clearedLevels.push(result.levelId);
      }

      const existingBest = slice.bestTimes[result.levelId];
      if (!existingBest || result.bestTimeMs < existingBest) {
        slice.bestTimes[result.levelId] = result.bestTimeMs;
      }

      const claimKey = result.reward?.claimKey;
      const alreadyClaimed = claimKey ? !!slice.rewardClaims[claimKey] : false;

      if (!alreadyClaimed) {
        applyMarbleReward(result);
      }

      runtime.resultApplied = true;

      const rewardText = alreadyClaimed
        ? 'Reward already claimed. Best time updated if improved.'
        : `Reward granted: ${result.reward?.presses || 0} presses.`;

      showOverlay(
        'Stage Cleared',
        `${runtime.level.name} complete in ${(result.bestTimeMs / 1000).toFixed(2)}s. ${rewardText}`
      );
    }

    function update(dt) {
      if (!runtime || !input) return;

      if (input.consumePressed('Escape')) {
        switchScene('button_idle');
        input.endFrame();
        return;
      }

      if (input.consumePressed('KeyR')) {
        restartRun();
        input.endFrame();
        return;
      }

      if (runtime.status === 'running') {
        const result = window.MarblePhysics.updatePhysics(runtime, input.getAxis(), dt);

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
      ensureRuntime();
      buildDom();
      render();
    }

    return {
      id: 'marble',
      root,

      enter() {
        buildDom();
        ensureRuntime();
        input.attach();
        hideOverlay();
        warmVisibleCanvas();
        render();
      },

      exit() {
        if (input) {
          input.detach();
        }
      },

      update,
      render,
      onStateLoaded
    };
  }

  window.MarbleScene = {
    create
  };
})();