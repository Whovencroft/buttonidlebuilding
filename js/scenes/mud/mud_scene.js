/**
 * mud_scene.js — MUD Scene Entry Point
 *
 * Implements the scene contract (id, root, enter, exit, update, render, onStateLoaded)
 * and orchestrates the MUD subsystems: parser, room graph, combat, inventory, and UI.
 */
(() => {
  function create(api) {
    const { switchScene } = api;
    const root = document.getElementById('mudSceneRoot');

    // Sub-module references (initialized on first enter)
    let engine = null;
    let ui = null;
    let initialized = false;

    /**
     * Initialize the MUD engine and UI on first entry.
     * Loads room data, sets up the parser, and renders the initial state.
     */
    async function initialize(context) {
      if (initialized) return;

      // Ensure world data is loaded before creating engine
      if (!window.MudData.isReady()) {
        await window.MudData.load();
      }

      const savedState = context.state?.scenes?.mud || null;

      engine = window.MudEngine.create({ savedState });
      ui = window.MudUI.create({
        root,
        engine,
        onCommand: handleCommand
      });

      initialized = true;
    }

    /**
     * Process a player command string through the parser and engine.
     */
    function handleCommand(input) {
      if (!engine || !ui) return;

      const result = engine.execute(input);
      ui.appendOutput(result);
      ui.updateContext(engine.getContext());
    }

    async function enter(context) {
      await initialize(context);
      engine.resume(context.state?.scenes?.mud || null);
      ui.render();
      ui.focus();
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
      if (!ui) return;
      // Combat ticks and ambient updates are pushed via engine.update
    }

    function onStateLoaded(context) {
      if (!engine) return;
      engine.resume(context.state?.scenes?.mud || null);
    }

    /**
     * Returns the current MUD state for saving.
     */
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
