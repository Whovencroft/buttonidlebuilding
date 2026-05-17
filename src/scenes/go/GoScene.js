import { applyGoMove, applyGoPass, boardHash, cloneBoard, createEmptyBoard, scoreBoard } from './GoRules.js';

/**
 * Creates the Go scene with board state, move validation, captures,
 * pass/score flow, restart behavior, and scene-local save integration.
 */
export function createGoScene(api) {
  const root = ensureRoot();
  let refs = null;
  let config = { boardSize: 9 };

  function slice() {
    const state = api.getState();
    if (!state.scenes.go || typeof state.scenes.go !== 'object') {
      state.scenes.go = {};
    }

    const go = state.scenes.go;
    const size = Number.isInteger(go.size) ? go.size : config.boardSize;
    go.size = size;
    go.board = normalizeBoard(go.board, size);
    go.currentPlayer = go.currentPlayer === 'white' ? 'white' : 'black';
    go.captures = {
      black: Number.isFinite(go.captures?.black) ? go.captures.black : 0,
      white: Number.isFinite(go.captures?.white) ? go.captures.white : 0
    };
    go.passCount = Number.isFinite(go.passCount) ? go.passCount : 0;
    go.koHash = typeof go.koHash === 'string' ? go.koHash : null;
    go.lastMove = go.lastMove && typeof go.lastMove === 'object' ? go.lastMove : null;
    go.status = go.status === 'complete' ? 'complete' : 'playing';
    go.score = go.score && typeof go.score === 'object' ? go.score : null;
    go.message = typeof go.message === 'string' ? go.message : 'Place a stone.';
    go.lastOutcome = go.lastOutcome && typeof go.lastOutcome === 'object' ? go.lastOutcome : null;
    return go;
  }

  async function loadConfig() {
    try {
      const data = await api.assetService.loadJson('/data/go-matches.json');
      config = {
        boardSize: Number.isInteger(data?.default?.boardSize) ? data.default.boardSize : 9
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
          <h2>Go</h2>
          <div class="small" data-go-turn>Turn</div>
        </div>
        <div class="panel-body" style="display:grid;grid-template-rows:auto 1fr auto;gap:10px;">
          <div class="small" data-go-status></div>
          <canvas class="marble-canvas" data-go-canvas style="max-height:620px;"></canvas>
          <div style="display:flex;gap:8px;">
            <button class="action-btn" data-go-pass>Pass</button>
            <button class="action-btn" data-go-reset>Restart</button>
          </div>
        </div>
      </div>
    `;

    refs = {
      canvas: root.querySelector('[data-go-canvas]'),
      turn: root.querySelector('[data-go-turn]'),
      status: root.querySelector('[data-go-status]'),
      pass: root.querySelector('[data-go-pass]'),
      reset: root.querySelector('[data-go-reset]')
    };

    refs.canvas.addEventListener('click', onCanvasClick);
    refs.pass.addEventListener('click', onPass);
    refs.reset.addEventListener('click', onReset);
  }

  function onCanvasClick(event) {
    const go = slice();
    if (go.status === 'complete') return;

    const { x, y } = resolveIntersection(event, go.size);
    const result = applyGoMove(go, x, y);

    if (!result.ok) {
      go.message = result.reason;
      render();
      return;
    }

    Object.assign(go, result.nextState);
    go.message = `Move played at ${x + 1},${y + 1}.`;
    go.score = null;

    api.saveNow();
    render();
  }

  function onPass() {
    const go = slice();
    if (go.status === 'complete') return;

    const nextState = applyGoPass(go);
    Object.assign(go, nextState);
    go.message = 'Player passed.';

    if (go.status === 'complete') {
      finalizeOutcome(go);
    }

    api.saveNow();
    render();
  }

  function onReset() {
    const go = slice();
    resetSlice(go, go.size);
    go.message = 'Board reset.';
    api.saveNow();
    render();
  }

  function finalizeOutcome(go) {
    go.score = scoreBoard(go);
    go.lastOutcome = {
      sceneId: 'go',
      endingId: 'go_complete',
      ts: Date.now(),
      score: { ...go.score },
      captures: { ...go.captures },
      finalBoardHash: boardHash(go.board)
    };

    const winner = go.score.black === go.score.white
      ? 'Draw'
      : (go.score.black > go.score.white ? 'Black wins' : 'White wins');

    go.message = `Game complete. ${winner} (${go.score.black} - ${go.score.white}).`;
    api.setSaveStatus?.('Go completion recorded for host progression hooks.');
  }

  function drawBoard(go) {
    const canvas = refs.canvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const size = go.size;
    const padding = 26;
    const gridPx = Math.min(rect.width, rect.height) - padding * 2;
    const step = gridPx / (size - 1);

    ctx.fillStyle = '#caa46a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = '#2d2012';
    ctx.lineWidth = 1;

    for (let i = 0; i < size; i += 1) {
      const p = padding + i * step;
      ctx.beginPath();
      ctx.moveTo(padding, p);
      ctx.lineTo(padding + gridPx, p);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p, padding);
      ctx.lineTo(p, padding + gridPx);
      ctx.stroke();
    }

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const stone = go.board[y][x];
        if (!stone) continue;

        const cx = padding + x * step;
        const cy = padding + y * step;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(6, step * 0.42), 0, Math.PI * 2);
        ctx.fillStyle = stone === 'black' ? '#101010' : '#f4f4f4';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.stroke();
      }
    }
  }

  function render() {
    if (!refs) return;
    const go = slice();

    refs.turn.textContent = `Turn: ${go.currentPlayer}`;
    refs.status.textContent = `${go.message} Captures B:${go.captures.black} W:${go.captures.white} Passes:${go.passCount}`;
    drawBoard(go);
  }

  return {
    id: 'go',
    root,
    async enter() {
      root.dataset.sceneStatus = 'active';
      root.dataset.sceneKind = 'canvas';
      ensureDom();
      await loadConfig();

      const go = slice();
      if (!Array.isArray(go.board) || go.board.length !== go.size) {
        resetSlice(go, config.boardSize);
      }

      render();
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
      api.saveNow();
    },
    update() {
      // Purpose: reserved for future timers/clock systems.
    },
    render,
    onStateLoaded() {
      slice();
    }
  };
}

function normalizeBoard(board, size) {
  if (!Array.isArray(board) || board.length !== size) {
    return createEmptyBoard(size);
  }

  return board.map((row) => {
    if (!Array.isArray(row) || row.length !== size) {
      return Array.from({ length: size }, () => null);
    }

    return row.map((cell) => (cell === 'black' || cell === 'white' ? cell : null));
  });
}

function resetSlice(go, size) {
  go.size = size;
  go.board = createEmptyBoard(size);
  go.currentPlayer = 'black';
  go.captures = { black: 0, white: 0 };
  go.passCount = 0;
  go.koHash = null;
  go.lastMove = null;
  go.status = 'playing';
  go.score = null;
  go.lastOutcome = null;
}

function resolveIntersection(event, size) {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const padding = 26;
  const gridPx = Math.min(rect.width, rect.height) - padding * 2;
  const step = gridPx / (size - 1);

  const x = Math.round((event.clientX - rect.left - padding) / step);
  const y = Math.round((event.clientY - rect.top - padding) / step);

  return {
    x: Math.max(0, Math.min(size - 1, x)),
    y: Math.max(0, Math.min(size - 1, y))
  };
}

function ensureRoot() {
  let root = document.getElementById('goSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'goSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'go';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}
