/**
 * mud_scene.js — MUD Scene Entry Point
 *
 * Implements the scene contract (id, root, enter, exit, update, render, onStateLoaded)
 * and orchestrates the MUD subsystems: chargen, parser, room graph, combat, inventory, and UI.
 *
 * On first entry with no save data, the character creation flow runs first.
 * Once chargen is complete (or if save data exists), the engine initializes normally.
 */
(() => {
  function create(api) {
    const { switchScene } = api;
    const root = document.getElementById('mudSceneRoot');

    // Sub-module references (initialized on first enter)
    let engine = null;
    let ui = null;
    let chargen = null;
    let initialized = false;
    let inChargen = false;

    /**
     * Initialize the MUD engine and UI on first entry.
     * If no save data exists, starts character creation first.
     */
    async function initialize(context) {
      if (initialized) return;

      // Ensure world data is loaded before creating engine
      if (!window.MudData.isReady()) {
        await window.MudData.load();
      }

      const savedState = context.state?.scenes?.mud || null;

      if (savedState && savedState.player) {
        // Existing save — skip chargen, go straight to engine
        startEngine(savedState);
      } else {
        // No save — start character creation
        startChargen();
      }

      initialized = true;
    }

    /**
     * Begin the character creation flow.
     * Creates a minimal UI with just the log and input, no engine yet.
     */
    function startChargen() {
      inChargen = true;

      // Create a temporary UI for chargen (no engine yet)
      ui = window.MudUI.create({
        root,
        engine: null,
        onCommand: handleChargenInput
      });
      ui.render();

      chargen = window.MudChargen.create({
        onComplete: finishChargen,
        onOutput: (lines) => ui.appendOutput(lines)
      });

      // Show the intro
      ui.appendOutput(chargen.getIntro());
      ui.focus();
    }

    /**
     * Handle input during character creation.
     */
    function handleChargenInput(input) {
      if (!chargen) return;
      chargen.processInput(input);
    }

    /**
     * Called when character creation is complete.
     * Initializes the engine with the new player data.
     */
    function finishChargen(playerData) {
      inChargen = false;
      chargen = null;

      // Build a fresh save state from chargen results
      const freshState = {
        player: playerData,
        defeatedMobs: [],
        takenItems: {}
      };

      startEngine(freshState);

      // Show arrival message
      const arrival = [
        { type: 'info', text: '' },
        { type: 'room-name', text: '═══ ENTERING THE NEXUS OF ECHOES ═══' },
        { type: 'info', text: '' },
        { type: 'info', text: 'The formless void solidifies. Stone beneath your feet. Air in your lungs.' },
        { type: 'info', text: 'You have arrived.' },
        { type: 'info', text: '' }
      ];
      ui.appendOutput(arrival);

      // Execute a 'look' to show the starting room
      const lookResult = engine.execute('look');
      ui.appendOutput(lookResult);
      ui.updateContext(engine.getContext());
    }

    /**
     * Initialize the engine and rebind the UI command handler.
     */
    function startEngine(savedState) {
      engine = window.MudEngine.create({ savedState });

      // If UI already exists (from chargen), rebind its command handler
      if (ui) {
        ui.setCommandHandler(handleCommand);
        ui.updateContext(engine.getContext());
      } else {
        ui = window.MudUI.create({
          root,
          engine,
          onCommand: handleCommand
        });
      }
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
      if (!inChargen && engine) {
        engine.resume(context.state?.scenes?.mud || null);
        ui.render();
        // Show current room on re-entry
        const lookResult = engine.execute('look');
        ui.appendOutput(lookResult);
        ui.updateContext(engine.getContext());
      }
      if (ui) ui.focus();
    }

    function exit() {
      if (ui) ui.blur();
    }

    function update(dt, context) {
      if (!engine || inChargen) return;
      engine.update(dt);
      if (ui) ui.pollCombatOutput();
    }

    function render(context) {
      // Combat ticks and ambient updates are pushed via engine.update
    }

    function onStateLoaded(context) {
      if (!engine || inChargen) return;
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
