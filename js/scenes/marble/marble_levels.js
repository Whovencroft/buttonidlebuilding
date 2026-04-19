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
        speed: actor.travel.speed ?? 1
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
    setTrigger(level, x, y, { kind: 'goal', radius });
    level.goal = { x: x + 0.5, y: y + 0.5, radius };
  }

  function addActor(level, actor) {
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

  function sampleWalkableSurface(level, x, y, options = {}) {
    const runtime = options.runtime ?? null;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const blocker = getBlockerCell(level, tx, ty);
    const actorSurface = sampleActorSurface(level, runtime, x, y);
    const staticSurface = sampleStaticSurfaceOnly(level, runtime, x, y);

    let blockerSurface = null;
    if (blocker?.walkableTop) {
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
    const blocker = getBlockerCell(level, tx, ty);
    const surface = getSurfaceCell(level, tx, ty);
    let best = level?.voidFloor ?? -1.5;

    if (surface && surface.kind !== 'void' && !(surface.crumble && isCrumbleBroken(runtime, tx, ty))) {
      best = Math.max(best, getSurfaceTopZ(surface));
    }

    if (blocker) {
      best = Math.max(best, blocker.top);
    }

    if (runtime?.actors) {
      for (const actor of level.actors) {
        const state = getActorWorldState(actor, runtime);
        if (state.active === false) continue;
        if (tx >= state.x && tx < state.x + actor.width && ty >= state.y && ty < state.y + actor.height) {
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

  function buildForkRejoinTest() {
    const level = createLevelShell({
      id: 'fork_rejoin_test',
      name: 'Fork / Rejoin',
      width: 28,
      height: 18,
      killZ: -5,
      voidFloor: -3,
      start: { x: 2.5, y: 9.5 },
      reward: { presses: 7000, unlocks: ['marble_switchback_complete'], claimKey: 'fork_rejoin_test' },
      templates: ['entry_ramp', 'safe_branch', 'hazard_branch', 'rejoin']
    });

    fillSurfaceRect(level, 1, 8, 3, 3, { baseHeight: 4, shape: SHAPES.FLAT });
    applyPath(level, [{ x: 4, y: 9 }, { x: 7, y: 9 }], { baseHeight: 4, shape: SHAPES.FLAT }, 2);
    applyPath(level, [{ x: 8, y: 7 }, { x: 14, y: 5 }, { x: 18, y: 7 }], { baseHeight: 4, shape: SHAPES.FLAT }, 2);
    applyPath(level, [{ x: 8, y: 11 }, { x: 12, y: 11 }, { x: 16, y: 13 }, { x: 18, y: 11 }], { baseHeight: 4, shape: SHAPES.FLAT, friction: 0.58 }, 2);
    applyPath(level, [{ x: 18, y: 9 }, { x: 24, y: 9 }], { baseHeight: 4, shape: SHAPES.FLAT }, 2);

    setSurface(level, 13, 11, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 0.6, y: 0, strength: 1.6 } });
    setSurface(level, 14, 12, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.24, downtime: 1.7 } });
    setSurface(level, 15, 12, { baseHeight: 4, shape: SHAPES.FLAT, bounce: 4.2 });
    setSurface(level, 21, 9, { baseHeight: 4, shape: SHAPES.LANDING_PAD, landingPad: true, friction: 1.25 });

    setTrigger(level, 14, 11, { kind: 'hazard', data: { type: 'spike_strip' } });
    setTrigger(level, 15, 11, { kind: 'hazard', data: { type: 'spike_strip' } });

    setGoal(level, 24, 9, 0.42);

    addGraphNode(level, { id: 'start', type: 'entry', x: 2.5, y: 9.5, z: 4 });
    addGraphNode(level, { id: 'fork', type: 'fork', x: 8.5, y: 9.5, z: 4 });
    addGraphNode(level, { id: 'upper', type: 'route', x: 13.5, y: 5.5, z: 4, tag: 'safe' });
    addGraphNode(level, { id: 'lower', type: 'route', x: 14.5, y: 12.5, z: 4, tag: 'hazard' });
    addGraphNode(level, { id: 'rejoin', type: 'merge', x: 18.5, y: 9.5, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 24.5, y: 9.5, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'fork', kind: 'roll' });
    addGraphEdge(level, { from: 'fork', to: 'upper', kind: 'roll' });
    addGraphEdge(level, { from: 'fork', to: 'lower', kind: 'roll' });
    addGraphEdge(level, { from: 'upper', to: 'rejoin', kind: 'roll' });
    addGraphEdge(level, { from: 'lower', to: 'rejoin', kind: 'roll' });
    addGraphEdge(level, { from: 'rejoin', to: 'goal', kind: 'roll' });

    return registerLevel(level);
  }

function buildSwitchbackDescent() {
  const level = createLevelShell({
    id: 'switchback_descent',
    name: 'Switchback Descent',
    width: 24,
    height: 20,
    killZ: -6,
    voidFloor: -4,
    start: { x: 3.5, y: 3.5 },
    reward: { presses: 9000, unlocks: ['marble_drop_complete'], claimKey: 'switchback_descent' },
    templates: ['switchback_slope', 'curve_corner', 'drop_ramp']
  });

  fillSurfaceRect(level, 2, 2, 4, 4, { baseHeight: 8 });
  applyPath(level, [{ x: 4, y: 3 }, { x: 14, y: 3 }], { baseHeight: 8 }, 2);
  placeCurve(level, 14, 3, 'convex_se', { baseHeight: 8 });
  placeCurve(level, 15, 3, 'convex_se', { baseHeight: 8 });

  for (let y = 4; y <= 7; y += 1) {
    setSurface(level, 14, y, { baseHeight: 8 - (y - 3), shape: SHAPES.SLOPE_S });
    setSurface(level, 15, y, { baseHeight: 8 - (y - 3), shape: SHAPES.SLOPE_S });
  }

  applyPath(level, [{ x: 13, y: 7 }, { x: 6, y: 7 }], { baseHeight: 5 }, 2);
  placeCurve(level, 6, 7, 'convex_sw', { baseHeight: 5 });
  placeCurve(level, 7, 7, 'convex_sw', { baseHeight: 5 });

  for (let y = 8; y <= 11; y += 1) {
    setSurface(level, 6, y, { baseHeight: 5 - (y - 7), shape: SHAPES.SLOPE_S });
    setSurface(level, 7, y, { baseHeight: 5 - (y - 7), shape: SHAPES.SLOPE_S });
  }

  applyPath(level, [{ x: 7, y: 11 }, { x: 18, y: 11 }], { baseHeight: 2 }, 2);
  setSurface(level, 18, 11, { baseHeight: 2, shape: SHAPES.DROP_RAMP_S, rise: -1.5 });
  setSurface(level, 19, 11, { baseHeight: 2, shape: SHAPES.DROP_RAMP_S, rise: -1.5 });

  fillSurfaceRect(level, 18, 13, 4, 4, {
    baseHeight: 0,
    shape: SHAPES.LANDING_PAD,
    landingPad: true,
    friction: 1.3
  });
  setGoal(level, 19, 14, 0.44);

  setSurface(level, 9, 3, { baseHeight: 8, shape: SHAPES.FLAT, conveyor: { x: 0.45, y: 0.2, strength: 1.1 } });
  setSurface(level, 10, 7, { baseHeight: 5, shape: SHAPES.FLAT, crumble: { delay: 0.28, downtime: 1.9 } });
  setSurface(level, 11, 11, { baseHeight: 2, shape: SHAPES.FLAT, bounce: 4.2 });

  addGraphNode(level, { id: 'entry', type: 'entry', x: 3.5, y: 3.5, z: 8 });
  addGraphNode(level, { id: 'turn_1', type: 'corner', x: 14.5, y: 3.5, z: 8 });
  addGraphNode(level, { id: 'turn_2', type: 'corner', x: 6.5, y: 7.5, z: 5 });
  addGraphNode(level, { id: 'drop', type: 'drop', x: 18.5, y: 11.5, z: 2 });
  addGraphNode(level, { id: 'goal', type: 'goal', x: 19.5, y: 14.5, z: 0 });
  addGraphEdge(level, { from: 'entry', to: 'turn_1', kind: 'roll' });
  addGraphEdge(level, { from: 'turn_1', to: 'turn_2', kind: 'switchback' });
  addGraphEdge(level, { from: 'turn_2', to: 'drop', kind: 'switchback' });
  addGraphEdge(level, { from: 'drop', to: 'goal', kind: 'jump_drop' });
  return registerLevel(level);
}

  function buildDropNetwork() {
    const level = createLevelShell({
      id: 'drop_network',
      name: 'Drop Network',
      width: 28,
      height: 22,
      killZ: -8,
      voidFloor: -5,
      start: { x: 4.5, y: 4.5 },
      reward: { presses: 12000, unlocks: ['marble_platform_complete'], claimKey: 'drop_network' },
      templates: ['hub', 'drop_ramp', 'lower_route', 'recovery']
    });

    fillSurfaceRect(level, 3, 3, 4, 4, { baseHeight: 8 });
    fillSurfaceRect(level, 8, 3, 4, 2, { baseHeight: 8 });
    fillSurfaceRect(level, 9, 6, 3, 2, { baseHeight: 7 });
    setSurface(level, 11, 7, { baseHeight: 7, shape: SHAPES.DROP_RAMP_S, rise: -2.5 });
    fillSurfaceRect(level, 11, 10, 3, 3, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 13, 10, { baseHeight: 4, shape: SHAPES.DROP_RAMP_E, rise: -2 });
    fillSurfaceRect(level, 16, 10, 3, 3, { baseHeight: 2 });
    setSurface(level, 18, 11, { baseHeight: 2, shape: SHAPES.DROP_RAMP_S, rise: -1.5 });
    fillSurfaceRect(level, 18, 14, 4, 3, { baseHeight: 0, shape: SHAPES.LANDING_PAD, landingPad: true, friction: 1.3 });

    fillSurfaceRect(level, 7, 8, 2, 2, { baseHeight: 5, shape: SHAPES.FLAT, conveyor: { x: 0.8, y: 0, strength: 1.2 } });
    fillSurfaceRect(level, 14, 14, 2, 2, { baseHeight: 1, shape: SHAPES.FLAT, crumble: { delay: 0.2, downtime: 2.1 } });
    setTrigger(level, 12, 11, { kind: 'hazard', data: { type: 'drop_shaft' } });
    setGoal(level, 20, 15, 0.44);

    addGraphNode(level, { id: 'hub', type: 'hub', x: 5.5, y: 5.5, z: 8 });
    addGraphNode(level, { id: 'drop_a', type: 'drop', x: 11.5, y: 7.5, z: 7 });
    addGraphNode(level, { id: 'mid', type: 'junction', x: 12.5, y: 11.5, z: 4 });
    addGraphNode(level, { id: 'drop_b', type: 'drop', x: 18.5, y: 11.5, z: 2 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 20.5, y: 15.5, z: 0 });
    addGraphEdge(level, { from: 'hub', to: 'drop_a', kind: 'controlled_fall' });
    addGraphEdge(level, { from: 'drop_a', to: 'mid', kind: 'jump_drop' });
    addGraphEdge(level, { from: 'mid', to: 'drop_b', kind: 'jump_drop' });
    addGraphEdge(level, { from: 'drop_b', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  function buildMovingPlatformTransfer() {
    const level = createLevelShell({
      id: 'moving_platform_transfer',
      name: 'Platform Transfer',
      width: 30,
      height: 18,
      killZ: -7,
      voidFloor: -4,
      start: { x: 3.5, y: 8.5 },
      reward: { presses: 16000, unlocks: ['marble_crossover_complete'], claimKey: 'moving_platform_transfer' },
      templates: ['moving_platform', 'elevator', 'timed_gate', 'transfer']
    });

    fillSurfaceRect(level, 2, 7, 4, 4, { baseHeight: 5 });
    fillSurfaceRect(level, 22, 7, 4, 4, { baseHeight: 5 });
    fillSurfaceRect(level, 26, 7, 2, 4, { baseHeight: 5, shape: SHAPES.FLAT, bounce: 4.2 });
    setGoal(level, 27, 8, 0.42);

    addActor(level, {
      id: 'platform_a',
      kind: ACTOR_KINDS.MOVING_PLATFORM,
      x: 6,
      y: 8,
      z: 4,
      width: 2,
      height: 2,
      topHeight: 4,
      path: {
        type: 'ping_pong',
        speed: 0.75,
        points: [
          { x: 6, y: 8, z: 4 },
          { x: 12, y: 8, z: 4 },
          { x: 12, y: 4, z: 4 }
        ]
      }
    });

    addActor(level, {
      id: 'elevator_b',
      kind: ACTOR_KINDS.ELEVATOR,
      x: 14,
      y: 4,
      z: 2,
      width: 2,
      height: 2,
      topHeight: 2,
      travel: { axis: 'z', min: 2, max: 6, speed: 0.8, cycle: 4.2 }
    });

    addActor(level, {
      id: 'platform_c',
      kind: ACTOR_KINDS.MOVING_PLATFORM,
      x: 16,
      y: 8,
      z: 5,
      width: 2,
      height: 2,
      topHeight: 5,
      // friction: 0.9,
      conveyor: { x: 0.25, y: 0, strength: 0.5 },
      path: {
        type: 'loop',
        speed: 0.7,
        points: [
          { x: 14, y: 6, z: 4 },
          { x: 19, y: 8, z: 5 },
          { x: 19, y: 11, z: 5 },
          { x: 16, y: 11, z: 6 }
        ]
      }
    });

    addActor(level, {
      id: 'gate_d',
      kind: ACTOR_KINDS.TIMED_GATE,
      x: 21,
      y: 8,
      z: 0,
      width: 1,
      height: 2,
      topHeight: 7,
      closedDuration: 1.5,
      openDuration: 1.1
    });

    addGraphNode(level, { id: 'entry', type: 'entry', x: 3.5, y: 8.5, z: 5 });
    addGraphNode(level, { id: 'platform_a', type: 'moving_platform', x: 7, y: 9, z: 4 });
    addGraphNode(level, { id: 'elevator_b', type: 'elevator', x: 15, y: 5, z: 2 });
    addGraphNode(level, { id: 'platform_c', type: 'moving_platform', x: 17, y: 9, z: 5 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 27.5, y: 8.5, z: 5 });
    addGraphEdge(level, { from: 'entry', to: 'platform_a', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'platform_a', to: 'elevator_b', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'elevator_b', to: 'platform_c', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'platform_c', to: 'goal', kind: 'timed_cross' });
    return registerLevel(level);
  }

  function buildCrossoverSpine() {
    const level = createLevelShell({
      id: 'crossover_spine',
      name: 'Crossover Spine',
      width: 30,
      height: 20,
      killZ: -8,
      voidFloor: -5,
      start: { x: 3.5, y: 15.5 },
      reward: { presses: 22000, unlocks: ['marble_master_complete'], claimKey: 'crossover_spine' },
      templates: ['crossover', 'upper_loop', 'rotating_bar', 'sweeper']
    });

    applyPath(level, [{ x: 2, y: 15 }, { x: 12, y: 15 }], { baseHeight: 3 }, 2);
    applyPath(level, [{ x: 12, y: 15 }, { x: 17, y: 10 }, { x: 24, y: 10 }], { baseHeight: 6, shape: SHAPES.DIAG_NE }, 1);
    applyPath(level, [{ x: 12, y: 15 }, { x: 17, y: 18 }, { x: 24, y: 18 }], { baseHeight: 3, shape: SHAPES.FLAT }, 1);
    setSurface(level, 24, 10, { baseHeight: 6, shape: SHAPES.DROP_RAMP_S, rise: -3 });
    fillSurfaceRect(level, 24, 13, 3, 3, { baseHeight: 3, shape: SHAPES.LANDING_PAD, landingPad: true, friction: 1.25 });
    setGoal(level, 25, 14, 0.42);

    addActor(level, {
      id: 'bar_upper',
      kind: ACTOR_KINDS.ROTATING_BAR,
      x: 18,
      y: 10,
      z: 6,
      width: 1,
      height: 1,
      topHeight: 6,
      armLength: 1.8,
      armWidth: 0.22,
      angularSpeed: 1.7,
      fatal: true
    });

    addActor(level, {
      id: 'sweeper_lower',
      kind: ACTOR_KINDS.SWEEPER,
      x: 18,
      y: 18,
      z: 3,
      width: 1,
      height: 1,
      topHeight: 3,
      armLength: 2.3,
      armWidth: 0.3,
      angularSpeed: -1.25,
      fatal: true
    });

    addGraphNode(level, { id: 'entry', type: 'entry', x: 3.5, y: 15.5, z: 3 });
    addGraphNode(level, { id: 'split', type: 'fork', x: 12.5, y: 15.5, z: 3 });
    addGraphNode(level, { id: 'upper', type: 'route', x: 18.5, y: 10.5, z: 6 });
    addGraphNode(level, { id: 'lower', type: 'route', x: 18.5, y: 18.5, z: 3 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 25.5, y: 14.5, z: 3 });
    addGraphEdge(level, { from: 'entry', to: 'split', kind: 'roll' });
    addGraphEdge(level, { from: 'split', to: 'upper', kind: 'roll' });
    addGraphEdge(level, { from: 'split', to: 'lower', kind: 'roll' });
    addGraphEdge(level, { from: 'upper', to: 'goal', kind: 'jump_drop' });
    addGraphEdge(level, { from: 'lower', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  function chooseMotif(spec, rng) {
    const motifs = ['fork_rejoin', 'switchback', 'drop_network', 'platform_transfer', 'crossover'];
    if (spec.motif && motifs.includes(spec.motif)) return spec.motif;
    const index = Math.floor(rng() * motifs.length);
    return motifs[index];
  }

  function buildRouteGraphSpec(spec, rng) {
    const motif = chooseMotif(spec, rng);
    const graph = { motif, nodes: [], edges: [] };

    if (motif === 'fork_rejoin') {
      graph.nodes.push(
        { id: 'start', type: 'entry', lane: 0, depth: 0 },
        { id: 'fork', type: 'fork', lane: 0, depth: 1 },
        { id: 'safe', type: 'route', lane: -1, depth: 2, hazardWeight: 1 },
        { id: 'risk', type: 'route', lane: 1, depth: 2, hazardWeight: 3 },
        { id: 'merge', type: 'merge', lane: 0, depth: 3 },
        { id: 'goal', type: 'goal', lane: 0, depth: 4 }
      );
      graph.edges.push(
        { from: 'start', to: 'fork', kind: 'roll' },
        { from: 'fork', to: 'safe', kind: 'roll' },
        { from: 'fork', to: 'risk', kind: 'roll' },
        { from: 'safe', to: 'merge', kind: 'roll' },
        { from: 'risk', to: 'merge', kind: 'hazard_lane' },
        { from: 'merge', to: 'goal', kind: 'roll' }
      );
    } else if (motif === 'switchback') {
      const segments = Math.max(3, Math.min(6, spec.length ?? 4));
      graph.nodes.push({ id: 'entry', type: 'entry', lane: 0, depth: 0 });
      for (let i = 0; i < segments; i += 1) {
        graph.nodes.push({ id: `turn_${i}`, type: 'corner', lane: i % 2 === 0 ? 1 : -1, depth: i + 1, z: segments - i });
      }
      graph.nodes.push({ id: 'goal', type: 'goal', lane: 0, depth: segments + 1, z: 0 });
      graph.edges.push({ from: 'entry', to: 'turn_0', kind: 'switchback' });
      for (let i = 0; i < segments - 1; i += 1) {
        graph.edges.push({ from: `turn_${i}`, to: `turn_${i + 1}`, kind: 'switchback' });
      }
      graph.edges.push({ from: `turn_${segments - 1}`, to: 'goal', kind: 'jump_drop' });
    } else if (motif === 'drop_network') {
      graph.nodes.push(
        { id: 'hub', type: 'hub', lane: 0, depth: 0, z: 4 },
        { id: 'drop_a', type: 'drop', lane: 1, depth: 1, z: 3 },
        { id: 'mid', type: 'junction', lane: 0, depth: 2, z: 2 },
        { id: 'drop_b', type: 'drop', lane: -1, depth: 3, z: 1 },
        { id: 'goal', type: 'goal', lane: 0, depth: 4, z: 0 }
      );
      graph.edges.push(
        { from: 'hub', to: 'drop_a', kind: 'controlled_fall' },
        { from: 'hub', to: 'mid', kind: 'shortcut' },
        { from: 'drop_a', to: 'mid', kind: 'jump_drop' },
        { from: 'mid', to: 'drop_b', kind: 'controlled_fall' },
        { from: 'drop_b', to: 'goal', kind: 'roll' },
        { from: 'mid', to: 'goal', kind: 'risk_skip' }
      );
    } else if (motif === 'platform_transfer') {
      graph.nodes.push(
        { id: 'entry', type: 'entry', lane: 0, depth: 0 },
        { id: 'platform_a', type: 'moving_platform', lane: 1, depth: 1 },
        { id: 'elevator', type: 'elevator', lane: 0, depth: 2 },
        { id: 'platform_b', type: 'moving_platform', lane: -1, depth: 3 },
        { id: 'goal', type: 'goal', lane: 0, depth: 4 }
      );
      graph.edges.push(
        { from: 'entry', to: 'platform_a', kind: 'platform_transfer' },
        { from: 'platform_a', to: 'elevator', kind: 'platform_transfer' },
        { from: 'elevator', to: 'platform_b', kind: 'platform_transfer' },
        { from: 'platform_b', to: 'goal', kind: 'timed_cross' }
      );
    } else {
      graph.nodes.push(
        { id: 'entry', type: 'entry', lane: 0, depth: 0 },
        { id: 'split', type: 'fork', lane: 0, depth: 1 },
        { id: 'upper', type: 'route', lane: -1, depth: 2, z: 2 },
        { id: 'lower', type: 'route', lane: 1, depth: 2, z: 0 },
        { id: 'goal', type: 'goal', lane: 0, depth: 3 }
      );
      graph.edges.push(
        { from: 'entry', to: 'split', kind: 'roll' },
        { from: 'split', to: 'upper', kind: 'roll' },
        { from: 'split', to: 'lower', kind: 'roll' },
        { from: 'upper', to: 'goal', kind: 'jump_drop' },
        { from: 'lower', to: 'goal', kind: 'roll' }
      );
    }

    return graph;
  }

  function rasterizeGraphCourse(spec = {}) {
    const levelNumber = spec.level ?? 1;
    const length = Math.max(4, Math.floor(spec.length ?? 8));
    const complexity = Math.max(1, Math.floor(spec.complexity ?? 3));
    const seed = spec.seed ?? hashSeed(`graph:${levelNumber}:${length}:${complexity}:${spec.motif || 'auto'}`);
    const rng = createDeterministicRandom(seed);
    const routeGraph = buildRouteGraphSpec({ ...spec, length, complexity }, rng);
    const width = Math.max(28, 6 + length * 4);
    const height = 22;
    const level = createLevelShell({
      id: spec.id || `generated_graph_${routeGraph.motif}_${levelNumber}_${length}_${complexity}_${seed}`,
      name: spec.name || `Generated ${routeGraph.motif} ${levelNumber}-${length}-${complexity}`,
      width,
      height,
      killZ: -8,
      voidFloor: -5,
      start: { x: 3.5, y: 11.5 },
      reward: { presses: 0 },
      generated: true,
      generatorSpec: { level: levelNumber, length, complexity, seed, motif: routeGraph.motif },
      routeGraph,
      templates: [routeGraph.motif]
    });

    const laneToY = (lane) => 11 + lane * 4;
    const depthToX = (depth) => 3 + depth * 6;

    for (const node of routeGraph.nodes) {
      node.x = depthToX(node.depth);
      node.y = laneToY(node.lane);
      node.z = node.z ?? Math.max(0, 4 - node.depth);
    }

    const nodeById = Object.fromEntries(routeGraph.nodes.map((node) => [node.id, node]));

    for (const edge of routeGraph.edges) {
      const a = nodeById[edge.from];
      const b = nodeById[edge.to];
      if (!a || !b) continue;

      const heightBase = Math.max(a.z ?? 0, b.z ?? 0);
      const patch = { baseHeight: heightBase };
      if (edge.kind === 'switchback') {
        patch.shape = a.y < b.y ? SHAPES.SLOPE_S : SHAPES.SLOPE_N;
      } else if (edge.kind === 'jump_drop' || edge.kind === 'controlled_fall') {
        patch.shape = b.y > a.y ? SHAPES.DROP_RAMP_S : b.y < a.y ? SHAPES.DROP_RAMP_N : SHAPES.DROP_RAMP_E;
        patch.rise = -Math.max(1.2, (a.z ?? 0) - (b.z ?? 0) + 0.5);
      } else {
        patch.shape = SHAPES.FLAT;
      }

      const points = [{ x: Math.floor(a.x), y: Math.floor(a.y) }, { x: Math.floor(b.x), y: Math.floor(b.y) }];
      applyPath(level, points, patch, edge.kind === 'hazard_lane' ? 1 : 2);

      if (edge.kind === 'hazard_lane') {
        const hx = Math.floor((a.x + b.x) * 0.5);
        const hy = Math.floor((a.y + b.y) * 0.5);
        setSurface(level, hx, hy, { baseHeight: heightBase, shape: SHAPES.FLAT, friction: 0.7, conveyor: { x: 0.7, y: 0, strength: 1.4 } });
        setTrigger(level, hx + 1, hy, { kind: 'hazard', data: { type: 'strip' } });
      }

      if (edge.kind === 'platform_transfer') {
        addActor(level, {
          id: `actor_${edge.from}_${edge.to}`,
          kind: ACTOR_KINDS.MOVING_PLATFORM,
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          z: Math.min(a.z ?? 0, b.z ?? 0) + 2,
          width: 2,
          height: 2,
          topHeight: Math.min(a.z ?? 0, b.z ?? 0) + 2,
          path: {
            type: 'ping_pong',
            speed: 0.6 + complexity * 0.05,
            points: [
              { x: a.x, y: a.y, z: (a.z ?? 0) + 1 },
              { x: b.x, y: b.y, z: (b.z ?? 0) + 1 }
            ]
          }
        });
      }
    }

    for (const node of routeGraph.nodes) {
      if (node.type === 'goal') {
        fillSurfaceRect(level, Math.floor(node.x) - 1, Math.floor(node.y) - 1, 3, 3, { baseHeight: node.z ?? 0, shape: SHAPES.LANDING_PAD, landingPad: true, friction: 1.25 });
        setGoal(level, Math.floor(node.x), Math.floor(node.y), 0.42);
      }
      if (node.type === 'drop') {
        setSurface(level, Math.floor(node.x), Math.floor(node.y), { baseHeight: node.z ?? 0, shape: SHAPES.DROP_RAMP_S, rise: -1.8 });
      }
      if (node.type === 'fork') {
        setSurface(level, Math.floor(node.x), Math.floor(node.y), { baseHeight: node.z ?? 0, shape: SHAPES.LANDING_PAD, landingPad: true });
      }
    }

    if (routeGraph.motif === 'crossover') {
      const centerX = Math.floor(width * 0.58);
      addActor(level, {
        id: 'generated_bar',
        kind: ACTOR_KINDS.ROTATING_BAR,
        x: centerX,
        y: 7,
        z: 6,
        width: 1,
        height: 1,
        topHeight: 6,
        armLength: 2.2,
        armWidth: 0.25,
        angularSpeed: 1.4,
        fatal: true
      });
      addActor(level, {
        id: 'generated_sweeper',
        kind: ACTOR_KINDS.SWEEPER,
        x: centerX,
        y: 15,
        z: 3,
        width: 1,
        height: 1,
        topHeight: 3,
        armLength: 2.2,
        armWidth: 0.25,
        angularSpeed: -1.15,
        fatal: true
      });
    }

    return level;
  }

  function generateCourseFromSpec(spec = {}) {
    return rasterizeGraphCourse(spec);
  }

  function registerGeneratedLevel(level) {
    const index = GENERATED_LEVELS.findIndex((item) => item.id === level.id);
    if (index >= 0) GENERATED_LEVELS.splice(index, 1, level);
    else GENERATED_LEVELS.push(level);
    return level;
  }

  const LEVELS = [
    buildForkRejoinTest(),
    buildSwitchbackDescent(),
    buildDropNetwork(),
    buildMovingPlatformTransfer(),
    buildCrossoverSpine()
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