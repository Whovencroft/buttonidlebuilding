(() => {
  const GENERATED_LEVELS = [];
  const MAIN_LEVEL_IDS = [];

  const SHAPES = {
    FLAT: 'flat',
    SLOPE_N: 'slope_n',
    SLOPE_S: 'slope_s',
    SLOPE_E: 'slope_e',
    SLOPE_W: 'slope_w',
    DIAG_NE: 'diag_ne',
    DIAG_NW: 'diag_nw',
    DIAG_SE: 'diag_se',
    DIAG_SW: 'diag_sw',
    CURVE_CONVEX_NE: 'curve_convex_ne',
    CURVE_CONVEX_NW: 'curve_convex_nw',
    CURVE_CONVEX_SE: 'curve_convex_se',
    CURVE_CONVEX_SW: 'curve_convex_sw',
    CURVE_CONCAVE_NE: 'curve_concave_ne',
    CURVE_CONCAVE_NW: 'curve_concave_nw',
    CURVE_CONCAVE_SE: 'curve_concave_se',
    CURVE_CONCAVE_SW: 'curve_concave_sw',
    DROP_RAMP_N: 'drop_ramp_n',
    DROP_RAMP_S: 'drop_ramp_s',
    DROP_RAMP_E: 'drop_ramp_e',
    DROP_RAMP_W: 'drop_ramp_w',
    LANDING_PAD: 'landing_pad'
  };

  const ACTOR_KINDS = {
    MOVING_PLATFORM: 'moving_platform',
    ELEVATOR: 'elevator',
    ROTATING_BAR: 'rotating_bar',
    SWEEPER: 'sweeper',
    TIMED_GATE: 'timed_gate'
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothStep(t) {
    return t * t * (3 - 2 * t);
  }

  function toKey(tx, ty) {
    return `${tx},${ty}`;
  }

  function createDeterministicRandom(seed) {
    let state = seed >>> 0;
    if (state === 0) state = 0x9e3779b9;
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

  function makeVoidSurfaceCell() {
    return {
      kind: 'void',
      shape: SHAPES.FLAT,
      baseHeight: 0,
      rise: 0,
      friction: 1,
      conveyor: null,
      bounce: 0,
      crumble: null,
      failType: null,
      landingPad: false,
      data: null
    };
  }

  function inferShapeRise(shape, patchRise) {
    if (typeof patchRise === 'number') return patchRise;
    if (!shape) return 0;
    if (shape.startsWith('slope_') || shape.startsWith('diag_')) return 1;
    if (shape.startsWith('drop_ramp_')) return -1.4;
    return 0;
  }

  function normalizeSurfaceCell(patch = {}) {
    const shape = patch.shape ?? (patch.slope ? `slope_${String(patch.slope).toLowerCase()}` : SHAPES.FLAT);
    const baseHeight = patch.baseHeight ?? patch.h ?? 0;
    const rise = inferShapeRise(shape, patch.rise);
    return {
      kind: patch.kind ?? 'track',
      shape,
      baseHeight,
      rise,
      friction: patch.friction ?? 1,
      conveyor: patch.conveyor ? {
        x: patch.conveyor.x ?? 0,
        y: patch.conveyor.y ?? 0,
        strength: patch.conveyor.strength ?? 1
      } : null,
      bounce: patch.bounce ?? 0,
      crumble: patch.crumble ? {
        delay: patch.crumble.delay ?? 0.32,
        downtime: patch.crumble.downtime ?? 1.8,
        respawnEase: patch.crumble.respawnEase ?? 0.5
      } : null,
      failType: patch.failType ?? null,
      landingPad: !!patch.landingPad || shape === SHAPES.LANDING_PAD,
      data: patch.data ?? null
    };
  }

  function normalizeBlockerCell(patch = {}) {
    const top = patch.top ?? patch.h ?? 1;
    return {
      kind: patch.kind ?? 'wall',
      top,
      walkableTop: !!patch.walkableTop,
      transparent: !!patch.transparent,
      timed: patch.timed ?? null,
      data: patch.data ?? null
    };
  }

  function normalizeTriggerCell(patch = {}) {
    return {
      kind: patch.kind ?? 'goal',
      radius: patch.radius ?? null,
      data: patch.data ?? null
    };
  }

  function normalizeActor(actor = {}, index = 0) {
    return {
      id: actor.id ?? `${actor.kind || 'actor'}_${index}`,
      kind: actor.kind ?? ACTOR_KINDS.MOVING_PLATFORM,
      x: actor.x ?? 0,
      y: actor.y ?? 0,
      z: actor.z ?? 0,
      width: actor.width ?? 1,
      height: actor.height ?? 1,
      radius: actor.radius ?? 0.35,
      topHeight: actor.topHeight ?? actor.z ?? 0,
      friction: actor.friction ?? 1,
      conveyor: actor.conveyor ? {
        x: actor.conveyor.x ?? 0,
        y: actor.conveyor.y ?? 0,
        strength: actor.conveyor.strength ?? 1
      } : null,
      bounce: actor.bounce ?? 0,
      fatal: !!actor.fatal,
      pushes: actor.pushes !== false,
      armLength: actor.armLength ?? 1.5,
      armWidth: actor.armWidth ?? 0.26,
      angularSpeed: actor.angularSpeed ?? 1.2,
      startAngle: actor.startAngle ?? 0,
      cycle: actor.cycle ?? 2.6,
      openDuration: actor.openDuration ?? 1.3,
      closedDuration: actor.closedDuration ?? 1.3,
      path: actor.path ? {
        type: actor.path.type ?? 'ping_pong',
        speed: actor.path.speed ?? 1,
        points: (actor.path.points ?? []).map((point) => ({
          x: point.x ?? 0,
          y: point.y ?? 0,
          z: point.z ?? actor.z ?? 0
        }))
      } : null,
      travel: actor.travel ? {
        axis: actor.travel.axis ?? 'z',
        min: actor.travel.min ?? actor.z ?? 0,
        max: actor.travel.max ?? (actor.z ?? 0) + 2,
        speed: actor.travel.speed ?? 1,
        cycle: actor.travel.cycle ?? null
      } : null,
      data: actor.data ?? null
    };
  }

  function createGrid(width, height, factory = null) {
    return Array.from({ length: height }, () =>
      Array.from({ length: width }, () => (factory ? factory() : null))
    );
  }

  function getGridCell(grid, tx, ty) {
    if (!grid) return null;
    const iy = Math.floor(ty);
    const ix = Math.floor(tx);
    if (iy < 0 || iy >= grid.length) return null;
    if (ix < 0 || ix >= (grid[iy]?.length ?? 0)) return null;
    return grid[iy][ix] ?? null;
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
    generatorSpec = null,
    routeGraph = null,
    templates = []
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
      routeGraph: routeGraph || { nodes: [], edges: [] },
      templates,
      surface: createGrid(width, height, () => makeVoidSurfaceCell()),
      blockers: createGrid(width, height, null),
      triggers: createGrid(width, height, null),
      actors: [],
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

  function setTrigger(level, x, y, patch) {
    setGridCell(level.triggers, x, y, normalizeTriggerCell(patch));
  }

  function setGoal(level, x, y, radius = 0.42) {
    // Level design guideline: goals must be placed on flat, non-bounce, non-crumble terrain tiles.
    const cell = getSurfaceCell(level, x, y);
    if (cell) {
      if (cell.kind === 'void') {
        console.warn(`[LevelDesign] setGoal at (${x},${y}) is on a void tile — goal will be unreachable.`);
      } else if (cell.shape !== SHAPES.FLAT) {
        console.warn(`[LevelDesign] setGoal at (${x},${y}) is on a non-flat tile (shape='${cell.shape}') — marble may slide through goal.`);
      } else if (cell.bounce > 0) {
        console.warn(`[LevelDesign] setGoal at (${x},${y}) is on a bounce tile (bounce=${cell.bounce}) — marble will be deflected away from goal.`);
      } else if (cell.crumble) {
        console.warn(`[LevelDesign] setGoal at (${x},${y}) is on a crumble tile — goal surface may disappear before marble arrives.`);
      }
    }
    setTrigger(level, x, y, { kind: 'goal', radius });
    level.goal = { x: x + 0.5, y: y + 0.5, radius };
  }

  function addActor(level, actor) {
    // Level design guideline: moving platforms should be positioned outside terrain
    // (except elevators, which may interact with terrain vertically).
    if (actor.kind === ACTOR_KINDS.MOVING_PLATFORM && actor.path) {
      const points = actor.path.points ?? [];
      for (const pt of points) {
        const cell = getSurfaceCell(level, Math.floor(pt.x), Math.floor(pt.y));
        if (cell && cell.kind !== 'void') {
          console.warn(`[LevelDesign] Moving platform '${actor.id || 'unknown'}' path point (${pt.x},${pt.y}) overlaps terrain tile — platform may clip through geometry.`);
        }
      }
    }
    level.actors.push(normalizeActor(actor, level.actors.length));
  }

  function addGraphNode(level, node) {
    level.routeGraph.nodes.push({ ...node });
  }

  function addGraphEdge(level, edge) {
    level.routeGraph.edges.push({ ...edge });
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

  function getShapeHeight(shape, baseHeight, rise, u, v) {
    const uu = clamp(u, 0, 1);
    const vv = clamp(v, 0, 1);
    switch (shape) {
      case SHAPES.SLOPE_N:
        return baseHeight + rise * (1 - vv);
      case SHAPES.SLOPE_S:
        return baseHeight + rise * vv;
      case SHAPES.SLOPE_E:
        return baseHeight + rise * uu;
      case SHAPES.SLOPE_W:
        return baseHeight + rise * (1 - uu);
      case SHAPES.DIAG_NE:
        return baseHeight + rise * ((uu + (1 - vv)) * 0.5);
      case SHAPES.DIAG_NW:
        return baseHeight + rise * (((1 - uu) + (1 - vv)) * 0.5);
      case SHAPES.DIAG_SE:
        return baseHeight + rise * ((uu + vv) * 0.5);
      case SHAPES.DIAG_SW:
        return baseHeight + rise * (((1 - uu) + vv) * 0.5);
      case SHAPES.DROP_RAMP_N:
        return baseHeight + rise * smoothStep(vv);
      case SHAPES.DROP_RAMP_S:
        return baseHeight + rise * smoothStep(1 - vv);
      case SHAPES.DROP_RAMP_E:
        return baseHeight + rise * smoothStep(1 - uu);
      case SHAPES.DROP_RAMP_W:
        return baseHeight + rise * smoothStep(uu);
      default:
        return baseHeight;
    }
  }

  function isPointInsideCurveMask(shape, u, v) {
    const uu = clamp(u, 0, 1);
    const vv = clamp(v, 0, 1);
    const radius = 0.8;
    const cut = 0.48;
    const dxNE = 1 - uu;
    const dyNE = vv;
    const dxNW = uu;
    const dyNW = vv;
    const dxSE = 1 - uu;
    const dySE = 1 - vv;
    const dxSW = uu;
    const dySW = 1 - vv;

    if (shape === SHAPES.CURVE_CONVEX_NE) return Math.hypot(dxNE, dyNE) >= cut;
    if (shape === SHAPES.CURVE_CONVEX_NW) return Math.hypot(dxNW, dyNW) >= cut;
    if (shape === SHAPES.CURVE_CONVEX_SE) return Math.hypot(dxSE, dySE) >= cut;
    if (shape === SHAPES.CURVE_CONVEX_SW) return Math.hypot(dxSW, dySW) >= cut;
    if (shape === SHAPES.CURVE_CONCAVE_NE) return Math.hypot(dxNE, dyNE) <= radius;
    if (shape === SHAPES.CURVE_CONCAVE_NW) return Math.hypot(dxNW, dyNW) <= radius;
    if (shape === SHAPES.CURVE_CONCAVE_SE) return Math.hypot(dxSE, dySE) <= radius;
    if (shape === SHAPES.CURVE_CONCAVE_SW) return Math.hypot(dxSW, dySW) <= radius;
    return true;
  }

  function getCurveBank(shape, u, v) {
    const uu = clamp(u, 0, 1);
    const vv = clamp(v, 0, 1);
    let dx = 0;
    let dy = 0;

    switch (shape) {
      case SHAPES.CURVE_CONVEX_NE:
      case SHAPES.CURVE_CONCAVE_NE:
        dx = 1 - uu;
        dy = vv;
        break;
      case SHAPES.CURVE_CONVEX_NW:
      case SHAPES.CURVE_CONCAVE_NW:
        dx = uu;
        dy = vv;
        break;
      case SHAPES.CURVE_CONVEX_SE:
      case SHAPES.CURVE_CONCAVE_SE:
        dx = 1 - uu;
        dy = 1 - vv;
        break;
      case SHAPES.CURVE_CONVEX_SW:
      case SHAPES.CURVE_CONCAVE_SW:
        dx = uu;
        dy = 1 - vv;
        break;
      default:
        return 0;
    }

    const distance = clamp(Math.hypot(dx, dy), 0, 1);
    return (1 - distance) * 0.18;
  }

  function getSurfaceSampleForCell(cell, u, v) {
    if (!cell || cell.kind === 'void') return null;
    if (!isPointInsideCurveMask(cell.shape, u, v)) return null;

    const z = getShapeHeight(cell.shape, cell.baseHeight, cell.rise, u, v) + getCurveBank(cell.shape, u, v);
    const epsilon = 0.0025;
    const zX1 = getShapeHeight(cell.shape, cell.baseHeight, cell.rise, clamp(u + epsilon, 0, 1), v) + getCurveBank(cell.shape, clamp(u + epsilon, 0, 1), v);
    const zX0 = getShapeHeight(cell.shape, cell.baseHeight, cell.rise, clamp(u - epsilon, 0, 1), v) + getCurveBank(cell.shape, clamp(u - epsilon, 0, 1), v);
    const zY1 = getShapeHeight(cell.shape, cell.baseHeight, cell.rise, u, clamp(v + epsilon, 0, 1)) + getCurveBank(cell.shape, u, clamp(v + epsilon, 0, 1));
    const zY0 = getShapeHeight(cell.shape, cell.baseHeight, cell.rise, u, clamp(v - epsilon, 0, 1)) + getCurveBank(cell.shape, u, clamp(v - epsilon, 0, 1));

    return {
      z,
      gradient: {
        gx: (zX1 - zX0) / (epsilon * 2),
        gy: (zY1 - zY0) / (epsilon * 2)
      }
    };
  }

  function getSurfaceCornerHeights(cell) {
    if (!cell || cell.kind === 'void') {
      return { nw: 0, ne: 0, se: 0, sw: 0 };
    }

    const sampleNW = getSurfaceSampleForCell(cell, 0, 0) || { z: cell.baseHeight };
    const sampleNE = getSurfaceSampleForCell(cell, 1, 0) || { z: cell.baseHeight };
    const sampleSE = getSurfaceSampleForCell(cell, 1, 1) || { z: cell.baseHeight };
    const sampleSW = getSurfaceSampleForCell(cell, 0, 1) || { z: cell.baseHeight };

    return {
      nw: sampleNW.z,
      ne: sampleNE.z,
      se: sampleSE.z,
      sw: sampleSW.z
    };
  }

  function getSurfaceTopZ(cell) {
    const h = getSurfaceCornerHeights(cell);
    return Math.max(h.nw, h.ne, h.se, h.sw);
  }

  function getSurfaceGradient(cell) {
    const sample = getSurfaceSampleForCell(cell, 0.5, 0.5);
    return sample ? sample.gradient : { gx: 0, gy: 0 };
  }

  function getBrokenCrumbleState(runtime, tx, ty) {
    if (!runtime?.crumble) return null;
    return runtime.crumble[toKey(tx, ty)] ?? null;
  }

  function isCrumbleBroken(runtime, tx, ty) {
    const state = getBrokenCrumbleState(runtime, tx, ty);
    return !!(state && state.broken);
  }

  function sampleStaticSurfaceOnly(level, runtime, x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cell = getSurfaceCell(level, tx, ty);

    if (!cell || cell.kind === 'void') {
      return null;
    }

    if (cell.crumble && isCrumbleBroken(runtime, tx, ty)) {
      return null;
    }

    const u = x - tx;
    const v = y - ty;
    const sample = getSurfaceSampleForCell(cell, u, v);
    if (!sample) return null;

    return {
      source: 'surface',
      cell,
      tx,
      ty,
      u,
      v,
      z: sample.z,
      gradient: sample.gradient,
      trigger: getTriggerCell(level, tx, ty),
      friction: cell.friction ?? 1,
      conveyor: cell.conveyor ?? null,
      bounce: cell.bounce ?? 0,
      failType: cell.failType ?? null,
      landingPad: !!cell.landingPad
    };
  }

  function getActorWorldState(actor, runtime) {
    const state = runtime?.actors?.[actor.id];
    if (!state) {
      return {
        x: actor.x,
        y: actor.y,
        z: actor.z,
        topHeight: actor.topHeight,
        active: true,
        angle: actor.startAngle ?? 0,
        dx: 0,
        dy: 0,
        dz: 0
      };
    }
    return state;
  }

  function getActorTopRect(actor, actorState) {
    return {
      minX: actorState.x,
      minY: actorState.y,
      maxX: actorState.x + actor.width,
      maxY: actorState.y + actor.height,
      z: actorState.topHeight
    };
  }

  function sampleActorSurface(level, runtime, x, y) {
    if (!runtime?.actors) return null;
    let best = null;

    for (const actor of level.actors) {
      if (actor.kind === ACTOR_KINDS.ROTATING_BAR || actor.kind === ACTOR_KINDS.SWEEPER || actor.kind === ACTOR_KINDS.TIMED_GATE) {
        continue;
      }

      const actorState = getActorWorldState(actor, runtime);
      if (actorState.active === false) continue;
      const rect = getActorTopRect(actor, actorState);
      if (x < rect.minX || x > rect.maxX || y < rect.minY || y > rect.maxY) continue;

      const sample = {
        source: 'actor',
        actor,
        actorState,
        tx: Math.floor(x),
        ty: Math.floor(y),
        u: x - Math.floor(x),
        v: y - Math.floor(y),
        z: rect.z,
        gradient: { gx: 0, gy: 0 },
        trigger: null,
        friction: actor.friction ?? 1,
        conveyor: actor.conveyor ?? null,
        bounce: actor.bounce ?? 0,
        failType: null,
        landingPad: false
      };

      if (!best || sample.z > best.z) {
        best = sample;
      }
    }

    return best;
  }

  const BLOCKER_TOP_SUPPORT_INSET = 0.26;

  function isPointSecurelyOnBlockerTop(tx, ty, x, y, inset = BLOCKER_TOP_SUPPORT_INSET) {
    return (
      x >= tx + inset &&
      x <= tx + 1 - inset &&
      y >= ty + inset &&
      y <= ty + 1 - inset
    );
  }

  function sampleWalkableSurface(level, x, y, options = {}) {
    const runtime = options.runtime ?? null;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const blocker = getBlockerCell(level, tx, ty);
    const actorSurface = sampleActorSurface(level, runtime, x, y);
    const staticSurface = sampleStaticSurfaceOnly(level, runtime, x, y);

    let blockerSurface = null;
    if (
      blocker?.walkableTop &&
      isPointSecurelyOnBlockerTop(tx, ty, x, y, options.blockerInset ?? BLOCKER_TOP_SUPPORT_INSET)
    ) {
      blockerSurface = {
        source: 'blocker',
        cell: blocker,
        tx,
        ty,
        u: x - tx,
        v: y - ty,
        z: blocker.top,
        gradient: { gx: 0, gy: 0 },
        trigger: getTriggerCell(level, tx, ty),
        friction: 1,
        conveyor: null,
        bounce: 0,
        failType: null,
        landingPad: false
      };
    }

    const candidates = [staticSurface, blockerSurface, actorSurface].filter(Boolean);
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.z - a.z);
    return candidates[0];
  }

  function sampleVisualSurface(level, x, y, runtime = null) {
    return sampleWalkableSurface(level, x, y, { runtime });
  }

function sampleSupportSurface(level, x, y, radius = 0.18, clearance = 0.72, options = {}) {
  const minRatio = options.minRatio ?? 0.45;
  const runtime = options.runtime ?? null;

  const outer = radius * clearance;
  const inner = outer * 0.62;
  const dOuter = outer * 0.7071;
  const dInner = inner * 0.7071;

  const offsets = [
    [0, 0, 2.4],

    [inner, 0, 1.5],
    [-inner, 0, 1.5],
    [0, inner, 1.5],
    [0, -inner, 1.5],

    [dInner, dInner, 1.15],
    [dInner, -dInner, 1.15],
    [-dInner, dInner, 1.15],
    [-dInner, -dInner, 1.15],

    [outer, 0, 0.8],
    [-outer, 0, 0.8],
    [0, outer, 0.8],
    [0, -outer, 0.8],

    [dOuter, dOuter, 0.65],
    [dOuter, -dOuter, 0.65],
    [-dOuter, dOuter, 0.65],
    [-dOuter, -dOuter, 0.65]
  ];

  const samples = [];
  let center = null;
  let hitWeight = 0;
  let totalWeight = 0;

  for (const [ox, oy, weight] of offsets) {
    totalWeight += weight;
    const sample = sampleWalkableSurface(level, x + ox, y + oy, { runtime });

    if (ox === 0 && oy === 0) {
      center = sample;
    }

    if (sample) {
      hitWeight += weight;
      samples.push({
        ...sample,
        _weight: weight
      });
    }
  }

  if (!samples.length) return null;

  const supportRatio = hitWeight / totalWeight;
  if (supportRatio < minRatio) return null;

  if (!center && supportRatio < Math.max(minRatio, 0.62)) {
    return null;
  }

  const anchorZ = center
    ? center.z
    : samples.reduce((sum, sample) => sum + sample.z * sample._weight, 0) /
      samples.reduce((sum, sample) => sum + sample._weight, 0);

  const coherentSamples = samples.filter((sample) => Math.abs(sample.z - anchorZ) <= 0.9);
  if (!coherentSamples.length) return null;

  const coherentBlockerWeight = coherentSamples
    .filter((sample) => sample.source === 'blocker')
    .reduce((sum, sample) => sum + sample._weight, 0);

  const coherentNonBlockerWeight = coherentSamples
    .filter((sample) => sample.source !== 'blocker')
    .reduce((sum, sample) => sum + sample._weight, 0);

  if (coherentBlockerWeight > coherentNonBlockerWeight) {
    if (!center || center.source !== 'blocker') {
      return null;
    }
  }

  let gx = 0;
  let gy = 0;
  let weightSum = 0;

  for (const sample of coherentSamples) {
    gx += (sample.gradient?.gx ?? 0) * sample._weight;
    gy += (sample.gradient?.gy ?? 0) * sample._weight;
    weightSum += sample._weight;
  }

  const bestSample = center || coherentSamples.reduce((best, sample) => {
    if (!best) return sample;
    return sample._weight > best._weight ? sample : best;
  }, null);

  return {
    ...bestSample,
    centerSample: center,
    supportSamples: coherentSamples,
    supportRatio,
    minSupportZ: Math.min(...coherentSamples.map((sample) => sample.z)),
    maxSupportZ: Math.max(...coherentSamples.map((sample) => sample.z)),
    z: center ? center.z : anchorZ,
    gradient: {
      gx: weightSum > 0 ? gx / weightSum : 0,
      gy: weightSum > 0 ? gy / weightSum : 0
    }
  };
}

  function getBlockerTop(level, tx, ty) {
    const blocker = getBlockerCell(level, tx, ty);
    if (!blocker) return null;
    return blocker.top;
  }

  function getFillTopAtCell(level, tx, ty, options = {}) {
    const runtime = options.runtime ?? null;
    // staticOnly: when true, skip actor height inflation so terrain geometry
    // is not affected by moving platforms passing through or resting on tiles.
    const staticOnly = options.staticOnly ?? false;
    const blocker = getBlockerCell(level, tx, ty);
    const surface = getSurfaceCell(level, tx, ty);
    let best = level?.voidFloor ?? -1.5;

    if (surface && surface.kind !== 'void' && !(surface.crumble && isCrumbleBroken(runtime, tx, ty))) {
      best = Math.max(best, getSurfaceTopZ(surface));
    }

    if (blocker) {
      best = Math.max(best, blocker.top);
    }

    if (!staticOnly && runtime?.actors) {
      for (const actor of level.actors) {
        const state = getActorWorldState(actor, runtime);
        if (state.active === false) continue;
        if (tx >= state.x && tx <= state.x + actor.width - 1 && ty >= state.y && ty <= state.y + actor.height - 1) {
          best = Math.max(best, state.topHeight);
        }
      }
    }

    return best;
  }

  function createDynamicState(level, seed) {
    const actors = {};
    for (const actor of level.actors) {
      actors[actor.id] = {
        x: actor.x,
        y: actor.y,
        z: actor.z,
        topHeight: actor.topHeight,
        angle: actor.startAngle ?? 0,
        active: true,
        dx: 0,
        dy: 0,
        dz: 0,
        progress: 0
      };
    }

    return {
      seed,
      clock: 0,
      actors,
      crumble: {}
    };
  }

  function updateActorState(actor, state, clock, dt) {
    const prev = { x: state.x, y: state.y, z: state.z, topHeight: state.topHeight };

    if (actor.kind === ACTOR_KINDS.MOVING_PLATFORM && actor.path?.points?.length >= 2) {
      const points = actor.path.points;
      const totalSegments = points.length - 1;
      const speed = Math.max(0.05, actor.path.speed ?? 1);
      const travel = (clock * speed) % (actor.path.type === 'loop' ? points.length : totalSegments * 2);
      let segmentIndex = 0;
      let t = 0;

      if (actor.path.type === 'loop') {
        segmentIndex = Math.floor(travel) % points.length;
        t = travel - Math.floor(travel);
        const a = points[segmentIndex];
        const b = points[(segmentIndex + 1) % points.length];
        state.x = lerp(a.x, b.x, t);
        state.y = lerp(a.y, b.y, t);
        state.z = lerp(a.z, b.z, t);
      } else {
        const cycle = totalSegments * 2;
        const ping = travel;
        const forward = ping < totalSegments;
        if (forward) {
          segmentIndex = Math.floor(ping);
          t = ping - segmentIndex;
          const a = points[segmentIndex];
          const b = points[Math.min(segmentIndex + 1, points.length - 1)];
          state.x = lerp(a.x, b.x, t);
          state.y = lerp(a.y, b.y, t);
          state.z = lerp(a.z, b.z, t);
        } else {
          const reverseTravel = ping - totalSegments;
          segmentIndex = Math.floor(reverseTravel);
          t = reverseTravel - segmentIndex;
          const a = points[Math.max(points.length - 1 - segmentIndex, 0)];
          const b = points[Math.max(points.length - 2 - segmentIndex, 0)];
          state.x = lerp(a.x, b.x, t);
          state.y = lerp(a.y, b.y, t);
          state.z = lerp(a.z, b.z, t);
        }
      }
      state.topHeight = state.z;
    } else if (actor.kind === ACTOR_KINDS.ELEVATOR && actor.travel) {
      const span = Math.max(0.001, actor.travel.max - actor.travel.min);
      const cycle = Math.max(0.4, actor.travel.cycle ?? (span / Math.max(0.05, actor.travel.speed)) * 2);
      const phase = ((clock % cycle) / cycle) * Math.PI * 2;
      const wave = (Math.sin(phase - Math.PI / 2) + 1) * 0.5;
      state.x = actor.x;
      state.y = actor.y;
      state.z = lerp(actor.travel.min, actor.travel.max, wave);
      state.topHeight = state.z;
    } else if (actor.kind === ACTOR_KINDS.TIMED_GATE) {
      const closedDuration = Math.max(0.1, actor.closedDuration ?? 1.3);
      const openDuration = Math.max(0.1, actor.openDuration ?? 1.3);
      const cycle = closedDuration + openDuration;
      const phase = clock % cycle;
      state.active = phase < closedDuration;
      state.x = actor.x;
      state.y = actor.y;
      state.z = actor.z;
      state.topHeight = actor.topHeight;
    } else if (actor.kind === ACTOR_KINDS.ROTATING_BAR || actor.kind === ACTOR_KINDS.SWEEPER) {
      state.x = actor.x;
      state.y = actor.y;
      state.z = actor.z;
      state.topHeight = actor.topHeight;
      state.angle = (actor.startAngle ?? 0) + clock * (actor.angularSpeed ?? 1.2);
      state.active = true;
    }

    state.dx = state.x - prev.x;
    state.dy = state.y - prev.y;
    state.dz = state.z - prev.z;
  }

  function advanceDynamicState(runtime, dt, occupiedSupport = null) {
    const state = runtime.dynamicState;
    state.clock += dt;

    for (const actor of runtime.level.actors) {
      updateActorState(actor, state.actors[actor.id], state.clock, dt);
    }

    for (const key of Object.keys(state.crumble)) {
      const item = state.crumble[key];
      if (item.broken) {
        item.timer -= dt;
        if (item.timer <= 0) {
          delete state.crumble[key];
        }
      }
    }

    if (occupiedSupport && occupiedSupport.source === 'surface') {
      const cell = occupiedSupport.cell;
      if (cell?.crumble) {
        const key = toKey(occupiedSupport.tx, occupiedSupport.ty);
        const crumbleState = state.crumble[key] || { broken: false, timer: cell.crumble.delay };
        crumbleState.timer -= dt;
        if (crumbleState.timer <= 0) {
          crumbleState.broken = true;
          crumbleState.timer = cell.crumble.downtime;
        }
        state.crumble[key] = crumbleState;
      }
    }
  }

  function getActorBlockingOverlaps(level, runtime, x, y, zCheck, radius, supportZ) {
    const overlaps = [];
    const marbleBottom = zCheck - radius;

    for (const actor of level.actors) {
      const actorState = getActorWorldState(actor, runtime);
      if (actorState.active === false) continue;

      if (actor.kind === ACTOR_KINDS.MOVING_PLATFORM || actor.kind === ACTOR_KINDS.ELEVATOR) {
        const rect = getActorTopRect(actor, actorState);
        if (marbleBottom > rect.z + 0.04) continue;
        if (supportZ !== null && supportZ !== undefined && supportZ >= rect.z - 0.04) continue;
        const closestX = clamp(x, rect.minX, rect.maxX);
        const closestY = clamp(y, rect.minY, rect.maxY);
        const dx = x - closestX;
        const dy = y - closestY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radius * radius) continue;
        const dist = Math.max(0.0001, Math.sqrt(distSq));
        overlaps.push({
          penetration: radius - dist,
          normal: { x: dx / dist, y: dy / dist },
          actor,
          actorState
        });
      } else if (actor.kind === ACTOR_KINDS.TIMED_GATE) {
        // Only block when the marble is within the gate's vertical extent
        const gateTop = actor.topHeight;
        const gateBase = gateTop - 0.06; // ACTOR_THICKNESS equivalent
        if (marbleBottom > gateTop + 0.04) continue;
        if (zCheck < gateBase - radius) continue;
        const minX = actorState.x;
        const minY = actorState.y;
        const maxX = actorState.x + actor.width;
        const maxY = actorState.y + actor.height;
        const closestX = clamp(x, minX, maxX);
        const closestY = clamp(y, minY, maxY);
        const dx = x - closestX;
        const dy = y - closestY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radius * radius) continue;
        const dist = Math.max(0.0001, Math.sqrt(distSq));
        overlaps.push({
          penetration: radius - dist,
          normal: { x: dx / dist, y: dy / dist },
          actor,
          actorState
        });
      }
    }

    return overlaps;
  }

  function getHazardContacts(level, runtime, marble) {
    const contacts = [];
    for (const actor of level.actors) {
      const actorState = getActorWorldState(actor, runtime);
      if (actorState.active === false) continue;

      if (actor.kind === ACTOR_KINDS.ROTATING_BAR || actor.kind === ACTOR_KINDS.SWEEPER) {
        const cx = actorState.x + actor.width * 0.5;
        const cy = actorState.y + actor.height * 0.5;
        const ex = cx + Math.cos(actorState.angle) * actor.armLength;
        const ey = cy + Math.sin(actorState.angle) * actor.armLength;
        const px = marble.x;
        const py = marble.y;
        const vx = ex - cx;
        const vy = ey - cy;
        const wx = px - cx;
        const wy = py - cy;
        const lenSq = vx * vx + vy * vy;
        const t = lenSq > 0 ? clamp((wx * vx + wy * vy) / lenSq, 0, 1) : 0;
        const closestX = cx + vx * t;
        const closestY = cy + vy * t;
        const dx = px - closestX;
        const dy = py - closestY;
        const hitRadius = marble.collisionRadius + actor.armWidth;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          contacts.push({ actor, actorState, dx, dy });
        }
      }
    }
    return contacts;
  }

  function resolveSupportInteraction(runtime, support) {
    if (!support) return;
    const marble = runtime.marble;
    marble.supportSource = support.source;
    marble.supportRef = support.source === 'actor' ? support.actor.id : support.source === 'surface' ? toKey(support.tx, support.ty) : null;

    if (support.source === 'actor' && support.actorState) {
      marble.x += support.actorState.dx;
      marble.y += support.actorState.dy;
      marble.z += support.actorState.dz;
    }
  }

  function registerLevel(level) {
    MAIN_LEVEL_IDS.push(level.id);
    return level;
  }

  function applyPath(level, points, patch, width = 1) {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      let x = a.x;
      let y = a.y;
      while (x !== b.x || y !== b.y) {
        for (let oy = 0; oy < width; oy += 1) {
          for (let ox = 0; ox < width; ox += 1) {
            setSurface(level, x + ox, y + oy, patch);
          }
        }
        if (x !== b.x) x += dx;
        if (y !== b.y) y += dy;
      }
      for (let oy = 0; oy < width; oy += 1) {
        for (let ox = 0; ox < width; ox += 1) {
          setSurface(level, b.x + ox, b.y + oy, patch);
        }
      }
    }
  }

  function placeCurve(level, x, y, corner, patch = {}) {
    const map = {
      convex_ne: SHAPES.CURVE_CONVEX_NE,
      convex_nw: SHAPES.CURVE_CONVEX_NW,
      convex_se: SHAPES.CURVE_CONVEX_SE,
      convex_sw: SHAPES.CURVE_CONVEX_SW,
      concave_ne: SHAPES.CURVE_CONCAVE_NE,
      concave_nw: SHAPES.CURVE_CONCAVE_NW,
      concave_se: SHAPES.CURVE_CONCAVE_SE,
      concave_sw: SHAPES.CURVE_CONCAVE_SW
    };
    setSurface(level, x, y, { ...patch, shape: map[corner] || SHAPES.CURVE_CONVEX_NE });
  }

  function clearSurface(level, x, y) {
    setGridCell(level.surface, x, y, makeVoidSurfaceCell());
  }

  function clearSurfaceRect(level, x, y, w, h) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        clearSurface(level, xx, yy);
      }
    }
  }

  function clearBlocker(level, x, y) {
    setGridCell(level.blockers, x, y, null);
  }

  function clearBlockerRect(level, x, y, w, h) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        clearBlocker(level, xx, yy);
      }
    }
  }

  function setBlockerRect(level, x, y, w, h, patch) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        setBlocker(level, xx, yy, patch);
      }
    }
  }

  function fillTrack(level, x, y, w, h, baseHeight, extra = {}) {
    fillSurfaceRect(level, x, y, w, h, {
      baseHeight,
      shape: SHAPES.FLAT,
      ...extra
    });
  }

  function widePath(level, points, baseHeight, width = 3, extra = {}) {
    applyPath(level, points, {
      baseHeight,
      shape: SHAPES.FLAT,
      ...extra
    }, width);
  }

  function wallRing(level, x, y, w, h, top, options = {}) {
    const gaps = new Set((options.gaps || []).map((gap) => toKey(gap.x, gap.y)));
    const patch = {
      kind: options.kind ?? 'track',
      baseHeight: top,
      shape: SHAPES.FLAT,
      friction: options.friction ?? 1,
      conveyor: null,
      bounce: options.bounce ?? 0,
      crumble: null,
      failType: null,
      landingPad: false,
      data: options.data ?? null
    };
    function place(xx, yy) {
      if (gaps.has(toKey(xx, yy))) return;
      setSurface(level, xx, yy, patch);
      clearBlocker(level, xx, yy);
    }
    for (let xx = x; xx < x + w; xx += 1) {
      place(xx, y);
      place(xx, y + h - 1);
    }
    for (let yy = y; yy < y + h; yy += 1) {
      place(x, yy);
      place(x + w - 1, yy);
    }
  }

  function blockerRing(level, x, y, w, h, top, options = {}) {
    const gaps = new Set((options.gaps || []).map((gap) => toKey(gap.x, gap.y)));
    const patch = {
      kind: options.kind ?? 'wall',
      top,
      walkableTop: !!options.walkableTop,
      transparent: !!options.transparent,
      data: options.data ?? null
    };
    for (let xx = x; xx < x + w; xx += 1) {
      if (!gaps.has(toKey(xx, y))) setBlocker(level, xx, y, patch);
      if (!gaps.has(toKey(xx, y + h - 1))) setBlocker(level, xx, y + h - 1, patch);
    }
    for (let yy = y; yy < y + h; yy += 1) {
      if (!gaps.has(toKey(x, yy))) setBlocker(level, x, yy, patch);
      if (!gaps.has(toKey(x + w - 1, yy))) setBlocker(level, x + w - 1, yy, patch);
    }
  }

  function addHazardRect(level, x, y, w, h, type = 'hazard_strip') {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        setTrigger(level, xx, yy, {
          kind: 'hazard',
          data: { type }
        });
      }
    }
  }

  function buildStairRun(level, x, y, length, dir, startHeight, step = -1, width = 3, extra = {}) {
    for (let i = 0; i < length; i += 1) {
      const h = startHeight + (step * i);
      if (dir === 'east') {
        fillTrack(level, x + i, y, 1, width, h, extra);
      } else if (dir === 'west') {
        fillTrack(level, x - i, y, 1, width, h, extra);
      } else if (dir === 'south') {
        fillTrack(level, x, y + i, width, 1, h, extra);
      } else if (dir === 'north') {
        fillTrack(level, x, y - i, width, 1, h, extra);
      }
    }
  }

  function addStaticPlatform(level, id, x, y, z, width, height, extra = {}) {
    const top = z + (extra.thickness ?? 1);

    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) {
        setBlocker(level, xx, yy, {
          kind: 'overhang',
          top,
          walkableTop: extra.walkableTop !== false,
          transparent: !!extra.transparent,
          data: { id, overhang: true, ...extra.data }
        });
      }
    }
  }

  function addMovingBridge(level, id, points, width, height, speed = 0.55, extra = {}) {
    addActor(level, {
      id,
      kind: ACTOR_KINDS.MOVING_PLATFORM,
      x: points[0].x,
      y: points[0].y,
      z: points[0].z,
      width,
      height,
      topHeight: points[0].z,
      path: {
        type: extra.loop ? 'loop' : 'ping_pong',
        speed,
        points
      },
      conveyor: extra.conveyor ?? null,
      friction: extra.friction ?? 1
    });
  }

  function addElevator(level, id, x, y, minZ, maxZ, width = 2, height = 2, speed = 0.8, cycle = 4.8) {
    addActor(level, {
      id,
      kind: ACTOR_KINDS.ELEVATOR,
      x,
      y,
      z: minZ,
      width,
      height,
      topHeight: minZ,
      travel: {
        axis: 'z',
        min: minZ,
        max: maxZ,
        speed,
        cycle
      }
    });
  }

  function addTimedGate(level, id, x, y, topHeight, width = 1, height = 2, closedDuration = 1.4, openDuration = 1.1) {
    addActor(level, {
      id,
      kind: ACTOR_KINDS.TIMED_GATE,
      x,
      y,
      z: 0,
      width,
      height,
      topHeight,
      closedDuration,
      openDuration
    });
  }

  // ─── Macro template functions ──────────────────────────────────────────────
  //
  // These high-level helpers place complex geometry in a single call,
  // replacing the verbose buildStairRun + widePath + setSurface pattern.
  //
  // placeRamp(level, opts)
  //   Places a smooth ramp using slope shapes.  The ramp descends from
  //   startZ to endZ over `length` tiles in the given direction.
  //   Each tile gets a slope shape so the side faces are trapezoidal.
  //
  // placeSwitchback(level, opts)
  //   Places a two-leg switchback: a horizontal run, a curved corner,
  //   and a ramp down to the next level.  Returns the exit position.
  //
  // placeDropShaft(level, opts)
  //   Places a void shaft with a landing pad at the bottom.

  function placeRamp(level, { x, y, dir, length, width = 3, startZ, endZ, extra = {} }) {
    const totalDrop = endZ - startZ; // negative = descending
    const slopeShapeMap = {
      east:  SHAPES.SLOPE_E,
      west:  SHAPES.SLOPE_W,
      south: SHAPES.SLOPE_S,
      north: SHAPES.SLOPE_N
    };
    const slopeShape = slopeShapeMap[dir] || SHAPES.SLOPE_S;
    const rise = totalDrop / length; // rise per tile (negative = down)

    for (let i = 0; i < length; i++) {
      const tileZ = startZ + rise * i;
      const patch = {
        baseHeight: tileZ,
        shape: slopeShape,
        rise: rise,
        ...extra
      };
      if (dir === 'east') {
        for (let oy = 0; oy < width; oy++) setSurface(level, x + i, y + oy, patch);
      } else if (dir === 'west') {
        for (let oy = 0; oy < width; oy++) setSurface(level, x - i, y + oy, patch);
      } else if (dir === 'south') {
        for (let ox = 0; ox < width; ox++) setSurface(level, x + ox, y + i, patch);
      } else if (dir === 'north') {
        for (let ox = 0; ox < width; ox++) setSurface(level, x + ox, y - i, patch);
      }
    }
  }

  // placeCorridorRun: flat corridor in a direction
  function placeCorridorRun(level, { x, y, dir, length, width = 3, z, extra = {} }) {
    const patch = { baseHeight: z, shape: SHAPES.FLAT, ...extra };
    for (let i = 0; i < length; i++) {
      if (dir === 'east')  for (let oy = 0; oy < width; oy++) setSurface(level, x + i, y + oy, patch);
      if (dir === 'west')  for (let oy = 0; oy < width; oy++) setSurface(level, x - i, y + oy, patch);
      if (dir === 'south') for (let ox = 0; ox < width; ox++) setSurface(level, x + ox, y + i, patch);
      if (dir === 'north') for (let ox = 0; ox < width; ox++) setSurface(level, x + ox, y - i, patch);
    }
  }

  // placeDropShaft: void shaft with landing pad at bottom
  // Returns the landing pad center position
  function placeDropShaft(level, { x, y, w = 3, h = 3, landingZ, padFriction = 1.2 }) {
    // Clear the shaft area (void)
    clearSurfaceRect(level, x, y, w, h);
    // Place landing pad at bottom
    fillSurfaceRect(level, x, y + h, w, 2, {
      baseHeight: landingZ,
      shape: SHAPES.FLAT,
      landingPad: true,
      friction: padFriction
    });
    return { x: x + w * 0.5, y: y + h + 1 };
  }

  function buildForkRejoinTest() {
    // Citadel Approach — redesigned
    // Layout: start plateau → entry corridor → citadel ring (fork: upper/lower)
    //         upper: ramp descent → basin → goal corridor
    //         lower: service corridor → ramp up → same basin
    // No dead ends. Goal on flat track tile.
    const level = createLevelShell({
      id: 'fork_rejoin_test',
      name: 'Citadel Approach',
      width: 56,
      height: 44,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 32.5 },
      reward: { presses: 7000, unlocks: ['marble_switchback_complete'], claimKey: 'fork_rejoin_test' },
      templates: ['fork_rejoin', 'ramp_descent', 'citadel_ring']
    });

    // ─ Start plateau (z=14)
    fillTrack(level, 2, 29, 7, 7, 14);
    wallRing(level, 2, 29, 7, 7, 16, { gaps: [{ x: 8, y: 32 }, { x: 8, y: 33 }] });

    // ─ Entry corridor east (z=14 → 13)
    widePath(level, [{ x: 8, y: 32 }, { x: 16, y: 32 }], 14, 3);

    // ─ Citadel ring (z=13)
    fillTrack(level, 16, 26, 16, 14, 13);
    fillTrack(level, 20, 29, 8, 7, 10);  // sunken inner courtyard (z=10, not a void)
    wallRing(level, 16, 26, 16, 14, 15, {
      gaps: [
        { x: 16, y: 32 }, { x: 16, y: 33 },   // west entry
        { x: 31, y: 29 }, { x: 31, y: 30 },   // east upper exit
        { x: 31, y: 33 }, { x: 31, y: 34 },   // east lower exit
        { x: 22, y: 26 }, { x: 23, y: 26 }    // north exit (upper route)
      ]
    });

    // ─ Upper route: north exit → ramp down → upper basin (z=13 → 8)
    widePath(level, [{ x: 22, y: 26 }, { x: 22, y: 20 }], 13, 3);
    // Ramp south-to-north: tiles at y=19..16, descending from 13 to 8
    placeRamp(level, { x: 22, y: 15, dir: 'north', length: 5, width: 3, startZ: 13, endZ: 8 });
    fillTrack(level, 20, 10, 12, 6, 8);  // upper basin
    wallRing(level, 20, 10, 12, 6, 10, {
      gaps: [
        { x: 20, y: 13 }, { x: 20, y: 14 },   // west exit
        { x: 31, y: 13 }, { x: 31, y: 14 }    // east exit to goal corridor
      ]
    });
    addHazardRect(level, 24, 11, 2, 2, 'citadel_spikes');  // hazard in upper basin

    // ─ Lower route: east lower exit → service corridor → ramp up → upper basin
    widePath(level, [{ x: 31, y: 33 }, { x: 42, y: 33 }], 13, 3);
    // Ramp ascending north from z=13 to z=8 over 5 tiles
    placeRamp(level, { x: 42, y: 33, dir: 'north', length: 5, width: 3, startZ: 13, endZ: 8 });
    // Connect to upper basin west exit
    widePath(level, [{ x: 20, y: 13 }, { x: 14, y: 13 }, { x: 14, y: 28 }, { x: 20, y: 28 }], 8, 3);
    // Hazard on lower service corridor
    addHazardRect(level, 37, 33, 2, 1, 'service_spikes');
    setSurface(level, 34, 33, { baseHeight: 13, shape: SHAPES.FLAT, crumble: { delay: 0.28, downtime: 1.8 } });

    // ─ Goal corridor: east exit from upper basin → ramp down → goal (z=8 → 5)
    widePath(level, [{ x: 31, y: 13 }, { x: 38, y: 13 }], 8, 3);
    placeRamp(level, { x: 38, y: 13, dir: 'east', length: 4, width: 3, startZ: 8, endZ: 5 });
    fillTrack(level, 42, 11, 10, 7, 5);  // goal basin
    wallRing(level, 42, 11, 10, 7, 7, {
      gaps: [{ x: 42, y: 13 }, { x: 42, y: 14 }]
    });
    // Hazard near goal
    addHazardRect(level, 48, 12, 1, 2, 'goal_guard');
    setSurface(level, 44, 13, { baseHeight: 5, shape: SHAPES.FLAT, conveyor: { x: 0.6, y: 0, strength: 1.1 } });
    setSurface(level, 46, 13, { baseHeight: 5, shape: SHAPES.FLAT, bounce: 3.8 });
    // Goal on flat track tile (NOT a bounce tile)
    setSurface(level, 50, 13, { baseHeight: 5, shape: SHAPES.FLAT });
    setGoal(level, 50, 13, 0.44);

    // ─ Route graph
    addGraphNode(level, { id: 'start',       type: 'entry', x: 4.5,  y: 32.5, z: 14 });
    addGraphNode(level, { id: 'citadel',     type: 'hub',   x: 24.5, y: 32.5, z: 13 });
    addGraphNode(level, { id: 'upper_route', type: 'route', x: 24.5, y: 13.5, z: 8  });
    addGraphNode(level, { id: 'lower_route', type: 'route', x: 37.5, y: 33.5, z: 13 });
    addGraphNode(level, { id: 'goal_basin',  type: 'goal',  x: 50.5, y: 13.5, z: 5  });
    addGraphEdge(level, { from: 'start',       to: 'citadel',     kind: 'roll'    });
    addGraphEdge(level, { from: 'citadel',     to: 'upper_route', kind: 'descent' });
    addGraphEdge(level, { from: 'citadel',     to: 'lower_route', kind: 'roll'    });
    addGraphEdge(level, { from: 'upper_route', to: 'goal_basin',  kind: 'roll'    });
    addGraphEdge(level, { from: 'lower_route', to: 'upper_route', kind: 'descent' });
    addGraphEdge(level, { from: 'goal_basin',  to: 'goal_basin',  kind: 'finale'  });

    return registerLevel(level);
  }

  function buildSwitchbackDescent() {
    // Mountain Switchback — redesigned
    // Four smooth ramp switchbacks descend from z=18 to z=2.
    // Each switchback: flat run → smooth ramp → flat landing → curve corner → next run.
    // No dead ends. Goal on flat track tile at the bottom.
    const level = createLevelShell({
      id: 'switchback_descent',
      name: 'Mountain Switchback',
      width: 58,
      height: 52,
      killZ: -24,
      voidFloor: -12,
      start: { x: 5.5, y: 5.5 },
      reward: { presses: 9000, unlocks: ['marble_drop_complete'], claimKey: 'switchback_descent' },
      templates: ['smooth_switchback', 'ramp_descent', 'hazard_corners']
    });

    // ────────────────────────────────────────────────────────
    // Switchback layout (top view, each row is a terrace):
    //
    //  [START z=18] ===east==> [CORNER A] ===ramp down===>
    //  [RUN B z=14] ===west==> [CORNER B] ===ramp down===>
    //  [RUN C z=10] ===east==> [CORNER C] ===ramp down===>
    //  [RUN D z=6]  ===west==> [CORNER D] ===ramp down===>
    //  [GOAL BASIN z=2]
    //
    // Each ramp is 4 tiles wide using SLOPE shapes (smooth, no stairs).
    // Each run is 3 tiles wide (walls on north+south sides).

    // ─ Terrace A: start plateau, z=18, runs east  (x=3..24, y=3..7)
    fillTrack(level, 3, 3, 22, 5, 18);
    wallRing(level, 3, 3, 22, 5, 20, {
      gaps: [{ x: 24, y: 5 }, { x: 25, y: 5 }, { x: 26, y: 5 }]  // east exit (east wall x=24)
    });
    addHazardRect(level, 12, 4, 2, 1, 'switchback_spikes');
    setSurface(level, 16, 4, { baseHeight: 18, shape: SHAPES.FLAT, crumble: { delay: 0.28, downtime: 2.0 } });

    // ─ Ramp A: x=24..26, y=5..8 (4 tiles south, z=18→14)
    placeRamp(level, { x: 24, y: 5, dir: 'south', length: 4, width: 3, startZ: 18, endZ: 14 });

    // ─ Terrace B: z=14, runs west  (x=6..27, y=9..13)
    fillTrack(level, 6, 9, 22, 5, 14);
    wallRing(level, 6, 9, 22, 5, 16, {
      gaps: [
        { x: 24, y: 9 }, { x: 25, y: 9 }, { x: 26, y: 9 },  // north entry from ramp A
        { x: 6, y: 11 }, { x: 6, y: 12 }                     // west exit to connector B
      ]
    });
    addHazardRect(level, 18, 11, 2, 1, 'switchback_spikes');
    setSurface(level, 14, 10, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: -0.5, y: 0, strength: 1.0 } });

    // ─ Connector B: flat bridge from terrace B west exit to ramp B  (x=4..6, y=11..12)
    fillTrack(level, 4, 11, 3, 3, 14);

    // ─ Ramp B: x=4..6, y=13..16 (4 tiles south, z=14→10)
    placeRamp(level, { x: 4, y: 13, dir: 'south', length: 4, width: 3, startZ: 14, endZ: 10 });

    // ─ Terrace C: z=10, runs east  (x=4..25, y=17..21)
    fillTrack(level, 4, 17, 22, 5, 10);
    wallRing(level, 4, 17, 22, 5, 12, {
      gaps: [
        { x: 4, y: 17 }, { x: 5, y: 17 }, { x: 6, y: 17 },  // north entry from ramp B
        { x: 25, y: 19 }, { x: 25, y: 20 }                   // east exit to ramp C
      ]
    });
    addHazardRect(level, 10, 19, 2, 1, 'switchback_spikes');
    setSurface(level, 18, 18, { baseHeight: 10, shape: SHAPES.FLAT, bounce: 3.5 });

    // ─ Ramp C: x=25..27, y=19..22 (4 tiles south, z=10→6)
    placeRamp(level, { x: 25, y: 19, dir: 'south', length: 4, width: 3, startZ: 10, endZ: 6 });

    // ─ Terrace D: z=6, runs west  (x=6..28, y=23..27)
    fillTrack(level, 6, 23, 23, 5, 6);
    wallRing(level, 6, 23, 23, 5, 8, {
      gaps: [
        { x: 25, y: 23 }, { x: 26, y: 23 }, { x: 27, y: 23 },  // north entry from ramp C
        { x: 6, y: 25 }, { x: 6, y: 26 }                        // west exit to connector D
      ]
    });
    addHazardRect(level, 20, 25, 2, 1, 'switchback_spikes');

    // ─ Connector D: flat bridge from terrace D west exit to ramp D  (x=4..6, y=25..26)
    fillTrack(level, 4, 25, 3, 3, 6);

    // ─ Ramp D: x=4..6, y=27..30 (4 tiles south, z=6→2)
    placeRamp(level, { x: 4, y: 27, dir: 'south', length: 4, width: 3, startZ: 6, endZ: 2 });

    // ─ Goal basin: z=2  (x=3..28, y=31..37)
    fillTrack(level, 3, 31, 26, 7, 2);
    wallRing(level, 3, 31, 26, 7, 4, {
      gaps: [
        { x: 4, y: 31 }, { x: 5, y: 31 }, { x: 6, y: 31 }  // north entry from ramp D
      ]
    });
    setSurface(level, 20, 35, { baseHeight: 2, shape: SHAPES.FLAT });
    setGoal(level, 20, 35, 0.44);
    addHazardRect(level, 14, 34, 2, 1, 'goal_guard');
    setSurface(level, 10, 34, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 0.6, y: 0, strength: 1.0 } });

    // Overhead platforms removed — they overlapped the play area and obscured the marble

    // ─ Route graph
    addGraphNode(level, { id: 'start',  type: 'entry',  x: 5.5,  y: 5.5,  z: 18 });
    addGraphNode(level, { id: 'turn_a', type: 'corner', x: 25.5, y: 6.5,  z: 16 });
    addGraphNode(level, { id: 'run_b',  type: 'route',  x: 14.5, y: 11.5, z: 14 });
    addGraphNode(level, { id: 'turn_b', type: 'corner', x: 5.5,  y: 12.5, z: 14 });
    addGraphNode(level, { id: 'run_c',  type: 'route',  x: 14.5, y: 19.5, z: 10 });
    addGraphNode(level, { id: 'turn_c', type: 'corner', x: 26.5, y: 20.5, z: 8  });
    addGraphNode(level, { id: 'run_d',  type: 'route',  x: 14.5, y: 25.5, z: 6  });
    addGraphNode(level, { id: 'turn_d', type: 'corner', x: 5.5,  y: 26.5, z: 6  });
    addGraphNode(level, { id: 'goal',   type: 'goal',   x: 20.5, y: 35.5, z: 2  });
    addGraphEdge(level, { from: 'start',  to: 'turn_a', kind: 'switchback' });
    addGraphEdge(level, { from: 'turn_a', to: 'run_b',  kind: 'descent'    });
    addGraphEdge(level, { from: 'run_b',  to: 'turn_b', kind: 'switchback' });
    addGraphEdge(level, { from: 'turn_b', to: 'run_c',  kind: 'descent'    });
    addGraphEdge(level, { from: 'run_c',  to: 'turn_c', kind: 'switchback' });
    addGraphEdge(level, { from: 'turn_c', to: 'run_d',  kind: 'descent'    });
    addGraphEdge(level, { from: 'run_d',  to: 'turn_d', kind: 'switchback' });
    addGraphEdge(level, { from: 'turn_d', to: 'goal',   kind: 'finale'     });

    return registerLevel(level);
  }

  function buildDropNetwork() {
    // Basin Drop Maze — redesigned
    // Three parallel drop shafts feed into a common goal basin.
    // All routes are connected. No dead ends. Goal on flat track tile.
    const level = createLevelShell({
      id: 'drop_network',
      name: 'Basin Drop Maze',
      width: 60,
      height: 48,
      killZ: -24,
      voidFloor: -12,
      start: { x: 5.5, y: 6.5 },
      reward: { presses: 12000, unlocks: ['marble_platform_complete'], claimKey: 'drop_network' },
      templates: ['drop_maze', 'parallel_shafts', 'merge_basin']
    });

    // ─ Start plateau (z=16)
    fillTrack(level, 3, 4, 12, 7, 16);
    wallRing(level, 3, 4, 12, 7, 18, {
      gaps: [{ x: 14, y: 7 }, { x: 14, y: 8 }]  // east exit
    });

    // ─ Upper hub (z=15) — three exits: left shaft, mid shaft, right shaft
    widePath(level, [{ x: 14, y: 7 }, { x: 22, y: 7 }], 15, 3);
    fillTrack(level, 22, 4, 16, 10, 15);
    wallRing(level, 22, 4, 16, 10, 17, {
      gaps: [
        { x: 22, y: 7 }, { x: 22, y: 8 },      // west entry
        { x: 24, y: 13 }, { x: 25, y: 13 },    // south-left exit (left shaft)
        { x: 30, y: 13 }, { x: 31, y: 13 },    // south-mid exit (mid shaft)
        { x: 36, y: 13 }, { x: 37, y: 13 }     // south-right exit (right shaft)
      ]
    });
    // Hazard in hub
    addHazardRect(level, 28, 6, 2, 2, 'hub_spikes');
    setSurface(level, 33, 7, { baseHeight: 15, shape: SHAPES.FLAT, crumble: { delay: 0.3, downtime: 2.0 } });

    // ─ Left shaft: ramp from z=15 down to z=8
    placeRamp(level, { x: 24, y: 13, dir: 'south', length: 5, width: 3, startZ: 15, endZ: 8 });
    fillTrack(level, 22, 18, 8, 6, 8);
    wallRing(level, 22, 18, 8, 6, 10, {
      gaps: [
        { x: 24, y: 18 }, { x: 25, y: 18 },    // north entry
        { x: 22, y: 21 }, { x: 22, y: 22 }     // west exit to merge corridor
      ]
    });
    addHazardRect(level, 26, 20, 2, 1, 'shaft_spikes');
    setSurface(level, 24, 22, { baseHeight: 8, shape: SHAPES.FLAT, conveyor: { x: -0.5, y: 0, strength: 1.0 } });

    // ─ Mid shaft: ramp from z=15 down to z=6
    placeRamp(level, { x: 30, y: 13, dir: 'south', length: 6, width: 3, startZ: 15, endZ: 6 });
    fillTrack(level, 28, 19, 8, 6, 6);
    wallRing(level, 28, 19, 8, 6, 8, {
      gaps: [
        { x: 30, y: 19 }, { x: 31, y: 19 },    // north entry
        { x: 28, y: 22 }, { x: 28, y: 23 }     // west exit to merge corridor
      ]
    });
    addHazardRect(level, 32, 21, 2, 1, 'shaft_spikes');

    // ─ Right shaft: ramp from z=15 down to z=4
    placeRamp(level, { x: 36, y: 13, dir: 'south', length: 7, width: 3, startZ: 15, endZ: 4 });
    fillTrack(level, 34, 20, 8, 6, 4);
    wallRing(level, 34, 20, 8, 6, 6, {
      gaps: [
        { x: 36, y: 20 }, { x: 37, y: 20 },    // north entry
        { x: 34, y: 23 }, { x: 34, y: 24 }     // west exit to merge corridor
      ]
    });
    addHazardRect(level, 38, 22, 2, 1, 'shaft_spikes');
    setSurface(level, 36, 24, { baseHeight: 4, shape: SHAPES.FLAT, bounce: 3.2 });

    // ─ Merge corridor: all three shafts connect here (z=4)
    // Left shaft connects via ramp down from z=8 to z=4
    placeRamp(level, { x: 18, y: 21, dir: 'south', length: 4, width: 3, startZ: 8, endZ: 4 });
    widePath(level, [{ x: 18, y: 25 }, { x: 28, y: 25 }], 4, 3);
    // Mid shaft connects via ramp down from z=6 to z=4
    placeRamp(level, { x: 25, y: 22, dir: 'south', length: 2, width: 3, startZ: 6, endZ: 4 });
    widePath(level, [{ x: 25, y: 24 }, { x: 28, y: 24 }], 4, 3);
    // Right shaft already at z=4
    widePath(level, [{ x: 34, y: 23 }, { x: 28, y: 23 }], 4, 3);

    // ─ Goal basin (z=4)
    fillTrack(level, 10, 28, 34, 10, 4);
    wallRing(level, 10, 28, 34, 10, 6, {
      gaps: [
        { x: 18, y: 28 }, { x: 19, y: 28 },    // north entry (left)
        { x: 25, y: 28 }, { x: 26, y: 28 },    // north entry (mid)
        { x: 32, y: 28 }, { x: 33, y: 28 }     // north entry (right)
      ]
    });
    // Hazard near goal
    addHazardRect(level, 26, 33, 2, 1, 'goal_guard');
    setSurface(level, 22, 34, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 0.6, y: 0, strength: 1.1 } });
    setSurface(level, 30, 34, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.22, downtime: 2.2 } });
    // Goal on flat track tile
    setSurface(level, 36, 34, { baseHeight: 4, shape: SHAPES.FLAT });
    setGoal(level, 36, 34, 0.44);

    // ─ Route graph
    addGraphNode(level, { id: 'start',       type: 'entry', x: 5.5,  y: 6.5,  z: 16 });
    addGraphNode(level, { id: 'hub',         type: 'hub',   x: 30.5, y: 8.5,  z: 15 });
    addGraphNode(level, { id: 'left_shaft',  type: 'route', x: 25.5, y: 21.5, z: 8  });
    addGraphNode(level, { id: 'mid_shaft',   type: 'route', x: 31.5, y: 22.5, z: 6  });
    addGraphNode(level, { id: 'right_shaft', type: 'route', x: 37.5, y: 23.5, z: 4  });
    addGraphNode(level, { id: 'goal_basin',  type: 'goal',  x: 36.5, y: 34.5, z: 4  });
    addGraphEdge(level, { from: 'start',       to: 'hub',         kind: 'roll'   });
    addGraphEdge(level, { from: 'hub',         to: 'left_shaft',  kind: 'drop'   });
    addGraphEdge(level, { from: 'hub',         to: 'mid_shaft',   kind: 'drop'   });
    addGraphEdge(level, { from: 'hub',         to: 'right_shaft', kind: 'drop'   });
    addGraphEdge(level, { from: 'left_shaft',  to: 'goal_basin',  kind: 'merge'  });
    addGraphEdge(level, { from: 'mid_shaft',   to: 'goal_basin',  kind: 'merge'  });
    addGraphEdge(level, { from: 'right_shaft', to: 'goal_basin',  kind: 'merge'  });

    return registerLevel(level);
  }

  function buildMovingPlatformTransfer() {
    // Tower Transfer Works — redesigned
    // Chain of towers connected by moving platforms and elevators.
    // Goal is on a flat track tile (NOT a bounce tile).
    // The lower_lab dead end is removed; instead it connects to the goal basin.
    const level = createLevelShell({
      id: 'moving_platform_transfer',
      name: 'Tower Transfer Works',
      width: 64,
      height: 46,
      killZ: -24,
      voidFloor: -12,
      start: { x: 5.5, y: 33.5 },
      reward: { presses: 16000, unlocks: ['marble_crossover_complete'], claimKey: 'moving_platform_transfer' },
      templates: ['tower_network', 'elevators', 'moving_bridges']
    });

    // ─ Tower A: start (z=12)
    fillTrack(level, 3, 30, 9, 8, 12);
    wallRing(level, 3, 30, 9, 8, 14, {
      gaps: [{ x: 11, y: 33 }, { x: 11, y: 34 }]  // east exit
    });

    // ─ Bridge corridor A→B (moving platform traverses this)
    widePath(level, [{ x: 11, y: 33 }, { x: 17, y: 33 }], 12, 3);

    // ─ Tower B (z=10)
    fillTrack(level, 17, 28, 9, 9, 10);
    wallRing(level, 17, 28, 9, 9, 12, {
      gaps: [
        { x: 17, y: 33 }, { x: 17, y: 34 },  // west entry
        { x: 25, y: 31 }, { x: 25, y: 32 }   // east exit
      ]
    });

    // ─ Bridge corridor B→C
    widePath(level, [{ x: 25, y: 31 }, { x: 32, y: 31 }], 10, 3);

    // ─ Tower C (z=8)
    fillTrack(level, 32, 26, 9, 9, 8);
    wallRing(level, 32, 26, 9, 9, 10, {
      gaps: [
        { x: 32, y: 31 }, { x: 32, y: 32 },  // west entry
        { x: 40, y: 29 }, { x: 40, y: 30 }   // east exit
      ]
    });

    // ─ Bridge corridor C→D
    widePath(level, [{ x: 40, y: 29 }, { x: 47, y: 29 }], 8, 3);

    // ─ Tower D (z=6)
    fillTrack(level, 47, 24, 9, 9, 6);
    wallRing(level, 47, 24, 9, 9, 8, {
      gaps: [
        { x: 47, y: 29 }, { x: 47, y: 30 },  // west entry
        { x: 55, y: 27 }, { x: 55, y: 28 }   // east exit to goal corridor
      ]
    });

    // ─ Goal corridor: flat run from tower D east exit to goal basin
    widePath(level, [{ x: 55, y: 27 }, { x: 58, y: 27 }], 6, 3);

    // ─ Goal basin (z=6, x=55..62, y=24..31)
    fillTrack(level, 55, 24, 8, 8, 6);
    wallRing(level, 55, 24, 8, 8, 8, {
      gaps: [{ x: 55, y: 27 }, { x: 55, y: 28 }]  // west entry from tower D
    });
    // Timed gate guarding goal
    addTimedGate(level, 'gate_goal', 56, 27, 5, 1, 6, 1.5, 1.0);
    // Hazard near goal
    addHazardRect(level, 58, 25, 2, 1, 'goal_guard');
    setSurface(level, 57, 28, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: 0.5, y: 0, strength: 1.0 } });
    // Goal on flat track tile (NOT a bounce tile) — within bounds (width=64, so max x=63)
    setSurface(level, 61, 28, { baseHeight: 6, shape: SHAPES.FLAT });
    setGoal(level, 61, 28, 0.44);

    // ─ Moving bridges (one per corridor)
    addMovingBridge(level, 'bridge_a', [
      { x: 11, y: 33, z: 12 },
      { x: 17, y: 33, z: 10 }
    ], 3, 3, 0.55);

    addMovingBridge(level, 'bridge_b', [
      { x: 25, y: 31, z: 10 },
      { x: 32, y: 31, z: 8 }
    ], 3, 3, 0.60);

    addMovingBridge(level, 'bridge_c', [
      { x: 40, y: 29, z: 8 },
      { x: 47, y: 29, z: 6 }
    ], 3, 3, 0.62);

    // ─ Elevators inside towers (shortcut/hazard)
    addElevator(level, 'elevator_a', 19, 30, 8, 12, 3, 3, 0.7, 5.0);
    addElevator(level, 'elevator_b', 34, 28, 6, 10, 3, 3, 0.8, 4.6);

    // ─ Timed gate on corridor B→C
    addTimedGate(level, 'gate_a', 36, 31, 11, 1, 3, 1.4, 1.2);

    // ─ Hazards
    addHazardRect(level, 20, 29, 2, 1, 'transfer_spikes');
    addHazardRect(level, 35, 27, 2, 1, 'transfer_spikes');

    // ─ Conveyor and bounce tiles (not on goal)
    setSurface(level, 22, 33, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 0.5, y: 0, strength: 1.0 } });
    setSurface(level, 37, 31, { baseHeight: 8, shape: SHAPES.FLAT, bounce: 3.5 });

    // ─ Route graph
    addGraphNode(level, { id: 'start',   type: 'entry',  x: 5.5,  y: 33.5, z: 12 });
    addGraphNode(level, { id: 'tower_b', type: 'tower',  x: 21.5, y: 32.5, z: 10 });
    addGraphNode(level, { id: 'tower_c', type: 'tower',  x: 36.5, y: 30.5, z: 8  });
    addGraphNode(level, { id: 'tower_d', type: 'tower',  x: 51.5, y: 28.5, z: 6  });
    addGraphNode(level, { id: 'goal',    type: 'goal',   x: 61.5, y: 28.5, z: 6  });
    addGraphEdge(level, { from: 'start',   to: 'tower_b', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'tower_b', to: 'tower_c', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'tower_c', to: 'tower_d', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'tower_d', to: 'goal',    kind: 'timed_cross'       });

    return registerLevel(level);
  }

  function buildCrossoverSpine() {
    // Grand Crossover — redesigned
    // Two braided routes (upper/lower) fork at a split hub and merge at a central core.
    // Both routes use smooth ramps instead of staircases.
    // Goal is on a flat track tile (NOT a bounce tile).
    const level = createLevelShell({
      id: 'crossover_spine',
      name: 'Grand Crossover',
      width: 68,
      height: 50,
      killZ: -26,
      voidFloor: -14,
      start: { x: 5.5, y: 40.5 },
      reward: { presses: 22000, unlocks: ['marble_master_complete'], claimKey: 'crossover_spine' },
      templates: ['braided_routes', 'hazard_halls', 'endgame_arena']
    });

    // ─ Start plateau (z=12)
    fillTrack(level, 3, 37, 12, 8, 12);
    wallRing(level, 3, 37, 12, 8, 14, {
      gaps: [{ x: 14, y: 40 }, { x: 14, y: 41 }]
    });

    // ─ Entry corridor → split hub
    widePath(level, [{ x: 14, y: 40 }, { x: 22, y: 40 }], 12, 3);

    // ─ Split hub (z=11)
    fillTrack(level, 22, 36, 10, 10, 11);
    wallRing(level, 22, 36, 10, 10, 13, {
      gaps: [
        { x: 22, y: 40 }, { x: 22, y: 41 },   // west entry
        { x: 31, y: 38 }, { x: 31, y: 39 },   // north-east exit (upper route)
        { x: 31, y: 43 }, { x: 31, y: 44 }    // south-east exit (lower route)
      ]
    });

    // ─ Upper route: ramp down from z=11 to z=7, then arena, then ramp to core
    widePath(level, [{ x: 31, y: 38 }, { x: 40, y: 38 }], 11, 3);
    placeRamp(level, { x: 40, y: 38, dir: 'east', length: 4, width: 3, startZ: 11, endZ: 7 });
    fillTrack(level, 44, 34, 14, 8, 7);
    wallRing(level, 44, 34, 14, 8, 9, {
      gaps: [
        { x: 44, y: 38 }, { x: 44, y: 39 },   // west entry
        { x: 57, y: 37 }, { x: 57, y: 38 },   // east exit (timed gate)
        { x: 50, y: 34 }, { x: 51, y: 34 }    // north exit to core ramp
      ]
    });
    // Rotating bar hazard in upper arena
    addActor(level, {
      id: 'bar_upper',
      kind: ACTOR_KINDS.ROTATING_BAR,
      x: 50, y: 37, z: 7,
      width: 1, height: 1, topHeight: 7,
      armLength: 2.4, armWidth: 0.24,
      angularSpeed: 1.5, fatal: true
    });
    addTimedGate(level, 'gate_upper', 57, 37, 9, 1, 3, 1.5, 1.0);
    addHazardRect(level, 53, 35, 2, 1, 'upper_spikes');
    setSurface(level, 55, 38, { baseHeight: 7, shape: SHAPES.FLAT, crumble: { delay: 0.22, downtime: 2.2 } });

    // Upper route ramp north to core (z=7 → 4)
    placeRamp(level, { x: 50, y: 34, dir: 'north', length: 5, width: 3, startZ: 7, endZ: 4 });

    // ─ Lower route: ramp down from z=11 to z=6, then arena, then ramp to core
    widePath(level, [{ x: 31, y: 43 }, { x: 40, y: 43 }], 11, 3);
    placeRamp(level, { x: 40, y: 43, dir: 'east', length: 4, width: 3, startZ: 11, endZ: 6 });
    fillTrack(level, 44, 40, 14, 8, 6);
    wallRing(level, 44, 40, 14, 8, 8, {
      gaps: [
        { x: 44, y: 43 }, { x: 44, y: 44 },   // west entry
        { x: 57, y: 43 }, { x: 57, y: 44 },   // east exit (timed gate)
        { x: 50, y: 40 }, { x: 51, y: 40 }    // north exit to core ramp
      ]
    });
    // Sweeper hazard in lower arena
    addActor(level, {
      id: 'sweeper_lower',
      kind: ACTOR_KINDS.SWEEPER,
      x: 50, y: 43, z: 6,
      width: 1, height: 1, topHeight: 6,
      armLength: 2.6, armWidth: 0.28,
      angularSpeed: -1.2, fatal: true
    });
    addTimedGate(level, 'gate_lower', 57, 43, 8, 1, 3, 1.6, 1.1);
    addHazardRect(level, 53, 45, 2, 1, 'lower_spikes');

    // Lower route ramp north to core (z=6 → 4)
    placeRamp(level, { x: 50, y: 40, dir: 'north', length: 4, width: 3, startZ: 6, endZ: 4 });

    // ─ Core merge basin (z=4)
    fillTrack(level, 38, 22, 22, 10, 4);
    wallRing(level, 38, 22, 22, 10, 6, {
      gaps: [
        { x: 50, y: 31 }, { x: 51, y: 31 },   // south entry (upper route)
        { x: 50, y: 32 }, { x: 51, y: 32 },   // south entry (lower route, same gap)
        { x: 38, y: 26 }, { x: 38, y: 27 }    // west exit to goal corridor
      ]
    });
    addHazardRect(level, 44, 24, 2, 2, 'central_spikes');
    setSurface(level, 52, 25, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: -0.5, y: 0, strength: 1.0 } });

    // ─ Goal corridor: ramp from core (z=4) down to goal basin (z=2)
    widePath(level, [{ x: 38, y: 26 }, { x: 30, y: 26 }], 4, 3);
    placeRamp(level, { x: 24, y: 25, dir: 'west', length: 5, width: 3, startZ: 4, endZ: 2 });

    // ─ Goal basin (z=2)
    fillTrack(level, 8, 22, 18, 10, 2);
    wallRing(level, 8, 22, 18, 10, 4, {
      gaps: [
        { x: 25, y: 26 }, { x: 25, y: 27 }   // east entry from ramp
      ]
    });
    // Hazard near goal
    addHazardRect(level, 14, 24, 2, 1, 'goal_guard');
    setSurface(level, 12, 26, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 0.6, y: 0, strength: 1.0 } });
    // Goal on flat track tile (NOT a bounce tile)
    setSurface(level, 20, 26, { baseHeight: 2, shape: SHAPES.FLAT });
    setGoal(level, 20, 26, 0.44);

    // ─ Route graph
    addGraphNode(level, { id: 'start',  type: 'entry', x: 5.5,  y: 40.5, z: 12 });
    addGraphNode(level, { id: 'split',  type: 'fork',  x: 26.5, y: 40.5, z: 11 });
    addGraphNode(level, { id: 'upper',  type: 'route', x: 50.5, y: 37.5, z: 7  });
    addGraphNode(level, { id: 'lower',  type: 'route', x: 50.5, y: 43.5, z: 6  });
    addGraphNode(level, { id: 'core',   type: 'merge', x: 49.5, y: 26.5, z: 4  });
    addGraphNode(level, { id: 'goal',   type: 'goal',  x: 20.5, y: 26.5, z: 2  });
    addGraphEdge(level, { from: 'start', to: 'split',  kind: 'roll'     });
    addGraphEdge(level, { from: 'split', to: 'upper',  kind: 'branch'   });
    addGraphEdge(level, { from: 'split', to: 'lower',  kind: 'branch'   });
    addGraphEdge(level, { from: 'upper', to: 'core',   kind: 'descent'  });
    addGraphEdge(level, { from: 'lower', to: 'core',   kind: 'descent'  });
    addGraphEdge(level, { from: 'core',  to: 'goal',   kind: 'finale'   });

    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 1 — Practice Green
  // Wide, safe intro. One gentle ramp descent, optional shortcut.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildPracticeGreen() {
    const level = createLevelShell({
      id: 'practice_green',
      name: 'Practice Green',
      width: 70,
      height: 52,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 4.5 },
      reward: { presses: 3000, claimKey: 'practice_green' },
      templates: ['intro', 'single_path', 'shortcut']
    });

    // Start plateau (z=14), 8×8
    fillTrack(level, 2, 2, 8, 8, 14);
    wallRing(level, 2, 2, 8, 8, 16, {
      gaps: [
        { x: 9, y: 5 }, { x: 9, y: 6 }, { x: 9, y: 7 }, { x: 9, y: 8 },
        { x: 9, y: 9 }
      ]
    });

    // Main corridor east (z=14), 16×5
    fillTrack(level, 10, 5, 16, 5, 14);
    wallRing(level, 10, 5, 16, 5, 16, {
      gaps: [
        { x: 10, y: 5 }, { x: 10, y: 6 }, { x: 10, y: 7 }, { x: 10, y: 8 }, { x: 10, y: 9 },
        { x: 25, y: 5 }, { x: 25, y: 6 }, { x: 25, y: 7 }, { x: 25, y: 8 }, { x: 25, y: 9 }
      ]
    });

    // Wide ramp south (z=14→10), 6 tiles × 5 wide
    placeRamp(level, { x: 10, y: 10, dir: 'south', length: 6, width: 5, startZ: 14, endZ: 10 });

    // Mid platform (z=10), 16×8
    fillTrack(level, 10, 16, 16, 8, 10);
    wallRing(level, 10, 16, 16, 8, 12, {
      gaps: [
        { x: 10, y: 16 }, { x: 11, y: 16 }, { x: 12, y: 16 }, { x: 13, y: 16 }, { x: 14, y: 16 },
        { x: 25, y: 18 }, { x: 25, y: 19 }, { x: 25, y: 20 }, { x: 25, y: 21 }
      ]
    });

    // Final ramp east (z=10→6), 6 tiles × 4 wide
    placeRamp(level, { x: 26, y: 18, dir: 'east', length: 6, width: 4, startZ: 10, endZ: 6 });

    // Goal basin (z=6), 8×8
    fillTrack(level, 32, 16, 8, 8, 6);
    wallRing(level, 32, 16, 8, 8, 8, {
      gaps: [
        { x: 32, y: 18 }, { x: 32, y: 19 }, { x: 32, y: 20 }, { x: 32, y: 21 }
      ]
    });

     // Shortcut: narrow east corridor from start plateau, ramp south to mid platform
    fillTrack(level, 10, 8, 8, 2, 14);
    placeRamp(level, { x: 18, y: 8, dir: 'south', length: 5, width: 2, startZ: 14, endZ: 10 });

    // === EXTENSION: second half — fork from goal basin east wall ===
    // Open east wall of goal basin to continue
    // Fork junction (z=6), 10×8
    fillTrack(level, 40, 16, 10, 8, 6);
    wallRing(level, 40, 16, 10, 8, 8, {
      gaps: [
        { x: 40, y: 18 }, { x: 40, y: 19 }, { x: 40, y: 20 }, { x: 40, y: 21 },
        { x: 49, y: 16 }, { x: 49, y: 17 }, { x: 49, y: 18 }, { x: 49, y: 19 },
        { x: 49, y: 20 }, { x: 49, y: 21 }, { x: 49, y: 22 }, { x: 49, y: 23 }
      ]
    });
    // Also open east wall of original goal basin to connect
    setSurface(level, 39, 18, { baseHeight: 6, shape: SHAPES.FLAT });
    setSurface(level, 39, 19, { baseHeight: 6, shape: SHAPES.FLAT });
    setSurface(level, 39, 20, { baseHeight: 6, shape: SHAPES.FLAT });
    setSurface(level, 39, 21, { baseHeight: 6, shape: SHAPES.FLAT });

    // Path A (north): narrow corridor with conveyor, ramp down to lower basin
    fillTrack(level, 50, 14, 14, 5, 6);
    for (let cx = 52; cx < 62; cx++) {
      for (let cy = 14; cy < 19; cy++) {
        setSurface(level, cx, cy, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: 0.7, y: 0, strength: 1.2 } });
      }
    }
    wallRing(level, 50, 14, 14, 5, 8, {
      gaps: [
        { x: 50, y: 16 }, { x: 50, y: 17 }, { x: 50, y: 18 },
        { x: 63, y: 14 }, { x: 63, y: 15 }, { x: 63, y: 16 }, { x: 63, y: 17 }, { x: 63, y: 18 }
      ]
    });
    placeRamp(level, { x: 64, y: 14, dir: 'east', length: 5, width: 5, startZ: 6, endZ: 2 });

    // Path B (south): wide open path with crumble tiles and column obstacles
    fillTrack(level, 50, 20, 14, 8, 6);
    setSurface(level, 55, 22, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.0 } });
    setSurface(level, 55, 23, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.0 } });
    setSurface(level, 56, 22, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.0 } });
    setSurface(level, 56, 23, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.0 } });
    // Column obstacles staggered
    setSurface(level, 53, 20, { baseHeight: 10, shape: SHAPES.FLAT });
    setSurface(level, 53, 21, { baseHeight: 10, shape: SHAPES.FLAT });
    setSurface(level, 59, 25, { baseHeight: 10, shape: SHAPES.FLAT });
    setSurface(level, 59, 26, { baseHeight: 10, shape: SHAPES.FLAT });
    wallRing(level, 50, 20, 14, 8, 8, {
      gaps: [
        { x: 50, y: 21 }, { x: 50, y: 22 }, { x: 50, y: 23 }, { x: 50, y: 24 }, { x: 50, y: 25 },
        { x: 63, y: 20 }, { x: 63, y: 21 }, { x: 63, y: 22 }, { x: 63, y: 23 }, { x: 63, y: 24 }, { x: 63, y: 25 }, { x: 63, y: 26 }, { x: 63, y: 27 }
      ]
    });
    placeRamp(level, { x: 64, y: 20, dir: 'east', length: 5, width: 8, startZ: 6, endZ: 2 });

    // Lower goal basin (z=2), 10×18 — both paths converge
    fillTrack(level, 58, 12, 10, 18, 2);
    wallRing(level, 58, 12, 10, 18, 4, {
      gaps: [
        { x: 58, y: 14 }, { x: 58, y: 15 }, { x: 58, y: 16 }, { x: 58, y: 17 }, { x: 58, y: 18 },
        { x: 58, y: 20 }, { x: 58, y: 21 }, { x: 58, y: 22 }, { x: 58, y: 23 }, { x: 58, y: 24 }, { x: 58, y: 25 }, { x: 58, y: 26 }, { x: 58, y: 27 }
      ]
    });
    setGoal(level, 63, 20, 0.44);

    addGraphNode(level, { id: 'start',   type: 'entry', x: 4.5,  y: 4.5,  z: 14 });
    addGraphNode(level, { id: 'mid',     type: 'hub',   x: 18.5, y: 20.5, z: 10 });
    addGraphNode(level, { id: 'fork',    type: 'fork',  x: 44.5, y: 20.5, z: 6  });
    addGraphNode(level, { id: 'path_a',  type: 'route', x: 56.5, y: 16.5, z: 6  });
    addGraphNode(level, { id: 'path_b',  type: 'route', x: 56.5, y: 24.5, z: 6  });
    addGraphNode(level, { id: 'goal',    type: 'goal',  x: 63.5, y: 20.5, z: 2  });
    addGraphEdge(level, { from: 'start',  to: 'mid',    kind: 'roll'    });
    addGraphEdge(level, { from: 'mid',    to: 'fork',   kind: 'descent' });
    addGraphEdge(level, { from: 'fork',   to: 'path_a', kind: 'roll',    tag: 'conveyor' });
    addGraphEdge(level, { from: 'fork',   to: 'path_b', kind: 'roll',    tag: 'crumble'  });
    addGraphEdge(level, { from: 'path_a', to: 'goal',   kind: 'descent' });
    addGraphEdge(level, { from: 'path_b', to: 'goal',   kind: 'descent' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 2 — Terrace Falls
  // Stepped terraces, two paths fork and rejoin.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTerracesFalls() {
    const level = createLevelShell({
      id: 'terrace_falls',
      name: 'Terrace Falls',
      width: 80,
      height: 60,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 4.5 },
      reward: { presses: 5000, claimKey: 'terrace_falls' },
      templates: ['fork_rejoin', 'terrace']
    });

    // Start plateau (z=16), 8×8
    fillTrack(level, 2, 2, 8, 8, 16);
    wallRing(level, 2, 2, 8, 8, 18, {
      gaps: [{ x: 9, y: 5 }, { x: 9, y: 6 }, { x: 9, y: 7 }, { x: 9, y: 8 }]
    });

    // Entry corridor east (z=16), 8×5
    fillTrack(level, 10, 5, 8, 5, 16);
    wallRing(level, 10, 5, 8, 5, 18, {
      gaps: [
        { x: 10, y: 5 }, { x: 10, y: 6 }, { x: 10, y: 7 }, { x: 10, y: 8 }, { x: 10, y: 9 },
        { x: 17, y: 5 }, { x: 17, y: 6 }, { x: 17, y: 7 }, { x: 17, y: 8 }, { x: 17, y: 9 }
      ]
    });

    // Ramp east to Terrace A (z=16→12), 6×5
    placeRamp(level, { x: 18, y: 5, dir: 'east', length: 6, width: 5, startZ: 16, endZ: 12 });

    // Terrace A (z=12), 14×10 — fork
    fillTrack(level, 24, 4, 14, 10, 12);
    wallRing(level, 24, 4, 14, 10, 14, {
      gaps: [
        { x: 24, y: 5 }, { x: 24, y: 6 }, { x: 24, y: 7 }, { x: 24, y: 8 },
        { x: 28, y: 4 }, { x: 29, y: 4 }, { x: 30, y: 4 }, { x: 31, y: 4 },
        { x: 28, y: 13 }, { x: 29, y: 13 }, { x: 30, y: 13 }, { x: 31, y: 13 }
      ]
    });

    // North path: corridor + ramp down to Terrace B
    fillTrack(level, 28, 0, 5, 5, 12);
    placeRamp(level, { x: 28, y: 0, dir: 'north', length: 4, width: 5, startZ: 12, endZ: 8 });

    // South path: corridor + longer ramp to Terrace B
    fillTrack(level, 28, 14, 5, 8, 12);
    placeRamp(level, { x: 28, y: 22, dir: 'south', length: 6, width: 5, startZ: 12, endZ: 8 });

    // Terrace B (z=8), 18×10 — paths rejoin
    fillTrack(level, 24, 28, 18, 10, 8);
    fillTrack(level, 28, 8, 5, 20, 8);  // vertical connector from north path
    wallRing(level, 24, 28, 18, 10, 10, {
      gaps: [
        { x: 28, y: 28 }, { x: 29, y: 28 }, { x: 30, y: 28 }, { x: 31, y: 28 },
        { x: 37, y: 31 }, { x: 37, y: 32 }, { x: 37, y: 33 }, { x: 37, y: 34 }
      ]
    });

    // Final ramp east (z=8→4), 6×4
    placeRamp(level, { x: 38, y: 31, dir: 'east', length: 6, width: 4, startZ: 8, endZ: 4 });

    // Goal basin (z=4), 6×8
    fillTrack(level, 44, 29, 6, 8, 4);
    wallRing(level, 44, 29, 6, 8, 6, {
      gaps: [{ x: 44, y: 31 }, { x: 44, y: 32 }, { x: 44, y: 33 }, { x: 44, y: 34 }]
    });

    // === EXTENSION: Terrace C and final fork ===
    // Open east wall of goal basin to continue
    setSurface(level, 49, 31, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 49, 32, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 49, 33, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 49, 34, { baseHeight: 4, shape: SHAPES.FLAT });

    // Terrace C fork junction (z=4), 14×10
    fillTrack(level, 50, 29, 14, 10, 4);
    wallRing(level, 50, 29, 14, 10, 6, {
      gaps: [
        { x: 50, y: 31 }, { x: 50, y: 32 }, { x: 50, y: 33 }, { x: 50, y: 34 },
        { x: 56, y: 29 }, { x: 57, y: 29 }, { x: 58, y: 29 }, { x: 59, y: 29 },
        { x: 56, y: 38 }, { x: 57, y: 38 }, { x: 58, y: 38 }, { x: 59, y: 38 }
      ]
    });

    // Path A (north): crumble-tile bridge, narrow, fast
    fillTrack(level, 56, 24, 5, 6, 4);
    for (let cx = 57; cx < 60; cx++) {
      for (let cy = 25; cy < 29; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.35, downtime: 2.2 } });
      }
    }
    wallRing(level, 56, 24, 5, 6, 6, {
      gaps: [
        { x: 56, y: 29 }, { x: 57, y: 29 }, { x: 58, y: 29 }, { x: 59, y: 29 }, { x: 60, y: 29 },
        { x: 60, y: 24 }, { x: 60, y: 25 }, { x: 60, y: 26 }, { x: 60, y: 27 }, { x: 60, y: 28 }, { x: 60, y: 29 }
      ]
    });
    placeRamp(level, { x: 61, y: 24, dir: 'east', length: 5, width: 6, startZ: 4, endZ: 0 });

    // Path B (south): long detour with timed gate, safe
    fillTrack(level, 56, 39, 5, 10, 4);
    addTimedGate(level, 'gate_tc_south', 58, 43, 6, 3, 2, 1.6, 1.4);
    wallRing(level, 56, 39, 5, 10, 6, {
      gaps: [
        { x: 56, y: 38 }, { x: 57, y: 38 }, { x: 58, y: 38 }, { x: 59, y: 38 }, { x: 60, y: 38 },
        { x: 60, y: 39 }, { x: 60, y: 40 }, { x: 60, y: 41 }, { x: 60, y: 42 }, { x: 60, y: 43 }, { x: 60, y: 44 }, { x: 60, y: 45 }, { x: 60, y: 46 }, { x: 60, y: 47 }, { x: 60, y: 48 }
      ]
    });
    placeRamp(level, { x: 61, y: 39, dir: 'east', length: 5, width: 10, startZ: 4, endZ: 0 });

    // Lower goal basin (z=0), 12×26 — both paths converge
    fillTrack(level, 66, 22, 12, 26, 0);
    wallRing(level, 66, 22, 12, 26, 2, {
      gaps: [
        { x: 66, y: 24 }, { x: 66, y: 25 }, { x: 66, y: 26 }, { x: 66, y: 27 }, { x: 66, y: 28 }, { x: 66, y: 29 },
        { x: 66, y: 39 }, { x: 66, y: 40 }, { x: 66, y: 41 }, { x: 66, y: 42 }, { x: 66, y: 43 }, { x: 66, y: 44 }, { x: 66, y: 45 }, { x: 66, y: 46 }, { x: 66, y: 47 }, { x: 66, y: 48 }
      ]
    });
    setGoal(level, 72, 34, 0.44);

    addGraphNode(level, { id: 'start',    type: 'entry', x: 4.5,  y: 4.5,  z: 16 });
    addGraphNode(level, { id: 'terraceA', type: 'fork',  x: 31.5, y: 9.5,  z: 12 });
    addGraphNode(level, { id: 'terraceB', type: 'merge', x: 31.5, y: 33.5, z: 8  });
    addGraphNode(level, { id: 'terraceC', type: 'fork',  x: 57.5, y: 33.5, z: 4  });
    addGraphNode(level, { id: 'path_a',   type: 'route', x: 58.5, y: 26.5, z: 4  });
    addGraphNode(level, { id: 'path_b',   type: 'route', x: 58.5, y: 43.5, z: 4  });
    addGraphNode(level, { id: 'goal',     type: 'goal',  x: 72.5, y: 34.5, z: 0  });
    addGraphEdge(level, { from: 'start',    to: 'terraceA', kind: 'descent'    });
    addGraphEdge(level, { from: 'terraceA', to: 'terraceB', kind: 'roll',       tag: 'north_path' });
    addGraphEdge(level, { from: 'terraceA', to: 'terraceB', kind: 'descent',    tag: 'south_path' });
    addGraphEdge(level, { from: 'terraceB', to: 'terraceC', kind: 'descent'    });
    addGraphEdge(level, { from: 'terraceC', to: 'path_a',   kind: 'crumble'    });
    addGraphEdge(level, { from: 'terraceC', to: 'path_b',   kind: 'timed_cross'});
    addGraphEdge(level, { from: 'path_a',   to: 'goal',     kind: 'descent'    });
    addGraphEdge(level, { from: 'path_b',   to: 'goal',     kind: 'descent'    });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 3 — The Switchback
  // Classic zigzag descent, first crumble tiles at corners.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTheSwitchback() {
    const level = createLevelShell({
      id: 'the_switchback',
      name: 'The Switchback',
      width: 38,
      height: 120,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 4.5 },
      reward: { presses: 8000, claimKey: 'the_switchback' },
      templates: ['switchback', 'crumble']
    });

    // Start plateau (z=18), 8×6
    fillTrack(level, 2, 2, 8, 6, 18);
    wallRing(level, 2, 2, 8, 6, 20, {
      gaps: [{ x: 9, y: 4 }, { x: 9, y: 5 }, { x: 9, y: 6 }, { x: 9, y: 7 }]
    });

    // Leg A: east corridor (z=18), 14×5
    fillTrack(level, 10, 4, 14, 5, 18);
    wallRing(level, 10, 4, 14, 5, 20, {
      gaps: [
        { x: 10, y: 4 }, { x: 10, y: 5 }, { x: 10, y: 6 }, { x: 10, y: 7 }, { x: 10, y: 8 },
        { x: 23, y: 4 }, { x: 23, y: 5 }, { x: 23, y: 6 }, { x: 23, y: 7 }, { x: 23, y: 8 }
      ]
    });

    // Ramp A south (z=18→14), 6×5
    placeRamp(level, { x: 10, y: 9, dir: 'south', length: 6, width: 5, startZ: 18, endZ: 14 });

    // Turn platform A (z=14), 14×6 — crumble at inner corner
    fillTrack(level, 2, 15, 14, 6, 14);
    setSurface(level, 10, 16, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    setSurface(level, 11, 16, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    setSurface(level, 10, 17, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    wallRing(level, 2, 15, 14, 6, 16, {
      gaps: [
        // North entry: x:10-15 (east wall corner x=15 included)
        { x: 10, y: 15 }, { x: 11, y: 15 }, { x: 12, y: 15 }, { x: 13, y: 15 }, { x: 14, y: 15 }, { x: 15, y: 15 },
        // West exit: y:17-20 (south corner y=20 included)
        { x: 2, y: 17 }, { x: 2, y: 18 }, { x: 2, y: 19 }, { x: 2, y: 20 },
        // South wall at y=20 needs west corner open for Leg B entry
        { x: 3, y: 20 }, { x: 4, y: 20 }, { x: 5, y: 20 }, { x: 6, y: 20 }
      ]
    });

    // Leg B: west corridor (z=14), 14×5
    // Marble enters from west (x=2, from Turn A) and exits east (x=15) to Ramp B
    fillTrack(level, 2, 21, 14, 5, 14);
    wallRing(level, 2, 21, 14, 5, 16, {
      gaps: [
        // West entry from Turn A: full west column y:21-25
        { x: 2, y: 21 }, { x: 2, y: 22 }, { x: 2, y: 23 }, { x: 2, y: 24 }, { x: 2, y: 25 },
        // East exit to Ramp B: full east column y:21-25
        { x: 15, y: 21 }, { x: 15, y: 22 }, { x: 15, y: 23 }, { x: 15, y: 24 }, { x: 15, y: 25 }
      ]
    });
    // Ramp B south (z=14→10), 6×5 — now on EAST side of Leg B (S-shape)
    placeRamp(level, { x: 11, y: 26, dir: 'south', length: 6, width: 5, startZ: 14, endZ: 10 });
    // Turn platform B (z=10), 14×6 — crumble on inner corner
    fillTrack(level, 2, 32, 14, 6, 10);
    setSurface(level, 12, 33, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    setSurface(level, 13, 33, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    setSurface(level, 12, 34, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    wallRing(level, 2, 32, 14, 6, 12, {
      gaps: [
        // North entry from Ramp B (east side): x:11-15 — 5 tiles wide
        { x: 11, y: 32 }, { x: 12, y: 32 }, { x: 13, y: 32 }, { x: 14, y: 32 }, { x: 15, y: 32 },
        // South exit to Leg C (west side): x:2-7 — 6 tiles wide
        { x: 2, y: 37 }, { x: 3, y: 37 }, { x: 4, y: 37 }, { x: 5, y: 37 }, { x: 6, y: 37 }, { x: 7, y: 37 }
      ]
    });
    // Leg C: east corridor (z=10), 14×5 — now exits from west side of Turn B
    fillTrack(level, 2, 38, 14, 5, 10);
    wallRing(level, 2, 38, 14, 5, 12, {
      gaps: [
        // West entry from Turn B: x:2-7 — 6 tiles wide
        { x: 2, y: 38 }, { x: 3, y: 38 }, { x: 4, y: 38 }, { x: 5, y: 38 }, { x: 6, y: 38 }, { x: 7, y: 38 },
        // East exit to Ramp C: full east column y:38-42 (south corner y=42 included)
        { x: 15, y: 38 }, { x: 15, y: 39 }, { x: 15, y: 40 }, { x: 15, y: 41 }, { x: 15, y: 42 },
        // South-east corner open
        { x: 15, y: 42 }
      ]
    });
    // Ramp C south (z=10→6), 6×5 — aligned with Leg C east exit at x:11-15
    placeRamp(level, { x: 11, y: 43, dir: 'south', length: 6, width: 5, startZ: 10, endZ: 6 });

    // Turn platform C (z=6), 14×6
    // Exit gap on south wall at x:10-14 — aligned with where marble arrives from Ramp C
    fillTrack(level, 2, 49, 14, 6, 6);
    setSurface(level, 4, 51, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    setSurface(level, 5, 51, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    setSurface(level, 4, 52, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.0 } });
    wallRing(level, 2, 49, 14, 6, 8, {
      gaps: [
        // North entry from Ramp C: x:11-15 (aligned with Ramp C at x:11-15)
        { x: 11, y: 49 }, { x: 12, y: 49 }, { x: 13, y: 49 }, { x: 14, y: 49 }, { x: 15, y: 49 },
        // South exit: x:10-15 (east wall corner x=15 included)
        { x: 10, y: 54 }, { x: 11, y: 54 }, { x: 12, y: 54 }, { x: 13, y: 54 }, { x: 14, y: 54 }, { x: 15, y: 54 }
      ]
    });

       // Ramp D south (z=6→2), 6×5 — continues from Turn C south exit
    placeRamp(level, { x: 10, y: 55, dir: 'south', length: 6, width: 5, startZ: 6, endZ: 2 });

    // === EXTENSION: Legs D and E with fork ===
    // Leg D: west corridor (z=2), 14×5
    fillTrack(level, 2, 61, 14, 5, 2);
    wallRing(level, 2, 61, 14, 5, 4, {
      gaps: [
        { x: 11, y: 61 }, { x: 12, y: 61 }, { x: 13, y: 61 }, { x: 14, y: 61 }, { x: 15, y: 61 },
        { x: 2, y: 61 }, { x: 2, y: 62 }, { x: 2, y: 63 }, { x: 2, y: 64 }, { x: 2, y: 65 }
      ]
    });

    // Turn platform D (z=2), 14×6 — fork: straight vs crumble shortcut
    fillTrack(level, 2, 66, 14, 6, 2);
    wallRing(level, 2, 66, 14, 6, 4, {
      gaps: [
        { x: 2, y: 66 }, { x: 2, y: 67 }, { x: 2, y: 68 }, { x: 2, y: 69 }, { x: 2, y: 70 }, { x: 2, y: 71 },
        // Path A exit: east side
        { x: 11, y: 71 }, { x: 12, y: 71 }, { x: 13, y: 71 }, { x: 14, y: 71 }, { x: 15, y: 71 },
        // Path B exit: west side (shortcut)
        { x: 2, y: 68 }, { x: 3, y: 68 }, { x: 4, y: 68 }, { x: 5, y: 68 }
      ]
    });
    // Crumble tiles in Turn D for path B shortcut
    setSurface(level, 3, 67, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.3, downtime: 2.5 } });
    setSurface(level, 4, 67, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.3, downtime: 2.5 } });
    setSurface(level, 3, 68, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.3, downtime: 2.5 } });
    setSurface(level, 4, 68, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.3, downtime: 2.5 } });

    // Path A (east): Leg E east corridor (z=2), 14×5 — with timed gate
    fillTrack(level, 11, 72, 14, 5, 2);
    addTimedGate(level, 'gate_leg_e', 16, 73, 4, 3, 2, 1.8, 1.2);
    wallRing(level, 11, 72, 14, 5, 4, {
      gaps: [
        { x: 11, y: 71 }, { x: 12, y: 71 }, { x: 13, y: 71 }, { x: 14, y: 71 }, { x: 15, y: 71 },
        { x: 11, y: 76 }, { x: 12, y: 76 }, { x: 13, y: 76 }, { x: 14, y: 76 }, { x: 15, y: 76 }, { x: 16, y: 76 }, { x: 17, y: 76 }, { x: 18, y: 76 }, { x: 19, y: 76 }, { x: 20, y: 76 }, { x: 21, y: 76 }, { x: 22, y: 76 }, { x: 23, y: 76 }, { x: 24, y: 76 }
      ]
    });
    placeRamp(level, { x: 11, y: 77, dir: 'south', length: 5, width: 5, startZ: 2, endZ: -2 });

    // Path B (west shortcut): narrow crumble corridor direct to basin
    fillTrack(level, 2, 72, 8, 5, 2);
    for (let cx = 3; cx < 9; cx++) {
      for (let cy = 72; cy < 77; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.25, downtime: 3.0 } });
      }
    }
    wallRing(level, 2, 72, 8, 5, 4, {
      gaps: [
        { x: 2, y: 68 }, { x: 3, y: 68 }, { x: 4, y: 68 }, { x: 5, y: 68 },
        { x: 2, y: 72 }, { x: 2, y: 73 }, { x: 2, y: 74 }, { x: 2, y: 75 }, { x: 2, y: 76 },
        { x: 9, y: 72 }, { x: 9, y: 73 }, { x: 9, y: 74 }, { x: 9, y: 75 }, { x: 9, y: 76 }
      ]
    });
    placeRamp(level, { x: 9, y: 77, dir: 'south', length: 5, width: 5, startZ: 2, endZ: -2 });

    // Final goal basin (z=-2), 20×10 — both paths converge
    fillTrack(level, 2, 82, 20, 10, -2);
    wallRing(level, 2, 82, 20, 10, 0, {
      gaps: [
        { x: 9, y: 82 }, { x: 10, y: 82 }, { x: 11, y: 82 }, { x: 12, y: 82 }, { x: 13, y: 82 },
        { x: 11, y: 82 }, { x: 12, y: 82 }, { x: 13, y: 82 }, { x: 14, y: 82 }, { x: 15, y: 82 }
      ]
    });
    setGoal(level, 12, 88, 0.44);

    addGraphNode(level, { id: 'start',  type: 'entry',  x: 4.5,  y: 4.5,  z: 18 });
    addGraphNode(level, { id: 'turn_a', type: 'corner', x: 8.5,  y: 18.5, z: 14 });
    addGraphNode(level, { id: 'turn_b', type: 'corner', x: 8.5,  y: 35.5, z: 10 });
    addGraphNode(level, { id: 'turn_c', type: 'corner', x: 12.5, y: 52.5, z: 6  });
    addGraphNode(level, { id: 'turn_d', type: 'fork',   x: 8.5,  y: 69.5, z: 2  });
    addGraphNode(level, { id: 'path_a', type: 'route',  x: 18.5, y: 74.5, z: 2  });
    addGraphNode(level, { id: 'path_b', type: 'route',  x: 5.5,  y: 74.5, z: 2  });
    addGraphNode(level, { id: 'goal',   type: 'goal',   x: 12.5, y: 88.5, z: -2 });
    addGraphEdge(level, { from: 'start',  to: 'turn_a', kind: 'switchback'  });
    addGraphEdge(level, { from: 'turn_a', to: 'turn_b', kind: 'switchback'  });
    addGraphEdge(level, { from: 'turn_b', to: 'turn_c', kind: 'switchback'  });
    addGraphEdge(level, { from: 'turn_c', to: 'turn_d', kind: 'switchback'  });
    addGraphEdge(level, { from: 'turn_d', to: 'path_a', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'turn_d', to: 'path_b', kind: 'crumble'     });
    addGraphEdge(level, { from: 'path_a', to: 'goal',   kind: 'descent'     });
    addGraphEdge(level, { from: 'path_b', to: 'goal',   kind: 'descent'     });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 4 — Canal Run
  // Long canal, two lane choices, conveyor tiles.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildCanalRun() {
    const level = createLevelShell({
      id: 'canal_run',
      name: 'Canal Run',
      width: 68,
      height: 56,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 4.5 },
      reward: { presses: 12000, claimKey: 'canal_run' },
      templates: ['canal', 'conveyor', 'fork_rejoin']
    });

    // Start plateau (z=14), 8×8
    fillTrack(level, 2, 2, 8, 8, 14);
    wallRing(level, 2, 2, 8, 8, 16, {
      gaps: [{ x: 9, y: 5 }, { x: 9, y: 6 }, { x: 9, y: 7 }, { x: 9, y: 8 }]
    });

    // Canal approach (z=14), 8×6
    fillTrack(level, 10, 5, 8, 6, 14);
    wallRing(level, 10, 5, 8, 6, 16, {
      gaps: [
        { x: 10, y: 5 }, { x: 10, y: 6 }, { x: 10, y: 7 }, { x: 10, y: 8 }, { x: 10, y: 9 }, { x: 10, y: 10 },
        { x: 17, y: 5 }, { x: 17, y: 6 }, { x: 17, y: 7 }, { x: 17, y: 8 }, { x: 17, y: 9 }, { x: 17, y: 10 }
      ]
    });

    // Ramp east (z=14→10), 5×6
    placeRamp(level, { x: 18, y: 5, dir: 'east', length: 5, width: 6, startZ: 14, endZ: 10 });

    // Canal fork junction (z=10), 6×10
    fillTrack(level, 23, 4, 6, 10, 10);
    wallRing(level, 23, 4, 6, 10, 12, {
      gaps: [
        { x: 23, y: 5 }, { x: 23, y: 6 }, { x: 23, y: 7 }, { x: 23, y: 8 },
        { x: 28, y: 4 }, { x: 28, y: 5 }, { x: 28, y: 6 }, { x: 28, y: 7 },
        { x: 28, y: 8 }, { x: 28, y: 9 }, { x: 28, y: 10 }, { x: 28, y: 11 }, { x: 28, y: 12 }, { x: 28, y: 13 }
      ]
    });

    // Upper (north) lane (z=10), 20×4 — conveyor
    fillTrack(level, 29, 4, 20, 4, 10);
    for (let cx = 31; cx < 47; cx++) {
      for (let cy = 4; cy < 8; cy++) {
        setSurface(level, cx, cy, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 0.8, y: 0, strength: 1.4 } });
      }
    }
    addHazardRect(level, 36, 5, 2, 2, 'canal_spikes_north');
    wallRing(level, 29, 4, 20, 4, 12, {
      gaps: [
        { x: 29, y: 4 }, { x: 29, y: 5 }, { x: 29, y: 6 }, { x: 29, y: 7 },
        { x: 48, y: 4 }, { x: 48, y: 5 }, { x: 48, y: 6 }, { x: 48, y: 7 }
      ]
    });

    // Lower (south) lane (z=10), 20×6 — wider, column obstacles staggered
    fillTrack(level, 29, 8, 20, 6, 10);
    // Column pair 1: north side, leaves gap on south (y:11-13)
    setSurface(level, 33, 8,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 33, 9,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 33, 10, { baseHeight: 14, shape: SHAPES.FLAT });
    // Column pair 2: south side, leaves gap on north (y:8-10)
    setSurface(level, 38, 11, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 38, 12, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 38, 13, { baseHeight: 14, shape: SHAPES.FLAT });
    // Column pair 3: north side again
    setSurface(level, 43, 8,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 43, 9,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 43, 10, { baseHeight: 14, shape: SHAPES.FLAT });
    wallRing(level, 29, 8, 20, 6, 12, {
      gaps: [
        { x: 29, y: 8 }, { x: 29, y: 9 }, { x: 29, y: 10 }, { x: 29, y: 11 }, { x: 29, y: 12 }, { x: 29, y: 13 },
        { x: 48, y: 8 }, { x: 48, y: 9 }, { x: 48, y: 10 }, { x: 48, y: 11 }, { x: 48, y: 12 }, { x: 48, y: 13 }
      ]
    });

    // Merge platform (z=10), 10×12
    fillTrack(level, 49, 3, 10, 12, 10);
    wallRing(level, 49, 3, 10, 12, 12, {
      gaps: [
        { x: 49, y: 4 }, { x: 49, y: 5 }, { x: 49, y: 6 }, { x: 49, y: 7 },
        { x: 49, y: 8 }, { x: 49, y: 9 }, { x: 49, y: 10 }, { x: 49, y: 11 }, { x: 49, y: 12 }, { x: 49, y: 13 },
        { x: 54, y: 7 }, { x: 54, y: 8 }, { x: 54, y: 9 }, { x: 54, y: 10 }
      ]
    });

       // Ramp south from merge platform (z=10→6), 5×5 — into second canal section
    placeRamp(level, { x: 55, y: 7, dir: 'south', length: 5, width: 5, startZ: 10, endZ: 6 });

    // === EXTENSION: second canal section ===
    // Second fork junction (z=6), 6×14
    fillTrack(level, 49, 15, 10, 14, 6);
    wallRing(level, 49, 15, 10, 14, 8, {
      gaps: [
        // North entry from ramp
        { x: 51, y: 15 }, { x: 52, y: 15 }, { x: 53, y: 15 }, { x: 54, y: 15 }, { x: 55, y: 15 },
        // West exit upper lane
        { x: 49, y: 16 }, { x: 49, y: 17 }, { x: 49, y: 18 }, { x: 49, y: 19 },
        // West exit lower lane
        { x: 49, y: 22 }, { x: 49, y: 23 }, { x: 49, y: 24 }, { x: 49, y: 25 }, { x: 49, y: 26 }, { x: 49, y: 27 }, { x: 49, y: 28 }
      ]
    });

    // Upper lane (z=6), 20×4 — moving platform bridge over void
    fillTrack(level, 29, 16, 20, 4, 6);
    clearSurfaceRect(level, 36, 16, 6, 4);
    addMovingBridge(level, 'bridge_canal2', [
      { x: 36, y: 16, z: 6 },
      { x: 39, y: 16, z: 6 }
    ], 4, 4, 0.55);
    wallRing(level, 29, 16, 20, 4, 8, {
      gaps: [
        { x: 48, y: 16 }, { x: 48, y: 17 }, { x: 48, y: 18 }, { x: 48, y: 19 },
        { x: 29, y: 16 }, { x: 29, y: 17 }, { x: 29, y: 18 }, { x: 29, y: 19 }
      ]
    });

    // Lower lane (z=6), 20×6 — timed gate + column obstacles
    fillTrack(level, 29, 22, 20, 6, 6);
    addTimedGate(level, 'gate_canal2', 35, 23, 8, 3, 2, 1.6, 1.4);
    setSurface(level, 40, 22, { baseHeight: 10, shape: SHAPES.FLAT });
    setSurface(level, 40, 23, { baseHeight: 10, shape: SHAPES.FLAT });
    setSurface(level, 44, 25, { baseHeight: 10, shape: SHAPES.FLAT });
    setSurface(level, 44, 26, { baseHeight: 10, shape: SHAPES.FLAT });
    wallRing(level, 29, 22, 20, 6, 8, {
      gaps: [
        { x: 48, y: 22 }, { x: 48, y: 23 }, { x: 48, y: 24 }, { x: 48, y: 25 }, { x: 48, y: 26 }, { x: 48, y: 27 }, { x: 48, y: 28 },
        { x: 29, y: 22 }, { x: 29, y: 23 }, { x: 29, y: 24 }, { x: 29, y: 25 }, { x: 29, y: 26 }, { x: 29, y: 27 }, { x: 29, y: 28 }
      ]
    });

    // Second merge platform (z=6), 10×14
    fillTrack(level, 19, 15, 10, 14, 6);
    wallRing(level, 19, 15, 10, 14, 8, {
      gaps: [
        { x: 28, y: 16 }, { x: 28, y: 17 }, { x: 28, y: 18 }, { x: 28, y: 19 },
        { x: 28, y: 22 }, { x: 28, y: 23 }, { x: 28, y: 24 }, { x: 28, y: 25 }, { x: 28, y: 26 }, { x: 28, y: 27 }, { x: 28, y: 28 },
        { x: 22, y: 28 }, { x: 23, y: 28 }, { x: 24, y: 28 }, { x: 25, y: 28 }
      ]
    });

    // Final ramp south (z=6→2), 5×5
    placeRamp(level, { x: 21, y: 29, dir: 'south', length: 5, width: 5, startZ: 6, endZ: 2 });
    // Goal basin (z=2), 14×10
    fillTrack(level, 15, 34, 14, 10, 2);
    wallRing(level, 15, 34, 14, 10, 4, {
      gaps: [{ x: 21, y: 34 }, { x: 22, y: 34 }, { x: 23, y: 34 }, { x: 24, y: 34 }, { x: 25, y: 34 }]
    });
    setGoal(level, 22, 40, 0.44);

    addGraphNode(level, { id: 'start',     type: 'entry', x: 4.5,  y: 6.5,  z: 14 });
    addGraphNode(level, { id: 'junction1', type: 'fork',  x: 26.5, y: 9.5,  z: 10 });
    addGraphNode(level, { id: 'merge1',    type: 'merge', x: 54.5, y: 9.5,  z: 10 });
    addGraphNode(level, { id: 'junction2', type: 'fork',  x: 54.5, y: 22.5, z: 6  });
    addGraphNode(level, { id: 'merge2',    type: 'merge', x: 24.5, y: 22.5, z: 6  });
    addGraphNode(level, { id: 'goal',      type: 'goal',  x: 22.5, y: 40.5, z: 2  });
    addGraphEdge(level, { from: 'start',     to: 'junction1', kind: 'descent'              });
    addGraphEdge(level, { from: 'junction1', to: 'merge1',    kind: 'roll',   tag: 'north' });
    addGraphEdge(level, { from: 'junction1', to: 'merge1',    kind: 'roll',   tag: 'south' });
    addGraphEdge(level, { from: 'merge1',    to: 'junction2', kind: 'descent'              });
    addGraphEdge(level, { from: 'junction2', to: 'merge2',    kind: 'platform_transfer', tag: 'upper' });
    addGraphEdge(level, { from: 'junction2', to: 'merge2',    kind: 'timed_cross',        tag: 'lower' });
    addGraphEdge(level, { from: 'merge2',    to: 'goal',      kind: 'descent'              });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 5 — The Crossing
  // Open field, void gap bridged by moving platform, first rotating bar.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTheCrossing() {
    const level = createLevelShell({
      id: 'the_crossing',
      name: 'The Crossing',
      width: 90,
      height: 72,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 5.5 },
      reward: { presses: 18000, claimKey: 'the_crossing' },
      templates: ['platform_bridge', 'fork_rejoin', 'rotating_bar']
    });

    // Start plateau (z=14), 10×10
    fillTrack(level, 2, 2, 10, 10, 14);
    wallRing(level, 2, 2, 10, 10, 16, {
      gaps: [{ x: 11, y: 6 }, { x: 11, y: 7 }, { x: 11, y: 8 }, { x: 11, y: 9 }]
    });

    // Approach corridor east (z=14), 10×5
    fillTrack(level, 12, 6, 10, 5, 14);
    wallRing(level, 12, 6, 10, 5, 16, {
      gaps: [
        { x: 12, y: 6 }, { x: 12, y: 7 }, { x: 12, y: 8 }, { x: 12, y: 9 }, { x: 12, y: 10 },
        { x: 21, y: 6 }, { x: 21, y: 7 }, { x: 21, y: 8 }, { x: 21, y: 9 }, { x: 21, y: 10 }
      ]
    });

    // Gap: 6 tiles void (x=22..27) — already void by default
    // Moving platform bridge
    addMovingBridge(level, 'bridge_main', [
      { x: 22, y: 6, z: 14 },
      { x: 24, y: 6, z: 14 }
    ], 4, 4, 0.6);

    // East landing platform (z=14), 12×10
    fillTrack(level, 28, 4, 12, 10, 14);
    wallRing(level, 28, 4, 12, 10, 16, {
      gaps: [
        { x: 28, y: 6 }, { x: 28, y: 7 }, { x: 28, y: 8 }, { x: 28, y: 9 },
        { x: 34, y: 4 }, { x: 35, y: 4 }, { x: 36, y: 4 }, { x: 37, y: 4 },
        { x: 34, y: 13 }, { x: 35, y: 13 }, { x: 36, y: 13 }, { x: 37, y: 13 }
      ]
    });

    // Upper (north) path: 16×4 (z=14→10) — rotating bar
    fillTrack(level, 34, 0, 16, 5, 14);
    placeRamp(level, { x: 34, y: 0, dir: 'north', length: 3, width: 5, startZ: 14, endZ: 10 });
    fillTrack(level, 34, 0, 16, 4, 10);
    addActor(level, {
      id: 'bar_upper',
      kind: ACTOR_KINDS.ROTATING_BAR,
      x: 44, y: 2, z: 10, topHeight: 10,
      width: 1, height: 1,
      armLength: 2.2, armWidth: 0.22,
      angularSpeed: 1.6, fatal: true
    });
    wallRing(level, 34, 0, 16, 4, 12, {
      gaps: [
        { x: 34, y: 0 }, { x: 35, y: 0 }, { x: 36, y: 0 }, { x: 37, y: 0 },
        { x: 49, y: 0 }, { x: 49, y: 1 }, { x: 49, y: 2 }, { x: 49, y: 3 }
      ]
    });

    // Lower (south) path: 20×6 (z=14→10) — wider, no hazards
    fillTrack(level, 34, 14, 20, 6, 14);
    placeRamp(level, { x: 34, y: 20, dir: 'south', length: 3, width: 6, startZ: 14, endZ: 10 });
    fillTrack(level, 34, 14, 20, 6, 10);
    wallRing(level, 34, 14, 20, 6, 12, {
      gaps: [
        { x: 34, y: 14 }, { x: 35, y: 14 }, { x: 36, y: 14 }, { x: 37, y: 14 },
        { x: 53, y: 14 }, { x: 53, y: 15 }, { x: 53, y: 16 }, { x: 53, y: 17 }, { x: 53, y: 18 }, { x: 53, y: 19 }
      ]
    });

    // East merge platform (z=10), 8×22
    fillTrack(level, 50, 0, 8, 22, 10);
    wallRing(level, 50, 0, 8, 22, 12, {
      gaps: [
        { x: 50, y: 0 }, { x: 50, y: 1 }, { x: 50, y: 2 }, { x: 50, y: 3 },
        { x: 50, y: 14 }, { x: 50, y: 15 }, { x: 50, y: 16 }, { x: 50, y: 17 }, { x: 50, y: 18 }, { x: 50, y: 19 },
        { x: 53, y: 21 }, { x: 54, y: 21 }, { x: 55, y: 21 }, { x: 56, y: 21 }
      ]
    });

    // Final ramp south (z=10→4), 6×5
    placeRamp(level, { x: 53, y: 22, dir: 'south', length: 6, width: 5, startZ: 10, endZ: 4 });

    // Goal basin (z=4), 8×8
    fillTrack(level, 51, 28, 8, 8, 4);
    wallRing(level, 51, 28, 8, 8, 6, {
      gaps: [{ x: 53, y: 28 }, { x: 54, y: 28 }, { x: 55, y: 28 }, { x: 56, y: 28 }]
    });

      // === EXTENSION: second crossing section ===
    // Open south wall of goal basin to continue
    setSurface(level, 53, 35, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 54, 35, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 55, 35, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 56, 35, { baseHeight: 4, shape: SHAPES.FLAT });

    // Second approach corridor (z=4), 12×8
    fillTrack(level, 49, 36, 12, 8, 4);
    wallRing(level, 49, 36, 12, 8, 6, {
      gaps: [
        { x: 53, y: 36 }, { x: 54, y: 36 }, { x: 55, y: 36 }, { x: 56, y: 36 },
        { x: 49, y: 40 }, { x: 49, y: 41 }, { x: 49, y: 42 }, { x: 49, y: 43 },
        { x: 55, y: 43 }, { x: 56, y: 43 }, { x: 57, y: 43 }, { x: 58, y: 43 }, { x: 59, y: 43 }, { x: 60, y: 43 }
      ]
    });

    // Path A (west): wide void gap with moving platform bridge
    fillTrack(level, 34, 40, 16, 4, 4);
    clearSurfaceRect(level, 40, 40, 8, 4);
    addMovingBridge(level, 'bridge_cross2', [
      { x: 40, y: 40, z: 4 },
      { x: 44, y: 40, z: 4 }
    ], 4, 4, 0.5);
    wallRing(level, 34, 40, 16, 4, 6, {
      gaps: [
        { x: 49, y: 40 }, { x: 49, y: 41 }, { x: 49, y: 42 }, { x: 49, y: 43 },
        { x: 34, y: 40 }, { x: 34, y: 41 }, { x: 34, y: 42 }, { x: 34, y: 43 }
      ]
    });

    // Path B (east): crumble bridge + rotating bar hazard
    fillTrack(level, 55, 44, 20, 5, 4);
    for (let cx = 60; cx < 68; cx++) {
      for (let cy = 44; cy < 49; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.3, downtime: 2.5 } });
      }
    }
    addActor(level, {
      id: 'bar_cross2', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 63, y: 46, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    wallRing(level, 55, 44, 20, 5, 6, {
      gaps: [
        { x: 55, y: 43 }, { x: 56, y: 43 }, { x: 57, y: 43 }, { x: 58, y: 43 }, { x: 59, y: 43 }, { x: 60, y: 43 },
        { x: 74, y: 44 }, { x: 74, y: 45 }, { x: 74, y: 46 }, { x: 74, y: 47 }, { x: 74, y: 48 }
      ]
    });

    // Second landing platform (z=4), 14×18 — both paths converge
    fillTrack(level, 20, 40, 14, 18, 4);
    wallRing(level, 20, 40, 14, 18, 6, {
      gaps: [
        { x: 33, y: 40 }, { x: 33, y: 41 }, { x: 33, y: 42 }, { x: 33, y: 43 },
        { x: 74, y: 44 }, { x: 74, y: 45 }, { x: 74, y: 46 }, { x: 74, y: 47 }, { x: 74, y: 48 },
        { x: 25, y: 57 }, { x: 26, y: 57 }, { x: 27, y: 57 }, { x: 28, y: 57 }
      ]
    });
    // Connect east path into landing via east wall
    fillTrack(level, 34, 44, 20, 14, 4);
    wallRing(level, 34, 44, 20, 14, 6, {
      gaps: [
        { x: 34, y: 40 }, { x: 34, y: 41 }, { x: 34, y: 42 }, { x: 34, y: 43 },
        { x: 53, y: 44 }, { x: 53, y: 45 }, { x: 53, y: 46 }, { x: 53, y: 47 }, { x: 53, y: 48 },
        { x: 34, y: 57 }, { x: 35, y: 57 }, { x: 36, y: 57 }, { x: 37, y: 57 }
      ]
    });

    // Final ramp south (z=4→0), 6×8
    placeRamp(level, { x: 22, y: 58, dir: 'south', length: 6, width: 8, startZ: 4, endZ: 0 });
    // Goal basin (z=0), 14×10
    fillTrack(level, 18, 64, 14, 10, 0);
    wallRing(level, 18, 64, 14, 10, 2, {
      gaps: [{ x: 22, y: 64 }, { x: 23, y: 64 }, { x: 24, y: 64 }, { x: 25, y: 64 }, { x: 26, y: 64 }, { x: 27, y: 64 }, { x: 28, y: 64 }, { x: 29, y: 64 }]
    });
    setGoal(level, 25, 70, 0.44);

    addGraphNode(level, { id: 'start',    type: 'entry', x: 4.5,  y: 5.5,  z: 14 });
    addGraphNode(level, { id: 'bridge',   type: 'hub',   x: 23.5, y: 8.5,  z: 14 });
    addGraphNode(level, { id: 'landing1', type: 'fork',  x: 34.5, y: 9.5,  z: 14 });
    addGraphNode(level, { id: 'merge1',   type: 'merge', x: 54.5, y: 11.5, z: 10 });
    addGraphNode(level, { id: 'landing2', type: 'fork',  x: 54.5, y: 40.5, z: 4  });
    addGraphNode(level, { id: 'merge2',   type: 'merge', x: 38.5, y: 50.5, z: 4  });
    addGraphNode(level, { id: 'goal',     type: 'goal',  x: 25.5, y: 70.5, z: 0  });
    addGraphEdge(level, { from: 'start',    to: 'bridge',   kind: 'roll'                     });
    addGraphEdge(level, { from: 'bridge',   to: 'landing1', kind: 'platform_transfer'        });
    addGraphEdge(level, { from: 'landing1', to: 'merge1',   kind: 'roll', tag: 'risky'       });
    addGraphEdge(level, { from: 'landing1', to: 'merge1',   kind: 'roll', tag: 'safe'        });
    addGraphEdge(level, { from: 'merge1',   to: 'landing2', kind: 'descent'                  });
    addGraphEdge(level, { from: 'landing2', to: 'merge2',   kind: 'platform_transfer', tag: 'west' });
    addGraphEdge(level, { from: 'landing2', to: 'merge2',   kind: 'crumble',           tag: 'east' });
    addGraphEdge(level, { from: 'merge2',   to: 'goal',     kind: 'descent'                  });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 6 — Stairway Heights
  // Multi-tier staircase, timed gate, optional drop shortcut.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildStairwayHeights() {
    const level = createLevelShell({
      id: 'stairway_heights',
      name: 'Stairway Heights',
      width: 54,
      height: 110,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 4.5 },
      reward: { presses: 26000, claimKey: 'stairway_heights' },
      templates: ['staircase', 'timed_gate', 'drop_shortcut']
    });

    // Start plateau (z=18), 10×10
    fillTrack(level, 2, 2, 10, 10, 18);
    wallRing(level, 2, 2, 10, 10, 20, {
      gaps: [{ x: 11, y: 5 }, { x: 11, y: 6 }, { x: 11, y: 7 }, { x: 11, y: 8 }]
    });

    // Tier 1: ramp east (z=18→14), 6×5
    placeRamp(level, { x: 12, y: 5, dir: 'east', length: 6, width: 5, startZ: 18, endZ: 14 });

    // Tier 1 landing (z=14), 14×10
    fillTrack(level, 18, 4, 14, 10, 14);
    wallRing(level, 18, 4, 14, 10, 16, {
      gaps: [
        { x: 18, y: 5 }, { x: 18, y: 6 }, { x: 18, y: 7 }, { x: 18, y: 8 },
        { x: 25, y: 13 }, { x: 26, y: 13 }, { x: 27, y: 13 }, { x: 28, y: 13 }
      ]
    });

    // Tier 2: ramp south (z=14→10), 6×5
    placeRamp(level, { x: 25, y: 14, dir: 'south', length: 6, width: 5, startZ: 14, endZ: 10 });

    // Tier 2 landing (z=10), 14×10 — timed gate
    fillTrack(level, 18, 20, 14, 10, 10);
    addTimedGate(level, 'gate_tier2', 22, 22, 12, 3, 2, 1.6, 1.4);
    wallRing(level, 18, 20, 14, 10, 12, {
      gaps: [
        { x: 18, y: 22 }, { x: 18, y: 23 }, { x: 18, y: 24 }, { x: 18, y: 25 },
        { x: 25, y: 29 }, { x: 26, y: 29 }, { x: 27, y: 29 }, { x: 28, y: 29 }
      ]
    });

    // Tier 3: ramp south (z=10→6), 6×5
    placeRamp(level, { x: 25, y: 30, dir: 'south', length: 6, width: 5, startZ: 10, endZ: 6 });

    // Tier 3 landing (z=6), 14×10 — hazard strips
    fillTrack(level, 18, 36, 14, 10, 6);
    addHazardRect(level, 22, 38, 4, 2, 'tier3_spikes');
    wallRing(level, 18, 36, 14, 10, 8, {
      gaps: [
        { x: 18, y: 38 }, { x: 18, y: 39 }, { x: 18, y: 40 }, { x: 18, y: 41 },
        { x: 25, y: 45 }, { x: 26, y: 45 }, { x: 27, y: 45 }, { x: 28, y: 45 }
      ]
    });

    // Tier 4: final ramp south (z=6→2), 6×5
    placeRamp(level, { x: 25, y: 46, dir: 'south', length: 6, width: 5, startZ: 6, endZ: 2 });

       // Shortcut: drop shaft from Tier 1 landing to Tier 3 landing
    clearSurfaceRect(level, 32, 7, 3, 28);

    // === EXTENSION: Tiers 5 and 6 with fork ===
    // Tier 4 landing (z=2), 14×10 — fork junction
    fillTrack(level, 18, 52, 14, 10, 2);
    wallRing(level, 18, 52, 14, 10, 4, {
      gaps: [
        { x: 25, y: 52 }, { x: 26, y: 52 }, { x: 27, y: 52 }, { x: 28, y: 52 },
        // Path A exit (west): narrow stair run
        { x: 18, y: 55 }, { x: 18, y: 56 }, { x: 18, y: 57 }, { x: 18, y: 58 },
        // Path B exit (east): conveyor-assisted wide path
        { x: 31, y: 55 }, { x: 31, y: 56 }, { x: 31, y: 57 }, { x: 31, y: 58 }, { x: 31, y: 59 }, { x: 31, y: 60 }, { x: 31, y: 61 }
      ]
    });

    // Path A (west): narrow stair run with crumble tiles, z=2→-2
    fillTrack(level, 8, 55, 10, 14, 2);
    for (let cx = 9; cx < 17; cx++) {
      for (let cy = 56; cy < 68; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.0 } });
      }
    }
    wallRing(level, 8, 55, 10, 14, 4, {
      gaps: [
        { x: 17, y: 55 }, { x: 17, y: 56 }, { x: 17, y: 57 }, { x: 17, y: 58 },
        { x: 8, y: 62 }, { x: 9, y: 62 }, { x: 10, y: 62 }, { x: 11, y: 62 }, { x: 12, y: 62 }, { x: 13, y: 62 }, { x: 14, y: 62 }, { x: 15, y: 62 }, { x: 16, y: 62 }, { x: 17, y: 62 }
      ]
    });
    placeRamp(level, { x: 8, y: 63, dir: 'south', length: 5, width: 5, startZ: 2, endZ: -2 });

    // Path B (east): wide conveyor-assisted descent, z=2→-2
    fillTrack(level, 32, 55, 14, 18, 2);
    for (let cx = 33; cx < 44; cx++) {
      for (let cy = 56; cy < 72; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 0, y: 0.7, strength: 1.2 } });
      }
    }
    addActor(level, {
      id: 'sweeper_tier5', kind: ACTOR_KINDS.SWEEPER,
      x: 39, y: 64, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.8, armWidth: 0.22, angularSpeed: 0.8, fatal: true
    });
    wallRing(level, 32, 55, 14, 18, 4, {
      gaps: [
        { x: 32, y: 55 }, { x: 32, y: 56 }, { x: 32, y: 57 }, { x: 32, y: 58 }, { x: 32, y: 59 }, { x: 32, y: 60 }, { x: 32, y: 61 },
        { x: 38, y: 72 }, { x: 39, y: 72 }, { x: 40, y: 72 }, { x: 41, y: 72 }, { x: 42, y: 42 }, { x: 43, y: 72 }, { x: 44, y: 72 }, { x: 45, y: 72 }
      ]
    });
    placeRamp(level, { x: 38, y: 73, dir: 'south', length: 5, width: 8, startZ: 2, endZ: -2 });

    // Final goal basin (z=-2), 30×10 — both paths converge
    fillTrack(level, 6, 78, 30, 10, -2);
    wallRing(level, 6, 78, 30, 10, 0, {
      gaps: [
        { x: 8, y: 78 }, { x: 9, y: 78 }, { x: 10, y: 78 }, { x: 11, y: 78 }, { x: 12, y: 78 },
        { x: 38, y: 78 }, { x: 39, y: 78 }, { x: 40, y: 78 }, { x: 41, y: 78 }, { x: 42, y: 78 }, { x: 43, y: 78 }, { x: 44, y: 78 }, { x: 45, y: 78 }
      ]
    });
    setGoal(level, 22, 84, 0.44);

    addGraphNode(level, { id: 'start', type: 'entry', x: 4.5,  y: 4.5,  z: 18 });
    addGraphNode(level, { id: 'tier1', type: 'hub',   x: 25.5, y: 9.5,  z: 14 });
    addGraphNode(level, { id: 'tier2', type: 'hub',   x: 25.5, y: 25.5, z: 10 });
    addGraphNode(level, { id: 'tier3', type: 'hub',   x: 25.5, y: 41.5, z: 6  });
    addGraphNode(level, { id: 'tier4', type: 'fork',  x: 25.5, y: 57.5, z: 2  });
    addGraphNode(level, { id: 'path_a',type: 'route', x: 13.5, y: 62.5, z: 2  });
    addGraphNode(level, { id: 'path_b',type: 'route', x: 39.5, y: 64.5, z: 2  });
    addGraphNode(level, { id: 'goal',  type: 'goal',  x: 22.5, y: 84.5, z: -2 });
    addGraphEdge(level, { from: 'start',  to: 'tier1',  kind: 'descent'    });
    addGraphEdge(level, { from: 'tier1',  to: 'tier2',  kind: 'descent'    });
    addGraphEdge(level, { from: 'tier1',  to: 'tier3',  kind: 'jump_drop', tag: 'shortcut' });
    addGraphEdge(level, { from: 'tier2',  to: 'tier3',  kind: 'timed_cross' });
    addGraphEdge(level, { from: 'tier3',  to: 'tier4',  kind: 'descent'    });
    addGraphEdge(level, { from: 'tier4',  to: 'path_a', kind: 'crumble'    });
    addGraphEdge(level, { from: 'tier4',  to: 'path_b', kind: 'roll'       });
    addGraphEdge(level, { from: 'path_a', to: 'goal',   kind: 'descent'    });
    addGraphEdge(level, { from: 'path_b', to: 'goal',   kind: 'descent'    });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 7 — The Labyrinth
  // Three-wing maze, sweeper, crumble bridge, timed gate.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTheLabyrinth() {
    const level = createLevelShell({
      id: 'the_labyrinth',
      name: 'The Labyrinth',
      width: 110,
      height: 80,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 28.5 },
      reward: { presses: 36000, claimKey: 'the_labyrinth' },
      templates: ['labyrinth', 'sweeper', 'crumble_bridge', 'timed_gate']
    });

    // Start plateau (z=16), 10×10
    fillTrack(level, 2, 24, 10, 10, 16);
    wallRing(level, 2, 24, 10, 10, 18, {
      gaps: [{ x: 11, y: 27 }, { x: 11, y: 28 }, { x: 11, y: 29 }, { x: 11, y: 30 }]
    });

    // Entry corridor east (z=16), 6×5
    fillTrack(level, 12, 27, 6, 5, 16);
    wallRing(level, 12, 27, 6, 5, 18, {
      gaps: [
        { x: 12, y: 27 }, { x: 12, y: 28 }, { x: 12, y: 29 }, { x: 12, y: 30 }, { x: 12, y: 31 },
        { x: 17, y: 27 }, { x: 17, y: 28 }, { x: 17, y: 29 }, { x: 17, y: 30 }, { x: 17, y: 31 }
      ]
    });

    // Central hub (z=16), 18×18
    fillTrack(level, 18, 20, 18, 18, 16);
    wallRing(level, 18, 20, 18, 18, 18, {
      gaps: [
        { x: 18, y: 27 }, { x: 18, y: 28 }, { x: 18, y: 29 }, { x: 18, y: 30 },
        { x: 22, y: 20 }, { x: 23, y: 20 }, { x: 24, y: 20 }, { x: 25, y: 20 },
        { x: 35, y: 27 }, { x: 35, y: 28 }, { x: 35, y: 29 }, { x: 35, y: 30 },
        { x: 22, y: 37 }, { x: 23, y: 37 }, { x: 24, y: 37 }, { x: 25, y: 37 }
      ]
    });

    // North wing (z=12), 20×9 — sweeper
    fillTrack(level, 18, 12, 20, 9, 12);
    placeRamp(level, { x: 22, y: 20, dir: 'north', length: 4, width: 4, startZ: 16, endZ: 12 });
    addActor(level, {
      id: 'sweeper_north', kind: ACTOR_KINDS.SWEEPER,
      x: 28, y: 14, z: 12, topHeight: 12,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22,
      angularSpeed: 0.9, fatal: true
    });
    wallRing(level, 18, 12, 20, 9, 14, {
      gaps: [
        { x: 22, y: 20 }, { x: 23, y: 20 }, { x: 24, y: 20 }, { x: 25, y: 20 },
        { x: 37, y: 14 }, { x: 37, y: 15 }, { x: 37, y: 16 }, { x: 37, y: 17 }
      ]
    });

    // East wing (z=12), 20×8 — crumble bridge
    fillTrack(level, 36, 25, 20, 8, 12);
    placeRamp(level, { x: 35, y: 27, dir: 'east', length: 4, width: 4, startZ: 16, endZ: 12 });
    for (let cx = 42; cx < 46; cx++) {
      for (let cy = 26; cy < 30; cy++) {
        setSurface(level, cx, cy, { baseHeight: 12, shape: SHAPES.FLAT, crumble: { delay: 0.35, downtime: 2.2 } });
      }
    }
    wallRing(level, 36, 25, 20, 8, 14, {
      gaps: [
        { x: 36, y: 27 }, { x: 36, y: 28 }, { x: 36, y: 29 }, { x: 36, y: 30 },
        { x: 55, y: 27 }, { x: 55, y: 28 }, { x: 55, y: 29 }, { x: 55, y: 30 }
      ]
    });

    // South wing (z=12), 20×8 — timed gate
    fillTrack(level, 18, 38, 20, 8, 12);
    placeRamp(level, { x: 22, y: 37, dir: 'south', length: 4, width: 4, startZ: 16, endZ: 12 });
    addTimedGate(level, 'gate_south', 26, 42, 14, 3, 2, 1.8, 1.2);
    wallRing(level, 18, 38, 20, 8, 14, {
      gaps: [
        { x: 22, y: 38 }, { x: 23, y: 38 }, { x: 24, y: 38 }, { x: 25, y: 38 },
        { x: 37, y: 40 }, { x: 37, y: 41 }, { x: 37, y: 42 }, { x: 37, y: 43 }
      ]
    });

    // Goal approach (z=8), 16×36 — all three wings converge
    fillTrack(level, 38, 12, 16, 36, 8);
    placeRamp(level, { x: 38, y: 14, dir: 'east', length: 4, width: 6, startZ: 12, endZ: 8 });
    placeRamp(level, { x: 56, y: 25, dir: 'east', length: 4, width: 8, startZ: 12, endZ: 8 });
    placeRamp(level, { x: 38, y: 38, dir: 'east', length: 4, width: 6, startZ: 12, endZ: 8 });
    addHazardRect(level, 44, 22, 2, 4, 'approach_spikes');
    wallRing(level, 38, 12, 16, 36, 10, {
      gaps: [
        { x: 38, y: 14 }, { x: 38, y: 15 }, { x: 38, y: 16 }, { x: 38, y: 17 },
        { x: 38, y: 27 }, { x: 38, y: 28 }, { x: 38, y: 29 }, { x: 38, y: 30 },
        { x: 38, y: 40 }, { x: 38, y: 41 }, { x: 38, y: 42 }, { x: 38, y: 43 },
        { x: 53, y: 28 }, { x: 53, y: 29 }, { x: 53, y: 30 }, { x: 53, y: 31 }
      ]
    });

    // Final ramp east (z=8→4), 5×5
    placeRamp(level, { x: 54, y: 28, dir: 'east', length: 5, width: 5, startZ: 8, endZ: 4 });

    // Goal basin (z=4), 10×10
    fillTrack(level, 59, 26, 10, 10, 4);
    wallRing(level, 59, 26, 10, 10, 6, {
      gaps: [{ x: 59, y: 28 }, { x: 59, y: 29 }, { x: 59, y: 30 }, { x: 59, y: 31 }]
    });

      // === EXTENSION: second hub east of goal basin ===
    // Open east wall of goal basin to continue
    setSurface(level, 68, 28, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 68, 29, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 68, 30, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 68, 31, { baseHeight: 4, shape: SHAPES.FLAT });

    // Second hub (z=4), 12×12
    fillTrack(level, 69, 24, 12, 12, 4);
    wallRing(level, 69, 24, 12, 12, 6, {
      gaps: [
        { x: 69, y: 28 }, { x: 69, y: 29 }, { x: 69, y: 30 }, { x: 69, y: 31 },
        // Wing A (north)
        { x: 73, y: 24 }, { x: 74, y: 24 }, { x: 75, y: 24 }, { x: 76, y: 24 },
        // Wing B (east)
        { x: 80, y: 28 }, { x: 80, y: 29 }, { x: 80, y: 30 }, { x: 80, y: 31 }, { x: 80, y: 32 }, { x: 80, y: 33 }, { x: 80, y: 34 }, { x: 80, y: 35 },
        // Wing C (south)
        { x: 73, y: 35 }, { x: 74, y: 35 }, { x: 75, y: 35 }, { x: 76, y: 35 }
      ]
    });

    // Wing A (north): crumble bridge + sweeper
    fillTrack(level, 72, 12, 6, 12, 4);
    for (let cx = 73; cx < 77; cx++) {
      for (let cy = 14; cy < 22; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.35, downtime: 2.2 } });
      }
    }
    addActor(level, {
      id: 'sweeper_lab2', kind: ACTOR_KINDS.SWEEPER,
      x: 75, y: 18, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.0, fatal: true
    });
    wallRing(level, 72, 12, 6, 12, 6, {
      gaps: [
        { x: 73, y: 23 }, { x: 74, y: 23 }, { x: 75, y: 23 }, { x: 76, y: 23 }, { x: 77, y: 23 },
        { x: 77, y: 12 }, { x: 77, y: 13 }, { x: 77, y: 14 }, { x: 77, y: 15 }, { x: 77, y: 16 }, { x: 77, y: 17 }, { x: 77, y: 18 }, { x: 77, y: 19 }, { x: 77, y: 20 }, { x: 77, y: 21 }, { x: 77, y: 22 }, { x: 77, y: 23 }
      ]
    });
    placeRamp(level, { x: 78, y: 12, dir: 'east', length: 5, width: 12, startZ: 4, endZ: 0 });

    // Wing B (east): timed gate corridor
    fillTrack(level, 81, 26, 18, 12, 4);
    addTimedGate(level, 'gate_lab2_east', 88, 28, 8, 3, 2, 1.8, 1.2);
    wallRing(level, 81, 26, 18, 12, 6, {
      gaps: [
        { x: 81, y: 28 }, { x: 81, y: 29 }, { x: 81, y: 30 }, { x: 81, y: 31 }, { x: 81, y: 32 }, { x: 81, y: 33 }, { x: 81, y: 34 }, { x: 81, y: 35 },
        { x: 98, y: 28 }, { x: 98, y: 29 }, { x: 98, y: 30 }, { x: 98, y: 31 }, { x: 98, y: 32 }, { x: 98, y: 33 }, { x: 98, y: 34 }, { x: 98, y: 35 }
      ]
    });
    placeRamp(level, { x: 99, y: 26, dir: 'east', length: 5, width: 12, startZ: 4, endZ: 0 });

    // Wing C (south): conveyor-assisted wide path
    fillTrack(level, 72, 36, 6, 18, 4);
    for (let cx = 73; cx < 77; cx++) {
      for (let cy = 37; cy < 53; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 0, y: 0.7, strength: 1.2 } });
      }
    }
    wallRing(level, 72, 36, 6, 18, 6, {
      gaps: [
        { x: 72, y: 35 }, { x: 73, y: 35 }, { x: 74, y: 35 }, { x: 75, y: 35 }, { x: 76, y: 35 }, { x: 77, y: 35 },
        { x: 77, y: 36 }, { x: 77, y: 37 }, { x: 77, y: 38 }, { x: 77, y: 39 }, { x: 77, y: 40 }, { x: 77, y: 41 }, { x: 77, y: 42 }, { x: 77, y: 43 }, { x: 77, y: 44 }, { x: 77, y: 45 }, { x: 77, y: 46 }, { x: 77, y: 47 }, { x: 77, y: 48 }, { x: 77, y: 49 }, { x: 77, y: 50 }, { x: 77, y: 51 }, { x: 77, y: 52 }, { x: 77, y: 53 }
      ]
    });
    placeRamp(level, { x: 78, y: 48, dir: 'east', length: 5, width: 12, startZ: 4, endZ: 0 });

    // Final goal basin (z=0), 20×16 — all three wings converge
    fillTrack(level, 83, 10, 20, 46, 0);
    wallRing(level, 83, 10, 20, 46, 2, {
      gaps: [
        { x: 83, y: 12 }, { x: 83, y: 13 }, { x: 83, y: 14 }, { x: 83, y: 15 }, { x: 83, y: 16 }, { x: 83, y: 17 }, { x: 83, y: 18 }, { x: 83, y: 19 }, { x: 83, y: 20 }, { x: 83, y: 21 }, { x: 83, y: 22 }, { x: 83, y: 23 },
        { x: 83, y: 26 }, { x: 83, y: 27 }, { x: 83, y: 28 }, { x: 83, y: 29 }, { x: 83, y: 30 }, { x: 83, y: 31 }, { x: 83, y: 32 }, { x: 83, y: 33 }, { x: 83, y: 34 }, { x: 83, y: 35 },
        { x: 83, y: 48 }, { x: 83, y: 49 }, { x: 83, y: 50 }, { x: 83, y: 51 }, { x: 83, y: 52 }, { x: 83, y: 53 }, { x: 83, y: 54 }, { x: 83, y: 55 }
      ]
    });
    setGoal(level, 93, 33, 0.44);

    addGraphNode(level, { id: 'start',  type: 'entry', x: 4.5,  y: 28.5, z: 16 });
    addGraphNode(level, { id: 'hub1',   type: 'fork',  x: 27.5, y: 29.5, z: 16 });
    addGraphNode(level, { id: 'north1', type: 'route', x: 28.5, y: 16.5, z: 12 });
    addGraphNode(level, { id: 'east1',  type: 'route', x: 46.5, y: 28.5, z: 12 });
    addGraphNode(level, { id: 'south1', type: 'route', x: 28.5, y: 42.5, z: 12 });
    addGraphNode(level, { id: 'merge1', type: 'merge', x: 44.5, y: 29.5, z: 8  });
    addGraphNode(level, { id: 'hub2',   type: 'fork',  x: 75.5, y: 29.5, z: 4  });
    addGraphNode(level, { id: 'wing_a', type: 'route', x: 75.5, y: 17.5, z: 4  });
    addGraphNode(level, { id: 'wing_b', type: 'route', x: 89.5, y: 31.5, z: 4  });
    addGraphNode(level, { id: 'wing_c', type: 'route', x: 75.5, y: 45.5, z: 4  });
    addGraphNode(level, { id: 'goal',   type: 'goal',  x: 93.5, y: 33.5, z: 0  });
    addGraphEdge(level, { from: 'start',  to: 'hub1',   kind: 'roll'        });
    addGraphEdge(level, { from: 'hub1',   to: 'north1', kind: 'descent'     });
    addGraphEdge(level, { from: 'hub1',   to: 'east1',  kind: 'roll'        });
    addGraphEdge(level, { from: 'hub1',   to: 'south1', kind: 'descent'     });
    addGraphEdge(level, { from: 'north1', to: 'merge1', kind: 'roll'        });
    addGraphEdge(level, { from: 'east1',  to: 'merge1', kind: 'roll'        });
    addGraphEdge(level, { from: 'south1', to: 'merge1', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'merge1', to: 'hub2',   kind: 'descent'     });
    addGraphEdge(level, { from: 'hub2',   to: 'wing_a', kind: 'crumble'     });
    addGraphEdge(level, { from: 'hub2',   to: 'wing_b', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'hub2',   to: 'wing_c', kind: 'roll'        });
    addGraphEdge(level, { from: 'wing_a', to: 'goal',   kind: 'descent'     });
    addGraphEdge(level, { from: 'wing_b', to: 'goal',   kind: 'descent'     });
    addGraphEdge(level, { from: 'wing_c', to: 'goal',   kind: 'descent'     });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 8 — The Gauntlet
  // Long dual-lane gauntlet, safe vs risky paths throughout.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTheGauntlet() {
    const level = createLevelShell({
      id: 'the_gauntlet',
      name: 'The Gauntlet',
      width: 74,
      height: 64,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 8.5 },
      reward: { presses: 50000, claimKey: 'the_gauntlet' },
      templates: ['gauntlet', 'dual_lane', 'all_hazards']
    });

    // Start plateau (z=18), 10×14
    fillTrack(level, 2, 4, 10, 14, 18);
    wallRing(level, 2, 4, 10, 14, 20, {
      gaps: [
        { x: 11, y: 5 }, { x: 11, y: 6 }, { x: 11, y: 7 }, { x: 11, y: 8 },
        { x: 11, y: 12 }, { x: 11, y: 13 }, { x: 11, y: 14 }, { x: 11, y: 15 }, { x: 11, y: 16 }, { x: 11, y: 17 }
      ]
    });

    // Risky lane (north, y=4..8, 5 wide): rotating bars, sweeper, hazard strips
    fillTrack(level, 12, 4, 52, 5, 18);
    addActor(level, {
      id: 'bar_g1', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 22, y: 5, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweeper_g1', kind: ACTOR_KINDS.SWEEPER,
      x: 38, y: 5, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 0.8, fatal: true
    });
    addActor(level, {
      id: 'bar_g2', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 54, y: 5, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 2.0, fatal: true
    });
    addHazardRect(level, 58, 4, 3, 4, 'gauntlet_spikes_risky');
    wallRing(level, 12, 4, 52, 5, 20, {
      gaps: [
        { x: 12, y: 4 }, { x: 12, y: 5 }, { x: 12, y: 6 }, { x: 12, y: 7 }, { x: 12, y: 8 },
        { x: 63, y: 4 }, { x: 63, y: 5 }, { x: 63, y: 6 }, { x: 63, y: 7 }, { x: 63, y: 8 }
      ]
    });

    // Safe lane (south, y=12..17, 6 wide): crumble tiles, timed gates
    fillTrack(level, 12, 12, 52, 6, 18);
    for (let cx = 22; cx < 28; cx++) {
      for (let cy = 12; cy < 18; cy++) {
        setSurface(level, cx, cy, { baseHeight: 18, shape: SHAPES.FLAT, crumble: { delay: 0.6, downtime: 2.5 } });
      }
    }
    addTimedGate(level, 'gate_g1', 36, 13, 20, 4, 2, 1.8, 1.4);
    addTimedGate(level, 'gate_g2', 52, 13, 20, 4, 2, 1.6, 1.2);
    wallRing(level, 12, 12, 52, 6, 20, {
      gaps: [
        { x: 12, y: 12 }, { x: 12, y: 13 }, { x: 12, y: 14 }, { x: 12, y: 15 }, { x: 12, y: 16 }, { x: 12, y: 17 },
        { x: 63, y: 12 }, { x: 63, y: 13 }, { x: 63, y: 14 }, { x: 63, y: 15 }, { x: 63, y: 16 }, { x: 63, y: 17 }
      ]
    });

    // Descent ramp (z=18→4), both lanes together
    placeRamp(level, { x: 64, y: 4, dir: 'east', length: 6, width: 14, startZ: 18, endZ: 4 });

    // Goal basin (z=4), 6×14
    fillTrack(level, 70, 4, 6, 14, 4);
    wallRing(level, 70, 4, 6, 14, 6, {
      gaps: [
        { x: 70, y: 4 }, { x: 70, y: 5 }, { x: 70, y: 6 }, { x: 70, y: 7 },
        { x: 70, y: 8 }, { x: 70, y: 9 }, { x: 70, y: 10 }, { x: 70, y: 11 },
        { x: 70, y: 12 }, { x: 70, y: 13 }, { x: 70, y: 14 }, { x: 70, y: 15 },
        { x: 70, y: 16 }, { x: 70, y: 17 }
      ]
    });

     // === EXTENSION: second gauntlet section ===
    // Open south wall of goal basin to continue
    setSurface(level, 70, 17, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 71, 17, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 72, 17, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 73, 17, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 74, 17, { baseHeight: 4, shape: SHAPES.FLAT });

    // Second start platform (z=4), 10×14
    fillTrack(level, 64, 18, 10, 14, 4);
    wallRing(level, 64, 18, 10, 14, 6, {
      gaps: [
        { x: 70, y: 18 }, { x: 71, y: 18 }, { x: 72, y: 18 }, { x: 73, y: 18 },
        // Risky lane (north)
        { x: 64, y: 18 }, { x: 64, y: 19 }, { x: 64, y: 20 }, { x: 64, y: 21 }, { x: 64, y: 22 },
        // Safe lane (south)
        { x: 64, y: 26 }, { x: 64, y: 27 }, { x: 64, y: 28 }, { x: 64, y: 29 }, { x: 64, y: 30 }, { x: 64, y: 31 }
      ]
    });

    // Risky lane 2 (north, y=18..22, 5 wide): rotating bars + spikes
    fillTrack(level, 12, 18, 52, 5, 4);
    addActor(level, {
      id: 'bar_g3', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 22, y: 19, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 2.2, fatal: true
    });
    addActor(level, {
      id: 'bar_g4', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 38, y: 19, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 2.5, fatal: true
    });
    addActor(level, {
      id: 'sweeper_g2', kind: ACTOR_KINDS.SWEEPER,
      x: 54, y: 19, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 1.0, fatal: true
    });
    addHazardRect(level, 58, 18, 3, 4, 'gauntlet2_spikes_risky');
    wallRing(level, 12, 18, 52, 5, 6, {
      gaps: [
        { x: 63, y: 18 }, { x: 63, y: 19 }, { x: 63, y: 20 }, { x: 63, y: 21 }, { x: 63, y: 22 },
        { x: 12, y: 18 }, { x: 12, y: 19 }, { x: 12, y: 20 }, { x: 12, y: 21 }, { x: 12, y: 22 }
      ]
    });

    // Safe lane 2 (south, y=26..31, 6 wide): crumble + timed gates
    fillTrack(level, 12, 26, 52, 6, 4);
    for (let cx = 22; cx < 28; cx++) {
      for (let cy = 26; cy < 32; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.5, downtime: 2.5 } });
      }
    }
    addTimedGate(level, 'gate_g3', 36, 27, 20, 4, 2, 1.6, 1.2);
    addTimedGate(level, 'gate_g4', 52, 27, 20, 4, 2, 1.4, 1.0);
    wallRing(level, 12, 26, 52, 6, 6, {
      gaps: [
        { x: 63, y: 26 }, { x: 63, y: 27 }, { x: 63, y: 28 }, { x: 63, y: 29 }, { x: 63, y: 30 }, { x: 63, y: 31 },
        { x: 12, y: 26 }, { x: 12, y: 27 }, { x: 12, y: 28 }, { x: 12, y: 29 }, { x: 12, y: 30 }, { x: 12, y: 31 }
      ]
    });

    // Second merge platform (z=4), 10×14
    fillTrack(level, 2, 18, 10, 14, 4);
    wallRing(level, 2, 18, 10, 14, 6, {
      gaps: [
        { x: 11, y: 18 }, { x: 11, y: 19 }, { x: 11, y: 20 }, { x: 11, y: 21 }, { x: 11, y: 22 },
        { x: 11, y: 26 }, { x: 11, y: 27 }, { x: 11, y: 28 }, { x: 11, y: 29 }, { x: 11, y: 30 }, { x: 11, y: 31 },
        { x: 5, y: 31 }, { x: 6, y: 31 }, { x: 7, y: 31 }, { x: 8, y: 31 }
      ]
    });

    // Final ramp south (z=4→0), 5×6
    placeRamp(level, { x: 4, y: 32, dir: 'south', length: 5, width: 6, startZ: 4, endZ: 0 });
    // Goal basin (z=0), 14×10
    fillTrack(level, 2, 37, 14, 10, 0);
    wallRing(level, 2, 37, 14, 10, 2, {
      gaps: [{ x: 4, y: 37 }, { x: 5, y: 37 }, { x: 6, y: 37 }, { x: 7, y: 37 }, { x: 8, y: 37 }, { x: 9, y: 37 }]
    });
    setGoal(level, 9, 43, 0.44);

    addGraphNode(level, { id: 'start',  type: 'entry', x: 4.5,  y: 8.5,  z: 18 });
    addGraphNode(level, { id: 'risky1', type: 'route', x: 38.5, y: 6.5,  z: 18 });
    addGraphNode(level, { id: 'safe1',  type: 'route', x: 38.5, y: 15.5, z: 18 });
    addGraphNode(level, { id: 'merge1', type: 'merge', x: 67.5, y: 11.5, z: 4  });
    addGraphNode(level, { id: 'risky2', type: 'route', x: 38.5, y: 20.5, z: 4  });
    addGraphNode(level, { id: 'safe2',  type: 'route', x: 38.5, y: 28.5, z: 4  });
    addGraphNode(level, { id: 'goal',   type: 'goal',  x: 9.5,  y: 43.5, z: 0  });
    addGraphEdge(level, { from: 'start',  to: 'risky1', kind: 'hazard_lane' });
    addGraphEdge(level, { from: 'start',  to: 'safe1',  kind: 'roll'        });
    addGraphEdge(level, { from: 'risky1', to: 'merge1', kind: 'descent'     });
    addGraphEdge(level, { from: 'safe1',  to: 'merge1', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'merge1', to: 'risky2', kind: 'hazard_lane' });
    addGraphEdge(level, { from: 'merge1', to: 'safe2',  kind: 'roll'        });
    addGraphEdge(level, { from: 'risky2', to: 'goal',   kind: 'descent'     });
    addGraphEdge(level, { from: 'safe2',  to: 'goal',   kind: 'timed_cross' });
    return registerLevel(level);;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 9 — Tower Descent
  // Spiral tower, elevator shortcuts, all hazard types.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTowerDescent() {
    const level = createLevelShell({
      id: 'tower_descent',
      name: 'Tower Descent',
      width: 80,
      height: 80,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 4.5 },
      reward: { presses: 70000, claimKey: 'tower_descent' },
      templates: ['spiral', 'elevator', 'all_hazards']
    });

    // Start plateau (z=22), 10×8
    fillTrack(level, 2, 2, 10, 8, 22);
    wallRing(level, 2, 2, 10, 8, 24, {
      gaps: [{ x: 11, y: 4 }, { x: 11, y: 5 }, { x: 11, y: 6 }, { x: 11, y: 7 }]
    });

    // Floor 1: east corridor (z=22), 28×5
    fillTrack(level, 12, 4, 28, 5, 22);
    wallRing(level, 12, 4, 28, 5, 24, {
      gaps: [
        { x: 12, y: 4 }, { x: 12, y: 5 }, { x: 12, y: 6 }, { x: 12, y: 7 }, { x: 12, y: 8 },
        { x: 39, y: 4 }, { x: 39, y: 5 }, { x: 39, y: 6 }, { x: 39, y: 7 }, { x: 39, y: 8 }
      ]
    });
    // Ramp south (z=22→18), 5×5
    placeRamp(level, { x: 36, y: 4, dir: 'south', length: 5, width: 5, startZ: 22, endZ: 18 });

    // Floor 1 south corridor (z=18), 28×5
    fillTrack(level, 12, 9, 28, 5, 18);
    wallRing(level, 12, 9, 28, 5, 20, {
      gaps: [
        { x: 12, y: 9 }, { x: 12, y: 10 }, { x: 12, y: 11 }, { x: 12, y: 12 }, { x: 12, y: 13 },
        { x: 39, y: 9 }, { x: 39, y: 10 }, { x: 39, y: 11 }, { x: 39, y: 12 }, { x: 39, y: 13 }
      ]
    });
    // Ramp west (z=18→14), 5×5
    placeRamp(level, { x: 12, y: 9, dir: 'west', length: 5, width: 5, startZ: 18, endZ: 14 });

    // Floor 2: west corridor (z=14), 28×5
    fillTrack(level, 2, 14, 28, 5, 14);
    setSurface(level, 4, 15, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.0 } });
    setSurface(level, 5, 15, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.0 } });
    wallRing(level, 2, 14, 28, 5, 16, {
      gaps: [
        { x: 2, y: 14 }, { x: 2, y: 15 }, { x: 2, y: 16 }, { x: 2, y: 17 }, { x: 2, y: 18 },
        { x: 29, y: 14 }, { x: 29, y: 15 }, { x: 29, y: 16 }, { x: 29, y: 17 }, { x: 29, y: 18 }
      ]
    });
    // Ramp south (z=14→10), 5×5
    placeRamp(level, { x: 2, y: 19, dir: 'south', length: 5, width: 5, startZ: 14, endZ: 10 });

    // Floor 2 south corridor (z=10), 28×5
    fillTrack(level, 2, 24, 28, 5, 10);
    addTimedGate(level, 'gate_t1', 14, 25, 12, 3, 2, 1.8, 1.2);
    addTimedGate(level, 'gate_t2', 22, 25, 12, 3, 2, 1.6, 1.4);
    wallRing(level, 2, 24, 28, 5, 12, {
      gaps: [
        { x: 2, y: 24 }, { x: 2, y: 25 }, { x: 2, y: 26 }, { x: 2, y: 27 }, { x: 2, y: 28 },
        { x: 29, y: 24 }, { x: 29, y: 25 }, { x: 29, y: 26 }, { x: 29, y: 27 }, { x: 29, y: 28 }
      ]
    });
    // Ramp east (z=10→6), 5×5
    placeRamp(level, { x: 30, y: 24, dir: 'east', length: 5, width: 5, startZ: 10, endZ: 6 });

    // Floor 3: east corridor (z=6), 28×5
    fillTrack(level, 12, 29, 28, 5, 6);
    addActor(level, {
      id: 'sweeper_t1', kind: ACTOR_KINDS.SWEEPER,
      x: 28, y: 30, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.0, fatal: true
    });
    wallRing(level, 12, 29, 28, 5, 8, {
      gaps: [
        { x: 12, y: 29 }, { x: 12, y: 30 }, { x: 12, y: 31 }, { x: 12, y: 32 }, { x: 12, y: 33 },
        { x: 39, y: 29 }, { x: 39, y: 30 }, { x: 39, y: 31 }, { x: 39, y: 32 }, { x: 39, y: 33 }
      ]
    });
    // Ramp south (z=6→2), 5×5
    placeRamp(level, { x: 36, y: 29, dir: 'south', length: 5, width: 5, startZ: 6, endZ: 2 });

    // Floor 3 south corridor (z=2), 28×5
    fillTrack(level, 12, 34, 28, 5, 2);
    addActor(level, {
      id: 'bar_t1', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 22, y: 35, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 2.0, fatal: true
    });
    addActor(level, {
      id: 'bar_t2', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 32, y: 35, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: -1.8, fatal: true
    });
    wallRing(level, 12, 34, 28, 5, 4, {
      gaps: [
        { x: 12, y: 34 }, { x: 12, y: 35 }, { x: 12, y: 36 }, { x: 12, y: 37 }, { x: 12, y: 38 },
        { x: 12, y: 39 }, { x: 12, y: 40 }, { x: 12, y: 41 }, { x: 12, y: 42 }, { x: 12, y: 43 }
      ]
    });

    // Elevator shortcuts
    addElevator(level, 'elev_a', 6, 24, 2, 10, 3, 3, 0.9, 5.0);
    addElevator(level, 'elev_b', 6, 34, 2, 10, 3, 3, 0.9, 5.0);

    // Goal basin (z=2), 10×8
    fillTrack(level, 2, 39, 10, 8, 2);
    wallRing(level, 2, 39, 10, 8, 4, {
      gaps: [{ x: 11, y: 41 }, { x: 11, y: 42 }, { x: 11, y: 43 }, { x: 11, y: 44 }]
    });

    // === EXTENSION: Floors 4 and 5 with fork ===
    // Open east wall of goal basin to continue
    setSurface(level, 11, 41, { baseHeight: 2, shape: SHAPES.FLAT });
    setSurface(level, 11, 42, { baseHeight: 2, shape: SHAPES.FLAT });
    setSurface(level, 11, 43, { baseHeight: 2, shape: SHAPES.FLAT });
    setSurface(level, 11, 44, { baseHeight: 2, shape: SHAPES.FLAT });

    // Floor 4 fork junction (z=2), 28×5
    fillTrack(level, 12, 39, 28, 5, 2);
    addActor(level, {
      id: 'bar_floor4', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 26, y: 40, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 2.0, fatal: true
    });
    wallRing(level, 12, 39, 28, 5, 4, {
      gaps: [
        { x: 12, y: 39 }, { x: 12, y: 40 }, { x: 12, y: 41 }, { x: 12, y: 42 }, { x: 12, y: 43 },
        // Path A: spiral continues east
        { x: 39, y: 39 }, { x: 39, y: 40 }, { x: 39, y: 41 }, { x: 39, y: 42 }, { x: 39, y: 43 },
        // Path B: shortcut south drop
        { x: 22, y: 43 }, { x: 23, y: 43 }, { x: 24, y: 43 }, { x: 25, y: 43 }
      ]
    });

    // Path A: Floor 4 east corridor (z=2), 28×5
    fillTrack(level, 40, 39, 28, 5, 2);
    addTimedGate(level, 'gate_floor4', 50, 40, 12, 3, 2, 1.8, 1.2);
    wallRing(level, 40, 39, 28, 5, 4, {
      gaps: [
        { x: 40, y: 39 }, { x: 40, y: 40 }, { x: 40, y: 41 }, { x: 40, y: 42 }, { x: 40, y: 43 },
        { x: 67, y: 39 }, { x: 67, y: 40 }, { x: 67, y: 41 }, { x: 67, y: 42 }, { x: 67, y: 43 }
      ]
    });
    // Ramp south (z=2→-2), 5×5
    placeRamp(level, { x: 64, y: 44, dir: 'south', length: 5, width: 5, startZ: 2, endZ: -2 });
    // Floor 5 east corridor (z=-2), 28×5
    fillTrack(level, 40, 49, 28, 5, -2);
    wallRing(level, 40, 49, 28, 5, 0, {
      gaps: [
        { x: 67, y: 44 }, { x: 67, y: 45 }, { x: 67, y: 46 }, { x: 67, y: 47 }, { x: 67, y: 48 }, { x: 67, y: 49 }, { x: 67, y: 50 }, { x: 67, y: 51 }, { x: 67, y: 52 }, { x: 67, y: 53 },
        { x: 40, y: 49 }, { x: 40, y: 50 }, { x: 40, y: 51 }, { x: 40, y: 52 }, { x: 40, y: 53 }
      ]
    });
    placeRamp(level, { x: 40, y: 54, dir: 'west', length: 5, width: 5, startZ: -2, endZ: -6 });

    // Path B: crumble shortcut south
    fillTrack(level, 20, 44, 6, 14, 2);
    for (let cx = 21; cx < 25; cx++) {
      for (let cy = 45; cy < 57; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.3, downtime: 2.5 } });
      }
    }
    wallRing(level, 20, 44, 6, 14, 4, {
      gaps: [
        { x: 22, y: 43 }, { x: 23, y: 43 }, { x: 24, y: 43 }, { x: 25, y: 43 },
        { x: 20, y: 50 }, { x: 20, y: 51 }, { x: 20, y: 52 }, { x: 20, y: 53 }, { x: 20, y: 54 }, { x: 20, y: 55 }, { x: 20, y: 56 }, { x: 20, y: 57 }
      ]
    });
    placeRamp(level, { x: 20, y: 58, dir: 'west', length: 5, width: 8, startZ: 2, endZ: -6 });

    // Final goal basin (z=-6), 28×10 — both paths converge
    fillTrack(level, 2, 54, 28, 10, -6);
    wallRing(level, 2, 54, 28, 10, -4, {
      gaps: [
        { x: 15, y: 54 }, { x: 16, y: 54 }, { x: 17, y: 54 }, { x: 18, y: 54 }, { x: 19, y: 54 },
        { x: 2, y: 58 }, { x: 3, y: 58 }, { x: 4, y: 58 }, { x: 5, y: 58 }, { x: 6, y: 58 }, { x: 7, y: 58 }, { x: 8, y: 58 }, { x: 9, y: 58 }, { x: 10, y: 58 }, { x: 11, y: 58 }, { x: 12, y: 58 }, { x: 13, y: 58 }, { x: 14, y: 58 }, { x: 15, y: 58 }, { x: 16, y: 58 }, { x: 17, y: 58 }, { x: 18, y: 58 }, { x: 19, y: 58 }, { x: 20, y: 58 }, { x: 21, y: 58 }, { x: 22, y: 58 }, { x: 23, y: 58 }, { x: 24, y: 58 }, { x: 25, y: 58 }, { x: 26, y: 58 }, { x: 27, y: 58 }, { x: 28, y: 58 }, { x: 29, y: 58 }
      ]
    });
    setGoal(level, 15, 60, 0.44);

    addGraphNode(level, { id: 'start',  type: 'entry', x: 4.5,  y: 4.5,  z: 22 });
    addGraphNode(level, { id: 'floor1', type: 'hub',   x: 24.5, y: 6.5,  z: 22 });
    addGraphNode(level, { id: 'floor2', type: 'hub',   x: 14.5, y: 16.5, z: 14 });
    addGraphNode(level, { id: 'floor3', type: 'hub',   x: 24.5, y: 31.5, z: 6  });
    addGraphNode(level, { id: 'floor4', type: 'fork',  x: 24.5, y: 41.5, z: 2  });
    addGraphNode(level, { id: 'path_a', type: 'route', x: 54.5, y: 51.5, z: -2 });
    addGraphNode(level, { id: 'path_b', type: 'route', x: 23.5, y: 51.5, z: 2  });
    addGraphNode(level, { id: 'goal',   type: 'goal',  x: 15.5, y: 60.5, z: -6 });
    addGraphEdge(level, { from: 'start',  to: 'floor1', kind: 'roll'        });
    addGraphEdge(level, { from: 'floor1', to: 'floor2', kind: 'switchback'  });
    addGraphEdge(level, { from: 'floor2', to: 'floor3', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'floor3', to: 'floor4', kind: 'descent'     });
    addGraphEdge(level, { from: 'floor4', to: 'path_a', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'floor4', to: 'path_b', kind: 'crumble'     });
    addGraphEdge(level, { from: 'path_a', to: 'goal',   kind: 'descent'     });
    addGraphEdge(level, { from: 'path_b', to: 'goal',   kind: 'descent'     });
     return registerLevel(level);
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 10 — The Final Approach
  // Grand finale: three acts, all mechanics, multiple paths.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTheFinalApproach() {
    const level = createLevelShell({
      id: 'the_final_approach',
      name: 'The Final Approach',
      width: 120,
      height: 120,
      killZ: -20,
      voidFloor: -10,
      start: { x: 5.5, y: 5.5 },
      reward: { presses: 100000, claimKey: 'the_final_approach' },
      templates: ['finale', 'all_mechanics', 'multi_act']
    });

    // Start plateau (z=24), 12×12
    fillTrack(level, 2, 2, 12, 12, 24);
    wallRing(level, 2, 2, 12, 12, 26, {
      gaps: [
        { x: 13, y: 3 }, { x: 13, y: 4 }, { x: 13, y: 5 },
        { x: 13, y: 7 }, { x: 13, y: 8 }, { x: 13, y: 9 }, { x: 13, y: 10 },
        { x: 13, y: 11 }, { x: 13, y: 12 }, { x: 13, y: 13 }
      ]
    });

    // ACT 1 — Path A (north): moving platform bridge, timed gate
    fillTrack(level, 14, 2, 16, 5, 24);
    clearSurfaceRect(level, 30, 2, 8, 5);
    addMovingBridge(level, 'bridge_fa1', [
      { x: 30, y: 2, z: 24 },
      { x: 33, y: 2, z: 24 }
    ], 4, 4, 0.55);
    fillTrack(level, 38, 2, 14, 5, 24);
    addTimedGate(level, 'gate_fa1', 44, 3, 26, 3, 2, 1.8, 1.4);
    placeRamp(level, { x: 52, y: 2, dir: 'east', length: 6, width: 5, startZ: 24, endZ: 18 });

    // ACT 1 — Path B (center): sweeper + crumble
    fillTrack(level, 14, 7, 36, 5, 24);
    addActor(level, {
      id: 'sweeper_fa1', kind: ACTOR_KINDS.SWEEPER,
      x: 28, y: 8, z: 24, topHeight: 24,
      width: 1, height: 1, armLength: 2.8, armWidth: 0.22, angularSpeed: 1.1, fatal: true
    });
    for (let cx = 36; cx < 42; cx++) {
      setSurface(level, cx, 8,  { baseHeight: 24, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.2 } });
      setSurface(level, cx, 9,  { baseHeight: 24, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.2 } });
      setSurface(level, cx, 10, { baseHeight: 24, shape: SHAPES.FLAT, crumble: { delay: 0.4, downtime: 2.2 } });
    }
    placeRamp(level, { x: 50, y: 7, dir: 'east', length: 6, width: 5, startZ: 24, endZ: 18 });

    // ACT 1 — Path C (south): longest but safest, conveyor assist
    fillTrack(level, 14, 12, 40, 5, 24);
    for (let cx = 20; cx < 50; cx++) {
      for (let cy = 12; cy < 17; cy++) {
        setSurface(level, cx, cy, { baseHeight: 24, shape: SHAPES.FLAT, conveyor: { x: 0.7, y: 0, strength: 1.3 } });
      }
    }
    placeRamp(level, { x: 54, y: 12, dir: 'east', length: 6, width: 5, startZ: 24, endZ: 18 });

    // ACT 2 — Central citadel (z=18), 24×20
    fillTrack(level, 58, 2, 24, 20, 18);
    addActor(level, {
      id: 'bar_fa1', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 66, y: 8, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 1.9, fatal: true
    });
    addActor(level, {
      id: 'bar_fa2', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 74, y: 14, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: -1.7, fatal: true
    });
    addTimedGate(level, 'gate_fa2', 70, 4, 20, 3, 2, 2.0, 1.2);
    addElevator(level, 'elev_fa1', 78, 10, 6, 18, 3, 3, 1.0, 5.0);
    wallRing(level, 58, 2, 24, 20, 20, {
      gaps: [
        { x: 58, y: 3 }, { x: 58, y: 4 }, { x: 58, y: 5 },
        { x: 58, y: 7 }, { x: 58, y: 8 }, { x: 58, y: 9 }, { x: 58, y: 10 },
        { x: 58, y: 12 }, { x: 58, y: 13 }, { x: 58, y: 14 }, { x: 58, y: 15 }, { x: 58, y: 16 },
        { x: 66, y: 21 }, { x: 67, y: 21 }, { x: 68, y: 21 }, { x: 69, y: 21 },
        { x: 70, y: 21 }, { x: 71, y: 21 }, { x: 72, y: 21 }
      ]
    });

    // ACT 3 — Fast path (north, 5 wide): narrow, hazards
    fillTrack(level, 58, 22, 20, 5, 18);
    addHazardRect(level, 64, 23, 4, 3, 'final_spikes_fast');
    placeRamp(level, { x: 58, y: 27, dir: 'south', length: 8, width: 5, startZ: 18, endZ: 6 });

    // ACT 3 — Safe path (south, 6 wide): moving platform bridge
    fillTrack(level, 58, 28, 20, 6, 18);
    clearSurfaceRect(level, 68, 28, 8, 6);
    addMovingBridge(level, 'bridge_fa2', [
      { x: 68, y: 28, z: 18 },
      { x: 72, y: 28, z: 18 }
    ], 4, 5, 0.5);
    fillTrack(level, 76, 28, 6, 6, 18);
    placeRamp(level, { x: 58, y: 34, dir: 'south', length: 8, width: 6, startZ: 18, endZ: 6 });

    // ACT 4 — Final descent and goal
    fillTrack(level, 56, 42, 24, 14, 6);
    placeRamp(level, { x: 56, y: 56, dir: 'south', length: 6, width: 14, startZ: 6, endZ: 2 });

    // Goal basin (z=2), 16×12
    fillTrack(level, 56, 62, 16, 12, 2);
    wallRing(level, 56, 62, 16, 12, 4, {
      gaps: [
        { x: 56, y: 62 }, { x: 57, y: 62 }, { x: 58, y: 62 }, { x: 59, y: 62 },
        { x: 60, y: 62 }, { x: 61, y: 62 }, { x: 62, y: 62 }, { x: 63, y: 62 },
        { x: 64, y: 62 }, { x: 65, y: 62 }, { x: 66, y: 62 }, { x: 67, y: 62 },
        { x: 68, y: 62 }, { x: 69, y: 62 }, { x: 70, y: 62 }, { x: 71, y: 62 }
      ]
    });

      // === ACT 5 EXTENSION: The Grand Finale ===
    // Open south wall of goal basin to continue into ACT 5
    for (let cx = 56; cx < 72; cx++) {
      setSurface(level, cx, 73, { baseHeight: 2, shape: SHAPES.FLAT });
    }

    // ACT 5 — Three-path arena (z=2), 60×20
    fillTrack(level, 30, 74, 60, 20, 2);
    wallRing(level, 30, 74, 60, 20, 4, {
      gaps: [
        // North entry from goal basin
        { x: 56, y: 74 }, { x: 57, y: 74 }, { x: 58, y: 74 }, { x: 59, y: 74 }, { x: 60, y: 74 }, { x: 61, y: 74 }, { x: 62, y: 74 }, { x: 63, y: 74 }, { x: 64, y: 74 }, { x: 65, y: 74 }, { x: 66, y: 74 }, { x: 67, y: 74 }, { x: 68, y: 74 }, { x: 69, y: 74 }, { x: 70, y: 74 }, { x: 71, y: 74 },
        // Path A exit (west)
        { x: 30, y: 78 }, { x: 30, y: 79 }, { x: 30, y: 80 }, { x: 30, y: 81 }, { x: 30, y: 82 },
        // Path B exit (south-centre)
        { x: 52, y: 93 }, { x: 53, y: 93 }, { x: 54, y: 93 }, { x: 55, y: 93 }, { x: 56, y: 93 }, { x: 57, y: 93 }, { x: 58, y: 93 }, { x: 59, y: 93 },
        // Path C exit (east)
        { x: 89, y: 78 }, { x: 89, y: 79 }, { x: 89, y: 80 }, { x: 89, y: 81 }, { x: 89, y: 82 }
      ]
    });
    // Arena hazards
    addActor(level, {
      id: 'bar_act5_a', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 50, y: 82, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'bar_act5_b', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 70, y: 82, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: -1.8, fatal: true
    });
    addTimedGate(level, 'gate_act5', 50, 88, 20, 8, 2, 2.2, 1.0);

    // Path A (west): moving platform sequence
    fillTrack(level, 14, 76, 16, 8, 2);
    clearSurfaceRect(level, 20, 76, 6, 8);
    addMovingBridge(level, 'bridge_act5a', [
      { x: 20, y: 76, z: 2 },
      { x: 23, y: 76, z: 2 }
    ], 6, 8, 0.45);
    wallRing(level, 14, 76, 16, 8, 4, {
      gaps: [
        { x: 29, y: 78 }, { x: 29, y: 79 }, { x: 29, y: 80 }, { x: 29, y: 81 }, { x: 29, y: 82 },
        { x: 14, y: 78 }, { x: 14, y: 79 }, { x: 14, y: 80 }, { x: 14, y: 81 }, { x: 14, y: 82 }
      ]
    });
    placeRamp(level, { x: 14, y: 84, dir: 'south', length: 6, width: 8, startZ: 2, endZ: -2 });

    // Path B (south): crumble descent
    fillTrack(level, 48, 94, 14, 12, 2);
    for (let cx = 49; cx < 61; cx++) {
      for (let cy = 95; cy < 105; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.3, downtime: 2.5 } });
      }
    }
    wallRing(level, 48, 94, 14, 12, 4, {
      gaps: [
        { x: 52, y: 93 }, { x: 53, y: 93 }, { x: 54, y: 93 }, { x: 55, y: 93 }, { x: 56, y: 93 }, { x: 57, y: 93 }, { x: 58, y: 93 }, { x: 59, y: 93 }, { x: 60, y: 93 },
        { x: 52, y: 105 }, { x: 53, y: 105 }, { x: 54, y: 105 }, { x: 55, y: 105 }, { x: 56, y: 105 }, { x: 57, y: 105 }, { x: 58, y: 105 }, { x: 59, y: 105 }, { x: 60, y: 105 }
      ]
    });
    placeRamp(level, { x: 50, y: 106, dir: 'south', length: 6, width: 8, startZ: 2, endZ: -2 });

    // Path C (east): sweeper gauntlet
    fillTrack(level, 90, 76, 16, 8, 2);
    addActor(level, {
      id: 'sweeper_act5', kind: ACTOR_KINDS.SWEEPER,
      x: 98, y: 80, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.8, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    wallRing(level, 90, 76, 16, 8, 4, {
      gaps: [
        { x: 90, y: 78 }, { x: 90, y: 79 }, { x: 90, y: 80 }, { x: 90, y: 81 }, { x: 90, y: 82 },
        { x: 105, y: 78 }, { x: 105, y: 79 }, { x: 105, y: 80 }, { x: 105, y: 81 }, { x: 105, y: 82 }
      ]
    });
    placeRamp(level, { x: 100, y: 84, dir: 'south', length: 6, width: 8, startZ: 2, endZ: -2 });

    // Grand finale basin (z=-2), 60×14 — all three paths converge
    fillTrack(level, 14, 90, 92, 14, -2);
    wallRing(level, 14, 90, 92, 14, 0, {
      gaps: [
        { x: 14, y: 90 }, { x: 15, y: 90 }, { x: 16, y: 90 }, { x: 17, y: 90 }, { x: 18, y: 90 }, { x: 19, y: 90 }, { x: 20, y: 90 }, { x: 21, y: 90 },
        { x: 50, y: 90 }, { x: 51, y: 90 }, { x: 52, y: 90 }, { x: 53, y: 90 }, { x: 54, y: 90 }, { x: 55, y: 90 }, { x: 56, y: 90 }, { x: 57, y: 90 },
        { x: 98, y: 90 }, { x: 99, y: 90 }, { x: 100, y: 90 }, { x: 101, y: 90 }, { x: 102, y: 90 }, { x: 103, y: 90 }, { x: 104, y: 90 }, { x: 105, y: 90 }
      ]
    });
    setGoal(level, 60, 98, 0.44);

    addGraphNode(level, { id: 'start',   type: 'entry', x: 5.5,  y: 5.5,  z: 24 });
    addGraphNode(level, { id: 'path_a',  type: 'route', x: 38.5, y: 4.5,  z: 24 });
    addGraphNode(level, { id: 'path_b',  type: 'route', x: 28.5, y: 9.5,  z: 24 });
    addGraphNode(level, { id: 'path_c',  type: 'route', x: 34.5, y: 14.5, z: 24 });
    addGraphNode(level, { id: 'citadel', type: 'hub',   x: 70.5, y: 11.5, z: 18 });
    addGraphNode(level, { id: 'act3',    type: 'hub',   x: 64.5, y: 35.5, z: 12 });
    addGraphNode(level, { id: 'act4',    type: 'hub',   x: 64.5, y: 68.5, z: 2  });
    addGraphNode(level, { id: 'arena',   type: 'fork',  x: 60.5, y: 83.5, z: 2  });
    addGraphNode(level, { id: 'wing_a',  type: 'route', x: 22.5, y: 80.5, z: 2  });
    addGraphNode(level, { id: 'wing_b',  type: 'route', x: 55.5, y: 99.5, z: 2  });
    addGraphNode(level, { id: 'wing_c',  type: 'route', x: 98.5, y: 80.5, z: 2  });
    addGraphNode(level, { id: 'goal',    type: 'goal',  x: 60.5, y: 98.5, z: -2 });
    addGraphEdge(level, { from: 'start',   to: 'path_a',  kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'start',   to: 'path_b',  kind: 'roll'              });
    addGraphEdge(level, { from: 'start',   to: 'path_c',  kind: 'roll'              });
    addGraphEdge(level, { from: 'path_a',  to: 'citadel', kind: 'timed_cross'       });
    addGraphEdge(level, { from: 'path_b',  to: 'citadel', kind: 'hazard_lane'       });
    addGraphEdge(level, { from: 'path_c',  to: 'citadel', kind: 'roll'              });
    addGraphEdge(level, { from: 'citadel', to: 'act3',    kind: 'descent'           });
    addGraphEdge(level, { from: 'act3',    to: 'act4',    kind: 'descent'           });
    addGraphEdge(level, { from: 'act4',    to: 'arena',   kind: 'descent'           });
    addGraphEdge(level, { from: 'arena',   to: 'wing_a',  kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'arena',   to: 'wing_b',  kind: 'crumble'           });
    addGraphEdge(level, { from: 'arena',   to: 'wing_c',  kind: 'hazard_lane'       });
    addGraphEdge(level, { from: 'wing_a',  to: 'goal',    kind: 'descent'           });
    addGraphEdge(level, { from: 'wing_b',  to: 'goal',    kind: 'descent'           });
    addGraphEdge(level, { from: 'wing_c',  to: 'goal',    kind: 'descent'           });
    return registerLevel(level);
  }

function generateCourseFromSpec(spec = {}) {
  const width = Math.max(28, Math.floor(spec.width ?? 36));
  const height = Math.max(20, Math.floor(spec.height ?? 24));
  const id = spec.id || `generated_${Date.now()}`;
  const name = spec.name || 'Generated Course';

  const level = createLevelShell({
    id,
    name,
    width,
    height,
    killZ: spec.killZ ?? -8,
    voidFloor: spec.voidFloor ?? -5,
    start: spec.start ?? { x: 3.5, y: Math.floor(height * 0.5) + 0.5 },
    reward: spec.reward ?? { presses: 0 },
    generated: true,
    generatorSpec: { ...spec },
    routeGraph: spec.routeGraph ?? { nodes: [], edges: [] },
    templates: spec.templates ?? ['generated']
  });

  if (Array.isArray(spec.surface)) {
    for (const cell of spec.surface) {
      setSurface(level, cell.x, cell.y, cell.patch ?? cell);
    }
  }

  if (Array.isArray(spec.blockers)) {
    for (const cell of spec.blockers) {
      setBlocker(level, cell.x, cell.y, cell.patch ?? cell);
    }
  }

  if (Array.isArray(spec.triggers)) {
    for (const cell of spec.triggers) {
      setTrigger(level, cell.x, cell.y, cell.patch ?? cell);
    }
  }

  if (Array.isArray(spec.actors)) {
    for (const actor of spec.actors) {
      addActor(level, actor);
    }
  }

  if (spec.goal) {
    setGoal(level, spec.goal.x, spec.goal.y, spec.goal.radius ?? 0.42);
  }

  return level;
}

function registerGeneratedLevel(level) {
  const index = GENERATED_LEVELS.findIndex((item) => item.id === level.id);
  if (index >= 0) GENERATED_LEVELS.splice(index, 1, level);
  else GENERATED_LEVELS.push(level);
  return level;
}

  const LEVELS = [
    buildPracticeGreen(),
    buildTerracesFalls(),
    buildTheSwitchback(),
    buildCanalRun(),
    buildTheCrossing(),
    buildStairwayHeights(),
    buildTheLabyrinth(),
    buildTheGauntlet(),
    buildTowerDescent(),
    buildTheFinalApproach()
  ];

  function getAllLevels() {
    return [...LEVELS, ...GENERATED_LEVELS];
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
    if (index < 0) return true;
    if (index === 0) return true;
    if (clearedLevels.includes(levelId)) return true;
    return clearedLevels.includes(LEVELS[index - 1].id);
  }

  function getUnlockedLevelIds(clearedLevels = []) {
    return LEVELS.filter((level) => isLevelUnlocked(clearedLevels, level.id)).map((level) => level.id);
  }

  window.MarbleLevels = {
    SHAPES,
    ACTOR_KINDS,
    LEVELS,
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
    sampleWalkableSurface,
    sampleVisualSurface,
    sampleSupportSurface,
    createDynamicState,
    advanceDynamicState,
    getActorBlockingOverlaps,
    getHazardContacts,
    resolveSupportInteraction,
    setGoal
  };
})();