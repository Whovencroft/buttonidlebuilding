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
    kind: options.kind ?? 'wall',
    top,
    walkableTop: options.walkableTop !== false,
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
        walkableTop: false,
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

  function buildForkRejoinTest() {
    const level = createLevelShell({
      id: 'fork_rejoin_test',
      name: 'Citadel Approach',
      width: 62,
      height: 46,
      killZ: -20,
      voidFloor: -10,
      start: { x: 5.5, y: 34.5 },
      reward: { presses: 7000, unlocks: ['marble_switchback_complete'], claimKey: 'fork_rejoin_test' },
      templates: ['mega_start_plateau', 'citadel_ring', 'service_route', 'overhead_platforms']
    });

    fillTrack(level, 2, 31, 8, 8, 14);
    wallRing(level, 2, 31, 8, 8, 16, {
      gaps: [{ x: 9, y: 34 }, { x: 9, y: 35 }]
    });

    widePath(level, [{ x: 9, y: 34 }, { x: 18, y: 34 }], 14, 3);
    fillTrack(level, 18, 31, 6, 6, 13);
    wallRing(level, 18, 31, 6, 6, 15, {
      gaps: [{ x: 18, y: 34 }, { x: 23, y: 33 }, { x: 23, y: 34 }, { x: 20, y: 31 }]
    });

    fillTrack(level, 20, 20, 18, 16, 12);
    clearSurfaceRect(level, 26, 25, 6, 5);
    wallRing(level, 20, 20, 18, 16, 14, {
      gaps: [
        { x: 20, y: 27 }, { x: 20, y: 28 },
        { x: 37, y: 25 }, { x: 37, y: 26 },
        { x: 28, y: 20 }, { x: 29, y: 20 },
        { x: 29, y: 35 }, { x: 30, y: 35 }
      ]
    });
    wallRing(level, 25, 24, 8, 7, 14, {
      gaps: [
        { x: 28, y: 24 }, { x: 29, y: 24 },
        { x: 28, y: 30 }, { x: 29, y: 30 }
      ]
    });

    widePath(level, [{ x: 23, y: 33 }, { x: 20, y: 28 }], 13, 3);
    buildStairRun(level, 20, 27, 3, 'west', 13, -1, 3);
    buildStairRun(level, 18, 24, 3, 'north', 11, 0, 3);
    widePath(level, [{ x: 20, y: 23 }, { x: 30, y: 23 }, { x: 40, y: 23 }], 11, 3);
    wallRing(level, 40, 20, 8, 8, 13, {
      gaps: [{ x: 40, y: 23 }, { x: 47, y: 23 }, { x: 43, y: 27 }]
    });

    buildStairRun(level, 45, 23, 4, 'south', 11, -1, 3);
    fillTrack(level, 43, 27, 15, 8, 7);
    wallRing(level, 43, 27, 15, 8, 9, {
      gaps: [
        { x: 43, y: 29 }, { x: 43, y: 30 },
        { x: 57, y: 30 }, { x: 57, y: 31 },
        { x: 50, y: 27 }, { x: 51, y: 27 }
      ]
    });

    widePath(level, [{ x: 29, y: 35 }, { x: 29, y: 40 }, { x: 41, y: 40 }], 10, 3);
    buildStairRun(level, 41, 39, 4, 'north', 10, -1, 3);
    fillTrack(level, 41, 32, 13, 4, 7);
    wallRing(level, 41, 32, 13, 4, 9, {
      gaps: [{ x: 41, y: 33 }, { x: 52, y: 32 }, { x: 53, y: 32 }]
    });

    fillTrack(level, 44, 16, 12, 7, 6);
    wallRing(level, 44, 16, 12, 7, 8, {
      gaps: [{ x: 44, y: 19 }, { x: 55, y: 18 }, { x: 55, y: 19 }]
    });

    widePath(level, [{ x: 50, y: 27 }, { x: 50, y: 22 }], 7, 3);
    buildStairRun(level, 49, 21, 3, 'north', 7, -1, 3);
    widePath(level, [{ x: 49, y: 18 }, { x: 55, y: 18 }], 5, 3);

    addStaticPlatform(level, 'citadel_overhang_a', 45, 28, 10, 6, 3);
    addStaticPlatform(level, 'citadel_overhang_b', 48, 17, 9, 5, 3);
    addStaticPlatform(level, 'citadel_overhang_c', 24, 26, 14, 3, 3);

    addHazardRect(level, 33, 22, 2, 2, 'citadel_spikes');
    addHazardRect(level, 46, 33, 2, 1, 'service_spikes');
    addHazardRect(level, 52, 18, 1, 2, 'goal_guard');

    setSurface(level, 47, 18, { baseHeight: 5, shape: SHAPES.FLAT, conveyor: { x: 0.7, y: 0, strength: 1.1 } });
    setSurface(level, 48, 18, { baseHeight: 5, shape: SHAPES.FLAT, crumble: { delay: 0.25, downtime: 2.0 } });
    setSurface(level, 54, 18, { baseHeight: 5, shape: SHAPES.FLAT, bounce: 4.2 });
    setGoal(level, 55, 18, 0.44);

    addGraphNode(level, { id: 'start', type: 'entry', x: 5.5, y: 34.5, z: 14 });
    addGraphNode(level, { id: 'anteroom', type: 'route', x: 21.5, y: 34.5, z: 13 });
    addGraphNode(level, { id: 'citadel', type: 'hub', x: 28.5, y: 27.5, z: 12 });
    addGraphNode(level, { id: 'north_route', type: 'route', x: 43.5, y: 23.5, z: 11 });
    addGraphNode(level, { id: 'service_route', type: 'route', x: 47.5, y: 33.5, z: 7 });
    addGraphNode(level, { id: 'lower_basin', type: 'merge', x: 50.5, y: 19.5, z: 6 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 55.5, y: 18.5, z: 5 });
    addGraphEdge(level, { from: 'start', to: 'anteroom', kind: 'roll' });
    addGraphEdge(level, { from: 'anteroom', to: 'citadel', kind: 'roll' });
    addGraphEdge(level, { from: 'citadel', to: 'north_route', kind: 'roll' });
    addGraphEdge(level, { from: 'citadel', to: 'service_route', kind: 'roll' });
    addGraphEdge(level, { from: 'north_route', to: 'lower_basin', kind: 'descent' });
    addGraphEdge(level, { from: 'service_route', to: 'lower_basin', kind: 'descent' });
    addGraphEdge(level, { from: 'lower_basin', to: 'goal', kind: 'finale' });

    return registerLevel(level);
  }

  function buildSwitchbackDescent() {
    const level = createLevelShell({
      id: 'switchback_descent',
      name: 'Mountain Switchback',
      width: 64,
      height: 48,
      killZ: -24,
      voidFloor: -12,
      start: { x: 6.5, y: 6.5 },
      reward: { presses: 9000, unlocks: ['marble_drop_complete'], claimKey: 'switchback_descent' },
      templates: ['mega_switchback', 'stair_runs', 'bridge_overhangs', 'drop_chambers']
    });

    fillTrack(level, 3, 3, 24, 7, 18);
    wallRing(level, 3, 3, 24, 7, 20, {
      gaps: [{ x: 24, y: 8 }, { x: 25, y: 8 }]
    });

    buildStairRun(level, 22, 9, 4, 'south', 18, -1, 4);
    fillTrack(level, 18, 12, 24, 5, 14);
    wallRing(level, 18, 12, 24, 5, 16, {
      gaps: [{ x: 18, y: 13 }, { x: 19, y: 13 }, { x: 39, y: 16 }, { x: 40, y: 16 }]
    });

    buildStairRun(level, 38, 17, 4, 'south', 14, -1, 4);
    fillTrack(level, 11, 20, 31, 5, 10);
    wallRing(level, 11, 20, 31, 5, 12, {
      gaps: [{ x: 11, y: 21 }, { x: 12, y: 21 }, { x: 14, y: 24 }, { x: 15, y: 24 }]
    });

    buildStairRun(level, 13, 25, 4, 'south', 10, -1, 4);
    fillTrack(level, 13, 28, 35, 5, 6);
    wallRing(level, 13, 28, 35, 5, 8, {
      gaps: [{ x: 45, y: 32 }, { x: 46, y: 32 }, { x: 13, y: 29 }, { x: 14, y: 29 }]
    });

    buildStairRun(level, 44, 33, 4, 'south', 6, -1, 4);
    fillTrack(level, 28, 36, 28, 6, 2);
    wallRing(level, 28, 36, 28, 6, 4, {
      gaps: [{ x: 28, y: 38 }, { x: 29, y: 38 }, { x: 53, y: 38 }, { x: 54, y: 38 }]
    });

    fillTrack(level, 46, 6, 9, 9, 13);
    clearSurfaceRect(level, 49, 9, 3, 3);
    wallRing(level, 46, 6, 9, 9, 15, {
      gaps: [{ x: 46, y: 10 }, { x: 54, y: 10 }]
    });
    wallRing(level, 48, 8, 5, 5, 15, {
      gaps: [{ x: 50, y: 8 }, { x: 50, y: 12 }]
    });

    widePath(level, [{ x: 41, y: 14 }, { x: 46, y: 10 }], 13, 3);
    widePath(level, [{ x: 50, y: 12 }, { x: 50, y: 20 }], 8, 3);
    buildStairRun(level, 49, 21, 3, 'south', 8, -1, 3);
    widePath(level, [{ x: 49, y: 23 }, { x: 55, y: 23 }], 6, 3);

    fillTrack(level, 50, 22, 11, 11, 5);
    clearSurfaceRect(level, 54, 25, 3, 3);
    wallRing(level, 50, 22, 11, 11, 7, {
      gaps: [{ x: 50, y: 23 }, { x: 60, y: 29 }, { x: 55, y: 22 }]
    });

    addStaticPlatform(level, 'switchback_overhang_top', 31, 13, 17, 6, 3);
    addStaticPlatform(level, 'switchback_overhang_mid', 23, 21, 13, 8, 3);
    addStaticPlatform(level, 'switchback_overhang_low', 37, 29, 9, 7, 3);
    addStaticPlatform(level, 'switchback_overhang_goal', 53, 37, 6, 5, 3);

    addHazardRect(level, 32, 21, 2, 1, 'switchback_spikes');
    addHazardRect(level, 52, 29, 2, 1, 'switchback_spikes');
    addHazardRect(level, 53, 24, 1, 2, 'drop_guard');

    setSurface(level, 22, 14, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.28, downtime: 2.0 } });
    setSurface(level, 27, 22, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 0.4, y: 0.25, strength: 1.0 } });
    setSurface(level, 43, 30, { baseHeight: 6, shape: SHAPES.FLAT, bounce: 4.2 });
    setGoal(level, 54, 38, 0.44);

    addGraphNode(level, { id: 'start', type: 'entry', x: 6.5, y: 6.5, z: 18 });
    addGraphNode(level, { id: 'turn_a', type: 'corner', x: 22.5, y: 8.5, z: 18 });
    addGraphNode(level, { id: 'turn_b', type: 'corner', x: 39.5, y: 14.5, z: 14 });
    addGraphNode(level, { id: 'turn_c', type: 'corner', x: 14.5, y: 22.5, z: 10 });
    addGraphNode(level, { id: 'turn_d', type: 'corner', x: 45.5, y: 30.5, z: 6 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 54.5, y: 38.5, z: 2 });
    addGraphEdge(level, { from: 'start', to: 'turn_a', kind: 'switchback' });
    addGraphEdge(level, { from: 'turn_a', to: 'turn_b', kind: 'switchback' });
    addGraphEdge(level, { from: 'turn_b', to: 'turn_c', kind: 'switchback' });
    addGraphEdge(level, { from: 'turn_c', to: 'turn_d', kind: 'switchback' });
    addGraphEdge(level, { from: 'turn_d', to: 'goal', kind: 'finale' });

    return registerLevel(level);
  }

  function buildDropNetwork() {
    const level = createLevelShell({
      id: 'drop_network',
      name: 'Basin Drop Maze',
      width: 66,
      height: 50,
      killZ: -24,
      voidFloor: -12,
      start: { x: 6.5, y: 8.5 },
      reward: { presses: 12000, unlocks: ['marble_platform_complete'], claimKey: 'drop_network' },
      templates: ['braided_basin', 'drop_shafts', 'bridge_chains', 'underpasses']
    });

    fillTrack(level, 3, 5, 13, 8, 16);
    wallRing(level, 3, 5, 13, 8, 18, {
      gaps: [{ x: 15, y: 8 }, { x: 15, y: 9 }]
    });

    fillTrack(level, 20, 4, 14, 10, 15);
    clearSurfaceRect(level, 25, 7, 4, 3);
    wallRing(level, 20, 4, 14, 10, 17, {
      gaps: [{ x: 20, y: 8 }, { x: 33, y: 9 }, { x: 26, y: 4 }]
    });
    wallRing(level, 24, 6, 6, 5, 17, {
      gaps: [{ x: 26, y: 6 }, { x: 27, y: 6 }, { x: 26, y: 10 }, { x: 27, y: 10 }]
    });

    widePath(level, [{ x: 15, y: 8 }, { x: 20, y: 8 }], 16, 3);
    buildStairRun(level, 33, 9, 4, 'south', 15, -1, 3);
    fillTrack(level, 30, 13, 15, 8, 11);
    wallRing(level, 30, 13, 15, 8, 13, {
      gaps: [{ x: 30, y: 16 }, { x: 44, y: 16 }, { x: 37, y: 13 }]
    });

    fillTrack(level, 8, 19, 14, 10, 10);
    wallRing(level, 8, 19, 14, 10, 12, {
      gaps: [{ x: 21, y: 23 }, { x: 21, y: 24 }, { x: 14, y: 19 }]
    });
    clearSurfaceRect(level, 12, 22, 4, 3);

    widePath(level, [{ x: 37, y: 13 }, { x: 37, y: 8 }, { x: 46, y: 8 }], 15, 3);
    fillTrack(level, 46, 5, 15, 8, 13);
    wallRing(level, 46, 5, 15, 8, 15, {
      gaps: [{ x: 46, y: 8 }, { x: 60, y: 10 }, { x: 53, y: 12 }]
    });

    buildStairRun(level, 52, 12, 5, 'south', 13, -1, 3);
    fillTrack(level, 49, 16, 12, 11, 8);
    wallRing(level, 49, 16, 12, 11, 10, {
      gaps: [{ x: 49, y: 19 }, { x: 60, y: 21 }, { x: 54, y: 26 }]
    });
    clearSurfaceRect(level, 53, 19, 3, 3);

    buildStairRun(level, 54, 27, 4, 'south', 8, -1, 3);
    fillTrack(level, 42, 31, 19, 10, 4);
    wallRing(level, 42, 31, 19, 10, 6, {
      gaps: [{ x: 42, y: 34 }, { x: 60, y: 35 }, { x: 51, y: 31 }]
    });

    widePath(level, [{ x: 21, y: 23 }, { x: 28, y: 23 }, { x: 42, y: 34 }], 10, 3);
    buildStairRun(level, 28, 23, 3, 'east', 10, -1, 3);
    buildStairRun(level, 31, 23, 3, 'south', 8, -1, 3);
    fillTrack(level, 31, 25, 8, 5, 6);
    wallRing(level, 31, 25, 8, 5, 8, {
      gaps: [{ x: 38, y: 27 }, { x: 34, y: 25 }]
    });

    addStaticPlatform(level, 'drop_overhang_a', 34, 15, 14, 5, 3);
    addStaticPlatform(level, 'drop_overhang_b', 11, 24, 13, 6, 3);
    addStaticPlatform(level, 'drop_overhang_c', 51, 18, 12, 5, 3);
    addStaticPlatform(level, 'drop_overhang_d', 47, 34, 9, 6, 3);

    addHazardRect(level, 36, 17, 2, 1, 'maze_spikes');
    addHazardRect(level, 57, 21, 2, 1, 'maze_spikes');
    addHazardRect(level, 50, 36, 2, 1, 'goal_guard');

    setSurface(level, 51, 33, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 0.75, y: 0, strength: 1.2 } });
    setSurface(level, 55, 35, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.22, downtime: 2.2 } });
    setSurface(level, 58, 35, { baseHeight: 4, shape: SHAPES.FLAT, bounce: 4.1 });
    setGoal(level, 59, 35, 0.44);

    addGraphNode(level, { id: 'start', type: 'entry', x: 6.5, y: 8.5, z: 16 });
    addGraphNode(level, { id: 'hub_a', type: 'hub', x: 27.5, y: 8.5, z: 15 });
    addGraphNode(level, { id: 'mid_basin', type: 'route', x: 37.5, y: 17.5, z: 11 });
    addGraphNode(level, { id: 'left_shaft', type: 'route', x: 14.5, y: 23.5, z: 10 });
    addGraphNode(level, { id: 'right_shaft', type: 'route', x: 54.5, y: 21.5, z: 8 });
    addGraphNode(level, { id: 'goal_basin', type: 'goal', x: 59.5, y: 35.5, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'hub_a', kind: 'roll' });
    addGraphEdge(level, { from: 'hub_a', to: 'mid_basin', kind: 'drop' });
    addGraphEdge(level, { from: 'hub_a', to: 'left_shaft', kind: 'branch' });
    addGraphEdge(level, { from: 'mid_basin', to: 'right_shaft', kind: 'branch' });
    addGraphEdge(level, { from: 'left_shaft', to: 'goal_basin', kind: 'merge' });
    addGraphEdge(level, { from: 'right_shaft', to: 'goal_basin', kind: 'merge' });

    return registerLevel(level);
  }

  function buildMovingPlatformTransfer() {
    const level = createLevelShell({
      id: 'moving_platform_transfer',
      name: 'Tower Transfer Works',
      width: 68,
      height: 48,
      killZ: -24,
      voidFloor: -12,
      start: { x: 6.5, y: 35.5 },
      reward: { presses: 16000, unlocks: ['marble_crossover_complete'], claimKey: 'moving_platform_transfer' },
      templates: ['tower_network', 'elevators', 'moving_bridges', 'underplatform_corridors']
    });

    fillTrack(level, 3, 32, 10, 8, 12);
    wallRing(level, 3, 32, 10, 8, 14, {
      gaps: [{ x: 12, y: 35 }, { x: 12, y: 36 }]
    });

    fillTrack(level, 18, 30, 8, 8, 10);
    wallRing(level, 18, 30, 8, 8, 12, {
      gaps: [{ x: 18, y: 34 }, { x: 25, y: 34 }]
    });

    fillTrack(level, 31, 28, 8, 8, 9);
    wallRing(level, 31, 28, 8, 8, 11, {
      gaps: [{ x: 31, y: 32 }, { x: 38, y: 31 }, { x: 38, y: 32 }]
    });

    fillTrack(level, 46, 24, 9, 9, 7);
    wallRing(level, 46, 24, 9, 9, 9, {
      gaps: [{ x: 46, y: 28 }, { x: 54, y: 28 }]
    });

    fillTrack(level, 58, 21, 7, 7, 6);
    wallRing(level, 58, 21, 7, 7, 8, {
      gaps: [{ x: 58, y: 24 }, { x: 64, y: 24 }]
    });

    fillTrack(level, 23, 10, 18, 8, 4);
    clearSurfaceRect(level, 29, 12, 6, 3);
    wallRing(level, 23, 10, 18, 8, 6, {
      gaps: [{ x: 30, y: 10 }, { x: 31, y: 10 }, { x: 39, y: 14 }]
    });

    fillTrack(level, 8, 8, 10, 6, 3);
    wallRing(level, 8, 8, 10, 6, 5, {
      gaps: [{ x: 17, y: 10 }, { x: 12, y: 8 }]
    });

    widePath(level, [{ x: 12, y: 35 }, { x: 18, y: 34 }], 12, 3);
    widePath(level, [{ x: 25, y: 34 }, { x: 31, y: 32 }], 10, 3);
    widePath(level, [{ x: 38, y: 31 }, { x: 46, y: 28 }], 9, 3);
    widePath(level, [{ x: 54, y: 28 }, { x: 58, y: 24 }], 7, 3);

    addElevator(level, 'elevator_a', 14, 32, 9, 13, 3, 3, 0.7, 5.0);
    addElevator(level, 'elevator_b', 27, 24, 5, 10, 3, 3, 0.8, 4.6);
    addElevator(level, 'elevator_c', 42, 20, 4, 8, 3, 3, 0.8, 4.8);

    addMovingBridge(level, 'bridge_a', [
      { x: 12, y: 34, z: 12 },
      { x: 18, y: 34, z: 10 },
      { x: 18, y: 30, z: 10 }
    ], 3, 3, 0.55);

    addMovingBridge(level, 'bridge_b', [
      { x: 25, y: 34, z: 10 },
      { x: 31, y: 32, z: 9 },
      { x: 31, y: 28, z: 9 }
    ], 3, 3, 0.6);

    addMovingBridge(level, 'bridge_c', [
      { x: 38, y: 31, z: 9 },
      { x: 46, y: 28, z: 7 },
      { x: 46, y: 24, z: 7 }
    ], 3, 3, 0.62);

    addMovingBridge(level, 'bridge_d', [
      { x: 54, y: 28, z: 7 },
      { x: 58, y: 24, z: 6 },
      { x: 58, y: 20, z: 6 }
    ], 3, 3, 0.62);

    addStaticPlatform(level, 'overhang_a', 33, 30, 13, 6, 3);
    addStaticPlatform(level, 'overhang_b', 48, 26, 11, 5, 3);
    addStaticPlatform(level, 'overhang_c', 26, 12, 8, 7, 3);

    addTimedGate(level, 'gate_a', 37, 28, 12, 1, 3, 1.4, 1.2);
    addTimedGate(level, 'gate_b', 60, 22, 9, 1, 3, 1.5, 1.0);

    addHazardRect(level, 34, 11, 2, 1, 'transfer_spikes');
    addHazardRect(level, 11, 10, 2, 1, 'transfer_spikes');
    addHazardRect(level, 61, 24, 1, 2, 'goal_guard');

    setSurface(level, 26, 13, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 0.6, y: 0.2, strength: 1.0 } });
    setSurface(level, 15, 10, { baseHeight: 3, shape: SHAPES.FLAT, bounce: 4.0 });
    setSurface(level, 63, 24, { baseHeight: 6, shape: SHAPES.FLAT, bounce: 4.2 });
    setGoal(level, 63, 24, 0.44);

    addGraphNode(level, { id: 'start', type: 'entry', x: 6.5, y: 35.5, z: 12 });
    addGraphNode(level, { id: 'tower_a', type: 'tower', x: 22.5, y: 34.5, z: 10 });
    addGraphNode(level, { id: 'tower_b', type: 'tower', x: 35.5, y: 31.5, z: 9 });
    addGraphNode(level, { id: 'tower_c', type: 'tower', x: 50.5, y: 28.5, z: 7 });
    addGraphNode(level, { id: 'lower_lab', type: 'route', x: 31.5, y: 13.5, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 63.5, y: 24.5, z: 6 });
    addGraphEdge(level, { from: 'start', to: 'tower_a', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'tower_a', to: 'tower_b', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'tower_b', to: 'tower_c', kind: 'platform_transfer' });
    addGraphEdge(level, { from: 'tower_b', to: 'lower_lab', kind: 'elevator_drop' });
    addGraphEdge(level, { from: 'tower_c', to: 'goal', kind: 'timed_cross' });

    return registerLevel(level);
  }

  function buildCrossoverSpine() {
    const level = createLevelShell({
      id: 'crossover_spine',
      name: 'Grand Crossover',
      width: 72,
      height: 52,
      killZ: -26,
      voidFloor: -14,
      start: { x: 6.5, y: 42.5 },
      reward: { presses: 22000, unlocks: ['marble_master_complete'], claimKey: 'crossover_spine' },
      templates: ['braided_routes', 'hazard_halls', 'drop_bridges', 'endgame_arena']
    });

    fillTrack(level, 3, 39, 14, 8, 12);
    wallRing(level, 3, 39, 14, 8, 14, {
      gaps: [{ x: 16, y: 42 }, { x: 16, y: 43 }]
    });

    widePath(level, [{ x: 16, y: 42 }, { x: 26, y: 42 }], 12, 3);
    fillTrack(level, 26, 38, 12, 10, 11);
    wallRing(level, 26, 38, 12, 10, 13, {
      gaps: [{ x: 26, y: 42 }, { x: 37, y: 40 }, { x: 37, y: 41 }, { x: 31, y: 47 }]
    });

    widePath(level, [{ x: 37, y: 40 }, { x: 48, y: 34 }], 11, 3);
    widePath(level, [{ x: 37, y: 41 }, { x: 48, y: 46 }], 11, 3);

    fillTrack(level, 47, 30, 17, 8, 9);
    wallRing(level, 47, 30, 17, 8, 11, {
      gaps: [{ x: 47, y: 34 }, { x: 63, y: 34 }, { x: 55, y: 37 }]
    });

    fillTrack(level, 47, 42, 17, 7, 8);
    wallRing(level, 47, 42, 17, 7, 10, {
      gaps: [{ x: 47, y: 45 }, { x: 63, y: 45 }, { x: 56, y: 42 }]
    });

    fillTrack(level, 28, 18, 30, 10, 5);
    clearSurfaceRect(level, 39, 21, 6, 4);
    wallRing(level, 28, 18, 30, 10, 7, {
      gaps: [{ x: 42, y: 18 }, { x: 43, y: 18 }, { x: 57, y: 23 }, { x: 28, y: 23 }]
    });
    wallRing(level, 38, 20, 8, 6, 7, {
      gaps: [{ x: 41, y: 20 }, { x: 42, y: 20 }, { x: 41, y: 25 }, { x: 42, y: 25 }]
    });

    buildStairRun(level, 54, 37, 5, 'north', 9, -1, 3);
    widePath(level, [{ x: 54, y: 33 }, { x: 54, y: 27 }, { x: 57, y: 23 }], 5, 3);

    buildStairRun(level, 54, 42, 5, 'north', 8, -1, 3);
    widePath(level, [{ x: 54, y: 38 }, { x: 50, y: 30 }, { x: 42, y: 25 }], 4, 3);

    fillTrack(level, 6, 18, 15, 9, 4);
    wallRing(level, 6, 18, 15, 9, 6, {
      gaps: [{ x: 20, y: 22 }, { x: 6, y: 22 }, { x: 12, y: 18 }]
    });

    widePath(level, [{ x: 28, y: 23 }, { x: 20, y: 22 }], 5, 3);
    widePath(level, [{ x: 12, y: 18 }, { x: 12, y: 11 }, { x: 24, y: 11 }], 4, 3);
    fillTrack(level, 24, 8, 22, 8, 2);
    wallRing(level, 24, 8, 22, 8, 4, {
      gaps: [{ x: 24, y: 11 }, { x: 45, y: 11 }, { x: 34, y: 15 }]
    });

    addStaticPlatform(level, 'crossover_overhang_a', 50, 32, 12, 7, 3);
    addStaticPlatform(level, 'crossover_overhang_b', 50, 44, 11, 7, 3);
    addStaticPlatform(level, 'crossover_overhang_c', 33, 20, 8, 8, 3);
    addStaticPlatform(level, 'crossover_overhang_d', 27, 9, 6, 6, 3);

    addActor(level, {
      id: 'bar_upper',
      kind: ACTOR_KINDS.ROTATING_BAR,
      x: 56,
      y: 34,
      z: 9,
      width: 1,
      height: 1,
      topHeight: 9,
      armLength: 2.4,
      armWidth: 0.24,
      angularSpeed: 1.5,
      fatal: true
    });

    addActor(level, {
      id: 'sweeper_lower',
      kind: ACTOR_KINDS.SWEEPER,
      x: 55,
      y: 45,
      z: 8,
      width: 1,
      height: 1,
      topHeight: 8,
      armLength: 2.6,
      armWidth: 0.28,
      angularSpeed: -1.2,
      fatal: true
    });

    addTimedGate(level, 'gate_upper', 61, 33, 12, 1, 3, 1.5, 1.0);
    addTimedGate(level, 'gate_lower', 61, 44, 11, 1, 3, 1.6, 1.1);

    addHazardRect(level, 53, 35, 2, 1, 'upper_spikes');
    addHazardRect(level, 53, 46, 2, 1, 'lower_spikes');
    addHazardRect(level, 41, 22, 2, 1, 'central_spikes');

    setSurface(level, 34, 10, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 0.7, y: 0, strength: 1.0 } });
    setSurface(level, 43, 11, { baseHeight: 2, shape: SHAPES.FLAT, bounce: 4.2 });
    setSurface(level, 61, 34, { baseHeight: 9, shape: SHAPES.FLAT, crumble: { delay: 0.22, downtime: 2.2 } });
    setGoal(level, 43, 11, 0.44);

    addGraphNode(level, { id: 'start', type: 'entry', x: 6.5, y: 42.5, z: 12 });
    addGraphNode(level, { id: 'split', type: 'fork', x: 31.5, y: 42.5, z: 11 });
    addGraphNode(level, { id: 'upper', type: 'route', x: 55.5, y: 34.5, z: 9 });
    addGraphNode(level, { id: 'lower', type: 'route', x: 55.5, y: 45.5, z: 8 });
    addGraphNode(level, { id: 'core', type: 'merge', x: 42.5, y: 23.5, z: 5 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 43.5, y: 11.5, z: 2 });
    addGraphEdge(level, { from: 'start', to: 'split', kind: 'roll' });
    addGraphEdge(level, { from: 'split', to: 'upper', kind: 'branch' });
    addGraphEdge(level, { from: 'split', to: 'lower', kind: 'branch' });
    addGraphEdge(level, { from: 'upper', to: 'core', kind: 'descent' });
    addGraphEdge(level, { from: 'lower', to: 'core', kind: 'descent' });
    addGraphEdge(level, { from: 'core', to: 'goal', kind: 'finale' });

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