(() => {
  function create(api) {
    const { switchScene, isMarbleUnlocked, isIdleComplete } = api;

    const root = document.getElementById('titleSceneRoot');

    function render() {
      if (!root) return;

      const marbleUnlocked = isMarbleUnlocked();
      const idleComplete = typeof isIdleComplete === 'function' ? isIdleComplete() : false;

      // One-way progression: if idle is complete, title screen routes to marble
      // If marble were complete (future), it would route to MUD
      const primaryTarget = idleComplete ? 'marble' : 'button_idle';
      const primaryLabel = idleComplete ? 'Continue' : 'Start Game';
      const subtitle = idleComplete
        ? 'The button has achieved independence. A marble awaits.'
        : 'An idle game about delegation, regret, and orbital mechanics.';

      root.innerHTML = `
        <div class="title-screen">
          <div class="title-card">
            <h1 class="title-heading">Button That Learns<br>To Press Itself</h1>
            <p class="title-sub">${subtitle}</p>

            <div class="title-actions">
              <button class="title-btn title-btn-primary" id="titleStartBtn">${primaryLabel}</button>
            </div>

            <details class="title-debug">
              <summary>Debug Scene Access</summary>
              <div class="title-debug-btns">
                <button class="title-btn title-btn-debug" id="dbgButtonIdleBtn">→ Button Idle Scene</button>
                <button class="title-btn title-btn-debug" id="dbgMarbleBtn">→ Marble Scene (force)</button>
              </div>
            </details>
          </div>
        </div>
      `;

      root.querySelector('#titleStartBtn')?.addEventListener('click', () => {
        switchScene(primaryTarget, { force: true });
      });

      root.querySelector('#dbgButtonIdleBtn')?.addEventListener('click', () => {
        switchScene('button_idle', { force: true });
      });

      root.querySelector('#dbgMarbleBtn')?.addEventListener('click', () => {
        switchScene('marble', { force: true });
      });
    }

    function enter() {
      render();
    }

    function exit() {}
    function update() {}
    function onStateLoaded() { render(); }

    return {
      id: 'title',
      root,
      enter,
      exit,
      update,
      render,
      onStateLoaded
    };
  }

  window.TitleScene = { create };
})();
