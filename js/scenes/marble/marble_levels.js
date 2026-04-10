(() => {
  const GENERATED_LEVELS = [];

  function makeVoidSurfaceCell() {
    return { kind: 'void', h: 0, slope: null };
  }

  function normalizeSurfaceCell(patch = {}) {
    return {
      kind: patch.kind ?? 'track',
      h: patch.h ?? 0,
      slope: patch.slope ?? null
    };
  }

  function normalizeBlockerCell(patch = {}) {
    const top = patch.top ?? patch.h ?? 1;

    return {
      kind: patch.kind ?? 'wall',
      top,
      walkableTop: !!patch.walkableTop
    };
  }

  function normalizeTriggerCell(patch = {}) {
    return {
      kind: patch.kind ?? 'goal',
      radius: patch.radius ?? null,
      data: patch.data ?? null
    };
  }

  function createGrid(width, height, factory = null) {
    return Array.from({ length: height }, () =>
      Array.from({ length: width }, () => (factory ? factory() : null))
    );
  }

  function getGridCell(grid, tx, ty) {
    if (!grid) return null;
    if (ty < 0 || ty >= grid.length) return null;
    if (tx < 0 || tx >= (grid[ty]?.length ?? 0)) return null;
    return grid[ty][tx] ?? null;
  }

  function setGridCell(grid, tx, ty, value) {
    if (!grid) return;
    if (ty < 0 || ty >= grid.length) return;
    if (tx < 0 || tx >= (grid[ty]?.length ?? 0)) return;
    grid[ty][tx] = value;
  }

  function createLevelShell({
    id,
    name,
    width,
    height,
    killZ,
    voidFloor,
    start,
    reward,
    fixture = false,
    generated = false,
    generatorSpec = null
  }) {
    return {
      id,
      name,
      width,
      height,
      killZ,
      voidFloor,
      start,
      reward,
      fixture,
      generated,
      generatorSpec,
      surface: createGrid(width, height, () => makeVoidSurfaceCell()),
      blockers: createGrid(width, height, null),
      triggers: createGrid(width, height, null),
      goal: null
    };
  }

  function setSurface(level, x, y, patch) {
    setGridCell(level.surface, x, y, normalizeSurfaceCell(patch));
  }

  function fillSurfaceRect(level, x, y, w, h, patch) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        setSurface(level, xx, yy, patch);
      }
    }
  }

  function setBlocker(level, x, y, patch) {
    setGridCell(level.blockers, x, y, normalizeBlockerCell(patch));
  }

  function fillBlockerRect(level, x, y, w, h, patch) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        setBlocker(level, xx, yy, patch);
      }
    }
  }

  function clearBlocker(level, x, y) {
    setGridCell(level.blockers, x, y, null);
  }

  function setTrigger(level, x, y, patch) {
    setGridCell(level.triggers, x, y, normalizeTriggerCell(patch));
  }

  function clearTrigger(level, x, y) {
    setGridCell(level.triggers, x, y, null);
  }

  function setGoal(level, x, y, radius = 0.42) {
    setTrigger(level, x, y, { kind: 'goal', radius });
    level.goal = {
      x: x + 0.5,
      y: y + 0.5,
      radius
    };
  }

  function getSurfaceCell(level, tx, ty) {
    return getGridCell(level?.surface, tx, ty);
  }

  function getBlockerCell(level, tx, ty) {
    return getGridCell(level?.blockers, tx, ty);
  }

  function getTriggerCell(level, tx, ty) {
    return getGridCell(level?.triggers, tx, ty);
  }

  function getSurfaceCornerHeights(cell) {
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

  function getSurfaceTopZ(cell) {
    const heights = getSurfaceCornerHeights(cell);
    return Math.max(heights.nw, heights.ne, heights.se, heights.sw);
  }

  function getSurfaceGradient(cell) {
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

  function sampleSurfaceOnly(level, x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cell = getSurfaceCell(level, tx, ty);

    if (!cell || cell.kind === 'void') {
      return null;
    }

    const u = x - tx;
    const v = y - ty;
    const heights = getSurfaceCornerHeights(cell);
    const north = heights.nw * (1 - u) + heights.ne * u;
    const south = heights.sw * (1 - u) + heights.se * u;
    const z = north * (1 - v) + south * v;

    return {
      source: 'surface',
      cell,
      tx,
      ty,
      u,
      v,
      z,
      gradient: getSurfaceGradient(cell),
      trigger: getTriggerCell(level, tx, ty)
    };
  }

  function sampleWalkableSurface(level, x, y, options = {}) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const blocker = getBlockerCell(level, tx, ty);

    if (blocker) {
      if (blocker.walkableTop && options.includeWalkableBlockers !== false) {
        return {
          source: 'blocker',
          cell: blocker,
          tx,
          ty,
          u: x - tx,
          v: y - ty,
          z: blocker.top,
          gradient: { gx: 0, gy: 0 },
          trigger: getTriggerCell(level, tx, ty)
        };
      }

      return null;
    }

    return sampleSurfaceOnly(level, x, y);
  }

  function sampleVisualSurface(level, x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const blocker = getBlockerCell(level, tx, ty);
    const surface = sampleSurfaceOnly(level, x, y);

    if (blocker) {
      return {
        source: 'blocker',
        cell: blocker,
        tx,
        ty,
        u: x - tx,
        v: y - ty,
        z: blocker.top,
        gradient: { gx: 0, gy: 0 },
        trigger: getTriggerCell(level, tx, ty)
      };
    }

    return surface;
  }

  function sampleSupportSurface(level, x, y, radius = 0.18, clearance = 0.72, options = {}) {
    const minRatio = options.minRatio ?? 0.45;
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
    let center = null;

    for (const [ox, oy] of offsets) {
      const sample = sampleWalkableSurface(level, x + ox, y + oy, options);
      if (ox === 0 && oy === 0) {
        center = sample;
      }
      if (sample) {
        samples.push(sample);
      }
    }

    if (!samples.length) return null;

    const supportRatio = samples.length / offsets.length;
    if (supportRatio < minRatio) return null;

    const bestSample = center || samples.reduce((best, sample) => {
      if (!best) return sample;
      return sample.z > best.z ? sample : best;
    }, null);

    let gx = 0;
    let gy = 0;
    for (const sample of samples) {
      gx += sample.gradient?.gx ?? 0;
      gy += sample.gradient?.gy ?? 0;
    }

    return {
      ...bestSample,
      centerSample: center,
      supportSamples: samples,
      supportRatio,
      minSupportZ: Math.min(...samples.map((sample) => sample.z)),
      maxSupportZ: Math.max(...samples.map((sample) => sample.z)),
      z: center ? center.z : bestSample.z,
      gradient: {
        gx: gx / samples.length,
        gy: gy / samples.length
      }
    };
  }

  function getBlockerTop(level, tx, ty) {
    const blocker = getBlockerCell(level, tx, ty);
    if (!blocker) return null;
    return blocker.top;
  }

  function getFillTopAtCell(level, tx, ty, options = {}) {
    const includeNonWalkableBlockers = options.includeNonWalkableBlockers !== false;
    const blocker = getBlockerCell(level, tx, ty);
    const surface = getSurfaceCell(level, tx, ty);
    let best = level?.voidFloor ?? -1.5;

    if (surface && surface.kind !== 'void') {
      best = Math.max(best, getSurfaceTopZ(surface));
    }

    if (blocker) {
      if (includeNonWalkableBlockers || blocker.walkableTop) {
        best = Math.max(best, blocker.top);
      }
    }

    return best;
  }

  function createDeterministicRandom(seed) {
    let state = seed >>> 0;
    if (state === 0) {
      state = 0x9e3779b9;
    }

    return function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0xffffffff;
    };
  }

  function hashSeed(value) {
    const text = String(value ?? 'marble');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function buildTrainingRun() {
    const level = createLevelShell({
      id: 'training_run',
      name: 'Downhill Test',
      width: 18,
      height: 18,
      killZ: -3.5,
      voidFloor: -1.5,
      start: { x: 2.5, y: 2.5 },
      reward: {
        presses: 5000,
        unlocks: ['marble_training_complete'],
        claimKey: 'training_run'
      }
    });

    fillSurfaceRect(level, 1, 1, 3, 3, { h: 5 });
    fillSurfaceRect(level, 4, 1, 1, 3, { h: 4, slope: 'E' });
    fillSurfaceRect(level, 5, 1, 3, 3, { h: 4 });
    fillSurfaceRect(level, 5, 4, 3, 1, { h: 3, slope: 'S' });
    fillSurfaceRect(level, 5, 5, 3, 3, { h: 3 });
    fillSurfaceRect(level, 8, 6, 4, 2, { h: 3 });
    fillSurfaceRect(level, 12, 6, 1, 2, { h: 2, slope: 'E' });
    fillSurfaceRect(level, 13, 6, 3, 3, { h: 2 });
    fillSurfaceRect(level, 14, 9, 2, 1, { h: 1, slope: 'S' });
    fillSurfaceRect(level, 14, 10, 2, 4, { h: 1 });
    fillSurfaceRect(level, 15, 14, 1, 2, { h: 1 });

    setGoal(level, 15, 15, 0.42);

    setBlocker(level, 8, 5, { top: 4, walkableTop: false });
    setBlocker(level, 9, 5, { top: 4, walkableTop: false });
    setBlocker(level, 12, 9, { top: 3, walkableTop: false });
    setBlocker(level, 16, 10, { top: 3, walkableTop: false });

    return level;
  }

  function buildSwitchbackBasin() {
    const level = createLevelShell({
      id: 'switchback_basin',
      name: 'Switchback Test',
      width: 18,
      height: 18,
      killZ: -4,
      voidFloor: -2,
      start: { x: 2.5, y: 2.5 },
      reward: {
        presses: 25000,
        unlocks: ['marble_switchback_complete'],
        claimKey: 'switchback_basin'
      }
    });

    fillSurfaceRect(level, 1, 1, 3, 3, { h: 4 });
    fillSurfaceRect(level, 4, 2, 4, 1, { h: 4 });
    fillSurfaceRect(level, 8, 1, 3, 3, { h: 4 });
    fillSurfaceRect(level, 9, 4, 1, 3, { h: 4 });
    fillSurfaceRect(level, 8, 7, 3, 3, { h: 4 });
    fillSurfaceRect(level, 11, 8, 3, 1, { h: 4 });
    fillSurfaceRect(level, 14, 7, 2, 3, { h: 4 });
    fillSurfaceRect(level, 15, 10, 1, 3, { h: 4 });
    fillSurfaceRect(level, 13, 13, 3, 3, { h: 4 });

    setTrigger(level, 8, 1, { kind: 'hazard' });
    setTrigger(level, 10, 2, { kind: 'hazard' });
    setTrigger(level, 10, 7, { kind: 'hazard' });
    setTrigger(level, 8, 8, { kind: 'hazard' });
    setTrigger(level, 13, 14, { kind: 'hazard' });
    setTrigger(level, 14, 13, { kind: 'hazard' });
    setGoal(level, 14, 14, 0.42);

    setBlocker(level, 11, 2, { top: 5, walkableTop: false });
    setBlocker(level, 7, 8, { top: 5, walkableTop: false });
    setBlocker(level, 14, 6, { top: 5, walkableTop: false });

    return level;
  }

  function buildNeedleGauntlet() {
    const level = createLevelShell({
      id: 'needle_gauntlet',
      name: 'Needle Test',
      width: 22,
      height: 18,
      killZ: -5,
      voidFloor: -2.5,
      start: { x: 2, y: 2 },
      reward: {
        presses: 125000,
        unlocks: ['marble_needle_complete'],
        claimKey: 'needle_gauntlet'
      }
    });

    fillSurfaceRect(level, 1, 1, 2, 2, { h: 5 });
    fillSurfaceRect(level, 3, 1, 5, 1, { h: 5 });
    fillSurfaceRect(level, 7, 2, 1, 4, { h: 5 });
    fillSurfaceRect(level, 8, 5, 5, 1, { h: 5 });
    fillSurfaceRect(level, 12, 6, 1, 4, { h: 5 });
    fillSurfaceRect(level, 9, 10, 3, 1, { h: 5 });
    fillSurfaceRect(level, 9, 11, 1, 3, { h: 5 });
    fillSurfaceRect(level, 10, 13, 5, 1, { h: 5 });
    fillSurfaceRect(level, 14, 10, 1, 4, { h: 5 });
    fillSurfaceRect(level, 15, 10, 4, 1, { h: 5 });
    fillSurfaceRect(level, 18, 11, 1, 5, { h: 5 });
    fillSurfaceRect(level, 17, 15, 2, 2, { h: 5 });

    setTrigger(level, 18, 16, { kind: 'hazard' });
    setTrigger(level, 18, 15, { kind: 'hazard' });
    setGoal(level, 17, 15, 0.4);

    setBlocker(level, 8, 2, { top: 6, walkableTop: false });
    setBlocker(level, 13, 9, { top: 6, walkableTop: false });
    setBlocker(level, 15, 14, { top: 6, walkableTop: false });

    return level;
  }

  function buildFixtureSingleTileLedge() {
    const level = createLevelShell({
      id: 'fixture_single_tile_ledge',
      name: 'Fixture: Single Tile Ledge',
      width: 8,
      height: 8,
      killZ: -3,
      voidFloor: -2,
      start: { x: 2.5, y: 3.5 },
      reward: { presses: 0 },
      fixture: true
    });

    fillSurfaceRect(level, 2, 3, 2, 2, { h: 3 });
    setSurface(level, 4, 4, { h: 3 });
    setGoal(level, 4, 4, 0.32);
    return level;
  }

  function buildFixtureHalfWallOcclusion() {
    const level = createLevelShell({
      id: 'fixture_half_wall_occlusion',
      name: 'Fixture: Half Wall Occlusion',
      width: 8,
      height: 8,
      killZ: -3,
      voidFloor: -2,
      start: { x: 2.5, y: 2.5 },
      reward: { presses: 0 },
      fixture: true
    });

    fillSurfaceRect(level, 1, 1, 5, 5, { h: 3 });
    setBlocker(level, 4, 3, { top: 5, walkableTop: false });
    setGoal(level, 5, 4, 0.32);
    return level;
  }

  function buildFixtureGapJumpLower() {
    const level = createLevelShell({
      id: 'fixture_gap_jump_lower',
      name: 'Fixture: Gap Jump To Lower',
      width: 10,
      height: 8,
      killZ: -4,
      voidFloor: -2.5,
      start: { x: 2.5, y: 3.5 },
      reward: { presses: 0 },
      fixture: true
    });

    fillSurfaceRect(level, 1, 2, 2, 3, { h: 4 });
    fillSurfaceRect(level, 5, 2, 3, 3, { h: 2 });
    setGoal(level, 7, 3, 0.34);
    return level;
  }

  function buildFixtureLandingBesideWall() {
    const level = createLevelShell({
      id: 'fixture_landing_beside_wall',
      name: 'Fixture: Landing Beside Wall',
      width: 10,
      height: 8,
      killZ: -4,
      voidFloor: -2.5,
      start: { x: 2.5, y: 3.5 },
      reward: { presses: 0 },
      fixture: true
    });

    fillSurfaceRect(level, 1, 2, 2, 3, { h: 4 });
    fillSurfaceRect(level, 5, 2, 3, 3, { h: 4 });
    setBlocker(level, 5, 4, { top: 6, walkableTop: false });
    setGoal(level, 7, 3, 0.34);
    return level;
  }

  function buildFixtureDiagonalCorner() {
    const level = createLevelShell({
      id: 'fixture_diagonal_corner',
      name: 'Fixture: Diagonal Corner Hit',
      width: 8,
      height: 8,
      killZ: -3,
      voidFloor: -2,
      start: { x: 2.2, y: 2.2 },
      reward: { presses: 0 },
      fixture: true
    });

    fillSurfaceRect(level, 1, 1, 6, 6, { h: 3 });
    setBlocker(level, 4, 3, { top: 5, walkableTop: false });
    setBlocker(level, 5, 4, { top: 5, walkableTop: false });
    setGoal(level, 6, 5, 0.32);
    return level;
  }

  function buildFixtureUnwalkableWallTop() {
    const level = createLevelShell({
      id: 'fixture_unwalkable_wall_top',
      name: 'Fixture: Unwalkable Wall Top',
      width: 9,
      height: 8,
      killZ: -4,
      voidFloor: -2,
      start: { x: 2.5, y: 3.5 },
      reward: { presses: 0 },
      fixture: true
    });

    fillSurfaceRect(level, 1, 2, 6, 3, { h: 3 });
    setBlocker(level, 4, 3, { top: 5, walkableTop: false });
    setGoal(level, 6, 3, 0.32);
    return level;
  }

  function buildFixtureGoalOnSlope() {
    const level = createLevelShell({
      id: 'fixture_goal_on_slope',
      name: 'Fixture: Goal On Slope',
      width: 8,
      height: 8,
      killZ: -3,
      voidFloor: -2,
      start: { x: 2.5, y: 4.5 },
      reward: { presses: 0 },
      fixture: true
    });

    fillSurfaceRect(level, 1, 4, 2, 2, { h: 3 });
    fillSurfaceRect(level, 3, 4, 1, 2, { h: 2, slope: 'E' });
    fillSurfaceRect(level, 4, 4, 2, 2, { h: 2 });
    setGoal(level, 3, 4, 0.32);
    return level;
  }

  function buildFixtureStackedFall() {
    const level = createLevelShell({
      id: 'fixture_stacked_fall',
      name: 'Fixture: Falling Past Stacks',
      width: 10,
      height: 10,
      killZ: -5,
      voidFloor: -3,
      start: { x: 2.5, y: 2.5 },
      reward: { presses: 0 },
      fixture: true
    });

    fillSurfaceRect(level, 1, 1, 3, 3, { h: 5 });
    fillSurfaceRect(level, 5, 4, 3, 3, { h: 2 });
    setBlocker(level, 4, 2, { top: 7, walkableTop: false });
    setBlocker(level, 5, 3, { top: 6, walkableTop: false });
    setGoal(level, 7, 6, 0.34);
    return level;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function addTrack(level, x, y, w = 1, h = 1, patch = {}) {
    fillSurfaceRect(level, x, y, w, h, { h: patch.h ?? 3, slope: patch.slope ?? null });
  }

  function addHazardStrip(level, x, y, count, vertical = false) {
    for (let i = 0; i < count; i += 1) {
      setTrigger(level, x + (vertical ? 0 : i), y + (vertical ? i : 0), { kind: 'hazard' });
    }
  }

  function generateCourseFromSpec(spec = {}) {
    const levelNumber = spec.level ?? 1;
    const length = Math.max(1, Math.floor(spec.length ?? 6));
    const complexity = Math.max(1, Math.floor(spec.complexity ?? 1));
    const seed = spec.seed ?? hashSeed(`generated:${levelNumber}:${length}:${complexity}`);
    const rng = createDeterministicRandom(seed);
    const screenWidth = 6;
    const width = length * screenWidth + 4;
    const height = 10;
    const level = createLevelShell({
      id: spec.id || `generated_${levelNumber}_${length}_${complexity}_${seed}`,
      name: spec.name || `Generated ${levelNumber}-${length}-${complexity}`,
      width,
      height,
      killZ: -6,
      voidFloor: -3,
      start: { x: 2.5, y: 4.5 },
      reward: { presses: 0 },
      generated: true,
      generatorSpec: {
        level: levelNumber,
        length,
        complexity,
        seed
      }
    });

    let cursorX = 1;
    let cursorY = 4;
    let currentHeight = 5;
    let remainingBudget = length * complexity;

    addTrack(level, cursorX, cursorY, 2, 2, { h: currentHeight });

    const templates = [
      {
        id: 'flat',
        cost: 1,
        weight: 6,
        build() {
          addTrack(level, cursorX + 2, cursorY, 4, 2, { h: currentHeight });
          cursorX += 4;
        }
      },
      {
        id: 'slope',
        cost: 2,
        weight: 5,
        build() {
          addTrack(level, cursorX + 2, cursorY, 1, 2, { h: currentHeight, slope: rng() < 0.5 ? 'E' : 'W' });
          currentHeight = Math.max(1, currentHeight - 1);
          addTrack(level, cursorX + 3, cursorY, 3, 2, { h: currentHeight });
          cursorX += 4;
        }
      },
      {
        id: 'hazard_lane',
        cost: 3,
        weight: 4,
        build() {
          addTrack(level, cursorX + 2, cursorY, 4, 2, { h: currentHeight });
          addHazardStrip(level, cursorX + 3, cursorY + (rng() < 0.5 ? 0 : 1), 2, false);
          cursorX += 4;
        }
      },
      {
        id: 'chicane',
        cost: 4,
        weight: 3,
        build() {
          const shift = rng() < 0.5 ? -1 : 1;
          cursorY = clamp(cursorY + shift, 2, 6);
          addTrack(level, cursorX + 2, cursorY, 4, 1, { h: currentHeight });
          setBlocker(level, cursorX + 4, clamp(cursorY + (shift > 0 ? -1 : 1), 1, 7), { top: currentHeight + 2, walkableTop: false });
          cursorX += 4;
        }
      },
      {
        id: 'jump_drop',
        cost: 5,
        weight: 2,
        build() {
          addTrack(level, cursorX + 2, cursorY, 1, 2, { h: currentHeight });
          currentHeight = Math.max(1, currentHeight - 2);
          addTrack(level, cursorX + 5, cursorY, 2, 2, { h: currentHeight });
          cursorX += 5;
        }
      },
      {
        id: 'needle',
        cost: 6,
        weight: 1,
        build() {
          addTrack(level, cursorX + 2, cursorY, 5, 1, { h: currentHeight });
          if (rng() < 0.5) {
            addHazardStrip(level, cursorX + 3, cursorY, 1);
            addHazardStrip(level, cursorX + 5, cursorY, 1);
          }
          cursorX += 5;
        }
      }
    ];

    for (let i = 0; i < length - 1; i += 1) {
      const averageBudget = remainingBudget / Math.max(1, (length - 1 - i));
      const allowed = templates.filter((template) => template.cost <= Math.max(1, averageBudget + 2));
      const weighted = [];

      for (const template of allowed) {
        const weightBias = Math.max(1, Math.round(template.weight + (complexity - template.cost) * 0.4));
        for (let count = 0; count < weightBias; count += 1) {
          weighted.push(template);
        }
      }

      const chosen = weighted[Math.floor(rng() * weighted.length)] || templates[0];
      chosen.build();
      remainingBudget = Math.max(0, remainingBudget - chosen.cost);
    }

    addTrack(level, cursorX + 2, cursorY, 3, 2, { h: currentHeight });
    setGoal(level, cursorX + 4, cursorY, 0.36);

    return level;
  }

  function registerGeneratedLevel(level) {
    const existingIndex = GENERATED_LEVELS.findIndex((item) => item.id === level.id);
    if (existingIndex >= 0) {
      GENERATED_LEVELS.splice(existingIndex, 1, level);
    } else {
      GENERATED_LEVELS.push(level);
    }
    return level;
  }

  const LEVELS = [
    buildTrainingRun(),
    buildSwitchbackBasin(),
    buildNeedleGauntlet()
  ];

  const FIXTURE_LEVELS = [
    buildFixtureSingleTileLedge(),
    buildFixtureHalfWallOcclusion(),
    buildFixtureGapJumpLower(),
    buildFixtureLandingBesideWall(),
    buildFixtureDiagonalCorner(),
    buildFixtureUnwalkableWallTop(),
    buildFixtureGoalOnSlope(),
    buildFixtureStackedFall()
  ];

  function getAllLevels() {
    return [...LEVELS, ...FIXTURE_LEVELS, ...GENERATED_LEVELS];
  }

  function getLevelById(id) {
    return getAllLevels().find((level) => level.id === id) || LEVELS[0];
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
    if (index < 0) {
      return true;
    }
    if (index === 0) return true;
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
    FIXTURE_LEVELS,
    GENERATED_LEVELS,
    getAllLevels,
    getLevelById,
    getLevelIndex,
    getNextLevelId,
    getUnlockedLevelIds,
    isLevelUnlocked,
    registerGeneratedLevel,
    generateCourseFromSpec,
    createDeterministicRandom,
    hashSeed,
    getSurfaceCell,
    getBlockerCell,
    getTriggerCell,
    getSurfaceCornerHeights,
    getSurfaceTopZ,
    getSurfaceGradient,
    getBlockerTop,
    getFillTopAtCell,
    sampleSurfaceOnly,
    sampleWalkableSurface,
    sampleVisualSurface,
    sampleSupportSurface,
    setGoal
  };
})();
