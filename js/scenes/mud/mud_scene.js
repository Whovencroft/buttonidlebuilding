/**
 * mud_scene.js — MUD Scene Entry Point
 *
 * Orchestrates the full lifecycle:
 *   1. Auth (login/register) via MudAPI
 *   2. Load save from server (or fall through to chargen)
 *   3. Character creation (if no save)
 *   4. Engine + UI initialization
 *
 * Implements the scene contract: id, root, enter, exit, update, render,
 * onStateLoaded, getSaveSlice.
 */
(() => {
  function create(api) {
    const { switchScene } = api;
    const root = document.getElementById('mudSceneRoot');

    let engine = null;
    let ui = null;
    let chargen = null;
    let phase = 'idle'; // idle | auth | chargen | play
    let initialized = false;

    // ─── Lightweight Terminal ─────────────────────────────────────────────────
    // Minimal output/input used during auth and chargen (before full UI exists).

    let miniLog = null;
    let miniInput = null;

    /** Build a bare terminal for auth/chargen phases. */
    function renderMiniTerminal() {
      root.innerHTML = `
        <div class="mud-terminal">
          <div class="mud-log" id="mudLog"></div>
          <div class="mud-input-row">
            <span class="mud-prompt">&gt;</span>
            <input type="text" class="mud-input" id="mudInput"
                   placeholder="Type here..."
                   autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
          </div>
        </div>
      `;
      miniLog = root.querySelector('#mudLog');
      miniInput = root.querySelector('#mudInput');
      miniInput.addEventListener('keydown', handleMiniInput);
      miniInput.focus();
    }

    /** Append lines to the mini terminal and auto-scroll to bottom. */
    function miniOutput(lines) {
      if (!miniLog || !Array.isArray(lines)) return;
      for (const line of lines) {
        const div = document.createElement('div');
        div.className = `mud-line mud-line-${line.type || 'info'}`;
        div.textContent = line.text;
        miniLog.appendChild(div);
      }
      // Defer scroll to after DOM repaint so the browser has measured new content
      requestAnimationFrame(() => {
        miniLog.scrollTop = miniLog.scrollHeight;
      });
    }

    /** Handle Enter key in the mini terminal. */
    function handleMiniInput(e) {
      if (e.key !== 'Enter') return;
      const value = miniInput.value.trim();
      if (!value) return;
      miniInput.value = '';
      miniOutput([{ type: 'input', text: `> ${value}` }]);
      routeInput(value);
    }

    // ─── Input Router ────────────────────────────────────────────────────────

    /** Route input based on current phase. */
    function routeInput(text) {
      if (phase === 'auth') {
        handleAuthInput(text);
      } else if (phase === 'chargen') {
        handleChargenInput(text);
      }
    }

    // ─── Auth Phase ──────────────────────────────────────────────────────────

    let authStep = 'prompt'; // prompt | login_user | login_pass | reg_user | reg_pass | reg_confirm
    let authPending = { username: '', password: '' };

    /** Show the initial auth prompt. */
    function showAuthPrompt() {
      phase = 'auth';
      authStep = 'prompt';
      miniOutput([
        { type: 'room-name', text: '═══ WELCOME ═══' },
        { type: 'info', text: '' },
        { type: 'info', text: 'This world remembers those who name themselves.' },
        { type: 'info', text: '' },
        { type: 'items', text: '  1. Login    — Return to a saved character' },
        { type: 'items', text: '  2. Register — Create a new account' },
        { type: 'items', text: '  3. Guest    — Play without saving' },
        { type: 'info', text: '' },
        { type: 'success', text: 'Type 1, 2, or 3.' }
      ]);
    }

    /** Process auth-phase input through the login/register flow. */
    function handleAuthInput(text) {
      const input = text.trim().toLowerCase();

      switch (authStep) {
        case 'prompt':
          if (input === '1' || input === 'login' || input === 'log in' || input === 'signin' || input === 'sign in') {
            authStep = 'login_user';
            miniOutput([{ type: 'info', text: 'Username:' }]);
          } else if (input === '2' || input === 'register' || input === 'signup' || input === 'sign up' || input === 'create' || input === 'new') {
            authStep = 'reg_user';
            miniOutput([{ type: 'info', text: 'Choose a username (3-32 characters):' }]);
          } else if (input === '3' || input === 'guest' || input === 'skip' || input === 'play') {
            miniOutput([{ type: 'info', text: 'Playing as guest. Progress will not be saved to the server.' }]);
            startChargenOrPlay(null);
          } else {
            miniOutput([{ type: 'error', text: 'Type login, register, or guest (or 1, 2, 3).' }]);
          }
          break;

        case 'login_user':
          authPending.username = text.trim();
          authStep = 'login_pass';
          miniOutput([{ type: 'info', text: 'Password:' }]);
          if (miniInput) miniInput.type = 'password';
          break;

        case 'login_pass':
          authPending.password = text.trim();
          if (miniInput) miniInput.type = 'text';
          miniOutput([{ type: 'info', text: 'Logging in...' }]);
          doLogin();
          break;

        case 'reg_user':
          if (text.trim().length < 3 || text.trim().length > 32) {
            miniOutput([{ type: 'error', text: 'Username must be 3-32 characters.' }]);
            return;
          }
          authPending.username = text.trim();
          authStep = 'reg_pass';
          miniOutput([{ type: 'info', text: 'Choose a password (6+ characters):' }]);
          if (miniInput) miniInput.type = 'password';
          break;

        case 'reg_pass':
          if (text.trim().length < 6) {
            miniOutput([{ type: 'error', text: 'Password must be at least 6 characters.' }]);
            return;
          }
          authPending.password = text.trim();
          authStep = 'reg_confirm';
          miniOutput([{ type: 'info', text: 'Confirm password:' }]);
          break;

        case 'reg_confirm':
          if (text.trim() !== authPending.password) {
            miniOutput([{ type: 'error', text: 'Passwords do not match. Try again.' }]);
            authStep = 'reg_pass';
            miniOutput([{ type: 'info', text: 'Choose a password (6+ characters):' }]);
            return;
          }
          if (miniInput) miniInput.type = 'text';
          miniOutput([{ type: 'info', text: 'Creating account...' }]);
          doRegister();
          break;
      }
    }

    /** Attempt login via MudAPI. */
    async function doLogin() {
      try {
        const result = await window.MudAPI.login(authPending.username, authPending.password);
        miniOutput([{ type: 'success', text: `Welcome back, ${result.username}.` }]);
        authPending = { username: '', password: '' };
        await loadServerSave();
      } catch (err) {
        miniOutput([
          { type: 'error', text: `Login failed: ${err.message}` },
          { type: 'info', text: '' }
        ]);
        showAuthPrompt();
      }
    }

    /** Attempt registration via MudAPI. */
    async function doRegister() {
      try {
        const result = await window.MudAPI.register(authPending.username, authPending.password);
        miniOutput([{ type: 'success', text: `Account created. Welcome, ${result.username}.` }]);
        authPending = { username: '', password: '' };
        // New account — no save exists, go to chargen
        startChargenOrPlay(null);
      } catch (err) {
        miniOutput([
          { type: 'error', text: `Registration failed: ${err.message}` },
          { type: 'info', text: '' }
        ]);
        showAuthPrompt();
      }
    }

    /** Load save from server and decide: chargen or play. */
    async function loadServerSave() {
      try {
        const saveData = await window.MudAPI.loadSave();
        if (saveData && saveData.player) {
          miniOutput([{ type: 'info', text: 'Save data loaded. Entering the world...' }]);
          startChargenOrPlay(saveData);
        } else {
          miniOutput([{ type: 'info', text: 'No saved character found. Starting character creation...' }]);
          startChargenOrPlay(null);
        }
      } catch (err) {
        miniOutput([
          { type: 'error', text: `Could not load save: ${err.message}` },
          { type: 'info', text: 'Starting fresh...' }
        ]);
        startChargenOrPlay(null);
      }
    }

    // ─── Chargen / Play Transition ───────────────────────────────────────────

    /** Decide whether to run chargen or jump straight to the engine. */
    function startChargenOrPlay(savedState) {
      if (savedState && savedState.player) {
        // Have a save — skip chargen, go to play
        initEngine(savedState);
      } else {
        // No save — run chargen
        startChargen();
      }
    }

    /** Start the character creation flow. */
    function startChargen() {
      phase = 'chargen';
      chargen = window.MudChargen.create({
        onComplete: onChargenComplete,
        onOutput: miniOutput
      });
      miniOutput(chargen.getIntro());
    }

    /** Handle chargen input. */
    function handleChargenInput(text) {
      if (!chargen) return;
      chargen.processInput(text);
    }

    /** Called when chargen finishes — build engine with new player data. */
    function onChargenComplete(playerData) {
      chargen = null;
      miniOutput([
        { type: 'info', text: '' },
        { type: 'success', text: 'Your story begins...' },
        { type: 'info', text: '' }
      ]);
      // Build a save-like object from the fresh player data
      const freshState = { player: playerData };
      initEngine(freshState);
    }

    // ─── Engine Initialization ───────────────────────────────────────────────

    /** Create the engine and full UI, transition to play phase. */
    async function initEngine(savedState) {
      phase = 'play';

      // Ensure world data is loaded
      if (!window.MudData.isReady()) {
        await window.MudData.load();
      }

      engine = window.MudEngine.create({ savedState });
      ui = window.MudUI.create({
        root,
        engine,
        onCommand: handleCommand
      });

      ui.render();
      ui.focus();
      initialized = true;

      // Immediate save so new characters persist right away
      if (window.MudAPI?.isLoggedIn()) {
        window.MudAPI.storeSave(engine.getSaveSlice()).catch(() => {});
      }
    }

    /** Process a player command through the engine. */
    function handleCommand(input) {
      if (!engine || !ui) return;
      const result = engine.execute(input);
      ui.appendOutput(result);
      ui.updateContext(engine.getContext());
    }

    // ─── Scene Contract ──────────────────────────────────────────────────────

    async function enter(context) {
      if (phase === 'play' && engine && ui) {
        // Re-entering from another scene — just resume
        engine.resume(context.state?.scenes?.mud || null);
        ui.render();
        ui.focus();
        return;
      }

      // First entry — start the auth flow
      renderMiniTerminal();

      // Atmospheric intro — first thing every player sees
      miniOutput([
        { type: 'room-name', text: 'You are nowhere.' },
        { type: 'info', text: '' },
        { type: 'info', text: 'Something is very wrong.' },
        { type: 'info', text: '' },
        { type: 'info', text: 'There is no ground beneath your feet, no sky above.' },
        { type: 'info', text: 'Just an endless, formless dark — and the faintest pull,' },
        { type: 'info', text: 'like a thread tugging at the center of your chest.' },
        { type: 'info', text: '' }
      ]);

      if (window.MudAPI?.isLoggedIn()) {
        // Already logged in (token in localStorage) — try loading save
        miniOutput([
          { type: 'room-name', text: '═══ WELCOME BACK ═══' },
          { type: 'info', text: `Logged in as ${window.MudAPI.getUsername()}.` },
          { type: 'info', text: 'Loading save...' }
        ]);
        await loadServerSave();
      } else {
        showAuthPrompt();
      }
    }

    function exit() {
      if (ui) ui.blur();
    }

    function update(dt, context) {
      if (!engine) return;
      engine.update(dt);
      if (ui) ui.pollCombatOutput();
    }

    function render(context) {
      // Combat ticks and ambient updates are pushed via engine.update
    }

    function onStateLoaded(context) {
      if (!engine) return;
      engine.resume(context.state?.scenes?.mud || null);
    }

    /** Returns the current MUD state for the host app's save system. */
    function getSaveSlice() {
      if (!engine) return {};
      return engine.getSaveSlice();
    }

    return {
      id: 'mud',
      root,
      enter,
      exit,
      update,
      render,
      onStateLoaded,
      getSaveSlice
    };
  }

  window.MudScene = { create };
})();
