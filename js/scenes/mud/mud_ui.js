/**
 * mud_ui.js — MUD Terminal UI
 *
 * Handles the DOM-based terminal interface: scrollable output log,
 * command input field, command history, and context-sensitive quick-action buttons.
 */
(() => {
  const MAX_LOG_LINES = 500;
  const MAX_HISTORY = 50;

  function create({ root, engine, onCommand: initialOnCommand }) {
    if (!root) throw new Error('MudUI requires a root element.');

    let onCommand = initialOnCommand;

    let commandHistory = [];
    let historyIndex = -1;
    let logEl = null;
    let inputEl = null;
    let actionsEl = null;
    let hpBarEl = null;

    /**
     * Build the initial DOM structure for the MUD terminal.
     */
    function render() {
      root.innerHTML = `
        <div class="mud-terminal">
          <div class="mud-log" id="mudLog"></div>
          <div class="mud-status-bar" id="mudStatusBar">
            <span class="mud-hp" id="mudHpBar">HP: --/--</span>
            <span class="mud-room" id="mudRoomName">Unknown</span>
          </div>
          <div class="mud-actions" id="mudActions"></div>
          <div class="mud-input-row">
            <span class="mud-prompt">&gt;</span>
            <input type="text" class="mud-input" id="mudInput"
                   placeholder="Type a command..."
                   autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
          </div>
        </div>
      `;

      logEl = root.querySelector('#mudLog');
      inputEl = root.querySelector('#mudInput');
      actionsEl = root.querySelector('#mudActions');
      hpBarEl = root.querySelector('#mudHpBar');

      // Attach input handler
      inputEl.addEventListener('keydown', handleKeyDown);

      // Initial room display (skip if engine not yet available, e.g. during chargen)
      if (engine) {
        const result = engine.execute('look');
        appendOutput(result);
        updateContext(engine.getContext());
      }
    }

    /**
     * Handle keyboard input — Enter to submit, arrows for history.
     */
    function handleKeyDown(e) {
      if (e.key === 'Enter') {
        const value = inputEl.value.trim();
        if (!value) return;

        commandHistory.unshift(value);
        if (commandHistory.length > MAX_HISTORY) commandHistory.pop();
        historyIndex = -1;

        appendOutput([{ type: 'input', text: `> ${value}` }]);
        onCommand(value);
        inputEl.value = '';
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          inputEl.value = commandHistory[historyIndex];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          historyIndex--;
          inputEl.value = commandHistory[historyIndex];
        } else {
          historyIndex = -1;
          inputEl.value = '';
        }
      }
    }

    /**
     * Append output lines to the terminal log.
     * Each line is an object: { type: string, text: string }
     */
    function appendOutput(lines) {
      if (!logEl || !Array.isArray(lines)) return;

      for (const line of lines) {
        const div = document.createElement('div');
        div.className = `mud-line mud-line-${line.type || 'info'}`;
        div.textContent = line.text;
        logEl.appendChild(div);
      }

      while (logEl.children.length > MAX_LOG_LINES) {
        logEl.removeChild(logEl.firstChild);
      }

      // Defer scroll to after DOM repaint so the browser has measured new content
      requestAnimationFrame(() => {
        logEl.scrollTop = logEl.scrollHeight;
      });
    }

    /**
     * Update the context-sensitive quick-action buttons and status bar.
     * Context object shape:
     *   { hp, maxHp, roomName, exits[], roomMobs[], roomItems[],
     *     roomNpcs[], roomInteractables[], inCombat }
     */
    function updateContext(ctx) {
      if (!ctx) return;

      // Update HP bar
      if (hpBarEl) {
        hpBarEl.textContent = `HP: ${ctx.hp}/${ctx.maxHp}`;
      }

      // Update room name
      const roomNameEl = root.querySelector('#mudRoomName');
      if (roomNameEl) {
        roomNameEl.textContent = ctx.roomName;
      }

      if (!actionsEl) return;
      actionsEl.innerHTML = '';

      // --- Direction row ---
      const dirRow = document.createElement('div');
      dirRow.className = 'mud-dir-buttons';
      for (const dir of ctx.exits) {
        dirRow.appendChild(createActionButton(dirLabel(dir), dir));
      }
      actionsEl.appendChild(dirRow);

      // --- Context row ---
      const ctxRow = document.createElement('div');
      ctxRow.className = 'mud-ctx-buttons';

      // Always show Look and Inventory
      ctxRow.appendChild(createActionButton('Look', 'look'));
      ctxRow.appendChild(createActionButton('Inv', 'inventory'));

      if (ctx.inCombat) {
        // Combat mode: only flee
        ctxRow.appendChild(createActionButton('Flee', 'flee'));
      } else {
        // Attack buttons for hostile mobs
        for (const mobName of (ctx.roomMobs || [])) {
          ctxRow.appendChild(createActionButton(`Atk ${shorten(mobName)}`, `attack ${mobName}`));
        }
        // Talk buttons for NPCs
        for (const npcName of (ctx.roomNpcs || [])) {
          ctxRow.appendChild(createActionButton(`Talk ${shorten(npcName)}`, `talk ${npcName}`));
        }
        // Take buttons for items
        for (const itemName of (ctx.roomItems || [])) {
          ctxRow.appendChild(createActionButton(`Take ${shorten(itemName)}`, `take ${itemName}`));
        }
        // Examine buttons for interactables
        for (const intName of (ctx.roomInteractables || [])) {
          ctxRow.appendChild(createActionButton(`Exam ${shorten(intName)}`, `examine ${intName}`));
        }
      }

      actionsEl.appendChild(ctxRow);
    }

    /**
     * Shorten a name for button display (max 12 chars).
     */
    function shorten(name) {
      return name.length > 12 ? name.slice(0, 11) + '\u2026' : name;
    }

    /**
     * Create a quick-action button that injects a command.
     */
    function createActionButton(label, command) {
      const btn = document.createElement('button');
      btn.className = 'mud-action-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        appendOutput([{ type: 'input', text: `> ${command}` }]);
        onCommand(command);
      });
      return btn;
    }

    /**
     * Short label for direction buttons.
     */
    function dirLabel(dir) {
      const map = {
        north: 'N', south: 'S', east: 'E', west: 'W',
        up: 'U', down: 'D',
        northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW'
      };
      return map[dir] || dir;
    }

    function focus() {
      if (inputEl) inputEl.focus();
    }

    function blur() {
      if (inputEl) inputEl.blur();
    }

    /**
     * Poll for combat output from the engine (called by scene update loop).
     */
    function pollCombatOutput() {
      if (!engine) return;
      const lines = engine.flushCombatOutput();
      if (lines.length > 0) {
        appendOutput(lines);
        updateContext(engine.getContext());
      }
    }

    /**
     * Replace the command handler (used when transitioning from chargen to engine).
     */
    function setCommandHandler(handler) {
      onCommand = handler;
    }

    return {
      render,
      appendOutput,
      updateContext,
      focus,
      blur,
      pollCombatOutput,
      setCommandHandler
    };
  }

  window.MudUI = { create };
})();
