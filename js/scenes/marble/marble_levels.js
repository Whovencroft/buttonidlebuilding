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
    LANDING_PAD: 'landing_pad',
    FUNNEL: 'funnel'
  };

  const ACTOR_KINDS = {
    MOVING_PLATFORM: 'moving_platform',
    ELEVATOR: 'elevator',
    ROTATING_BAR: 'rotating_bar',
    SWEEPER: 'sweeper',
    TIMED_GATE: 'timed_gate',
    TUNNEL: 'tunnel'
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
        delay: patch.crumble.delay ?? 0.15,
        downtime: patch.crumble.downtime ?? 1.8,
        respawnEase: patch.crumble.respawnEase ?? 0.5
      } : null,
      failType: patch.failType ?? null,
      landingPad: !!patch.landingPad || shape === SHAPES.LANDING_PAD,
      data: patch.data ?? null,
      // Funnel-specific fields (only used when shape === FUNNEL)
      funnelCenterX: patch.funnelCenterX ?? undefined,
      funnelCenterY: patch.funnelCenterY ?? undefined,
      funnelMaxDist: patch.funnelMaxDist ?? undefined,
      _tx: patch._tx ?? undefined,
      _ty: patch._ty ?? undefined
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
      case SHAPES.FUNNEL:
        // Funnel: radial height. rise = depth of bowl (positive = slopes up from center).
        // funnelCenterU/V stored on cell give the center offset in tile-local coords.
        // Distance from center determines height: further = higher.
        return baseHeight; // base case — actual funnel height computed in getSurfaceSampleForCell
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

    // Funnel shape: radial height based on distance from funnel center (stored on cell)
    if (cell.shape === SHAPES.FUNNEL && cell.funnelCenterX !== undefined) {
      // World position of this sample point
      const wx = cell._tx + u;
      const wy = cell._ty + v;
      // Distance from funnel center in world coords
      const dx = wx - cell.funnelCenterX;
      const dy = wy - cell.funnelCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = cell.funnelMaxDist || 2;
      const t = clamp(dist / maxDist, 0, 1);
      // Bowl shape: center is at baseHeight, rim is at baseHeight + rise
      const z = cell.baseHeight + cell.rise * t;
      // Gradient: points radially outward (uphill away from center)
      const gradMag = (dist > 0.001) ? (cell.rise / maxDist) : 0;
      const gx = (dist > 0.001) ? gradMag * (dx / dist) : 0;
      const gy = (dist > 0.001) ? gradMag * (dy / dist) : 0;
      return { z, gradient: { gx, gy } };
    }

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

  // PLATFORM HITBOX FIX: sampleActorSurface now uses a generous edge tolerance
  // (0.35 instead of 0.15) so that the multi-sample support spread in
  // sampleSupportSurface can detect the platform even when the marble center
  // is near the platform edge. The old 0.15 tolerance was too tight — many of
  // the 16 sample offsets would miss the platform rect, driving the support
  // ratio below the 0.28 landing threshold and causing fall-through.
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
      // Generous edge tolerance: 0.35 tiles. This ensures that even when the
      // marble center is up to 0.35 tiles outside the platform edge, the
      // sample still registers as a hit. Combined with the multi-sample spread
      // in sampleSupportSurface, this gives reliable landing detection.
      const PLAT_EDGE_TOL = 0.35;
      if (x < rect.minX - PLAT_EDGE_TOL || x > rect.maxX + PLAT_EDGE_TOL ||
          y < rect.minY - PLAT_EDGE_TOL || y > rect.maxY + PLAT_EDGE_TOL) continue;

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

  // Direct center-point actor surface check — used by the physics engine's
  // platform sweep pass. Unlike sampleActorSurface (which is called from the
  // multi-sample spread), this checks only the marble center XY against the
  // platform rect with a very generous tolerance. Returns the highest platform
  // surface below the given maxZ, or null if none found.
  function sampleActorSurfaceDirect(level, runtime, x, y, maxZ) {
    if (!runtime?.actors) return null;
    let best = null;
    const TOL = 0.45; // generous — marble center must be within 0.45 tiles of platform edge
    for (const actor of level.actors) {
      if (actor.kind !== ACTOR_KINDS.MOVING_PLATFORM && actor.kind !== ACTOR_KINDS.ELEVATOR) continue;
      const actorState = getActorWorldState(actor, runtime);
      if (actorState.active === false) continue;
      const rect = getActorTopRect(actor, actorState);
      // Only consider platforms at or below the marble's current position
      if (rect.z > maxZ + 0.05) continue;
      if (x < rect.minX - TOL || x > rect.maxX + TOL ||
          y < rect.minY - TOL || y > rect.maxY + TOL) continue;
      if (!best || rect.z > best.z) {
        best = {
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
      state.blocking = state.active;  // renderer checks state.blocking for visibility
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
        // PLATFORM CLIP FIX: use a larger tolerance (0.22 instead of 0.04) to
        // account for the platform's own vertical movement between frames.
        // The old 0.04 tolerance caused the platform to push the marble sideways
        // instead of supporting it when the platform moved upward slightly.
        const platformDeltaZ = Math.abs(actorState.dz ?? 0);
        const supportTolerance = 0.22 + platformDeltaZ * 2.0;
        if (supportZ !== null && supportZ !== undefined && supportZ >= rect.z - supportTolerance) continue;
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
        // Block when the marble is within the gate's full vertical extent
        // Gate extends from topHeight (floor level) up by +2 (full gate slab height)
        const gateBase = actor.topHeight;
        const gateTop = gateBase + 2;
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
      z: topHeight,   // gate renders at floor height, not at z=0
      width,
      height,
      topHeight,
      closedDuration,
      openDuration
    });
  }

  // ─── Tunnel placement helper ────────────────────────────────────────────────
  //
  // placeTunnel(level, opts)
  //   Places a complete tunnel: funnel entry ramps, tunnel actor with spline
  //   path, entry trigger, and optional exit floor tile.
  //
  //   opts:
  //     id          - unique tunnel actor id (string)
  //     path        - array of {x, y, z} control points (min 2, center of tiles)
  //                   First point = entry, last point = exit
  //     speed       - marble travel speed through tunnel (default 8)
  //     radius      - tube radius (default 0.45)
  //     exitType    - 'emerge' | 'drop' | 'floor' (default 'emerge')
  //     exitVelocity - optional {x, y, z} exit velocity override
  //     funnelRadius - radius of entry funnel in tiles (default 2)
  //     entryZ      - z height of the entry floor (default: path[0].z)
  //
  function placeTunnel(level, { id, path, speed = 8, radius = 0.45, exitType = 'emerge', exitVelocity = null, funnelRadius = 2, funnelDepth = null, entryZ = null }) {
    if (!path || path.length < 2) {
      console.warn(`[LevelDesign] placeTunnel '${id}': path must have at least 2 points.`);
      return;
    }

    const entry = path[0];
    const ez = entryZ ?? entry.z;
    const entryTx = Math.floor(entry.x);
    const entryTy = Math.floor(entry.y);
    // Funnel center in world coords (center of entry tile)
    const fCenterX = entryTx + 0.5;
    const fCenterY = entryTy + 0.5;
    // Depth of funnel bowl: how much the rim rises above center
    const fDepth = funnelDepth ?? (funnelRadius * 0.5);
    const fMaxDist = funnelRadius + 0.5; // max distance from center to outer rim edge

    // Place funnel tiles using FUNNEL shape (circular bowl, no sidewalls)
    for (let dy = -funnelRadius; dy <= funnelRadius; dy++) {
      for (let dx = -funnelRadius; dx <= funnelRadius; dx++) {
        const tx = entryTx + dx;
        const ty = entryTy + dy;
        // Skip center tile (that gets the trigger)
        if (dx === 0 && dy === 0) continue;
        // Only place within circular radius (skip corners for round shape)
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > funnelRadius + 0.5) continue;
        setSurface(level, tx, ty, {
          baseHeight: ez,
          shape: SHAPES.FUNNEL,
          rise: fDepth,
          funnelCenterX: fCenterX,
          funnelCenterY: fCenterY,
          funnelMaxDist: fMaxDist,
          _tx: tx,
          _ty: ty
        });
      }
    }

    // Place entry center tile (flat, at entry z — this is where the trigger goes)
    setSurface(level, entryTx, entryTy, { baseHeight: ez, shape: SHAPES.FLAT });

    // Set tunnel_entry trigger on the entry tile
    setTrigger(level, entryTx, entryTy, { kind: 'tunnel_entry', data: { tunnelId: id } });

    // Place exit floor tile if exitType is 'floor' or 'emerge'
    if (exitType === 'floor' || exitType === 'emerge') {
      const exit = path[path.length - 1];
      const exitTx = Math.floor(exit.x);
      const exitTy = Math.floor(exit.y);
      setSurface(level, exitTx, exitTy, { baseHeight: exit.z, shape: SHAPES.FLAT, landingPad: true });
      // Also set adjacent tiles as landing pads
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const cell = getSurfaceCell(level, exitTx + dx, exitTy + dy);
          if (cell && cell.kind !== 'void') {
            setSurface(level, exitTx + dx, exitTy + dy, { ...cell, landingPad: true });
          }
        }
      }
    }

    // Add tunnel actor
    addActor(level, {
      id,
      kind: ACTOR_KINDS.TUNNEL,
      x: entry.x,
      y: entry.y,
      z: ez,
      width: 1,
      height: 1,
      tunnelPath: path,
      tunnelSpeed: speed,
      tunnelRadius: radius,
      exitType,
      exitVelocity
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
    setSurface(level, 34, 33, { baseHeight: 13, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.8 } });

    // ─ Goal corridor: east exit from upper basin → ramp down → goal (z=8 → 5)
    widePath(level, [{ x: 31, y: 13 }, { x: 38, y: 13 }], 8, 3);
    placeRamp(level, { x: 38, y: 13, dir: 'east', length: 4, width: 3, startZ: 8, endZ: 5 });
    fillTrack(level, 42, 11, 10, 7, 5);  // goal basin
    wallRing(level, 42, 11, 10, 7, 7, {
      gaps: [{ x: 42, y: 13 }, { x: 42, y: 14 }]
    });
    // Hazard near goal
    addHazardRect(level, 48, 12, 1, 2, 'goal_guard');
    setSurface(level, 44, 13, { baseHeight: 5, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -2.2, strength: 3.2 } });  // diagonal: pushes toward hazard
    setSurface(level, 46, 13, { baseHeight: 5, shape: SHAPES.FLAT, bounce: 5.2 });
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
    setSurface(level, 16, 4, { baseHeight: 18, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 2.0 } });

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
    setSurface(level, 14, 10, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: 1.8, strength: 3.0 } });  // diagonal: pushes toward wall

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
    setSurface(level, 18, 18, { baseHeight: 10, shape: SHAPES.FLAT, bounce: 5.2 });

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
    setSurface(level, 10, 34, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.2, y: 2.5, strength: 3.0 } });  // diagonal: pushes toward void edge

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
    setSurface(level, 33, 7, { baseHeight: 15, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 2.0 } });

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
    setSurface(level, 24, 22, { baseHeight: 8, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 2.2, strength: 3.2 } });  // diagonal: pushes toward wall

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
    setSurface(level, 36, 24, { baseHeight: 4, shape: SHAPES.FLAT, bounce: 5.2 });

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
    // Void-edge conveyors: push marble toward west void edge in goal basin
    setSurface(level, 12, 30, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: 2.5, strength: 3.5 } });
    setSurface(level, 16, 36, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -3.0, strength: 3.5 } });
    // Hazard near goal
    addHazardRect(level, 26, 33, 2, 1, 'goal_guard');
    setSurface(level, 22, 34, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -2.0, strength: 3.0 } });  // diagonal: pushes away from goal
    setSurface(level, 30, 34, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 2.2 } });
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
    // Void-edge conveyors in bridge corridors: push marble toward void gap
    setSurface(level, 13, 33, { baseHeight: 12, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -3.0, strength: 3.5 } });
    setSurface(level, 15, 34, { baseHeight: 12, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: 2.5, strength: 3.5 } });

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
    setSurface(level, 27, 31, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.8, strength: 3.5 } });
    setSurface(level, 30, 32, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: 3.2, strength: 3.5 } });

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
    setSurface(level, 42, 29, { baseHeight: 8, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: -2.8, strength: 3.5 } });
    setSurface(level, 45, 30, { baseHeight: 8, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: 3.0, strength: 3.5 } });

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
    setSurface(level, 57, 28, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -2.5, strength: 3.2 } });  // diagonal: pushes toward void
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
    setSurface(level, 22, 33, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: -2.2, y: 2.8, strength: 3.0 } });  // diagonal: pushes toward wall
    setSurface(level, 37, 31, { baseHeight: 8, shape: SHAPES.FLAT, bounce: 5.2 });

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
    setSurface(level, 55, 38, { baseHeight: 7, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 2.2 } });

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
    setSurface(level, 52, 25, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: -2.5, strength: 3.2 } });  // diagonal: pushes toward void

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
    setSurface(level, 12, 26, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.2, y: -2.8, strength: 3.2 } });  // diagonal: pushes away from goal
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
      width: 120,
      height: 100,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 4.5 },
      timeLimit: 60,
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

    // Main corridor east (z=14), 16×5 — wide and safe, intro to movement
    fillTrack(level, 10, 5, 16, 5, 14);
    wallRing(level, 10, 5, 16, 5, 16, {
      gaps: [
        { x: 10, y: 5 }, { x: 10, y: 6 }, { x: 10, y: 7 }, { x: 10, y: 8 }, { x: 10, y: 9 },
        { x: 25, y: 5 }, { x: 25, y: 6 }, { x: 25, y: 7 }, { x: 25, y: 8 }, { x: 25, y: 9 }
      ]
    });

    // Wide ramp south (z=14→10), 6 tiles × 5 wide
    placeRamp(level, { x: 10, y: 10, dir: 'south', length: 6, width: 5, startZ: 14, endZ: 10 });

    // Mid platform (z=10), 16×8 — gentle crumble intro (long delay, safe to learn)
    fillTrack(level, 10, 16, 16, 8, 10);
    // Gentle crumble tiles — 0.8s delay, long downtime so players can see them reform
    for (let cx = 14; cx < 22; cx++) {
      setSurface(level, cx, 18, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.8, downtime: 3.5 } });
      setSurface(level, cx, 19, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.8, downtime: 3.5 } });
    }
    wallRing(level, 10, 16, 16, 8, 12, {
      gaps: [
        { x: 10, y: 16 }, { x: 11, y: 16 }, { x: 12, y: 16 }, { x: 13, y: 16 }, { x: 14, y: 16 },
        { x: 25, y: 18 }, { x: 25, y: 19 }, { x: 25, y: 20 }, { x: 25, y: 21 }
      ]
    });

    // Ramp east (z=10→6), 6 tiles × 4 wide
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

    // === SECTION 2: Fork junction — teaches path choice ===
    // Open east wall of goal basin to continue
    // Fork junction (z=6), 10×8
    fillTrack(level, 40, 16, 10, 8, 6);
    wallRing(level, 40, 16, 10, 8, 8, {
      gaps: [
        { x: 40, y: 18 }, { x: 40, y: 19 }, { x: 40, y: 20 }, { x: 40, y: 21 },
        { x: 49, y: 14 }, { x: 49, y: 15 }, { x: 49, y: 16 }, { x: 49, y: 17 }, { x: 49, y: 18 },
        { x: 49, y: 20 }, { x: 49, y: 21 }, { x: 49, y: 22 }, { x: 49, y: 23 }, { x: 49, y: 24 }
      ]
    });
    setSurface(level, 39, 18, { baseHeight: 6, shape: SHAPES.FLAT });
    setSurface(level, 39, 19, { baseHeight: 6, shape: SHAPES.FLAT });
    setSurface(level, 39, 20, { baseHeight: 6, shape: SHAPES.FLAT });
    setSurface(level, 39, 21, { baseHeight: 6, shape: SHAPES.FLAT });

    // Path A (north): wide conveyor corridor — teaches conveyor mechanic
    fillTrack(level, 50, 14, 18, 6, 6);
    for (let cx = 52; cx < 66; cx++) {
      for (let cy = 14; cy < 20; cy++) {
        // Diagonal conveyor: pushes marble toward south void edge
        const cxOff = (cx % 3) - 1;  // -1, 0, or 1 based on column
        setSurface(level, cx, cy, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: 2.0 + cxOff * 0.4, y: -1.8, strength: 2.8 } });
      }
    }
    // Void-edge conveyors: north wall of path A corridor pushes marble toward south void
    setSurface(level, 53, 14, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: -3.0, strength: 3.5 } });
    setSurface(level, 58, 14, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -3.2, strength: 3.5 } });
    setSurface(level, 63, 14, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: -2.8, strength: 3.5 } });
    wallRing(level, 50, 14, 18, 6, 8, {
      gaps: [
        { x: 50, y: 14 }, { x: 50, y: 15 }, { x: 50, y: 16 }, { x: 50, y: 17 }, { x: 50, y: 18 }, { x: 50, y: 19 },
        { x: 67, y: 14 }, { x: 67, y: 15 }, { x: 67, y: 16 }, { x: 67, y: 17 }, { x: 67, y: 18 }, { x: 67, y: 19 }
      ]
    });
    placeRamp(level, { x: 68, y: 14, dir: 'east', length: 6, width: 6, startZ: 6, endZ: 2 });

    // Path B (south): wide crumble corridor — teaches crumble mechanic (gentle 0.7s delay)
    fillTrack(level, 50, 20, 18, 6, 6);
    for (let cx = 52; cx < 66; cx++) {
      for (let cy = 20; cy < 26; cy++) {
        setSurface(level, cx, cy, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.7, downtime: 3.5 } });
      }
    }
    wallRing(level, 50, 20, 18, 6, 8, {
      gaps: [
        { x: 50, y: 20 }, { x: 50, y: 21 }, { x: 50, y: 22 }, { x: 50, y: 23 }, { x: 50, y: 24 }, { x: 50, y: 25 },
        { x: 67, y: 20 }, { x: 67, y: 21 }, { x: 67, y: 22 }, { x: 67, y: 23 }, { x: 67, y: 24 }, { x: 67, y: 25 }
      ]
    });
    placeRamp(level, { x: 68, y: 20, dir: 'east', length: 6, width: 6, startZ: 6, endZ: 2 });

    // === SECTION 3: Merge landing — both paths rejoin ===
    fillTrack(level, 74, 12, 14, 16, 2);
    // Diagonal conveyor line A: (74,19) → (81,26)
    setSurface(level, 74, 19, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -2.5, strength: 3.0 } });
    setSurface(level, 75, 20, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.2, y: 3.0, strength: 3.0 } });
    setSurface(level, 76, 21, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.8, strength: 3.0 } });
    setSurface(level, 77, 22, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: 2.8, strength: 3.0 } });
    setSurface(level, 78, 23, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -3.0, strength: 3.0 } });
    setSurface(level, 79, 24, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: 2.5, strength: 3.0 } });
    setSurface(level, 80, 25, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -2.2, strength: 3.0 } });
    setSurface(level, 81, 26, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: 3.2, strength: 3.0 } });
    // Diagonal conveyor line B: (75,13) → (85,23)
    setSurface(level, 75, 13, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: -2.5, strength: 3.0 } });
    setSurface(level, 76, 14, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 3.0, strength: 3.0 } });
    setSurface(level, 77, 15, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -2.8, strength: 3.0 } });
    setSurface(level, 78, 16, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: 2.5, strength: 3.0 } });
    setSurface(level, 79, 17, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -3.2, strength: 3.0 } });
    setSurface(level, 80, 18, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: 2.8, strength: 3.0 } });
    setSurface(level, 81, 19, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.5, strength: 3.0 } });
    setSurface(level, 82, 20, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 3.2, strength: 3.0 } });
    setSurface(level, 83, 21, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -2.5, strength: 3.0 } });
    setSurface(level, 84, 22, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: 2.8, strength: 3.0 } });
    setSurface(level, 85, 23, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -3.0, strength: 3.0 } });
    // Diagonal conveyor line C: (80,13) → (88,21)
    setSurface(level, 80, 13, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 3.0, strength: 3.0 } });
    setSurface(level, 81, 14, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.5, strength: 3.0 } });
    setSurface(level, 82, 15, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: 2.8, strength: 3.0 } });
    setSurface(level, 83, 16, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -3.0, strength: 3.0 } });
    setSurface(level, 84, 17, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: 2.5, strength: 3.0 } });
    setSurface(level, 85, 18, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -2.8, strength: 3.0 } });
    setSurface(level, 86, 19, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 3.2, strength: 3.0 } });
    setSurface(level, 87, 20, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.8, strength: 3.0 } });
    setSurface(level, 88, 21, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: 2.5, strength: 3.0 } });
    // Pillars: single tiles raised to z=4 (floor z=2 + 2)
    setSurface(level, 77, 26, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 79, 26, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 81, 26, { baseHeight: 4, shape: SHAPES.FLAT });
    setSurface(level, 83, 26, { baseHeight: 4, shape: SHAPES.FLAT });
    // Bounce tile line: x=74..85, y=24, z=2
    for (let bx = 74; bx <= 85; bx++) {
      setSurface(level, bx, 24, { baseHeight: 2, shape: SHAPES.FLAT, bounce: 5.2 });
    }
    wallRing(level, 74, 12, 14, 16, 4, {
      gaps: [
        // West entry from path A ramp (y:14-19)
        { x: 74, y: 14 }, { x: 74, y: 15 }, { x: 74, y: 16 }, { x: 74, y: 17 }, { x: 74, y: 18 }, { x: 74, y: 19 },
        // West entry from path B ramp (y:20-25)
        { x: 74, y: 20 }, { x: 74, y: 21 }, { x: 74, y: 22 }, { x: 74, y: 23 }, { x: 74, y: 24 }, { x: 74, y: 25 },
        // East exit to platform approach (y:16-21)
        { x: 87, y: 16 }, { x: 87, y: 17 }, { x: 87, y: 18 }, { x: 87, y: 19 }, { x: 87, y: 20 }, { x: 87, y: 21 },
        // South exit to descent ramp (y:28 = south wall of 74,12,14,16 → y=12+16=28)
        { x: 74, y: 27 }, { x: 75, y: 27 }, { x: 76, y: 27 }, { x: 77, y: 27 },
        { x: 78, y: 27 }, { x: 79, y: 27 }, { x: 80, y: 27 }, { x: 81, y: 27 },
        { x: 82, y: 27 }, { x: 83, y: 27 }, { x: 84, y: 27 }, { x: 85, y: 27 }, { x: 86, y: 27 }, { x: 87, y: 27 }
      ]
    });

    // Bounce tile line: x=74..87, y=27, z=2
    for (let bx = 74; bx <= 87; bx++) {
      setSurface(level, bx, 27, { baseHeight: 2, shape: SHAPES.FLAT, bounce: 5.2 });
    }

    // === SECTION 4: Moving platform bridge — teaches platform mechanic ===
    // West approach (z=2), 8×6
    fillTrack(level, 88, 16, 8, 6, 2);
    wallRing(level, 88, 16, 8, 6, 4, {
      gaps: [
        { x: 88, y: 16 }, { x: 88, y: 17 }, { x: 88, y: 18 }, { x: 88, y: 19 }, { x: 88, y: 20 }, { x: 88, y: 21 },
        { x: 95, y: 17 }, { x: 95, y: 18 }, { x: 95, y: 19 }, { x: 95, y: 20 }
      ]
    });
    // Void gap x:96-103 — 8 tiles wide, must use the platform
    // Moving platform — slow and wide so easy to catch as a tutorial
    addMovingBridge(level, 'bridge_l1_tutorial', [
      { x: 96, y: 19, z: 2 },
      { x: 100, y: 19, z: 2 }
    ], 6, 2, 0.22);
    // East landing (z=2), 8×6
    fillTrack(level, 104, 16, 8, 6, 2);
    wallRing(level, 104, 16, 8, 6, 4, {
      gaps: [
        // West entry from platform
        { x: 104, y: 19 }, { x: 104, y: 20 },
        // East wall — open so marble can continue east if needed
        { x: 111, y: 17 }, { x: 111, y: 18 }, { x: 111, y: 19 }, { x: 111, y: 20 },
        // South exit to descent ramp (y=22 = south wall of 104,16,8,6 → y=16+6=22)
        { x: 104, y: 21 }, { x: 105, y: 21 }, { x: 106, y: 21 }, { x: 107, y: 21 },
        { x: 108, y: 21 }, { x: 109, y: 21 }, { x: 110, y: 21 }, { x: 111, y: 21 }
      ]
    });

    // === SECTION 5: Final descent and goal ===
    // Ramp south from merge area (z=2→-2), 6 tiles long × 14 wide
    placeRamp(level, { x: 74, y: 28, dir: 'south', length: 6, width: 14, startZ: 2, endZ: -2 });
    // Remove chunk: x:79-80, y:28-34 (void gap in the ramp + basin north edge)
    clearSurfaceRect(level, 79, 28, 2, 7);
    // South corridor from east landing (x:104-111) down to goal basin
    // This fixes the dead-end: after crossing the platform, marble can go south
    placeRamp(level, { x: 104, y: 22, dir: 'south', length: 6, width: 8, startZ: 2, endZ: -2 });
    // Connector strip: bridge the 6-tile void gap (y:28-33) between the east landing ramp
    // bottom (y:27 z=-2) and the goal basin north wall (y:34). Without this the ramp tiles
    // at y:22-27 are unreachable islands floating above the basin.
    fillTrack(level, 104, 28, 8, 6, -2);
    // Goal basin (z=-2), 38×12 — wide enough to catch marble from both approaches
    fillTrack(level, 74, 34, 38, 12, -2);
    wallRing(level, 74, 34, 38, 12, 0, {
      gaps: [
        // North wall: both ramp exits open into basin
        { x: 74, y: 34 }, { x: 75, y: 34 }, { x: 76, y: 34 }, { x: 77, y: 34 },
        { x: 78, y: 34 }, { x: 79, y: 34 }, { x: 80, y: 34 }, { x: 81, y: 34 },
        { x: 82, y: 34 }, { x: 83, y: 34 }, { x: 84, y: 34 }, { x: 85, y: 34 },
        { x: 86, y: 34 }, { x: 87, y: 34 },
        { x: 104, y: 34 }, { x: 105, y: 34 }, { x: 106, y: 34 }, { x: 107, y: 34 },
        { x: 108, y: 34 }, { x: 109, y: 34 }, { x: 110, y: 34 }, { x: 111, y: 34 }
      ]
    });
    // === SECTION 6: Extended finale — timed gate + sweeper corridor ===
    // Open south wall of goal basin to continue
    for (let cx = 78; cx < 100; cx++) {
      setSurface(level, cx, 45, { baseHeight: -2, shape: SHAPES.FLAT });
    }
    // Narrow corridor (z=-2), 38×6 — timed gate + sweeper + crumble
    fillTrack(level, 74, 46, 38, 6, -2);
    // Crumble section mid-corridor
    for (let cx = 82; cx < 96; cx++) {
      for (let cy = 47; cy < 51; cy++) {
        setSurface(level, cx, cy, { baseHeight: -2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Remove 3×3 void square centered at 83/39
    clearSurfaceRect(level, 82, 38, 3, 3);
    // Timed gate blocking the corridor (spans y:46-50)
    addTimedGate(level, 'gate_s1_ext', 103, 46, -2, 1, 5, 1.8, 1.2);
    // Sweeper guarding the exit
    addActor(level, {
      id: 'sweeper_s1_ext', kind: ACTOR_KINDS.SWEEPER,
      x: 100, y: 49, z: -2, topHeight: -2,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 1.6, fatal: true
    });
    // Void-edge conveyors — push marble toward north/south void edges
    setSurface(level, 78, 46, { baseHeight: -2, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -3.2, strength: 3.5 } });
    setSurface(level, 90, 51, { baseHeight: -2, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 3.0, strength: 3.5 } });
    setSurface(level, 106, 46, { baseHeight: -2, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.8, strength: 3.5 } });
    wallRing(level, 74, 46, 38, 6, 0, {
      gaps: [
        // Full north wall open so marble from basin (y:34-45) can enter corridor
        { x: 74, y: 46 }, { x: 75, y: 46 }, { x: 76, y: 46 }, { x: 77, y: 46 },
        { x: 78, y: 46 }, { x: 79, y: 46 }, { x: 80, y: 46 }, { x: 81, y: 46 },
        { x: 82, y: 46 }, { x: 83, y: 46 }, { x: 84, y: 46 }, { x: 85, y: 46 },
        { x: 86, y: 46 }, { x: 87, y: 46 }, { x: 88, y: 46 }, { x: 89, y: 46 },
        { x: 90, y: 46 }, { x: 91, y: 46 }, { x: 92, y: 46 }, { x: 93, y: 46 },
        { x: 94, y: 46 }, { x: 95, y: 46 }, { x: 96, y: 46 }, { x: 97, y: 46 },
        { x: 98, y: 46 }, { x: 99, y: 46 }, { x: 100, y: 46 }, { x: 101, y: 46 },
        { x: 102, y: 46 }, { x: 103, y: 46 }, { x: 104, y: 46 }, { x: 105, y: 46 },
        { x: 106, y: 46 }, { x: 107, y: 46 }, { x: 108, y: 46 }, { x: 109, y: 46 },
        { x: 110, y: 46 }, { x: 111, y: 46 },
        // East exit to final goal basin
        { x: 111, y: 47 }, { x: 111, y: 48 }, { x: 111, y: 49 }, { x: 111, y: 50 }, { x: 111, y: 51 }
      ]
    });
    // Final goal basin (z=-2), 10×10 — deeper and harder to reach
    fillTrack(level, 112, 45, 10, 10, -2);
    wallRing(level, 112, 45, 10, 10, 0, {
      gaps: [{ x: 112, y: 47 }, { x: 112, y: 48 }, { x: 112, y: 49 }, { x: 112, y: 50 }, { x: 112, y: 51 }]
    });
    setGoal(level, 117, 50, 0.55);

    // === Test tunnel: shortcut centered at 78/20/2 for testing ===
    placeTunnel(level, {
      id: 'tunnel_s1_shortcut',
      path: [
        { x: 78.5, y: 20.5, z: 2 },    // Entry: centered at 78/20 at floor level
        { x: 78.5, y: 23.5, z: 0 },     // Dip down
        { x: 78.5, y: 27.5, z: -2 },    // Under the floor
        { x: 82.5, y: 33.5, z: -2 },    // Curve east
        { x: 88.5, y: 40.5, z: -2 }     // Exit in the goal basin
      ],
      speed: 7,
      exitType: 'emerge',
      funnelRadius: 1
    });

    addGraphNode(level, { id: 'start',    type: 'entry', x: 4.5,   y: 4.5,  z: 14 });
    addGraphNode(level, { id: 'mid',      type: 'hub',   x: 18.5,  y: 20.5, z: 10 });
    addGraphNode(level, { id: 'fork',     type: 'fork',  x: 44.5,  y: 20.5, z: 6  });
    addGraphNode(level, { id: 'path_a',   type: 'route', x: 58.5,  y: 17.5, z: 6  });
    addGraphNode(level, { id: 'path_b',   type: 'route', x: 58.5,  y: 23.5, z: 6  });
    addGraphNode(level, { id: 'merge',    type: 'hub',   x: 80.5,  y: 20.5, z: 2  });
    addGraphNode(level, { id: 'platform', type: 'route', x: 107.5, y: 19.5, z: 2  });
    addGraphNode(level, { id: 'basin',    type: 'hub',   x: 90.5,  y: 40.5, z: -2 });
    addGraphNode(level, { id: 'ext',      type: 'route', x: 92.5,  y: 49.5, z: -2 });
    addGraphNode(level, { id: 'goal',     type: 'goal',  x: 117.5, y: 50.5, z: -2 });
    addGraphEdge(level, { from: 'start',    to: 'mid',      kind: 'roll'    });
    addGraphEdge(level, { from: 'mid',      to: 'fork',     kind: 'descent' });
    addGraphEdge(level, { from: 'fork',     to: 'path_a',   kind: 'roll',    tag: 'conveyor' });
    addGraphEdge(level, { from: 'fork',     to: 'path_b',   kind: 'roll',    tag: 'crumble'  });
    addGraphEdge(level, { from: 'path_a',   to: 'merge',    kind: 'descent' });
    addGraphEdge(level, { from: 'path_b',   to: 'merge',    kind: 'descent' });
    addGraphEdge(level, { from: 'merge',    to: 'basin',    kind: 'descent' });
    addGraphEdge(level, { from: 'merge',    to: 'platform', kind: 'roll',    tag: 'platform' });
    addGraphEdge(level, { from: 'platform', to: 'basin',    kind: 'descent' });
    addGraphEdge(level, { from: 'basin',    to: 'ext',      kind: 'roll'    });
    addGraphEdge(level, { from: 'ext',      to: 'goal',     kind: 'timed_cross' });
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
      width: 110,
      height: 60,
      killZ: -20,
      voidFloor: -10,
      start: { x: 4.5, y: 4.5 },
      timeLimit: 40,
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

    // Terrace A (z=12), 14×10 — fork + sweeper + hazard strip
    fillTrack(level, 24, 4, 14, 10, 12);
    // Sweeper guarding the fork
    addActor(level, {
      id: 'sweeper_l2_a', kind: ACTOR_KINDS.SWEEPER,
      x: 31, y: 8, z: 12, topHeight: 12,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addHazardRect(level, 26, 7, 2, 3, 'l2_terrace_a_spikes');
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

    // Terrace B (z=8), 18×10 — paths rejoin + crumble + timed gate
    fillTrack(level, 24, 28, 18, 10, 8);
    fillTrack(level, 28, 8, 5, 20, 8);  // vertical connector from north path
    // Crumble section on approach to ramp
    for (let cx = 28; cx < 36; cx++) {
      setSurface(level, cx, 31, { baseHeight: 8, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 32, { baseHeight: 8, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    }
    // Timed gate moved to x=36, spanning y:29-35 at z=8
    addTimedGate(level, 'gate_l2_b', 36, 29, 8, 1, 7, 1.6, 1.2);
    // Crumble tiles filling x:34-35, y:29-35
    for (let cx = 34; cx <= 35; cx++) {
      for (let cy = 29; cy <= 35; cy++) {
        setSurface(level, cx, cy, { baseHeight: 8, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
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
        // North wall: include x:60 to match crumble bridge room south wall gap
        { x: 56, y: 29 }, { x: 57, y: 29 }, { x: 58, y: 29 }, { x: 59, y: 29 }, { x: 60, y: 29 },
        // South wall: opened at x:55-57 (wall removed, replaced with timed gate)
        { x: 55, y: 38 }, { x: 56, y: 38 }, { x: 57, y: 38 }, { x: 58, y: 38 }, { x: 59, y: 38 }
      ]
    });
    // Timed gate at south wall opening (55/37 to 57/37), z=4, 2s on 1s off
    addTimedGate(level, 'gate_tc_wall', 55, 37, 4, 3, 1, 2.0, 1.0);

    // Path A (north): crumble-tile bridge, narrow, fast
    fillTrack(level, 56, 24, 5, 6, 4);
    for (let cx = 57; cx < 60; cx++) {
      for (let cy = 25; cy < 29; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    wallRing(level, 56, 24, 5, 6, 6, {
      gaps: [
        { x: 56, y: 29 }, { x: 57, y: 29 }, { x: 58, y: 29 }, { x: 59, y: 29 }, { x: 60, y: 29 },
        { x: 60, y: 24 }, { x: 60, y: 25 }, { x: 60, y: 26 }, { x: 60, y: 27 }, { x: 60, y: 28 }, { x: 60, y: 29 }
      ]
    });
    // Bridge the 1-tile void at x:60 between the crumble bridge room (x:56-59) and the ramp (x:61-65)
    fillTrack(level, 60, 24, 1, 6, 4);
    placeRamp(level, { x: 61, y: 24, dir: 'east', length: 5, width: 6, startZ: 4, endZ: 0 });

    // Path B (south): long detour with timed gate, safe
    fillTrack(level, 56, 39, 5, 10, 4);
    // gate_tc_south removed (replaced by gate_tc_wall at south wall opening)
    wallRing(level, 56, 39, 5, 10, 6, {
      gaps: [
        { x: 56, y: 38 }, { x: 57, y: 38 }, { x: 58, y: 38 }, { x: 59, y: 38 }, { x: 60, y: 38 },
        // North wall gaps at 56/39, 57/39, 58/39 (wall removed per user request)
        { x: 56, y: 39 }, { x: 57, y: 39 }, { x: 58, y: 39 },
        { x: 60, y: 39 }, { x: 60, y: 40 }, { x: 60, y: 41 }, { x: 60, y: 42 }, { x: 60, y: 43 }, { x: 60, y: 44 }, { x: 60, y: 45 }, { x: 60, y: 46 }, { x: 60, y: 47 }, { x: 60, y: 48 }
      ]
    });
    // Ramp removed (61/39 to 65/48). Extend floor terrain from x:60 to x:62 at z=4
    fillTrack(level, 60, 39, 3, 10, 4);

    // Lower goal basin (z=0), 12×26 — both paths converge
    fillTrack(level, 66, 22, 12, 26, 0);
    wallRing(level, 66, 22, 12, 26, 2, {
      gaps: [
        { x: 66, y: 24 }, { x: 66, y: 25 }, { x: 66, y: 26 }, { x: 66, y: 27 }, { x: 66, y: 28 }, { x: 66, y: 29 },
        { x: 66, y: 39 }, { x: 66, y: 40 }, { x: 66, y: 41 }, { x: 66, y: 42 }, { x: 66, y: 43 }, { x: 66, y: 44 }, { x: 66, y: 45 }, { x: 66, y: 46 }, { x: 66, y: 47 }, { x: 66, y: 48 }
      ]
    });
    // Pillars along x=66, y:38-48 (raised to z=2)
    for (let py = 38; py <= 48; py++) {
      setSurface(level, 66, py, { baseHeight: 2, shape: SHAPES.FLAT });
    }
    // Sweepers (size 3 = armLength 3.0)
    addActor(level, {
      id: 'sweeper_l2_lower_a', kind: ACTOR_KINDS.SWEEPER,
      x: 70, y: 42, z: 0, topHeight: 0,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    addActor(level, {
      id: 'sweeper_l2_lower_b', kind: ACTOR_KINDS.SWEEPER,
      x: 70, y: 27, z: 0, topHeight: 0,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    addActor(level, {
      id: 'sweeper_l2_lower_c', kind: ACTOR_KINDS.SWEEPER,
      x: 75, y: 33, z: 0, topHeight: 0,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    // Random push tiles — unpredictable direction changes (diagonal only)
    // NOTE: setSurface at (22,18) z=12 removed — was an orphaned tile floating in void
    // NOTE: setSurface at (38,26) z=8 removed — was an orphaned tile floating in void (no platform under it)
    setSurface(level, 55, 34, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 2.2, y: 2.2, strength: 3.0 } });

    // === EXTENSION: Terrace D — corridors + sweeper + new goal ===
    // Open east wall of lower goal basin to continue
    for (let cy = 24; cy < 48; cy++) {
      setSurface(level, 77, cy, { baseHeight: 0, shape: SHAPES.FLAT });
    }
    // Terrace D approach (z=0), 4×26
    fillTrack(level, 78, 22, 4, 26, 0);
    wallRing(level, 78, 22, 4, 26, 2, {
      gaps: [
        { x: 78, y: 24 }, { x: 78, y: 25 }, { x: 78, y: 26 }, { x: 78, y: 27 },
        { x: 78, y: 28 }, { x: 78, y: 29 }, { x: 78, y: 30 }, { x: 78, y: 31 },
        { x: 78, y: 32 }, { x: 78, y: 33 }, { x: 78, y: 34 }, { x: 78, y: 35 },
        { x: 78, y: 36 }, { x: 78, y: 37 }, { x: 78, y: 38 }, { x: 78, y: 39 },
        { x: 78, y: 40 }, { x: 78, y: 41 }, { x: 78, y: 42 }, { x: 78, y: 43 },
        { x: 78, y: 44 }, { x: 78, y: 45 }, { x: 78, y: 46 }, { x: 78, y: 47 },
        { x: 81, y: 27 }, { x: 81, y: 28 },
        { x: 81, y: 40 }, { x: 81, y: 41 }
      ]
    });

    // Void-edge conveyors on Terrace D — push toward east void
    setSurface(level, 79, 22, { baseHeight: 0, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.5, strength: 3.5 } });
    setSurface(level, 80, 47, { baseHeight: 0, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: 3.2, strength: 3.5 } });
    // Drop floor x:82-95 by -4 (from z=0 to z=-4)
    for (let dx = 82; dx <= 95; dx++) {
      for (let dy = 22; dy <= 47; dy++) {
        setSurface(level, dx, dy, { baseHeight: -4, shape: SHAPES.FLAT });
      }
    }
    // Drop floor x:96-104 by -8 (from z=0 to z=-8)
    for (let dx = 96; dx <= 104; dx++) {
      for (let dy = 22; dy <= 47; dy++) {
        setSurface(level, dx, dy, { baseHeight: -8, shape: SHAPES.FLAT });
      }
    }

    // --- Corridors (placed AFTER floor drops so they overwrite correctly) ---
    // North corridor: 2-tile wide (y:27-28) from x:82 to x:93, z=-4
    // Pillar line on north side (y:26)
    for (let px = 82; px <= 93; px++) {
      setSurface(level, px, 26, { baseHeight: -2, shape: SHAPES.FLAT });
    }
    // Corridor floor (y:27-28)
    for (let cx = 82; cx <= 93; cx++) {
      setSurface(level, cx, 27, { baseHeight: -4, shape: SHAPES.FLAT });
      setSurface(level, cx, 28, { baseHeight: -4, shape: SHAPES.FLAT });
    }
    // Pillar line on south side (y:29)
    for (let px = 82; px <= 93; px++) {
      setSurface(level, px, 29, { baseHeight: -2, shape: SHAPES.FLAT });
    }
    // Void between corridors (y:30-39) — clear to void
    for (let vx = 82; vx <= 93; vx++) {
      for (let vy = 30; vy <= 39; vy++) {
        clearSurface(level, vx, vy);
      }
    }
    // South corridor: 2-tile wide (y:40-41) from x:82 to x:93, z=-4
    // Pillar line on north side (y:39)
    for (let px = 82; px <= 93; px++) {
      setSurface(level, px, 39, { baseHeight: -2, shape: SHAPES.FLAT });
    }
    // Corridor floor (y:40-41)
    for (let cx = 82; cx <= 93; cx++) {
      setSurface(level, cx, 40, { baseHeight: -4, shape: SHAPES.FLAT });
      setSurface(level, cx, 41, { baseHeight: -4, shape: SHAPES.FLAT });
    }
    // Pillar line on south side (y:42)
    for (let px = 82; px <= 93; px++) {
      setSurface(level, px, 42, { baseHeight: -2, shape: SHAPES.FLAT });
    }
    // Sweeper at 88/40/-4 (kept)
    addActor(level, {
      id: 'sweeper_l2_ext', kind: ACTOR_KINDS.SWEEPER,
      x: 88, y: 40, z: -4, topHeight: -4,
      width: 1, height: 1, armLength: 1.8, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    // Staggered crumble tiles between 88/27/-4 and 93/27/-4
    for (let cx = 88; cx <= 93; cx++) {
      if (cx % 2 === 0) {
        setSurface(level, cx, 27, { baseHeight: -4, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Goal at 101/34/0 with pyramid staircase descending outward (1-unit steps)
    setSurface(level, 101, 34, { baseHeight: 0, shape: SHAPES.FLAT });
    // Ring 1: adjacent tiles at z=-1
    for (let rx = 100; rx <= 102; rx++) {
      for (let ry = 33; ry <= 35; ry++) {
        if (rx === 101 && ry === 34) continue;
        setSurface(level, rx, ry, { baseHeight: -1, shape: SHAPES.FLAT });
      }
    }
    // Ring 2: z=-2
    for (let rx = 99; rx <= 103; rx++) {
      for (let ry = 32; ry <= 36; ry++) {
        if (rx >= 100 && rx <= 102 && ry >= 33 && ry <= 35) continue;
        setSurface(level, rx, ry, { baseHeight: -2, shape: SHAPES.FLAT });
      }
    }
    // Ring 3: z=-3
    for (let rx = 98; rx <= 104; rx++) {
      for (let ry = 31; ry <= 37; ry++) {
        if (rx >= 99 && rx <= 103 && ry >= 32 && ry <= 36) continue;
        if (rx > 104 || ry > 47 || ry < 22) continue;
        setSurface(level, rx, ry, { baseHeight: -3, shape: SHAPES.FLAT });
      }
    }
    // Ring 4: z=-4
    for (let rx = 97; rx <= 105; rx++) {
      for (let ry = 30; ry <= 38; ry++) {
        if (rx >= 98 && rx <= 104 && ry >= 31 && ry <= 37) continue;
        if (rx > 104 || ry > 47 || ry < 22) continue;
        setSurface(level, rx, ry, { baseHeight: -4, shape: SHAPES.FLAT });
      }
    }
    // Ring 5: z=-5
    for (let rx = 96; rx <= 106; rx++) {
      for (let ry = 29; ry <= 39; ry++) {
        if (rx >= 97 && rx <= 105 && ry >= 30 && ry <= 38) continue;
        if (rx > 104 || ry > 47 || ry < 22) continue;
        setSurface(level, rx, ry, { baseHeight: -5, shape: SHAPES.FLAT });
      }
    }
    // Ring 6: z=-6
    for (let rx = 95; rx <= 107; rx++) {
      for (let ry = 28; ry <= 40; ry++) {
        if (rx >= 96 && rx <= 106 && ry >= 29 && ry <= 39) continue;
        if (rx > 104 || ry > 47 || ry < 22) continue;
        setSurface(level, rx, ry, { baseHeight: -6, shape: SHAPES.FLAT });
      }
    }
    // Ring 7: z=-7
    for (let rx = 94; rx <= 108; rx++) {
      for (let ry = 27; ry <= 41; ry++) {
        if (rx >= 95 && rx <= 107 && ry >= 28 && ry <= 40) continue;
        if (rx > 104 || ry > 47 || ry < 22) continue;
        setSurface(level, rx, ry, { baseHeight: -7, shape: SHAPES.FLAT });
      }
    }
    // Ring 8: z=-8 (outermost, already set by the floor drops above)
    setGoal(level, 101, 34, 0.44);

    addGraphNode(level, { id: 'start',    type: 'entry', x: 4.5,  y: 4.5,  z: 16 });
    addGraphNode(level, { id: 'terraceA', type: 'fork',  x: 31.5, y: 9.5,  z: 12 });
    addGraphNode(level, { id: 'terraceB', type: 'merge', x: 31.5, y: 33.5, z: 8  });
    addGraphNode(level, { id: 'terraceC', type: 'fork',  x: 57.5, y: 33.5, z: 4  });
    addGraphNode(level, { id: 'path_a',   type: 'route', x: 58.5, y: 26.5, z: 4  });
    addGraphNode(level, { id: 'path_b',   type: 'route', x: 58.5, y: 43.5, z: 4  });
    addGraphNode(level, { id: 'terraceD', type: 'fork',  x: 79.5, y: 34.5, z: 0  });
    addGraphNode(level, { id: 'td_north', type: 'route', x: 88.5, y: 27.5, z: 0  });
    addGraphNode(level, { id: 'td_south', type: 'route', x: 88.5, y: 40.5, z: 0  });
    addGraphNode(level, { id: 'goal',     type: 'goal',  x: 101.5, y: 34.5, z: 0 });
    addGraphEdge(level, { from: 'start',    to: 'terraceA', kind: 'descent'    });
    addGraphEdge(level, { from: 'terraceA', to: 'terraceB', kind: 'roll',       tag: 'north_path' });
    addGraphEdge(level, { from: 'terraceA', to: 'terraceB', kind: 'descent',    tag: 'south_path' });
    addGraphEdge(level, { from: 'terraceB', to: 'terraceC', kind: 'descent'    });
    addGraphEdge(level, { from: 'terraceC', to: 'path_a',   kind: 'crumble'    });
    addGraphEdge(level, { from: 'terraceC', to: 'path_b',   kind: 'timed_cross'});
    addGraphEdge(level, { from: 'path_a',   to: 'terraceD', kind: 'descent'    });
    addGraphEdge(level, { from: 'path_b',   to: 'terraceD', kind: 'descent'    });
    addGraphEdge(level, { from: 'terraceD', to: 'td_north', kind: 'crumble'    });
    addGraphEdge(level, { from: 'terraceD', to: 'td_south', kind: 'hazard_lane'});
    addGraphEdge(level, { from: 'td_north', to: 'goal',     kind: 'descent'    });
    addGraphEdge(level, { from: 'td_south', to: 'goal',     kind: 'descent'    });
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
      timeLimit: 60,
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

    // Void-edge conveyor on Leg A — pushes toward north void
    setSurface(level, 22, 5, { baseHeight: 18, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -3.2, strength: 3.5 } });

    // Ramp A south (z=18→14), 6×5
    placeRamp(level, { x: 10, y: 9, dir: 'south', length: 6, width: 5, startZ: 18, endZ: 14 });

    // Turn platform A (z=14), 14×6 — crumble at inner corner
    fillTrack(level, 2, 15, 14, 6, 14);
    setSurface(level, 10, 16, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 11, 16, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 10, 17, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
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
    setSurface(level, 12, 33, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 13, 33, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 12, 34, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    wallRing(level, 2, 32, 14, 6, 12, {
      gaps: [
        // North entry from Ramp B (east side): x:11-15 — 5 tiles wide
        { x: 11, y: 32 }, { x: 12, y: 32 }, { x: 13, y: 32 }, { x: 14, y: 32 }, { x: 15, y: 32 },
        // South exit to Leg C (west side): x:2-7 — 6 tiles wide
        { x: 2, y: 37 }, { x: 3, y: 37 }, { x: 4, y: 37 }, { x: 5, y: 37 }, { x: 6, y: 37 }, { x: 7, y: 37 }
      ]
    });
    // Leg C: east corridor (z=10), 14×5 — ice floor introduces friction reduction before Stage 6
    fillTrack(level, 2, 38, 14, 5, 10);
    // Ice tiles across the interior of Leg C (not the walls)
    for (let ix = 3; ix <= 14; ix++) {
      for (let iy = 38; iy <= 42; iy++) {
        setSurface(level, ix, iy, { baseHeight: 10, shape: SHAPES.FLAT, friction: 0.25 });
      }
    }
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
    // Rotating bar on Turn B — introduces the mechanic before Stage 6
    addActor(level, {
      id: 'bar_turn_b', kind: ACTOR_KINDS.SWEEPER,
      x: 8, y: 34, z: 10, topHeight: 10,
      width: 1, height: 1, armLength: 2.8, armWidth: 0.22, angularSpeed: 0.9, fatal: true
    });

    // Ramp C south (z=10→6), 6×5 — aligned with Leg C east exit at x:11-15
    placeRamp(level, { x: 11, y: 43, dir: 'south', length: 6, width: 5, startZ: 10, endZ: 6 });

    // Turn platform C (z=6), 14×6
    // Exit gap on south wall at x:10-14 — aligned with where marble arrives from Ramp C
    fillTrack(level, 2, 49, 14, 6, 6);
    setSurface(level, 4, 51, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 5, 51, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 4, 52, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
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
    setSurface(level, 3, 67, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 4, 67, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 3, 68, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 4, 68, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });

    // Path A (east): Leg E east corridor (z=2), 14×5 — with timed gate
    fillTrack(level, 11, 72, 14, 5, 2);
    addTimedGate(level, 'gate_leg_e', 16, 73, 4, 3, 2, 1.5, 1.0);
    // Sweeper on the approach to the final gate
    addActor(level, {
      id: 'sweeper_l3_final', kind: ACTOR_KINDS.SWEEPER,
      x: 18, y: 74, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    wallRing(level, 11, 72, 14, 5, 4, {
      gaps: [
        // North entry from Turn D south exit (y=71 gaps match Turn D's east exit)
        { x: 11, y: 72 }, { x: 12, y: 72 }, { x: 13, y: 72 }, { x: 14, y: 72 }, { x: 15, y: 72 },
        // South exit to ramp
        { x: 11, y: 76 }, { x: 12, y: 76 }, { x: 13, y: 76 }, { x: 14, y: 76 }, { x: 15, y: 76 }, { x: 16, y: 76 }, { x: 17, y: 76 }, { x: 18, y: 76 }, { x: 19, y: 76 }, { x: 20, y: 76 }, { x: 21, y: 76 }, { x: 22, y: 76 }, { x: 23, y: 76 }, { x: 24, y: 76 }
      ]
    });
    placeRamp(level, { x: 11, y: 77, dir: 'south', length: 5, width: 5, startZ: 2, endZ: -2 });

    // Path B (west shortcut): narrow crumble corridor direct to basin
    fillTrack(level, 2, 72, 8, 5, 2);
    for (let cx = 3; cx < 9; cx++) {
      for (let cy = 72; cy < 77; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
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
        // Path A ramp (x:11,y:77) lands at x:11-15 y:82
        // Path B ramp (x:9,y:77) lands at x:9-13 y:82
        // Combined: x:9-15 all open
        { x: 9, y: 82 }, { x: 10, y: 82 }, { x: 11, y: 82 }, { x: 12, y: 82 }, { x: 13, y: 82 },
        { x: 14, y: 82 }, { x: 15, y: 82 }
      ]
    });
    // Random push tiles — all diagonal/randomized
    setSurface(level, 8, 22, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -2.2, strength: 3.0 } });
    setSurface(level, 5, 38, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: -2.0, y: -2.5, strength: 2.8 } });
    setSurface(level, 12, 52, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: -2.2, y: 2.2, strength: 3.0 } });
    setSurface(level, 8, 68, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: -2.5, strength: 3.2 } });
    // Void-edge conveyors — push toward outer void edges on each leg
    setSurface(level, 15, 4, { baseHeight: 18, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.8, strength: 3.5 } });
    setSurface(level, 2, 21, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: 2.5, strength: 3.5 } });
    setSurface(level, 15, 38, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: 2.8, strength: 3.5 } });
    setSurface(level, 2, 61, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: -2.5, strength: 3.5 } });
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
      timeLimit: 60,
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
        setSurface(level, cx, cy, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 0.8, y: 0, strength: 3.1 } });
      }
    }
    addHazardRect(level, 36, 5, 2, 2, 'canal_spikes_north');
    // Second hazard strip and timed gate — can't just fly through on conveyor
    addHazardRect(level, 42, 4, 2, 4, 'canal_spikes_north2');
    addTimedGate(level, 'gate_canal_north', 32, 4, 10, 3, 2, 1.6, 1.2);
    // Sweeper guarding the exit
    addActor(level, {
      id: 'sweeper_canal_n', kind: ACTOR_KINDS.SWEEPER,
      x: 44, y: 5, z: 10, topHeight: 10,
      width: 1, height: 1, armLength: 1.8, armWidth: 0.22, angularSpeed: 1.3, fatal: true
    });
    wallRing(level, 29, 4, 20, 4, 12, {
      gaps: [
        { x: 29, y: 4 }, { x: 29, y: 5 }, { x: 29, y: 6 }, { x: 29, y: 7 },
        { x: 48, y: 4 }, { x: 48, y: 5 }, { x: 48, y: 6 }, { x: 48, y: 7 }
      ]
    });

    // Lower (south) lane (z=10), 20×6 — wider, column obstacles + rotating bar
    fillTrack(level, 29, 8, 20, 6, 10);
    // Crumble section
    for (let cx = 33; cx < 40; cx++) {
      setSurface(level, cx, 10, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 11, { baseHeight: 10, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    }
    addActor(level, {
      id: 'bar_canal_s', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 42, y: 11, z: 10, topHeight: 10,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    // Column pair 1: north side (2 wide), leaves gap on south (y:11-13)
    setSurface(level, 33, 8,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 33, 9,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 33, 10, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 34, 8,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 34, 9,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 34, 10, { baseHeight: 14, shape: SHAPES.FLAT });
    // Column pair 2: south side (2 wide), leaves gap on north (y:8-10)
    setSurface(level, 38, 11, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 38, 12, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 38, 13, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 39, 11, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 39, 12, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 39, 13, { baseHeight: 14, shape: SHAPES.FLAT });
    // Column pair 3: north side again (2 wide)
    setSurface(level, 43, 8,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 43, 9,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 43, 10, { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 44, 8,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 44, 9,  { baseHeight: 14, shape: SHAPES.FLAT });
    setSurface(level, 44, 10, { baseHeight: 14, shape: SHAPES.FLAT });
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
        // North lane entry (y:4-7)
        { x: 49, y: 4 }, { x: 49, y: 5 }, { x: 49, y: 6 }, { x: 49, y: 7 },
        // South lane entry (y:8-13) — was missing, caused marble to fall off south edge
        { x: 49, y: 8 }, { x: 49, y: 9 }, { x: 49, y: 10 }, { x: 49, y: 11 }, { x: 49, y: 12 }, { x: 49, y: 13 },
        // East exit to ramp (x:54, y:7-10)
        { x: 54, y: 7 }, { x: 54, y: 8 }, { x: 54, y: 9 }, { x: 54, y: 10 }
      ]
    });

       // Ramp south from merge platform (z=10→6), 5×5 — into second canal section
    placeRamp(level, { x: 55, y: 7, dir: 'south', length: 5, width: 5, startZ: 10, endZ: 6 });
    // Connector strip (z=6), 11×3 — fills gap between ramp landing (y:12) and junction entry (y:15)
    // Width extended to 11 (x:49-59) to cover the full ramp width (x:55-59) plus the junction entry (x:49-55).
    // Without this, marble arriving at x:56-59,y:11 off the ramp falls into void at y:12.
    fillTrack(level, 49, 12, 11, 3, 6);

    // === EXTENSION: second canal section ===
    // Second fork junction (z=6), 11×14 — extended to x:49-59 to close hole at x:59,y:15
    fillTrack(level, 49, 15, 11, 14, 6);
    wallRing(level, 49, 15, 11, 14, 8, {
      gaps: [
        // North entry from ramp
        { x: 49, y: 15 }, { x: 50, y: 15 }, { x: 51, y: 15 }, { x: 52, y: 15 }, { x: 53, y: 15 }, { x: 54, y: 15 }, { x: 55, y: 15 }, { x: 56, y: 15 }, { x: 57, y: 15 }, { x: 58, y: 15 }, { x: 59, y: 15 },
        // West exit upper lane
        { x: 49, y: 16 }, { x: 49, y: 17 }, { x: 49, y: 18 }, { x: 49, y: 19 },
        // West exit lower lane
        { x: 49, y: 22 }, { x: 49, y: 23 }, { x: 49, y: 24 }, { x: 49, y: 25 }, { x: 49, y: 26 }, { x: 49, y: 27 }, { x: 49, y: 28 }
      ]
    });

    // Upper lane (z=6), 20×4 — moving platform bridge over void
    fillTrack(level, 29, 16, 20, 4, 6);
    clearSurfaceRect(level, 36, 16, 6, 4);
    // Bridge starts 2 tiles onto the west landing and ends 2 tiles onto the
    // east landing — marble can board from either side without standing at the edge.
    addMovingBridge(level, 'bridge_canal2', [
      { x: 34, y: 16, z: 6 },
      { x: 41, y: 16, z: 6 }
    ], 4, 4, 0.55);
    // Hazard strip on west landing — can't loiter waiting for platform
    addHazardRect(level, 33, 16, 3, 4, 'canal_bridge_west_spikes');
    // Hazard strip on east landing — must step off platform quickly
    addHazardRect(level, 42, 16, 3, 4, 'canal_bridge_east_spikes');
    // Sweeper guarding the east landing
    addActor(level, {
      id: 'sweeper_canal_bridge', kind: ACTOR_KINDS.SWEEPER,
      x: 46, y: 18, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 1.8, armWidth: 0.22, angularSpeed: 2.0, fatal: true
    });
    wallRing(level, 29, 16, 20, 4, 8, {
      gaps: [
        { x: 48, y: 16 }, { x: 48, y: 17 }, { x: 48, y: 18 }, { x: 48, y: 19 },
        { x: 29, y: 16 }, { x: 29, y: 17 }, { x: 29, y: 18 }, { x: 29, y: 19 }
      ]
    });

    // Lower lane (z=6), 20×6 — timed gate + column obstacles + sweeper + crumble + hazard strip
    fillTrack(level, 29, 22, 20, 6, 6);
    addTimedGate(level, 'gate_canal2', 35, 23, 8, 3, 2, 1.6, 1.4);
    // Column pair 1: north side, leaves gap on south
    setSurface(level, 40, 22, { baseHeight: 10, shape: SHAPES.FLAT });
    setSurface(level, 40, 23, { baseHeight: 10, shape: SHAPES.FLAT });
    // Column pair 2: south side, leaves gap on north
    setSurface(level, 44, 25, { baseHeight: 10, shape: SHAPES.FLAT });
    setSurface(level, 44, 26, { baseHeight: 10, shape: SHAPES.FLAT });
    // Crumble tiles in the middle of the lane — marble must move quickly
    for (let cx = 37; cx < 42; cx++) {
      setSurface(level, cx, 24, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 25, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    }
    // Hazard strip near the exit — can't just roll straight through
    addHazardRect(level, 43, 22, 2, 3, 'canal2_lower_spikes');
    // Sweeper guarding the lane exit
    addActor(level, {
      id: 'sweeper_canal2_lower', kind: ACTOR_KINDS.SWEEPER,
      x: 46, y: 24, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 1.8, armWidth: 0.22, angularSpeed: 1.6, fatal: true
    });
    wallRing(level, 29, 22, 20, 6, 8, {
      gaps: [
        { x: 48, y: 22 }, { x: 48, y: 23 }, { x: 48, y: 24 }, { x: 48, y: 25 }, { x: 48, y: 26 }, { x: 48, y: 27 }, { x: 48, y: 28 },
        { x: 29, y: 22 }, { x: 29, y: 23 }, { x: 29, y: 24 }, { x: 29, y: 25 }, { x: 29, y: 26 }, { x: 29, y: 27 }, { x: 29, y: 28 }
      ]
    });

    // Connector strip bridging 1-tile gap between lower lane west wall (x=29)
    // and second merge platform east wall (x=28) at y:22-28, z=6.
    // Without this, the marble exits the lower lane at x=29 and falls into
    // the void because there is no floor tile at x=28 before the merge platform.
    fillTrack(level, 28, 22, 1, 7, 6);

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
    // Random push tiles — unpredictable direction changes
    // Existing tiles on upper sections
    setSurface(level, 32, 6,  { baseHeight: 6,  shape: SHAPES.FLAT, conveyor: { x: 2.2,  y: 3.0,  strength: 3.2 } });
    setSurface(level, 44, 10, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: -2.0, strength: 3.0 } });
    setSurface(level, 38, 18, { baseHeight: 6,  shape: SHAPES.FLAT, conveyor: { x: 2.5,  y: 2.5,  strength: 3.2 } });
    // NOTE: setSurface at (38,26) z=8 removed — was an orphaned tile floating in void
    // New randomizers on second merge platform — push toward the ramp or sideways
    setSurface(level, 21, 17, { baseHeight: 6,  shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 2.8,  strength: 3.5 } });
    setSurface(level, 24, 20, { baseHeight: 6,  shape: SHAPES.FLAT, conveyor: { x: 3.0,  y: -1.5, strength: 3.2 } });
    setSurface(level, 20, 25, { baseHeight: 6,  shape: SHAPES.FLAT, conveyor: { x: -3.0, y: 3.0,  strength: 3.5 } });
    setSurface(level, 26, 27, { baseHeight: 6,  shape: SHAPES.FLAT, conveyor: { x: 2.5,  y: 2.0,  strength: 3.0 } });
    // Randomizers on the final ramp approach — push diagonally to knock marble off the narrow ramp
    setSurface(level, 22, 29, { baseHeight: 5,  shape: SHAPES.FLAT, conveyor: { x: -3.0, y: 1.5,  strength: 3.5 } });
    setSurface(level, 23, 31, { baseHeight: 4,  shape: SHAPES.FLAT, conveyor: { x: 2.8,  y: -2.0, strength: 3.2 } });
    // Bounce pad on second merge platform — first encounter with the mechanic
    setSurface(level, 25, 22, { baseHeight: 6,  shape: SHAPES.FLAT, bounce: 5.2 });
    // Randomizers in the goal basin — push marble away from the goal
    setSurface(level, 20, 36, { baseHeight: 2,  shape: SHAPES.FLAT, conveyor: { x: 2.8,  y: -2.8, strength: 3.5 } });
    setSurface(level, 25, 38, { baseHeight: 2,  shape: SHAPES.FLAT, conveyor: { x: -3.0, y: 3.0,  strength: 3.5 } });
    setSurface(level, 18, 40, { baseHeight: 2,  shape: SHAPES.FLAT, conveyor: { x: 3.0,  y: 2.5,  strength: 3.2 } });
    // Bounce pad in goal basin — reinforces the mechanic near the goal
    setSurface(level, 17, 37, { baseHeight: 2,  shape: SHAPES.FLAT, bounce: 5.2 });
    // Void-edge conveyors — push marble toward outer void edges of each canal lane
    setSurface(level, 29, 4, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: -2.8, strength: 3.5 } });
    setSurface(level, 47, 7, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: -2.5, strength: 3.5 } });
    setSurface(level, 29, 13, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 3.0, strength: 3.5 } });
    setSurface(level, 47, 13, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: 3.2, strength: 3.5 } });
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
      timeLimit: 60,
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
    // Moving platform bridge — starts 2 tiles onto the west landing so the
    // marble can board it without standing right at the void edge.
    // Endpoint moved from (26,6) to (28,6) so it lands on the east landing floor tile.
    addMovingBridge(level, 'bridge_main', [
      { x: 20, y: 6, z: 14 },
      { x: 28, y: 6, z: 14 }
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
    // NOTE: removed disconnected north ramp (was going off-map to y<0)
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
        // North wall gaps (entry from east landing north side)
        { x: 34, y: 0 }, { x: 35, y: 0 }, { x: 36, y: 0 }, { x: 37, y: 0 },
        // South wall gaps (entry from east landing, y:4 → y:3)
        { x: 34, y: 3 }, { x: 35, y: 3 }, { x: 36, y: 3 }, { x: 37, y: 3 },
        // East wall gaps (exit to merge platform)
        { x: 49, y: 0 }, { x: 49, y: 1 }, { x: 49, y: 2 }, { x: 49, y: 3 }
      ]
    });

    // Lower (south) path: 20×6 (z=10) — wider, no hazards
    // Note: removed duplicate placeRamp that was being overwritten by fillTrack anyway
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

    // Second approach corridor (z=4), 12×8 — hazard strips + timed gate
    fillTrack(level, 49, 36, 12, 8, 4);
    addHazardRect(level, 51, 38, 2, 4, 'l5_approach_spikes');
    addTimedGate(level, 'gate_l5_approach', 53, 37, 6, 4, 2, 1.8, 1.2);
    wallRing(level, 49, 36, 12, 8, 6, {
      gaps: [
        { x: 53, y: 36 }, { x: 54, y: 36 }, { x: 55, y: 36 }, { x: 56, y: 36 },
        { x: 49, y: 40 }, { x: 49, y: 41 }, { x: 49, y: 42 }, { x: 49, y: 43 },
        { x: 55, y: 43 }, { x: 56, y: 43 }, { x: 57, y: 43 }, { x: 58, y: 43 }, { x: 59, y: 43 }, { x: 60, y: 43 }
      ]
    });

    // Bridge x:33 (1-tile void between second landing east wall x:33 and Path A west wall x:34)
    fillTrack(level, 33, 40, 1, 4, 4);
    // Path A (west): wide void gap with moving platform bridge
    // Floor at x:34-39 and x:47-49, void gap at x:40-46
    fillTrack(level, 34, 40, 6, 4, 4);  // x:34-39 solid floor
    fillTrack(level, 47, 40, 3, 4, 4);  // x:47-49 solid floor (east side of gap)
    clearSurfaceRect(level, 40, 40, 7, 4);  // void gap x:40-46
    addMovingBridge(level, 'bridge_cross2', [
      { x: 39, y: 40, z: 4 },
      { x: 47, y: 40, z: 4 }
    ], 4, 4, 0.5);
    wallRing(level, 34, 40, 16, 4, 6, {
      gaps: [
        { x: 49, y: 40 }, { x: 49, y: 41 }, { x: 49, y: 42 }, { x: 49, y: 43 },
        { x: 34, y: 40 }, { x: 34, y: 41 }, { x: 34, y: 42 }, { x: 34, y: 43 }
      ]
    });

    // Bridge x:54 (1-tile void between connector east wall x:53 and Path B west wall x:55)
    fillTrack(level, 54, 44, 1, 5, 4);
    // Path B (east): crumble bridge + rotating bar hazard
    fillTrack(level, 55, 44, 20, 5, 4);
    for (let cx = 60; cx < 68; cx++) {
      for (let cy = 44; cy < 49; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    addActor(level, {
      id: 'bar_cross2', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 63, y: 46, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    wallRing(level, 55, 44, 20, 5, 6, {
      gaps: [
        // North wall gaps (entry from approach corridor south at y:43)
        { x: 55, y: 43 }, { x: 56, y: 43 }, { x: 57, y: 43 }, { x: 58, y: 43 }, { x: 59, y: 43 }, { x: 60, y: 43 },
        // South wall gaps (exit to Path B south landing at y:49)
        { x: 62, y: 48 }, { x: 63, y: 48 }, { x: 64, y: 48 }, { x: 65, y: 48 }, { x: 66, y: 48 }
      ]
    });

    // Path B south landing (z=4), 12×8 — Path B exits south into this platform
    fillTrack(level, 58, 49, 12, 8, 4);
    wallRing(level, 58, 49, 12, 8, 6, {
      gaps: [
        // North wall gaps (entry from Path B south exit at y:48)
        { x: 62, y: 49 }, { x: 63, y: 49 }, { x: 64, y: 49 }, { x: 65, y: 49 }, { x: 66, y: 49 },
        // West wall gaps (exit to east path connector at x:53, y:49-56)
        { x: 58, y: 49 }, { x: 58, y: 50 }, { x: 58, y: 51 }, { x: 58, y: 52 },
        { x: 58, y: 53 }, { x: 58, y: 54 }, { x: 58, y: 55 }, { x: 58, y: 56 }
      ]
    });

    // Second landing platform (z=4), 14×18 — both paths converge
    fillTrack(level, 20, 40, 14, 18, 4);
    wallRing(level, 20, 40, 14, 18, 6, {
      gaps: [
        // Path A (west bridge) entry at y:40-43
        { x: 33, y: 40 }, { x: 33, y: 41 }, { x: 33, y: 42 }, { x: 33, y: 43 },
        // Path B (east crumble) entry at y:44-57 — REQUIRED so east path connector can flow in
        { x: 33, y: 44 }, { x: 33, y: 45 }, { x: 33, y: 46 }, { x: 33, y: 47 },
        { x: 33, y: 48 }, { x: 33, y: 49 }, { x: 33, y: 50 }, { x: 33, y: 51 },
        { x: 33, y: 52 }, { x: 33, y: 53 }, { x: 33, y: 54 }, { x: 33, y: 55 },
        { x: 33, y: 56 }, { x: 33, y: 57 },
        // Goal entry from Path B east wall (x:74)
        { x: 74, y: 44 }, { x: 74, y: 45 }, { x: 74, y: 46 }, { x: 74, y: 47 }, { x: 74, y: 48 },
        // South exit to final ramp
        { x: 25, y: 57 }, { x: 26, y: 57 }, { x: 27, y: 57 }, { x: 28, y: 57 }
      ]
    });
    // Connector strip bridging east path connector (x:53) to Path B south landing (x:58)
    fillTrack(level, 54, 49, 4, 8, 4);  // x:54-57, y:49-56
    // Void-edge conveyor on connector strip — pushes marble toward east void
    setSurface(level, 56, 52, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: -2.8, strength: 3.5 } });

    // Crumble section on Path B south landing — must move quickly
    for (let cx = 60; cx <= 67; cx++) {
      setSurface(level, cx, 51, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 52, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    }
    // Sweeper guarding the Path B south landing exit
    addActor(level, {
      id: 'sweeper_l5_pathb', kind: ACTOR_KINDS.SWEEPER,
      x: 63, y: 54, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 1.6, fatal: true
    });

    // Sweeper on east path connector — guards the corridor
    addActor(level, {
      id: 'sweeper_l5_east', kind: ACTOR_KINDS.SWEEPER,
      x: 44, y: 50, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    // Timed gate on east path connector entry
    addTimedGate(level, 'gate_l5_east', 42, 44, 4, 3, 2, 1.6, 1.2);
    // Void-edge conveyor on east path connector — pushes toward east void
    setSurface(level, 52, 47, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -2.5, strength: 3.5 } });

    // Connect east path into landing via east wall
    fillTrack(level, 34, 44, 20, 14, 4);
    wallRing(level, 34, 44, 20, 14, 6, {
      gaps: [
        // North wall gaps (connect from Path A corridor at y:40-43)
        { x: 34, y: 40 }, { x: 34, y: 41 }, { x: 34, y: 42 }, { x: 34, y: 43 },
        // West wall gaps (connect to second landing east wall at x:33, y:44-57)
        { x: 34, y: 44 }, { x: 34, y: 45 }, { x: 34, y: 46 }, { x: 34, y: 47 },
        { x: 34, y: 48 }, { x: 34, y: 49 }, { x: 34, y: 50 }, { x: 34, y: 51 },
        { x: 34, y: 52 }, { x: 34, y: 53 }, { x: 34, y: 54 }, { x: 34, y: 55 },
        { x: 34, y: 56 }, { x: 34, y: 57 },
        // East wall gaps (connect from Path B via bridge_x54 at x:53-54, y:44-48 AND connector strip y:49-56)
        { x: 53, y: 44 }, { x: 53, y: 45 }, { x: 53, y: 46 }, { x: 53, y: 47 }, { x: 53, y: 48 },
        { x: 53, y: 49 }, { x: 53, y: 50 }, { x: 53, y: 51 }, { x: 53, y: 52 },
        { x: 53, y: 53 }, { x: 53, y: 54 }, { x: 53, y: 55 }, { x: 53, y: 56 },
        // South wall gaps (exit to final ramp)
        { x: 34, y: 57 }, { x: 35, y: 57 }, { x: 36, y: 57 }, { x: 37, y: 57 }
      ]
    });

    // Final ramp south (z=4→0), 6×8
    placeRamp(level, { x: 22, y: 58, dir: 'south', length: 6, width: 8, startZ: 4, endZ: 0 });
    // Goal basin (z=0), 14×7 — capped at y:70 to stay within map height:72
    fillTrack(level, 18, 64, 14, 7, 0);
    wallRing(level, 18, 64, 14, 7, 2, {
      gaps: [{ x: 22, y: 64 }, { x: 23, y: 64 }, { x: 24, y: 64 }, { x: 25, y: 64 }, { x: 26, y: 64 }, { x: 27, y: 64 }, { x: 28, y: 64 }, { x: 29, y: 64 }]
    });
    // Random push tiles — all diagonal/randomized
    setSurface(level, 30, 10, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: 2.5, y: 3.2, strength: 3.5 } });
    setSurface(level, 55, 18, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: -2.2, strength: 3.2 } });
    setSurface(level, 54, 10, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: -3.2, strength: 3.5 } });
    setSurface(level, 20, 45, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: -2.8, y: 2.8, strength: 3.2 } });
    // NOTE: setSurface at (60,55) z=4 removed — was an orphaned tile floating in void (outside all platforms)
    // Sweepers guarding the goal basin entry
    addActor(level, {
      id: 'sweeper_l5_goal_a', kind: ACTOR_KINDS.SWEEPER,
      x: 22, y: 62, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweeper_l5_goal_b', kind: ACTOR_KINDS.SWEEPER,
      x: 32, y: 62, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: -2.0, fatal: true
    });
    // Rotating bar mid-basin
    addActor(level, {
      id: 'bar_l5_goal', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 27, y: 66, z: 0, topHeight: 0,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 2.2, fatal: true
    });
    // Hazard strip blocking direct run to goal (inside basin, before goal)
    addHazardRect(level, 19, 65, 12, 2, 'l5_goal_spikes');
    setGoal(level, 25, 68, 0.44);

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
      timeLimit: 60,
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

    // Sweeper on Tier 3 — guards the ramp entry
    addActor(level, {
      id: 'sweeper_l6_t3', kind: ACTOR_KINDS.SWEEPER,
      x: 27, y: 41, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });

    // Timed gate before Tier 4 ramp
    addTimedGate(level, 'gate_l6_t3', 22, 43, 6, 3, 2, 1.6, 1.2);
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
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
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
        // Diagonal conveyor: pushes marble toward east void edge
        const cyOff = (cy % 3) - 1;  // -1, 0, or 1 based on row
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 1.8, y: 2.2 + cyOff * 0.4, strength: 2.8 } });
      }
    }
    addHazardRect(level, 34, 65, 4, 3, 'l6_ext_spikes');
    addActor(level, {
      id: 'sweeper_tier5', kind: ACTOR_KINDS.SWEEPER,
      x: 39, y: 64, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.8, armWidth: 0.22, angularSpeed: 0.8, fatal: true
    });
    wallRing(level, 32, 55, 14, 18, 4, {
      gaps: [
        { x: 32, y: 55 }, { x: 32, y: 56 }, { x: 32, y: 57 }, { x: 32, y: 58 }, { x: 32, y: 59 }, { x: 32, y: 60 }, { x: 32, y: 61 },
        { x: 38, y: 72 }, { x: 39, y: 72 }, { x: 40, y: 72 }, { x: 41, y: 72 }, { x: 42, y: 72 }, { x: 43, y: 72 }, { x: 44, y: 72 }, { x: 45, y: 72 }
      ]
    });
    placeRamp(level, { x: 38, y: 73, dir: 'south', length: 5, width: 8, startZ: 2, endZ: -2 });

    // Final goal basin (z=-2), 40×10 — both paths converge
    // Extended from width 30 to 40 (x:6-45) so Path B ramp (x:38-45) lands inside the basin.
    fillTrack(level, 6, 78, 40, 10, -2);
    wallRing(level, 6, 78, 40, 10, 0, {
      gaps: [
        { x: 8, y: 78 }, { x: 9, y: 78 }, { x: 10, y: 78 }, { x: 11, y: 78 }, { x: 12, y: 78 },
        { x: 38, y: 78 }, { x: 39, y: 78 }, { x: 40, y: 78 }, { x: 41, y: 78 }, { x: 42, y: 78 }, { x: 43, y: 78 }, { x: 44, y: 78 }, { x: 45, y: 78 }
      ]
    });
    // Random push tiles — all diagonal/randomized
    setSurface(level, 18, 20, { baseHeight: 10, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: -2.5, strength: 3.5 } });
    setSurface(level, 22, 38, { baseHeight: 6,  shape: SHAPES.FLAT, conveyor: { x: -2.2, y: -3.0, strength: 3.2 } });
    setSurface(level, 22, 52, { baseHeight: 2,  shape: SHAPES.FLAT, conveyor: { x: -3.2, y: 3.2, strength: 3.5 } });
    setSurface(level, 14, 68, { baseHeight: 2,  shape: SHAPES.FLAT, conveyor: { x: 3.5, y: -3.5, strength: 3.5 } });
    setSurface(level, 30, 78, { baseHeight: -2, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: -3.0, strength: 3.5 } });
    setSurface(level, 10, 84, { baseHeight: -2, shape: SHAPES.FLAT, conveyor: { x: 3.5, y: 3.5, strength: 3.5 } });
    // Void-edge conveyors — push marble toward outer void edges on each tier
    setSurface(level, 18, 4, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: -2.8, strength: 3.5 } });
    setSurface(level, 31, 4, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: -3.2, strength: 3.5 } });
    setSurface(level, 18, 36, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: 2.5, strength: 3.5 } });
    setSurface(level, 31, 44, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: 3.0, strength: 3.5 } });
    setSurface(level, 8, 55, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: 2.8, strength: 3.5 } });
    setSurface(level, 44, 72, { baseHeight: 2, shape: SHAPES.FLAT, conveyor: { x: 3.5, y: 3.0, strength: 3.5 } });
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
      timeLimit: 60,
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

    // Central hub (z=16), 18×18 — ice floor makes marble slide, harder to control
    fillTrack(level, 18, 20, 18, 18, 16);
    for (let cx = 19; cx < 35; cx++) {
      for (let cy = 21; cy < 37; cy++) {
        setSurface(level, cx, cy, { baseHeight: 16, shape: SHAPES.FLAT, friction: 0.28 });
      }
    }
    wallRing(level, 18, 20, 18, 18, 18, {
      gaps: [
        { x: 18, y: 27 }, { x: 18, y: 28 }, { x: 18, y: 29 }, { x: 18, y: 30 },
        { x: 22, y: 20 }, { x: 23, y: 20 }, { x: 24, y: 20 }, { x: 25, y: 20 },
        { x: 35, y: 27 }, { x: 35, y: 28 }, { x: 35, y: 29 }, { x: 35, y: 30 },
        { x: 22, y: 37 }, { x: 23, y: 37 }, { x: 24, y: 37 }, { x: 25, y: 37 }
      ]
    });

    // North wing (z=12), 20×9 — sweeper + crumble tiles + ice approach
    // Bridge x:37 (1-tile void between north wing east wall and goal approach west wall)
    fillTrack(level, 37, 14, 1, 4, 12);
    fillTrack(level, 18, 12, 20, 9, 12);
    // Ice approach tiles before sweeper
    for (let cx = 19; cx < 27; cx++) {
      for (let cy = 13; cy < 17; cy++) {
        setSurface(level, cx, cy, { baseHeight: 12, shape: SHAPES.FLAT, friction: 0.25 });
      }
    }
    // Crumble tiles near exit
    for (let cx = 30; cx < 36; cx++) {
      for (let cy = 13; cy < 17; cy++) {
        setSurface(level, cx, cy, { baseHeight: 12, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
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

    // East wing (z=12), 20×8 — rotating bar + crumble bridge
    // Bridge x:55 (1-tile void between east wing east wall and ramp start)
    fillTrack(level, 55, 27, 1, 4, 12);
    fillTrack(level, 36, 25, 20, 8, 12);
    placeRamp(level, { x: 35, y: 27, dir: 'east', length: 4, width: 4, startZ: 16, endZ: 12 });
    // Rotating bar before the crumble bridge
    addActor(level, {
      id: 'bar_east_wing', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 40, y: 29, z: 12, topHeight: 12,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 1.6, fatal: true
    });
    for (let cx = 42; cx < 46; cx++) {
      for (let cy = 26; cy < 30; cy++) {
        setSurface(level, cx, cy, { baseHeight: 12, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    wallRing(level, 36, 25, 20, 8, 14, {
      gaps: [
        { x: 36, y: 27 }, { x: 36, y: 28 }, { x: 36, y: 29 }, { x: 36, y: 30 },
        { x: 55, y: 27 }, { x: 55, y: 28 }, { x: 55, y: 29 }, { x: 55, y: 30 }
      ]
    });

    // South wing (z=12), 20×8 — hazard strips + timed gate
    // Bridge x:37 (1-tile void between south wing east wall and goal approach west wall)
    fillTrack(level, 37, 40, 1, 4, 12);
    fillTrack(level, 18, 38, 20, 8, 12);
    placeRamp(level, { x: 22, y: 37, dir: 'south', length: 4, width: 4, startZ: 16, endZ: 12 });
    // Hazard strips before the timed gate
    addHazardRect(level, 22, 38, 2, 6, 'south_wing_hazard1');
    addHazardRect(level, 28, 38, 2, 6, 'south_wing_hazard2');
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
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    addActor(level, {
      id: 'sweeper_lab2', kind: ACTOR_KINDS.SWEEPER,
      x: 75, y: 18, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.0, fatal: true
    });
    wallRing(level, 72, 12, 6, 12, 6, {
      gaps: [
        // South exit to ramp (full south wall open)
        { x: 72, y: 23 }, { x: 73, y: 23 }, { x: 74, y: 23 }, { x: 75, y: 23 }, { x: 76, y: 23 }, { x: 77, y: 23 },
        // East wall fully open (ramp is immediately east)
        { x: 77, y: 12 }, { x: 77, y: 13 }, { x: 77, y: 14 }, { x: 77, y: 15 }, { x: 77, y: 16 },
        { x: 77, y: 17 }, { x: 77, y: 18 }, { x: 77, y: 19 }, { x: 77, y: 20 }, { x: 77, y: 21 },
        { x: 77, y: 22 }, { x: 77, y: 23 }
      ]
    });
    placeRamp(level, { x: 78, y: 12, dir: 'east', length: 5, width: 12, startZ: 4, endZ: 0 });

    // Wing B (east): ice floor + two timed gates
    fillTrack(level, 81, 26, 18, 12, 4);
    // Ice floor — marble slides, hard to stop before gates
    for (let cx = 82; cx < 98; cx++) {
      for (let cy = 27; cy < 37; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, friction: 0.22 });
      }
    }
    addTimedGate(level, 'gate_lab2_east_a', 86, 28, 0, 3, 2, 1.8, 1.2);
    addTimedGate(level, 'gate_lab2_east_b', 93, 28, 0, 3, 2, 1.4, 1.0);
    wallRing(level, 81, 26, 18, 12, 6, {
      gaps: [
        { x: 81, y: 28 }, { x: 81, y: 29 }, { x: 81, y: 30 }, { x: 81, y: 31 }, { x: 81, y: 32 }, { x: 81, y: 33 }, { x: 81, y: 34 }, { x: 81, y: 35 },
        // East wall: full ramp width y:26-37 so marble can exit at any y position
        { x: 98, y: 26 }, { x: 98, y: 27 },
        { x: 98, y: 28 }, { x: 98, y: 29 }, { x: 98, y: 30 }, { x: 98, y: 31 }, { x: 98, y: 32 }, { x: 98, y: 33 }, { x: 98, y: 34 }, { x: 98, y: 35 },
        { x: 98, y: 36 }, { x: 98, y: 37 }
      ]
    });
    placeRamp(level, { x: 99, y: 26, dir: 'east', length: 5, width: 12, startZ: 4, endZ: 0 });

    // Wing C (south): conveyor-assisted wide path + rotating bar
    fillTrack(level, 72, 36, 6, 18, 4);
    // Rotating bar mid-corridor (marble must time its passage through conveyor)
    addActor(level, {
      id: 'bar_wing_c', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 75, y: 44, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 1.3, fatal: true
    });
    for (let cx = 73; cx < 77; cx++) {
      for (let cy = 37; cy < 53; cy++) {
        // Diagonal conveyor: pushes marble toward south void edge
        const cxOff2 = (cx % 3) - 1;  // -1, 0, or 1 based on column
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: -1.8 + cxOff2 * 0.4, y: 2.2, strength: 2.8 } });
      }
    }
    wallRing(level, 72, 36, 6, 18, 6, {
      gaps: [
        { x: 72, y: 35 }, { x: 73, y: 35 }, { x: 74, y: 35 }, { x: 75, y: 35 }, { x: 76, y: 35 }, { x: 77, y: 35 },
        { x: 77, y: 36 }, { x: 77, y: 37 }, { x: 77, y: 38 }, { x: 77, y: 39 }, { x: 77, y: 40 }, { x: 77, y: 41 }, { x: 77, y: 42 }, { x: 77, y: 43 }, { x: 77, y: 44 }, { x: 77, y: 45 }, { x: 77, y: 46 }, { x: 77, y: 47 }, { x: 77, y: 48 }, { x: 77, y: 49 }, { x: 77, y: 50 }, { x: 77, y: 51 }, { x: 77, y: 52 }, { x: 77, y: 53 }
      ]
    });
    placeRamp(level, { x: 78, y: 48, dir: 'east', length: 5, width: 12, startZ: 4, endZ: 0 });

    // Bridge x:82 (1-tile void between wing ramp ends at x:82 and basin west wall at x:83)
    fillTrack(level, 82, 12, 1, 12, 0);  // Wing A entry
    fillTrack(level, 82, 26, 1, 10, 0);  // Wing B entry
    fillTrack(level, 82, 48, 1, 8, 0);   // Wing C entry
    // Final goal basin (z=0), 20×46 — all three wings converge, filled with hazards
    fillTrack(level, 83, 10, 20, 46, 0);
    // Ice floor across the basin — marble slides and is hard to stop
    for (let cx = 84; cx < 102; cx++) {
      for (let cy = 11; cy < 55; cy++) {
        setSurface(level, cx, cy, { baseHeight: 0, shape: SHAPES.FLAT, friction: 0.22 });
      }
    }
    // Sweepers guarding the central area
    addActor(level, {
      id: 'sweeper_basin_a', kind: ACTOR_KINDS.SWEEPER,
      x: 92, y: 22, z: 0, topHeight: 0,
      width: 1, height: 1, armLength: 3.5, armWidth: 0.22, angularSpeed: 1.3, fatal: true
    });
    addActor(level, {
      id: 'sweeper_basin_b', kind: ACTOR_KINDS.SWEEPER,
      x: 92, y: 42, z: 0, topHeight: 0,
      width: 1, height: 1, armLength: 3.5, armWidth: 0.22, angularSpeed: -1.6, fatal: true
    });
    // Rotating bars mid-basin
    addActor(level, {
      id: 'bar_basin_a', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 92, y: 32, z: 0, topHeight: 0,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: 2.0, fatal: true
    });
    // Hazard strips blocking direct path to goal
    addHazardRect(level, 84, 28, 4, 6, 'lab_basin_spikes_a');
    addHazardRect(level, 98, 38, 4, 6, 'lab_basin_spikes_b');
    wallRing(level, 83, 10, 20, 46, 2, {
      gaps: [
        { x: 83, y: 12 }, { x: 83, y: 13 }, { x: 83, y: 14 }, { x: 83, y: 15 }, { x: 83, y: 16 }, { x: 83, y: 17 }, { x: 83, y: 18 }, { x: 83, y: 19 }, { x: 83, y: 20 }, { x: 83, y: 21 }, { x: 83, y: 22 }, { x: 83, y: 23 },
        { x: 83, y: 26 }, { x: 83, y: 27 }, { x: 83, y: 28 }, { x: 83, y: 29 }, { x: 83, y: 30 }, { x: 83, y: 31 }, { x: 83, y: 32 }, { x: 83, y: 33 }, { x: 83, y: 34 }, { x: 83, y: 35 },
        { x: 83, y: 48 }, { x: 83, y: 49 }, { x: 83, y: 50 }, { x: 83, y: 51 }, { x: 83, y: 52 }, { x: 83, y: 53 }, { x: 83, y: 54 }, { x: 83, y: 55 }
      ]
    });
        // Random push tiles — unpredictable direction changes
    setSurface(level, 22, 26, { baseHeight: 16, shape: SHAPES.FLAT, conveyor: { x: 3.5, y: -2.5, strength: 3.8 } });
    setSurface(level, 28, 16, { baseHeight: 12, shape: SHAPES.FLAT, conveyor: { x: -2.2, y: -3.2, strength: 3.5 } });
    setSurface(level, 45, 28, { baseHeight: 8, shape: SHAPES.FLAT, conveyor: { x: -3.5, y: 3.5, strength: 3.5 } });  // fixed: was z=12 on z=8 floor (backtrack-only)
    setSurface(level, 24, 42, { baseHeight: 12, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: 3.2, strength: 3.5 } });
    setSurface(level, 75, 18, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: -3.5, y: -3.5, strength: 3.5 } });
    setSurface(level, 90, 32, { baseHeight: 0, shape: SHAPES.FLAT, friction: 0.22, conveyor: { x: 3.5, y: -3.5, strength: 3.5 } });  // fixed: was z=4 on z=0 ice basin (backtrack-only)
    setSurface(level, 75, 46, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: -3.5, y: 3.5, strength: 3.5 } });
    // Void-edge conveyors — push marble toward outer void edges of each wing
    setSurface(level, 18, 12, { baseHeight: 12, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: -3.0, strength: 3.8 } });
    setSurface(level, 36, 12, { baseHeight: 12, shape: SHAPES.FLAT, conveyor: { x: 3.5, y: -2.8, strength: 3.8 } });
    setSurface(level, 36, 36, { baseHeight: 18, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: 3.5, strength: 3.8 } });  // fixed: was z=12 on z=18 floor (dead-end pit — marble could fall in but not escape)
    setSurface(level, 18, 44, { baseHeight: 12, shape: SHAPES.FLAT, conveyor: { x: -3.5, y: 3.2, strength: 3.8 } });
    setSurface(level, 83, 10, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: -3.5, strength: 3.8 } });
    setSurface(level, 83, 54, { baseHeight: 0, shape: SHAPES.FLAT, conveyor: { x: 2.8, y: 3.5, strength: 3.8 } });  // fixed: was z=4 on z=0 basin entry wall gap (backtrack-only)
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
      timeLimit: 60,
      reward: { presses: 50000, claimKey: 'the_gauntlet' },
      templates: ['gauntlet', 'dual_lane', 'all_hazards']
    });

    // Start plateau (z=18), 10×14
    fillTrack(level, 2, 4, 10, 14, 18);
    wallRing(level, 2, 4, 10, 14, 20, {
      gaps: [
        { x: 11, y: 5 }, { x: 11, y: 6 }, { x: 11, y: 7 }, { x: 11, y: 8 },
        { x: 11, y: 13 }, { x: 11, y: 14 }, { x: 11, y: 15 }
      ]
    });

    // ── NORTH LANE (y=4..8, 5 wide): SWEEPER GAUNTLET — timing puzzle ──────
    // Three sweepers spaced evenly; no gaps to skip between them
    fillTrack(level, 12, 4, 52, 5, 18);
    // Ice floor in north lane — marble slides into sweepers
    for (let cx = 13; cx < 63; cx++) {
      for (let cy = 4; cy < 9; cy++) {
        setSurface(level, cx, cy, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.22 });
      }
    }
    addActor(level, {
      id: 'sweeper_g1a', kind: ACTOR_KINDS.SWEEPER,
      x: 20, y: 6, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.1, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'sweeper_g1b', kind: ACTOR_KINDS.SWEEPER,
      x: 34, y: 6, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.1, armWidth: 0.22, angularSpeed: -1.8, fatal: true
    });
    addActor(level, {
      id: 'sweeper_g1c', kind: ACTOR_KINDS.SWEEPER,
      x: 50, y: 6, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.1, armWidth: 0.22, angularSpeed: 2.1, fatal: true
    });
    // Void-edge conveyors in north lane — push marble toward south void edge (off the lane)
    setSurface(level, 26, 4, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.22, conveyor: { x: 1.8, y: -3.2, strength: 3.5 } });
    setSurface(level, 42, 8, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.22, conveyor: { x: -2.2, y: 3.0, strength: 3.5 } });
    setSurface(level, 56, 4, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.22, conveyor: { x: 2.5, y: -2.8, strength: 3.5 } });
    wallRing(level, 12, 4, 52, 5, 20, {
      gaps: [
        { x: 12, y: 4 }, { x: 12, y: 5 }, { x: 12, y: 6 }, { x: 12, y: 7 }, { x: 12, y: 8 },
        { x: 63, y: 4 }, { x: 63, y: 5 }, { x: 63, y: 6 }, { x: 63, y: 7 }, { x: 63, y: 8 }
      ]
    });

    // ── SOUTH LANE (y=13..15, 3 wide — NARROW): OBSTACLE GAUNTLET ──
    // Narrow 3-tile corridor: crumble tiles, 3 hazard strips, bounce pad, rotating bar, sweeper at end
    fillTrack(level, 12, 13, 52, 3, 18);
    // Crumble section (x:18-26) — full width of narrow lane
    for (let cx = 18; cx < 27; cx++) {
      for (let cy = 13; cy < 16; cy++) {
        setSurface(level, cx, cy, { baseHeight: 18, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Three hazard strips forcing precise navigation
    addHazardRect(level, 28, 13, 2, 3, 'gauntlet_spikes_1');
    addHazardRect(level, 36, 13, 2, 3, 'gauntlet_spikes_2');
    addHazardRect(level, 46, 13, 2, 3, 'gauntlet_spikes_3');
    // Bounce pad between strips 2 and 3
    for (let cx = 39; cx < 44; cx++) {
      setSurface(level, cx, 14, { baseHeight: 18, shape: SHAPES.FLAT, bounce: 5.2 });
    }
    // Rotating bar (x:52) — must time with sweeper ahead
    addActor(level, {
      id: 'bar_g1', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 52, y: 14, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 1.4, armWidth: 0.22, angularSpeed: 2.5, fatal: true
    });
    // Sweeper at end (x:58) — final obstacle before exit
    addActor(level, {
      id: 'sweeper_g1_end', kind: ACTOR_KINDS.SWEEPER,
      x: 58, y: 14, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 1.4, armWidth: 0.22, angularSpeed: -1.8, fatal: true
    });
    wallRing(level, 12, 13, 52, 3, 20, {
      gaps: [
        { x: 12, y: 13 }, { x: 12, y: 14 }, { x: 12, y: 15 },
        { x: 63, y: 13 }, { x: 63, y: 14 }, { x: 63, y: 15 }
      ]
    });

    // Descent ramp (z=18→4), north lane
    placeRamp(level, { x: 64, y: 4, dir: 'east', length: 6, width: 5, startZ: 18, endZ: 4 });
    // Descent ramp (z=18→4), south lane
    placeRamp(level, { x: 64, y: 13, dir: 'east', length: 6, width: 3, startZ: 18, endZ: 4 });
    // Merge basin (z=4), 4×14 — open south wall so marble flows into section 2
    fillTrack(level, 70, 4, 4, 14, 4);
    // Ice floor in merge basin — marble slides into section 2 fast
    for (let cx = 70; cx < 74; cx++) {
      for (let cy = 4; cy < 18; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, friction: 0.22 });
      }
    }
    wallRing(level, 70, 4, 4, 14, 6, {
      gaps: [
        // Entry from north lane ramp
        { x: 70, y: 4 }, { x: 70, y: 5 }, { x: 70, y: 6 }, { x: 70, y: 7 }, { x: 70, y: 8 },
        // Entry from south lane ramp
        { x: 70, y: 13 }, { x: 70, y: 14 }, { x: 70, y: 15 },
        // South exit — open wall so marble flows into section 2
        { x: 70, y: 17 }, { x: 71, y: 17 }, { x: 72, y: 17 }, { x: 73, y: 17 }
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
        // Safe lane (south, wider pillar maze)
        { x: 64, y: 24 }, { x: 64, y: 25 }, { x: 64, y: 26 }, { x: 64, y: 27 },
        { x: 64, y: 28 }, { x: 64, y: 29 }, { x: 64, y: 30 }, { x: 64, y: 31 }
      ]
    });

    // Bridge x:63 (1-tile void between risky lane 2 east wall x:63 and second start platform west wall x:64)
    fillTrack(level, 63, 18, 1, 5, 4);
    // Bridge x:63 (1-tile void between safe lane 2 east wall x:63 and second start platform west wall x:64)
    fillTrack(level, 63, 24, 1, 8, 4);
    // Risky lane 2 (north, y=18..22, 5 wide): rotating bars + spikes
    fillTrack(level, 12, 18, 52, 5, 4);
    addActor(level, {
      id: 'sweeper_g2a', kind: ACTOR_KINDS.SWEEPER,
      x: 22, y: 19, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 1.7, fatal: true
    });
    addActor(level, {
      id: 'sweeper_g2b', kind: ACTOR_KINDS.SWEEPER,
      x: 38, y: 19, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: -2.0, fatal: true
    });
    addActor(level, {
      id: 'sweeper_g2c', kind: ACTOR_KINDS.SWEEPER,
      x: 54, y: 19, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 2.3, fatal: true
    });
    // Void-edge conveyors in risky lane 2 — push marble toward north void edge
    setSurface(level, 28, 18, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: 2.0, y: -3.0, strength: 3.5 } });
    setSurface(level, 46, 22, { baseHeight: 4, shape: SHAPES.FLAT, conveyor: { x: -2.5, y: 3.2, strength: 3.5 } });
    addHazardRect(level, 58, 18, 3, 4, 'gauntlet2_spikes_risky');
    wallRing(level, 12, 18, 52, 5, 6, {
      gaps: [
        { x: 63, y: 18 }, { x: 63, y: 19 }, { x: 63, y: 20 }, { x: 63, y: 21 }, { x: 63, y: 22 },
        { x: 12, y: 18 }, { x: 12, y: 19 }, { x: 12, y: 20 }, { x: 12, y: 21 }, { x: 12, y: 22 }
      ]
    });

    // Safe lane 2 (south, y=24..31, 8 wide): ICE PILLAR MAZE
    // Ice floor shoots marble into pillar hazards — must navigate carefully
    fillTrack(level, 12, 24, 52, 8, 4);
    // Full ice floor — marble slides uncontrollably
    for (let cx = 13; cx < 63; cx++) {
      for (let cy = 24; cy < 32; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, friction: 0.20 });
      }
    }
    // Pillar columns (hazard tiles) — ice shoots marble straight into them
    // Column 1 (x:20-21, y:25-30) — blocks left side
    addHazardRect(level, 20, 25, 2, 6, 'pillar_g2_1');
    // Crumble floor around pillar 1 — can't stop near it
    for (let cx = 18; cx < 24; cx++) {
      for (let cy = 24; cy < 32; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, friction: 0.20, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Column 2 (x:32-33, y:24-29) — blocks right side
    addHazardRect(level, 32, 24, 2, 6, 'pillar_g2_2');
    for (let cx = 30; cx < 36; cx++) {
      for (let cy = 24; cy < 32; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, friction: 0.20, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Column 3 (x:44-45, y:26-31) — blocks left side again
    addHazardRect(level, 44, 26, 2, 6, 'pillar_g2_3');
    for (let cx = 42; cx < 48; cx++) {
      for (let cy = 24; cy < 32; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, friction: 0.20, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Column 4 (x:56-57, y:24-29) — final pillar before exit
    addHazardRect(level, 56, 24, 2, 6, 'pillar_g2_4');
    for (let cx = 54; cx < 60; cx++) {
      for (let cy = 24; cy < 32; cy++) {
        setSurface(level, cx, cy, { baseHeight: 4, shape: SHAPES.FLAT, friction: 0.20, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Two timed gates — must navigate pillars AND time the gates
    addTimedGate(level, 'gate_g3', 26, 24, 6, 8, 2, 1.6, 1.0);
    addTimedGate(level, 'gate_g4', 50, 24, 6, 8, 2, 1.3, 0.9);
    wallRing(level, 12, 24, 52, 8, 6, {
      gaps: [
        { x: 63, y: 24 }, { x: 63, y: 25 }, { x: 63, y: 26 }, { x: 63, y: 27 },
        { x: 63, y: 28 }, { x: 63, y: 29 }, { x: 63, y: 30 }, { x: 63, y: 31 },
        { x: 12, y: 24 }, { x: 12, y: 25 }, { x: 12, y: 26 }, { x: 12, y: 27 },
        { x: 12, y: 28 }, { x: 12, y: 29 }, { x: 12, y: 30 }, { x: 12, y: 31 }
      ]
    });

    // Second merge platform (z=4), 10×14
    fillTrack(level, 2, 18, 10, 14, 4);
    wallRing(level, 2, 18, 10, 14, 6, {
      gaps: [
        { x: 11, y: 18 }, { x: 11, y: 19 }, { x: 11, y: 20 }, { x: 11, y: 21 }, { x: 11, y: 22 },
        { x: 11, y: 24 }, { x: 11, y: 25 }, { x: 11, y: 26 }, { x: 11, y: 27 },
        { x: 11, y: 28 }, { x: 11, y: 29 }, { x: 11, y: 30 }, { x: 11, y: 31 },
        { x: 5, y: 31 }, { x: 6, y: 31 }, { x: 7, y: 31 }, { x: 8, y: 31 }
      ]
    });

    // Final ramp south (z=4→0), 5×8 — covers full width of pillar maze exit
    placeRamp(level, { x: 4, y: 32, dir: 'south', length: 5, width: 8, startZ: 4, endZ: 0 });
    // Goal basin (z=0), 14×14
    fillTrack(level, 2, 37, 14, 14, 0);
    wallRing(level, 2, 37, 14, 14, 2, {
      gaps: [{ x: 4, y: 37 }, { x: 5, y: 37 }, { x: 6, y: 37 }, { x: 7, y: 37 },
             { x: 8, y: 37 }, { x: 9, y: 37 }, { x: 10, y: 37 }, { x: 11, y: 37 }]
    });
    // === SECTION 3: Final gauntlet corridor — narrow, ice, sweepers ===
    // Bridge y:51-52 (2-tile void between first goal basin south wall y:50 and third corridor north wall y:53)
    // Also bridge y:52 open-south-wall tiles which were floating in void
    fillTrack(level, 6, 51, 10, 2, 2);
    // Bridge x:65 (1-tile void between third corridor east wall x:65 and final goal basin west wall x:66)
    fillTrack(level, 65, 53, 1, 5, 2);
    // Third corridor (z=2), 60×5 — ice floor, 3 sweepers, crumble sections, hazard strips
    fillTrack(level, 6, 53, 60, 5, 2);
    // Ice floor throughout
    for (let cx = 7; cx < 65; cx++) {
      for (let cy = 53; cy < 58; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.18 });
      }
    }
    // Crumble sections (very fast — 0.08s)
    for (let cx = 18; cx < 26; cx++) {
      setSurface(level, cx, 54, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 55, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 56, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    }
    for (let cx = 44; cx < 52; cx++) {
      setSurface(level, cx, 54, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 55, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 56, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    }
    // Sweepers spaced along the corridor
    addActor(level, {
      id: 'sweeper_g3_a', kind: ACTOR_KINDS.SWEEPER,
      x: 22, y: 55, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 2.2, fatal: true
    });
    addActor(level, {
      id: 'sweeper_g3_b', kind: ACTOR_KINDS.SWEEPER,
      x: 38, y: 55, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: -2.5, fatal: true
    });
    addActor(level, {
      id: 'sweeper_g3_c', kind: ACTOR_KINDS.SWEEPER,
      x: 55, y: 55, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.2, armWidth: 0.22, angularSpeed: 2.8, fatal: true
    });
    // Hazard strips
    addHazardRect(level, 30, 53, 3, 5, 'g3_spikes_a');
    addHazardRect(level, 48, 53, 3, 5, 'g3_spikes_b');
    // Void-edge conveyors in Section 3 corridor — push toward north/south void edges
    setSurface(level, 30, 53, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.18, conveyor: { x: 2.2, y: -3.0, strength: 3.5 } });
    setSurface(level, 48, 57, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.18, conveyor: { x: -2.5, y: 3.2, strength: 3.5 } });
    setSurface(level, 60, 53, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.18, conveyor: { x: 3.0, y: -2.8, strength: 3.5 } });
    // Timed gate near the end — tighter timing than before
    addTimedGate(level, 'gate_g3_final', 58, 54, 5, 3, 2, 1.0, 0.7);
    wallRing(level, 6, 53, 60, 5, 4, {
      gaps: [
        { x: 6, y: 53 }, { x: 6, y: 54 }, { x: 6, y: 55 }, { x: 6, y: 56 }, { x: 6, y: 57 },
        { x: 65, y: 53 }, { x: 65, y: 54 }, { x: 65, y: 55 }, { x: 65, y: 56 }, { x: 65, y: 57 }
      ]
    });
    // Final goal basin (z=2), 10×10
    fillTrack(level, 66, 51, 10, 10, 2);
    wallRing(level, 66, 51, 10, 10, 4, {
      gaps: [
        { x: 66, y: 53 }, { x: 66, y: 54 }, { x: 66, y: 55 }, { x: 66, y: 56 }, { x: 66, y: 57 }
      ]
    });
    setGoal(level, 71, 56, 0.44);

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
    return registerLevel(level);
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
      timeLimit: 60,
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
    setSurface(level, 4, 15, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    setSurface(level, 5, 15, { baseHeight: 14, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
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
        // West entry (from Floor 3 east corridor ramp)
        { x: 12, y: 34 }, { x: 12, y: 35 }, { x: 12, y: 36 }, { x: 12, y: 37 }, { x: 12, y: 38 },
        // South exit (to Floor 4 fork junction) — was missing, caused blocking wall
        { x: 13, y: 38 }, { x: 14, y: 38 }, { x: 15, y: 38 }, { x: 16, y: 38 }, { x: 17, y: 38 },
        { x: 18, y: 38 }, { x: 19, y: 38 }, { x: 20, y: 38 }, { x: 21, y: 38 }, { x: 22, y: 38 },
        { x: 23, y: 38 }, { x: 24, y: 38 }, { x: 25, y: 38 }, { x: 26, y: 38 }, { x: 27, y: 38 },
        { x: 28, y: 38 }, { x: 29, y: 38 }, { x: 30, y: 38 }, { x: 31, y: 38 }, { x: 32, y: 38 },
        { x: 33, y: 38 }, { x: 34, y: 38 }, { x: 35, y: 38 }, { x: 36, y: 38 }, { x: 37, y: 38 },
        { x: 38, y: 38 }, { x: 39, y: 38 }
      ]
    });

    // Elevator shortcuts
    addElevator(level, 'elev_a', 6, 24, 2, 10, 3, 3, 0.9, 5.0);
    addElevator(level, 'elev_b', 6, 34, 2, 10, 3, 3, 0.9, 5.0);
    // Void-edge conveyors — push marble toward outer void edges on each floor
    setSurface(level, 12, 4, { baseHeight: 22, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: -2.8, strength: 3.5 } });
    setSurface(level, 38, 8, { baseHeight: 22, shape: SHAPES.FLAT, conveyor: { x: 3.5, y: -3.0, strength: 3.5 } });
    setSurface(level, 2, 14, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: -3.5, y: 2.8, strength: 3.5 } });
    setSurface(level, 28, 18, { baseHeight: 14, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: 3.2, strength: 3.5 } });
    setSurface(level, 12, 29, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: 3.5, strength: 3.5 } });
    setSurface(level, 38, 33, { baseHeight: 6, shape: SHAPES.FLAT, conveyor: { x: 3.5, y: 3.0, strength: 3.5 } });

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

    // Bridge y:38 (1-tile void between Floor 3 south corridor floor end y:37 and Floor 4 start y:39)
    fillTrack(level, 12, 38, 28, 1, 2);
    // Floor 4 fork junction (z=2), 28×5
    fillTrack(level, 12, 39, 28, 5, 2);
    addActor(level, {
      id: 'bar_floor4', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 26, y: 40, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 2.0, fatal: true
    });
    wallRing(level, 12, 39, 28, 5, 4, {
      gaps: [
        // West entry (from old goal basin)
        { x: 12, y: 39 }, { x: 12, y: 40 }, { x: 12, y: 41 }, { x: 12, y: 42 }, { x: 12, y: 43 },
        // North entry (from Floor 3 south corridor) — was missing, caused blocking wall
        { x: 13, y: 39 }, { x: 14, y: 39 }, { x: 15, y: 39 }, { x: 16, y: 39 }, { x: 17, y: 39 },
        { x: 18, y: 39 }, { x: 19, y: 39 }, { x: 20, y: 39 }, { x: 21, y: 39 }, { x: 22, y: 39 },
        { x: 23, y: 39 }, { x: 24, y: 39 }, { x: 25, y: 39 }, { x: 26, y: 39 }, { x: 27, y: 39 },
        { x: 28, y: 39 }, { x: 29, y: 39 }, { x: 30, y: 39 }, { x: 31, y: 39 }, { x: 32, y: 39 },
        { x: 33, y: 39 }, { x: 34, y: 39 }, { x: 35, y: 39 }, { x: 36, y: 39 }, { x: 37, y: 39 },
        { x: 38, y: 39 }, { x: 39, y: 39 },
        // Path A: spiral continues east
        { x: 39, y: 40 }, { x: 39, y: 41 }, { x: 39, y: 42 }, { x: 39, y: 43 },
        // Path B: shortcut south drop
        { x: 22, y: 43 }, { x: 23, y: 43 }, { x: 24, y: 43 }, { x: 25, y: 43 }
      ]
    });

    // Path A: Floor 4 east corridor (z=2), 28×5 — ice floor + 3 timed gates + hazard strips
    fillTrack(level, 40, 39, 28, 5, 2);
    // Ice floor — marble slides into gates
    for (let cx = 41; cx < 67; cx++) {
      for (let cy = 40; cy < 43; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.22 });
      }
    }
    // Three timed gates — tight timing on ice
    addTimedGate(level, 'gate_floor4a', 46, 40, 2, 3, 2, 1.6, 1.0);
    addTimedGate(level, 'gate_floor4b', 54, 40, 2, 3, 2, 1.3, 0.9);
    addTimedGate(level, 'gate_floor4c', 62, 40, 6, 3, 2, 1.1, 0.8);
    // Hazard strip before first gate
    addHazardRect(level, 43, 39, 2, 5, 'td_spikes_f4');
    wallRing(level, 40, 39, 28, 5, 4, {
      gaps: [
        // West entry (from fork junction)
        { x: 40, y: 39 }, { x: 40, y: 40 }, { x: 40, y: 41 }, { x: 40, y: 42 }, { x: 40, y: 43 },
        // South exit (to ramp at x:64-68, y=44)
        { x: 64, y: 43 }, { x: 65, y: 43 }, { x: 66, y: 43 }, { x: 67, y: 43 }
      ]
    });
    // Ramp south (z=2→-2), 5×5
    placeRamp(level, { x: 64, y: 44, dir: 'south', length: 5, width: 5, startZ: 2, endZ: -2 });
    // Floor 5 east corridor (z=-2), 28×5 — sweepers + crumble + hazard
    fillTrack(level, 40, 49, 28, 5, -2);
    // Crumble section mid-corridor
    for (let cx = 46; cx < 54; cx++) {
      for (let cy = 50; cy < 53; cy++) {
        setSurface(level, cx, cy, { baseHeight: -2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Two sweepers
    addActor(level, {
      id: 'sweeper_f5a', kind: ACTOR_KINDS.SWEEPER,
      x: 56, y: 51, z: -2, topHeight: -2,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: 1.6, fatal: true
    });
    addActor(level, {
      id: 'sweeper_f5b', kind: ACTOR_KINDS.SWEEPER,
      x: 63, y: 51, z: -2, topHeight: -2,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: -1.9, fatal: true
    });
    addHazardRect(level, 42, 49, 2, 5, 'td_spikes_f5');
    wallRing(level, 40, 49, 28, 5, 0, {
      gaps: [
        // North wall: ramp from Path A lands at x:64-68 y:44-48 — open north wall at x:64-67 y:49
        { x: 64, y: 49 }, { x: 65, y: 49 }, { x: 66, y: 49 }, { x: 67, y: 49 },
        // East wall: ramp approach from above
        { x: 67, y: 44 }, { x: 67, y: 45 }, { x: 67, y: 46 }, { x: 67, y: 47 }, { x: 67, y: 48 }, { x: 67, y: 50 }, { x: 67, y: 51 }, { x: 67, y: 52 }, { x: 67, y: 53 },
        // West exit to ramp going further down
        { x: 40, y: 49 }, { x: 40, y: 50 }, { x: 40, y: 51 }, { x: 40, y: 52 }, { x: 40, y: 53 }
      ]
    });
    placeRamp(level, { x: 40, y: 54, dir: 'west', length: 5, width: 5, startZ: -2, endZ: -6 });

    // Path B: crumble shortcut south
    fillTrack(level, 20, 44, 6, 14, 2);
    for (let cx = 21; cx < 25; cx++) {
      for (let cy = 45; cy < 57; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
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
      timeLimit: 60,
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

    // ACT 1 — Path A (north): MANDATORY platform crossing
    // Narrow 3-tile approach with crumble — can't loiter waiting for platform.
    // 18-tile void gap — physically impossible to jump across.
    // Platform is 3 wide and slow (0.18 speed) — must time it carefully.
    // Sweeper on landing pad — must step off quickly.
    // Timed gate at ramp entry — must navigate past sweeper before gate closes.
    fillTrack(level, 14, 2, 14, 3, 24);  // narrow 3-tile approach
    // Crumble on the last 6 tiles of approach — can't stand still waiting
    for (let cx = 22; cx < 28; cx++) {
      for (let cy = 2; cy < 5; cy++) {
        setSurface(level, cx, cy, { baseHeight: 24, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.2 } });
      }
    }
    // 18-tile void — the platform is the ONLY way across
    clearSurfaceRect(level, 28, 2, 18, 3);
    // Bridge starts 2 tiles onto the west landing so the marble can board
    // without standing right at the void edge. Endpoint moved from (43,2) to (46,2)
    // so it lands on the first tile of the landing pad (not in the void gap).
    addMovingBridge(level, 'bridge_fa1', [
      { x: 26, y: 2, z: 24 },
      { x: 46, y: 2, z: 24 }
    ], 3, 3, 0.18);
    // Landing pad — 8 tiles, then ramp
    fillTrack(level, 46, 2, 10, 3, 24);
    // Sweeper guards the landing — must step off platform and dodge immediately
    addActor(level, {
      id: 'sweeper_fa_path_a', kind: ACTOR_KINDS.SWEEPER,
      x: 48, y: 3, z: 24, topHeight: 24,
      width: 1, height: 1, armLength: 1.8, armWidth: 0.22, angularSpeed: 2.4, fatal: true
    });
    // Timed gate just before the ramp — tight timing
    addTimedGate(level, 'gate_fa1', 52, 2, 26, 3, 2, 1.4, 1.0);
    placeRamp(level, { x: 55, y: 2, dir: 'east', length: 6, width: 3, startZ: 24, endZ: 18 });

    // ACT 1 — Path B (center): sweeper + crumble
    fillTrack(level, 14, 7, 36, 5, 24);
    addActor(level, {
      id: 'sweeper_fa1', kind: ACTOR_KINDS.SWEEPER,
      x: 28, y: 8, z: 24, topHeight: 24,
      width: 1, height: 1, armLength: 2.8, armWidth: 0.22, angularSpeed: 1.1, fatal: true
    });
    for (let cx = 36; cx < 42; cx++) {
      setSurface(level, cx, 8,  { baseHeight: 24, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 9,  { baseHeight: 24, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 10, { baseHeight: 24, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    }
    placeRamp(level, { x: 50, y: 7, dir: 'east', length: 6, width: 5, startZ: 24, endZ: 18 });

    // Void-edge conveyors in ACT 1 paths — push toward outer void edges
    setSurface(level, 14, 2, { baseHeight: 24, shape: SHAPES.FLAT, conveyor: { x: -3.0, y: -3.2, strength: 3.5 } });
    setSurface(level, 55, 2, { baseHeight: 24, shape: SHAPES.FLAT, conveyor: { x: 3.2, y: -3.0, strength: 3.5 } });
    setSurface(level, 14, 11, { baseHeight: 24, shape: SHAPES.FLAT, conveyor: { x: -3.2, y: 3.0, strength: 3.5 } });
    setSurface(level, 55, 16, { baseHeight: 24, shape: SHAPES.FLAT, conveyor: { x: 3.0, y: 3.2, strength: 3.5 } });
    // ACT 1 — Path C (south): conveyor assist + rotating bar mid-corridor
    fillTrack(level, 14, 12, 40, 5, 24);
    for (let cx = 20; cx < 50; cx++) {
      for (let cy = 12; cy < 17; cy++) {
        // Diagonal conveyor: pushes marble toward south void edge
        const cxOff3 = (cx % 3) - 1;  // -1, 0, or 1 based on column
        setSurface(level, cx, cy, { baseHeight: 24, shape: SHAPES.FLAT, conveyor: { x: 2.2 + cxOff3 * 0.4, y: -1.8, strength: 3.0 } });
      }
    }
    // Rotating bar mid-corridor — marble must time passage while being pushed by conveyor
    addActor(level, {
      id: 'bar_path_c', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 34, y: 14, z: 24, topHeight: 24,
      width: 1, height: 1, armLength: 2.0, armWidth: 0.22, angularSpeed: -1.5, fatal: true
    });
    placeRamp(level, { x: 54, y: 12, dir: 'east', length: 6, width: 5, startZ: 24, endZ: 18 });

    // ACT 2 — Central citadel (z=18), 24×20 — dense obstacle field
    fillTrack(level, 58, 2, 24, 20, 18);
    // Ice floor — marble slides into obstacles
    for (let cx = 59; cx < 81; cx++) {
      for (let cy = 3; cy < 21; cy++) {
        setSurface(level, cx, cy, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.20 });
      }
    }
    // Rotating bars — two counter-rotating, two more added
    addActor(level, {
      id: 'bar_fa1', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 64, y: 7, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 2.2, fatal: true
    });
    addActor(level, {
      id: 'bar_fa2', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 76, y: 7, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: -2.0, fatal: true
    });
    addActor(level, {
      id: 'bar_fa3', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 64, y: 16, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: -2.4, fatal: true
    });
    addActor(level, {
      id: 'bar_fa4', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 76, y: 16, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 2.6, fatal: true
    });
    // Sweepers guarding the exits
    addActor(level, {
      id: 'sweeper_act2_a', kind: ACTOR_KINDS.SWEEPER,
      x: 70, y: 4, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.8, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweeper_act2_b', kind: ACTOR_KINDS.SWEEPER,
      x: 70, y: 19, z: 18, topHeight: 18,
      width: 1, height: 1, armLength: 2.8, armWidth: 0.22, angularSpeed: -2.0, fatal: true
    });
    // Hazard strips creating forced corridors
    addHazardRect(level, 60, 10, 4, 4, 'act2_spikes_a');
    addHazardRect(level, 72, 10, 4, 4, 'act2_spikes_b');
    // Timed gate blocking the south exit
    addTimedGate(level, 'gate_fa2', 66, 20, 18, 3, 2, 1.6, 1.0);
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
    // Bridge starts 2 tiles onto the west landing, ends 2 tiles onto east landing.
    addMovingBridge(level, 'bridge_fa2', [
      { x: 66, y: 28, z: 18 },
      { x: 74, y: 28, z: 18 }
    ], 4, 5, 0.5);
    fillTrack(level, 76, 28, 6, 6, 18);
    // Connector strip: bridge the void row at y:27 between the fast path ramp (y:22-26)
    // and the east landing (y:28-33). Without this the east landing is an unreachable island.
    fillTrack(level, 76, 27, 6, 1, 18);
    placeRamp(level, { x: 58, y: 34, dir: 'south', length: 8, width: 6, startZ: 18, endZ: 6 });

    // Void-edge conveyors in ACT 2 citadel — push toward outer void edges
    setSurface(level, 58, 2, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: -3.2, y: -3.0, strength: 3.8 } });
    setSurface(level, 81, 2, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: 3.5, y: -3.2, strength: 3.8 } });
    setSurface(level, 58, 20, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: -3.0, y: 3.5, strength: 3.8 } });
    setSurface(level, 81, 20, { baseHeight: 18, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: 3.2, y: 3.5, strength: 3.8 } });
    // ACT 4 — Final descent and goal — filled with hazards
    fillTrack(level, 56, 42, 24, 14, 6);
    // Sweepers guarding the descent
    addActor(level, {
      id: 'sweeper_act4a', kind: ACTOR_KINDS.SWEEPER,
      x: 62, y: 46, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'sweeper_act4b', kind: ACTOR_KINDS.SWEEPER,
      x: 72, y: 50, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: -1.8, fatal: true
    });
    // Hazard strips forcing navigation around sweepers
    addHazardRect(level, 56, 44, 4, 6, 'act4_spikes_a');
    addHazardRect(level, 76, 48, 4, 6, 'act4_spikes_b');
    // Crumble section before the ramp
    for (let cx = 58; cx < 78; cx++) {
      for (let cy = 53; cy < 56; cy++) {
        setSurface(level, cx, cy, { baseHeight: 6, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Timed gate blocking the ramp entry
    addTimedGate(level, 'gate_act4', 60, 56, 6, 3, 2, 1.6, 1.0);
    // Narrow ramp — only 6 tiles wide, not 14 (forces precise entry)
    placeRamp(level, { x: 60, y: 56, dir: 'south', length: 6, width: 8, startZ: 6, endZ: 2 });

    // Goal basin (z=2), 16×12
    fillTrack(level, 56, 62, 16, 12, 2);
    wallRing(level, 56, 62, 16, 12, 4, {
      gaps: [
        { x: 60, y: 62 }, { x: 61, y: 62 }, { x: 62, y: 62 }, { x: 63, y: 62 },
        { x: 64, y: 62 }, { x: 65, y: 62 }, { x: 66, y: 62 }, { x: 67, y: 62 }
      ]
    });

      // === ACT 5 EXTENSION: The Grand Finale ===
    // Open south wall of goal basin to continue into ACT 5
    for (let cx = 56; cx < 72; cx++) {
      setSurface(level, cx, 73, { baseHeight: 2, shape: SHAPES.FLAT });
    }

    // ACT 5 — Three-path arena (z=2), 60×20 — ice floor makes marble hard to control
    fillTrack(level, 30, 74, 60, 20, 2);
    // Ice floor across the arena
    for (let cx = 31; cx < 89; cx++) {
      for (let cy = 75; cy < 93; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.20 });
      }
    }
    wallRing(level, 30, 74, 60, 20, 4, {
      gaps: [
        // North entry from goal basin
        { x: 60, y: 74 }, { x: 61, y: 74 }, { x: 62, y: 74 }, { x: 63, y: 74 },
        { x: 64, y: 74 }, { x: 65, y: 74 }, { x: 66, y: 74 }, { x: 67, y: 74 },
        // Path A exit (west) — narrow 3-tile
        { x: 30, y: 78 }, { x: 30, y: 79 }, { x: 30, y: 80 },
        // Path B exit (south-centre) — narrow 5-tile
        { x: 53, y: 93 }, { x: 54, y: 93 }, { x: 55, y: 93 }, { x: 56, y: 93 }, { x: 57, y: 93 },
        // Path C exit (east) — narrow 3-tile
        { x: 89, y: 78 }, { x: 89, y: 79 }, { x: 89, y: 80 }
      ]
    });
    // Additional hazard strips to create corridors through the arena
    addHazardRect(level, 36, 76, 3, 8, 'arena_col_1');
    addHazardRect(level, 46, 82, 3, 8, 'arena_col_2');
    addHazardRect(level, 68, 76, 3, 8, 'arena_col_3');
    addHazardRect(level, 78, 82, 3, 8, 'arena_col_4');
    // Arena hazards — dense obstacle field on ice floor
    // Row 1: sweepers guarding path exits
    addActor(level, {
      id: 'sweeper_act5_a', kind: ACTOR_KINDS.SWEEPER,
      x: 40, y: 80, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 3.2, armWidth: 0.22, angularSpeed: 2.1, fatal: true
    });
    addActor(level, {
      id: 'sweeper_act5_b', kind: ACTOR_KINDS.SWEEPER,
      x: 60, y: 80, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 3.2, armWidth: 0.22, angularSpeed: -2.5, fatal: true
    });
    addActor(level, {
      id: 'sweeper_act5_c', kind: ACTOR_KINDS.SWEEPER,
      x: 80, y: 80, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 3.2, armWidth: 0.22, angularSpeed: 2.8, fatal: true
    });
    // Row 2: rotating bars mid-arena
    addActor(level, {
      id: 'bar_act5_a', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 50, y: 86, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: 2.2, fatal: true
    });
    addActor(level, {
      id: 'bar_act5_b', kind: ACTOR_KINDS.ROTATING_BAR,
      x: 70, y: 86, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: -2.5, fatal: true
    });
    // Hazard strips blocking direct routes to exits
    addHazardRect(level, 32, 78, 4, 6, 'act5_spikes_west');
    addHazardRect(level, 84, 78, 4, 6, 'act5_spikes_east');
    addHazardRect(level, 52, 89, 8, 3, 'act5_spikes_south');
    // Timed gate blocking south path exit — tighter timing
    addTimedGate(level, 'gate_act5', 52, 91, -2, 3, 2, 1.2, 0.7);
    // Void-edge conveyors in ACT 5 arena — push marble toward void edges
    setSurface(level, 32, 74, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: -3.2, y: -3.0, strength: 3.8 } });
    setSurface(level, 88, 74, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: 3.2, y: -3.0, strength: 3.8 } });
    setSurface(level, 32, 92, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: -3.0, y: 3.2, strength: 3.8 } });
    setSurface(level, 88, 92, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: 3.0, y: 3.2, strength: 3.8 } });
    setSurface(level, 60, 74, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: 2.5, y: -3.5, strength: 3.8 } });
    setSurface(level, 55, 92, { baseHeight: 2, shape: SHAPES.FLAT, friction: 0.20, conveyor: { x: -2.8, y: 3.5, strength: 3.8 } });

    // Path A (west): MANDATORY PLATFORM CROSSING
    // West approach — 3-tile wide corridor leading to the gap
    fillTrack(level, 4, 78, 8, 3, 2);
    // Crumble tiles on west approach — can't wait here
    for (let cx = 5; cx < 12; cx++) {
      setSurface(level, cx, 78, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 79, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      setSurface(level, cx, 80, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
    }
    // Void gap x:12-25 — 14 tiles wide, physically impossible to cross without platform
    // Platform: 5 tiles wide, travels the full gap slowly.
    // Starts 2 tiles onto the west landing, ends 2 tiles onto east landing.
    addMovingBridge(level, 'bridge_act5a', [
      { x: 10, y: 78, z: 2 },
      { x: 22, y: 78, z: 2 }
    ], 5, 3, 0.20);
    // East landing — 3-tile wide, hazard strip + sweeper
    fillTrack(level, 26, 78, 4, 3, 2);
    addHazardRect(level, 26, 78, 2, 3, 'path_a_spikes_land');
    addActor(level, {
      id: 'sweeper_path_a', kind: ACTOR_KINDS.SWEEPER,
      x: 28, y: 79, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 1.6, armWidth: 0.22, angularSpeed: 2.5, fatal: true
    });
    wallRing(level, 4, 78, 26, 3, 4, {
      gaps: [
        { x: 4, y: 78 }, { x: 4, y: 79 }, { x: 4, y: 80 },
        { x: 29, y: 78 }, { x: 29, y: 79 }, { x: 29, y: 80 }
      ]
    });
    placeRamp(level, { x: 4, y: 81, dir: 'south', length: 6, width: 3, startZ: 2, endZ: -2 });

    // Path B (south): crumble descent — narrow 6-tile corridor with sweeper + hazard
    fillTrack(level, 51, 94, 8, 12, 2);
    // All crumble — fast delay, must move quickly
    for (let cx = 52; cx < 58; cx++) {
      for (let cy = 95; cy < 105; cy++) {
        setSurface(level, cx, cy, { baseHeight: 2, shape: SHAPES.FLAT, crumble: { delay: 0.10, downtime: 1.0 } });
      }
    }
    // Sweeper mid-corridor — must time it while crumble disappears under you
    addActor(level, {
      id: 'sweeper_path_b', kind: ACTOR_KINDS.SWEEPER,
      x: 55, y: 100, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    // Hazard strip near exit
    addHazardRect(level, 52, 102, 6, 2, 'path_b_spikes');
    wallRing(level, 51, 94, 8, 12, 4, {
      gaps: [
        { x: 53, y: 93 }, { x: 54, y: 93 }, { x: 55, y: 93 }, { x: 56, y: 93 }, { x: 57, y: 93 },
        { x: 53, y: 105 }, { x: 54, y: 105 }, { x: 55, y: 105 }, { x: 56, y: 105 }, { x: 57, y: 105 }
      ]
    });
    // Narrow ramp — only 5 tiles wide
    placeRamp(level, { x: 52, y: 106, dir: 'south', length: 6, width: 5, startZ: 2, endZ: -2 });

    // Path C (east): triple sweeper gauntlet on narrow 3-tile corridor
    fillTrack(level, 90, 78, 16, 3, 2);
    addActor(level, {
      id: 'sweeper_act5a', kind: ACTOR_KINDS.SWEEPER,
      x: 94, y: 79, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 1.4, armWidth: 0.22, angularSpeed: 2.2, fatal: true
    });
    addActor(level, {
      id: 'sweeper_act5b', kind: ACTOR_KINDS.SWEEPER,
      x: 99, y: 79, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 1.4, armWidth: 0.22, angularSpeed: -2.6, fatal: true
    });
    addActor(level, {
      id: 'sweeper_act5c', kind: ACTOR_KINDS.SWEEPER,
      x: 104, y: 79, z: 2, topHeight: 2,
      width: 1, height: 1, armLength: 1.4, armWidth: 0.22, angularSpeed: 3.0, fatal: true
    });
    wallRing(level, 90, 78, 16, 3, 4, {
      gaps: [
        { x: 90, y: 78 }, { x: 90, y: 79 }, { x: 90, y: 80 },
        { x: 105, y: 78 }, { x: 105, y: 79 }, { x: 105, y: 80 }
      ]
    });
    placeRamp(level, { x: 101, y: 81, dir: 'south', length: 6, width: 3, startZ: 2, endZ: -2 });

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
    sampleActorSurfaceDirect,
    createDynamicState,
    advanceDynamicState,
    getActorBlockingOverlaps,
    getHazardContacts,
    resolveSupportInteraction,
    isCrumbleBroken,
    setGoal,
    placeTunnel
  };
})();