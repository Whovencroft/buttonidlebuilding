/**
 * mud_ui.js — MUD Terminal UI (v2)
 *
 * Handles the DOM-based terminal interface with:
 *   - Scrollable output log with line-type styling
 *   - Command input with Tab-completion (context-aware)
 *   - Command history (arrow keys) persisted to localStorage
 *   - Command queue (queued commands execute on next combat tick)
 *   - Enhanced context-sensitive quick-action buttons
 *   - Status bar with HP, Focus, Momentum, Stance
 */
(() => {
  'use strict';

  const MAX_LOG_LINES = 500;
  const MAX_HISTORY = 100;
  const HISTORY_KEY = 'mud_command_history';

  function create({ root, engine, onCommand: initialOnCommand }) {
    if (!root) throw new Error('MudUI requires a root element.');

    let onCommand = initialOnCommand;
    let commandHistory = loadHistory();
    let historyIndex = -1;
    let logEl = null;
    let inputEl = null;
    let actionsEl = null;
    let statusBarEl = null;

    // Tab-completion state
    let tabCandidates = [];
    let tabIndex = -1;
    let tabPrefix = '';

    // Command queue (for combat)
    let commandQueue = [];

    // ─── DOM Construction ─────────────────────────────────────────────────

    /**
     * Build the initial DOM structure for the MUD terminal.
     */
    function render() {
      root.innerHTML = `
        <div class="mud-terminal">
          <div class="mud-log" id="mudLog"></div>
          <div class="mud-status-bar" id="mudStatusBar" role="status" aria-label="Player status">
            <span class="mud-hp" id="mudHpBar" aria-label="Hit points">HP: --/--</span>
            <span class="mud-focus" id="mudFocusBar" aria-label="Focus">Focus: --/--</span>
            <span class="mud-power" id="mudPowerBar" aria-label="Power level">Power: --</span>
            <span class="mud-stance" id="mudStance" aria-label="Stance"></span>
            <span class="mud-momentum" id="mudMomentum" aria-label="Momentum"></span>
            <span class="mud-room" id="mudRoomName" aria-label="Current room">Unknown</span>
          </div>
          <div class="mud-actions" id="mudActions"></div>
          <div class="mud-input-row">
            <span class="mud-prompt">&gt;</span>
            <input type="text" class="mud-input" id="mudInput"
                   placeholder="Type a command... (Tab to complete)"
                   aria-label="Command input"
                   autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
          </div>
        </div>
      `;

      logEl = root.querySelector('#mudLog');
      inputEl = root.querySelector('#mudInput');
      actionsEl = root.querySelector('#mudActions');
      statusBarEl = root.querySelector('#mudStatusBar');

      // Attach input handler
      inputEl.addEventListener('keydown', handleKeyDown);

      // Initial room display (skip if engine not yet available, e.g. during chargen)
      if (engine) {
        const result = engine.execute('look');
        appendOutput(result);
        updateContext(engine.getContext());
      }
    }

    // ─── Input Handling ───────────────────────────────────────────────────

    /**
     * Handle keyboard input:
     *   Enter  — submit command (or queue in combat)
     *   Tab    — cycle through completions
     *   Up/Down — command history navigation
     *   Escape — clear input / cancel tab-completion
     */
    function handleKeyDown(e) {
      if (e.key === 'Enter') {
        const value = inputEl.value.trim();
        if (!value) return;

        // Store in history
        addToHistory(value);
        historyIndex = -1;
        resetTabState();

        // Display the command in the log
        appendOutput([{ type: 'input', text: `> ${value}` }]);

        // Execute or queue
        const ctx = engine?.getContext();
        if (ctx?.inCombat && commandQueue.length > 0) {
          // If already queued, add to queue
          commandQueue.push(value);
          appendOutput([{ type: 'info', text: `[Queued: ${value}]` }]);
        } else {
          onCommand(value);
        }

        inputEl.value = '';

      } else if (e.key === 'Tab') {
        e.preventDefault();
        handleTabCompletion();

      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          inputEl.value = commandHistory[historyIndex];
        }
        resetTabState();

      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          historyIndex--;
          inputEl.value = commandHistory[historyIndex];
        } else {
          historyIndex = -1;
          inputEl.value = '';
        }
        resetTabState();

      } else if (e.key === 'Escape') {
        if (tabCandidates.length > 0) {
          resetTabState();
          inputEl.value = tabPrefix;
        } else {
          inputEl.value = '';
        }

      } else {
        // Any other key resets tab state
        resetTabState();
      }
    }

    // ─── Tab Completion ───────────────────────────────────────────────────

    /**
     * Context-aware tab completion.
     * Sources: registered commands, ability names, mob names, item names, directions.
     */
    function handleTabCompletion() {
      const currentValue = inputEl.value.toLowerCase().trim();

      // If we're already cycling, advance to next candidate
      if (tabCandidates.length > 0 && tabPrefix === currentValue.slice(0, tabPrefix.length)) {
        tabIndex = (tabIndex + 1) % tabCandidates.length;
        inputEl.value = tabCandidates[tabIndex];
        return;
      }

      // Build new candidate list
      tabPrefix = currentValue;
      tabCandidates = [];

      if (!tabPrefix) return;

      const ctx = engine?.getContext();
      const tokens = tabPrefix.split(/\s+/);

      if (tokens.length <= 1) {
        // Completing the verb — match against registered commands
        const allNames = window.MudCommands?.getAllNames() || [];
        tabCandidates = allNames.filter(n => n.startsWith(tabPrefix));

        // Also include direction shortcuts
        const directions = window.MudParser?.getDirectionNames() || [];
        tabCandidates.push(...directions.filter(d => d.startsWith(tabPrefix)));
      } else {
        // Completing the target — context-aware
        const verb = tokens[0];
        const partial = tokens.slice(1).join(' ');

        if (verb === 'attack' || verb === 'kill' || verb === 'hit' || verb === 'fight') {
          // Complete mob names
          tabCandidates = (ctx?.roomMobs || [])
            .filter(n => n.toLowerCase().startsWith(partial))
            .map(n => `${verb} ${n.toLowerCase()}`);

        } else if (verb === 'talk' || verb === 'ask' || verb === 'chat') {
          // Complete NPC names
          tabCandidates = (ctx?.roomNpcs || [])
            .filter(n => n.toLowerCase().startsWith(partial))
            .map(n => `${verb} ${n.toLowerCase()}`);

        } else if (verb === 'take' || verb === 'get' || verb === 'grab') {
          // Complete item names
          tabCandidates = (ctx?.roomItems || [])
            .filter(n => n.toLowerCase().startsWith(partial))
            .map(n => `${verb} ${n.toLowerCase()}`);

        } else if (verb === 'go' || verb === 'walk' || verb === 'move') {
          // Complete directions
          const allDirs = ctx?.exits || [];
          tabCandidates = allDirs
            .filter(d => d.startsWith(partial))
            .map(d => `${verb} ${d}`);

        } else if (ctx?.inCombat) {
          // In combat, complete ability names
          const abilities = (ctx?.abilities || []).map(id => {
            const def = window.MudAbilities?.getAbilityById(id);
            return def?.name?.toLowerCase() || '';
          }).filter(n => n && n.startsWith(partial));
          tabCandidates = abilities;
        }
      }

      // Deduplicate and sort
      tabCandidates = [...new Set(tabCandidates)].sort();

      if (tabCandidates.length === 1) {
        // Single match — auto-complete
        inputEl.value = tabCandidates[0];
        resetTabState();
      } else if (tabCandidates.length > 1) {
        // Multiple matches — show first, display candidates
        tabIndex = 0;
        inputEl.value = tabCandidates[0];
        appendOutput([{
          type: 'info',
          text: `[Completions: ${tabCandidates.slice(0, 10).join(', ')}${tabCandidates.length > 10 ? '...' : ''}]`
        }]);
      }
    }

    /** Reset tab-completion state. */
    function resetTabState() {
      tabCandidates = [];
      tabIndex = -1;
      tabPrefix = '';
    }

    // ─── Command History (Persistent) ─────────────────────────────────────

    /** Load command history from localStorage. */
    function loadHistory() {
      try {
        const stored = localStorage.getItem(HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch { return []; }
    }

    /** Save command history to localStorage. */
    function saveHistory() {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(commandHistory.slice(0, MAX_HISTORY)));
      } catch { /* localStorage full or unavailable */ }
    }

    /** Add a command to history (deduplicates consecutive repeats). */
    function addToHistory(cmd) {
      if (commandHistory[0] === cmd) return; // Don't store consecutive dupes
      commandHistory.unshift(cmd);
      if (commandHistory.length > MAX_HISTORY) commandHistory.pop();
      saveHistory();
    }

    // ─── Command Queue ────────────────────────────────────────────────────

    /**
     * Process one queued command. Called by the scene update loop
     * after each combat tick resolves.
     * @returns {boolean} True if a command was dequeued and executed
     */
    function processQueue() {
      if (commandQueue.length === 0) return false;
      const cmd = commandQueue.shift();
      appendOutput([{ type: 'input', text: `> ${cmd} [queued]` }]);
      onCommand(cmd);
      return true;
    }

    /** Clear the command queue (e.g., on combat end). */
    function clearQueue() {
      commandQueue = [];
    }

    // ─── Output ───────────────────────────────────────────────────────────

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

      // Trim old lines
      while (logEl.children.length > MAX_LOG_LINES) {
        logEl.removeChild(logEl.firstChild);
      }

      // Scroll to bottom
      requestAnimationFrame(() => {
        logEl.scrollTop = logEl.scrollHeight;
      });
    }

    // ─── Context & Quick Actions ──────────────────────────────────────────

    /**
     * Update the context-sensitive quick-action buttons and status bar.
     * Enhanced: shows stance, momentum, abilities in combat, rest/wake.
     */
    function updateContext(ctx) {
      if (!ctx) return;

      // Update status bar — game-stat: current/max format, monospaced
      const hpEl = root.querySelector('#mudHpBar');
      const focusEl = root.querySelector('#mudFocusBar');
      const powerEl = root.querySelector('#mudPowerBar');
      const stanceEl = root.querySelector('#mudStance');
      const momentumEl = root.querySelector('#mudMomentum');
      const roomEl = root.querySelector('#mudRoomName');

      if (hpEl) hpEl.textContent = `HP: ${ctx.hp}/${ctx.maxHp}`;
      if (focusEl) focusEl.textContent = `Focus: ${ctx.focus ?? '--'}/${ctx.maxFocus ?? '--'}`;
      if (powerEl) powerEl.textContent = `Power: ${ctx.power ?? '--'}`;
      if (stanceEl) {
        const s = ctx.stance;
        stanceEl.textContent = s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
        stanceEl.style.display = s ? '' : 'none';
      }
      if (momentumEl) {
        const m = ctx.momentum;
        if (m != null) {
          const label = m >= 8 ? 'High' : m <= 2 ? 'Low' : '';
          momentumEl.textContent = label ? `Mom: ${label}` : '';
          momentumEl.style.display = label ? '' : 'none';
        } else {
          momentumEl.style.display = 'none';
        }
      }
      if (roomEl) roomEl.textContent = ctx.roomName;

      if (!actionsEl) return;
      actionsEl.innerHTML = '';

      // ─── Direction Row ──────────────────────────────────────────────
      const dirRow = document.createElement('div');
      dirRow.className = 'mud-dir-buttons';
      for (const dir of ctx.exits) {
        dirRow.appendChild(createActionButton(dirLabel(dir), dir));
      }
      actionsEl.appendChild(dirRow);

      // ─── Context Row ────────────────────────────────────────────────
      const ctxRow = document.createElement('div');
      ctxRow.className = 'mud-ctx-buttons';

      // Always show Look and Inventory
      ctxRow.appendChild(createActionButton('Look', 'look'));
      ctxRow.appendChild(createActionButton('Inv', 'inventory'));

      if (ctx.inCombat) {
        // Combat mode: abilities, flee, stance
        ctxRow.appendChild(createActionButton('Flee', 'flee'));

        // Show ability buttons (first 4 for space)
        const abilityIds = ctx.abilities || [];
        let shown = 0;
        for (const id of abilityIds) {
          if (shown >= 4) break;
          const def = window.MudAbilities?.getAbilityById(id);
          if (!def) continue;
          ctxRow.appendChild(createActionButton(
            shorten(def.name, 10),
            def.name.toLowerCase()
          ));
          shown++;
        }

        // Stance toggle
        if (ctx.stance) {
          ctxRow.appendChild(createActionButton(`[${ctx.stance}]`, 'stance'));
        }
      } else {
        // Exploration mode
        if (ctx.restState) {
          ctxRow.appendChild(createActionButton('Wake', 'wake'));
        } else {
          ctxRow.appendChild(createActionButton('Rest', 'rest'));
        }

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

    // ─── UI Helpers ───────────────────────────────────────────────────────

    /** Shorten a name for button display. */
    function shorten(name, max = 12) {
      return name.length > max ? name.slice(0, max - 1) + '\u2026' : name;
    }

    /** Create a quick-action button that injects a command. */
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

    /** Short label for direction buttons. */
    function dirLabel(dir) {
      const map = {
        north: 'N', south: 'S', east: 'E', west: 'W',
        up: 'U', down: 'D',
        northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW'
      };
      return map[dir] || dir;
    }

    // ─── Focus Management ─────────────────────────────────────────────────

    function focus() {
      if (inputEl) inputEl.focus();
    }

    function blur() {
      if (inputEl) inputEl.blur();
    }

    // ─── Combat Output Polling ────────────────────────────────────────────

    /**
     * Poll for combat output from the engine (called by scene update loop).
     * Also processes the command queue after combat ticks.
     */
    function pollCombatOutput() {
      if (!engine) return;
      const lines = engine.flushCombatOutput();
      if (lines.length > 0) {
        appendOutput(lines);
        updateContext(engine.getContext());

        // After combat output, process one queued command
        processQueue();
      }

      // If combat ended, clear the queue
      const ctx = engine.getContext();
      if (!ctx.inCombat && commandQueue.length > 0) {
        // Execute remaining queued commands immediately
        while (commandQueue.length > 0) {
          processQueue();
        }
      }
    }

    /**
     * Replace the command handler (used when transitioning from chargen to engine).
     */
    function setCommandHandler(handler) {
      onCommand = handler;
    }

    // ─── Public API ───────────────────────────────────────────────────────

    return {
      render,
      appendOutput,
      updateContext,
      focus,
      blur,
      pollCombatOutput,
      setCommandHandler,
      processQueue,
      clearQueue
    };
  }

  window.MudUI = { create };
})();
