(() => {
  function create(api) {
    const { switchScene, isMarbleUnlocked } = api;

    const root = document.getElementById('titleSceneRoot');

    function render() {
      if (!root) return;

      const marbleUnlocked = isMarbleUnlocked();

      root.innerHTML = `
        <div class="title-screen">
          <div class="title-card">
            <h1 class="title-heading">Button That Learns<br>To Press Itself</h1>
            <p class="title-sub">An idle game about delegation, regret, and orbital mechanics.</p>

            <div class="title-actions">
              <button class="title-btn title-btn-primary" id="titleStartBtn">Start Game</button>
              ${marbleUnlocked
                ? `<button class="title-btn title-btn-marble" id="titleMarbleBtn">Play Marble Game</button>`
                : `<button class="title-btn title-btn-marble" disabled title="Complete the idle game to unlock">Marble Game (Locked)</button>`
              }
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
        switchScene('button_idle', { force: true });
      });

      root.querySelector('#titleMarbleBtn')?.addEventListener('click', () => {
        switchScene('marble');
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
