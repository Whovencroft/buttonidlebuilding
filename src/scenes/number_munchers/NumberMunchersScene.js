import { buildGridRound, getNextLevelStatus, getRoundOutcome, matchesPromptRule } from './NumberMunchersRules.js';

/**
 * Creates the Number Munchers canvas scene with grid movement, prompt rules,
 * scoring, round flow, and scene-local save persistence.
 */
export function createNumberMunchersScene(api) {
  const root = ensureRoot();
  let refs = null;
  let config = defaultConfig();

  function slice() {
    const state = api.getState();
    if (!state.scenes.number_munchers || typeof state.scenes.number_munchers !== 'object') {
      state.scenes.number_munchers = {};
    }

    const nm = state.scenes.number_munchers;
    nm.levelIndex = Number.isInteger(nm.levelIndex) ? nm.levelIndex : 0;
    nm.score = Number.isFinite(nm.score) ? nm.score : 0;
    nm.lives = Number.isFinite(nm.lives) ? nm.lives : config.startingLives;
    nm.status = typeof nm.status === 'string' ? nm.status : 'playing';
    nm.round = normalizeRound(nm.round);
    nm.progress = normalizeProgress(nm.progress, nm.round, config);
    nm.message = typeof nm.message === 'string' ? nm.message : 'Move to a number and munch it.';
    nm.completedRounds = Number.isInteger(nm.completedRounds) ? nm.completedRounds : 0;
    nm.lastOutcome = nm.lastOutcome && typeof nm.lastOutcome === 'object' ? nm.lastOutcome : null;
    return nm;
  }

  async function loadConfig() {
    try {
      const data = await api.assetService.loadJson('/data/number-munchers-rounds.json');
      config = {
        ...defaultConfig(),
        ...(data?.default || {})
      };
    } catch (error) {
      console.warn(error);
    }
  }

  function ensureDom() {
    if (refs) return;

    root.innerHTML = `
      <div class="panel" style="height:100%;">
        <div class="panel-header">
          <h2>Number Munchers</h2>
          <div class="small" data-nm-score>Score: 0</div>
        </div>
        <div class="panel-body" style="display:grid;grid-template-rows:auto auto 1fr auto;gap:10px;">
          <div class="small" data-nm-prompt></div>
          <div class="small" data-nm-status></div>
          <canvas class="marble-canvas" data-nm-canvas style="max-height:620px;"></canvas>
          <div style="display:flex;gap:8px;">
            <button class="action-btn" data-nm-next>Next Round</button>
            <button class="action-btn" data-nm-reset>Restart Run</button>
          </div>
        </div>
      </div>
    `;

    refs = {
      canvas: root.querySelector('[data-nm-canvas]'),
      prompt: root.querySelector('[data-nm-prompt]'),
      status: root.querySelector('[data-nm-status]'),
      score: root.querySelector('[data-nm-score]'),
      next: root.querySelector('[data-nm-next]'),
      reset: root.querySelector('[data-nm-reset]')
    };

    refs.next.addEventListener('click', onNextRound);
    refs.reset.addEventListener('click', onRestart);
    root.addEventListener('keydown', onKeyDown);
    root.tabIndex = 0;
  }

  function startRound(nm) {
    nm.round = buildGridRound(config, nm.levelIndex);
    nm.progress = {
      playerIndex: 0,
      visited: {},
      eatenTargets: {},
      moves: 0,
      maxMoves: Number.isInteger(config.maxMovesPerRound) ? config.maxMovesPerRound : 24,
      currentCellValue: null
    };

    const initial = evaluatePlayerCell(nm, 0, false);
    if (initial.message) {
      nm.message = initial.message;
    }
  }

  function onKeyDown(event) {
    const nm = slice();
    if (nm.status !== 'playing') return;

    const movement = resolveMovementDelta(event.key);
    if (!movement) return;
    event.preventDefault();

    const nextIndex = movePlayer(nm.round, nm.progress.playerIndex, movement.dx, movement.dy);
    if (nextIndex === nm.progress.playerIndex) return;

    nm.progress.playerIndex = nextIndex;
    nm.progress.moves += 1;

    const { matchedTarget, message } = evaluatePlayerCell(nm, nextIndex, true);
    nm.message = message;

    if (matchedTarget) {
      nm.score += 10;
    } else {
      nm.score = Math.max(0, nm.score - 2);
      nm.lives -= 1;
    }

    const outcome = getRoundOutcome(nm.round, { ...nm.progress, lives: nm.lives });
    if (outcome.status === 'round_complete') {
      nm.status = 'round_complete';
      nm.completedRounds += 1;
      nm.message = `Round clear! ${countEaten(nm.progress.eatenTargets)}/${nm.round.targets.length} valid targets eaten.`;
    } else if (outcome.status === 'round_failed' || outcome.status === 'failed') {
      nm.status = nm.lives <= 0 ? 'failed' : 'round_failed';
      nm.message = nm.lives <= 0 ? 'Run failed. You are out of lives.' : 'Round failed. Out of moves.';
      if (nm.status === 'failed') {
        finalizeRun(nm, 'failed');
      }
    }

    api.saveNow();
    render();
  }

  function onNextRound() {
    const nm = slice();

    if (nm.status === 'failed' || nm.status === 'complete') {
      return;
    }

    if (nm.status !== 'round_complete' && nm.status !== 'round_failed') {
      nm.message = 'Finish this round first.';
      render();
      return;
    }

    const next = getNextLevelStatus(config, nm.levelIndex);
    if (next.status === 'complete' && nm.status === 'round_complete') {
      nm.status = 'complete';
      finalizeRun(nm, 'complete');
      api.saveNow(true);
      render();
      return;
    }

    if (nm.status === 'round_failed') {
      if (nm.lives <= 0) {
        nm.status = 'failed';
        finalizeRun(nm, 'failed');
        api.saveNow(true);
        render();
        return;
      }
    } else {
      nm.levelIndex = next.nextLevelIndex;
    }

    nm.status = 'playing';
    startRound(nm);
    api.saveNow();
    render();
  }

  function onRestart() {
    const nm = slice();
    resetSlice(nm);
    startRound(nm);
    nm.message = 'Run restarted.';
    api.saveNow();
    render();
  }

  function evaluatePlayerCell(nm, index, consume) {
    const value = nm.round.values[index];
    nm.progress.currentCellValue = value;

    if (nm.progress.visited[index]) {
      return { matchedTarget: true, message: `Moved to ${value}. Already checked.` };
    }

    const matchedTarget = matchesPromptRule(value, nm.round.prompt);
    if (consume) {
      nm.progress.visited[index] = true;
      if (matchedTarget) {
          nm.progress.eatenTargets[index] = true;
      }
    }

    const message = matchedTarget
      ? `Correct munch: ${value}`
      : `Wrong munch: ${value}`;

    return { matchedTarget, message };
  }

  function drawRound(nm) {
    const canvas = refs.canvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const { rows, cols, values } = nm.round;
    const padding = 14;
    const cellW = (rect.width - padding * 2) / cols;
    const cellH = (rect.height - padding * 2) / rows;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const x = padding + col * cellW;
        const y = padding + row * cellH;
        const isPlayer = index === nm.progress.playerIndex;
        const isVisited = !!nm.progress.visited[index];
        const isTarget = nm.round.targets.includes(index);
        const isEaten = isEatenTarget(nm.progress.eatenTargets, index);

        ctx.fillStyle = isPlayer
          ? '#2b8a3e'
          : isEaten
            ? '#3f3f46'
            : isVisited
              ? '#57534e'
              : '#1f2937';
        ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

        if (!isVisited && isTarget) {
          ctx.strokeStyle = 'rgba(34,197,94,0.75)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, cellW - 8, cellH - 8);
        }

        ctx.fillStyle = '#F8FAFC';
        ctx.font = `${Math.max(12, Math.floor(cellH * 0.34))}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(values[index]), x + (cellW / 2), y + (cellH / 2));
      }
    }
  }

  function render() {
    if (!refs) return;

    const nm = slice();
    refs.prompt.textContent = `Prompt: ${nm.round.prompt.text}`;
    refs.status.textContent = `${nm.message} Lives:${nm.lives} Moves:${nm.progress.moves}/${nm.progress.maxMoves} Targets:${countEaten(nm.progress.eatenTargets)}/${nm.round.targets.length}`;
    refs.score.textContent = `Score: ${nm.score}`;

    refs.next.disabled = !(nm.status === 'round_complete' || nm.status === 'round_failed');
    refs.next.textContent = nm.status === 'round_complete' ? 'Next Round' : 'Retry/Advance';

    drawRound(nm);
  }

  function finalizeRun(nm, status) {
    nm.status = status;
    nm.lastOutcome = {
      sceneId: 'number_munchers',
      endingId: status === 'complete' ? 'number_munchers_complete' : 'number_munchers_failed',
      ts: Date.now(),
      score: nm.score,
      completedRounds: nm.completedRounds,
      levelIndex: nm.levelIndex,
      livesRemaining: nm.lives
    };

    api.setSaveStatus?.(
      status === 'complete'
        ? 'Number Munchers completion recorded for progression hooks.'
        : 'Number Munchers failure recorded.'
    );
  }

  return {
    id: 'number_munchers',
    root,
    async enter() {
      root.dataset.sceneStatus = 'active';
      root.dataset.sceneKind = 'canvas';
      ensureDom();
      await loadConfig();

      const nm = slice();
      if (!Array.isArray(nm.round.values) || nm.round.values.length === 0) {
        resetSlice(nm);
        startRound(nm);
      }

      render();
      root.focus();
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
      api.saveNow();
    },
    update() {
      // Reserved for future timed enemies/hazards.
    },
    render,
    onStateLoaded() {
      const nm = slice();
      nm.progress.eatenTargets = normalizeEatenTargets(nm.progress.eatenTargets);
    }
  };
}

function resolveMovementDelta(key) {
  const k = String(key || '').toLowerCase();
  if (k === 'arrowup' || k === 'w') return { dx: 0, dy: -1 };
  if (k === 'arrowdown' || k === 's') return { dx: 0, dy: 1 };
  if (k === 'arrowleft' || k === 'a') return { dx: -1, dy: 0 };
  if (k === 'arrowright' || k === 'd') return { dx: 1, dy: 0 };
  return null;
}

function movePlayer(round, playerIndex, dx, dy) {
  const { rows, cols } = round;
  const col = playerIndex % cols;
  const row = Math.floor(playerIndex / cols);
  const nextCol = Math.max(0, Math.min(cols - 1, col + dx));
  const nextRow = Math.max(0, Math.min(rows - 1, row + dy));
  return (nextRow * cols) + nextCol;
}

function normalizeRound(round) {
  if (!round || typeof round !== 'object') {
    return { rows: 0, cols: 0, prompt: { text: '' }, values: [], targets: [] };
  }

  return {
    rows: Number.isInteger(round.rows) ? round.rows : 0,
    cols: Number.isInteger(round.cols) ? round.cols : 0,
    prompt: round.prompt && typeof round.prompt === 'object' ? round.prompt : { text: '' },
    values: Array.isArray(round.values) ? round.values : [],
    targets: Array.isArray(round.targets) ? round.targets : []
  };
}

function normalizeProgress(progress, round, config) {
  const playerIndex = Number.isInteger(progress?.playerIndex) ? progress.playerIndex : 0;
  const visited = progress?.visited && typeof progress.visited === 'object' ? progress.visited : {};
  const eatenTargets = normalizeEatenTargets(progress?.eatenTargets);

  return {
    playerIndex: Math.max(0, Math.min((round.values.length || 1) - 1, playerIndex)),
    visited,
    eatenTargets,
    moves: Number.isFinite(progress?.moves) ? progress.moves : 0,
    maxMoves: Number.isInteger(progress?.maxMoves)
      ? progress.maxMoves
      : (Number.isInteger(config.maxMovesPerRound) ? config.maxMovesPerRound : 24),
    currentCellValue: Number.isFinite(progress?.currentCellValue) ? progress.currentCellValue : null
  };
}

function resetSlice(nm) {
  nm.levelIndex = 0;
  nm.score = 0;
  nm.lives = 3;
  nm.status = 'playing';
  nm.round = { rows: 0, cols: 0, prompt: { text: '' }, values: [], targets: [] };
  nm.progress = { playerIndex: 0, visited: {}, eatenTargets: {}, moves: 0, maxMoves: 24, currentCellValue: null };
  nm.completedRounds = 0;
  nm.lastOutcome = null;
}

function defaultConfig() {
  return {
    startingLives: 3,
    maxRounds: 5,
    maxMovesPerRound: 24,
    grid: {
      rows: 6,
      cols: 8,
      min: 1,
      max: 60
    },
    prompts: [
      { id: 'div2', text: 'Eat numbers divisible by 2', type: 'divisible_by', value: 2 },
      { id: 'gt30', text: 'Eat numbers greater than 30', type: 'greater_than', value: 30 },
      { id: 'lt15', text: 'Eat numbers less than 15', type: 'less_than', value: 15 }
    ]
  };
}

function normalizeEatenTargets(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.fromEntries(Object.entries(raw).filter(([, value]) => !!value));
  }

  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map((index) => [String(index), true]));
  }

  return {};
}

function isEatenTarget(eatenTargets, index) {
  return !!eatenTargets?.[index];
}

function countEaten(eatenTargets) {
  return Object.keys(eatenTargets || {}).length;
}

function ensureRoot() {
  let root = document.getElementById('numberMunchersSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'numberMunchersSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'number_munchers';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}
