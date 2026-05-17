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

  // Shared singleton for void cells  -  avoids allocating ~10K identical objects per level
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
      // Hidden flag  -  tile is invisible and non-collidable until secret is revealed
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
      // Secret/hidden flag  -  actor is invisible and non-interactive until revealed
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
    // Floor coordinates to ensure they map to valid grid indices
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cell = getSurfaceCell(level, tx, ty);
    if (cell) {
      if (cell.kind === 'void') {
        console.warn(`[LevelDesign] setGoal at (${tx},${ty}) is on a void tile  -  goal will be unreachable.`);
      } else if (cell.shape !== SHAPES.FLAT) {
        console.warn(`[LevelDesign] setGoal at (${tx},${ty}) is on a non-flat tile (shape='${cell.shape}')  -  marble may slide through goal.`);
      } else if (cell.bounce > 0) {
        console.warn(`[LevelDesign] setGoal at (${tx},${ty}) is on a bounce tile (bounce=${cell.bounce})  -  marble will be deflected away from goal.`);
      } else if (cell.crumble) {
        console.warn(`[LevelDesign] setGoal at (${tx},${ty}) is on a crumble tile  -  goal surface may disappear before marble arrives.`);
      }
    }
    setTrigger(level, tx, ty, { kind: 'goal', radius });
    level.goal = { x: tx + 0.5, y: ty + 0.5, radius };
  }

  function addActor(level, actor) {
    // Level design guideline: moving platforms should be positioned outside terrain
    // (except elevators, which may interact with terrain vertically).
    if (actor.kind === ACTOR_KINDS.MOVING_PLATFORM && actor.path) {
      const points = actor.path.points ?? [];
      for (const pt of points) {
        const cell = getSurfaceCell(level, Math.floor(pt.x), Math.floor(pt.y));
        if (cell && cell.kind !== 'void') {
          console.warn(`[LevelDesign] Moving platform '${actor.id || 'unknown'}' path point (${pt.x},${pt.y}) overlaps terrain tile  -  platform may clip through geometry.`);
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
        return baseHeight; // base case  -  actual funnel height computed in getSurfaceSampleForCell
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
      // center dips DOWN by 'rise' amount.
      // Cubic falloff (1-t)^3 keeps the rim nearly flat so outer tile
      // corners stay within 0.01 of baseHeight  -  preventing visible
      // wall faces between funnel rim tiles and neighbouring track.
      const oneMinusT = 1 - t;
      const z = cell.baseHeight - cell.rise * oneMinusT * oneMinusT * oneMinusT;
      // Gradient: derivative of cubic bowl is 3·rise·(1-t)²/maxDist
      const gradMag = (dist > 0.001) ? (3 * cell.rise * oneMinusT * oneMinusT / maxDist) : 0;
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
  // is near the platform edge. The old 0.15 tolerance was too tight  -  many of
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

  // Direct center-point actor surface check  -  used by the physics engine's
  // platform sweep pass. Unlike sampleActorSurface (which is called from the
  // multi-sample spread), this checks only the marble center XY against the
  // platform rect with a very generous tolerance. Returns the highest platform
  // surface below the given maxZ, or null if none found.
  function sampleActorSurfaceDirect(level, runtime, x, y, maxZ) {
    if (!runtime?.actors) return null;
    let best = null;
    const TOL = 0.45; // generous  -  marble center must be within 0.45 tiles of platform edge
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

  // Reusable blocker surface object  -  avoids allocation per sampleWalkableSurface call
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
// Reusable result object  -  only one caller reads it at a time
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

  // Sample all 17 points  -  store sample and its weight in parallel buffers
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

    // Place funnel tiles using FUNNEL shape  -  fill the entire square area
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

    // Place entry center tile (flat, at bottom of bowl  -  this is where the trigger goes)
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
  // META-GAME LEVELS (6 stages)
  // Placeholder builders - will be replaced by CSV-imported layouts.
  // Each returns a minimal valid level so the game can load without errors.
  // ═══════════════════════════════════════════════════════════════════════════

  /** Level 1: The Mountain - CSV-imported layout */
  function buildLevel1() {
    const level = createLevelShell({
      id: 'level_1',
      name: 'The Mountain',
      width: 200,
      height: 200,
      killZ: -5,
      voidFloor: -10,
      start: { x: 121.5, y: 188.5 },
      reward: { type: 'unlock_next' },
      timeLimit: 60
    });

    // --- Flat track surfaces ---
    // z=0.0 (141 tiles, 17 rects)
    fillSurfaceRect(level, 115, 184, 4, 5, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 115, 189, 2, 6, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 118, 182, 7, 1, { baseHeight: 0.0, shape: 'flat' });
    setSurface(level, 118, 183, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 119, 181, 5, 1, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 119, 187, 9, 2, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 180, 3, 1, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 183, 3, 1, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 185, 3, 2, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 189, 3, 2, { baseHeight: 0.0, shape: 'flat' });
    setSurface(level, 121, 179, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 124, 183, 1, 4, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 125, 184, 3, 3, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 126, 189, 2, 6, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 162, 71, 5, 1, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 162, 73, 5, 5, { baseHeight: 0.0, shape: 'flat' });
    fillSurfaceRect(level, 163, 72, 4, 1, { baseHeight: 0.0, shape: 'flat' });
    // z=1.0
    fillSurfaceRect(level, 116, 179, 2, 2, { baseHeight: 1.0, shape: 'flat' });
    fillSurfaceRect(level, 125, 179, 2, 2, { baseHeight: 1.0, shape: 'flat' });
    // z=2.0
    fillSurfaceRect(level, 117, 175, 1, 2, { baseHeight: 2.0, shape: 'flat' });
    fillSurfaceRect(level, 125, 175, 1, 2, { baseHeight: 2.0, shape: 'flat' });
    // z=3.0
    fillSurfaceRect(level, 120, 173, 3, 4, { baseHeight: 3.0, shape: 'flat' });
    // z=4.0
    fillSurfaceRect(level, 116, 173, 2, 2, { baseHeight: 4.0, shape: 'flat' });
    fillSurfaceRect(level, 125, 173, 2, 2, { baseHeight: 4.0, shape: 'flat' });
    // z=6.0
    fillSurfaceRect(level, 116, 165, 3, 4, { baseHeight: 6.0, shape: 'flat' });
    fillSurfaceRect(level, 118, 160, 7, 2, { baseHeight: 6.0, shape: 'flat' });
    fillSurfaceRect(level, 118, 162, 1, 3, { baseHeight: 6.0, shape: 'flat' });
    fillSurfaceRect(level, 119, 167, 8, 2, { baseHeight: 6.0, shape: 'flat' });
    fillSurfaceRect(level, 124, 162, 1, 5, { baseHeight: 6.0, shape: 'flat' });
    fillSurfaceRect(level, 125, 165, 2, 2, { baseHeight: 6.0, shape: 'flat' });
    // z=8.0 (main plateau)
    fillSurfaceRect(level, 111, 113, 21, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 111, 116, 3, 18, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 111, 137, 9, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 111, 140, 3, 13, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 114, 131, 6, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 114, 150, 18, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 117, 119, 15, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 117, 122, 3, 6, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 117, 134, 3, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 117, 153, 9, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 110, 3, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 125, 6, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 123, 128, 3, 12, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 126, 137, 6, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 129, 116, 3, 3, { baseHeight: 8.0, shape: 'flat' });
    fillSurfaceRect(level, 129, 140, 3, 10, { baseHeight: 8.0, shape: 'flat' });
    // z=10.0 (upper paths)
    fillSurfaceRect(level, 117, 69, 1, 44, { baseHeight: 10.0, shape: 'flat' });
    fillSurfaceRect(level, 118, 71, 1, 42, { baseHeight: 10.0, shape: 'flat' });
    fillSurfaceRect(level, 128, 91, 2, 22, { baseHeight: 10.0, shape: 'flat' });
    fillSurfaceRect(level, 129, 89, 1, 2, { baseHeight: 10.0, shape: 'flat' });
    // z=12.0 (switchback path)
    fillSurfaceRect(level, 113, 57, 3, 4, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 114, 61, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 115, 63, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 116, 65, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 117, 67, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 118, 69, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 119, 71, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 73, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 101, 3, 4, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 105, 1, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 121, 75, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 121, 99, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 122, 77, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 122, 97, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 122, 105, 1, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 123, 79, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 123, 95, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 124, 81, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 124, 93, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 125, 83, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 125, 91, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 126, 85, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 126, 89, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    fillSurfaceRect(level, 127, 87, 3, 2, { baseHeight: 12.0, shape: 'flat' });
    // z=15.0 (summit area)
    fillSurfaceRect(level, 113, 37, 13, 5, { baseHeight: 15.0, shape: 'flat' });
    fillSurfaceRect(level, 113, 42, 2, 12, { baseHeight: 15.0, shape: 'flat' });
    fillSurfaceRect(level, 115, 47, 6, 7, { baseHeight: 15.0, shape: 'flat' });
    fillSurfaceRect(level, 120, 42, 6, 5, { baseHeight: 15.0, shape: 'flat' });
    fillSurfaceRect(level, 121, 52, 5, 2, { baseHeight: 15.0, shape: 'flat' });
    // z=16.0 (peak / secret tunnel entrance)
    fillSurfaceRect(level, 131, 36, 1, 5, { baseHeight: 16.0, shape: 'flat' });
    fillSurfaceRect(level, 132, 37, 2, 1, { baseHeight: 16.0, shape: 'flat' });
    fillSurfaceRect(level, 132, 39, 2, 1, { baseHeight: 16.0, shape: 'flat' });
    fillSurfaceRect(level, 133, 38, 5, 1, { baseHeight: 16.0, shape: 'flat' });

    // --- Ramp surfaces ---
    // Base ramps (z=0.25 to z=1.0, north-facing)
    setSurface(level, 116, 183, { baseHeight: 0.25, shape: 'slope_n', rise: 0.25 });
    setSurface(level, 126, 183, { baseHeight: 0.25, shape: 'slope_n', rise: 0.25 });
    setSurface(level, 116, 182, { baseHeight: 0.5, shape: 'slope_n', rise: 0.25 });
    setSurface(level, 126, 182, { baseHeight: 0.5, shape: 'slope_n', rise: 0.25 });
    setSurface(level, 116, 181, { baseHeight: 0.75, shape: 'slope_n', rise: 0.25 });
    setSurface(level, 126, 181, { baseHeight: 0.75, shape: 'slope_n', rise: 0.25 });
    // Lower switchback ramps (z=1.5 to z=4.0)
    setSurface(level, 117, 178, { baseHeight: 1.5, shape: 'slope_n', rise: 0.5 });
    setSurface(level, 125, 178, { baseHeight: 1.5, shape: 'slope_n', rise: 0.5 });
    setSurface(level, 117, 177, { baseHeight: 2.0, shape: 'slope_n', rise: 0.5 });
    setSurface(level, 125, 177, { baseHeight: 2.0, shape: 'slope_n', rise: 0.5 });
    setSurface(level, 118, 176, { baseHeight: 2.5, shape: 'slope_e', rise: 0.5 });
    setSurface(level, 118, 175, { baseHeight: 2.5, shape: 'slope_n', rise: 1.5 });
    setSurface(level, 124, 175, { baseHeight: 2.5, shape: 'slope_n', rise: 1.5 });
    setSurface(level, 124, 176, { baseHeight: 2.5, shape: 'slope_w', rise: 0.5 });
    setSurface(level, 119, 176, { baseHeight: 3.0, shape: 'slope_e', rise: 0.5 });
    setSurface(level, 119, 175, { baseHeight: 3.0, shape: 'slope_n', rise: 0.5 });
    setSurface(level, 123, 175, { baseHeight: 3.0, shape: 'slope_n', rise: 0.5 });
    setSurface(level, 123, 176, { baseHeight: 3.0, shape: 'slope_w', rise: 0.5 });
    fillSurfaceRect(level, 123, 173, 1, 2, { baseHeight: 3.5, shape: 'slope_e', rise: 0.5 });
    fillSurfaceRect(level, 119, 173, 1, 2, { baseHeight: 3.5, shape: 'slope_w', rise: 0.5 });
    setSurface(level, 124, 173, { baseHeight: 4.0, shape: 'slope_e', rise: 0.5 });
    setSurface(level, 118, 174, { baseHeight: 4.0, shape: 'slope_n', rise: 0.5 });
    setSurface(level, 124, 174, { baseHeight: 4.0, shape: 'slope_n', rise: 0.5 });
    setSurface(level, 118, 173, { baseHeight: 4.0, shape: 'slope_w', rise: 0.5 });
    // Mid-mountain ramps (z=4.5 to z=8.0)
    fillSurfaceRect(level, 116, 172, 2, 1, { baseHeight: 4.5, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 125, 172, 2, 1, { baseHeight: 4.5, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 116, 171, 2, 1, { baseHeight: 5.0, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 125, 171, 2, 1, { baseHeight: 5.0, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 116, 170, 2, 1, { baseHeight: 5.5, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 125, 170, 2, 1, { baseHeight: 5.5, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 116, 169, 2, 1, { baseHeight: 6.0, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 125, 169, 2, 1, { baseHeight: 6.0, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 120, 159, 3, 1, { baseHeight: 6.5, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 120, 158, 3, 1, { baseHeight: 7.0, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 120, 157, 3, 1, { baseHeight: 7.5, shape: 'slope_n', rise: 0.5 });
    fillSurfaceRect(level, 120, 156, 3, 1, { baseHeight: 8.0, shape: 'slope_n', rise: 0.5 });
    // Summit approach ramps (z=13.0 to z=16.0)
    fillSurfaceRect(level, 113, 56, 3, 1, { baseHeight: 13.0, shape: 'slope_n', rise: 1.0 });
    fillSurfaceRect(level, 113, 55, 3, 1, { baseHeight: 14.0, shape: 'slope_n', rise: 1.0 });
    fillSurfaceRect(level, 113, 54, 3, 1, { baseHeight: 15.0, shape: 'slope_n', rise: 0.5 });
    // East bridge ramps to peak
    fillSurfaceRect(level, 126, 37, 1, 3, { baseHeight: 15.5, shape: 'slope_e', rise: 0.5 });
    fillSurfaceRect(level, 127, 37, 1, 3, { baseHeight: 16.0, shape: 'slope_e', rise: 1.0 });
    fillSurfaceRect(level, 128, 37, 1, 3, { baseHeight: 17.0, shape: 'slope_e', rise: 2.0 });
    fillSurfaceRect(level, 129, 37, 1, 3, { baseHeight: 19.0, shape: 'slope_e', rise: 2.0 });

    // --- Funnel 1: tunnel_2 entrance (center 117.5, 44.5) ---
    setSurface(level, 115, 42, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 116, 42, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 115, 43, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 117, 42, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 116, 43, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 115, 44, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 118, 42, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 117, 43, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 116, 44, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 115, 45, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 42, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 118, 43, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 116, 45, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 115, 46, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 43, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 118, 44, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 117, 45, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 116, 46, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 44, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 118, 45, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 117, 46, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 45, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 118, 46, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 46, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 117.5, funnelCenterY: 44.5, funnelMaxDist: 2.5 });

    // --- Funnel 2: tunnel_3 entrance (center 123.5, 49.5) ---
    setSurface(level, 121, 47, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 47, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 121, 48, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 47, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 48, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 121, 49, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 124, 47, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 48, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 49, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 121, 50, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 125, 47, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 124, 48, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 50, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 121, 51, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 125, 48, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 124, 49, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 50, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 51, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 125, 49, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 124, 50, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 51, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 125, 50, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 124, 51, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });
    setSurface(level, 125, 51, { baseHeight: 15.0, shape: 'funnel', rise: 1.0, funnelCenterX: 123.5, funnelCenterY: 49.5, funnelMaxDist: 2.5 });

    // --- Funnel 3: tunnel_1 entrance (center 121.5, 164.5) ---
    setSurface(level, 119, 162, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 120, 162, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 163, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 121, 162, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 120, 163, { baseHeight: 5.5, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 164, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 162, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 121, 163, { baseHeight: 5.5, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 120, 164, { baseHeight: 5.5, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 165, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 162, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 163, { baseHeight: 5.5, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 120, 165, { baseHeight: 5.5, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 119, 166, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 163, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 164, { baseHeight: 5.5, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 121, 165, { baseHeight: 5.5, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 120, 166, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 164, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 165, { baseHeight: 5.5, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 121, 166, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 165, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 122, 166, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });
    setSurface(level, 123, 166, { baseHeight: 6.0, shape: 'funnel', rise: 0.5, funnelCenterX: 121.5, funnelCenterY: 164.5, funnelMaxDist: 2.5 });

    // --- Elevator platform ---
    // 3x3 platform cycling z=8 to z=12
    fillSurfaceRect(level, 120, 107, 3, 3, { baseHeight: 8.0, shape: 'flat' });
    addActor(level, {
      id: 'elevator_1',
      kind: 'elevator',
      x: 121.5, y: 108.5, z: 8.0,
      width: 3, height: 3,
      travel: { axis: 'z', min: 8.0, max: 12.0, speed: 2 }
    });

    // --- Tunnels ---
    // Secret tunnel (hidden - leads to secret area)
    placeTunnel(level, {
      id: 'secret_tunnel',
      path: [
        { x: 132.5, y: 38.5, z: 16.0 },
        { x: 147.5, y: 55.5, z: 8.0 },
        { x: 162.5, y: 72.5, z: 0.0 }
      ],
      speed: 10,
      hidden: true,
      funnelRadius: 1
    });
    // Tunnel 1: mid-mountain shortcut down
    placeTunnel(level, {
      id: 'tunnel_1',
      path: [
        { x: 121.5, y: 164.5, z: 5.0 },
        { x: 121.5, y: 174.5, z: 2.5 },
        { x: 121.5, y: 184.5, z: 0.0 }
      ],
      speed: 8,
      funnelRadius: 2
    });
    // Tunnel 2: summit to base (long drop)
    placeTunnel(level, {
      id: 'tunnel_2',
      path: [
        { x: 117.5, y: 44.5, z: 14.0 },
        { x: 120.0, y: 114.5, z: 7.0 },
        { x: 122.5, y: 184.5, z: 0.0 }
      ],
      speed: 8,
      funnelRadius: 2
    });
    // Tunnel 3: summit to base (alternate path)
    placeTunnel(level, {
      id: 'tunnel_3',
      path: [
        { x: 123.5, y: 49.5, z: 14.0 },
        { x: 122.0, y: 117.0, z: 7.0 },
        { x: 120.5, y: 184.5, z: 0.0 }
      ],
      speed: 8,
      funnelRadius: 2
    });

    // --- Goals ---
    setGoal(level, 137, 38, 0.42);
    // Secret goal - only reachable via hidden tunnel, active when secretRevealed
    setTrigger(level, 164, 74, { kind: 'secret_goal', radius: 0.42 });

    return registerLevel(level);
  }

  /** Stage 2: placeholder. */
  function buildLevel2() {
    const level = createLevelShell({
      id: 'level_2',
      name: 'Level 2',
      width: 30,
      height: 30,
      killZ: -8,
      voidFloor: -5,
      start: { x: 15.5, y: 2.5 },
      timeLimit: 150
    });
    fillSurfaceRect(level, 0, 0, 30, 30, { baseHeight: 0, shape: SHAPES.FLAT });
    setGoal(level, 15.5, 27.5);
    return registerLevel(level);
  }

  /** Stage 3: placeholder. */
  function buildLevel3() {
    const level = createLevelShell({
      id: 'level_3',
      name: 'Level 3',
      width: 30,
      height: 30,
      killZ: -8,
      voidFloor: -5,
      start: { x: 15.5, y: 2.5 },
      timeLimit: 180
    });
    fillSurfaceRect(level, 0, 0, 30, 30, { baseHeight: 0, shape: SHAPES.FLAT });
    setGoal(level, 15.5, 27.5);
    return registerLevel(level);
  }

  /** Stage 4: placeholder. */
  function buildLevel4() {
    const level = createLevelShell({
      id: 'level_4',
      name: 'Level 4',
      width: 30,
      height: 30,
      killZ: -8,
      voidFloor: -5,
      start: { x: 15.5, y: 2.5 },
      timeLimit: 180
    });
    fillSurfaceRect(level, 0, 0, 30, 30, { baseHeight: 0, shape: SHAPES.FLAT });
    setGoal(level, 15.5, 27.5);
    return registerLevel(level);
  }

  /** Stage 5: placeholder. */
  function buildLevel5() {
    const level = createLevelShell({
      id: 'level_5',
      name: 'Level 5',
      width: 30,
      height: 30,
      killZ: -8,
      voidFloor: -5,
      start: { x: 15.5, y: 2.5 },
      timeLimit: 210
    });
    fillSurfaceRect(level, 0, 0, 30, 30, { baseHeight: 0, shape: SHAPES.FLAT });
    setGoal(level, 15.5, 27.5);
    return registerLevel(level);
  }

  /** Stage 6: placeholder. */
  function buildLevel6() {
    const level = createLevelShell({
      id: 'level_6',
      name: 'Level 6',
      width: 30,
      height: 30,
      killZ: -8,
      voidFloor: -5,
      start: { x: 15.5, y: 2.5 },
      timeLimit: 240
    });
    fillSurfaceRect(level, 0, 0, 30, 30, { baseHeight: 0, shape: SHAPES.FLAT });
    setGoal(level, 15.5, 27.5);
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
    { id: 'level_1', name: 'Level 1', builder: buildLevel1 },
    { id: 'level_2', name: 'Level 2', builder: buildLevel2 },
    { id: 'level_3', name: 'Level 3', builder: buildLevel3 },
    { id: 'level_4', name: 'Level 4', builder: buildLevel4 },
    { id: 'level_5', name: 'Level 5', builder: buildLevel5 },
    { id: 'level_6', name: 'Level 6', builder: buildLevel6 }
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
  // All 6 level IDs that must be cleared to reveal the secret tunnel
  var SECRET_LEVEL_IDS = [
    'level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6'
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
