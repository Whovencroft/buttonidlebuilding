(() => {
  function makeVoidCell() {
    return { kind: 'void', h: 0, slope: null };
  }

  function normalizeCell(patch = {}) {
    return {
      kind: patch.kind ?? 'track',
      h: patch.h ?? 0,
      slope: patch.slope ?? null
    };
  }

  function createGrid(width, height) {
    return Array.from({ length: height }, () =>
      Array.from({ length: width }, () => makeVoidCell())
    );
  }

  function setCell(level, x, y, patch) {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return;
    level.cells[y][x] = normalizeCell(patch);
  }

  function fillRect(level, x, y, w, h, patch) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        setCell(level, xx, yy, patch);
      }
    }
  }

  function getCell(level, tx, ty) {
    if (!level) return null;
    if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) return null;
    return level.cells[ty][tx] || null;
  }

  function getCellCornerHeights(cell) {
    if (!cell) {
      return { nw: 0, ne: 0, se: 0, sw: 0 };
    }

    const h = cell.h || 0;

    switch (cell.slope) {
      case 'E':
        return { nw: h + 1, ne: h, se: h, sw: h + 1 };
      case 'W':
        return { nw: h, ne: h + 1, se: h + 1, sw: h };
      case 'S':
        return { nw: h + 1, ne: h + 1, se: h, sw: h };
      case 'N':
        return { nw: h, ne: h, se: h + 1, sw: h + 1 };
      default:
        return { nw: h, ne: h, se: h, sw: h };
    }
  }

  function getCellGradient(cell) {
    if (!cell) return { gx: 0, gy: 0 };

    switch (cell.slope) {
      case 'E':
        return { gx: -1, gy: 0 };
      case 'W':
        return { gx: 1, gy: 0 };
      case 'S':
        return { gx: 0, gy: -1 };
      case 'N':
        return { gx: 0, gy: 1 };
      default:
        return { gx: 0, gy: 0 };
    }
  }

  function sampleCellSurface(level, x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cell = getCell(level, tx, ty);

    if (!cell) return null;
    if (cell.kind === 'void' || cell.kind === 'wall') return null;

    const u = x - tx;
    const v = y - ty;

    const heights = getCellCornerHeights(cell);
    const north = heights.nw * (1 - u) + heights.ne * u;
    const south = heights.sw * (1 - u) + heights.se * u;
    const z = north * (1 - v) + south * v;
    const gradient = getCellGradient(cell);

    return {
      cell,
      tx,
      ty,
      u,
      v,
      z,
      gradient
    };
  }

  function buildTrainingRun() {
    const level = {
      id: 'training_run',
      name: 'Downhill Training',
      width: 18,
      height: 18,
      killZ: -3.5,
      voidFloor: -1.5,
      start: { x: 2.5, y: 2.5 },
      goal: { x: 15.5, y: 15.5, radius: 0.42 },
      reward: {
        presses: 5000,
        unlocks: ['marble_training_complete'],
        claimKey: 'training_run'
      },
      cells: createGrid(18, 18)
    };

    // Start platform
    fillRect(level, 1, 1, 3, 3, { kind: 'track', h: 5 });

    // First downhill run east
    fillRect(level, 4, 1, 1, 3, { kind: 'track', h: 4, slope: 'E' });
    fillRect(level, 5, 1, 3, 3, { kind: 'track', h: 4 });

    // Turn south and descend
    fillRect(level, 5, 4, 3, 1, { kind: 'track', h: 3, slope: 'S' });
    fillRect(level, 5, 5, 3, 3, { kind: 'track', h: 3 });

    // Mid bridge
    fillRect(level, 8, 6, 4, 2, { kind: 'track', h: 3 });

    // Descend again east
    fillRect(level, 12, 6, 1, 2, { kind: 'track', h: 2, slope: 'E' });
    fillRect(level, 13, 6, 3, 3, { kind: 'track', h: 2 });

    // Hazard shoulders
    setCell(level, 13, 8, { kind: 'hazard', h: 2 });
    setCell(level, 15, 6, { kind: 'hazard', h: 2 });

    // South turn and final descent
    fillRect(level, 14, 9, 2, 1, { kind: 'track', h: 1, slope: 'S' });
    fillRect(level, 14, 10, 2, 4, { kind: 'track', h: 1 });

    // Final narrow bridge and goal
    fillRect(level, 15, 14, 1, 2, { kind: 'track', h: 1 });
    setCell(level, 15, 15, { kind: 'goal', h: 1 });

    // Some blockers for silhouette and readability
    setCell(level, 8, 5, { kind: 'wall', h: 4 });
    setCell(level, 9, 5, { kind: 'wall', h: 4 });
    setCell(level, 12, 9, { kind: 'wall', h: 3 });
    setCell(level, 16, 10, { kind: 'wall', h: 3 });

    return level;
  }

  const LEVELS = [buildTrainingRun()];

  function getLevelById(id) {
    return LEVELS.find((level) => level.id === id) || LEVELS[0];
  }

  window.MarbleLevels = {
    LEVELS,
    getLevelById,
    getCell,
    getCellCornerHeights,
    getCellGradient,
    sampleCellSurface
  };
})();