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

  // Shared singleton for void cells — avoids allocating ~10K identical objects per level
  const _VOID_CELL = Object.freeze({
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
  });
  function makeVoidSurfaceCell() {
    return _VOID_CELL;
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
      friction: patch.ice ? 0.6 : (patch.friction ?? 1),
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
      _ty: patch._ty ?? undefined,
      // Hidden flag — tile is invisible and non-collidable until secret is revealed
      hidden: !!patch.hidden,
      // When hidden and not revealed, render/collide as flat tile at this height (null = void)
      hiddenFallback: patch.hiddenFallback ?? null
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
      data: patch.data ?? null,
      hidden: !!patch.hidden
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
      data: actor.data ?? null,
      // Tunnel-specific fields
      tunnelPath: actor.tunnelPath ?? null,
      tunnelSpeed: actor.tunnelSpeed ?? 8,
      tunnelRadius: actor.tunnelRadius ?? 0.45,
      exitType: actor.exitType ?? 'emerge',
      exitVelocity: actor.exitVelocity ?? null,
      // Secret/hidden flag — actor is invisible and non-interactive until revealed
      hidden: !!actor.hidden
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
    timeLimit = 60,
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
      timeLimit,
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
      // Bowl shape: rim is at baseHeight (flush with surrounding terrain),
      // center dips DOWN by 'rise' amount
      const z = cell.baseHeight - cell.rise * (1 - t);
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

    // Hidden tiles: when secret is not revealed, use fallback behavior
    if (cell.hidden && !(runtime && runtime.secretRevealed)) {
      // Tiles with hiddenFallback appear as flat tiles at the fallback height
      if (cell.hiddenFallback) {
        return {
          source: 'surface',
          cell: cell,
          tx,
          ty,
          u: x - tx,
          v: y - ty,
          z: cell.hiddenFallback,
          gradient: { gx: 0, gy: 0 },
          trigger: null,
          friction: 1,
          conveyor: null,
          bounce: 0
        };
      }
      // Tiles without fallback (secret platform) are void
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

  // Reusable blocker surface object — avoids allocation per sampleWalkableSurface call
  const _blockerSample = {
    source: 'blocker', cell: null, tx: 0, ty: 0, u: 0, v: 0, z: 0,
    gradient: { gx: 0, gy: 0 }, trigger: null, friction: 1,
    conveyor: null, bounce: 0, failType: null, landingPad: false
  };

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
      _blockerSample.cell = blocker;
      _blockerSample.tx = tx;
      _blockerSample.ty = ty;
      _blockerSample.u = x - tx;
      _blockerSample.v = y - ty;
      _blockerSample.z = blocker.top;
      _blockerSample.trigger = getTriggerCell(level, tx, ty);
      blockerSurface = _blockerSample;
    }

    // Pick highest z without allocating an array or sorting
    let best = null;
    if (staticSurface && (!best || staticSurface.z > best.z)) best = staticSurface;
    if (blockerSurface && (!best || blockerSurface.z > best.z)) best = blockerSurface;
    if (actorSurface && (!best || actorSurface.z > best.z)) best = actorSurface;
    return best;
  }

  function sampleVisualSurface(level, x, y, runtime = null) {
    return sampleWalkableSurface(level, x, y, { runtime });
  }

// Pre-allocated sample buffer to avoid per-tick GC pressure.
// sampleSupportSurface is called 1-2x per physics tick (60/sec).
const _ssBuf = new Array(17);    // max 17 samples
const _ssWBuf = new Array(17);   // parallel weight buffer (stores weight for each sample)
const _ssWeights = [2.4, 1.5, 1.5, 1.5, 1.5, 1.15, 1.15, 1.15, 1.15, 0.8, 0.8, 0.8, 0.8, 0.65, 0.65, 0.65, 0.65];
const _ssTotalWeight = _ssWeights.reduce((a, b) => a + b, 0);
// Reusable result object — only one caller reads it at a time
const _ssResult = {
  source: null, cell: null, tx: 0, ty: 0, u: 0, v: 0, z: 0,
  gradient: { gx: 0, gy: 0 }, trigger: null, friction: 1,
  conveyor: null, bounce: 0, failType: null, landingPad: false,
  centerSample: null, supportSamples: null, supportRatio: 0,
  minSupportZ: 0, maxSupportZ: 0,
  actor: null, actorState: null
};

