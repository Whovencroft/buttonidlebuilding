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
        downtime: patch.crumble.downtime ?? patch.crumble.respawn ?? 1.8,
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
        pauseDuration: actor.path.pauseDuration ?? 1.0,
        midpointPause: actor.path.midpointPause ?? 0,
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

  // Convert raw travel distance to path position, accounting for midpoint pauses
  function rawToPathPos(raw, totalSegments, midPauseTime) {
    if (midPauseTime <= 0) return raw;
    let pos = 0;
    let remaining = raw;
    for (let i = 0; i < totalSegments; i++) {
      if (remaining <= 1) {
        pos += remaining;
        return pos;
      }
      pos += 1;
      remaining -= 1;
      if (i < totalSegments - 1) {
        if (remaining <= midPauseTime) {
          return pos; // pausing at midpoint
        }
        remaining -= midPauseTime;
      }
    }
    return totalSegments;
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
        // Ping-pong with endpoint + midpoint pauses:
        const midPause = actor.path.midpointPause ?? 0;
        const midPauseTime = midPause * speed; // in travel-units
        const numMidpoints = Math.max(0, totalSegments - 1);
        const moveDist = totalSegments;
        const oneWayDist = moveDist + numMidpoints * midPauseTime;
        const fullCycle = oneWayDist * 2 + pausePerEnd * 2;
        const raw = (clock * speed) % fullCycle;
        let pathPos;
        if (raw < oneWayDist) {
          pathPos = rawToPathPos(raw, totalSegments, midPauseTime);
        } else if (raw < oneWayDist + pausePerEnd) {
          pathPos = totalSegments;
        } else if (raw < oneWayDist * 2 + pausePerEnd) {
          const reverseRaw = raw - oneWayDist - pausePerEnd;
          pathPos = totalSegments - rawToPathPos(reverseRaw, totalSegments, midPauseTime);
        } else {
          pathPos = 0;
        }

        pathPos = clamp(pathPos, 0, totalSegments);
        if (pathPos >= totalSegments - 0.0001) {
          const last = points[points.length - 1];
          state.x = last.x;
          state.y = last.y;
          state.z = last.z;
        } else if (pathPos <= 0.0001) {
          const first = points[0];
          state.x = first.x;
          state.y = first.y;
          state.z = first.z;
        } else {
          segmentIndex = Math.floor(pathPos);
          t = pathPos - segmentIndex;
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
        pauseDuration: extra.pauseDuration ?? 1.0,
        midpointPause: extra.midpointPause ?? 0,
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
  // ─── Level 0: Training Ground ───
  // ─── Level 0: Training Ground ───
  function buildTrainingGround() {
    const level = createLevelShell({
      id: 'training_ground',
      name: 'Training Ground',
      width: 50,
      height: 50,
      start: { x: 5.5, y: 5.5, z: 6 },
      timeLimit: 0
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 2, 8, 11, 6);
    fillTrack(level, 15, 5, 8, 4, 4);
    fillTrack(level, 19, 9, 4, 14, 4);
    fillTrack(level, 6, 17, 13, 2, 4);
    fillTrack(level, 6, 19, 4, 8, 4);
    fillTrack(level, 15, 19, 1, 20, 4);
    fillTrack(level, 23, 19, 8, 4, 4);
    fillTrack(level, 10, 22, 2, 17, 4);
    fillTrack(level, 20, 23, 2, 10, 4);
    fillTrack(level, 8, 27, 2, 6, 4);
    fillTrack(level, 12, 31, 3, 8, 4);
    fillTrack(level, 16, 31, 4, 2, 4);
    fillTrack(level, 26, 27, 7, 8, 2);
    fillTrack(level, 26, 35, 3, 13, 2);
    fillTrack(level, 19, 40, 7, 6, 2);
    fillTrack(level, 29, 40, 1, 8, 2);
    fillTrack(level, 18, 41, 1, 7, 2);
    fillTrack(level, 17, 42, 1, 7, 2);
    fillTrack(level, 14, 43, 3, 6, 2);
    fillTrack(level, 19, 46, 3, 1, 2);
    fillTrack(level, 25, 46, 1, 2, 2);
    fillTrack(level, 19, 47, 2, 1, 2);
    // Ramps
    setSurface(level, 11, 5, { baseHeight: 5.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 12, 5, { baseHeight: 5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 13, 5, { baseHeight: 4.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 5, { baseHeight: 4, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 11, 6, { baseHeight: 5.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 12, 6, { baseHeight: 5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 13, 6, { baseHeight: 4.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 6, { baseHeight: 4, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 11, 7, { baseHeight: 5.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 12, 7, { baseHeight: 5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 13, 7, { baseHeight: 4.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 7, { baseHeight: 4, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 11, 8, { baseHeight: 5.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 12, 8, { baseHeight: 5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 13, 8, { baseHeight: 4.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 8, { baseHeight: 4, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 31, { baseHeight: 3.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 31, { baseHeight: 3, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 24, 31, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 25, 31, { baseHeight: 2, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 32, { baseHeight: 3.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 32, { baseHeight: 3, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 24, 32, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 25, 32, { baseHeight: 2, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 7, 13, { baseHeight: 5.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 7, 14, { baseHeight: 5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 7, 15, { baseHeight: 4.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 7, 16, { baseHeight: 4, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 8, 13, { baseHeight: 5.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 8, 14, { baseHeight: 5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 8, 15, { baseHeight: 4.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 8, 16, { baseHeight: 4, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 27, 23, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 27, 24, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 27, 25, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 27, 26, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 28, 23, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 28, 24, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 28, 25, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 28, 26, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 29, 23, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 29, 24, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 29, 25, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 29, 26, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 30, 23, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 30, 24, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 30, 25, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 30, 26, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 39, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 40, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 41, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 42, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 39, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 40, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 41, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 42, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });

    // --- Goal ---
    setGoal(level, 27.5, 43.5);

    return registerLevel(level);
  }

  // ─── Level 1: Gentle Slopes ───
  function buildGentleSlopes() {
    const level = createLevelShell({
      id: 'gentle_slopes',
      name: 'Gentle Slopes',
      width: 60,
      height: 70,
      start: { x: 5.5, y: 5.5, z: 14 },
      timeLimit: 60
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 8, 6, 14);
    fillTrack(level, 16, 3, 8, 6, 12);
    fillTrack(level, 16, 14, 10, 8, 10);
    fillTrack(level, 5, 15, 6, 6, 8);
    fillTrack(level, 4, 26, 10, 8, 6);
    fillTrack(level, 20, 27, 20, 5, 4);
    fillTrack(level, 47, 56, 3, 1, 4);
    fillTrack(level, 28, 39, 12, 5, 2);
    fillTrack(level, 28, 51, 15, 4, 0);
    fillTrack(level, 43, 52, 7, 4, 0);
    fillTrack(level, 41, 55, 2, 1, 0);
    fillTrack(level, 42, 56, 5, 4, 0);
    fillTrack(level, 47, 57, 3, 3, 0);
    // Ramps
    setSurface(level, 11, 4, { baseHeight: 13.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 12, 4, { baseHeight: 13.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 13, 4, { baseHeight: 12.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 4, { baseHeight: 12.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 15, 4, { baseHeight: 12, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 11, 5, { baseHeight: 13.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 12, 5, { baseHeight: 13.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 13, 5, { baseHeight: 12.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 5, { baseHeight: 12.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 15, 5, { baseHeight: 12, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 11, 6, { baseHeight: 13.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 12, 6, { baseHeight: 13.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 13, 6, { baseHeight: 12.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 6, { baseHeight: 12.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 15, 6, { baseHeight: 12, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 11, 7, { baseHeight: 13.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 12, 7, { baseHeight: 13.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 13, 7, { baseHeight: 12.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 7, { baseHeight: 12.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 15, 7, { baseHeight: 12, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 28, { baseHeight: 5.66, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 15, 28, { baseHeight: 5.36, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 16, 28, { baseHeight: 4.96, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 17, 28, { baseHeight: 4.66, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 18, 28, { baseHeight: 4.36, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 19, 28, { baseHeight: 3.96, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 14, 29, { baseHeight: 5.66, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 15, 29, { baseHeight: 5.36, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 16, 29, { baseHeight: 4.96, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 17, 29, { baseHeight: 4.66, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 18, 29, { baseHeight: 4.36, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 19, 29, { baseHeight: 3.96, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 14, 30, { baseHeight: 5.66, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 15, 30, { baseHeight: 5.36, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 16, 30, { baseHeight: 4.96, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 17, 30, { baseHeight: 4.66, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 18, 30, { baseHeight: 4.36, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 19, 30, { baseHeight: 3.96, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 14, 31, { baseHeight: 5.66, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 15, 31, { baseHeight: 5.36, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 16, 31, { baseHeight: 4.96, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 17, 31, { baseHeight: 4.66, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 18, 31, { baseHeight: 4.36, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 19, 31, { baseHeight: 3.96, shape: 'slope_w', rise: 0.34, kind: 'track' });
    setSurface(level, 18, 9, { baseHeight: 11.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 18, 10, { baseHeight: 11.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 18, 11, { baseHeight: 10.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 18, 12, { baseHeight: 10.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 18, 13, { baseHeight: 10, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 19, 9, { baseHeight: 11.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 19, 10, { baseHeight: 11.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 19, 11, { baseHeight: 10.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 19, 12, { baseHeight: 10.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 19, 13, { baseHeight: 10, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 20, 9, { baseHeight: 11.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 20, 10, { baseHeight: 11.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 20, 11, { baseHeight: 10.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 20, 12, { baseHeight: 10.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 20, 13, { baseHeight: 10, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 9, { baseHeight: 11.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 10, { baseHeight: 11.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 11, { baseHeight: 10.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 12, { baseHeight: 10.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 13, { baseHeight: 10, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 6, 21, { baseHeight: 7.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 6, 22, { baseHeight: 7.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 6, 23, { baseHeight: 6.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 6, 24, { baseHeight: 6.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 6, 25, { baseHeight: 6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 7, 21, { baseHeight: 7.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 7, 22, { baseHeight: 7.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 7, 23, { baseHeight: 6.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 7, 24, { baseHeight: 6.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 7, 25, { baseHeight: 6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 8, 21, { baseHeight: 7.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 8, 22, { baseHeight: 7.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 8, 23, { baseHeight: 6.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 8, 24, { baseHeight: 6.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 8, 25, { baseHeight: 6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 9, 21, { baseHeight: 7.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 9, 22, { baseHeight: 7.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 9, 23, { baseHeight: 6.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 9, 24, { baseHeight: 6.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 9, 25, { baseHeight: 6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 36, 32, { baseHeight: 3.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 36, 33, { baseHeight: 4.13, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 36, 34, { baseHeight: 3.73, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 36, 35, { baseHeight: 2.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 36, 36, { baseHeight: 2.13, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 36, 37, { baseHeight: 1.73, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 36, 38, { baseHeight: 1.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 37, 32, { baseHeight: 3.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 37, 33, { baseHeight: 4.13, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 37, 34, { baseHeight: 3.73, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 37, 35, { baseHeight: 2.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 37, 36, { baseHeight: 2.13, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 37, 37, { baseHeight: 1.73, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 37, 38, { baseHeight: 1.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 38, 32, { baseHeight: 3.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 38, 33, { baseHeight: 4.13, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 38, 34, { baseHeight: 3.73, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 38, 35, { baseHeight: 2.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 38, 36, { baseHeight: 2.13, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 38, 37, { baseHeight: 1.73, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 38, 38, { baseHeight: 1.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 39, 32, { baseHeight: 3.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 39, 33, { baseHeight: 4.13, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 39, 34, { baseHeight: 3.73, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 39, 35, { baseHeight: 2.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 39, 36, { baseHeight: 2.13, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 39, 37, { baseHeight: 1.73, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 39, 38, { baseHeight: 1.43, shape: 'slope_n', rise: 0.57, kind: 'track' });
    setSurface(level, 28, 44, { baseHeight: 1.67, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 28, 45, { baseHeight: 1.37, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 28, 46, { baseHeight: 0.97, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 28, 47, { baseHeight: 0.67, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 28, 48, { baseHeight: 0.37, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 28, 49, { baseHeight: -0.03, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 28, 50, { baseHeight: -0.33, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 29, 44, { baseHeight: 1.67, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 29, 45, { baseHeight: 1.37, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 29, 46, { baseHeight: 0.97, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 29, 47, { baseHeight: 0.67, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 29, 48, { baseHeight: 0.37, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 29, 49, { baseHeight: -0.03, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 29, 50, { baseHeight: -0.33, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 30, 44, { baseHeight: 1.67, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 30, 45, { baseHeight: 1.37, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 30, 46, { baseHeight: 0.97, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 30, 47, { baseHeight: 0.67, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 30, 48, { baseHeight: 0.37, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 30, 49, { baseHeight: -0.03, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 30, 50, { baseHeight: -0.33, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 31, 44, { baseHeight: 1.67, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 31, 45, { baseHeight: 1.37, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 31, 46, { baseHeight: 0.97, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 31, 47, { baseHeight: 0.67, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 31, 48, { baseHeight: 0.37, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 31, 49, { baseHeight: -0.03, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 31, 50, { baseHeight: -0.33, shape: 'slope_n', rise: 0.33, kind: 'track' });
    setSurface(level, 11, 16, { baseHeight: 8, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 12, 16, { baseHeight: 8.4, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 13, 16, { baseHeight: 8.8, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 16, { baseHeight: 9.2, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 15, 16, { baseHeight: 9.6, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 11, 17, { baseHeight: 8, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 12, 17, { baseHeight: 8.4, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 13, 17, { baseHeight: 8.8, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 17, { baseHeight: 9.2, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 15, 17, { baseHeight: 9.6, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 11, 18, { baseHeight: 8, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 12, 18, { baseHeight: 8.4, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 13, 18, { baseHeight: 8.8, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 18, { baseHeight: 9.2, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 15, 18, { baseHeight: 9.6, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 11, 19, { baseHeight: 8, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 12, 19, { baseHeight: 8.4, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 13, 19, { baseHeight: 8.8, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 14, 19, { baseHeight: 9.2, shape: 'slope_e', rise: 0.4, kind: 'track' });
    setSurface(level, 15, 19, { baseHeight: 9.6, shape: 'slope_e', rise: 0.4, kind: 'track' });

    // --- Goal ---
    setGoal(level, 46.5, 56.5);

    return registerLevel(level);
  }

  // ─── Level 2: Forked Path ───
  function buildForkedPath() {
    const level = createLevelShell({
      id: 'forked_path',
      name: 'Forked Path',
      width: 65,
      height: 60,
      start: { x: 5.5, y: 28.5, z: 10 },
      timeLimit: 60
    });

    // --- Surface tiles ---
    fillTrack(level, 45, 9, 14, 3, 2);
    fillTrack(level, 59, 10, 2, 7, 2);
    fillTrack(level, 45, 12, 2, 3, 2);
    fillTrack(level, 53, 12, 6, 6, 2);
    fillTrack(level, 53, 18, 4, 16, 2);
    fillTrack(level, 45, 33, 3, 4, 2);
    fillTrack(level, 53, 34, 3, 6, 2);
    fillTrack(level, 48, 36, 5, 4, 2);
    fillTrack(level, 47, 37, 1, 3, 2);
    fillTrack(level, 17, 13, 3, 7, 8);
    fillTrack(level, 35, 13, 8, 20, 4);
    fillTrack(level, 43, 18, 5, 10, 4);
    fillTrack(level, 48, 19, 1, 3, 4);
    fillTrack(level, 48, 24, 1, 3, 4);
    fillTrack(level, 25, 14, 6, 3, 6);
    fillTrack(level, 15, 24, 6, 10, 10);
    fillTrack(level, 3, 26, 6, 6, 10);
    fillTrack(level, 9, 27, 6, 4, 10);
    fillTrack(level, 16, 37, 5, 6, 9);
    fillTrack(level, 25, 37, 8, 6, 7);
    fillTrack(level, 38, 37, 5, 6, 5);
    // Ramps
    setSurface(level, 20, 14, { baseHeight: 7.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 14, { baseHeight: 7.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 22, 14, { baseHeight: 6.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 23, 14, { baseHeight: 6.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 24, 14, { baseHeight: 6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 31, 14, { baseHeight: 5.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 32, 14, { baseHeight: 5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 14, { baseHeight: 4.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 34, 14, { baseHeight: 4, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 15, { baseHeight: 7.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 15, { baseHeight: 7.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 22, 15, { baseHeight: 6.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 23, 15, { baseHeight: 6.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 24, 15, { baseHeight: 6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 31, 15, { baseHeight: 5.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 32, 15, { baseHeight: 5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 15, { baseHeight: 4.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 34, 15, { baseHeight: 4, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 16, { baseHeight: 7.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 16, { baseHeight: 7.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 22, 16, { baseHeight: 6.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 23, 16, { baseHeight: 6.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 24, 16, { baseHeight: 6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 31, 16, { baseHeight: 5.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 32, 16, { baseHeight: 5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 16, { baseHeight: 4.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 34, 16, { baseHeight: 4, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 48, 18, { baseHeight: 3.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 49, 18, { baseHeight: 3, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 50, 18, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 51, 18, { baseHeight: 2, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 52, 18, { baseHeight: 1.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 48, 22, { baseHeight: 3.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 49, 22, { baseHeight: 3, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 50, 22, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 51, 22, { baseHeight: 2, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 52, 22, { baseHeight: 1.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 48, 23, { baseHeight: 3.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 49, 23, { baseHeight: 3, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 50, 23, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 51, 23, { baseHeight: 2, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 52, 23, { baseHeight: 1.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 48, 27, { baseHeight: 3.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 49, 27, { baseHeight: 3, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 50, 27, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 51, 27, { baseHeight: 2, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 52, 27, { baseHeight: 1.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 43, 37, { baseHeight: 4, shape: 'slope_w', kind: 'track' });
    setSurface(level, 44, 37, { baseHeight: 3, shape: 'slope_w', kind: 'track' });
    setSurface(level, 45, 37, { baseHeight: 2, shape: 'slope_w', kind: 'track' });
    setSurface(level, 46, 37, { baseHeight: 1, shape: 'slope_w', kind: 'track' });
    setSurface(level, 21, 38, { baseHeight: 8.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 38, { baseHeight: 8, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 38, { baseHeight: 7.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 24, 38, { baseHeight: 7, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 38, { baseHeight: 6.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 34, 38, { baseHeight: 6.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 35, 38, { baseHeight: 5.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 36, 38, { baseHeight: 5.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 38, { baseHeight: 5, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 43, 38, { baseHeight: 4, shape: 'slope_w', kind: 'track' });
    setSurface(level, 44, 38, { baseHeight: 3, shape: 'slope_w', kind: 'track' });
    setSurface(level, 45, 38, { baseHeight: 2, shape: 'slope_w', kind: 'track' });
    setSurface(level, 46, 38, { baseHeight: 1, shape: 'slope_w', kind: 'track' });
    setSurface(level, 21, 39, { baseHeight: 8.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 39, { baseHeight: 8, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 39, { baseHeight: 7.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 24, 39, { baseHeight: 7, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 39, { baseHeight: 6.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 34, 39, { baseHeight: 6.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 35, 39, { baseHeight: 5.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 36, 39, { baseHeight: 5.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 39, { baseHeight: 5, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 43, 39, { baseHeight: 4, shape: 'slope_w', kind: 'track' });
    setSurface(level, 44, 39, { baseHeight: 3, shape: 'slope_w', kind: 'track' });
    setSurface(level, 45, 39, { baseHeight: 2, shape: 'slope_w', kind: 'track' });
    setSurface(level, 46, 39, { baseHeight: 1, shape: 'slope_w', kind: 'track' });
    setSurface(level, 21, 40, { baseHeight: 8.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 40, { baseHeight: 8, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 40, { baseHeight: 7.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 24, 40, { baseHeight: 7, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 40, { baseHeight: 6.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 34, 40, { baseHeight: 6.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 35, 40, { baseHeight: 5.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 36, 40, { baseHeight: 5.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 40, { baseHeight: 5, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 41, { baseHeight: 8.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 41, { baseHeight: 8, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 41, { baseHeight: 7.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 24, 41, { baseHeight: 7, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 41, { baseHeight: 6.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 34, 41, { baseHeight: 6.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 35, 41, { baseHeight: 5.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 36, 41, { baseHeight: 5.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 41, { baseHeight: 5, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 21, 42, { baseHeight: 8.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 42, { baseHeight: 8, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 42, { baseHeight: 7.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 24, 42, { baseHeight: 7, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 42, { baseHeight: 6.6, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 34, 42, { baseHeight: 6.2, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 35, 42, { baseHeight: 5.8, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 36, 42, { baseHeight: 5.4, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 42, { baseHeight: 5, shape: 'slope_w', rise: 0.4, kind: 'track' });
    setSurface(level, 45, 15, { baseHeight: 1, shape: 'slope_s', kind: 'track' });
    setSurface(level, 45, 16, { baseHeight: 2, shape: 'slope_s', kind: 'track' });
    setSurface(level, 45, 17, { baseHeight: 3, shape: 'slope_s', kind: 'track' });
    setSurface(level, 46, 15, { baseHeight: 1, shape: 'slope_s', kind: 'track' });
    setSurface(level, 46, 16, { baseHeight: 2, shape: 'slope_s', kind: 'track' });
    setSurface(level, 46, 17, { baseHeight: 3, shape: 'slope_s', kind: 'track' });
    setSurface(level, 17, 20, { baseHeight: 7.33, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 17, 21, { baseHeight: 8.03, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 17, 22, { baseHeight: 8.73, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 17, 23, { baseHeight: 9.33, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 18, 20, { baseHeight: 7.33, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 18, 21, { baseHeight: 8.03, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 18, 22, { baseHeight: 8.73, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 18, 23, { baseHeight: 9.33, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 19, 20, { baseHeight: 7.33, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 19, 21, { baseHeight: 8.03, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 19, 22, { baseHeight: 8.73, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 19, 23, { baseHeight: 9.33, shape: 'slope_s', rise: 0.67, kind: 'track' });
    setSurface(level, 38, 33, { baseHeight: 3.67, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 38, 34, { baseHeight: 3.97, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 38, 35, { baseHeight: 4.37, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 38, 36, { baseHeight: 4.67, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 39, 33, { baseHeight: 3.67, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 39, 34, { baseHeight: 3.97, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 39, 35, { baseHeight: 4.37, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 39, 36, { baseHeight: 4.67, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 40, 33, { baseHeight: 3.67, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 40, 34, { baseHeight: 3.97, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 40, 35, { baseHeight: 4.37, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 40, 36, { baseHeight: 4.67, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 41, 33, { baseHeight: 3.67, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 41, 34, { baseHeight: 3.97, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 41, 35, { baseHeight: 4.37, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 41, 36, { baseHeight: 4.67, shape: 'slope_s', rise: 0.33, kind: 'track' });
    setSurface(level, 45, 28, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 45, 29, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 45, 30, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 45, 31, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 45, 32, { baseHeight: 1.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 46, 28, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 46, 29, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 46, 30, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 46, 31, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 46, 32, { baseHeight: 1.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 47, 28, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 47, 29, { baseHeight: 3, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 47, 30, { baseHeight: 2.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 47, 31, { baseHeight: 2, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 47, 32, { baseHeight: 1.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 17, 34, { baseHeight: 9.65, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 17, 35, { baseHeight: 9.35, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 17, 36, { baseHeight: 8.95, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 18, 34, { baseHeight: 9.65, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 18, 35, { baseHeight: 9.35, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 18, 36, { baseHeight: 8.95, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 19, 34, { baseHeight: 9.65, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 19, 35, { baseHeight: 9.35, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 19, 36, { baseHeight: 8.95, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 20, 34, { baseHeight: 9.65, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 20, 35, { baseHeight: 9.35, shape: 'slope_n', rise: 0.35, kind: 'track' });
    setSurface(level, 20, 36, { baseHeight: 8.95, shape: 'slope_n', rise: 0.35, kind: 'track' });

    // --- Goal ---
    setGoal(level, 58.5, 13.5);

    return registerLevel(level);
  }

  // ─── Level 3: Crumble Bridge ───
  function buildCrumbleBridge() {
    const level = createLevelShell({
      id: 'crumble_bridge',
      name: 'Crumble Bridge',
      width: 55,
      height: 55,
      start: { x: 5.5, y: 5.5, z: 8 },
      timeLimit: 60
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 6, 6, 8);
    fillTrack(level, 9, 4, 3, 4, 8);
    fillTrack(level, 18, 4, 4, 10, 8);
    fillTrack(level, 18, 22, 5, 5, 8);
    fillTrack(level, 18, 31, 4, 4, 6);
    fillTrack(level, 30, 31, 4, 4, 6);
    fillTrack(level, 18, 40, 4, 5, 6);
    fillTrack(level, 28, 41, 6, 4, 6);
    fillTrack(level, 32, 47, 6, 5, 4);
    fillTrack(level, 18, 48, 4, 3, 4);
    // Ramps
    setSurface(level, 19, 27, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 19, 28, { baseHeight: 7, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 19, 29, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 19, 30, { baseHeight: 6, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 19, 45, { baseHeight: 5.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 19, 46, { baseHeight: 4.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 19, 47, { baseHeight: 4.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 20, 27, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 28, { baseHeight: 7, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 29, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 30, { baseHeight: 6, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 45, { baseHeight: 5.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 20, 46, { baseHeight: 4.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 20, 47, { baseHeight: 4.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 21, 27, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 21, 28, { baseHeight: 7, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 21, 29, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 21, 30, { baseHeight: 6, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 21, 45, { baseHeight: 5.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 21, 46, { baseHeight: 4.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 21, 47, { baseHeight: 4.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    // Crumble tiles
    fillSurfaceRect(level, 12, 4, 6, 4, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 19, 14, 3, 8, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 22, 31, 8, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 30, 35, 2, 6, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 22, 42, 6, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 22, 49, 10, 1, { baseHeight: 4, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });

    // --- Goal ---
    setGoal(level, 35.5, 49.5);

    return registerLevel(level);
  }

  // ─── Level 4: Conveyor Lane ───
  function buildConveyorLane() {
    const level = createLevelShell({
      id: 'conveyor_lane',
      name: 'Conveyor Lane',
      width: 60,
      height: 55,
      start: { x: 5.5, y: 5.5, z: 4 },
      timeLimit: 60
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 6, 5, 4);
    fillTrack(level, 21, 3, 5, 5, 4);
    fillTrack(level, 29, 3, 3, 14, 4);
    fillTrack(level, 32, 8, 2, 9, 4);
    fillTrack(level, 40, 11, 3, 16, 4);
    fillTrack(level, 35, 14, 3, 3, 4);
    fillTrack(level, 26, 20, 3, 4, 4);
    fillTrack(level, 35, 20, 3, 4, 4);
    fillTrack(level, 43, 20, 2, 11, 4);
    fillTrack(level, 45, 23, 2, 8, 4);
    fillTrack(level, 6, 24, 3, 3, 4);
    fillTrack(level, 20, 24, 4, 3, 4);
    fillTrack(level, 35, 27, 3, 4, 4);
    fillTrack(level, 42, 27, 1, 7, 4);
    fillTrack(level, 35, 31, 1, 9, 4);
    fillTrack(level, 43, 31, 1, 3, 4);
    fillTrack(level, 36, 34, 2, 3, 4);
    fillTrack(level, 44, 35, 3, 7, 4);
    fillTrack(level, 44, 46, 10, 2, 4);
    fillTrack(level, 42, 47, 2, 4, 4);
    fillTrack(level, 51, 48, 3, 3, 4);
    fillTrack(level, 44, 49, 7, 2, 4);
    // Conveyor tiles
    setSurface(level, 26, 3, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 3, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 3, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 9, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 10, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 11, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 12, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 13, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 14, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 15, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 16, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 17, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 18, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 19, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 20, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 26, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 4, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 9, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 10, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 11, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 12, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 13, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 14, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 15, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 16, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 17, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 18, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 19, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 20, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 26, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 5, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 9, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 10, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 11, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 12, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 13, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 14, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 15, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 16, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 17, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 18, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 19, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 20, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 26, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 6, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 7, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 7, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 7, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 8, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 8, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 8, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 8, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 8, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 8, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 9, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 9, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 9, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 9, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 9, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 9, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 10, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 10, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 10, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 10, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 10, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 10, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 34, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 11, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 6, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 34, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 12, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 6, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 34, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 13, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 6, 14, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 14, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 14, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 14, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 14, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 14, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 15, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 15, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 15, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 15, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 15, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 15, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 16, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 16, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 16, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 16, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 16, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 16, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 30, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 31, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 32, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 33, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 34, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 17, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 6, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 30, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 31, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 32, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 33, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 34, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 18, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 6, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 30, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 31, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 32, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 33, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 34, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 19, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 6, 20, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 20, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 20, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 21, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 21, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 21, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 22, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 22, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 22, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 23, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 23, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 23, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 9, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 10, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 11, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 12, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 13, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 14, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 15, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 16, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 17, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 18, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 19, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 24, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 25, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 26, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 27, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 28, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 29, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 30, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 31, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 32, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 33, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 34, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 24, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 9, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 10, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 11, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 12, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 13, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 14, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 15, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 16, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 17, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 18, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 19, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 24, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 25, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 26, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 27, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 28, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 29, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 30, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 31, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 32, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 33, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 34, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 9, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 10, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 11, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 12, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 13, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 14, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 15, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 16, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 17, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 18, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 19, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 24, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 25, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 26, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 27, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 28, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 29, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 30, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 31, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 32, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 33, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 34, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 35, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 45, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 36, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 45, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 36, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 45, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 44, 34, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 45, 34, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 34, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 36, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 45, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 44, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 45, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 44, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 45, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 44, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 45, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 44, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });

    // --- Goal ---
    setGoal(level, 51.5, 48.5);

    return registerLevel(level);
  }

  // ─── Level 5: Bounce Garden ───
  function buildBounceGarden() {
    const level = createLevelShell({
      id: 'bounce_garden',
      name: 'Bounce Garden',
      width: 55,
      height: 60,
      start: { x: 5.5, y: 5.5, z: 2 },
      timeLimit: 60
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 6, 6, 2);
    fillTrack(level, 15, 3, 5, 2, 2);
    fillTrack(level, 9, 4, 6, 4, 2);
    fillTrack(level, 15, 5, 2, 5, 2);
    fillTrack(level, 19, 5, 1, 5, 2);
    fillTrack(level, 17, 7, 2, 3, 2);
    fillTrack(level, 15, 10, 8, 2, 6);
    fillTrack(level, 15, 12, 3, 4, 6);
    fillTrack(level, 19, 12, 4, 4, 6);
    fillTrack(level, 18, 13, 1, 13, 6);
    fillTrack(level, 17, 16, 1, 13, 6);
    fillTrack(level, 19, 16, 2, 3, 6);
    fillTrack(level, 20, 19, 1, 6, 6);
    fillTrack(level, 19, 20, 1, 6, 6);
    fillTrack(level, 16, 24, 1, 5, 6);
    fillTrack(level, 21, 24, 1, 9, 6);
    setSurface(level, 20, 26, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 18, 27, 2, 2, 6);
    fillTrack(level, 20, 28, 1, 6, 6);
    fillTrack(level, 19, 29, 1, 5, 6);
    fillTrack(level, 22, 24, 8, 2, 10);
    fillTrack(level, 22, 26, 2, 2, 10);
    fillTrack(level, 25, 26, 5, 2, 10);
    setSurface(level, 24, 27, { baseHeight: 10, kind: 'track' });
    fillTrack(level, 26, 28, 4, 2, 10);
    fillTrack(level, 26, 30, 1, 11, 10);
    fillTrack(level, 28, 30, 2, 7, 10);
    fillTrack(level, 27, 31, 1, 9, 10);
    fillTrack(level, 22, 36, 4, 6, 10);
    fillTrack(level, 28, 38, 2, 2, 10);
    fillTrack(level, 22, 42, 2, 2, 10);
    fillTrack(level, 25, 42, 2, 2, 10);
    setSurface(level, 24, 43, { baseHeight: 10, kind: 'track' });
    fillTrack(level, 34, 38, 4, 2, 14);
    fillTrack(level, 28, 40, 7, 4, 14);
    fillTrack(level, 37, 40, 1, 7, 14);
    fillTrack(level, 35, 41, 2, 4, 14);
    fillTrack(level, 34, 44, 1, 3, 14);
    fillTrack(level, 35, 46, 2, 1, 14);
    fillTrack(level, 45, 48, 5, 1, 14);
    fillTrack(level, 45, 49, 3, 4, 14);
    fillTrack(level, 49, 49, 1, 4, 14);
    setSurface(level, 48, 50, { baseHeight: 14, kind: 'track' });
    setSurface(level, 48, 52, { baseHeight: 14, kind: 'track' });
    fillTrack(level, 34, 48, 10, 2, 18);
    fillTrack(level, 34, 50, 9, 3, 18);
    fillTrack(level, 43, 51, 1, 2, 18);
    // Bounce tiles
    setSurface(level, 17, 5, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 18, 5, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 6, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 18, 6, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 18, 12, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 19, 19, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 25, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 18, 26, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 19, 26, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 24, 26, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 27, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 27, 30, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 21, 33, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 37, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 37, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 40, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 36, 40, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 26, 41, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 24, 42, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 45, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 36, 45, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 48, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 49, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 49, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 43, 50, { baseHeight: 18, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 50, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 51, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 51, { baseHeight: 14, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 52, { baseHeight: 14, kind: 'bounce', bounce: 6 });

    // --- Goal ---
    setGoal(level, 47.5, 50.5);

    return registerLevel(level);
  }

  // ─── Level 6: Ice Rink ───
  function buildIceRink() {
    const level = createLevelShell({
      id: 'ice_rink',
      name: 'Ice Rink',
      width: 55,
      height: 55,
      start: { x: 5.5, y: 5.5, z: 4 },
      timeLimit: 50
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 26, 1, 4);
    fillTrack(level, 3, 4, 7, 4, 4);
    fillTrack(level, 28, 4, 1, 34, 4);
    fillTrack(level, 9, 8, 1, 41, 4);
    fillTrack(level, 14, 18, 9, 1, 4);
    fillTrack(level, 14, 19, 1, 16, 4);
    fillTrack(level, 22, 19, 1, 16, 4);
    fillTrack(level, 15, 34, 7, 1, 4);
    fillTrack(level, 29, 37, 4, 1, 4);
    fillTrack(level, 32, 38, 1, 4, 4);
    setSurface(level, 30, 39, { baseHeight: 4, kind: 'track' });
    fillTrack(level, 28, 41, 4, 1, 4);
    fillTrack(level, 28, 42, 1, 7, 4);
    fillTrack(level, 10, 48, 18, 1, 4);
    // Ice tiles
    fillSurfaceRect(level, 10, 4, 18, 14, { baseHeight: 4, kind: 'ice', ice: true });
    fillSurfaceRect(level, 10, 18, 4, 30, { baseHeight: 4, kind: 'ice', ice: true });
    fillSurfaceRect(level, 23, 18, 5, 30, { baseHeight: 4, kind: 'ice', ice: true });
    fillSurfaceRect(level, 14, 35, 9, 13, { baseHeight: 4, kind: 'ice', ice: true });
    fillSurfaceRect(level, 28, 38, 4, 1, { baseHeight: 4, kind: 'ice', ice: true });
    fillSurfaceRect(level, 28, 39, 2, 2, { baseHeight: 4, kind: 'ice', ice: true });
    fillSurfaceRect(level, 31, 39, 1, 2, { baseHeight: 4, kind: 'ice', ice: true });
    setSurface(level, 30, 40, { baseHeight: 4, kind: 'ice', ice: true });

    // --- Goal ---
    setGoal(level, 30.5, 39.5);

    return registerLevel(level);
  }

  // ─── Level 7: Gate Runner ───
  function buildGateRunner() {
    const level = createLevelShell({
      id: 'gate_runner',
      name: 'Gate Runner',
      width: 55,
      height: 60,
      start: { x: 5.5, y: 5.5, z: 8 },
      timeLimit: 50
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 6, 5, 8);
    fillTrack(level, 9, 4, 4, 3, 8);
    fillTrack(level, 14, 4, 9, 3, 8);
    fillTrack(level, 20, 7, 3, 3, 8);
    fillTrack(level, 20, 11, 3, 13, 8);
    fillTrack(level, 18, 19, 2, 5, 8);
    fillTrack(level, 23, 19, 2, 5, 8);
    fillTrack(level, 18, 28, 7, 7, 6);
    fillTrack(level, 32, 31, 4, 4, 6);
    fillTrack(level, 25, 32, 6, 3, 6);
    fillTrack(level, 19, 35, 5, 1, 6);
    setSurface(level, 32, 35, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 33, 36, 3, 13, 6);
    fillTrack(level, 46, 51, 5, 5, 4);
    fillTrack(level, 33, 52, 7, 3, 4);
    fillTrack(level, 41, 52, 1, 3, 4);
    fillTrack(level, 43, 52, 1, 3, 4);
    fillTrack(level, 45, 52, 1, 3, 4);
    // Ramps
    setSurface(level, 19, 24, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 19, 25, { baseHeight: 7, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 19, 26, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 19, 27, { baseHeight: 6, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 24, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 25, { baseHeight: 7, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 26, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 20, 27, { baseHeight: 6, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 21, 24, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 21, 25, { baseHeight: 7, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 21, 26, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 21, 27, { baseHeight: 6, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 24, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 25, { baseHeight: 7, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 26, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 22, 27, { baseHeight: 6, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 24, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 25, { baseHeight: 7, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 26, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 27, { baseHeight: 6, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 49, { baseHeight: 5.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 33, 50, { baseHeight: 4.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 33, 51, { baseHeight: 4.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 34, 49, { baseHeight: 5.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 34, 50, { baseHeight: 4.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 34, 51, { baseHeight: 4.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 35, 49, { baseHeight: 5.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 35, 50, { baseHeight: 4.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 35, 51, { baseHeight: 4.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    // Track under gates
    setSurface(level, 13, 4, { baseHeight: 8, kind: 'track' });
    setSurface(level, 13, 5, { baseHeight: 8, kind: 'track' });
    setSurface(level, 13, 6, { baseHeight: 8, kind: 'track' });
    setSurface(level, 20, 10, { baseHeight: 8, kind: 'track' });
    setSurface(level, 21, 10, { baseHeight: 8, kind: 'track' });
    setSurface(level, 22, 10, { baseHeight: 8, kind: 'track' });
    setSurface(level, 31, 32, { baseHeight: 6, kind: 'track' });
    setSurface(level, 31, 33, { baseHeight: 6, kind: 'track' });
    setSurface(level, 31, 34, { baseHeight: 6, kind: 'track' });
    setSurface(level, 33, 35, { baseHeight: 6, kind: 'track' });
    setSurface(level, 34, 35, { baseHeight: 6, kind: 'track' });
    setSurface(level, 35, 35, { baseHeight: 6, kind: 'track' });
    setSurface(level, 40, 52, { baseHeight: 4, kind: 'track' });
    setSurface(level, 40, 53, { baseHeight: 4, kind: 'track' });
    setSurface(level, 40, 54, { baseHeight: 4, kind: 'track' });
    setSurface(level, 42, 52, { baseHeight: 4, kind: 'track' });
    setSurface(level, 42, 53, { baseHeight: 4, kind: 'track' });
    setSurface(level, 42, 54, { baseHeight: 4, kind: 'track' });
    setSurface(level, 44, 52, { baseHeight: 4, kind: 'track' });
    setSurface(level, 44, 53, { baseHeight: 4, kind: 'track' });
    setSurface(level, 44, 54, { baseHeight: 4, kind: 'track' });

    // --- Timed Gates ---
    addTimedGate(level, 'gate_1', 13, 4, 8, 1, 3);
    addTimedGate(level, 'gate_2', 20, 10, 8, 3, 1);
    addActor(level, {
      id: 'gate_3a', kind: ACTOR_KINDS.TIMED_GATE,
      x: 31, y: 32, z: 6,
      width: 1, height: 3, topHeight: 6,
      closedDuration: 1.4, openDuration: 1.1, startOffset: 0
    });
    addActor(level, {
      id: 'gate_3b', kind: ACTOR_KINDS.TIMED_GATE,
      x: 33, y: 35, z: 6,
      width: 3, height: 1, topHeight: 6,
      closedDuration: 1.4, openDuration: 1.1, startOffset: 0.5
    });
    addActor(level, {
      id: 'gate_4a', kind: ACTOR_KINDS.TIMED_GATE,
      x: 40, y: 52, z: 4,
      width: 1, height: 3, topHeight: 4,
      closedDuration: 1.4, openDuration: 1.1, startOffset: 0
    });
    addActor(level, {
      id: 'gate_4b', kind: ACTOR_KINDS.TIMED_GATE,
      x: 42, y: 52, z: 4,
      width: 1, height: 3, topHeight: 4,
      closedDuration: 1.4, openDuration: 1.1, startOffset: 0.5
    });
    addActor(level, {
      id: 'gate_4c', kind: ACTOR_KINDS.TIMED_GATE,
      x: 44, y: 52, z: 4,
      width: 1, height: 3, topHeight: 4,
      closedDuration: 1.4, openDuration: 1.1, startOffset: 1
    });

    // --- Goal ---
    setGoal(level, 48.5, 53.5);

    return registerLevel(level);
  }

  // ─── Level 8: Sweeper Alley ───
  function buildSweeperAlley() {
    const level = createLevelShell({
      id: 'sweeper_alley',
      name: 'Sweeper Alley',
      width: 55,
      height: 55,
      start: { x: 5.5, y: 5.5, z: 4 },
      timeLimit: 50
    });

    // --- Surface tiles ---
    fillTrack(level, 9, 2, 14, 5, 4);
    fillTrack(level, 3, 3, 6, 5, 4);
    fillTrack(level, 27, 5, 9, 6, 4);
    fillTrack(level, 23, 6, 4, 4, 4);
    fillTrack(level, 36, 6, 1, 23, 4);
    fillTrack(level, 9, 7, 4, 9, 4);
    fillTrack(level, 14, 7, 5, 9, 4);
    fillTrack(level, 20, 7, 3, 9, 4);
    fillTrack(level, 13, 8, 1, 8, 4);
    fillTrack(level, 19, 8, 1, 8, 4);
    fillTrack(level, 34, 11, 2, 15, 4);
    fillTrack(level, 37, 11, 1, 18, 4);
    fillTrack(level, 28, 19, 6, 4, 4);
    fillTrack(level, 29, 23, 5, 6, 4);
    fillTrack(level, 28, 24, 1, 13, 4);
    fillTrack(level, 34, 26, 1, 3, 4);
    fillTrack(level, 35, 27, 1, 2, 4);
    fillTrack(level, 29, 29, 3, 8, 4);
    fillTrack(level, 10, 30, 8, 9, 4);
    fillTrack(level, 18, 33, 10, 4, 4);
    fillTrack(level, 10, 39, 6, 3, 4);
    fillTrack(level, 17, 39, 1, 7, 4);
    fillTrack(level, 16, 40, 1, 6, 4);
    fillTrack(level, 11, 42, 5, 9, 4);
    fillTrack(level, 10, 43, 1, 8, 4);
    // Track under sweepers
    setSurface(level, 36, 5, { baseHeight: 4, kind: 'track' });
    setSurface(level, 13, 7, { baseHeight: 4, kind: 'track' });
    setSurface(level, 19, 7, { baseHeight: 4, kind: 'track' });
    setSurface(level, 28, 23, { baseHeight: 4, kind: 'track' });
    setSurface(level, 35, 26, { baseHeight: 4, kind: 'track' });
    setSurface(level, 16, 39, { baseHeight: 4, kind: 'track' });
    setSurface(level, 10, 42, { baseHeight: 4, kind: 'track' });

    // --- Sweepers ---
    addActor(level, {
      id: 'sweep1', kind: ACTOR_KINDS.SWEEPER,
      x: 36.5, y: 5.5, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 3.5, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    addActor(level, {
      id: 'sweep2', kind: ACTOR_KINDS.SWEEPER,
      x: 13.5, y: 7.5, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'sweep3', kind: ACTOR_KINDS.SWEEPER,
      x: 19.5, y: 7.5, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweep4', kind: ACTOR_KINDS.SWEEPER,
      x: 28.5, y: 23.5, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    addActor(level, {
      id: 'sweep5', kind: ACTOR_KINDS.SWEEPER,
      x: 35.5, y: 26.5, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'sweep6', kind: ACTOR_KINDS.SWEEPER,
      x: 16.5, y: 39.5, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweep7', kind: ACTOR_KINDS.SWEEPER,
      x: 10.5, y: 42.5, z: 4, topHeight: 4,
      width: 1, height: 1, armLength: 2, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });

    // --- Goal ---
    setGoal(level, 13.5, 48.5);

    return registerLevel(level);
  }

  // ─── Level 9: Platform Hop ───
  function buildPlatformHop() {
    const level = createLevelShell({
      id: 'platform_hop',
      name: 'Platform Hop',
      width: 55,
      height: 55,
      start: { x: 5.5, y: 5.5, z: 6 },
      timeLimit: 50
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 6, 5, 6);
    fillTrack(level, 18, 3, 5, 5, 6);
    fillTrack(level, 9, 4, 3, 3, 6);
    fillTrack(level, 19, 8, 3, 4, 6);
    fillTrack(level, 19, 22, 5, 4, 6);
    fillTrack(level, 19, 26, 3, 3, 6);
    fillTrack(level, 32, 36, 5, 4, 6);
    fillTrack(level, 34, 40, 3, 3, 6);
    fillTrack(level, 44, 46, 5, 5, 6);

    // --- Moving Platforms ---
    addMovingBridge(level, 'plat1', [
      { x: 11.5, y: 4.5, z: 6 },
      { x: 16.5, y: 4.5, z: 6 },
    ], 2, 2, 0.5500, { pauseDuration: 1.5 });
    addMovingBridge(level, 'plat2', [
      { x: 19.5, y: 11.5, z: 6 },
      { x: 19.5, y: 20.5, z: 6 },
    ], 2, 2, 0.5500, { pauseDuration: 1.5 });
    addMovingBridge(level, 'plat3', [
      { x: 22.5, y: 25.5, z: 6 },
      { x: 22.5, y: 34.5, z: 6 },
    ], 2, 2, 0.5500, { pauseDuration: 1.5 });
    addMovingBridge(level, 'plat4', [
      { x: 30.5, y: 35.5, z: 6 },
      { x: 22.5, y: 35.5, z: 6 },
    ], 2, 2, 0.5500, { pauseDuration: 1.5 });
    addMovingBridge(level, 'plat5', [
      { x: 36.5, y: 37.5, z: 6 },
      { x: 44.5, y: 37.5, z: 6 },
    ], 2, 2, 0.5500, { pauseDuration: 1.5 });
    addMovingBridge(level, 'plat6', [
      { x: 44.5, y: 44.5, z: 6 },
      { x: 44.5, y: 38.5, z: 6 },
    ], 2, 2, 0.5500, { pauseDuration: 1.5 });

    // --- Goal ---
    setGoal(level, 46.5, 48.5);

    return registerLevel(level);
  }

  // ─── Level 10: Tunnel Network ───
  function buildTunnelNetwork() {
    const level = createLevelShell({
      id: 'tunnel_network',
      name: 'Tunnel Network',
      width: 60,
      height: 55,
      start: { x: 5.5, y: 27.5, z: 6 },
      timeLimit: 50
    });

    // --- Surface tiles ---
    fillTrack(level, 5, 5, 6, 2, 8);
    fillTrack(level, 5, 7, 1, 10, 8);
    fillTrack(level, 7, 7, 4, 2, 8);
    setSurface(level, 6, 8, { baseHeight: 8, kind: 'track' });
    fillTrack(level, 6, 14, 5, 2, 8);
    fillTrack(level, 6, 16, 3, 1, 8);
    fillTrack(level, 41, 19, 6, 1, 4);
    fillTrack(level, 33, 20, 12, 2, 4);
    fillTrack(level, 46, 20, 1, 7, 4);
    setSurface(level, 45, 21, { baseHeight: 4, kind: 'track' });
    fillTrack(level, 33, 22, 4, 4, 4);
    fillTrack(level, 38, 22, 5, 4, 4);
    fillTrack(level, 37, 23, 1, 3, 4);
    fillTrack(level, 43, 25, 3, 2, 4);
    fillTrack(level, 41, 26, 2, 1, 4);
    fillTrack(level, 9, 43, 7, 1, 4);
    fillTrack(level, 9, 44, 3, 5, 4);
    fillTrack(level, 13, 44, 3, 2, 4);
    fillTrack(level, 12, 45, 1, 4, 4);
    fillTrack(level, 14, 46, 2, 3, 4);
    fillTrack(level, 13, 47, 1, 2, 4);
    fillTrack(level, 9, 22, 3, 12, 6);
    fillTrack(level, 15, 22, 4, 2, 6);
    fillTrack(level, 17, 24, 2, 6, 6);
    fillTrack(level, 3, 25, 6, 6, 6);
    fillTrack(level, 12, 25, 2, 5, 6);
    fillTrack(level, 14, 27, 3, 3, 6);
    fillTrack(level, 12, 30, 1, 4, 6);
    fillTrack(level, 13, 33, 6, 1, 6);
    fillTrack(level, 9, 36, 1, 7, 6);
    fillTrack(level, 11, 36, 3, 7, 6);
    fillTrack(level, 10, 37, 1, 6, 6);
    fillTrack(level, 49, 38, 7, 3, 2);
    fillTrack(level, 49, 41, 2, 4, 2);
    fillTrack(level, 52, 41, 4, 4, 2);
    fillTrack(level, 51, 42, 1, 3, 2);
    // Bounce tiles
    setSurface(level, 9, 16, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 10, 16, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 10, 36, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 12, 44, { baseHeight: 4, kind: 'bounce', bounce: 6 });

    // --- Funnel tiles (explicit from CSV) ---
    setSurface(level, 6, 9, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.8284271247461903, _tx: 6, _ty: 9 });
    setSurface(level, 7, 9, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.23606797749979, _tx: 7, _ty: 9 });
    setSurface(level, 8, 9, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3, _tx: 8, _ty: 9 });
    setSurface(level, 9, 9, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.23606797749979, _tx: 9, _ty: 9 });
    setSurface(level, 10, 9, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.8284271247461903, _tx: 10, _ty: 9 });
    setSurface(level, 6, 10, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.23606797749979, _tx: 6, _ty: 10 });
    setSurface(level, 7, 10, { baseHeight: 7, shape: 'funnel', rise: 1, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 2.414213562373095, _tx: 7, _ty: 10 });
    setSurface(level, 8, 10, { baseHeight: 7, shape: 'funnel', rise: 1, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 2, _tx: 8, _ty: 10 });
    setSurface(level, 9, 10, { baseHeight: 7, shape: 'funnel', rise: 1, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 2.414213562373095, _tx: 9, _ty: 10 });
    setSurface(level, 10, 10, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.23606797749979, _tx: 10, _ty: 10 });
    setSurface(level, 6, 11, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3, _tx: 6, _ty: 11 });
    setSurface(level, 7, 11, { baseHeight: 7, shape: 'funnel', rise: 1, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 2, _tx: 7, _ty: 11 });
    setSurface(level, 9, 11, { baseHeight: 7, shape: 'funnel', rise: 1, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 2, _tx: 9, _ty: 11 });
    setSurface(level, 10, 11, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3, _tx: 10, _ty: 11 });
    setSurface(level, 6, 12, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.23606797749979, _tx: 6, _ty: 12 });
    setSurface(level, 7, 12, { baseHeight: 7, shape: 'funnel', rise: 1, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 2.414213562373095, _tx: 7, _ty: 12 });
    setSurface(level, 8, 12, { baseHeight: 7, shape: 'funnel', rise: 1, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 2, _tx: 8, _ty: 12 });
    setSurface(level, 9, 12, { baseHeight: 7, shape: 'funnel', rise: 1, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 2.414213562373095, _tx: 9, _ty: 12 });
    setSurface(level, 10, 12, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.23606797749979, _tx: 10, _ty: 12 });
    setSurface(level, 6, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.8284271247461903, _tx: 6, _ty: 13 });
    setSurface(level, 7, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.23606797749979, _tx: 7, _ty: 13 });
    setSurface(level, 8, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3, _tx: 8, _ty: 13 });
    setSurface(level, 9, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.23606797749979, _tx: 9, _ty: 13 });
    setSurface(level, 10, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 11.5, funnelMaxDist: 3.8284271247461903, _tx: 10, _ty: 13 });
    setSurface(level, 12, 22, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 12, _ty: 22 });
    setSurface(level, 13, 22, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 13, _ty: 22 });
    setSurface(level, 14, 22, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 22 });
    setSurface(level, 43, 22, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 44.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 43, _ty: 22 });
    setSurface(level, 44, 22, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 44.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 44, _ty: 22 });
    setSurface(level, 45, 22, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 44.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 45, _ty: 22 });
    setSurface(level, 12, 23, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 12, _ty: 23 });
    setSurface(level, 14, 23, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 14, _ty: 23 });
    setSurface(level, 43, 23, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 44.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 43, _ty: 23 });
    setSurface(level, 45, 23, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 44.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 45, _ty: 23 });
    setSurface(level, 12, 24, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 12, _ty: 24 });
    setSurface(level, 13, 24, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 13, _ty: 24 });
    setSurface(level, 14, 24, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 24 });
    setSurface(level, 15, 24, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 25.5, funnelMaxDist: 2, _tx: 15, _ty: 24 });
    setSurface(level, 16, 24, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 25.5, funnelMaxDist: 2.414213562373095, _tx: 16, _ty: 24 });
    setSurface(level, 43, 24, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 44.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 43, _ty: 24 });
    setSurface(level, 44, 24, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 44.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 44, _ty: 24 });
    setSurface(level, 45, 24, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 44.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 45, _ty: 24 });
    setSurface(level, 14, 25, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 25.5, funnelMaxDist: 2, _tx: 14, _ty: 25 });
    setSurface(level, 16, 25, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 25.5, funnelMaxDist: 2, _tx: 16, _ty: 25 });
    setSurface(level, 14, 26, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 25.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 26 });
    setSurface(level, 15, 26, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 25.5, funnelMaxDist: 2, _tx: 15, _ty: 26 });
    setSurface(level, 16, 26, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 25.5, funnelMaxDist: 2.414213562373095, _tx: 16, _ty: 26 });
    setSurface(level, 13, 30, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 14.5, funnelCenterY: 31.5, funnelMaxDist: 2.414213562373095, _tx: 13, _ty: 30 });
    setSurface(level, 14, 30, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 14.5, funnelCenterY: 31.5, funnelMaxDist: 2, _tx: 14, _ty: 30 });
    setSurface(level, 15, 30, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 14.5, funnelCenterY: 31.5, funnelMaxDist: 2.414213562373095, _tx: 15, _ty: 30 });
    setSurface(level, 16, 30, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 17.5, funnelCenterY: 31.5, funnelMaxDist: 2.414213562373095, _tx: 16, _ty: 30 });
    setSurface(level, 17, 30, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 17.5, funnelCenterY: 31.5, funnelMaxDist: 2, _tx: 17, _ty: 30 });
    setSurface(level, 18, 30, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 17.5, funnelCenterY: 31.5, funnelMaxDist: 2.414213562373095, _tx: 18, _ty: 30 });
    setSurface(level, 13, 31, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 14.5, funnelCenterY: 31.5, funnelMaxDist: 2, _tx: 13, _ty: 31 });
    setSurface(level, 15, 31, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 14.5, funnelCenterY: 31.5, funnelMaxDist: 2, _tx: 15, _ty: 31 });
    setSurface(level, 16, 31, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 17.5, funnelCenterY: 31.5, funnelMaxDist: 2, _tx: 16, _ty: 31 });
    setSurface(level, 18, 31, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 17.5, funnelCenterY: 31.5, funnelMaxDist: 2, _tx: 18, _ty: 31 });
    setSurface(level, 13, 32, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 14.5, funnelCenterY: 31.5, funnelMaxDist: 2.414213562373095, _tx: 13, _ty: 32 });
    setSurface(level, 14, 32, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 14.5, funnelCenterY: 31.5, funnelMaxDist: 2, _tx: 14, _ty: 32 });
    setSurface(level, 15, 32, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 14.5, funnelCenterY: 31.5, funnelMaxDist: 2.414213562373095, _tx: 15, _ty: 32 });
    setSurface(level, 16, 32, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 17.5, funnelCenterY: 31.5, funnelMaxDist: 2.414213562373095, _tx: 16, _ty: 32 });
    setSurface(level, 17, 32, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 17.5, funnelCenterY: 31.5, funnelMaxDist: 2, _tx: 17, _ty: 32 });
    setSurface(level, 18, 32, { baseHeight: 6, shape: 'funnel', rise: 2, funnelCenterX: 17.5, funnelCenterY: 31.5, funnelMaxDist: 2.414213562373095, _tx: 18, _ty: 32 });

    // --- Tunnels ---
    placeTunnel(level, {
      id: 'tunnel_1',
      path: [
        { x: 13.5, y: 23.5, z: 4 },
        { x: 37.5, y: 22.5, z: 4 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_2',
      path: [
        { x: 15.5, y: 25.5, z: 4 },
        { x: 13.5, y: 46.5, z: 4 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_3',
      path: [
        { x: 17.5, y: 31.5, z: 4 },
        { x: 45.5, y: 20.5, z: 4 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_4',
      path: [
        { x: 8.5, y: 11.5, z: 6 },
        { x: 51.5, y: 41.5, z: 2 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_5',
      path: [
        { x: 44.5, y: 23.5, z: 2 },
        { x: 6.5, y: 7.5, z: 8 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_void_1',
      path: [
        { x: 14.5, y: 31.5, z: 4 },
        { x: 14.5, y: 31.5, z: -16 }
      ],
      speed: 12, funnelRadius: 0, exitType: 'drop'
    });

    // --- Goal ---
    setGoal(level, 52.5, 41.5);

    return registerLevel(level);
  }

  // ─── Level 11: Switchback Descent ───
  function buildSwitchbackDescent() {
    const level = createLevelShell({
      id: 'switchback_descent',
      name: 'Switchback Descent',
      width: 50,
      height: 65,
      start: { x: 5.5, y: 5.5, z: 16 },
      timeLimit: 40
    });

    // --- Surface tiles ---
    fillTrack(level, 2, 3, 7, 5, 16);
    fillTrack(level, 13, 8, 1, 2, 14);
    fillTrack(level, 10, 9, 1, 3, 13);
    fillTrack(level, 18, 11, 1, 3, 10);
    fillTrack(level, 7, 13, 1, 3, 8);
    fillTrack(level, 1, 15, 1, 3, 6);
    fillTrack(level, 5, 17, 1, 3, 4);
    fillTrack(level, 18, 19, 2, 4, 0);
    fillTrack(level, 15, 22, 3, 3, 0);
    setSurface(level, 18, 23, { baseHeight: 0, kind: 'track' });
    // Ramps
    setSurface(level, 2, 8, { baseHeight: 15.8, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 3, 8, { baseHeight: 15.6, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 4, 8, { baseHeight: 15.4, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 5, 8, { baseHeight: 15.2, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 6, 8, { baseHeight: 15, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 7, 8, { baseHeight: 14.8, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 8, 8, { baseHeight: 14.6, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 9, 8, { baseHeight: 14.4, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 10, 8, { baseHeight: 14.2, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 11, 8, { baseHeight: 14, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 12, 8, { baseHeight: 13.8, shape: 'slope_w', rise: 0.2, kind: 'track' });
    setSurface(level, 11, 11, { baseHeight: 12.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 12, 11, { baseHeight: 12, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 13, 11, { baseHeight: 11.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 14, 11, { baseHeight: 11, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 11, { baseHeight: 10.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 16, 11, { baseHeight: 10, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 17, 11, { baseHeight: 9.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 2, 17, { baseHeight: 5, shape: 'slope_w', kind: 'track' });
    setSurface(level, 3, 17, { baseHeight: 4, shape: 'slope_w', kind: 'track' });
    setSurface(level, 4, 17, { baseHeight: 3, shape: 'slope_w', kind: 'track' });
    setSurface(level, 6, 19, { baseHeight: 3.64, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 7, 19, { baseHeight: 3.54, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 8, 19, { baseHeight: 3.44, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 9, 19, { baseHeight: 3.34, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 10, 19, { baseHeight: 3.24, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 11, 19, { baseHeight: 3.14, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 12, 19, { baseHeight: 3.04, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 13, 19, { baseHeight: 2.94, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 14, 19, { baseHeight: 2.84, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 15, 19, { baseHeight: 2.74, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 16, 19, { baseHeight: 2.64, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 17, 19, { baseHeight: -0.36, shape: 'slope_w', rise: 0.36, kind: 'track' });
    setSurface(level, 11, 9, { baseHeight: 12, shape: 'slope_e', kind: 'track' });
    setSurface(level, 12, 9, { baseHeight: 13, shape: 'slope_e', kind: 'track' });
    setSurface(level, 8, 13, { baseHeight: 7.8, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 9, 13, { baseHeight: 8, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 10, 13, { baseHeight: 8.2, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 11, 13, { baseHeight: 8.4, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 12, 13, { baseHeight: 8.6, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 13, 13, { baseHeight: 8.8, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 14, 13, { baseHeight: 9, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 15, 13, { baseHeight: 9.2, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 16, 13, { baseHeight: 9.4, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 17, 13, { baseHeight: 9.6, shape: 'slope_e', rise: 0.2, kind: 'track' });
    setSurface(level, 2, 15, { baseHeight: 5.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 3, 15, { baseHeight: 6, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 4, 15, { baseHeight: 6.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 5, 15, { baseHeight: 7, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 6, 15, { baseHeight: 7.5, shape: 'slope_e', rise: 0.5, kind: 'track' });

    // --- Goal ---
    setGoal(level, 16.5, 23.5);

    return registerLevel(level);
  }

  // ─── Level 12: Hazard Gauntlet ───
  function buildHazardGauntlet() {
    const level = createLevelShell({
      id: 'hazard_gauntlet',
      name: 'Hazard Gauntlet',
      width: 60,
      height: 50,
      start: { x: 5.5, y: 24.5, z: 6 },
      timeLimit: 40
    });

    // --- Surface tiles ---
    fillTrack(level, 26, 21, 5, 3, 6);
    fillTrack(level, 32, 21, 5, 3, 6);
    fillTrack(level, 38, 21, 5, 3, 6);
    fillTrack(level, 46, 21, 2, 2, 6);
    fillTrack(level, 3, 22, 4, 5, 6);
    fillTrack(level, 8, 22, 7, 1, 6);
    fillTrack(level, 17, 22, 1, 5, 6);
    fillTrack(level, 8, 23, 6, 1, 6);
    fillTrack(level, 16, 23, 1, 4, 6);
    fillTrack(level, 48, 23, 7, 1, 6);
    fillTrack(level, 56, 23, 1, 3, 6);
    fillTrack(level, 8, 24, 1, 3, 6);
    fillTrack(level, 10, 24, 3, 1, 6);
    fillTrack(level, 15, 24, 1, 3, 6);
    fillTrack(level, 26, 24, 3, 4, 6);
    fillTrack(level, 30, 24, 1, 4, 6);
    fillTrack(level, 32, 24, 2, 4, 6);
    fillTrack(level, 35, 24, 2, 4, 6);
    fillTrack(level, 38, 24, 2, 4, 6);
    fillTrack(level, 41, 24, 2, 4, 6);
    setSurface(level, 55, 24, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 9, 25, 3, 1, 6);
    fillTrack(level, 29, 25, 1, 3, 6);
    fillTrack(level, 34, 25, 1, 3, 6);
    fillTrack(level, 40, 25, 1, 3, 6);
    fillTrack(level, 48, 25, 7, 1, 6);
    fillTrack(level, 9, 26, 2, 1, 6);
    fillTrack(level, 13, 26, 2, 1, 6);
    fillTrack(level, 46, 26, 2, 2, 6);
    // Crumble tiles
    fillSurfaceRect(level, 18, 23, 8, 1, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 46, 23, 2, 3, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 18, 24, 1, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 20, 24, 1, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 22, 24, 1, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 24, 24, 2, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 48, 24, 7, 1, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 19, 25, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 21, 25, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 23, 25, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    // Bounce tiles
    setSurface(level, 55, 23, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 19, 24, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 21, 24, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 24, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 25, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 25, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    // Ice tiles
    fillSurfaceRect(level, 44, 21, 2, 7, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 15, 22, 2, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 14, 23, 2, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 13, 24, 2, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 12, 25, 2, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 11, 26, 2, 1, { baseHeight: 6, kind: 'ice', ice: true });
    // Hazard tiles
    fillSurfaceRect(level, 26, 20, 22, 1, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 26, 20, 22, 1);
    fillSurfaceRect(level, 8, 21, 10, 1, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 8, 21, 10, 1);
    fillSurfaceRect(level, 18, 22, 8, 1, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 18, 22, 8, 1);
    fillSurfaceRect(level, 48, 22, 10, 1, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 48, 22, 10, 1);
    fillSurfaceRect(level, 57, 23, 1, 4, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 57, 23, 1, 4);
    fillSurfaceRect(level, 18, 26, 8, 1, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 18, 26, 8, 1);
    fillSurfaceRect(level, 48, 26, 9, 1, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 48, 26, 9, 1);
    fillSurfaceRect(level, 8, 27, 10, 1, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 8, 27, 10, 1);
    fillSurfaceRect(level, 26, 28, 22, 1, { baseHeight: 6, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 26, 28, 22, 1);
    // Track under sweepers
    setSurface(level, 9, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 29, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 34, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 40, 24, { baseHeight: 6, kind: 'track' });
    // Track under gates
    setSurface(level, 31, 21, { baseHeight: 6, kind: 'track' });
    setSurface(level, 37, 21, { baseHeight: 6, kind: 'track' });
    setSurface(level, 43, 21, { baseHeight: 6, kind: 'track' });
    setSurface(level, 31, 22, { baseHeight: 6, kind: 'track' });
    setSurface(level, 37, 22, { baseHeight: 6, kind: 'track' });
    setSurface(level, 43, 22, { baseHeight: 6, kind: 'track' });
    setSurface(level, 31, 23, { baseHeight: 6, kind: 'track' });
    setSurface(level, 37, 23, { baseHeight: 6, kind: 'track' });
    setSurface(level, 43, 23, { baseHeight: 6, kind: 'track' });
    setSurface(level, 31, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 37, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 43, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 31, 25, { baseHeight: 6, kind: 'track' });
    setSurface(level, 37, 25, { baseHeight: 6, kind: 'track' });
    setSurface(level, 43, 25, { baseHeight: 6, kind: 'track' });
    setSurface(level, 31, 26, { baseHeight: 6, kind: 'track' });
    setSurface(level, 37, 26, { baseHeight: 6, kind: 'track' });
    setSurface(level, 43, 26, { baseHeight: 6, kind: 'track' });
    setSurface(level, 31, 27, { baseHeight: 6, kind: 'track' });
    setSurface(level, 37, 27, { baseHeight: 6, kind: 'track' });
    setSurface(level, 43, 27, { baseHeight: 6, kind: 'track' });
    setSurface(level, 7, 22, { baseHeight: 6, kind: 'track' });
    setSurface(level, 7, 23, { baseHeight: 6, kind: 'track' });
    setSurface(level, 7, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 7, 25, { baseHeight: 6, kind: 'track' });
    setSurface(level, 7, 26, { baseHeight: 6, kind: 'track' });

    // --- Timed Gates ---
    addTimedGate(level, 'gate_2', 31, 21, 6, 13, 7);
    addTimedGate(level, 'gate_1', 7, 22, 6, 1, 5);

    // --- Sweepers ---
    addActor(level, {
      id: 'sweep1', kind: ACTOR_KINDS.SWEEPER,
      x: 9.5, y: 24.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    addActor(level, {
      id: 'sweep2', kind: ACTOR_KINDS.SWEEPER,
      x: 29.5, y: 24.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'sweep3', kind: ACTOR_KINDS.SWEEPER,
      x: 34.5, y: 24.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweep4', kind: ACTOR_KINDS.SWEEPER,
      x: 40.5, y: 24.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });

    // --- Goal ---
    setGoal(level, 55.5, 24.5);

    return registerLevel(level);
  }

  // ─── Level 13: Elevator Shaft ───
  function buildElevatorShaft() {
    const level = createLevelShell({
      id: 'elevator_shaft',
      name: 'Elevator Shaft',
      width: 45,
      height: 50,
      start: { x: 5.5, y: 5.5, z: 2 },
      timeLimit: 40
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 6, 5, 2);
    fillTrack(level, 9, 4, 6, 1, 2);
    fillTrack(level, 9, 5, 5, 2, 2);
    setSurface(level, 14, 6, { baseHeight: 2, kind: 'track' });
    fillTrack(level, 15, 3, 5, 2, 6);
    fillTrack(level, 15, 5, 4, 3, 6);
    fillTrack(level, 19, 6, 1, 2, 6);
    fillTrack(level, 20, 3, 5, 5, 10);
    fillTrack(level, 21, 8, 3, 7, 10);
    setSurface(level, 21, 15, { baseHeight: 10, kind: 'track' });
    setSurface(level, 23, 15, { baseHeight: 10, kind: 'track' });
    fillTrack(level, 14, 16, 4, 4, 18);
    fillTrack(level, 20, 16, 5, 5, 14);
    fillTrack(level, 18, 17, 2, 1, 14);
    fillTrack(level, 19, 18, 1, 2, 14);
    setSurface(level, 18, 19, { baseHeight: 14, kind: 'track' });
    fillTrack(level, 13, 44, 6, 4, 8);
    // Track under elevators
    setSurface(level, 14, 5, { baseHeight: 2, kind: 'track' });
    setSurface(level, 19, 5, { baseHeight: 6, kind: 'track' });
    setSurface(level, 22, 15, { baseHeight: 10, kind: 'track' });
    setSurface(level, 18, 18, { baseHeight: 14, kind: 'track' });

    // --- Elevators ---
    addElevator(level, 'elev1', 13.5, 4.5, 2, 7, 2, 2, 0.8, 5);
    addElevator(level, 'elev2', 18.5, 4.5, 6, 11, 2, 2, 0.7, 5.5);
    addElevator(level, 'elev3', 21.5, 14.5, 10, 15, 2, 2, 1, 4.5);
    addElevator(level, 'elev4', 17.5, 17.5, 14, 19, 2, 2, 1.2, 4);

    // --- Moving Platforms ---
    addMovingBridge(level, 'plat1', [
      { x: 14.5, y: 19.5, z: 18 },
      { x: 14.5, y: 42.5, z: 8 },
    ], 2, 2, 0.5500, { pauseDuration: 1.5 });

    // --- Goal ---
    setGoal(level, 16.5, 46.5);

    return registerLevel(level);
  }

  // ─── Level 14: The Mountain ───
  function buildTheMountain() {
    const level = createLevelShell({
      id: 'the_mountain',
      name: 'The Mountain',
      width: 200,
      height: 200,
      start: { x: 10.5, y: 100.5, z: 2 },
      timeLimit: 40
    });

    // --- Surface tiles ---
    fillTrack(level, 13, 68, 77, 1, 2);
    fillTrack(level, 91, 68, 1, 76, 2);
    fillTrack(level, 13, 69, 3, 1, 2);
    fillTrack(level, 17, 69, 5, 1, 2);
    fillTrack(level, 23, 69, 5, 1, 2);
    fillTrack(level, 29, 69, 5, 1, 2);
    fillTrack(level, 35, 69, 4, 1, 2);
    fillTrack(level, 40, 69, 4, 1, 2);
    fillTrack(level, 45, 69, 4, 1, 2);
    fillTrack(level, 50, 69, 5, 1, 2);
    fillTrack(level, 56, 69, 4, 1, 2);
    fillTrack(level, 61, 69, 5, 1, 2);
    fillTrack(level, 67, 69, 5, 1, 2);
    fillTrack(level, 73, 69, 5, 1, 2);
    fillTrack(level, 79, 69, 2, 1, 2);
    fillTrack(level, 82, 69, 2, 1, 2);
    fillTrack(level, 85, 69, 2, 1, 2);
    fillTrack(level, 88, 69, 2, 1, 2);
    fillTrack(level, 13, 70, 2, 4, 2);
    fillTrack(level, 90, 70, 1, 5, 2);
    fillTrack(level, 13, 74, 1, 68, 2);
    fillTrack(level, 14, 75, 1, 5, 2);
    fillTrack(level, 90, 80, 1, 3, 2);
    fillTrack(level, 14, 81, 1, 4, 2);
    fillTrack(level, 14, 86, 1, 4, 2);
    fillTrack(level, 90, 87, 1, 5, 2);
    fillTrack(level, 14, 91, 1, 5, 2);
    fillTrack(level, 7, 94, 6, 12, 2);
    fillTrack(level, 90, 94, 1, 4, 2);
    fillTrack(level, 14, 98, 1, 5, 2);
    fillTrack(level, 90, 99, 1, 3, 2);
    fillTrack(level, 90, 103, 1, 3, 2);
    fillTrack(level, 14, 105, 1, 6, 2);
    fillTrack(level, 90, 107, 1, 3, 2);
    fillTrack(level, 90, 111, 1, 2, 2);
    fillTrack(level, 14, 112, 1, 4, 2);
    fillTrack(level, 90, 114, 1, 2, 2);
    fillTrack(level, 14, 117, 1, 3, 2);
    fillTrack(level, 90, 117, 1, 3, 2);
    fillTrack(level, 14, 121, 1, 4, 2);
    fillTrack(level, 90, 121, 1, 3, 2);
    fillTrack(level, 90, 125, 1, 2, 2);
    fillTrack(level, 14, 126, 1, 5, 2);
    fillTrack(level, 90, 128, 1, 2, 2);
    fillTrack(level, 90, 131, 1, 2, 2);
    fillTrack(level, 14, 132, 1, 4, 2);
    fillTrack(level, 90, 134, 1, 4, 2);
    fillTrack(level, 14, 137, 1, 6, 2);
    fillTrack(level, 90, 141, 1, 2, 2);
    fillTrack(level, 15, 142, 12, 2, 2);
    fillTrack(level, 28, 142, 5, 2, 2);
    fillTrack(level, 34, 142, 5, 2, 2);
    fillTrack(level, 40, 142, 5, 2, 2);
    fillTrack(level, 46, 142, 5, 2, 2);
    fillTrack(level, 52, 142, 4, 2, 2);
    fillTrack(level, 57, 142, 4, 2, 2);
    fillTrack(level, 62, 142, 4, 2, 2);
    fillTrack(level, 67, 142, 4, 2, 2);
    fillTrack(level, 72, 142, 4, 2, 2);
    fillTrack(level, 77, 142, 4, 2, 2);
    fillTrack(level, 82, 142, 3, 2, 2);
    fillTrack(level, 86, 142, 2, 2, 2);
    fillTrack(level, 89, 142, 1, 2, 2);
    setSurface(level, 13, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 27, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 33, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 39, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 45, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 51, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 56, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 61, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 66, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 71, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 76, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 81, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 85, 143, { baseHeight: 2, kind: 'track' });
    setSurface(level, 88, 143, { baseHeight: 2, kind: 'track' });
    fillTrack(level, 15, 70, 75, 2, 3);
    fillTrack(level, 15, 72, 5, 1, 3);
    fillTrack(level, 21, 72, 3, 1, 3);
    fillTrack(level, 25, 72, 4, 1, 3);
    fillTrack(level, 30, 72, 5, 1, 3);
    fillTrack(level, 36, 72, 7, 1, 3);
    fillTrack(level, 44, 72, 13, 1, 3);
    fillTrack(level, 58, 72, 6, 1, 3);
    fillTrack(level, 65, 72, 6, 1, 3);
    fillTrack(level, 72, 72, 5, 1, 3);
    fillTrack(level, 78, 72, 5, 1, 3);
    fillTrack(level, 84, 72, 6, 1, 3);
    fillTrack(level, 15, 73, 3, 10, 3);
    fillTrack(level, 87, 73, 3, 2, 3);
    fillTrack(level, 88, 75, 2, 67, 3);
    fillTrack(level, 87, 76, 1, 8, 3);
    fillTrack(level, 15, 83, 2, 15, 3);
    fillTrack(level, 17, 84, 1, 7, 3);
    fillTrack(level, 87, 85, 1, 3, 3);
    fillTrack(level, 87, 89, 1, 3, 3);
    fillTrack(level, 17, 92, 1, 15, 3);
    fillTrack(level, 87, 93, 1, 4, 3);
    fillTrack(level, 16, 98, 1, 44, 3);
    fillTrack(level, 87, 98, 1, 5, 3);
    fillTrack(level, 15, 103, 1, 39, 3);
    fillTrack(level, 87, 104, 1, 5, 3);
    fillTrack(level, 17, 108, 1, 24, 3);
    fillTrack(level, 87, 110, 1, 8, 3);
    fillTrack(level, 87, 119, 1, 7, 3);
    fillTrack(level, 87, 127, 1, 7, 3);
    fillTrack(level, 17, 133, 1, 9, 3);
    fillTrack(level, 87, 135, 1, 7, 3);
    fillTrack(level, 18, 139, 1, 3, 3);
    fillTrack(level, 20, 139, 3, 3, 3);
    fillTrack(level, 24, 139, 4, 3, 3);
    fillTrack(level, 29, 139, 1, 3, 3);
    fillTrack(level, 31, 139, 5, 3, 3);
    fillTrack(level, 37, 139, 5, 3, 3);
    fillTrack(level, 43, 139, 6, 3, 3);
    fillTrack(level, 50, 139, 11, 3, 3);
    fillTrack(level, 62, 139, 7, 3, 3);
    fillTrack(level, 70, 139, 7, 3, 3);
    fillTrack(level, 78, 139, 6, 3, 3);
    fillTrack(level, 85, 139, 2, 3, 3);
    fillTrack(level, 19, 140, 1, 2, 3);
    fillTrack(level, 23, 140, 1, 2, 3);
    fillTrack(level, 28, 140, 1, 2, 3);
    fillTrack(level, 30, 140, 1, 2, 3);
    fillTrack(level, 36, 140, 1, 2, 3);
    fillTrack(level, 42, 140, 1, 2, 3);
    fillTrack(level, 49, 140, 1, 2, 3);
    fillTrack(level, 61, 140, 1, 2, 3);
    fillTrack(level, 69, 140, 1, 2, 3);
    fillTrack(level, 77, 140, 1, 2, 3);
    fillTrack(level, 84, 140, 1, 2, 3);
    fillTrack(level, 18, 73, 69, 2, 4);
    fillTrack(level, 18, 75, 3, 4, 4);
    fillTrack(level, 22, 75, 3, 1, 4);
    fillTrack(level, 26, 75, 3, 1, 4);
    fillTrack(level, 30, 75, 3, 1, 4);
    fillTrack(level, 34, 75, 4, 1, 4);
    fillTrack(level, 39, 75, 4, 1, 4);
    fillTrack(level, 44, 75, 8, 1, 4);
    fillTrack(level, 53, 75, 8, 1, 4);
    fillTrack(level, 62, 75, 5, 1, 4);
    fillTrack(level, 68, 75, 7, 1, 4);
    fillTrack(level, 76, 75, 7, 1, 4);
    fillTrack(level, 84, 75, 3, 9, 4);
    fillTrack(level, 18, 79, 2, 17, 4);
    fillTrack(level, 20, 80, 1, 5, 4);
    fillTrack(level, 85, 84, 2, 55, 4);
    fillTrack(level, 84, 85, 1, 5, 4);
    fillTrack(level, 20, 86, 1, 5, 4);
    fillTrack(level, 84, 91, 1, 6, 4);
    fillTrack(level, 20, 92, 1, 13, 4);
    fillTrack(level, 18, 96, 1, 43, 4);
    fillTrack(level, 19, 97, 1, 42, 4);
    fillTrack(level, 84, 98, 1, 12, 4);
    fillTrack(level, 20, 106, 1, 13, 4);
    fillTrack(level, 84, 111, 1, 5, 4);
    fillTrack(level, 84, 117, 1, 6, 4);
    fillTrack(level, 20, 120, 1, 9, 4);
    fillTrack(level, 84, 124, 1, 10, 4);
    fillTrack(level, 20, 130, 1, 9, 4);
    fillTrack(level, 84, 135, 1, 4, 4);
    fillTrack(level, 21, 136, 3, 3, 4);
    fillTrack(level, 25, 136, 2, 3, 4);
    fillTrack(level, 29, 136, 5, 3, 4);
    fillTrack(level, 35, 136, 11, 3, 4);
    fillTrack(level, 47, 136, 5, 3, 4);
    fillTrack(level, 53, 136, 5, 3, 4);
    fillTrack(level, 59, 136, 5, 3, 4);
    fillTrack(level, 65, 136, 6, 3, 4);
    fillTrack(level, 72, 136, 5, 3, 4);
    fillTrack(level, 78, 136, 2, 3, 4);
    fillTrack(level, 81, 136, 3, 3, 4);
    fillTrack(level, 24, 137, 1, 2, 4);
    fillTrack(level, 27, 137, 2, 2, 4);
    fillTrack(level, 34, 137, 1, 2, 4);
    fillTrack(level, 46, 137, 1, 2, 4);
    fillTrack(level, 52, 137, 1, 2, 4);
    fillTrack(level, 58, 137, 1, 2, 4);
    fillTrack(level, 64, 137, 1, 2, 4);
    fillTrack(level, 71, 137, 1, 2, 4);
    fillTrack(level, 77, 137, 1, 2, 4);
    fillTrack(level, 80, 137, 1, 2, 4);
    fillTrack(level, 21, 76, 63, 1, 5);
    fillTrack(level, 21, 77, 27, 1, 5);
    fillTrack(level, 49, 77, 35, 1, 5);
    fillTrack(level, 21, 78, 3, 4, 5);
    setSurface(level, 25, 78, { baseHeight: 5, kind: 'track' });
    fillTrack(level, 27, 78, 3, 1, 5);
    fillTrack(level, 31, 78, 3, 1, 5);
    fillTrack(level, 35, 78, 5, 1, 5);
    fillTrack(level, 41, 78, 5, 1, 5);
    fillTrack(level, 47, 78, 9, 1, 5);
    fillTrack(level, 57, 78, 7, 1, 5);
    fillTrack(level, 65, 78, 8, 1, 5);
    fillTrack(level, 74, 78, 7, 1, 5);
    fillTrack(level, 82, 78, 2, 37, 5);
    fillTrack(level, 81, 79, 1, 2, 5);
    fillTrack(level, 21, 82, 2, 27, 5);
    fillTrack(level, 81, 82, 1, 15, 5);
    fillTrack(level, 23, 83, 1, 7, 5);
    fillTrack(level, 23, 91, 1, 10, 5);
    fillTrack(level, 81, 98, 1, 12, 5);
    fillTrack(level, 23, 102, 1, 7, 5);
    fillTrack(level, 22, 109, 1, 27, 5);
    fillTrack(level, 21, 110, 1, 26, 5);
    fillTrack(level, 23, 110, 1, 4, 5);
    fillTrack(level, 81, 111, 1, 2, 5);
    fillTrack(level, 81, 114, 1, 14, 5);
    fillTrack(level, 23, 115, 1, 6, 5);
    fillTrack(level, 82, 115, 1, 21, 5);
    fillTrack(level, 83, 116, 1, 20, 5);
    fillTrack(level, 23, 122, 1, 6, 5);
    fillTrack(level, 23, 129, 1, 4, 5);
    fillTrack(level, 81, 129, 1, 7, 5);
    fillTrack(level, 24, 133, 3, 3, 5);
    fillTrack(level, 28, 133, 3, 3, 5);
    fillTrack(level, 32, 133, 1, 3, 5);
    fillTrack(level, 34, 133, 4, 3, 5);
    fillTrack(level, 39, 133, 4, 2, 5);
    fillTrack(level, 44, 133, 3, 3, 5);
    fillTrack(level, 48, 133, 6, 3, 5);
    fillTrack(level, 55, 133, 6, 3, 5);
    fillTrack(level, 62, 133, 7, 3, 5);
    fillTrack(level, 70, 133, 9, 3, 5);
    fillTrack(level, 80, 133, 1, 3, 5);
    fillTrack(level, 23, 134, 1, 2, 5);
    fillTrack(level, 27, 134, 1, 2, 5);
    fillTrack(level, 31, 134, 1, 2, 5);
    fillTrack(level, 33, 134, 1, 2, 5);
    fillTrack(level, 38, 134, 1, 2, 5);
    fillTrack(level, 43, 134, 1, 2, 5);
    fillTrack(level, 47, 134, 1, 2, 5);
    fillTrack(level, 54, 134, 1, 2, 5);
    fillTrack(level, 61, 134, 1, 2, 5);
    fillTrack(level, 69, 134, 1, 2, 5);
    fillTrack(level, 79, 134, 1, 2, 5);
    fillTrack(level, 39, 135, 3, 1, 5);
    fillTrack(level, 24, 79, 57, 2, 6);
    fillTrack(level, 24, 81, 4, 1, 6);
    fillTrack(level, 29, 81, 4, 1, 6);
    fillTrack(level, 34, 81, 3, 1, 6);
    fillTrack(level, 38, 81, 4, 1, 6);
    fillTrack(level, 43, 81, 5, 1, 6);
    fillTrack(level, 49, 81, 7, 1, 6);
    fillTrack(level, 57, 81, 5, 1, 6);
    fillTrack(level, 63, 81, 7, 1, 6);
    fillTrack(level, 71, 81, 2, 1, 6);
    fillTrack(level, 74, 81, 7, 1, 6);
    fillTrack(level, 24, 82, 3, 3, 6);
    fillTrack(level, 79, 82, 2, 21, 6);
    fillTrack(level, 78, 83, 1, 7, 6);
    fillTrack(level, 24, 85, 2, 48, 6);
    fillTrack(level, 26, 86, 1, 5, 6);
    fillTrack(level, 78, 91, 1, 9, 6);
    fillTrack(level, 26, 92, 1, 9, 6);
    fillTrack(level, 78, 101, 1, 8, 6);
    fillTrack(level, 26, 102, 1, 8, 6);
    fillTrack(level, 79, 103, 1, 30, 6);
    fillTrack(level, 80, 104, 1, 29, 6);
    fillTrack(level, 78, 110, 1, 8, 6);
    fillTrack(level, 26, 111, 1, 6, 6);
    fillTrack(level, 26, 118, 1, 10, 6);
    fillTrack(level, 78, 119, 1, 7, 6);
    fillTrack(level, 78, 127, 1, 6, 6);
    fillTrack(level, 26, 129, 1, 4, 6);
    fillTrack(level, 27, 130, 1, 3, 6);
    fillTrack(level, 29, 130, 2, 3, 6);
    fillTrack(level, 32, 130, 7, 1, 6);
    fillTrack(level, 40, 130, 4, 3, 6);
    fillTrack(level, 45, 130, 5, 3, 6);
    fillTrack(level, 51, 130, 4, 3, 6);
    fillTrack(level, 56, 130, 4, 3, 6);
    fillTrack(level, 61, 130, 5, 2, 6);
    fillTrack(level, 67, 130, 5, 3, 6);
    fillTrack(level, 73, 130, 2, 3, 6);
    fillTrack(level, 76, 130, 2, 3, 6);
    fillTrack(level, 31, 131, 5, 2, 6);
    fillTrack(level, 37, 131, 2, 2, 6);
    fillTrack(level, 44, 131, 1, 2, 6);
    fillTrack(level, 50, 131, 1, 2, 6);
    fillTrack(level, 55, 131, 1, 2, 6);
    fillTrack(level, 60, 131, 1, 2, 6);
    fillTrack(level, 66, 131, 1, 2, 6);
    fillTrack(level, 72, 131, 1, 2, 6);
    fillTrack(level, 75, 131, 1, 2, 6);
    setSurface(level, 28, 132, { baseHeight: 6, kind: 'track' });
    setSurface(level, 36, 132, { baseHeight: 6, kind: 'track' });
    setSurface(level, 39, 132, { baseHeight: 6, kind: 'track' });
    setSurface(level, 61, 132, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 63, 132, 3, 1, 6);
    fillTrack(level, 27, 82, 24, 2, 7);
    fillTrack(level, 52, 82, 26, 2, 7);
    fillTrack(level, 51, 83, 1, 2, 7);
    fillTrack(level, 27, 84, 2, 46, 7);
    setSurface(level, 30, 84, { baseHeight: 7, kind: 'track' });
    fillTrack(level, 32, 84, 4, 1, 7);
    fillTrack(level, 37, 84, 2, 1, 7);
    fillTrack(level, 40, 84, 4, 1, 7);
    fillTrack(level, 45, 84, 3, 1, 7);
    fillTrack(level, 49, 84, 2, 1, 7);
    fillTrack(level, 52, 84, 2, 1, 7);
    fillTrack(level, 55, 84, 2, 1, 7);
    fillTrack(level, 59, 84, 7, 1, 7);
    fillTrack(level, 67, 84, 4, 1, 7);
    fillTrack(level, 72, 84, 6, 1, 7);
    fillTrack(level, 29, 85, 1, 2, 7);
    fillTrack(level, 76, 85, 2, 13, 7);
    fillTrack(level, 75, 86, 1, 6, 7);
    fillTrack(level, 29, 88, 1, 2, 7);
    fillTrack(level, 29, 91, 1, 6, 7);
    fillTrack(level, 75, 93, 1, 8, 7);
    fillTrack(level, 29, 98, 1, 7, 7);
    fillTrack(level, 76, 98, 1, 32, 7);
    fillTrack(level, 77, 99, 1, 31, 7);
    fillTrack(level, 75, 102, 1, 8, 7);
    fillTrack(level, 29, 106, 1, 6, 7);
    fillTrack(level, 75, 111, 1, 8, 7);
    fillTrack(level, 29, 113, 1, 6, 7);
    fillTrack(level, 29, 120, 1, 6, 7);
    fillTrack(level, 75, 120, 1, 4, 7);
    fillTrack(level, 75, 125, 1, 5, 7);
    fillTrack(level, 29, 127, 1, 3, 7);
    fillTrack(level, 32, 127, 2, 3, 7);
    fillTrack(level, 35, 127, 1, 3, 7);
    fillTrack(level, 37, 127, 3, 3, 7);
    fillTrack(level, 41, 127, 3, 3, 7);
    fillTrack(level, 45, 127, 3, 3, 7);
    fillTrack(level, 49, 127, 3, 3, 7);
    fillTrack(level, 53, 127, 4, 3, 7);
    fillTrack(level, 58, 127, 3, 3, 7);
    fillTrack(level, 62, 127, 4, 3, 7);
    fillTrack(level, 67, 127, 4, 3, 7);
    fillTrack(level, 72, 127, 3, 3, 7);
    fillTrack(level, 30, 128, 2, 2, 7);
    fillTrack(level, 34, 128, 1, 2, 7);
    fillTrack(level, 36, 128, 1, 2, 7);
    fillTrack(level, 40, 128, 1, 2, 7);
    fillTrack(level, 44, 128, 1, 2, 7);
    fillTrack(level, 48, 128, 1, 2, 7);
    fillTrack(level, 52, 128, 1, 2, 7);
    fillTrack(level, 57, 128, 1, 2, 7);
    fillTrack(level, 61, 128, 1, 2, 7);
    fillTrack(level, 66, 128, 1, 2, 7);
    fillTrack(level, 71, 128, 1, 2, 7);
    fillTrack(level, 30, 85, 45, 2, 8);
    fillTrack(level, 30, 87, 2, 40, 8);
    setSurface(level, 33, 87, { baseHeight: 8, kind: 'track' });
    fillTrack(level, 35, 87, 3, 1, 8);
    fillTrack(level, 39, 87, 5, 1, 8);
    fillTrack(level, 45, 87, 5, 1, 8);
    fillTrack(level, 51, 87, 8, 1, 8);
    fillTrack(level, 60, 87, 4, 1, 8);
    fillTrack(level, 65, 87, 3, 1, 8);
    fillTrack(level, 69, 87, 3, 1, 8);
    fillTrack(level, 73, 87, 2, 27, 8);
    fillTrack(level, 32, 88, 1, 4, 8);
    fillTrack(level, 72, 88, 1, 3, 8);
    fillTrack(level, 72, 92, 1, 5, 8);
    fillTrack(level, 32, 93, 1, 5, 8);
    fillTrack(level, 72, 98, 1, 6, 8);
    fillTrack(level, 32, 99, 1, 4, 8);
    fillTrack(level, 32, 104, 1, 7, 8);
    fillTrack(level, 72, 105, 1, 6, 8);
    fillTrack(level, 32, 112, 1, 8, 8);
    fillTrack(level, 72, 112, 1, 6, 8);
    fillTrack(level, 73, 114, 1, 13, 8);
    fillTrack(level, 74, 115, 1, 12, 8);
    fillTrack(level, 72, 119, 1, 5, 8);
    fillTrack(level, 32, 121, 1, 6, 8);
    fillTrack(level, 34, 124, 4, 1, 8);
    fillTrack(level, 39, 124, 4, 3, 8);
    fillTrack(level, 44, 124, 4, 3, 8);
    fillTrack(level, 49, 124, 4, 3, 8);
    fillTrack(level, 54, 124, 4, 3, 8);
    fillTrack(level, 60, 124, 3, 3, 8);
    fillTrack(level, 64, 124, 4, 3, 8);
    fillTrack(level, 69, 124, 3, 3, 8);
    fillTrack(level, 33, 125, 2, 2, 8);
    fillTrack(level, 36, 125, 3, 2, 8);
    fillTrack(level, 43, 125, 1, 2, 8);
    fillTrack(level, 48, 125, 1, 2, 8);
    fillTrack(level, 53, 125, 1, 2, 8);
    fillTrack(level, 58, 125, 2, 2, 8);
    fillTrack(level, 63, 125, 1, 2, 8);
    fillTrack(level, 68, 125, 1, 2, 8);
    fillTrack(level, 72, 125, 1, 2, 8);
    setSurface(level, 35, 126, { baseHeight: 8, kind: 'track' });
    fillTrack(level, 33, 88, 39, 2, 9);
    fillTrack(level, 33, 90, 3, 4, 9);
    fillTrack(level, 37, 90, 2, 1, 9);
    setSurface(level, 40, 90, { baseHeight: 9, kind: 'track' });
    fillTrack(level, 42, 90, 2, 1, 9);
    fillTrack(level, 45, 90, 3, 1, 9);
    fillTrack(level, 49, 90, 3, 1, 9);
    setSurface(level, 53, 90, { baseHeight: 9, kind: 'track' });
    fillTrack(level, 55, 90, 4, 1, 9);
    fillTrack(level, 60, 90, 4, 1, 9);
    fillTrack(level, 65, 90, 3, 1, 9);
    fillTrack(level, 69, 90, 3, 3, 9);
    fillTrack(level, 70, 93, 1, 31, 9);
    fillTrack(level, 33, 94, 2, 30, 9);
    fillTrack(level, 69, 94, 1, 5, 9);
    fillTrack(level, 71, 94, 1, 30, 9);
    fillTrack(level, 35, 95, 1, 4, 9);
    fillTrack(level, 35, 100, 1, 4, 9);
    fillTrack(level, 69, 100, 1, 5, 9);
    fillTrack(level, 35, 105, 1, 4, 9);
    fillTrack(level, 69, 106, 1, 5, 9);
    fillTrack(level, 35, 110, 1, 4, 9);
    fillTrack(level, 69, 112, 1, 5, 9);
    fillTrack(level, 35, 115, 1, 5, 9);
    fillTrack(level, 69, 118, 1, 3, 9);
    fillTrack(level, 35, 121, 2, 3, 9);
    fillTrack(level, 38, 121, 3, 3, 9);
    fillTrack(level, 42, 121, 2, 3, 9);
    fillTrack(level, 45, 121, 2, 3, 9);
    fillTrack(level, 48, 121, 4, 3, 9);
    fillTrack(level, 53, 121, 1, 3, 9);
    fillTrack(level, 55, 121, 3, 3, 9);
    fillTrack(level, 59, 121, 3, 3, 9);
    fillTrack(level, 63, 121, 3, 3, 9);
    fillTrack(level, 67, 121, 2, 3, 9);
    fillTrack(level, 37, 122, 1, 2, 9);
    fillTrack(level, 41, 122, 1, 2, 9);
    fillTrack(level, 44, 122, 1, 2, 9);
    fillTrack(level, 47, 122, 1, 2, 9);
    fillTrack(level, 52, 122, 1, 2, 9);
    fillTrack(level, 54, 122, 1, 2, 9);
    fillTrack(level, 58, 122, 1, 2, 9);
    fillTrack(level, 62, 122, 1, 2, 9);
    fillTrack(level, 66, 122, 1, 2, 9);
    fillTrack(level, 69, 122, 1, 2, 9);
    setSurface(level, 2, 194, { baseHeight: 9, kind: 'track' });
    fillTrack(level, 36, 91, 11, 2, 10);
    fillTrack(level, 48, 91, 10, 2, 10);
    fillTrack(level, 59, 91, 10, 2, 10);
    fillTrack(level, 47, 92, 1, 2, 10);
    fillTrack(level, 58, 92, 1, 2, 10);
    fillTrack(level, 36, 93, 5, 1, 10);
    fillTrack(level, 42, 93, 2, 1, 10);
    fillTrack(level, 45, 93, 2, 1, 10);
    fillTrack(level, 49, 93, 4, 1, 10);
    fillTrack(level, 54, 93, 3, 1, 10);
    fillTrack(level, 59, 93, 3, 1, 10);
    fillTrack(level, 63, 93, 3, 1, 10);
    fillTrack(level, 67, 93, 2, 28, 10);
    fillTrack(level, 36, 94, 2, 27, 10);
    fillTrack(level, 66, 94, 1, 7, 10);
    fillTrack(level, 38, 95, 1, 6, 10);
    fillTrack(level, 38, 102, 1, 3, 10);
    fillTrack(level, 66, 102, 1, 5, 10);
    fillTrack(level, 38, 106, 1, 5, 10);
    fillTrack(level, 66, 108, 1, 5, 10);
    fillTrack(level, 38, 112, 1, 4, 10);
    fillTrack(level, 66, 114, 1, 4, 10);
    fillTrack(level, 38, 117, 1, 4, 10);
    fillTrack(level, 39, 118, 1, 3, 10);
    fillTrack(level, 41, 118, 3, 3, 10);
    fillTrack(level, 46, 118, 3, 3, 10);
    fillTrack(level, 50, 118, 3, 2, 10);
    fillTrack(level, 54, 118, 4, 3, 10);
    fillTrack(level, 59, 118, 3, 3, 10);
    fillTrack(level, 63, 118, 3, 3, 10);
    fillTrack(level, 40, 119, 1, 2, 10);
    fillTrack(level, 44, 119, 2, 2, 10);
    fillTrack(level, 49, 119, 1, 2, 10);
    fillTrack(level, 53, 119, 1, 2, 10);
    fillTrack(level, 58, 119, 1, 2, 10);
    fillTrack(level, 62, 119, 1, 2, 10);
    fillTrack(level, 66, 119, 1, 2, 10);
    fillTrack(level, 51, 120, 2, 1, 10);
    fillTrack(level, 39, 94, 27, 1, 11);
    fillTrack(level, 39, 95, 3, 1, 11);
    fillTrack(level, 43, 95, 2, 1, 11);
    fillTrack(level, 46, 95, 2, 1, 11);
    fillTrack(level, 49, 95, 2, 1, 11);
    fillTrack(level, 52, 95, 2, 1, 11);
    fillTrack(level, 55, 95, 2, 1, 11);
    fillTrack(level, 58, 95, 2, 1, 11);
    fillTrack(level, 61, 95, 2, 1, 11);
    fillTrack(level, 64, 95, 2, 1, 11);
    fillTrack(level, 39, 96, 1, 22, 11);
    setSurface(level, 64, 96, { baseHeight: 11, kind: 'track' });
    fillTrack(level, 40, 97, 1, 2, 11);
    fillTrack(level, 65, 97, 1, 20, 11);
    fillTrack(level, 64, 98, 1, 2, 11);
    fillTrack(level, 40, 100, 1, 11, 11);
    fillTrack(level, 64, 101, 1, 2, 11);
    fillTrack(level, 64, 104, 1, 2, 11);
    fillTrack(level, 64, 107, 1, 2, 11);
    fillTrack(level, 64, 110, 1, 2, 11);
    fillTrack(level, 40, 112, 1, 6, 11);
    fillTrack(level, 64, 113, 1, 2, 11);
    fillTrack(level, 42, 116, 1, 2, 11);
    fillTrack(level, 44, 116, 1, 2, 11);
    fillTrack(level, 46, 116, 3, 2, 11);
    fillTrack(level, 50, 116, 3, 2, 11);
    fillTrack(level, 54, 116, 2, 2, 11);
    fillTrack(level, 57, 116, 2, 2, 11);
    fillTrack(level, 60, 116, 2, 2, 11);
    fillTrack(level, 63, 116, 2, 2, 11);
    setSurface(level, 41, 117, { baseHeight: 11, kind: 'track' });
    setSurface(level, 43, 117, { baseHeight: 11, kind: 'track' });
    setSurface(level, 45, 117, { baseHeight: 11, kind: 'track' });
    setSurface(level, 49, 117, { baseHeight: 11, kind: 'track' });
    setSurface(level, 53, 117, { baseHeight: 11, kind: 'track' });
    setSurface(level, 56, 117, { baseHeight: 11, kind: 'track' });
    setSurface(level, 59, 117, { baseHeight: 11, kind: 'track' });
    setSurface(level, 62, 117, { baseHeight: 11, kind: 'track' });
    fillTrack(level, 129, 94, 9, 4, 0);
    fillTrack(level, 128, 95, 1, 9, 0);
    fillTrack(level, 138, 95, 1, 9, 0);
    fillTrack(level, 129, 98, 4, 1, 0);
    fillTrack(level, 134, 98, 4, 1, 0);
    fillTrack(level, 129, 99, 1, 6, 0);
    fillTrack(level, 131, 99, 1, 6, 0);
    fillTrack(level, 135, 99, 3, 6, 0);
    fillTrack(level, 130, 100, 1, 5, 0);
    fillTrack(level, 132, 100, 1, 5, 0);
    fillTrack(level, 134, 100, 1, 5, 0);
    fillTrack(level, 133, 101, 1, 4, 0);
    fillTrack(level, 41, 96, 18, 1, 12);
    fillTrack(level, 60, 96, 4, 1, 12);
    fillTrack(level, 41, 97, 4, 1, 12);
    fillTrack(level, 46, 97, 2, 1, 12);
    setSurface(level, 49, 97, { baseHeight: 12, kind: 'track' });
    fillTrack(level, 51, 97, 3, 1, 12);
    fillTrack(level, 55, 97, 2, 1, 12);
    fillTrack(level, 58, 97, 3, 1, 12);
    fillTrack(level, 62, 97, 2, 2, 12);
    fillTrack(level, 41, 98, 1, 18, 12);
    fillTrack(level, 42, 99, 1, 2, 12);
    fillTrack(level, 63, 99, 1, 17, 12);
    fillTrack(level, 62, 100, 1, 3, 12);
    fillTrack(level, 42, 102, 1, 4, 12);
    fillTrack(level, 62, 104, 1, 3, 12);
    fillTrack(level, 42, 107, 1, 3, 12);
    fillTrack(level, 62, 108, 1, 3, 12);
    setSurface(level, 42, 111, { baseHeight: 12, kind: 'track' });
    fillTrack(level, 62, 112, 1, 4, 12);
    fillTrack(level, 42, 113, 1, 3, 12);
    fillTrack(level, 44, 114, 1, 2, 12);
    fillTrack(level, 46, 114, 2, 2, 12);
    fillTrack(level, 49, 114, 2, 2, 12);
    fillTrack(level, 52, 114, 1, 2, 12);
    fillTrack(level, 54, 114, 3, 2, 12);
    fillTrack(level, 58, 114, 3, 2, 12);
    setSurface(level, 43, 115, { baseHeight: 12, kind: 'track' });
    setSurface(level, 45, 115, { baseHeight: 12, kind: 'track' });
    setSurface(level, 48, 115, { baseHeight: 12, kind: 'track' });
    setSurface(level, 51, 115, { baseHeight: 12, kind: 'track' });
    setSurface(level, 53, 115, { baseHeight: 12, kind: 'track' });
    setSurface(level, 57, 115, { baseHeight: 12, kind: 'track' });
    setSurface(level, 61, 115, { baseHeight: 12, kind: 'track' });
    fillTrack(level, 43, 98, 19, 1, 13);
    fillTrack(level, 43, 99, 1, 15, 13);
    setSurface(level, 45, 99, { baseHeight: 13, kind: 'track' });
    setSurface(level, 47, 99, { baseHeight: 13, kind: 'track' });
    setSurface(level, 49, 99, { baseHeight: 13, kind: 'track' });
    fillTrack(level, 51, 99, 2, 1, 13);
    setSurface(level, 54, 99, { baseHeight: 13, kind: 'track' });
    setSurface(level, 56, 99, { baseHeight: 13, kind: 'track' });
    setSurface(level, 58, 99, { baseHeight: 13, kind: 'track' });
    fillTrack(level, 60, 99, 2, 3, 13);
    fillTrack(level, 44, 100, 1, 2, 13);
    fillTrack(level, 61, 102, 1, 12, 13);
    setSurface(level, 44, 103, { baseHeight: 13, kind: 'track' });
    fillTrack(level, 60, 103, 1, 2, 13);
    fillTrack(level, 44, 105, 1, 2, 13);
    fillTrack(level, 60, 106, 1, 2, 13);
    fillTrack(level, 44, 108, 1, 2, 13);
    fillTrack(level, 60, 109, 1, 2, 13);
    fillTrack(level, 44, 111, 1, 3, 13);
    fillTrack(level, 46, 112, 2, 2, 13);
    fillTrack(level, 49, 112, 2, 2, 13);
    fillTrack(level, 52, 112, 3, 2, 13);
    fillTrack(level, 56, 112, 2, 2, 13);
    fillTrack(level, 60, 112, 1, 2, 13);
    setSurface(level, 45, 113, { baseHeight: 13, kind: 'track' });
    setSurface(level, 48, 113, { baseHeight: 13, kind: 'track' });
    setSurface(level, 51, 113, { baseHeight: 13, kind: 'track' });
    setSurface(level, 55, 113, { baseHeight: 13, kind: 'track' });
    fillTrack(level, 58, 113, 2, 1, 13);
    setSurface(level, 133, 99, { baseHeight: 1, kind: 'track' });
    fillTrack(level, 45, 100, 1, 3, 15);
    fillTrack(level, 48, 100, 12, 1, 15);
    setSurface(level, 46, 101, { baseHeight: 15, kind: 'track' });
    fillTrack(level, 48, 101, 2, 1, 15);
    setSurface(level, 51, 101, { baseHeight: 15, kind: 'track' });
    fillTrack(level, 53, 101, 2, 1, 15);
    setSurface(level, 57, 101, { baseHeight: 15, kind: 'track' });
    fillTrack(level, 59, 101, 1, 11, 15);
    setSurface(level, 58, 102, { baseHeight: 15, kind: 'track' });
    fillTrack(level, 46, 103, 1, 5, 15);
    fillTrack(level, 45, 104, 1, 2, 15);
    setSurface(level, 58, 104, { baseHeight: 15, kind: 'track' });
    setSurface(level, 57, 105, { baseHeight: 15, kind: 'track' });
    fillTrack(level, 58, 106, 1, 3, 15);
    fillTrack(level, 45, 107, 1, 5, 15);
    fillTrack(level, 46, 109, 1, 3, 15);
    fillTrack(level, 47, 110, 2, 1, 15);
    fillTrack(level, 52, 110, 2, 1, 15);
    fillTrack(level, 55, 110, 2, 1, 15);
    fillTrack(level, 58, 110, 1, 2, 15);
    setSurface(level, 47, 111, { baseHeight: 15, kind: 'track' });
    fillTrack(level, 49, 111, 3, 1, 15);
    fillTrack(level, 53, 111, 2, 1, 15);
    setSurface(level, 56, 111, { baseHeight: 15, kind: 'track' });
    setSurface(level, 49, 104, { baseHeight: 18, kind: 'track' });
    setSurface(level, 55, 104, { baseHeight: 18, kind: 'track' });
    setSurface(level, 53, 105, { baseHeight: 18, kind: 'track' });
    setSurface(level, 56, 105, { baseHeight: 18, kind: 'track' });
    setSurface(level, 50, 106, { baseHeight: 18, kind: 'track' });
    setSurface(level, 49, 107, { baseHeight: 18, kind: 'track' });
    fillTrack(level, 55, 107, 2, 1, 18);
    fillTrack(level, 51, 104, 3, 1, 19);
    fillTrack(level, 51, 105, 2, 3, 19);
    fillTrack(level, 53, 106, 1, 2, 19);
    // Ramps
    setSurface(level, 51, 82, { baseHeight: 6.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 47, 91, { baseHeight: 9.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 58, 91, { baseHeight: 9.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 59, 96, { baseHeight: 11.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 133, 100, { baseHeight: 0.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 29, 87, { baseHeight: 7.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 98, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 99, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 132, 99, { baseHeight: 0.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 100, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 101, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 42, 101, { baseHeight: 12.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 102, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 23, 109, { baseHeight: 5.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 35, 120, { baseHeight: 9.5, shape: 'slope_w', rise: 0.5, kind: 'track' });
    setSurface(level, 71, 93, { baseHeight: 8.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 65, 96, { baseHeight: 10.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 77, 98, { baseHeight: 6.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 134, 99, { baseHeight: 0.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 80, 103, { baseHeight: 5.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 74, 114, { baseHeight: 7.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 83, 115, { baseHeight: 4.5, shape: 'slope_e', rise: 0.5, kind: 'track' });
    setSurface(level, 133, 98, { baseHeight: 0.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 65, 117, { baseHeight: 10.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 50, 120, { baseHeight: 9.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 33, 124, { baseHeight: 8.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 59, 124, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 28, 130, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 62, 132, { baseHeight: 5.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 42, 135, { baseHeight: 4.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    setSurface(level, 30, 139, { baseHeight: 3.5, shape: 'slope_n', rise: 0.5, kind: 'track' });
    // Bounce tiles
    setSurface(level, 90, 68, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 16, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 22, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 34, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 39, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 60, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 78, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 81, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 69, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 24, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 43, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 71, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 77, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 83, 72, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 74, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 21, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 25, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 33, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 43, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 61, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 67, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 75, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 83, 75, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 75, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 75, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 76, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 77, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 77, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 24, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 26, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 30, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 34, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 40, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 46, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 73, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 81, 78, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 78, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 79, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 79, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 80, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 33, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 37, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 42, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 70, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 73, 81, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 81, 81, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 82, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 78, 82, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 83, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 83, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 31, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 36, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 39, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 71, 84, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 84, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 84, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 84, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 85, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 85, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 26, 85, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 75, 85, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 85, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 86, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 32, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 34, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 59, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 68, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 87, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 88, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 90, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 90, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 90, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 36, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 39, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 41, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 59, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 68, 90, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 78, 90, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 90, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 91, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 91, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 26, 91, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 91, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 32, 92, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 75, 92, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 92, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 92, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 41, 93, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 93, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 93, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 93, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 93, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 93, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 93, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 69, 93, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 93, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 94, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 94, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 42, 95, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 95, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 95, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 95, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 95, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 95, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 60, 95, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 63, 95, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 96, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 19, 96, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 40, 96, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 97, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 97, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 97, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 97, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 97, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 97, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 97, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 61, 97, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 97, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 97, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 81, 97, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 97, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 97, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 32, 98, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 42, 98, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 98, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 99, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 40, 99, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 99, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 46, 99, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 99, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 99, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 99, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 99, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 99, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 59, 99, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 99, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 69, 99, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 46, 100, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 100, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 100, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 78, 100, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 101, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 26, 101, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 101, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 101, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 101, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 101, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 101, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 101, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 101, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 101, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 75, 101, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 102, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 46, 102, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 102, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 60, 102, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 102, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 103, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 32, 103, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 103, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 103, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 103, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 103, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 103, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 103, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 104, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 104, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 104, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 104, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 104, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 104, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 104, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 104, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 104, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 104, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 105, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 105, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 105, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 105, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 105, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 105, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 105, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 105, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 105, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 105, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 60, 105, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 69, 105, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 42, 106, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 106, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 106, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 106, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 106, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 106, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 106, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 106, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 106, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 106, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 106, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 107, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 107, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 107, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 107, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 107, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 107, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 107, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 107, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 107, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 46, 108, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 108, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 60, 108, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 21, 109, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 109, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 109, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 109, { baseHeight: 17, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 109, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 109, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 78, 109, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 109, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 26, 110, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 42, 110, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 110, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 110, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 110, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 110, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 110, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 110, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 75, 110, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 81, 110, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 110, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 110, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 111, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 32, 111, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 111, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 40, 111, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 111, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 111, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 111, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 111, { baseHeight: 15, kind: 'bounce', bounce: 6 });
    setSurface(level, 60, 111, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 111, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 69, 111, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 111, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 112, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 42, 112, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 112, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 112, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 112, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 112, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 112, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 59, 112, { baseHeight: 13, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 112, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 113, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 81, 113, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 113, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 114, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 114, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 43, 114, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 114, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 114, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 114, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 114, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 114, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 61, 114, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 115, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 116, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 116, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 41, 116, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 43, 116, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 116, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 116, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 116, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 116, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 59, 116, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 116, { baseHeight: 11, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 116, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 116, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 26, 117, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 69, 117, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 40, 118, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 118, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 118, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 118, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 118, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 118, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 118, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 118, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 118, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 78, 118, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 118, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 119, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 119, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 75, 119, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 120, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 32, 120, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 120, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 121, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 37, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 41, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 62, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 69, 121, { baseHeight: 9, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 123, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 124, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 43, 124, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 124, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 53, 124, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 124, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 63, 124, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 68, 124, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 124, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 75, 124, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 124, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 125, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 35, 125, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 29, 126, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 78, 126, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 126, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 30, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 31, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 34, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 36, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 40, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 48, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 57, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 61, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 71, 127, { baseHeight: 7, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 127, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 128, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 26, 128, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 81, 128, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 129, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 31, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 39, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 44, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 50, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 55, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 60, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 72, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 75, 130, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 130, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 131, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 131, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 36, 131, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 39, 131, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 132, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 27, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 31, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 33, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 38, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 43, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 54, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 61, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 69, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 79, 133, { baseHeight: 5, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 133, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 134, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 87, 134, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 136, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 24, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 27, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 34, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 46, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 52, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 58, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 64, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 71, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 77, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 80, 136, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 138, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 19, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 23, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 36, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 42, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 49, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 61, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 69, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 77, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 84, 139, { baseHeight: 3, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 139, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 140, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 13, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 27, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 33, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 39, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 45, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 51, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 56, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 61, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 66, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 71, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 76, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 81, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 85, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 88, 142, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 143, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 90, 143, { baseHeight: 2, kind: 'bounce', bounce: 6 });

    // --- Tunnels ---
    placeTunnel(level, {
      id: 'tunnel_secret',
      path: [
        { x: 52.5, y: 102.5, z: 15 },
        { x: 130.5, y: 99.5, z: 0 }
      ],
      speed: 8, funnelRadius: 1, hidden: true
    });

    // --- Goal ---
    setGoal(level, 52.5, 106.5);
    setTrigger(level, 133, 99, 'secret_goal');

    return registerLevel(level);
  }

  // ─── Level 15: Ice Crossing ───
  function buildIceCrossing() {
    const level = createLevelShell({
      id: 'ice_crossing',
      name: 'Ice Crossing',
      width: 55,
      height: 55,
      start: { x: 5.5, y: 5.5, z: 6 },
      timeLimit: 40
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 5, 3, 6);
    fillTrack(level, 20, 3, 5, 3, 6);
    setSurface(level, 8, 4, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 13, 4, 3, 1, 6);
    setSurface(level, 19, 4, { baseHeight: 6, kind: 'track' });
    setSurface(level, 16, 5, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 3, 6, 4, 1, 6);
    fillTrack(level, 10, 6, 3, 1, 6);
    setSurface(level, 18, 6, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 22, 6, 3, 2, 6);
    fillTrack(level, 3, 7, 3, 1, 6);
    fillTrack(level, 22, 8, 1, 3, 6);
    fillTrack(level, 21, 14, 1, 9, 6);
    fillTrack(level, 19, 18, 2, 5, 6);
    setSurface(level, 28, 19, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 31, 19, 2, 2, 6);
    fillTrack(level, 22, 20, 4, 1, 6);
    fillTrack(level, 22, 21, 2, 2, 6);
    setSurface(level, 33, 21, { baseHeight: 6, kind: 'track' });
    setSurface(level, 32, 22, { baseHeight: 6, kind: 'track' });
    setSurface(level, 33, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 33, 29, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 32, 30, 1, 2, 6);
    fillTrack(level, 34, 31, 1, 5, 6);
    fillTrack(level, 33, 34, 1, 2, 6);
    setSurface(level, 38, 40, { baseHeight: 6, kind: 'track' });
    setSurface(level, 36, 42, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 36, 48, 2, 1, 4);
    fillTrack(level, 39, 48, 2, 1, 4);
    fillTrack(level, 36, 49, 1, 3, 4);
    fillTrack(level, 40, 49, 1, 3, 4);
    setSurface(level, 38, 50, { baseHeight: 4, kind: 'track' });
    // Ramps
    setSurface(level, 37, 43, { baseHeight: 5.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 44, { baseHeight: 5.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 45, { baseHeight: 4.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 46, { baseHeight: 4.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 37, 47, { baseHeight: 4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 38, 43, { baseHeight: 5.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 38, 44, { baseHeight: 5.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 38, 45, { baseHeight: 4.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 38, 46, { baseHeight: 4.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 38, 47, { baseHeight: 4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 39, 43, { baseHeight: 5.6, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 39, 44, { baseHeight: 5.2, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 39, 45, { baseHeight: 4.8, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 39, 46, { baseHeight: 4.4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    setSurface(level, 39, 47, { baseHeight: 4, shape: 'slope_n', rise: 0.4, kind: 'track' });
    // Ice tiles
    fillSurfaceRect(level, 9, 4, 4, 2, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 16, 4, 3, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 8, 5, 1, 2, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 13, 5, 3, 2, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 17, 5, 3, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 7, 6, 1, 2, { baseHeight: 6, kind: 'ice', ice: true });
    setSurface(level, 9, 6, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 16, 6, 2, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 19, 6, 3, 1, { baseHeight: 6, kind: 'ice', ice: true });
    setSurface(level, 6, 7, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 20, 7, 2, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 21, 8, 1, 6, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 22, 11, 1, 9, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 23, 18, 1, 2, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 24, 19, 4, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 29, 19, 2, 2, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 33, 19, 1, 2, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 26, 20, 3, 1, { baseHeight: 6, kind: 'ice', ice: true });
    setSurface(level, 32, 21, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 33, 22, 1, 2, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 32, 23, 1, 7, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 33, 25, 1, 4, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 33, 30, 1, 4, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 32, 32, 1, 5, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 33, 36, 3, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 35, 37, 1, 5, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 36, 41, 4, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 37, 42, 3, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 38, 48, 1, 2, { baseHeight: 4, kind: 'ice', ice: true });
    fillSurfaceRect(level, 37, 49, 1, 3, { baseHeight: 4, kind: 'ice', ice: true });
    fillSurfaceRect(level, 39, 49, 1, 3, { baseHeight: 4, kind: 'ice', ice: true });
    setSurface(level, 38, 51, { baseHeight: 4, kind: 'ice', ice: true });

    // --- Goal ---
    setGoal(level, 38.5, 50.5);

    return registerLevel(level);
  }

  // ─── Level 16: Crumble Cascade ───
  function buildCrumbleCascade() {
    const level = createLevelShell({
      id: 'crumble_cascade',
      name: 'Crumble Cascade',
      width: 50,
      height: 60,
      start: { x: 5.5, y: 5.5, z: 12 },
      timeLimit: 30
    });

    // --- Surface tiles ---
    fillTrack(level, 3, 3, 5, 4, 12);
    fillTrack(level, 3, 10, 1, 3, 10);
    fillTrack(level, 7, 22, 1, 3, 8);
    fillTrack(level, 27, 29, 1, 2, 6);
    setSurface(level, 25, 57, { baseHeight: 2, kind: 'track' });
    // Ramps
    setSurface(level, 21, 7, { baseHeight: 11.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 21, 8, { baseHeight: 10.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 21, 9, { baseHeight: 10.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 22, 7, { baseHeight: 11.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 22, 8, { baseHeight: 10.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 22, 9, { baseHeight: 10.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 23, 7, { baseHeight: 11.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 23, 8, { baseHeight: 10.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 23, 9, { baseHeight: 10.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 4, 13, { baseHeight: 9.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 4, 14, { baseHeight: 8.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 4, 15, { baseHeight: 8.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 5, 13, { baseHeight: 9.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 5, 14, { baseHeight: 8.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 5, 15, { baseHeight: 8.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 6, 13, { baseHeight: 9.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 6, 14, { baseHeight: 8.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 6, 15, { baseHeight: 8.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 8, 25, { baseHeight: 7.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 8, 26, { baseHeight: 6.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 8, 27, { baseHeight: 6.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 9, 25, { baseHeight: 7.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 9, 26, { baseHeight: 6.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 9, 27, { baseHeight: 6.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 25, 31, { baseHeight: 5.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 25, 32, { baseHeight: 4.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 25, 33, { baseHeight: 4.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 25, 52, { baseHeight: 3.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 25, 53, { baseHeight: 2.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 25, 54, { baseHeight: 2.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 26, 31, { baseHeight: 5.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 26, 32, { baseHeight: 4.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 26, 33, { baseHeight: 4.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 26, 52, { baseHeight: 3.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 26, 53, { baseHeight: 2.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 26, 54, { baseHeight: 2.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 24, 52, { baseHeight: 3.35, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 24, 53, { baseHeight: 2.65, shape: 'slope_n', rise: 0.65, kind: 'track' });
    setSurface(level, 24, 54, { baseHeight: 2.05, shape: 'slope_n', rise: 0.65, kind: 'track' });
    // Crumble tiles
    fillSurfaceRect(level, 8, 3, 16, 4, { baseHeight: 12, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 4, 10, 19, 3, { baseHeight: 10, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 4, 16, 16, 2, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 4, 18, 3, 1, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 17, 18, 3, 6, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 8, 22, 9, 2, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 8, 24, 2, 1, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 8, 28, 2, 3, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 10, 29, 17, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 24, 34, 3, 3, { baseHeight: 4, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 24, 37, 1, 15, { baseHeight: 4, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 25, 49, 2, 3, { baseHeight: 4, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 24, 55, 3, 2, { baseHeight: 2, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 24, 57, 1, 2, { baseHeight: 2, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 26, 57, 1, 2, { baseHeight: 2, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 25, 58, { baseHeight: 2, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });

    // --- Goal ---
    setGoal(level, 25.5, 57.5);

    return registerLevel(level);
  }

  // ─── Level 17: The Gauntlet ───
  function buildTheGauntletV2() {
    const level = createLevelShell({
      id: 'the_gauntlet_v2',
      name: 'The Gauntlet',
      width: 60,
      height: 50,
      start: { x: 5.5, y: 24.5, z: 6 },
      timeLimit: 30
    });

    // --- Surface tiles ---
    fillTrack(level, 32, 21, 10, 2, 6);
    fillTrack(level, 3, 22, 5, 1, 6);
    setSurface(level, 10, 22, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 12, 22, 4, 1, 6);
    fillTrack(level, 28, 22, 3, 2, 6);
    fillTrack(level, 3, 23, 4, 4, 6);
    setSurface(level, 9, 23, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 11, 23, 4, 1, 6);
    fillTrack(level, 18, 23, 2, 3, 6);
    fillTrack(level, 31, 23, 3, 3, 6);
    fillTrack(level, 35, 23, 1, 5, 6);
    fillTrack(level, 37, 23, 3, 2, 6);
    fillTrack(level, 41, 23, 1, 5, 6);
    setSurface(level, 7, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 10, 24, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 12, 24, 1, 3, 6);
    fillTrack(level, 14, 24, 1, 3, 6);
    fillTrack(level, 17, 24, 1, 2, 6);
    fillTrack(level, 29, 24, 1, 3, 6);
    fillTrack(level, 34, 24, 1, 2, 6);
    fillTrack(level, 36, 24, 1, 4, 6);
    fillTrack(level, 40, 24, 1, 4, 6);
    setSurface(level, 9, 25, { baseHeight: 6, kind: 'track' });
    setSurface(level, 11, 25, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 13, 25, 1, 2, 6);
    fillTrack(level, 28, 25, 1, 2, 6);
    fillTrack(level, 30, 25, 1, 2, 6);
    fillTrack(level, 38, 25, 1, 3, 6);
    setSurface(level, 7, 26, { baseHeight: 6, kind: 'track' });
    setSurface(level, 10, 26, { baseHeight: 6, kind: 'track' });
    setSurface(level, 15, 26, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 32, 26, 2, 2, 6);
    fillTrack(level, 37, 26, 1, 2, 6);
    fillTrack(level, 39, 26, 1, 2, 6);
    setSurface(level, 34, 27, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 55, 38, 3, 5, 6);
    fillTrack(level, 49, 39, 2, 3, 6);
    setSurface(level, 53, 39, { baseHeight: 6, kind: 'track' });
    setSurface(level, 51, 40, { baseHeight: 6, kind: 'track' });
    setSurface(level, 53, 41, { baseHeight: 6, kind: 'track' });
    // Crumble tiles
    setSurface(level, 9, 22, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 11, 22, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 42, 22, 4, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 7, 23, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 10, 23, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 22, 23, 6, 3, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 9, 24, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 11, 24, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 7, 25, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 10, 25, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 42, 25, 4, 2, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 9, 26, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 11, 26, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 53, 38, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 51, 39, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 53, 40, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 51, 41, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 53, 42, { baseHeight: 6, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    // Bounce tiles
    setSurface(level, 31, 22, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 36, 23, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 24, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 39, 25, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 31, 26, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 34, 26, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 47, 31, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    // Ice tiles
    fillSurfaceRect(level, 15, 23, 3, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 20, 23, 2, 3, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 15, 24, 2, 2, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 42, 24, 4, 1, { baseHeight: 6, kind: 'ice', ice: true });
    fillSurfaceRect(level, 46, 39, 3, 3, { baseHeight: 6, kind: 'ice', ice: true });
    // Conveyor tiles
    setSurface(level, 46, 22, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 22, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 23, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 23, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 23, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 24, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 24, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 24, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 25, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 25, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 25, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 26, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 26, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 26, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 27, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 27, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 27, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 28, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 28, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 29, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 29, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 29, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 30, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 30, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 30, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 31, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 31, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 32, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 32, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 32, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 33, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 33, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 33, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 34, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 34, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 34, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 35, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 35, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 36, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 36, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 36, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 37, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 37, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 37, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 46, 38, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 47, 38, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 48, 38, { baseHeight: 6, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    // Track under sweepers
    setSurface(level, 48, 22, { baseHeight: 6, kind: 'track' });
    setSurface(level, 34, 23, { baseHeight: 6, kind: 'track' });
    setSurface(level, 40, 23, { baseHeight: 6, kind: 'track' });
    setSurface(level, 13, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 30, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 37, 25, { baseHeight: 6, kind: 'track' });
    setSurface(level, 46, 28, { baseHeight: 6, kind: 'track' });
    setSurface(level, 48, 35, { baseHeight: 6, kind: 'track' });
    // Track under gates
    setSurface(level, 8, 22, { baseHeight: 6, kind: 'track' });
    setSurface(level, 8, 23, { baseHeight: 6, kind: 'track' });
    setSurface(level, 8, 24, { baseHeight: 6, kind: 'track' });
    setSurface(level, 8, 25, { baseHeight: 6, kind: 'track' });
    setSurface(level, 8, 26, { baseHeight: 6, kind: 'track' });
    setSurface(level, 54, 38, { baseHeight: 6, kind: 'track' });
    setSurface(level, 54, 39, { baseHeight: 6, kind: 'track' });
    setSurface(level, 54, 40, { baseHeight: 6, kind: 'track' });
    setSurface(level, 54, 41, { baseHeight: 6, kind: 'track' });
    setSurface(level, 54, 42, { baseHeight: 6, kind: 'track' });
    setSurface(level, 52, 39, { baseHeight: 6, kind: 'track' });
    setSurface(level, 52, 40, { baseHeight: 6, kind: 'track' });
    setSurface(level, 52, 41, { baseHeight: 6, kind: 'track' });

    // --- Timed Gates ---
    addTimedGate(level, 'gate_1', 8, 22, 6, 1, 5);
    addTimedGate(level, 'gate_3', 54, 38, 6, 1, 5);
    addTimedGate(level, 'gate_2', 52, 39, 6, 1, 3);

    // --- Sweepers ---
    addActor(level, {
      id: 'sweep1', kind: ACTOR_KINDS.SWEEPER,
      x: 48.5, y: 22.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    addActor(level, {
      id: 'sweep2', kind: ACTOR_KINDS.SWEEPER,
      x: 34.5, y: 23.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'sweep3', kind: ACTOR_KINDS.SWEEPER,
      x: 40.5, y: 23.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweep4', kind: ACTOR_KINDS.SWEEPER,
      x: 13.5, y: 24.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    addActor(level, {
      id: 'sweep5', kind: ACTOR_KINDS.SWEEPER,
      x: 30.5, y: 24.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'sweep6', kind: ACTOR_KINDS.SWEEPER,
      x: 37.5, y: 25.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweep7', kind: ACTOR_KINDS.SWEEPER,
      x: 46.5, y: 28.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    addActor(level, {
      id: 'sweep8', kind: ACTOR_KINDS.SWEEPER,
      x: 48.5, y: 35.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });

    // --- Goal ---
    setGoal(level, 55.5, 40.5);

    return registerLevel(level);
  }

  // ─── Level 18: Conveyor Maze ───
  function buildConveyorMaze() {
    const level = createLevelShell({
      id: 'conveyor_maze',
      name: 'Conveyor Maze',
      width: 120,
      height: 120,
      start: { x: 10.5, y: 60.5, z: 4 },
      timeLimit: 30
    });

    // --- Surface tiles ---
    fillTrack(level, 88, 24, 12, 1, 4);
    fillTrack(level, 88, 25, 2, 11, 4);
    fillTrack(level, 97, 25, 3, 11, 4);
    fillTrack(level, 56, 26, 12, 8, 4);
    fillTrack(level, 26, 28, 10, 4, 4);
    fillTrack(level, 26, 32, 8, 4, 4);
    fillTrack(level, 90, 34, 7, 2, 4);
    fillTrack(level, 6, 56, 28, 10, 4);
    fillTrack(level, 93, 56, 1, 12, 4);
    fillTrack(level, 34, 60, 2, 4, 4);
    fillTrack(level, 56, 60, 12, 3, 4);
    fillTrack(level, 56, 63, 4, 1, 4);
    fillTrack(level, 61, 63, 2, 1, 4);
    fillTrack(level, 64, 63, 4, 1, 4);
    fillTrack(level, 26, 88, 8, 12, 4);
    fillTrack(level, 58, 88, 3, 12, 4);
    fillTrack(level, 63, 88, 3, 12, 4);
    fillTrack(level, 93, 88, 5, 3, 4);
    fillTrack(level, 56, 90, 2, 8, 4);
    fillTrack(level, 66, 90, 2, 8, 4);
    fillTrack(level, 96, 91, 2, 2, 4);
    fillTrack(level, 34, 92, 2, 3, 4);
    fillTrack(level, 61, 92, 2, 8, 4);
    fillTrack(level, 97, 93, 1, 7, 4);
    setSurface(level, 94, 94, { baseHeight: 4, kind: 'track' });
    fillTrack(level, 96, 97, 1, 3, 4);
    fillTrack(level, 93, 98, 3, 2, 4);
    // Conveyor tiles
    setSurface(level, 90, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 91, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 92, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 93, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 94, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 95, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 96, 25, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 54, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 92, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 93, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 94, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 96, 26, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 92, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 93, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 94, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 96, 27, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 92, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 94, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 96, 28, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 81, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 82, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 83, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 84, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 85, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 86, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 87, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 92, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 94, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 96, 29, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 81, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 82, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 83, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 84, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 85, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 86, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 87, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 92, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 93, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 94, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 96, 30, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 92, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 93, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 94, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 96, 31, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 48, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 91, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 92, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 94, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 95, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 96, 32, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 54, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 91, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 92, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 94, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 95, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 96, 33, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 34, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 34, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 35, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 35, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 26, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 36, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 37, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 38, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 39, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 40, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 41, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 42, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 43, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 44, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 45, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 46, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 47, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 48, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 49, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 50, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 51, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 52, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 53, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 54, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 27, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 28, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 29, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 30, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 31, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 32, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 33, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 55, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 61, 56, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 56, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 57, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 57, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 58, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 58, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 61, 59, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 62, 59, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 36, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 81, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 82, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 83, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 84, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 85, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 86, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 87, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 88, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 89, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 92, 60, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 81, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 82, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 83, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 84, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 85, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 86, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 87, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 88, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 89, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 92, 61, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 81, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 82, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 83, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 84, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 85, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 86, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 87, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 88, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 89, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 92, 62, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 36, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 60, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 68, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 81, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 82, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 83, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 84, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 85, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 86, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 87, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 88, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 89, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 92, 63, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 60, 64, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 64, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 60, 65, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 65, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 26, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 66, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 26, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 67, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 26, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 68, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 69, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 70, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 71, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 72, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 73, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 74, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 75, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 76, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 77, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 78, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 79, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 80, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 81, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 82, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 83, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 84, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 85, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 86, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 26, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 27, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 28, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 29, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 30, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 31, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 32, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 33, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 60, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 63, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 87, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 95, 91, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 95, 92, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 36, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 37, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 38, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 39, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 40, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 41, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 42, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 43, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 44, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 45, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 46, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 47, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 48, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 49, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 50, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 51, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 52, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 53, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 54, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 55, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 68, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 69, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 70, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 71, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 72, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 73, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 74, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 96, 93, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 75, 94, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 76, 94, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 94, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 94, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 94, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 94, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 96, 94, { baseHeight: 4, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 77, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 78, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 79, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 80, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 81, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 82, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 83, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 84, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 85, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 86, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 87, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 88, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 89, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 96, 95, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 88, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 89, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 90, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 91, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 92, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 93, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 94, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 96, 96, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 93, 97, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 94, 97, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 95, 97, { baseHeight: 4, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });

    // --- Goal ---
    setGoal(level, 94.5, 94.5);

    return registerLevel(level);
  }

  // ─── Level 19: Tunnel Express ───
  function buildTunnelExpress() {
    const level = createLevelShell({
      id: 'tunnel_express',
      name: 'Tunnel Express',
      width: 60,
      height: 55,
      start: { x: 5.5, y: 27.5, z: 8 },
      timeLimit: 30
    });

    // --- Surface tiles ---
    fillTrack(level, 22, 7, 1, 6, 8);
    fillTrack(level, 19, 10, 3, 3, 8);
    fillTrack(level, 23, 10, 3, 3, 8);
    fillTrack(level, 19, 16, 7, 3, 8);
    fillTrack(level, 22, 19, 1, 3, 8);
    setSurface(level, 15, 22, { baseHeight: 8, kind: 'track' });
    fillTrack(level, 4, 26, 3, 3, 8);
    setSurface(level, 43, 25, { baseHeight: 4, kind: 'track' });
    fillTrack(level, 43, 42, 5, 2, 4);
    fillTrack(level, 43, 44, 2, 2, 4);
    fillTrack(level, 46, 44, 2, 1, 4);
    fillTrack(level, 45, 45, 2, 1, 4);
    fillTrack(level, 49, 38, 7, 4, 2);
    fillTrack(level, 51, 42, 5, 1, 2);
    fillTrack(level, 51, 43, 3, 2, 2);
    fillTrack(level, 55, 43, 1, 2, 2);
    setSurface(level, 54, 44, { baseHeight: 2, kind: 'track' });
    fillTrack(level, 29, 41, 6, 2, 5);
    fillTrack(level, 29, 43, 2, 3, 5);
    fillTrack(level, 33, 43, 2, 3, 5);
    fillTrack(level, 31, 44, 2, 2, 5);
    fillTrack(level, 14, 49, 3, 1, 18);
    fillTrack(level, 14, 50, 1, 2, 18);
    fillTrack(level, 16, 50, 1, 2, 18);
    setSurface(level, 15, 51, { baseHeight: 18, kind: 'track' });

    // --- Funnel tiles (explicit from CSV) ---
    setSurface(level, 19, 7, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 20.5, funnelCenterY: 8.5, funnelMaxDist: 2.414213562373095, _tx: 19, _ty: 7 });
    setSurface(level, 20, 7, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 20.5, funnelCenterY: 8.5, funnelMaxDist: 2, _tx: 20, _ty: 7 });
    setSurface(level, 21, 7, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 20.5, funnelCenterY: 8.5, funnelMaxDist: 2.414213562373095, _tx: 21, _ty: 7 });
    setSurface(level, 23, 7, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 8.5, funnelMaxDist: 2.414213562373095, _tx: 23, _ty: 7 });
    setSurface(level, 24, 7, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 8.5, funnelMaxDist: 2, _tx: 24, _ty: 7 });
    setSurface(level, 25, 7, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 8.5, funnelMaxDist: 2.414213562373095, _tx: 25, _ty: 7 });
    setSurface(level, 19, 8, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 20.5, funnelCenterY: 8.5, funnelMaxDist: 2, _tx: 19, _ty: 8 });
    setSurface(level, 21, 8, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 20.5, funnelCenterY: 8.5, funnelMaxDist: 2, _tx: 21, _ty: 8 });
    setSurface(level, 23, 8, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 8.5, funnelMaxDist: 2, _tx: 23, _ty: 8 });
    setSurface(level, 25, 8, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 8.5, funnelMaxDist: 2, _tx: 25, _ty: 8 });
    setSurface(level, 19, 9, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 20.5, funnelCenterY: 8.5, funnelMaxDist: 2.414213562373095, _tx: 19, _ty: 9 });
    setSurface(level, 20, 9, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 20.5, funnelCenterY: 8.5, funnelMaxDist: 2, _tx: 20, _ty: 9 });
    setSurface(level, 21, 9, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 20.5, funnelCenterY: 8.5, funnelMaxDist: 2.414213562373095, _tx: 21, _ty: 9 });
    setSurface(level, 23, 9, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 8.5, funnelMaxDist: 2.414213562373095, _tx: 23, _ty: 9 });
    setSurface(level, 24, 9, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 8.5, funnelMaxDist: 2, _tx: 24, _ty: 9 });
    setSurface(level, 25, 9, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 8.5, funnelMaxDist: 2.414213562373095, _tx: 25, _ty: 9 });
    setSurface(level, 19, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 14.5, funnelMaxDist: 2.414213562373095, _tx: 19, _ty: 13 });
    setSurface(level, 20, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 14.5, funnelMaxDist: 2, _tx: 20, _ty: 13 });
    setSurface(level, 21, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 14.5, funnelMaxDist: 2.414213562373095, _tx: 21, _ty: 13 });
    setSurface(level, 23, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 14.5, funnelMaxDist: 2.414213562373095, _tx: 23, _ty: 13 });
    setSurface(level, 24, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 14.5, funnelMaxDist: 2, _tx: 24, _ty: 13 });
    setSurface(level, 25, 13, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 14.5, funnelMaxDist: 2.414213562373095, _tx: 25, _ty: 13 });
    setSurface(level, 19, 14, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 14.5, funnelMaxDist: 2, _tx: 19, _ty: 14 });
    setSurface(level, 21, 14, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 14.5, funnelMaxDist: 2, _tx: 21, _ty: 14 });
    setSurface(level, 23, 14, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 14.5, funnelMaxDist: 2, _tx: 23, _ty: 14 });
    setSurface(level, 25, 14, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 14.5, funnelMaxDist: 2, _tx: 25, _ty: 14 });
    setSurface(level, 19, 15, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 14.5, funnelMaxDist: 2.414213562373095, _tx: 19, _ty: 15 });
    setSurface(level, 20, 15, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 14.5, funnelMaxDist: 2, _tx: 20, _ty: 15 });
    setSurface(level, 21, 15, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 14.5, funnelMaxDist: 2.414213562373095, _tx: 21, _ty: 15 });
    setSurface(level, 23, 15, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 14.5, funnelMaxDist: 2.414213562373095, _tx: 23, _ty: 15 });
    setSurface(level, 24, 15, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 14.5, funnelMaxDist: 2, _tx: 24, _ty: 15 });
    setSurface(level, 25, 15, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 24.5, funnelCenterY: 14.5, funnelMaxDist: 2.414213562373095, _tx: 25, _ty: 15 });
    setSurface(level, 19, 19, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 20.5, funnelMaxDist: 2.414213562373095, _tx: 19, _ty: 19 });
    setSurface(level, 20, 19, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 20.5, funnelMaxDist: 2, _tx: 20, _ty: 19 });
    setSurface(level, 21, 19, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 20.5, funnelMaxDist: 2.414213562373095, _tx: 21, _ty: 19 });
    setSurface(level, 23, 19, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 24.5, funnelCenterY: 20.5, funnelMaxDist: 2.414213562373095, _tx: 23, _ty: 19 });
    setSurface(level, 24, 19, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 24.5, funnelCenterY: 20.5, funnelMaxDist: 2, _tx: 24, _ty: 19 });
    setSurface(level, 25, 19, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 24.5, funnelCenterY: 20.5, funnelMaxDist: 2.414213562373095, _tx: 25, _ty: 19 });
    setSurface(level, 19, 20, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 20.5, funnelMaxDist: 2, _tx: 19, _ty: 20 });
    setSurface(level, 21, 20, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 20.5, funnelMaxDist: 2, _tx: 21, _ty: 20 });
    setSurface(level, 23, 20, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 24.5, funnelCenterY: 20.5, funnelMaxDist: 2, _tx: 23, _ty: 20 });
    setSurface(level, 25, 20, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 24.5, funnelCenterY: 20.5, funnelMaxDist: 2, _tx: 25, _ty: 20 });
    setSurface(level, 19, 21, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 20.5, funnelMaxDist: 2.414213562373095, _tx: 19, _ty: 21 });
    setSurface(level, 20, 21, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 20.5, funnelMaxDist: 2, _tx: 20, _ty: 21 });
    setSurface(level, 21, 21, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 20.5, funnelCenterY: 20.5, funnelMaxDist: 2.414213562373095, _tx: 21, _ty: 21 });
    setSurface(level, 23, 21, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 24.5, funnelCenterY: 20.5, funnelMaxDist: 2.414213562373095, _tx: 23, _ty: 21 });
    setSurface(level, 24, 21, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 24.5, funnelCenterY: 20.5, funnelMaxDist: 2, _tx: 24, _ty: 21 });
    setSurface(level, 25, 21, { baseHeight: 8, shape: 'funnel', rise: 3, funnelCenterX: 24.5, funnelCenterY: 20.5, funnelMaxDist: 2.414213562373095, _tx: 25, _ty: 21 });
    setSurface(level, 12, 22, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 12, _ty: 22 });
    setSurface(level, 13, 22, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 13, _ty: 22 });
    setSurface(level, 14, 22, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 22 });
    setSurface(level, 42, 22, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 42, _ty: 22 });
    setSurface(level, 43, 22, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 43, _ty: 22 });
    setSurface(level, 44, 22, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 44, _ty: 22 });
    setSurface(level, 12, 23, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 12, _ty: 23 });
    setSurface(level, 14, 23, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 14, _ty: 23 });
    setSurface(level, 42, 23, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 42, _ty: 23 });
    setSurface(level, 44, 23, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 44, _ty: 23 });
    setSurface(level, 12, 24, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 12, _ty: 24 });
    setSurface(level, 13, 24, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 13, _ty: 24 });
    setSurface(level, 14, 24, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 13.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 24 });
    setSurface(level, 42, 24, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 42, _ty: 24 });
    setSurface(level, 43, 24, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 23.5, funnelMaxDist: 2, _tx: 43, _ty: 24 });
    setSurface(level, 44, 24, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 23.5, funnelMaxDist: 2.414213562373095, _tx: 44, _ty: 24 });
    setSurface(level, 14, 25, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 26.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 25 });
    setSurface(level, 15, 25, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 26.5, funnelMaxDist: 2, _tx: 15, _ty: 25 });
    setSurface(level, 16, 25, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 26.5, funnelMaxDist: 2.414213562373095, _tx: 16, _ty: 25 });
    setSurface(level, 7, 26, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 27.5, funnelMaxDist: 2.414213562373095, _tx: 7, _ty: 26 });
    setSurface(level, 8, 26, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 27.5, funnelMaxDist: 2, _tx: 8, _ty: 26 });
    setSurface(level, 9, 26, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 27.5, funnelMaxDist: 2.414213562373095, _tx: 9, _ty: 26 });
    setSurface(level, 14, 26, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 26.5, funnelMaxDist: 2, _tx: 14, _ty: 26 });
    setSurface(level, 16, 26, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 26.5, funnelMaxDist: 2, _tx: 16, _ty: 26 });
    setSurface(level, 42, 26, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 27.5, funnelMaxDist: 2.414213562373095, _tx: 42, _ty: 26 });
    setSurface(level, 43, 26, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 27.5, funnelMaxDist: 2, _tx: 43, _ty: 26 });
    setSurface(level, 44, 26, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 27.5, funnelMaxDist: 2.414213562373095, _tx: 44, _ty: 26 });
    setSurface(level, 7, 27, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 27.5, funnelMaxDist: 2, _tx: 7, _ty: 27 });
    setSurface(level, 9, 27, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 27.5, funnelMaxDist: 2, _tx: 9, _ty: 27 });
    setSurface(level, 14, 27, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 26.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 27 });
    setSurface(level, 15, 27, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 26.5, funnelMaxDist: 2, _tx: 15, _ty: 27 });
    setSurface(level, 16, 27, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 15.5, funnelCenterY: 26.5, funnelMaxDist: 2.414213562373095, _tx: 16, _ty: 27 });
    setSurface(level, 42, 27, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 27.5, funnelMaxDist: 2, _tx: 42, _ty: 27 });
    setSurface(level, 44, 27, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 27.5, funnelMaxDist: 2, _tx: 44, _ty: 27 });
    setSurface(level, 7, 28, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 27.5, funnelMaxDist: 2.414213562373095, _tx: 7, _ty: 28 });
    setSurface(level, 8, 28, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 27.5, funnelMaxDist: 2, _tx: 8, _ty: 28 });
    setSurface(level, 9, 28, { baseHeight: 8, shape: 'funnel', rise: 2, funnelCenterX: 8.5, funnelCenterY: 27.5, funnelMaxDist: 2.414213562373095, _tx: 9, _ty: 28 });
    setSurface(level, 42, 28, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 27.5, funnelMaxDist: 2.414213562373095, _tx: 42, _ty: 28 });
    setSurface(level, 43, 28, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 27.5, funnelMaxDist: 2, _tx: 43, _ty: 28 });
    setSurface(level, 44, 28, { baseHeight: 4, shape: 'funnel', rise: 2, funnelCenterX: 43.5, funnelCenterY: 27.5, funnelMaxDist: 2.414213562373095, _tx: 44, _ty: 28 });
    setSurface(level, 26, 42, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 27.5, funnelCenterY: 43.5, funnelMaxDist: 2.414213562373095, _tx: 26, _ty: 42 });
    setSurface(level, 27, 42, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 27.5, funnelCenterY: 43.5, funnelMaxDist: 2, _tx: 27, _ty: 42 });
    setSurface(level, 28, 42, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 27.5, funnelCenterY: 43.5, funnelMaxDist: 2.414213562373095, _tx: 28, _ty: 42 });
    setSurface(level, 35, 42, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 36.5, funnelCenterY: 43.5, funnelMaxDist: 2.414213562373095, _tx: 35, _ty: 42 });
    setSurface(level, 36, 42, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 36.5, funnelCenterY: 43.5, funnelMaxDist: 2, _tx: 36, _ty: 42 });
    setSurface(level, 37, 42, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 36.5, funnelCenterY: 43.5, funnelMaxDist: 2.414213562373095, _tx: 37, _ty: 42 });
    setSurface(level, 26, 43, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 27.5, funnelCenterY: 43.5, funnelMaxDist: 2, _tx: 26, _ty: 43 });
    setSurface(level, 28, 43, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 27.5, funnelCenterY: 43.5, funnelMaxDist: 2, _tx: 28, _ty: 43 });
    setSurface(level, 35, 43, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 36.5, funnelCenterY: 43.5, funnelMaxDist: 2, _tx: 35, _ty: 43 });
    setSurface(level, 37, 43, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 36.5, funnelCenterY: 43.5, funnelMaxDist: 2, _tx: 37, _ty: 43 });
    setSurface(level, 26, 44, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 27.5, funnelCenterY: 43.5, funnelMaxDist: 2.414213562373095, _tx: 26, _ty: 44 });
    setSurface(level, 27, 44, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 27.5, funnelCenterY: 43.5, funnelMaxDist: 2, _tx: 27, _ty: 44 });
    setSurface(level, 28, 44, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 27.5, funnelCenterY: 43.5, funnelMaxDist: 2.414213562373095, _tx: 28, _ty: 44 });
    setSurface(level, 35, 44, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 36.5, funnelCenterY: 43.5, funnelMaxDist: 2.414213562373095, _tx: 35, _ty: 44 });
    setSurface(level, 36, 44, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 36.5, funnelCenterY: 43.5, funnelMaxDist: 2, _tx: 36, _ty: 44 });
    setSurface(level, 37, 44, { baseHeight: 5, shape: 'funnel', rise: 2, funnelCenterX: 36.5, funnelCenterY: 43.5, funnelMaxDist: 2.414213562373095, _tx: 37, _ty: 44 });
    setSurface(level, 47, 45, { baseHeight: 2, shape: 'funnel', rise: 0, funnelCenterX: 48.5, funnelCenterY: 46.5, funnelMaxDist: 2.414213562373095, _tx: 47, _ty: 45 });
    setSurface(level, 48, 45, { baseHeight: 2, shape: 'funnel', rise: 0, funnelCenterX: 48.5, funnelCenterY: 46.5, funnelMaxDist: 2, _tx: 48, _ty: 45 });
    setSurface(level, 49, 45, { baseHeight: 2, shape: 'funnel', rise: 0, funnelCenterX: 48.5, funnelCenterY: 46.5, funnelMaxDist: 2.414213562373095, _tx: 49, _ty: 45 });
    setSurface(level, 47, 46, { baseHeight: 2, shape: 'funnel', rise: 0, funnelCenterX: 48.5, funnelCenterY: 46.5, funnelMaxDist: 2, _tx: 47, _ty: 46 });
    setSurface(level, 49, 46, { baseHeight: 2, shape: 'funnel', rise: 0, funnelCenterX: 48.5, funnelCenterY: 46.5, funnelMaxDist: 2, _tx: 49, _ty: 46 });
    setSurface(level, 47, 47, { baseHeight: 2, shape: 'funnel', rise: 0, funnelCenterX: 48.5, funnelCenterY: 46.5, funnelMaxDist: 2.414213562373095, _tx: 47, _ty: 47 });
    setSurface(level, 48, 47, { baseHeight: 2, shape: 'funnel', rise: 0, funnelCenterX: 48.5, funnelCenterY: 46.5, funnelMaxDist: 2, _tx: 48, _ty: 47 });
    setSurface(level, 49, 47, { baseHeight: 2, shape: 'funnel', rise: 0, funnelCenterX: 48.5, funnelCenterY: 46.5, funnelMaxDist: 2.414213562373095, _tx: 49, _ty: 47 });
    setSurface(level, 14, 52, { baseHeight: 18, shape: 'funnel', rise: 3, funnelCenterX: 15.5, funnelCenterY: 53.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 52 });
    setSurface(level, 15, 52, { baseHeight: 18, shape: 'funnel', rise: 3, funnelCenterX: 15.5, funnelCenterY: 53.5, funnelMaxDist: 2, _tx: 15, _ty: 52 });
    setSurface(level, 16, 52, { baseHeight: 18, shape: 'funnel', rise: 3, funnelCenterX: 15.5, funnelCenterY: 53.5, funnelMaxDist: 2.414213562373095, _tx: 16, _ty: 52 });
    setSurface(level, 14, 53, { baseHeight: 18, shape: 'funnel', rise: 3, funnelCenterX: 15.5, funnelCenterY: 53.5, funnelMaxDist: 2, _tx: 14, _ty: 53 });
    setSurface(level, 16, 53, { baseHeight: 18, shape: 'funnel', rise: 3, funnelCenterX: 15.5, funnelCenterY: 53.5, funnelMaxDist: 2, _tx: 16, _ty: 53 });
    setSurface(level, 14, 54, { baseHeight: 18, shape: 'funnel', rise: 3, funnelCenterX: 15.5, funnelCenterY: 53.5, funnelMaxDist: 2.414213562373095, _tx: 14, _ty: 54 });
    setSurface(level, 15, 54, { baseHeight: 18, shape: 'funnel', rise: 3, funnelCenterX: 15.5, funnelCenterY: 53.5, funnelMaxDist: 2, _tx: 15, _ty: 54 });
    setSurface(level, 16, 54, { baseHeight: 18, shape: 'funnel', rise: 3, funnelCenterX: 15.5, funnelCenterY: 53.5, funnelMaxDist: 2.414213562373095, _tx: 16, _ty: 54 });

    // --- Tunnels ---
    placeTunnel(level, {
      id: 'tunnel_1',
      path: [
        { x: 8.5, y: 27.5, z: 6 },
        { x: 15.5, y: 23.5, z: 8 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_2',
      path: [
        { x: 13.5, y: 23.5, z: 6 },
        { x: 15.5, y: 50.5, z: 18 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_3',
      path: [
        { x: 15.5, y: 53.5, z: 15 },
        { x: 42.5, y: 25.5, z: 4 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_4',
      path: [
        { x: 43.5, y: 27.5, z: 2 },
        { x: 45.5, y: 44.5, z: 4 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_5',
      path: [
        { x: 48.5, y: 46.5, z: 2 },
        { x: 22.5, y: 15.5, z: 8 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_6',
      path: [
        { x: 24.5, y: 14.5, z: 6 },
        { x: 15.5, y: 24.5, z: 8 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_7',
      path: [
        { x: 15.5, y: 26.5, z: 6 },
        { x: 22.5, y: 13.5, z: 8 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_8',
      path: [
        { x: 20.5, y: 20.5, z: 6 },
        { x: 32.5, y: 43.5, z: 5 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_9',
      path: [
        { x: 36.5, y: 43.5, z: 3 },
        { x: 44.5, y: 25.5, z: 4 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_10',
      path: [
        { x: 43.5, y: 23.5, z: 2 },
        { x: 22.5, y: 14.5, z: 8 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_11',
      path: [
        { x: 24.5, y: 8.5, z: 6 },
        { x: 31.5, y: 43.5, z: 5 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_12',
      path: [
        { x: 27.5, y: 43.5, z: 3 },
        { x: 54.5, y: 43.5, z: 2 }
      ],
      speed: 8, funnelRadius: 0
    });
    placeTunnel(level, {
      id: 'tunnel_void_1',
      path: [
        { x: 20.5, y: 8.5, z: 5 },
        { x: 20.5, y: 8.5, z: -15 }
      ],
      speed: 12, funnelRadius: 0, exitType: 'drop'
    });
    placeTunnel(level, {
      id: 'tunnel_void_2',
      path: [
        { x: 20.5, y: 14.5, z: 6 },
        { x: 20.5, y: 14.5, z: -14 }
      ],
      speed: 12, funnelRadius: 0, exitType: 'drop'
    });
    placeTunnel(level, {
      id: 'tunnel_void_3',
      path: [
        { x: 24.5, y: 20.5, z: 5 },
        { x: 24.5, y: 20.5, z: -15 }
      ],
      speed: 12, funnelRadius: 0, exitType: 'drop'
    });

    // --- Goal ---
    setGoal(level, 52.5, 41.5);

    return registerLevel(level);
  }

  // ─── Level 20: The Final Ascent ───
  function buildTheFinalAscent() {
    const level = createLevelShell({
      id: 'the_final_ascent',
      name: 'The Final Ascent',
      width: 55,
      height: 60,
      start: { x: 5.5, y: 54.5, z: 2 },
      timeLimit: 30
    });

    // --- Surface tiles ---
    fillTrack(level, 13, 2, 5, 1, 16);
    fillTrack(level, 13, 3, 1, 3, 16);
    setSurface(level, 15, 3, { baseHeight: 16, kind: 'track' });
    fillTrack(level, 17, 3, 1, 3, 16);
    fillTrack(level, 14, 5, 3, 1, 16);
    fillTrack(level, 15, 10, 1, 4, 14);
    fillTrack(level, 14, 20, 3, 2, 14);
    fillTrack(level, 15, 22, 2, 2, 14);
    fillTrack(level, 28, 29, 6, 1, 12);
    fillTrack(level, 15, 30, 7, 2, 12);
    fillTrack(level, 30, 34, 4, 1, 8);
    fillTrack(level, 30, 35, 1, 2, 8);
    fillTrack(level, 33, 35, 1, 6, 8);
    fillTrack(level, 31, 36, 2, 2, 8);
    setSurface(level, 31, 38, { baseHeight: 8, kind: 'track' });
    fillTrack(level, 35, 38, 1, 3, 8);
    fillTrack(level, 37, 38, 1, 3, 8);
    fillTrack(level, 32, 39, 1, 4, 8);
    fillTrack(level, 34, 39, 1, 4, 8);
    fillTrack(level, 36, 39, 1, 4, 8);
    fillTrack(level, 38, 39, 1, 6, 8);
    fillTrack(level, 33, 42, 1, 2, 8);
    fillTrack(level, 35, 42, 1, 2, 8);
    fillTrack(level, 37, 42, 1, 3, 8);
    fillTrack(level, 37, 49, 2, 4, 6);
    fillTrack(level, 30, 53, 6, 2, 6);
    fillTrack(level, 37, 53, 1, 2, 6);
    setSurface(level, 28, 54, { baseHeight: 6, kind: 'track' });
    setSurface(level, 38, 54, { baseHeight: 6, kind: 'track' });
    fillTrack(level, 5, 50, 3, 1, 2);
    fillTrack(level, 5, 51, 1, 8, 2);
    setSurface(level, 7, 51, { baseHeight: 2, kind: 'track' });
    fillTrack(level, 20, 52, 1, 3, 2);
    setSurface(level, 8, 53, { baseHeight: 2, kind: 'track' });
    setSurface(level, 6, 54, { baseHeight: 2, kind: 'track' });
    fillTrack(level, 8, 55, 1, 4, 2);
    fillTrack(level, 6, 58, 2, 1, 2);
    // Ramps
    setSurface(level, 15, 6, { baseHeight: 16, shape: 'slope_s', kind: 'track' });
    setSurface(level, 15, 7, { baseHeight: 15, shape: 'slope_s', kind: 'track' });
    setSurface(level, 15, 8, { baseHeight: 14, shape: 'slope_s', kind: 'track' });
    setSurface(level, 15, 9, { baseHeight: 13, shape: 'slope_s', kind: 'track' });
    setSurface(level, 15, 24, { baseHeight: 13.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 27, { baseHeight: 12.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 28, { baseHeight: 12, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 15, 29, { baseHeight: 11.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 16, 24, { baseHeight: 13.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 16, 27, { baseHeight: 12.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 16, 28, { baseHeight: 12, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 16, 29, { baseHeight: 11.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 17, 24, { baseHeight: 13.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 17, 27, { baseHeight: 12.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 17, 28, { baseHeight: 12, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 17, 29, { baseHeight: 11.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 37, 45, { baseHeight: 7, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 37, 46, { baseHeight: 6.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 37, 47, { baseHeight: 6, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 37, 48, { baseHeight: 5.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 38, 45, { baseHeight: 7, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 38, 46, { baseHeight: 6.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 38, 47, { baseHeight: 6, shape: 'slope_s', rise: 0.5, kind: 'track' });
    setSurface(level, 38, 48, { baseHeight: 5.5, shape: 'slope_s', rise: 0.5, kind: 'track' });
    // Crumble tiles
    fillSurfaceRect(level, 15, 14, 1, 2, { baseHeight: 14, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 14, 15, 1, 3, { baseHeight: 14, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 16, 15, 1, 3, { baseHeight: 14, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 15, 17, 1, 3, { baseHeight: 14, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 14, 19, { baseHeight: 14, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 16, 19, { baseHeight: 14, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 15, 25, 3, 2, { baseHeight: 13, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 32, 38, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 34, 38, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 36, 38, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 38, 38, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 32, 43, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 34, 43, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    setSurface(level, 36, 43, { baseHeight: 8, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 16, 50, 1, 6, { baseHeight: 2, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 9, 53, 7, 3, { baseHeight: 2, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    fillSurfaceRect(level, 17, 53, 2, 3, { baseHeight: 2, kind: 'crumble', crumble: { delay: 0.15, downtime: 4.0 } });
    // Bounce tiles
    setSurface(level, 30, 32, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 31, 32, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 32, 32, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 33, 32, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 16, 34, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 15, 35, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 35, { baseHeight: 12, kind: 'bounce', bounce: 6 });
    setSurface(level, 31, 35, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 32, 35, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 37, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 16, 37, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 18, 37, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 13, 39, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 15, 39, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 39, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 19, 39, { baseHeight: 10, kind: 'bounce', bounce: 6 });
    setSurface(level, 12, 41, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 41, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 16, 41, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 18, 41, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 20, 41, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 13, 43, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 15, 43, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 43, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 19, 43, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 14, 45, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 16, 45, { baseHeight: 6, kind: 'bounce', bounce: 6 });
    setSurface(level, 18, 45, { baseHeight: 8, kind: 'bounce', bounce: 6 });
    setSurface(level, 15, 47, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 17, 47, { baseHeight: 4, kind: 'bounce', bounce: 6 });
    setSurface(level, 16, 49, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 24, 52, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 52, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 24, 53, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 28, 53, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    setSurface(level, 27, 54, { baseHeight: 2, kind: 'bounce', bounce: 6 });
    // Ice tiles
    setSurface(level, 21, 29, { baseHeight: 12, kind: 'ice', ice: true });
    fillSurfaceRect(level, 28, 30, 6, 1, { baseHeight: 12, kind: 'ice', ice: true });
    fillSurfaceRect(level, 28, 31, 1, 3, { baseHeight: 12, kind: 'ice', ice: true });
    fillSurfaceRect(level, 30, 33, 4, 1, { baseHeight: 12, kind: 'ice', ice: true });
    fillSurfaceRect(level, 21, 52, 3, 2, { baseHeight: 2, kind: 'ice', ice: true });
    fillSurfaceRect(level, 25, 52, 3, 2, { baseHeight: 2, kind: 'ice', ice: true });
    // Conveyor tiles
    setSurface(level, 22, 29, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 23, 29, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 24, 29, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 25, 29, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 26, 29, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 27, 29, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 22, 30, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 23, 30, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 24, 30, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 25, 30, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 26, 30, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 27, 30, { baseHeight: 12, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 6, 52, { baseHeight: 2, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 7, 52, { baseHeight: 2, kind: 'conveyor', conveyor: { x: 3, y: 0, strength: 2.5 } });
    setSurface(level, 8, 52, { baseHeight: 2, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 53, { baseHeight: 2, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 7, 53, { baseHeight: 2, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 7, 54, { baseHeight: 2, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 8, 54, { baseHeight: 2, kind: 'conveyor', conveyor: { x: 0, y: 3, strength: 2.5 } });
    setSurface(level, 6, 55, { baseHeight: 2, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 7, 55, { baseHeight: 2, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    setSurface(level, 6, 56, { baseHeight: 2, kind: 'conveyor', conveyor: { x: 0, y: -3, strength: 2.5 } });
    setSurface(level, 7, 56, { baseHeight: 2, kind: 'conveyor', conveyor: { x: -3, y: 0, strength: 2.5 } });
    // Hazard tiles
    fillSurfaceRect(level, 29, 31, 5, 1, { baseHeight: 12, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 29, 31, 5, 1);
    fillSurfaceRect(level, 29, 32, 1, 2, { baseHeight: 12, kind: 'hazard', failType: 'hazard' });
    addHazardRect(level, 29, 32, 1, 2);
    setSurface(level, 15, 33, { baseHeight: 12, kind: 'hazard', failType: 'hazard' });
    setTrigger(level, 15, 33, { kind: 'hazard', data: { type: 'hazard_strip' } });
    setSurface(level, 17, 33, { baseHeight: 12, kind: 'hazard', failType: 'hazard' });
    setTrigger(level, 17, 33, { kind: 'hazard', data: { type: 'hazard_strip' } });
    setSurface(level, 14, 34, { baseHeight: 12, kind: 'hazard', failType: 'hazard' });
    setTrigger(level, 14, 34, { kind: 'hazard', data: { type: 'hazard_strip' } });
    setSurface(level, 18, 34, { baseHeight: 12, kind: 'hazard', failType: 'hazard' });
    setTrigger(level, 18, 34, { kind: 'hazard', data: { type: 'hazard_strip' } });
    // Track under sweepers
    setSurface(level, 33, 41, { baseHeight: 8, kind: 'track' });
    setSurface(level, 35, 41, { baseHeight: 8, kind: 'track' });
    setSurface(level, 37, 41, { baseHeight: 8, kind: 'track' });
    setSurface(level, 38, 53, { baseHeight: 6, kind: 'track' });
    // Track under gates
    setSurface(level, 19, 53, { baseHeight: 2, kind: 'track' });
    setSurface(level, 19, 54, { baseHeight: 2, kind: 'track' });
    setSurface(level, 29, 53, { baseHeight: 6, kind: 'track' });
    setSurface(level, 29, 54, { baseHeight: 6, kind: 'track' });
    setSurface(level, 36, 53, { baseHeight: 6, kind: 'track' });
    setSurface(level, 36, 54, { baseHeight: 6, kind: 'track' });

    // --- Timed Gates ---
    addTimedGate(level, 'gate_1', 19, 53, 2, 1, 2);
    addTimedGate(level, 'gate_2', 29, 53, 6, 1, 2);
    addTimedGate(level, 'gate_3', 36, 53, 6, 1, 2);

    // --- Sweepers ---
    addActor(level, {
      id: 'sweep1', kind: ACTOR_KINDS.SWEEPER,
      x: 33.5, y: 41.5, z: 8, topHeight: 8,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });
    addActor(level, {
      id: 'sweep2', kind: ACTOR_KINDS.SWEEPER,
      x: 35.5, y: 41.5, z: 8, topHeight: 8,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.5, fatal: true
    });
    addActor(level, {
      id: 'sweep3', kind: ACTOR_KINDS.SWEEPER,
      x: 37.5, y: 41.5, z: 8, topHeight: 8,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.8, fatal: true
    });
    addActor(level, {
      id: 'sweep4', kind: ACTOR_KINDS.SWEEPER,
      x: 38.5, y: 53.5, z: 6, topHeight: 6,
      width: 1, height: 1, armLength: 2.5, armWidth: 0.22, angularSpeed: 1.2, fatal: true
    });

    // --- Elevators (from ACTORS section) ---
    addElevator(level, 'elev1', 19.5, 52.5, 2, 6, 2, 2, 0.9, 4.5);
    setSurface(level, 20, 53, { baseHeight: 2, kind: 'track' });

    // --- Moving Platforms ---
    addMovingBridge(level, 'plat1', [
      { x: 11.5, y: 1.5, z: 16 },
      { x: 6.5, y: 11.5, z: 12 },
      { x: 3.5, y: 40.5, z: 6 },
      { x: 3.5, y: 53.5, z: 2 },
    ], 2, 2, 3.3480, { pauseDuration: 1.5, midpointPause: 0.5 });

    // --- Goal ---
    setGoal(level, 15.5, 3.5);

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
    { id: 'switchback_descent',   name: 'Switchback Descent',   builder: buildSwitchbackDescent },
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
