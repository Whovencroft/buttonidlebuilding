/**
 * Go rules helpers for board state, move legality, captures, and scoring.
 * Purpose: keep pure game logic isolated from scene/UI code.
 */
export function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function boardHash(board) {
  return board.map((row) => row.map((cell) => cell || '.').join('')).join('|');
}

export function applyGoMove(state, x, y) {
  const { size, board, currentPlayer, koHash } = state;

  if (!isOnBoard(size, x, y) || board[y][x]) {
    return { ok: false, reason: 'Illegal move: occupied or out of bounds.' };
  }

  const nextBoard = cloneBoard(board);
  nextBoard[y][x] = currentPlayer;

  const opponent = currentPlayer === 'black' ? 'white' : 'black';
  let captured = 0;

  for (const [nx, ny] of neighbors(size, x, y)) {
    if (nextBoard[ny][nx] !== opponent) continue;
    const group = collectGroup(nextBoard, nx, ny);
    if (countLiberties(nextBoard, group) === 0) {
      captured += group.length;
      for (const stone of group) {
        nextBoard[stone.y][stone.x] = null;
      }
    }
  }

  const selfGroup = collectGroup(nextBoard, x, y);
  if (countLiberties(nextBoard, selfGroup) === 0) {
    return { ok: false, reason: 'Illegal move: suicide is not allowed.' };
  }

  const nextHash = boardHash(nextBoard);
  if (koHash && nextHash === koHash) {
    return { ok: false, reason: 'Illegal move: ko repetition.' };
  }

  const nextCaptures = {
    ...state.captures,
    [currentPlayer]: state.captures[currentPlayer] + captured
  };

  return {
    ok: true,
    nextState: {
      ...state,
      board: nextBoard,
      currentPlayer: opponent,
      captures: nextCaptures,
      passCount: 0,
      koHash: boardHash(board),
      lastMove: { x, y, player: currentPlayer }
    }
  };
}

export function applyGoPass(state) {
  const nextPassCount = state.passCount + 1;
  const complete = nextPassCount >= 2;

  const nextState = {
    ...state,
    currentPlayer: state.currentPlayer === 'black' ? 'white' : 'black',
    passCount: nextPassCount,
    status: complete ? 'complete' : 'playing'
  };

  if (complete) {
    nextState.score = scoreBoard(nextState);
  }

  return nextState;
}

export function scoreBoard(state) {
  const board = state.board;
  let blackStones = 0;
  let whiteStones = 0;

  for (const row of board) {
    for (const cell of row) {
      if (cell === 'black') blackStones += 1;
      if (cell === 'white') whiteStones += 1;
    }
  }

  return {
    black: blackStones + state.captures.black,
    white: whiteStones + state.captures.white
  };
}

function isOnBoard(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function neighbors(size, x, y) {
  return [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1]
  ].filter(([nx, ny]) => isOnBoard(size, nx, ny));
}

function collectGroup(board, startX, startY) {
  const color = board[startY][startX];
  const size = board.length;
  const key = (x, y) => `${x},${y}`;
  const queue = [[startX, startY]];
  const visited = new Set([key(startX, startY)]);
  const group = [];

  while (queue.length) {
    const [x, y] = queue.shift();
    group.push({ x, y });

    for (const [nx, ny] of neighbors(size, x, y)) {
      if (board[ny][nx] !== color) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      visited.add(k);
      queue.push([nx, ny]);
    }
  }

  return group;
}

function countLiberties(board, group) {
  const size = board.length;
  const liberties = new Set();

  for (const stone of group) {
    for (const [nx, ny] of neighbors(size, stone.x, stone.y)) {
      if (!board[ny][nx]) {
        liberties.add(`${nx},${ny}`);
      }
    }
  }

  return liberties.size;
}
