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

  function getCellTopZ(cell) {
    const heights = getCellCornerHeights(cell);
    return Math.max(heights.nw, heights.ne, heights.se, heights.sw);
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

  function sampleCellSurface(level, x, y, options = {}) {
    const includeWalls = !!options.includeWalls;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cell = getCell(level, tx, ty);

    if (!cell) return null;
    if (cell.kind === 'void') return null;
    if (cell.kind === 'wall' && !includeWalls) return null;

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

  function sampleSupportSurface(level, x, y, radius = 0.26, clearance = 0.72, options = {}) {
    const center = sampleCellSurface(level, x, y, options);
    if (!center) return null;

    const r = radius * clearance;
    const d = r * 0.7071;
    const offsets = [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
      [d, d],
      [d, -d],
      [-d, d],
      [-d, -d]
    ];

    const samples = [];
    for (const [ox, oy] of offsets) {
      const sample = sampleCellSurface(level, x + ox, y + oy, options);
      if (!sample) return null;
      samples.push(sample);
    }

    return {
      ...center,
      supportSamples: samples,
      minSupportZ: Math.min(...samples.map((sample) => sample.z)),
      maxSupportZ: Math.max(...samples.map((sample) => sample.z))
    };
  }

  function buildTrainingRun() {
    const level = {
      id: 'training_run',
      name: 'Downhill Test',
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

    fillRect(level, 1, 1, 3, 3, { kind: 'track', h: 5 });
    fillRect(level, 4, 1, 1, 3, { kind: 'track', h: 4, slope: 'E' });
    fillRect(level, 5, 1, 3, 3, { kind: 'track', h: 4 });
    fillRect(level, 5, 4, 3, 1, { kind: 'track', h: 3, slope: 'S' });
    fillRect(level, 5, 5, 3, 3, { kind: 'track', h: 3 });
    fillRect(level, 8, 6, 4, 2, { kind: 'track', h: 3 });
    fillRect(level, 12, 6, 1, 2, { kind: 'track', h: 2, slope: 'E' });
    fillRect(level, 13, 6, 3, 3, { kind: 'track', h: 2 });
    fillRect(level, 14, 9, 2, 1, { kind: 'track', h: 1, slope: 'S' });
    fillRect(level, 14, 10, 2, 4, { kind: 'track', h: 1 });
    fillRect(level, 15, 14, 1, 2, { kind: 'track', h: 1 });
    setCell(level, 15, 15, { kind: 'goal', h: 1 });

    setCell(level, 8, 5, { kind: 'wall', h: 4 });
    setCell(level, 9, 5, { kind: 'wall', h: 4 });
    setCell(level, 12, 9, { kind: 'wall', h: 3 });
    setCell(level, 16, 10, { kind: 'wall', h: 3 });

    return level;
  }

  function buildSwitchbackBasin() {
    const level = {
      id: 'switchback_basin',
      name: 'Switchback Test',
      width: 18,
      height: 18,
      killZ: -4,
      voidFloor: -2,
      start: { x: 2.5, y: 2.5 },
      goal: { x: 14.5, y: 14.5, radius: 0.42 },
      reward: {
        presses: 25000,
        unlocks: ['marble_switchback_complete'],
        claimKey: 'switchback_basin'
      },
      cells: createGrid(18, 18)
    };

    fillRect(level, 1, 1, 3, 3, { kind: 'track', h: 4 });
    fillRect(level, 4, 2, 4, 1, { kind: 'track', h: 4 });
    fillRect(level, 8, 1, 3, 3, { kind: 'track', h: 4 });
    fillRect(level, 9, 4, 1, 3, { kind: 'track', h: 4 });
    fillRect(level, 8, 7, 3, 3, { kind: 'track', h: 4 });
    fillRect(level, 11, 8, 3, 1, { kind: 'track', h: 4 });
    fillRect(level, 14, 7, 2, 3, { kind: 'track', h: 4 });
    fillRect(level, 15, 10, 1, 3, { kind: 'track', h: 4 });
    fillRect(level, 13, 13, 3, 3, { kind: 'track', h: 4 });

    setCell(level, 8, 1, { kind: 'hazard', h: 4 });
    setCell(level, 10, 2, { kind: 'hazard', h: 4 });
    setCell(level, 10, 7, { kind: 'hazard', h: 4 });
    setCell(level, 8, 8, { kind: 'hazard', h: 4 });
    setCell(level, 13, 14, { kind: 'hazard', h: 4 });
    setCell(level, 14, 13, { kind: 'hazard', h: 4 });
    setCell(level, 14, 14, { kind: 'goal', h: 4 });

    setCell(level, 11, 2, { kind: 'wall', h: 5 });
    setCell(level, 7, 8, { kind: 'wall', h: 5 });
    setCell(level, 14, 6, { kind: 'wall', h: 5 });

    return level;
  }

  function buildNeedleGauntlet() {
    const level = {
      id: 'needle_gauntlet',
      name: 'Needle Test',
      width: 22,
      height: 18,
      killZ: -5,
      voidFloor: -2.5,
      start: { x: 2, y: 2 },
      goal: { x: 17.5, y: 15.5, radius: 0.4 },
      reward: {
        presses: 125000,
        unlocks: ['marble_needle_complete'],
        claimKey: 'needle_gauntlet'
      },
      cells: createGrid(22, 18)
    };

    fillRect(level, 1, 1, 2, 2, { kind: 'track', h: 5 });
    fillRect(level, 3, 1, 5, 1, { kind: 'track', h: 5 });
    fillRect(level, 7, 2, 1, 4, { kind: 'track', h: 5 });
    fillRect(level, 8, 5, 5, 1, { kind: 'track', h: 5 });
    fillRect(level, 12, 6, 1, 4, { kind: 'track', h: 5 });
    fillRect(level, 9, 10, 3, 1, { kind: 'track', h: 5 });
    fillRect(level, 9, 11, 1, 3, { kind: 'track', h: 5 });
    fillRect(level, 10, 13, 5, 1, { kind: 'track', h: 5 });
    fillRect(level, 14, 10, 1, 4, { kind: 'track', h: 5 });
    fillRect(level, 15, 10, 4, 1, { kind: 'track', h: 5 });
    fillRect(level, 18, 11, 1, 5, { kind: 'track', h: 5 });
    fillRect(level, 17, 15, 2, 2, { kind: 'track', h: 5 });

    setCell(level, 18, 16, { kind: 'hazard', h: 5 });
    setCell(level, 18, 15, { kind: 'hazard', h: 5 });
    setCell(level, 17, 15, { kind: 'goal', h: 5 });

    setCell(level, 8, 2, { kind: 'wall', h: 6 });
    setCell(level, 13, 9, { kind: 'wall', h: 6 });
    setCell(level, 15, 14, { kind: 'wall', h: 6 });

    return level;
  }

  const LEVELS = [
    buildTrainingRun(),
    buildSwitchbackBasin(),
    buildNeedleGauntlet()
  ];

  function getLevelById(id) {
    return LEVELS.find((level) => level.id === id) || LEVELS[0];
  }

  function getLevelIndex(id) {
    return LEVELS.findIndex((level) => level.id === id);
  }

  function getNextLevelId(id) {
    const index = getLevelIndex(id);
    if (index < 0 || index >= LEVELS.length - 1) return null;
    return LEVELS[index + 1].id;
  }

  function isLevelUnlocked(clearedLevels = [], levelId) {
    const index = getLevelIndex(levelId);
    if (index <= 0) return true;
    if (clearedLevels.includes(levelId)) return true;
    return clearedLevels.includes(LEVELS[index - 1].id);
  }

  function getUnlockedLevelIds(clearedLevels = []) {
    return LEVELS
      .filter((level) => isLevelUnlocked(clearedLevels, level.id))
      .map((level) => level.id);
  }

  window.MarbleLevels = {
    LEVELS,
    getLevelById,
    getLevelIndex,
    getNextLevelId,
    getUnlockedLevelIds,
    isLevelUnlocked,
    getCell,
    getCellCornerHeights,
    getCellTopZ,
    getCellGradient,
    sampleCellSurface,
    sampleSupportSurface
  };
})();