function sampleSupportSurface(level, x, y, radius = 0.18, clearance = 0.72, options = {}) {
  const minRatio = options.minRatio ?? 0.45;
  const runtime = options.runtime ?? null;

  const outer = radius * clearance;
  const inner = outer * 0.62;
  const dOuter = outer * 0.7071;
  const dInner = inner * 0.7071;

  // Inline offsets to avoid array allocation
  const ox0 = 0,        oy0 = 0;
  const ox1 = inner,    oy1 = 0;
  const ox2 = -inner,   oy2 = 0;
  const ox3 = 0,        oy3 = inner;
  const ox4 = 0,        oy4 = -inner;
  const ox5 = dInner,   oy5 = dInner;
  const ox6 = dInner,   oy6 = -dInner;
  const ox7 = -dInner,  oy7 = dInner;
  const ox8 = -dInner,  oy8 = -dInner;
  const ox9 = outer,    oy9 = 0;
  const ox10 = -outer,  oy10 = 0;
  const ox11 = 0,       oy11 = outer;
  const ox12 = 0,       oy12 = -outer;
  const ox13 = dOuter,  oy13 = dOuter;
  const ox14 = dOuter,  oy14 = -dOuter;
  const ox15 = -dOuter, oy15 = dOuter;
  const ox16 = -dOuter, oy16 = -dOuter;

  const _opts = { runtime };
  let sampleCount = 0;
  let center = null;
  let hitWeight = 0;

  // Sample all 17 points — store sample and its weight in parallel buffers
  const s0 = sampleWalkableSurface(level, x + ox0, y + oy0, _opts);
  center = s0;
  if (s0) { _ssBuf[sampleCount] = s0; _ssWBuf[sampleCount] = _ssWeights[0]; sampleCount++; hitWeight += _ssWeights[0]; }

  const s1 = sampleWalkableSurface(level, x + ox1, y + oy1, _opts);
  if (s1) { _ssBuf[sampleCount] = s1; _ssWBuf[sampleCount] = _ssWeights[1]; sampleCount++; hitWeight += _ssWeights[1]; }
  const s2 = sampleWalkableSurface(level, x + ox2, y + oy2, _opts);
  if (s2) { _ssBuf[sampleCount] = s2; _ssWBuf[sampleCount] = _ssWeights[2]; sampleCount++; hitWeight += _ssWeights[2]; }
  const s3 = sampleWalkableSurface(level, x + ox3, y + oy3, _opts);
  if (s3) { _ssBuf[sampleCount] = s3; _ssWBuf[sampleCount] = _ssWeights[3]; sampleCount++; hitWeight += _ssWeights[3]; }
  const s4 = sampleWalkableSurface(level, x + ox4, y + oy4, _opts);
  if (s4) { _ssBuf[sampleCount] = s4; _ssWBuf[sampleCount] = _ssWeights[4]; sampleCount++; hitWeight += _ssWeights[4]; }

  const s5 = sampleWalkableSurface(level, x + ox5, y + oy5, _opts);
  if (s5) { _ssBuf[sampleCount] = s5; _ssWBuf[sampleCount] = _ssWeights[5]; sampleCount++; hitWeight += _ssWeights[5]; }
  const s6 = sampleWalkableSurface(level, x + ox6, y + oy6, _opts);
  if (s6) { _ssBuf[sampleCount] = s6; _ssWBuf[sampleCount] = _ssWeights[6]; sampleCount++; hitWeight += _ssWeights[6]; }
  const s7 = sampleWalkableSurface(level, x + ox7, y + oy7, _opts);
  if (s7) { _ssBuf[sampleCount] = s7; _ssWBuf[sampleCount] = _ssWeights[7]; sampleCount++; hitWeight += _ssWeights[7]; }
  const s8 = sampleWalkableSurface(level, x + ox8, y + oy8, _opts);
  if (s8) { _ssBuf[sampleCount] = s8; _ssWBuf[sampleCount] = _ssWeights[8]; sampleCount++; hitWeight += _ssWeights[8]; }

  const s9 = sampleWalkableSurface(level, x + ox9, y + oy9, _opts);
  if (s9) { _ssBuf[sampleCount] = s9; _ssWBuf[sampleCount] = _ssWeights[9]; sampleCount++; hitWeight += _ssWeights[9]; }
  const s10 = sampleWalkableSurface(level, x + ox10, y + oy10, _opts);
  if (s10) { _ssBuf[sampleCount] = s10; _ssWBuf[sampleCount] = _ssWeights[10]; sampleCount++; hitWeight += _ssWeights[10]; }
  const s11 = sampleWalkableSurface(level, x + ox11, y + oy11, _opts);
  if (s11) { _ssBuf[sampleCount] = s11; _ssWBuf[sampleCount] = _ssWeights[11]; sampleCount++; hitWeight += _ssWeights[11]; }
  const s12 = sampleWalkableSurface(level, x + ox12, y + oy12, _opts);
  if (s12) { _ssBuf[sampleCount] = s12; _ssWBuf[sampleCount] = _ssWeights[12]; sampleCount++; hitWeight += _ssWeights[12]; }

  const s13 = sampleWalkableSurface(level, x + ox13, y + oy13, _opts);
  if (s13) { _ssBuf[sampleCount] = s13; _ssWBuf[sampleCount] = _ssWeights[13]; sampleCount++; hitWeight += _ssWeights[13]; }
  const s14 = sampleWalkableSurface(level, x + ox14, y + oy14, _opts);
  if (s14) { _ssBuf[sampleCount] = s14; _ssWBuf[sampleCount] = _ssWeights[14]; sampleCount++; hitWeight += _ssWeights[14]; }
  const s15 = sampleWalkableSurface(level, x + ox15, y + oy15, _opts);
  if (s15) { _ssBuf[sampleCount] = s15; _ssWBuf[sampleCount] = _ssWeights[15]; sampleCount++; hitWeight += _ssWeights[15]; }
  const s16 = sampleWalkableSurface(level, x + ox16, y + oy16, _opts);
  if (s16) { _ssBuf[sampleCount] = s16; _ssWBuf[sampleCount] = _ssWeights[16]; sampleCount++; hitWeight += _ssWeights[16]; }

  if (sampleCount === 0) return null;

  const supportRatio = hitWeight / _ssTotalWeight;
  if (supportRatio < minRatio) return null;
  if (!center && supportRatio < Math.max(minRatio, 0.62)) return null;

  // Compute anchor Z
  let anchorZ;
  if (center) {
    anchorZ = center.z;
  } else {
    let zWeightSum = 0, zWeightTotal = 0;
    for (let i = 0; i < sampleCount; i++) {
      const s = _ssBuf[i];
      const w = _ssWBuf[i];
      zWeightSum += s.z * w;
      zWeightTotal += w;
    }
    anchorZ = zWeightSum / zWeightTotal;
  }

  // Filter coherent samples and compute stats in one pass
  let coherentCount = 0;
  let coherentBlockerWeight = 0;
  let coherentNonBlockerWeight = 0;
  let gx = 0, gy = 0, weightSum = 0;
  let minZ = Infinity, maxZ = -Infinity;
  let bestSample = center;
  let bestWeight = center ? _ssWeights[0] : -1;

  for (let i = 0; i < sampleCount; i++) {
    const s = _ssBuf[i];
    if (Math.abs(s.z - anchorZ) > 0.9) continue;
    coherentCount++;
    const w = _ssWBuf[i];
    if (s.source === 'blocker') coherentBlockerWeight += w;
    else coherentNonBlockerWeight += w;
    gx += (s.gradient?.gx ?? 0) * w;
    gy += (s.gradient?.gy ?? 0) * w;
    weightSum += w;
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;
    if (!bestSample || w > bestWeight) { bestSample = s; bestWeight = w; }
  }

  if (coherentCount === 0) return null;

  if (coherentBlockerWeight > coherentNonBlockerWeight) {
    if (!center || center.source !== 'blocker') return null;
  }

  // Use center as bestSample if available
  if (center && Math.abs(center.z - anchorZ) <= 0.9) bestSample = center;

  // Populate reusable result object
  _ssResult.source = bestSample.source;
  _ssResult.cell = bestSample.cell;
  _ssResult.tx = bestSample.tx;
  _ssResult.ty = bestSample.ty;
  _ssResult.u = bestSample.u;
  _ssResult.v = bestSample.v;
  _ssResult.z = center ? center.z : anchorZ;
  _ssResult.gradient.gx = weightSum > 0 ? gx / weightSum : 0;
  _ssResult.gradient.gy = weightSum > 0 ? gy / weightSum : 0;
  _ssResult.trigger = bestSample.trigger;
  _ssResult.friction = bestSample.friction;
  _ssResult.conveyor = bestSample.conveyor;
  _ssResult.bounce = bestSample.bounce;
  _ssResult.failType = bestSample.failType;
  _ssResult.landingPad = bestSample.landingPad;
  _ssResult.actor = bestSample.actor ?? null;
  _ssResult.actorState = bestSample.actorState ?? null;
  _ssResult.centerSample = center;
  _ssResult.supportSamples = null; // no longer allocating array
  _ssResult.supportRatio = supportRatio;
  _ssResult.minSupportZ = minZ;
  _ssResult.maxSupportZ = maxZ;
  return _ssResult;
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
      // Endpoint pause: platforms pause for 1 second at each endpoint.
      // We compute a "virtual" travel that includes pause time at each end.
      const pauseDuration = actor.path.pauseDuration ?? 1.0; // seconds at each endpoint
      const pausePerEnd = pauseDuration * speed; // in travel-units
      let segmentIndex = 0;
      let t = 0;

      if (actor.path.type === 'loop') {
        const travel = (clock * speed) % points.length;
        segmentIndex = Math.floor(travel) % points.length;
        t = travel - Math.floor(travel);
        const a = points[segmentIndex];
        const b = points[(segmentIndex + 1) % points.length];
        state.x = lerp(a.x, b.x, t);
        state.y = lerp(a.y, b.y, t);
        state.z = lerp(a.z, b.z, t);
      } else {
        // Ping-pong with endpoint pauses:
        // Full cycle = forward travel + pause + reverse travel + pause
        const moveDist = totalSegments;
        const fullCycle = moveDist * 2 + pausePerEnd * 2;
        const raw = (clock * speed) % fullCycle;
        let effectiveTravel;
        if (raw < moveDist) {
          // Forward motion
          effectiveTravel = raw;
        } else if (raw < moveDist + pausePerEnd) {
          // Pause at far end
          effectiveTravel = moveDist; // clamp at end
        } else if (raw < moveDist * 2 + pausePerEnd) {
          // Reverse motion
          effectiveTravel = moveDist - (raw - moveDist - pausePerEnd);
        } else {
          // Pause at start end
          effectiveTravel = 0; // clamp at start
        }

        const forward = effectiveTravel <= moveDist && effectiveTravel >= 0;
        const ping = clamp(effectiveTravel, 0, moveDist);
        if (ping >= moveDist - 0.0001) {
          // At far endpoint
          const last = points[points.length - 1];
          state.x = last.x;
          state.y = last.y;
          state.z = last.z;
        } else if (ping <= 0.0001) {
          // At start endpoint
          const first = points[0];
          state.x = first.x;
          state.y = first.y;
          state.z = first.z;
        } else {
          segmentIndex = Math.floor(ping);
          t = ping - segmentIndex;
          const a = points[segmentIndex];
          const b = points[Math.min(segmentIndex + 1, points.length - 1)];
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
        let dx = x - closestX;
        let dy = y - closestY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radius * radius) continue;
        // FREEZE FIX: when marble center is inside the platform rect (distSq~0),
        // compute a valid push-out normal based on shortest edge distance
        if (distSq < 0.0001) {
          const toLeft = x - rect.minX;
          const toRight = rect.maxX - x;
          const toTop = y - rect.minY;
          const toBottom = rect.maxY - y;
          const minEdge = Math.min(toLeft, toRight, toTop, toBottom);
          if (minEdge === toLeft) { dx = -1; dy = 0; }
          else if (minEdge === toRight) { dx = 1; dy = 0; }
          else if (minEdge === toTop) { dx = 0; dy = -1; }
          else { dx = 0; dy = 1; }
          overlaps.push({
            penetration: radius + minEdge,
            normal: { x: dx, y: dy },
            actor,
            actorState
          });
        } else {
          const dist = Math.sqrt(distSq);
          overlaps.push({
            penetration: radius - dist,
            normal: { x: dx / dist, y: dy / dist },
            actor,
            actorState
          });
        }
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
        // Z-level check: sweeper arm sits at actor.z with visual height ~0.3 units.
        // Only hit the marble if it vertically overlaps the arm's range.
        const armZBase = (actor.z ?? 0);
        const armZTop = armZBase + 0.4;
        const marbleBottom = marble.z - marble.collisionRadius;
        const marbleTop = marble.z + marble.collisionRadius;
        if (marbleBottom > armZTop || marbleTop < armZBase) continue;

        // Arm visual is centered on actor position, extends armLength in both directions.
        // Three.js rotation.y around the vertical axis maps to game coords as:
        //   endpoint = center + (cos(angle)*armLen, -sin(angle)*armLen)
        // Physics must use the SAME sign convention so the hitbox matches the visual.
        const cx = actorState.x;
        const cy = actorState.y;
        const cosA = Math.cos(actorState.angle);
        const sinA = Math.sin(actorState.angle);
        const armLen = actor.armLength;
        const ax = cx - cosA * armLen;
        const ay = cy + sinA * armLen;
        const bx = cx + cosA * armLen;
        const by = cy - sinA * armLen;
        const px = marble.x;
        const py = marble.y;
        const vx = bx - ax;
        const vy = by - ay;
        const wx = px - ax;
        const wy = py - ay;
        const lenSq = vx * vx + vy * vy;
        const t = lenSq > 0 ? clamp((wx * vx + wy * vy) / lenSq, 0, 1) : 0;
        const closestX = ax + vx * t;
        const closestY = ay + vy * t;
        const dx = px - closestX;
        const dy = py - closestY;
        // hitRadius = marble visual edge + arm visual half-width (exact match to rendered geometry)
        const hitRadius = marble.collisionRadius + actor.armWidth * 0.5;
        const distToArm = Math.sqrt(dx * dx + dy * dy);
        if (distToArm <= hitRadius) {
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
  function placeTunnel(level, { id, path, speed = 8, radius = 0.45, exitType = 'emerge', exitVelocity = null, funnelRadius = 2, funnelDepth = null, entryZ = null, hidden = false, hiddenFallback = null }) {
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
    // Depth of funnel bowl: how much the center dips below the rim
    const fDepth = funnelDepth ?? (funnelRadius * 0.5);
    const fMaxDist = funnelRadius + 0.5; // max distance from center to outer rim edge

    // Adjust the first path point z to the bowl center so the tube
    // entrance is at the bottom of the funnel mouth, not at floor level
    const adjustedPath = path.map((p, i) => i === 0 ? { x: p.x, y: p.y, z: ez - fDepth } : p);

    // Place funnel tiles using FUNNEL shape — fill the entire square area
    // (no circular cutoff, so there are no void gaps at corners)
    for (let dy = -funnelRadius; dy <= funnelRadius; dy++) {
      for (let dx = -funnelRadius; dx <= funnelRadius; dx++) {
        const tx = entryTx + dx;
        const ty = entryTy + dy;
        // Skip center tile (that gets the trigger)
        if (dx === 0 && dy === 0) continue;
        setSurface(level, tx, ty, {
          baseHeight: ez,
          shape: SHAPES.FUNNEL,
          rise: fDepth,
          funnelCenterX: fCenterX,
          funnelCenterY: fCenterY,
          funnelMaxDist: fMaxDist,
          _tx: tx,
          _ty: ty,
          hidden: hidden,
          hiddenFallback: hiddenFallback
        });
      }
    }

    // Place entry center tile (flat, at bottom of bowl — this is where the trigger goes)
    // Center is at ez - fDepth so it's flush with the lowest point of the funnel bowl
    setSurface(level, entryTx, entryTy, { baseHeight: ez - fDepth, shape: SHAPES.FLAT, hidden: hidden, hiddenFallback: hiddenFallback });

    // Set tunnel_entry trigger on the entry tile
    setTrigger(level, entryTx, entryTy, { kind: 'tunnel_entry', data: { tunnelId: id }, hidden: hidden });

    // Place exit floor tile if exitType is 'floor' or 'emerge'
    if (exitType === 'floor' || exitType === 'emerge') {
      const exit = path[path.length - 1];
      const exitTx = Math.floor(exit.x);
      const exitTy = Math.floor(exit.y);
      setSurface(level, exitTx, exitTy, { baseHeight: exit.z, shape: SHAPES.FLAT, landingPad: true, hidden: hidden });
      // Also set adjacent tiles as landing pads
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const cell = getSurfaceCell(level, exitTx + dx, exitTy + dy);
          if (cell && cell.kind !== 'void') {
            setSurface(level, exitTx + dx, exitTy + dy, { ...cell, landingPad: true, hidden: hidden });
          }
        }
      }
    }

    // Add tunnel actor (uses adjustedPath so tube starts at bowl center)
    addActor(level, {
      id,
      kind: ACTOR_KINDS.TUNNEL,
      x: entry.x,
      y: entry.y,
      z: ez - fDepth,
      width: 1,
      height: 1,
      tunnelPath: adjustedPath,
      tunnelSpeed: speed,
      tunnelRadius: radius,
      exitType,
      exitVelocity,
      hidden: hidden
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

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 0 — Training Ground
  // Safe sandbox with no timer. Teaches movement, ramps, and goal.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTrainingGround() {
    const level = createLevelShell({
      id: 'training_ground',
      name: 'Training Ground',
      width: 80,
      height: 80,
      timeLimit: 0,
      start: { x: 10, y: 10 },
      reward: { presses: 0, unlocks: [], claimKey: 'training_ground' }
    });
    // Large open flat area at z=4
    fillTrack(level, 4, 4, 72, 72, 4);
    // Start platform slightly raised
    fillTrack(level, 6, 6, 12, 12, 5);
    // Ramp down from start platform to main floor
    placeRamp(level, { x: 18, y: 8, dir: 'east', length: 6, width: 16, startZ: 5, endZ: 4 });
    // A gentle ramp section to practice slope movement
    placeRamp(level, { x: 30, y: 20, dir: 'south', length: 8, width: 20, startZ: 4, endZ: 2 });
    fillTrack(level, 30, 28, 10, 12, 2);
    // Another ramp back up
    placeRamp(level, { x: 30, y: 40, dir: 'south', length: 6, width: 20, startZ: 2, endZ: 4 });
    // Wide corridor to goal area
    fillTrack(level, 50, 30, 20, 20, 4);
    // Goal area
    fillTrack(level, 60, 36, 10, 10, 4);
    setGoal(level, 64, 40, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 11, z: 5 });
    addGraphNode(level, { id: 'main', type: 'hub', x: 41, y: 21, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 65, y: 41, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'main', kind: 'roll' });
    addGraphEdge(level, { from: 'main', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 1 — Gentle Slopes
  // Introduction to ramps and gentle descent. Wide paths, no hazards.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildGentleSlopes() {
    const level = createLevelShell({
      id: 'gentle_slopes',
      name: 'Gentle Slopes',
      width: 100,
      height: 80,
      timeLimit: 60,
      start: { x: 10, y: 40 },
      reward: { presses: 500, unlocks: ['marble_gentle_slopes_complete'], claimKey: 'gentle_slopes' }
    });
    // Start platform at z=10
    fillTrack(level, 6, 36, 12, 10, 10);
    // Gentle ramp east descending to z=8
    placeRamp(level, { x: 18, y: 36, dir: 'east', length: 8, width: 20, startZ: 10, endZ: 8 });
    // Mid platform at z=8
    fillTrack(level, 26, 32, 16, 16, 8);
    // Fork: north path and south path, both descend to z=4
    // North path — wider, gentler slope
    placeRamp(level, { x: 32, y: 24, dir: 'north', length: 8, width: 16, startZ: 8, endZ: 6 });
    fillTrack(level, 32, 12, 8, 12, 6);
    placeRamp(level, { x: 40, y: 12, dir: 'east', length: 8, width: 16, startZ: 6, endZ: 4 });
    // South path — slightly narrower
    placeRamp(level, { x: 32, y: 48, dir: 'south', length: 8, width: 16, startZ: 8, endZ: 6 });
    fillTrack(level, 32, 56, 8, 8, 6);
    placeRamp(level, { x: 40, y: 56, dir: 'east', length: 8, width: 16, startZ: 6, endZ: 4 });
    // Merge area at z=4
    fillTrack(level, 48, 12, 12, 56, 4);
    // Final corridor to goal
    fillTrack(level, 60, 32, 24, 16, 4);
    // Ramp down to goal platform at z=2
    placeRamp(level, { x: 76, y: 34, dir: 'east', length: 6, width: 24, startZ: 4, endZ: 2 });
    fillTrack(level, 82, 34, 12, 12, 2);
    setGoal(level, 88, 40, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 41, z: 10 });
    addGraphNode(level, { id: 'mid', type: 'hub', x: 35, y: 41, z: 8 });
    addGraphNode(level, { id: 'north', type: 'route', x: 37, y: 19, z: 6 });
    addGraphNode(level, { id: 'south', type: 'route', x: 37, y: 61, z: 6 });
    addGraphNode(level, { id: 'merge', type: 'hub', x: 55, y: 41, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 89, y: 41, z: 2 });
    addGraphEdge(level, { from: 'start', to: 'mid', kind: 'descent' });
    addGraphEdge(level, { from: 'mid', to: 'north', kind: 'descent' });
    addGraphEdge(level, { from: 'mid', to: 'south', kind: 'descent' });
    addGraphEdge(level, { from: 'north', to: 'merge', kind: 'descent' });
    addGraphEdge(level, { from: 'south', to: 'merge', kind: 'descent' });
    addGraphEdge(level, { from: 'merge', to: 'goal', kind: 'descent' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 2 — Forked Path
  // Two routes diverge and rejoin. Introduces the fork/merge concept.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildForkedPath() {
    const level = createLevelShell({
      id: 'forked_path',
      name: 'Forked Path',
      width: 120,
      height: 100,
      timeLimit: 60,
      start: { x: 10, y: 50 },
      reward: { presses: 1000, unlocks: ['marble_forked_path_complete'], claimKey: 'forked_path' }
    });
    // Start area at z=8
    fillTrack(level, 6, 46, 12, 10, 8);
    // Corridor east to fork point
    fillTrack(level, 18, 46, 16, 10, 8);
    // Fork point — wide platform
    fillTrack(level, 34, 40, 12, 20, 8);
    // === Upper path (north) — scenic route with curves ===
    placeRamp(level, { x: 38, y: 32, dir: 'north', length: 8, width: 16, startZ: 8, endZ: 6 });
    fillTrack(level, 38, 20, 8, 12, 6);
    fillTrack(level, 46, 20, 20, 8, 6);
    placeRamp(level, { x: 66, y: 20, dir: 'east', length: 6, width: 16, startZ: 6, endZ: 4 });
    fillTrack(level, 72, 20, 8, 8, 4);
    placeRamp(level, { x: 72, y: 28, dir: 'south', length: 8, width: 16, startZ: 4, endZ: 2 });
    fillTrack(level, 72, 36, 8, 12, 2);
    // === Lower path (south) — direct descent ===
    placeRamp(level, { x: 38, y: 60, dir: 'south', length: 6, width: 16, startZ: 8, endZ: 6 });
    fillTrack(level, 38, 66, 8, 8, 6);
    placeRamp(level, { x: 46, y: 66, dir: 'east', length: 10, width: 16, startZ: 6, endZ: 4 });
    fillTrack(level, 56, 66, 12, 8, 4);
    placeRamp(level, { x: 68, y: 66, dir: 'east', length: 6, width: 16, startZ: 4, endZ: 2 });
    fillTrack(level, 74, 60, 8, 14, 2);
    placeRamp(level, { x: 74, y: 48, dir: 'north', length: 6, width: 16, startZ: 2, endZ: 2 });
    // Merge area at z=2
    fillTrack(level, 72, 36, 16, 32, 2);
    // Goal corridor
    fillTrack(level, 88, 44, 20, 12, 2);
    // Goal platform
    fillTrack(level, 100, 46, 10, 8, 2);
    setGoal(level, 104, 50, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 51, z: 8 });
    addGraphNode(level, { id: 'fork', type: 'fork', x: 41, y: 51, z: 8 });
    addGraphNode(level, { id: 'upper', type: 'route', x: 57, y: 25, z: 6 });
    addGraphNode(level, { id: 'lower', type: 'route', x: 61, y: 71, z: 4 });
    addGraphNode(level, { id: 'merge', type: 'hub', x: 81, y: 51, z: 2 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 105, y: 51, z: 2 });
    addGraphEdge(level, { from: 'start', to: 'fork', kind: 'roll' });
    addGraphEdge(level, { from: 'fork', to: 'upper', kind: 'descent' });
    addGraphEdge(level, { from: 'fork', to: 'lower', kind: 'descent' });
    addGraphEdge(level, { from: 'upper', to: 'merge', kind: 'descent' });
    addGraphEdge(level, { from: 'lower', to: 'merge', kind: 'descent' });
    addGraphEdge(level, { from: 'merge', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 3 — Crumble Bridge
  // Introduces crumble tiles with safe alternate paths available.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildCrumbleBridge() {
    const level = createLevelShell({
      id: 'crumble_bridge',
      name: 'Crumble Bridge',
      width: 110,
      height: 90,
      timeLimit: 60,
      start: { x: 10, y: 44 },
      reward: { presses: 1500, unlocks: ['marble_crumble_bridge_complete'], claimKey: 'crumble_bridge' }
    });
    // Start platform at z=6
    fillTrack(level, 6, 40, 12, 10, 6);
    // Corridor to first challenge
    fillTrack(level, 18, 40, 12, 10, 6);
    // First crumble bridge — shortcut across a gap (3 tiles wide)
    // The crumble tiles span a void area
    fillTrack(level, 30, 42, 16, 6, 6, { crumble: { delay: 0.8, respawn: 4.0 } });
    // Safe alternate path — goes around south
    fillTrack(level, 30, 48, 6, 12, 6);
    fillTrack(level, 30, 60, 20, 6, 6);
    fillTrack(level, 44, 48, 6, 12, 6);
    // Both paths merge
    fillTrack(level, 46, 40, 12, 10, 6);
    // Descent to mid section
    placeRamp(level, { x: 58, y: 40, dir: 'east', length: 6, width: 20, startZ: 6, endZ: 4 });
    fillTrack(level, 64, 36, 16, 16, 4);
    // Second crumble section — wider bridge, faster crumble
    fillTrack(level, 64, 28, 16, 8, 4, { crumble: { delay: 0.6, respawn: 3.5 } });
    // Safe path goes south around
    fillTrack(level, 64, 52, 16, 6, 4);
    fillTrack(level, 80, 36, 6, 22, 4);
    // Merge and final corridor
    fillTrack(level, 80, 28, 6, 8, 4);
    fillTrack(level, 80, 32, 20, 16, 4);
    // Goal area
    placeRamp(level, { x: 92, y: 36, dir: 'east', length: 4, width: 16, startZ: 4, endZ: 2 });
    fillTrack(level, 96, 36, 8, 8, 2);
    setGoal(level, 100, 40, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 45, z: 6 });
    addGraphNode(level, { id: 'bridge1', type: 'fork', x: 31, y: 45, z: 6 });
    addGraphNode(level, { id: 'safe1', type: 'route', x: 37, y: 61, z: 6 });
    addGraphNode(level, { id: 'mid', type: 'hub', x: 73, y: 45, z: 4 });
    addGraphNode(level, { id: 'bridge2', type: 'fork', x: 73, y: 33, z: 4 });
    addGraphNode(level, { id: 'safe2', type: 'route', x: 73, y: 55, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 101, y: 41, z: 2 });
    addGraphEdge(level, { from: 'start', to: 'bridge1', kind: 'roll' });
    addGraphEdge(level, { from: 'bridge1', to: 'mid', kind: 'roll', tag: 'crumble' });
    addGraphEdge(level, { from: 'bridge1', to: 'safe1', kind: 'roll' });
    addGraphEdge(level, { from: 'safe1', to: 'mid', kind: 'roll' });
    addGraphEdge(level, { from: 'mid', to: 'bridge2', kind: 'roll', tag: 'crumble' });
    addGraphEdge(level, { from: 'mid', to: 'safe2', kind: 'roll' });
    addGraphEdge(level, { from: 'bridge2', to: 'goal', kind: 'roll' });
    addGraphEdge(level, { from: 'safe2', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 4 — Conveyor Lane
  // Introduces conveyors that push the marble. All push toward goal.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildConveyorLane() {
    const level = createLevelShell({
      id: 'conveyor_lane',
      name: 'Conveyor Lane',
      width: 120,
      height: 100,
      timeLimit: 60,
      start: { x: 10, y: 50 },
      reward: { presses: 2000, unlocks: ['marble_conveyor_lane_complete'], claimKey: 'conveyor_lane' }
    });
    // Start platform at z=6
    fillTrack(level, 6, 46, 12, 10, 6);
    // First conveyor section — pushes east (toward goal)
    fillTrack(level, 18, 46, 20, 10, 6, { conveyor: { x: 3.0, y: 0, strength: 2.5 } });
    // Platform before fork
    fillTrack(level, 38, 42, 12, 16, 6);
    // North connector from fork
    fillTrack(level, 44, 36, 8, 6, 6);
    // North conveyor path — pushes east then south
    fillTrack(level, 50, 28, 8, 14, 6);
    fillTrack(level, 50, 28, 24, 8, 6, { conveyor: { x: 2.5, y: 0, strength: 2.0 } });
    fillTrack(level, 74, 28, 8, 20, 6, { conveyor: { x: 0, y: 2.5, strength: 2.0 } });
    // South connector from fork
    fillTrack(level, 44, 56, 8, 6, 6);
    // South conveyor path — pushes east directly
    fillTrack(level, 50, 58, 8, 12, 6);
    fillTrack(level, 50, 64, 32, 8, 6, { conveyor: { x: 3.0, y: 0, strength: 2.5 } });
    fillTrack(level, 74, 48, 8, 24, 6);
    // Merge area
    fillTrack(level, 74, 42, 16, 16, 6);
    // Final push to goal — strong conveyor
    fillTrack(level, 90, 46, 16, 10, 6, { conveyor: { x: 4.0, y: 0, strength: 3.0 } });
    // Goal platform
    fillTrack(level, 100, 46, 10, 10, 6);
    setGoal(level, 104, 50, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 51, z: 6 });
    addGraphNode(level, { id: 'fork', type: 'fork', x: 45, y: 51, z: 6 });
    addGraphNode(level, { id: 'north', type: 'route', x: 63, y: 33, z: 6 });
    addGraphNode(level, { id: 'south', type: 'route', x: 67, y: 69, z: 6 });
    addGraphNode(level, { id: 'merge', type: 'hub', x: 83, y: 51, z: 6 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 105, y: 51, z: 6 });
    addGraphEdge(level, { from: 'start', to: 'fork', kind: 'roll', tag: 'conveyor' });
    addGraphEdge(level, { from: 'fork', to: 'north', kind: 'roll', tag: 'conveyor' });
    addGraphEdge(level, { from: 'fork', to: 'south', kind: 'roll', tag: 'conveyor' });
    addGraphEdge(level, { from: 'north', to: 'merge', kind: 'roll', tag: 'conveyor' });
    addGraphEdge(level, { from: 'south', to: 'merge', kind: 'roll', tag: 'conveyor' });
    addGraphEdge(level, { from: 'merge', to: 'goal', kind: 'roll', tag: 'conveyor' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 5 — Bounce Garden
  // Introduces bounce tiles for vertical movement. Multiple tiers.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildBounceGarden() {
    const level = createLevelShell({
      id: 'bounce_garden',
      name: 'Bounce Garden',
      width: 100,
      height: 100,
      timeLimit: 60,
      start: { x: 10, y: 50 },
      reward: { presses: 2500, unlocks: ['marble_bounce_garden_complete'], claimKey: 'bounce_garden' }
    });
    // Start platform at z=2
    fillTrack(level, 6, 46, 12, 10, 2);
    // First corridor with bounce pad to reach upper tier
    fillTrack(level, 18, 46, 12, 10, 2);
    // Bounce pad to jump up to z=6
    setSurface(level, 24, 50, { baseHeight: 2, shape: SHAPES.FLAT, bounce: 8 });
    setSurface(level, 26, 50, { baseHeight: 2, shape: SHAPES.FLAT, bounce: 8 });
    // Upper tier at z=6
    fillTrack(level, 30, 40, 20, 20, 6);
    // Ramp path alternative (no bounce needed)
    placeRamp(level, { x: 18, y: 56, dir: 'south', length: 6, width: 16, startZ: 2, endZ: 2 });
    fillTrack(level, 18, 62, 8, 8, 2);
    placeRamp(level, { x: 26, y: 62, dir: 'east', length: 8, width: 16, startZ: 2, endZ: 6 });
    fillTrack(level, 34, 60, 8, 8, 6);
    // Second bounce section — bounce from z=6 to z=10
    fillTrack(level, 50, 44, 12, 12, 6);
    setSurface(level, 54, 48, { baseHeight: 6, shape: SHAPES.FLAT, bounce: 8 });
    setSurface(level, 56, 48, { baseHeight: 6, shape: SHAPES.FLAT, bounce: 8 });
    // Upper platform at z=10
    fillTrack(level, 60, 36, 16, 16, 10);
    // Ramp alternative to z=10
    placeRamp(level, { x: 50, y: 32, dir: 'east', length: 10, width: 12, startZ: 6, endZ: 10 });
    fillTrack(level, 50, 32, 10, 6, 6); // flat approach to ramp
    placeRamp(level, { x: 40, y: 32, dir: 'east', length: 10, width: 12, startZ: 6, endZ: 6 });
    fillTrack(level, 30, 32, 10, 6, 6);
    // Descent from z=10 to goal
    placeRamp(level, { x: 76, y: 40, dir: 'east', length: 8, width: 16, startZ: 10, endZ: 6 });
    fillTrack(level, 84, 40, 8, 8, 6);
    placeRamp(level, { x: 84, y: 48, dir: 'south', length: 6, width: 16, startZ: 6, endZ: 4 });
    fillTrack(level, 84, 54, 8, 8, 4);
    // Goal
    setGoal(level, 88, 58, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 51, z: 2 });
    addGraphNode(level, { id: 'bounce1', type: 'fork', x: 25, y: 51, z: 2 });
    addGraphNode(level, { id: 'tier1', type: 'hub', x: 41, y: 51, z: 6 });
    addGraphNode(level, { id: 'bounce2', type: 'fork', x: 57, y: 51, z: 6 });
    addGraphNode(level, { id: 'tier2', type: 'hub', x: 69, y: 45, z: 10 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 89, y: 59, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'bounce1', kind: 'roll' });
    addGraphEdge(level, { from: 'bounce1', to: 'tier1', kind: 'roll', tag: 'bounce' });
    addGraphEdge(level, { from: 'bounce1', to: 'tier1', kind: 'roll' });
    addGraphEdge(level, { from: 'tier1', to: 'bounce2', kind: 'roll' });
    addGraphEdge(level, { from: 'bounce2', to: 'tier2', kind: 'roll', tag: 'bounce' });
    addGraphEdge(level, { from: 'bounce2', to: 'tier2', kind: 'roll' });
    addGraphEdge(level, { from: 'tier2', to: 'goal', kind: 'descent' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 6 — Ice Rink
  // Introduces ice physics. Marble slides with reduced traction.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildIceRink() {
    const level = createLevelShell({
      id: 'ice_rink',
      name: 'Ice Rink',
      width: 120,
      height: 110,
      timeLimit: 50,
      start: { x: 10, y: 54 },
      reward: { presses: 3000, unlocks: ['marble_ice_rink_complete'], claimKey: 'ice_rink' }
    });
    // Start platform (normal friction)
    fillTrack(level, 6, 50, 12, 10, 4);
    // Transition corridor
    fillTrack(level, 18, 50, 8, 10, 4);
    // First ice section — wide open rink, must navigate across
    fillTrack(level, 26, 30, 40, 50, 4, { friction: 0.6 });
    // Safe normal-friction islands within the rink
    fillTrack(level, 36, 44, 6, 6, 4);
    fillTrack(level, 50, 36, 6, 6, 4);
    fillTrack(level, 44, 60, 6, 6, 4);
    // Walls around the rink to prevent falling off
    blockerRing(level, 13, 15, 20, 25, 6);
    // Exit from rink (east side, gap in wall)
    clearBlocker(level, 32, 25);
    clearBlocker(level, 32, 26);
    clearBlocker(level, 32, 27);
    // Mid platform (normal friction)
    fillTrack(level, 66, 46, 12, 14, 4);
    // Second ice corridor — narrower, must control momentum
    fillTrack(level, 78, 48, 24, 10, 4, { friction: 0.6 });
    // Goal area (normal friction)
    fillTrack(level, 102, 48, 10, 10, 4);
    setGoal(level, 106, 52, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 55, z: 4 });
    addGraphNode(level, { id: 'rink', type: 'hub', x: 47, y: 55, z: 4 });
    addGraphNode(level, { id: 'mid', type: 'hub', x: 73, y: 53, z: 4 });
    addGraphNode(level, { id: 'corridor', type: 'route', x: 91, y: 53, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 107, y: 53, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'rink', kind: 'roll' });
    addGraphEdge(level, { from: 'rink', to: 'mid', kind: 'roll', tag: 'ice' });
    addGraphEdge(level, { from: 'mid', to: 'corridor', kind: 'roll', tag: 'ice' });
    addGraphEdge(level, { from: 'corridor', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 7 — Gate Runner
  // Introduces timed gates that span paths. Must time passage.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildGateRunner() {
    const level = createLevelShell({
      id: 'gate_runner',
      name: 'Gate Runner',
      width: 110,
      height: 120,
      timeLimit: 50,
      start: { x: 10, y: 60 },
      reward: { presses: 3500, unlocks: ['marble_gate_runner_complete'], claimKey: 'gate_runner' }
    });
    // Start platform at z=8
    fillTrack(level, 6, 56, 12, 10, 8);
    // First corridor with gate
    fillTrack(level, 18, 56, 24, 10, 8);
    // Gate 1 — spans the full 5-wide corridor
    addTimedGate(level, 'gate1', 15, 28, 8, 1, 5, 2.0, 1.5);
    // Platform after gate 1
    fillTrack(level, 42, 52, 16, 16, 8);
    // Descent to z=6
    placeRamp(level, { x: 58, y: 56, dir: 'east', length: 6, width: 20, startZ: 8, endZ: 6 });
    // Second section — two gates in sequence
    fillTrack(level, 64, 56, 30, 10, 6);
    addTimedGate(level, 'gate2a', 36, 28, 6, 1, 5, 1.8, 1.3);
    addTimedGate(level, 'gate2b', 42, 28, 6, 1, 5, 1.8, 1.3);
    // Platform after gates
    fillTrack(level, 94, 52, 12, 16, 6);
    // Fork — north or south, each with one gate
    // North path
    fillTrack(level, 80, 36, 10, 16, 6);
    placeRamp(level, { x: 80, y: 44, dir: 'north', length: 8, width: 20, startZ: 6, endZ: 6 });
    fillTrack(level, 80, 28, 10, 8, 6);
    addTimedGate(level, 'gate_n', 42, 14, 6, 1, 4, 1.6, 1.8);
    fillTrack(level, 80, 20, 10, 8, 6);
    placeRamp(level, { x: 90, y: 20, dir: 'east', length: 6, width: 16, startZ: 6, endZ: 4 });
    fillTrack(level, 96, 20, 8, 8, 4);
    // South path
    fillTrack(level, 80, 68, 10, 16, 6);
    fillTrack(level, 80, 84, 10, 8, 6);
    addTimedGate(level, 'gate_s', 42, 42, 6, 1, 4, 1.6, 1.8);
    fillTrack(level, 80, 92, 10, 8, 6);
    placeRamp(level, { x: 90, y: 92, dir: 'east', length: 6, width: 16, startZ: 6, endZ: 4 });
    fillTrack(level, 96, 92, 8, 8, 4);
    // Merge area at z=4
    fillTrack(level, 96, 20, 8, 80, 4);
    // Goal
    setGoal(level, 100, 60, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 61, z: 8 });
    addGraphNode(level, { id: 'gate1', type: 'route', x: 31, y: 61, z: 8 });
    addGraphNode(level, { id: 'mid', type: 'hub', x: 51, y: 61, z: 8 });
    addGraphNode(level, { id: 'gates2', type: 'route', x: 79, y: 61, z: 6 });
    addGraphNode(level, { id: 'fork', type: 'fork', x: 95, y: 61, z: 6 });
    addGraphNode(level, { id: 'north', type: 'route', x: 85, y: 25, z: 6 });
    addGraphNode(level, { id: 'south', type: 'route', x: 85, y: 97, z: 6 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 101, y: 61, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'gate1', kind: 'roll' });
    addGraphEdge(level, { from: 'gate1', to: 'mid', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'mid', to: 'gates2', kind: 'descent' });
    addGraphEdge(level, { from: 'gates2', to: 'fork', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'fork', to: 'north', kind: 'roll' });
    addGraphEdge(level, { from: 'fork', to: 'south', kind: 'roll' });
    addGraphEdge(level, { from: 'north', to: 'goal', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'south', to: 'goal', kind: 'timed_cross' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 8 — Sweeper Alley
  // Introduces sweepers. Must time movement through rotating arms.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildSweeperAlley() {
    const level = createLevelShell({
      id: 'sweeper_alley',
      name: 'Sweeper Alley',
      width: 120,
      height: 100,
      timeLimit: 50,
      start: { x: 10, y: 50 },
      reward: { presses: 4000, unlocks: ['marble_sweeper_alley_complete'], claimKey: 'sweeper_alley' }
    });
    // Start platform at z=4
    fillTrack(level, 6, 46, 12, 10, 4);
    // Wide corridor — sweeper in the middle
    fillTrack(level, 18, 36, 28, 28, 4);
    // Sweeper 1 — slow, centered in the corridor
    addActor(level, {
      id: 'sweep1', kind: ACTOR_KINDS.SWEEPER,
      x: 16, y: 25, z: 4, topHeight: 4,
      width: 2, height: 1, armLength: 4.0, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    // Safe waiting areas on north and south edges
    fillTrack(level, 18, 28, 28, 8, 4);
    fillTrack(level, 18, 64, 28, 8, 4);
    // Second section
    fillTrack(level, 46, 40, 12, 20, 4);
    // Corridor with two sweepers in sequence
    fillTrack(level, 58, 40, 36, 20, 4);
    // Sweeper 2 — medium speed
    addActor(level, {
      id: 'sweep2', kind: ACTOR_KINDS.SWEEPER,
      x: 34, y: 25, z: 4, topHeight: 4,
      width: 2, height: 1, armLength: 3.5, armWidth: 0.22, angularSpeed: 1.6, fatal: true
    });
    // Sweeper 3 — slightly faster
    addActor(level, {
      id: 'sweep3', kind: ACTOR_KINDS.SWEEPER,
      x: 42, y: 25, z: 4, topHeight: 4,
      width: 2, height: 1, armLength: 3.5, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    // Goal area
    fillTrack(level, 94, 44, 16, 12, 4);
    setGoal(level, 104, 50, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 51, z: 4 });
    addGraphNode(level, { id: 'sweep1', type: 'route', x: 33, y: 51, z: 4 });
    addGraphNode(level, { id: 'mid', type: 'hub', x: 53, y: 51, z: 4 });
    addGraphNode(level, { id: 'sweep23', type: 'route', x: 77, y: 51, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 105, y: 51, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'sweep1', kind: 'roll' });
    addGraphEdge(level, { from: 'sweep1', to: 'mid', kind: 'roll' });
    addGraphEdge(level, { from: 'mid', to: 'sweep23', kind: 'roll' });
    addGraphEdge(level, { from: 'sweep23', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 9 — Platform Hop
  // Moving platforms carry the marble across void gaps.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildPlatformHop() {
    const level = createLevelShell({
      id: 'platform_hop',
      name: 'Platform Hop',
      width: 130,
      height: 110,
      timeLimit: 50,
      start: { x: 10, y: 54 },
      reward: { presses: 4500, unlocks: ['marble_platform_hop_complete'], claimKey: 'platform_hop' }
    });
    // Start platform at z=6
    fillTrack(level, 6, 50, 12, 10, 6);
    // Approach to first gap
    fillTrack(level, 18, 50, 12, 10, 6);
    // First moving platform — crosses a 6-tile void gap east-west
    clearSurfaceRect(level, 15, 25, 6, 5);
    addMovingBridge(level, 'plat1',
      [{ x: 15, y: 26, z: 6 }, { x: 19, y: 26, z: 6 }],
      3, 3, 0.6);
    // Landing after first gap
    fillTrack(level, 42, 50, 12, 10, 6);
    // Second section — platform moves north-south across a wider gap
    fillTrack(level, 54, 50, 8, 10, 6);
    clearSurfaceRect(level, 31, 18, 5, 20);
    addMovingBridge(level, 'plat2',
      [{ x: 32, y: 20, z: 6 }, { x: 32, y: 32, z: 6 }],
      3, 3, 0.5);
    // Landing platforms on east side at different Y positions
    fillTrack(level, 72, 40, 12, 8, 6);
    fillTrack(level, 72, 64, 12, 8, 6);
    // Both connect to merge corridor
    fillTrack(level, 84, 40, 8, 32, 6);
    // Third platform — diagonal movement
    fillTrack(level, 92, 50, 8, 10, 6);
    clearSurfaceRect(level, 50, 25, 5, 5);
    addMovingBridge(level, 'plat3',
      [{ x: 50, y: 26, z: 6 }, { x: 53, y: 26, z: 6 }],
      3, 3, 0.7);
    // Goal area
    fillTrack(level, 110, 50, 12, 10, 6);
    setGoal(level, 116, 54, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 55, z: 6 });
    addGraphNode(level, { id: 'gap1', type: 'route', x: 37, y: 55, z: 6 });
    addGraphNode(level, { id: 'mid1', type: 'hub', x: 49, y: 55, z: 6 });
    addGraphNode(level, { id: 'gap2', type: 'route', x: 67, y: 55, z: 6 });
    addGraphNode(level, { id: 'merge', type: 'hub', x: 89, y: 55, z: 6 });
    addGraphNode(level, { id: 'gap3', type: 'route', x: 105, y: 55, z: 6 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 117, y: 55, z: 6 });
    addGraphEdge(level, { from: 'start', to: 'gap1', kind: 'roll' });
    addGraphEdge(level, { from: 'gap1', to: 'mid1', kind: 'roll', tag: 'platform' });
    addGraphEdge(level, { from: 'mid1', to: 'gap2', kind: 'roll' });
    addGraphEdge(level, { from: 'gap2', to: 'merge', kind: 'roll', tag: 'platform' });
    addGraphEdge(level, { from: 'merge', to: 'gap3', kind: 'roll' });
    addGraphEdge(level, { from: 'gap3', to: 'goal', kind: 'roll', tag: 'platform' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 10 — Tunnel Network
  // Introduces tunnels as shortcuts and alternate routes.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTunnelNetwork() {
    const level = createLevelShell({
      id: 'tunnel_network',
      name: 'Tunnel Network',
      width: 140,
      height: 120,
      timeLimit: 50,
      start: { x: 10, y: 60 },
      reward: { presses: 5000, unlocks: ['marble_tunnel_network_complete'], claimKey: 'tunnel_network' }
    });
    // Start platform at z=8
    fillTrack(level, 6, 56, 12, 10, 8);
    // Corridor to first fork
    fillTrack(level, 18, 56, 16, 10, 8);
    // Fork area
    fillTrack(level, 34, 48, 16, 24, 8);
    // Surface path — long winding route east
    placeRamp(level, { x: 50, y: 52, dir: 'east', length: 8, width: 20, startZ: 8, endZ: 6 });
    fillTrack(level, 58, 52, 20, 10, 6);
    placeRamp(level, { x: 78, y: 52, dir: 'east', length: 6, width: 20, startZ: 6, endZ: 4 });
    fillTrack(level, 84, 52, 16, 10, 4);
    // Tunnel shortcut — goes underground from fork to near goal
    placeTunnel(level, {
      id: 'tunnel_main',
      path: [
        { x: 43, y: 61, z: 8 },
        { x: 51, y: 71, z: 4 },
        { x: 71, y: 81, z: 2 },
        { x: 91, y: 77, z: 2 },
        { x: 101, y: 65, z: 4 }
      ],
      speed: 7,
      exitType: 'emerge',
      funnelRadius: 2,
      funnelDepth: 3
    });
    // Second tunnel — from mid-surface to goal area
    placeTunnel(level, {
      id: 'tunnel_mid',
      path: [
        { x: 71, y: 57, z: 6 },
        { x: 81, y: 51, z: 3 },
        { x: 97, y: 57, z: 4 }
      ],
      speed: 8,
      exitType: 'emerge',
      funnelRadius: 2,
      funnelDepth: 2
    });
    // Goal area
    fillTrack(level, 100, 52, 16, 16, 4);
    fillTrack(level, 110, 56, 12, 8, 4);
    setGoal(level, 116, 60, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 61, z: 8 });
    addGraphNode(level, { id: 'fork', type: 'fork', x: 43, y: 61, z: 8 });
    addGraphNode(level, { id: 'surface', type: 'route', x: 71, y: 57, z: 6 });
    addGraphNode(level, { id: 'tunnel_exit', type: 'route', x: 101, y: 65, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 117, y: 61, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'fork', kind: 'roll' });
    addGraphEdge(level, { from: 'fork', to: 'surface', kind: 'descent' });
    addGraphEdge(level, { from: 'fork', to: 'tunnel_exit', kind: 'roll', tag: 'tunnel' });
    addGraphEdge(level, { from: 'surface', to: 'goal', kind: 'descent' });
    addGraphEdge(level, { from: 'surface', to: 'goal', kind: 'roll', tag: 'tunnel' });
    addGraphEdge(level, { from: 'tunnel_exit', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 11 — Switchback Descent
  // Multi-tier switchback with timed gates at each turn.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildSwitchbackDescentV2() {
    const level = createLevelShell({
      id: 'switchback_descent',
      name: 'Switchback Descent',
      width: 100,
      height: 140,
      timeLimit: 40,
      start: { x: 10, y: 20 },
      reward: { presses: 5500, unlocks: ['marble_switchback_descent_complete'], claimKey: 'switchback_descent' }
    });
    // Start at z=12
    fillTrack(level, 6, 16, 12, 10, 12);
    // Leg 1 — east at z=12
    fillTrack(level, 18, 16, 40, 10, 12);
    addTimedGate(level, 'gate_s1', 20, 8, 12, 1, 5, 1.6, 1.4);
    // Turn south + ramp down to z=10
    fillTrack(level, 58, 16, 10, 12, 12);
    placeRamp(level, { x: 58, y: 28, dir: 'south', length: 8, width: 20, startZ: 12, endZ: 10 });
    // Leg 2 — west at z=10
    fillTrack(level, 58, 36, 10, 10, 10);
    fillTrack(level, 18, 36, 50, 10, 10);
    addTimedGate(level, 'gate_s2', 20, 18, 10, 1, 5, 1.5, 1.3);
    // Turn south + ramp down to z=8
    fillTrack(level, 18, 36, 10, 12, 10);
    placeRamp(level, { x: 18, y: 48, dir: 'south', length: 8, width: 20, startZ: 10, endZ: 8 });
    // Leg 3 — east at z=8
    fillTrack(level, 18, 56, 10, 10, 8);
    fillTrack(level, 18, 56, 50, 10, 8);
    addTimedGate(level, 'gate_s3', 22, 28, 8, 1, 5, 1.4, 1.2);
    // Turn south + ramp down to z=6
    fillTrack(level, 68, 56, 10, 12, 8);
    placeRamp(level, { x: 68, y: 68, dir: 'south', length: 8, width: 20, startZ: 8, endZ: 6 });
    // Leg 4 — west at z=6
    fillTrack(level, 68, 76, 10, 10, 6);
    fillTrack(level, 18, 76, 60, 10, 6);
    addTimedGate(level, 'gate_s4', 18, 38, 6, 1, 5, 1.3, 1.2);
    // Turn south + ramp down to z=4
    fillTrack(level, 18, 76, 10, 12, 6);
    placeRamp(level, { x: 18, y: 88, dir: 'south', length: 8, width: 20, startZ: 6, endZ: 4 });
    // Leg 5 — east to goal at z=4
    fillTrack(level, 18, 96, 10, 10, 4);
    fillTrack(level, 18, 96, 60, 10, 4);
    // Goal
    fillTrack(level, 72, 96, 12, 10, 4);
    setGoal(level, 78, 100, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 21, z: 12 });
    addGraphNode(level, { id: 'leg1', type: 'route', x: 41, y: 21, z: 12 });
    addGraphNode(level, { id: 'leg2', type: 'route', x: 41, y: 41, z: 10 });
    addGraphNode(level, { id: 'leg3', type: 'route', x: 45, y: 61, z: 8 });
    addGraphNode(level, { id: 'leg4', type: 'route', x: 37, y: 81, z: 6 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 79, y: 101, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'leg1', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'leg1', to: 'leg2', kind: 'descent' });
    addGraphEdge(level, { from: 'leg2', to: 'leg3', kind: 'descent' });
    addGraphEdge(level, { from: 'leg3', to: 'leg4', kind: 'descent' });
    addGraphEdge(level, { from: 'leg4', to: 'goal', kind: 'descent' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 12 — Hazard Gauntlet
  // Combines sweepers and hazard strips. Must navigate carefully.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildHazardGauntlet() {
    const level = createLevelShell({
      id: 'hazard_gauntlet',
      name: 'Hazard Gauntlet',
      width: 130,
      height: 100,
      timeLimit: 40,
      start: { x: 10, y: 50 },
      reward: { presses: 6000, unlocks: ['marble_hazard_gauntlet_complete'], claimKey: 'hazard_gauntlet' }
    });
    // Start at z=4
    fillTrack(level, 6, 46, 12, 10, 4);
    // Wide arena with hazard strips on edges
    fillTrack(level, 18, 30, 36, 40, 4);
    // Hazard strips along north and south edges of the arena
    addHazardRect(level, 9, 15, 18, 2, 'spikes');
    addHazardRect(level, 9, 33, 18, 2, 'spikes');
    // Sweeper in center of arena
    addActor(level, {
      id: 'sweep_arena', kind: ACTOR_KINDS.SWEEPER,
      x: 18, y: 25, z: 4, topHeight: 4,
      width: 2, height: 1, armLength: 5.0, armWidth: 0.22, angularSpeed: 1.4, fatal: true
    });
    // Safe corridor through (wide enough to dodge)
    fillTrack(level, 54, 40, 12, 20, 4);
    // Second gauntlet — narrower with two sweepers
    fillTrack(level, 66, 36, 32, 28, 4);
    // Hazard strips along sides
    addHazardRect(level, 33, 18, 16, 2, 'spikes');
    addHazardRect(level, 33, 30, 16, 2, 'spikes');
    // Two sweepers offset
    addActor(level, {
      id: 'sweep_g1', kind: ACTOR_KINDS.SWEEPER,
      x: 38, y: 25, z: 4, topHeight: 4,
      width: 2, height: 1, armLength: 3.5, armWidth: 0.22, angularSpeed: 1.6, fatal: true
    });
    addActor(level, {
      id: 'sweep_g2', kind: ACTOR_KINDS.SWEEPER,
      x: 44, y: 25, z: 4, topHeight: 4,
      width: 2, height: 1, armLength: 3.5, armWidth: 0.22, angularSpeed: -1.8, fatal: true
    });
    // Exit and goal
    fillTrack(level, 98, 44, 16, 12, 4);
    fillTrack(level, 108, 46, 12, 8, 4);
    setGoal(level, 114, 50, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 51, z: 4 });
    addGraphNode(level, { id: 'arena1', type: 'route', x: 37, y: 51, z: 4 });
    addGraphNode(level, { id: 'mid', type: 'hub', x: 61, y: 51, z: 4 });
    addGraphNode(level, { id: 'arena2', type: 'route', x: 83, y: 51, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 115, y: 51, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'arena1', kind: 'roll' });
    addGraphEdge(level, { from: 'arena1', to: 'mid', kind: 'roll' });
    addGraphEdge(level, { from: 'mid', to: 'arena2', kind: 'roll' });
    addGraphEdge(level, { from: 'arena2', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 13 — Elevator Shaft
  // Vertical level using elevators to ascend/descend between floors.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildElevatorShaft() {
    const level = createLevelShell({
      id: 'elevator_shaft',
      name: 'Elevator Shaft',
      width: 100,
      height: 100,
      timeLimit: 40,
      start: { x: 50, y: 10 },
      reward: { presses: 6500, unlocks: ['marble_elevator_shaft_complete'], claimKey: 'elevator_shaft' }
    });
    // Floor 1 at z=2
    fillTrack(level, 40, 6, 20, 16, 2);
    // Elevator 1: z=2 to z=6
    addElevator(level, 'elev1', 22, 11, 2, 6, 3, 3, 0.7, 5.0);
    // Floor 2 at z=6
    fillTrack(level, 40, 28, 20, 16, 6);
    // Corridor east on floor 2
    fillTrack(level, 60, 32, 20, 10, 6);
    // Elevator 2: z=6 to z=10
    addElevator(level, 'elev2', 37, 21, 6, 10, 3, 3, 0.7, 5.0);
    // Floor 3 at z=10
    fillTrack(level, 66, 48, 20, 16, 10);
    // Corridor west on floor 3
    fillTrack(level, 30, 52, 36, 10, 10);
    // Elevator 3: z=10 to z=14
    addElevator(level, 'elev3', 15, 31, 10, 14, 3, 3, 0.7, 5.0);
    // Floor 4 at z=14
    fillTrack(level, 24, 68, 20, 16, 14);
    // Final corridor to goal
    fillTrack(level, 44, 72, 24, 10, 14);
    // Descent to goal
    placeRamp(level, { x: 68, y: 74, dir: 'east', length: 8, width: 16, startZ: 14, endZ: 10 });
    fillTrack(level, 76, 74, 10, 8, 10);
    setGoal(level, 80, 78, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 51, y: 11, z: 2 });
    addGraphNode(level, { id: 'floor2', type: 'hub', x: 51, y: 37, z: 6 });
    addGraphNode(level, { id: 'floor3', type: 'hub', x: 51, y: 57, z: 10 });
    addGraphNode(level, { id: 'floor4', type: 'hub', x: 35, y: 77, z: 14 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 81, y: 79, z: 10 });
    addGraphEdge(level, { from: 'start', to: 'floor2', kind: 'roll', tag: 'elevator' });
    addGraphEdge(level, { from: 'floor2', to: 'floor3', kind: 'roll', tag: 'elevator' });
    addGraphEdge(level, { from: 'floor3', to: 'floor4', kind: 'roll', tag: 'elevator' });
    addGraphEdge(level, { from: 'floor4', to: 'goal', kind: 'descent' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 14 — The Mountain
  // Climb to the peak! Goal is at the top. Ascending terrain.
  // Each ring has a 1-unit ramp up and 1 bounce tile to jump up.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTheMountain() {
    const level = createLevelShell({
      id: 'the_mountain',
      name: 'The Mountain',
      width: 200,
      height: 200,
      timeLimit: 40,
      start: { x: 10, y: 100 },
      reward: { presses: 7000, unlocks: ['marble_the_mountain_complete'], claimKey: 'the_mountain' }
    });
    // Center of the mountain at (100, 100)
    const cx = 100, cy = 100;

    // === Base approach at z=2 ===
    fillTrack(level, 6, 94, 20, 12, 2);

    // === Ring 1 (base) — z=2, massive outer ring ===
    fillTrack(level, 26, 50, 148, 100, 2);

    // === Ring 2 — z=3 ===
    fillTrack(level, 44, 62, 112, 76, 3);
    // Ramp: Ring 1 → Ring 2 (south side, gradual 6-tile ramp)
    placeRamp(level, { x: 80, y: 138, dir: 'north', length: 6, width: 20, startZ: 2, endZ: 3 });
    // Ramp: Ring 1 → Ring 2 (west side, alternate path)
    placeRamp(level, { x: 38, y: 85, dir: 'east', length: 6, width: 14, startZ: 2, endZ: 3 });

    // === Ring 3 — z=4 ===
    fillTrack(level, 58, 70, 84, 60, 4);
    // Ramp: Ring 2 → Ring 3 (east side, gradual)
    placeRamp(level, { x: 142, y: 90, dir: 'west', length: 6, width: 16, startZ: 3, endZ: 4 });
    // Ramp: Ring 2 → Ring 3 (north side, alternate)
    placeRamp(level, { x: 85, y: 64, dir: 'south', length: 6, width: 14, startZ: 3, endZ: 4 });

    // === Ring 4 — z=5 ===
    fillTrack(level, 70, 78, 60, 44, 5);
    // Ramp: Ring 3 → Ring 4 (south side, gradual)
    placeRamp(level, { x: 88, y: 122, dir: 'north', length: 6, width: 14, startZ: 4, endZ: 5 });
    // Ramp: Ring 3 → Ring 4 (west side, alternate)
    placeRamp(level, { x: 64, y: 95, dir: 'east', length: 6, width: 12, startZ: 4, endZ: 5 });

    // === Ring 5 — z=6 ===
    fillTrack(level, 80, 84, 40, 32, 6);
    // Ramp: Ring 4 → Ring 5 (east side, gradual)
    placeRamp(level, { x: 120, y: 94, dir: 'west', length: 6, width: 12, startZ: 5, endZ: 6 });
    // Ramp: Ring 4 → Ring 5 (north side, alternate)
    placeRamp(level, { x: 94, y: 78, dir: 'south', length: 6, width: 10, startZ: 5, endZ: 6 });

    // === Ring 6 — z=7 ===
    fillTrack(level, 88, 90, 24, 20, 7);
    // Ramp: Ring 5 → Ring 6 (south side, gradual)
    placeRamp(level, { x: 94, y: 110, dir: 'north', length: 6, width: 10, startZ: 6, endZ: 7 });

    // === Ring 7 (summit plateau) — z=8 ===
    fillTrack(level, 94, 94, 12, 12, 8);
    // Ramp: Ring 6 → Ring 7 (west side, final ascent)
    placeRamp(level, { x: 88, y: 97, dir: 'east', length: 6, width: 8, startZ: 7, endZ: 8 });

    // === Peak — z=9 (goal) ===
    fillTrack(level, 97, 97, 6, 6, 9);
    // Ramp: Ring 7 → Peak (gentle final ramp)
    placeRamp(level, { x: 97, y: 94, dir: 'south', length: 3, width: 6, startZ: 8, endZ: 9 });

    // Goal at the peak!
    setGoal(level, 100, 100, 0.55);

    // === SECRET TUNNEL (hidden until all 20 levels beaten) ===
    // Entrance: Ring 3, north side — midway up the mountain
    // Path: goes through the mountain interior, exits far east side
    // Exit: hidden platform at (180, 100) at z=2
    placeTunnel(level, {
      id: 'secret_tunnel',
      path: [
        { x: 70.5, y: 72.5, z: 4 },   // entry on Ring 3 north edge
        { x: 90.5, y: 65.5, z: 3 },    // through the mountain interior
        { x: 120.5, y: 60.5, z: 2 },   // curving east and down
        { x: 150.5, y: 80.5, z: 2 },   // emerging east of Ring 1
        { x: 180.5, y: 100.5, z: 2 }   // exit at secret platform
      ],
      speed: 8,
      radius: 0.4,
      exitType: 'emerge',
      funnelRadius: 2,
      entryZ: 4,
      hidden: true,
      hiddenFallback: 4  // Ring 3 height — funnel appears as flat z=4 when not revealed
    });
    // Secret platform (5x5 at z=2, far east side — only reachable via tunnel)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        setSurface(level, 180 + dx, 100 + dy, { baseHeight: 2, shape: SHAPES.FLAT, hidden: true, landingPad: true });
      }
    }
    // Secret goal on the hidden platform
    setTrigger(level, 182, 100, { kind: 'secret_goal', radius: 0.5, hidden: true });

    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 101, z: 2 });
    addGraphNode(level, { id: 'ring1', type: 'hub', x: 100, y: 100, z: 2 });
    addGraphNode(level, { id: 'ring2', type: 'hub', x: 100, y: 100, z: 3 });
    addGraphNode(level, { id: 'ring3', type: 'hub', x: 100, y: 100, z: 4 });
    addGraphNode(level, { id: 'ring4', type: 'hub', x: 100, y: 100, z: 5 });
    addGraphNode(level, { id: 'ring5', type: 'hub', x: 100, y: 100, z: 6 });
    addGraphNode(level, { id: 'ring6', type: 'hub', x: 100, y: 100, z: 7 });
    addGraphNode(level, { id: 'ring7', type: 'hub', x: 100, y: 100, z: 8 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 100, y: 100, z: 9 });
    addGraphEdge(level, { from: 'start', to: 'ring1', kind: 'roll' });
    addGraphEdge(level, { from: 'ring1', to: 'ring2', kind: 'roll' });
    addGraphEdge(level, { from: 'ring2', to: 'ring3', kind: 'roll' });
    addGraphEdge(level, { from: 'ring3', to: 'ring4', kind: 'roll' });
    addGraphEdge(level, { from: 'ring4', to: 'ring5', kind: 'roll' });
    addGraphEdge(level, { from: 'ring5', to: 'ring6', kind: 'roll' });
    addGraphEdge(level, { from: 'ring6', to: 'ring7', kind: 'roll' });
    addGraphEdge(level, { from: 'ring7', to: 'goal', kind: 'descent' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 15 — Ice Crossing
  // Ice + sweepers combination. Slide through sweeper zones.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildIceCrossing() {
    const level = createLevelShell({
      id: 'ice_crossing',
      name: 'Ice Crossing',
      width: 120,
      height: 110,
      timeLimit: 40,
      start: { x: 10, y: 54 },
      reward: { presses: 7500, unlocks: ['marble_ice_crossing_complete'], claimKey: 'ice_crossing' }
    });
    // Start (normal friction)
    fillTrack(level, 6, 50, 12, 10, 4);
    // Approach corridor
    fillTrack(level, 18, 50, 12, 10, 4);
    // First ice + sweeper zone
    fillTrack(level, 30, 36, 28, 36, 4, { friction: 0.6 });
    // Sweeper in the ice zone
    addActor(level, {
      id: 'ice_sweep1', kind: ACTOR_KINDS.SWEEPER,
      x: 22, y: 27, z: 4, topHeight: 4,
      width: 2, height: 1, armLength: 4.5, armWidth: 0.22, angularSpeed: 1.3, fatal: true
    });
    // Safe island (normal friction) in the ice
    fillTrack(level, 40, 50, 6, 6, 4);
    // Walls to prevent sliding off
    blockerRing(level, 15, 18, 14, 18, 6);
    // Exit gap east
    clearBlocker(level, 28, 26);
    clearBlocker(level, 28, 27);
    clearBlocker(level, 28, 28);
    // Mid platform (normal)
    fillTrack(level, 58, 48, 12, 12, 4);
    // Second ice zone — narrower corridor
    fillTrack(level, 70, 44, 28, 20, 4, { friction: 0.6 });
    // Sweeper in second zone
    addActor(level, {
      id: 'ice_sweep2', kind: ACTOR_KINDS.SWEEPER,
      x: 42, y: 27, z: 4, topHeight: 4,
      width: 2, height: 1, armLength: 3.5, armWidth: 0.22, angularSpeed: -1.5, fatal: true
    });
    // Walls
    blockerRing(level, 35, 22, 14, 10, 6);
    // Exit gap east
    clearBlocker(level, 48, 26);
    clearBlocker(level, 48, 27);
    // Goal area (normal)
    fillTrack(level, 98, 48, 12, 12, 4);
    setGoal(level, 104, 54, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 55, z: 4 });
    addGraphNode(level, { id: 'ice1', type: 'route', x: 45, y: 55, z: 4 });
    addGraphNode(level, { id: 'mid', type: 'hub', x: 65, y: 55, z: 4 });
    addGraphNode(level, { id: 'ice2', type: 'route', x: 85, y: 55, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 105, y: 55, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'ice1', kind: 'roll', tag: 'ice' });
    addGraphEdge(level, { from: 'ice1', to: 'mid', kind: 'roll', tag: 'ice' });
    addGraphEdge(level, { from: 'mid', to: 'ice2', kind: 'roll', tag: 'ice' });
    addGraphEdge(level, { from: 'ice2', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 16 — Crumble Cascade
  // Multi-tier crumble paths with timing pressure. Fast crumble.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildCrumbleCascade() {
    const level = createLevelShell({
      id: 'crumble_cascade',
      name: 'Crumble Cascade',
      width: 110,
      height: 120,
      timeLimit: 30,
      start: { x: 10, y: 20 },
      reward: { presses: 8000, unlocks: ['marble_crumble_cascade_complete'], claimKey: 'crumble_cascade' }
    });
    // Start at z=10
    fillTrack(level, 6, 16, 12, 10, 10);
    // Tier 1 — crumble bridge east at z=10
    fillTrack(level, 18, 16, 8, 10, 10);
    fillTrack(level, 26, 18, 24, 6, 10, { crumble: { delay: 0.6, respawn: 3.0 } });
    // Safe landing at end of tier 1
    fillTrack(level, 50, 16, 10, 10, 10);
    // Ramp down to z=8
    placeRamp(level, { x: 50, y: 26, dir: 'south', length: 6, width: 20, startZ: 10, endZ: 8 });
    // Tier 2 — crumble bridge west at z=8
    fillTrack(level, 50, 32, 10, 10, 8);
    fillTrack(level, 24, 34, 26, 6, 8, { crumble: { delay: 0.5, respawn: 3.0 } });
    // Safe landing
    fillTrack(level, 14, 32, 10, 10, 8);
    // Ramp down to z=6
    placeRamp(level, { x: 14, y: 42, dir: 'south', length: 6, width: 20, startZ: 8, endZ: 6 });
    // Tier 3 — crumble bridge east at z=6
    fillTrack(level, 14, 48, 10, 10, 6);
    fillTrack(level, 24, 50, 28, 6, 6, { crumble: { delay: 0.5, respawn: 2.5 } });
    // Safe landing
    fillTrack(level, 52, 48, 10, 10, 6);
    // Ramp down to z=4
    placeRamp(level, { x: 52, y: 58, dir: 'south', length: 6, width: 20, startZ: 6, endZ: 4 });
    // Tier 4 — wider crumble bridge west at z=4
    fillTrack(level, 52, 64, 10, 10, 4);
    fillTrack(level, 20, 66, 32, 6, 4, { crumble: { delay: 0.4, respawn: 2.5 } });
    // Safe landing
    fillTrack(level, 10, 64, 10, 10, 4);
    // Final descent to goal
    placeRamp(level, { x: 10, y: 74, dir: 'south', length: 6, width: 20, startZ: 4, endZ: 2 });
    fillTrack(level, 10, 80, 10, 10, 2);
    // Safe alternate paths (longer but no crumble)
    // Tier 1 alt: go south around
    fillTrack(level, 18, 26, 8, 16, 10);
    fillTrack(level, 18, 42, 40, 6, 10);
    placeRamp(level, { x: 50, y: 42, dir: 'north', length: 6, width: 16, startZ: 10, endZ: 10 });
    // Goal
    setGoal(level, 14, 86, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 21, z: 10 });
    addGraphNode(level, { id: 'tier1', type: 'route', x: 39, y: 21, z: 10 });
    addGraphNode(level, { id: 'tier2', type: 'route', x: 37, y: 37, z: 8 });
    addGraphNode(level, { id: 'tier3', type: 'route', x: 39, y: 53, z: 6 });
    addGraphNode(level, { id: 'tier4', type: 'route', x: 37, y: 69, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 15, y: 87, z: 2 });
    addGraphEdge(level, { from: 'start', to: 'tier1', kind: 'roll', tag: 'crumble' });
    addGraphEdge(level, { from: 'tier1', to: 'tier2', kind: 'descent' });
    addGraphEdge(level, { from: 'tier2', to: 'tier3', kind: 'descent' });
    addGraphEdge(level, { from: 'tier3', to: 'tier4', kind: 'descent' });
    addGraphEdge(level, { from: 'tier4', to: 'goal', kind: 'descent' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 17 — The Gauntlet V2
  // All hazard types combined in a linear challenge.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTheGauntletV2() {
    const level = createLevelShell({
      id: 'the_gauntlet_v2',
      name: 'The Gauntlet',
      width: 160,
      height: 100,
      timeLimit: 30,
      start: { x: 10, y: 50 },
      reward: { presses: 8500, unlocks: ['marble_the_gauntlet_v2_complete'], claimKey: 'the_gauntlet_v2' }
    });
    // Start at z=6
    fillTrack(level, 6, 46, 12, 10, 6);
    // Section 1: Sweeper zone
    fillTrack(level, 18, 36, 24, 28, 6);
    addActor(level, {
      id: 'gaunt_sweep', kind: ACTOR_KINDS.SWEEPER,
      x: 15, y: 25, z: 6, topHeight: 6,
      width: 2, height: 1, armLength: 4.5, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    // Section 2: Timed gates
    fillTrack(level, 42, 44, 28, 12, 6);
    addTimedGate(level, 'gaunt_gate1', 26, 22, 6, 1, 6, 1.4, 1.2);
    addTimedGate(level, 'gaunt_gate2', 31, 22, 6, 1, 6, 1.3, 1.1);
    // Section 3: Ice + hazard strips
    fillTrack(level, 70, 40, 24, 20, 6, { friction: 0.6 });
    addHazardRect(level, 35, 20, 12, 2, 'spikes');
    addHazardRect(level, 35, 28, 12, 2, 'spikes');
    // Walls to contain ice sliding
    blockerRing(level, 35, 20, 12, 10, 8);
    clearBlocker(level, 46, 24);
    clearBlocker(level, 46, 25);
    // Section 4: Crumble sprint
    fillTrack(level, 94, 44, 8, 12, 6);
    fillTrack(level, 102, 46, 20, 8, 6, { crumble: { delay: 0.5, respawn: 3.0 } });
    // Section 5: Narrow bridge to goal
    fillTrack(level, 122, 44, 6, 12, 6);
    fillTrack(level, 128, 48, 16, 6, 6, { crumble: { delay: 0.6, respawn: 2.5 } });
    // Goal
    fillTrack(level, 138, 44, 12, 12, 6);
    setGoal(level, 144, 50, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 51, z: 6 });
    addGraphNode(level, { id: 'sweep', type: 'route', x: 31, y: 51, z: 6 });
    addGraphNode(level, { id: 'gates', type: 'route', x: 57, y: 51, z: 6 });
    addGraphNode(level, { id: 'ice', type: 'route', x: 83, y: 51, z: 6 });
    addGraphNode(level, { id: 'crumble', type: 'route', x: 113, y: 51, z: 6 });
    addGraphNode(level, { id: 'platform', type: 'route', x: 133, y: 51, z: 6 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 145, y: 51, z: 6 });
    addGraphEdge(level, { from: 'start', to: 'sweep', kind: 'roll' });
    addGraphEdge(level, { from: 'sweep', to: 'gates', kind: 'roll' });
    addGraphEdge(level, { from: 'gates', to: 'ice', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'ice', to: 'crumble', kind: 'roll', tag: 'ice' });
    addGraphEdge(level, { from: 'crumble', to: 'platform', kind: 'roll', tag: 'crumble' });
    addGraphEdge(level, { from: 'platform', to: 'goal', kind: 'roll', tag: 'platform' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 18 — Conveyor Maze
  // Conveyors push in conflicting directions. Must find the right path.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildConveyorMaze() {
    const level = createLevelShell({
      id: 'conveyor_maze',
      name: 'Conveyor Maze',
      width: 120,
      height: 120,
      timeLimit: 30,
      start: { x: 10, y: 60 },
      reward: { presses: 9000, unlocks: ['marble_conveyor_maze_complete'], claimKey: 'conveyor_maze' }
    });
    // Start at z=4
    fillTrack(level, 6, 56, 12, 10, 4);
    // Main grid — 4x4 rooms connected by conveyor corridors
    // Room grid: rooms at (12,12), (12,28), (12,44), (28,12), (28,28), (28,44), (44,12), (44,28), (44,44)
    // Each room is 6x6, corridors are 4 wide
    // Rooms (safe, no conveyor)
    const rooms = [
      [24, 24], [24, 56], [24, 88],
      [56, 24], [56, 56], [56, 88],
      [88, 24], [88, 56], [88, 88]
    ];
    for (const [rx, ry] of rooms) {
      fillTrack(level, rx, ry, 12, 12, 4);
    }
    // Horizontal corridors (east-west) with conveyors
    // Row 1 (y=13): push east
    fillTrack(level, 36, 26, 20, 8, 4, { conveyor: { x: 3.0, y: 0, strength: 2.5 } });
    fillTrack(level, 68, 26, 20, 8, 4, { conveyor: { x: 3.0, y: 0, strength: 2.5 } });
    // Row 2 (y=29): push west
    fillTrack(level, 36, 58, 20, 8, 4, { conveyor: { x: -3.0, y: 0, strength: 2.5 } });
    fillTrack(level, 68, 58, 20, 8, 4, { conveyor: { x: -3.0, y: 0, strength: 2.5 } });
    // Row 3 (y=45): push east
    fillTrack(level, 36, 90, 20, 8, 4, { conveyor: { x: 3.0, y: 0, strength: 2.5 } });
    fillTrack(level, 68, 90, 20, 8, 4, { conveyor: { x: 3.0, y: 0, strength: 2.5 } });
    // Vertical corridors (north-south) with conveyors
    // Col 1 (x=13): push south
    fillTrack(level, 26, 36, 8, 20, 4, { conveyor: { x: 0, y: 3.0, strength: 2.5 } });
    fillTrack(level, 26, 68, 8, 20, 4, { conveyor: { x: 0, y: 3.0, strength: 2.5 } });
    // Col 2 (x=29): push north
    fillTrack(level, 58, 36, 8, 20, 4, { conveyor: { x: 0, y: -3.0, strength: 2.5 } });
    fillTrack(level, 58, 68, 8, 20, 4, { conveyor: { x: 0, y: -3.0, strength: 2.5 } });
    // Col 3 (x=45): push south
    fillTrack(level, 90, 36, 8, 20, 4, { conveyor: { x: 0, y: 3.0, strength: 2.5 } });
    fillTrack(level, 90, 68, 8, 20, 4, { conveyor: { x: 0, y: 3.0, strength: 2.5 } });
    // Connect start to room (12,28)
    fillTrack(level, 18, 56, 6, 10, 4);
    // Goal in room (44,44)
    setGoal(level, 94, 94, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 61, z: 4 });
    addGraphNode(level, { id: 'r_12_28', type: 'hub', x: 31, y: 63, z: 4 });
    addGraphNode(level, { id: 'r_12_44', type: 'hub', x: 31, y: 95, z: 4 });
    addGraphNode(level, { id: 'r_28_44', type: 'hub', x: 63, y: 95, z: 4 });
    addGraphNode(level, { id: 'r_44_44', type: 'hub', x: 95, y: 95, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 95, y: 95, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'r_12_28', kind: 'roll' });
    addGraphEdge(level, { from: 'r_12_28', to: 'r_12_44', kind: 'roll', tag: 'conveyor' });
    addGraphEdge(level, { from: 'r_12_44', to: 'r_28_44', kind: 'roll', tag: 'conveyor' });
    addGraphEdge(level, { from: 'r_28_44', to: 'r_44_44', kind: 'roll', tag: 'conveyor' });
    addGraphEdge(level, { from: 'r_44_44', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 19 — Tunnel Express
  // Multiple tunnel choices, only some lead to the goal efficiently.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTunnelExpress() {
    const level = createLevelShell({
      id: 'tunnel_express',
      name: 'Tunnel Express',
      width: 140,
      height: 120,
      timeLimit: 30,
      start: { x: 10, y: 60 },
      reward: { presses: 9500, unlocks: ['marble_tunnel_express_complete'], claimKey: 'tunnel_express' }
    });
    // Start at z=8
    fillTrack(level, 6, 56, 12, 10, 8);
    // Hub area with three tunnel entrances
    fillTrack(level, 18, 44, 24, 32, 8);
    // Tunnel A — fast, direct to near-goal area
    placeTunnel(level, {
      id: 'tunnel_a',
      path: [
        { x: 31, y: 51, z: 8 },
        { x: 51, y: 41, z: 4 },
        { x: 81, y: 37, z: 3 },
        { x: 111, y: 45, z: 4 }
      ],
      speed: 9,
      exitType: 'emerge',
      funnelRadius: 2,
      funnelDepth: 3
    });
    // Tunnel B — medium, exits to a mid-platform
    placeTunnel(level, {
      id: 'tunnel_b',
      path: [
        { x: 31, y: 61, z: 8 },
        { x: 41, y: 71, z: 5 },
        { x: 61, y: 77, z: 4 },
        { x: 77, y: 71, z: 6 }
      ],
      speed: 7,
      exitType: 'emerge',
      funnelRadius: 2,
      funnelDepth: 2
    });
    // Tunnel C — scenic, exits far from goal but safe
    placeTunnel(level, {
      id: 'tunnel_c',
      path: [
        { x: 31, y: 71, z: 8 },
        { x: 41, y: 91, z: 5 },
        { x: 71, y: 101, z: 3 },
        { x: 101, y: 91, z: 4 }
      ],
      speed: 6,
      exitType: 'emerge',
      funnelRadius: 2,
      funnelDepth: 2
    });
    // Mid platform from tunnel B exit
    fillTrack(level, 72, 66, 16, 12, 6);
    placeRamp(level, { x: 88, y: 68, dir: 'east', length: 6, width: 16, startZ: 6, endZ: 4 });
    fillTrack(level, 94, 68, 12, 8, 4);
    // Platform from tunnel C exit
    fillTrack(level, 96, 86, 16, 12, 4);
    fillTrack(level, 106, 76, 8, 10, 4);
    // Near-goal area from tunnel A
    fillTrack(level, 106, 40, 16, 12, 4);
    // All paths converge to goal area
    fillTrack(level, 110, 52, 12, 24, 4);
    fillTrack(level, 116, 60, 12, 8, 4);
    // Goal
    setGoal(level, 124, 64, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 61, z: 8 });
    addGraphNode(level, { id: 'hub', type: 'fork', x: 31, y: 61, z: 8 });
    addGraphNode(level, { id: 'exit_a', type: 'route', x: 111, y: 45, z: 4 });
    addGraphNode(level, { id: 'exit_b', type: 'route', x: 77, y: 71, z: 6 });
    addGraphNode(level, { id: 'exit_c', type: 'route', x: 101, y: 91, z: 4 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 125, y: 65, z: 4 });
    addGraphEdge(level, { from: 'start', to: 'hub', kind: 'roll' });
    addGraphEdge(level, { from: 'hub', to: 'exit_a', kind: 'roll', tag: 'tunnel' });
    addGraphEdge(level, { from: 'hub', to: 'exit_b', kind: 'roll', tag: 'tunnel' });
    addGraphEdge(level, { from: 'hub', to: 'exit_c', kind: 'roll', tag: 'tunnel' });
    addGraphEdge(level, { from: 'exit_a', to: 'goal', kind: 'roll' });
    addGraphEdge(level, { from: 'exit_b', to: 'goal', kind: 'descent' });
    addGraphEdge(level, { from: 'exit_c', to: 'goal', kind: 'roll' });
    return registerLevel(level);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 20 — The Final Ascent
  // Ultimate challenge combining all mechanics. Climb + descend + survive.
  // ═══════════════════════════════════════════════════════════════════════════
  function buildTheFinalAscent() {
    const level = createLevelShell({
      id: 'the_final_ascent',
      name: 'The Final Ascent',
      width: 160,
      height: 140,
      timeLimit: 30,
      start: { x: 10, y: 70 },
      reward: { presses: 10000, unlocks: ['marble_the_final_ascent_complete'], claimKey: 'the_final_ascent' }
    });
    // Start at z=2
    fillTrack(level, 6, 66, 12, 10, 2);
    // Phase 1: Ascent via elevators and ramps
    fillTrack(level, 18, 66, 12, 10, 2);
    addElevator(level, 'final_elev1', 15, 34, 2, 6, 3, 3, 0.8, 4.5);
    fillTrack(level, 36, 66, 16, 10, 6);
    // Sweeper guarding the path at z=6
    addActor(level, {
      id: 'final_sweep1', kind: ACTOR_KINDS.SWEEPER,
      x: 22, y: 35, z: 6, topHeight: 6,
      width: 2, height: 1, armLength: 3.0, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    // Ramp up to z=8
    placeRamp(level, { x: 52, y: 66, dir: 'east', length: 8, width: 20, startZ: 6, endZ: 8 });
    fillTrack(level, 60, 66, 12, 10, 8);
    // Timed gate
    addTimedGate(level, 'final_gate1', 33, 33, 8, 1, 5, 1.5, 1.2);
    // Phase 2: Ice corridor at z=8
    fillTrack(level, 72, 60, 28, 20, 8, { friction: 0.6 });
    blockerRing(level, 36, 30, 14, 10, 10);
    clearBlocker(level, 49, 34);
    clearBlocker(level, 49, 35);
    clearBlocker(level, 49, 36);
    // Phase 3: Crumble bridge over void at z=8
    fillTrack(level, 100, 66, 8, 10, 8);
    fillTrack(level, 108, 68, 16, 6, 8, { crumble: { delay: 0.5, respawn: 3.0 } });
    fillTrack(level, 124, 66, 8, 10, 8);
    // Phase 4: Final ascent — bounce + ramp to peak
    fillTrack(level, 124, 56, 8, 10, 8);
    // Bounce to z=12
    setSurface(level, 126, 58, { baseHeight: 8, shape: SHAPES.FLAT, bounce: 8 });
    setSurface(level, 128, 58, { baseHeight: 8, shape: SHAPES.FLAT, bounce: 8 });
    // Peak platform at z=12
    fillTrack(level, 120, 44, 16, 12, 12);
    // Ramp alternative to z=12
    placeRamp(level, { x: 124, y: 50, dir: 'north', length: 6, width: 16, startZ: 8, endZ: 12 });
    // Final sweeper at the peak
    addActor(level, {
      id: 'final_sweep2', kind: ACTOR_KINDS.SWEEPER,
      x: 64, y: 25, z: 12, topHeight: 12,
      width: 2, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 2.0, fatal: true
    });
    // Goal at the peak
    fillTrack(level, 132, 46, 8, 6, 12);
    setGoal(level, 136, 48, 0.55);
    // Route graph
    addGraphNode(level, { id: 'start', type: 'entry', x: 11, y: 71, z: 2 });
    addGraphNode(level, { id: 'elev', type: 'route', x: 33, y: 71, z: 6 });
    addGraphNode(level, { id: 'sweep1', type: 'route', x: 45, y: 71, z: 6 });
    addGraphNode(level, { id: 'gate', type: 'route', x: 67, y: 71, z: 8 });
    addGraphNode(level, { id: 'ice', type: 'route', x: 87, y: 71, z: 8 });
    addGraphNode(level, { id: 'crumble', type: 'route', x: 117, y: 71, z: 8 });
    addGraphNode(level, { id: 'peak', type: 'hub', x: 129, y: 51, z: 12 });
    addGraphNode(level, { id: 'goal', type: 'goal', x: 137, y: 49, z: 12 });
    addGraphEdge(level, { from: 'start', to: 'elev', kind: 'roll', tag: 'elevator' });
    addGraphEdge(level, { from: 'elev', to: 'sweep1', kind: 'roll' });
    addGraphEdge(level, { from: 'sweep1', to: 'gate', kind: 'roll' });
    addGraphEdge(level, { from: 'gate', to: 'ice', kind: 'timed_cross' });
    addGraphEdge(level, { from: 'ice', to: 'crumble', kind: 'roll', tag: 'ice' });
    addGraphEdge(level, { from: 'crumble', to: 'peak', kind: 'roll', tag: 'crumble' });
    addGraphEdge(level, { from: 'peak', to: 'goal', kind: 'roll' });
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

  // ─── Lazy level loading ─────────────────────────────────────────────────────
  // Levels are expensive to build. Only build on first access and
  // release non-current levels to free memory.
  const LEVEL_REGISTRY = [
    { id: 'training_ground',      name: 'Training Ground',      builder: buildTrainingGround },
    { id: 'gentle_slopes',        name: 'Gentle Slopes',        builder: buildGentleSlopes },
    { id: 'forked_path',          name: 'Forked Path',          builder: buildForkedPath },
    { id: 'crumble_bridge',       name: 'Crumble Bridge',       builder: buildCrumbleBridge },
    { id: 'conveyor_lane',        name: 'Conveyor Lane',        builder: buildConveyorLane },
    { id: 'bounce_garden',        name: 'Bounce Garden',        builder: buildBounceGarden },
    { id: 'ice_rink',             name: 'Ice Rink',             builder: buildIceRink },
    { id: 'gate_runner',          name: 'Gate Runner',          builder: buildGateRunner },
    { id: 'sweeper_alley',        name: 'Sweeper Alley',        builder: buildSweeperAlley },
    { id: 'platform_hop',         name: 'Platform Hop',         builder: buildPlatformHop },
    { id: 'tunnel_network',       name: 'Tunnel Network',       builder: buildTunnelNetwork },
    { id: 'switchback_descent',   name: 'Switchback Descent',   builder: buildSwitchbackDescentV2 },
    { id: 'hazard_gauntlet',      name: 'Hazard Gauntlet',      builder: buildHazardGauntlet },
    { id: 'elevator_shaft',       name: 'Elevator Shaft',       builder: buildElevatorShaft },
    { id: 'the_mountain',         name: 'The Mountain',         builder: buildTheMountain },
    { id: 'ice_crossing',         name: 'Ice Crossing',         builder: buildIceCrossing },
    { id: 'crumble_cascade',      name: 'Crumble Cascade',      builder: buildCrumbleCascade },
    { id: 'the_gauntlet_v2',      name: 'The Gauntlet',         builder: buildTheGauntletV2 },
    { id: 'conveyor_maze',        name: 'Conveyor Maze',        builder: buildConveyorMaze },
    { id: 'tunnel_express',       name: 'Tunnel Express',       builder: buildTunnelExpress },
    { id: 'the_final_ascent',     name: 'The Final Ascent',     builder: buildTheFinalAscent }
  ];
  const _levelCache = new Map(); // id → built level object
  let _currentLevelId = null;    // track which level is active to release others

  function _ensureLevel(index) {
    const entry = LEVEL_REGISTRY[index];
    if (!entry) return null;
    if (!_levelCache.has(entry.id)) {
      _levelCache.set(entry.id, entry.builder());
    }
    return _levelCache.get(entry.id);
  }

  function _releaseOtherLevels(keepId) {
    for (const [id] of _levelCache) {
      if (id !== keepId) _levelCache.delete(id);
    }
  }

  // LEVELS proxy: behaves like an array but builds levels lazily
  const LEVELS = new Proxy(LEVEL_REGISTRY, {
    get(target, prop) {
      if (prop === 'length') return target.length;
      if (prop === Symbol.iterator) {
        return function* () {
          for (let i = 0; i < target.length; i++) yield _ensureLevel(i);
        };
      }
      // Array methods that only need id/name (avoid building all levels)
      if (prop === 'map') return function(fn) {
        return target.map((entry, i) => {
          // If only id/name are accessed, return lightweight stub
          const stub = _levelCache.get(entry.id) || { id: entry.id, name: entry.name };
          return fn(stub, i, target);
        });
      };
      if (prop === 'filter') return function(fn) {
        return target.filter((entry, i) => {
          const stub = _levelCache.get(entry.id) || { id: entry.id, name: entry.name };
          return fn(stub, i, target);
        }).map((entry) => _levelCache.get(entry.id) || { id: entry.id, name: entry.name });
      };
      if (prop === 'findIndex') return function(fn) {
        return target.findIndex((entry, i) => {
          const stub = _levelCache.get(entry.id) || { id: entry.id, name: entry.name };
          return fn(stub, i, target);
        });
      };
      if (prop === 'find') return function(fn) {
        const idx = target.findIndex((entry, i) => {
          const stub = _levelCache.get(entry.id) || { id: entry.id, name: entry.name };
          return fn(stub, i, target);
        });
        return idx >= 0 ? _ensureLevel(idx) : undefined;
      };
      const idx = Number(prop);
      if (Number.isInteger(idx) && idx >= 0 && idx < target.length) {
        return _ensureLevel(idx);
      }
      return target[prop];
    }
  });

  function getAllLevels() {
    // Return lightweight stubs for iteration; full levels built on demand
    return [...LEVEL_REGISTRY.map((entry) => _levelCache.get(entry.id) || { id: entry.id, name: entry.name }), ...GENERATED_LEVELS];
  }
  function getLevelById(id) {
    const genLevel = GENERATED_LEVELS.find((l) => l.id === id);
    if (genLevel) return genLevel;
    const idx = LEVEL_REGISTRY.findIndex((entry) => entry.id === id);
    if (idx >= 0) {
      const level = _ensureLevel(idx);
      // Release other levels when switching to a new one
      if (_currentLevelId !== id) {
        _currentLevelId = id;
        _releaseOtherLevels(id);
      }
      return level;
    }
    return _ensureLevel(0);
  }
  function getLevelIndex(id) {
    return LEVEL_REGISTRY.findIndex((entry) => entry.id === id);
  }
  function getNextLevelId(id) {
    const index = getLevelIndex(id);
    if (index < 0 || index >= LEVEL_REGISTRY.length - 1) return null;
    return LEVEL_REGISTRY[index + 1].id;
  }
  function isLevelUnlocked(clearedLevels = [], levelId) {
    const index = getLevelIndex(levelId);
    if (index < 0) return true;
    if (index === 0) return true;
    if (clearedLevels.includes(levelId)) return true;
    return clearedLevels.includes(LEVEL_REGISTRY[index - 1].id);
  }
  function getUnlockedLevelIds(clearedLevels = []) {
    return LEVEL_REGISTRY.filter((entry) => isLevelUnlocked(clearedLevels, entry.id)).map((entry) => entry.id);
  }

  // ─── Secret tunnel reveal check ────────────────────────────────────────────
  // All 20 non-training level IDs that must be cleared to reveal the secret tunnel
  var SECRET_LEVEL_IDS = [
    'gentle_slopes', 'forked_path', 'crumble_bridge', 'conveyor_lane', 'bounce_garden',
    'ice_rink', 'gate_runner', 'sweeper_alley', 'platform_hop', 'tunnel_network',
    'switchback_descent', 'hazard_gauntlet', 'elevator_shaft', 'the_mountain',
    'ice_crossing', 'crumble_cascade', 'the_gauntlet_v2', 'conveyor_maze',
    'tunnel_express', 'the_final_ascent'
  ];

  function isSecretRevealed(clearedLevels) {
    if (!clearedLevels || !Array.isArray(clearedLevels)) return false;
    return SECRET_LEVEL_IDS.every(function(id) { return clearedLevels.indexOf(id) >= 0; });
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
    sampleStaticSurfaceOnly,
    setGoal,
    placeTunnel,
    SECRET_LEVEL_IDS,
    isSecretRevealed
  };
})();
