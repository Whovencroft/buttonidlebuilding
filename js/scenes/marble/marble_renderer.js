(() => {
  const SURFACE_SAMPLE_EPSILON = 0.0001;
  const HEIGHT_AXIS_SCREEN_X_FACTOR = 0.32;
  const TILE_DRAW_ORDER_CACHE = new WeakMap();
  const HEIGHT_CUE_THRESHOLD = 0.35;

  const ABOVE_TINT_BASE = 'rgba(250, 204, 21, ';
  const BELOW_TINT_BASE = 'rgba(96, 165, 250, ';

  const AIRBORNE_RENDER_LIFT_FACTOR = 0.18;
  const AIRBORNE_RENDER_LIFT_MAX = 0.22;

  const SHADOW_MODE = 'under'; // 'under' or 'light'
  const SHADOW_LIGHT_DIR = { x: 0.82, y: 0.57 };
  const SHADOW_OFFSET_FACTOR = 0.34;

  const ACTOR_THICKNESS = 0.06;
  const SIDE_FACE_Z_EPSILON = 0.04;
  const TOP_FACE_Z_EPSILON = 0.02;
  const FACE_PLANE_EPSILON = 0.02;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function fitCanvasToDisplay(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {
      ctx,
      dpr,
      cssWidth: Math.max(1, rect.width),
      cssHeight: Math.max(1, rect.height)
    };
  }

  function getVisualSupportZ(runtime, x, y, radius, fallbackZ) {
    const offsets = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
    for (const [ox, oy] of offsets) {
      const sample = window.MarbleLevels.sampleVisualSurface(runtime.level, x + ox, y + oy, runtime.dynamicState);
      if (sample) return sample.z;
    }
    return fallbackZ;
  }

  function getCameraFocusZ(runtime) {
    const marble = runtime.marble;
    const supportZ = getVisualSupportZ(
      runtime,
      marble.x,
      marble.y,
      marble.supportRadius,
      runtime.level.voidFloor ?? -1.5
    );

    const depthBelowSupport = Math.max(0, supportZ - marble.z);
    return marble.grounded
      ? marble.z
      : marble.z + Math.min(depthBelowSupport * AIRBORNE_RENDER_LIFT_FACTOR, AIRBORNE_RENDER_LIFT_MAX);
  }

  function getMarbleCoverZ(runtime) {
    return getCameraFocusZ(runtime);
  }

  function createView(runtime, cssWidth, cssHeight) {
    const base = Math.min(cssWidth, cssHeight);
    const tileW = Math.max(54, Math.min(110, Math.min(cssWidth / 10.5, cssHeight / 6.8, base / 5.8)));
    const tileH = tileW * 0.5;
    const heightScale = tileH * 0.92;

    return {
      camX: runtime.camera?.x ?? runtime.marble.x,
      camY: runtime.camera?.y ?? runtime.marble.y,
      camZ: getCameraFocusZ(runtime),
      tileW,
      tileH,
      heightScale,
      screenCx: cssWidth * 0.5,
      screenCy: cssHeight * 0.5
    };
  }

  function worldProject(x, y, z, view) {
    const zScreenX = z * view.heightScale * HEIGHT_AXIS_SCREEN_X_FACTOR;
    return {
      x: (x - y) * (view.tileW * 0.5) + zScreenX,
      y: (x + y) * (view.tileH * 0.5) - z * view.heightScale
    };
  }

  function project(x, y, z, view) {
    const p = worldProject(x, y, z, view);
    const cam = worldProject(view.camX, view.camY, view.camZ ?? 0, view);
    return {
      x: view.screenCx + p.x - cam.x,
      y: view.screenCy + p.y - cam.y
    };
  }

  function beginPoly(ctx, points) {
    if (!points?.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
  }

  function darken(hex, amount = 0.8) {
    const raw = hex.replace('#', '');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgb(${Math.round(r * amount)}, ${Math.round(g * amount)}, ${Math.round(b * amount)})`;
  }

  function getCueAlpha(diff) {
    return Math.min(0.22, 0.07 + Math.abs(diff) * 0.04);
  }

  function renderRelativeHeightCue(ctx, points, featureZ, playerReferenceZ) {
    const diff = featureZ - playerReferenceZ;
    if (Math.abs(diff) < HEIGHT_CUE_THRESHOLD) return;

    ctx.save();
    beginPoly(ctx, points);

    if (diff > 0) {
      ctx.fillStyle = `${ABOVE_TINT_BASE}${getCueAlpha(diff)})`;
    } else {
      ctx.fillStyle = `${BELOW_TINT_BASE}${getCueAlpha(diff)})`;
    }

    ctx.fill();
    ctx.restore();
  }

  function renderBackground(ctx, cssWidth, cssHeight) {
    const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
    gradient.addColorStop(0, '#0b1323');
    gradient.addColorStop(1, '#04070e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.save();
    ctx.globalAlpha = 0.16;

    const glowA = ctx.createRadialGradient(
      cssWidth * 0.24,
      cssHeight * 0.2,
      10,
      cssWidth * 0.24,
      cssHeight * 0.2,
      cssWidth * 0.3
    );
    glowA.addColorStop(0, 'rgba(125,211,252,0.42)');
    glowA.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const glowB = ctx.createRadialGradient(
      cssWidth * 0.78,
      cssHeight * 0.74,
      10,
      cssWidth * 0.78,
      cssHeight * 0.74,
      cssWidth * 0.25
    );
    glowB.addColorStop(0, 'rgba(192,132,252,0.32)');
    glowB.addColorStop(1, 'rgba(192,132,252,0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.restore();
  }

  function getSurfaceBaseColor(cell, trigger) {
    if (!cell || cell.kind === 'void') return '#374151';
    if (trigger?.kind === 'goal') return '#22c55e';
    if (trigger?.kind === 'hazard') return '#ef4444';
    if (cell.landingPad) return '#16a34a';
    if (cell.bounce > 0) return '#38bdf8';
    if (cell.conveyor) return '#0891b2';
    if (cell.crumble) return '#d97706';
    if (cell.friction < 0.8) return '#60a5fa';
    if (cell.friction > 1.15) return '#8b5cf6';
    if (cell.failType) return '#dc2626';
    return '#94a3b8';
  }

  function getActorColor(actor) {
    switch (actor.kind) {
      case window.MarbleLevels.ACTOR_KINDS.MOVING_PLATFORM:
        return '#64748b';
      case window.MarbleLevels.ACTOR_KINDS.ELEVATOR:
        return '#475569';
      case window.MarbleLevels.ACTOR_KINDS.TIMED_GATE:
        return '#7c2d12';
      case window.MarbleLevels.ACTOR_KINDS.ROTATING_BAR:
      case window.MarbleLevels.ACTOR_KINDS.SWEEPER:
        return '#ef4444';
      default:
        return '#64748b';
    }
  }

  function getShapeSamplePoints(cell, segments = 10) {
    const points = [];
    const S = window.MarbleLevels.SHAPES;
    if (!cell) return points;

    if (cell.shape === S.CURVE_CONVEX_NE) {
      points.push([0, 0], [1, 0]);
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        points.push([1 - Math.cos(angle) * 0.48, Math.sin(angle) * 0.48]);
      }
      points.push([0, 1]);
      return points;
    }

    if (cell.shape === S.CURVE_CONVEX_NW) {
      const curve = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        curve.push([Math.sin(angle) * 0.48, Math.cos(angle) * 0.48]);
      }
      return [[1, 0], ...curve, [1, 1], [0, 1], [0, 0]];
    }

    if (cell.shape === S.CURVE_CONVEX_SE) {
      const curve = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        curve.push([1 - Math.cos(angle) * 0.48, 1 - Math.sin(angle) * 0.48]);
      }
      return [[0, 0], [1, 0], [1, 1], ...curve.reverse(), [0, 1]];
    }

    if (cell.shape === S.CURVE_CONVEX_SW) {
      const curve = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        curve.push([Math.sin(angle) * 0.48, 1 - Math.cos(angle) * 0.48]);
      }
      return [[0, 0], [1, 0], [1, 1], [0, 1], ...curve.reverse()];
    }

    if (cell.shape === S.CURVE_CONCAVE_NE) {
      const result = [[0, 0], [1, 0]];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (1 - i / segments);
        result.push([1 - Math.cos(angle) * 0.8, Math.sin(angle) * 0.8]);
      }
      result.push([0, 1]);
      return result;
    }

    if (cell.shape === S.CURVE_CONCAVE_NW) {
      const result = [[1, 0], [1, 1]];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        result.push([Math.sin(angle) * 0.8, Math.cos(angle) * 0.8]);
      }
      result.push([0, 0]);
      return result;
    }

    if (cell.shape === S.CURVE_CONCAVE_SE) {
      const result = [[0, 0], [1, 0], [1, 1]];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (1 - i / segments);
        result.push([1 - Math.cos(angle) * 0.8, 1 - Math.sin(angle) * 0.8]);
      }
      result.push([0, 1]);
      return result;
    }

    if (cell.shape === S.CURVE_CONCAVE_SW) {
      const result = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        result.push([Math.sin(angle) * 0.8, 1 - Math.cos(angle) * 0.8]);
      }
      return result;
    }

    return [[0, 0], [1, 0], [1, 1], [0, 1]];
  }

  function sampleLocalTilePoint(level, runtime, tx, ty, u, v) {
    const localU = clamp(u, SURFACE_SAMPLE_EPSILON, 1 - SURFACE_SAMPLE_EPSILON);
    const localV = clamp(v, SURFACE_SAMPLE_EPSILON, 1 - SURFACE_SAMPLE_EPSILON);
    const sample = window.MarbleLevels.sampleWalkableSurface(level, tx + localU, ty + localV, {
      runtime: runtime.dynamicState
    });

    if (!sample || sample.source !== 'surface' || sample.tx !== tx || sample.ty !== ty) {
      return null;
    }

    return sample;
  }

  function buildSurfaceTopPolygon(level, runtime, tx, ty, view) {
    const cell = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!cell || cell.kind === 'void') return null;

    const points = [];
    for (const [u, v] of getShapeSamplePoints(cell, 12)) {
      const sample = sampleLocalTilePoint(level, runtime, tx, ty, u, v);
      if (!sample) continue;
      points.push(project(tx + u, ty + v, sample.z, view));
    }

    return points.length >= 3 ? points : null;
  }

  function getTileDrawOrder(level) {
    const cached = TILE_DRAW_ORDER_CACHE.get(level);
    if (cached) return cached;

    const tiles = [];
    for (let ty = 0; ty < level.height; ty += 1) {
      for (let tx = 0; tx < level.width; tx += 1) {
        tiles.push({ tx, ty, depth: tx + ty });
      }
    }

    tiles.sort((a, b) => a.depth - b.depth || a.ty - b.ty || a.tx - b.tx);
    TILE_DRAW_ORDER_CACHE.set(level, tiles);
    return tiles;
  }

  function getPlayerReferenceZ(runtime) {
    return getVisualSupportZ(
      runtime,
      runtime.marble.x,
      runtime.marble.y,
      runtime.marble.supportRadius,
      runtime.marble.z - runtime.marble.collisionRadius
    );
  }

function addNeighborBlockerCoverFaces(runtime, marble, marbleCoverZ, plan, tx, ty) {
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const nx = tx + ox;
      const ny = ty + oy;
      const blocker = window.MarbleLevels.getBlockerCell(runtime.level, nx, ny);
      if (!blocker) continue;

      const key = tileKey(nx, ny);
      const topZ = blocker.top;
      if (topZ <= marbleCoverZ + SIDE_FACE_Z_EPSILON) continue;

      const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, nx, ny + 1, {
        runtime: runtime.dynamicState
      });
      const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, nx + 1, ny, {
        runtime: runtime.dynamicState
      });

      const overlapsFootprint =
        marbleOverlapsXSpan(marble.x, marble.collisionRadius, nx, nx + 1) &&
        marbleOverlapsYSpan(marble.y, marble.collisionRadius, ny, ny + 1);

      if (!overlapsFootprint) continue;

      if (topZ > southFill + 0.01) plan.blockerSouth.add(key);
      if (topZ > eastFill + 0.01) plan.blockerEast.add(key);
      if (marbleUnderTop(marble, nx, ny, nx + 1, ny + 1, topZ, marbleCoverZ)) {
        plan.blockerTop.add(key);
      }
    }
  }
}

  function tileKey(tx, ty) {
    return `${tx},${ty}`;
  }

  function marbleOverlapsXSpan(marbleX, marbleRadius, minX, maxX) {
    return (marbleX + marbleRadius) > minX && (marbleX - marbleRadius) < maxX;
  }

  function marbleOverlapsYSpan(marbleY, marbleRadius, minY, maxY) {
    return (marbleY + marbleRadius) > minY && (marbleY - marbleRadius) < maxY;
  }

  function marbleBehindSouthFace(marble, minX, maxX, faceY) {
    if (!marbleOverlapsXSpan(marble.x, marble.collisionRadius, minX, maxX)) return false;
    return marble.y < faceY - FACE_PLANE_EPSILON;
  }

  function marbleBehindEastFace(marble, minY, maxY, faceX) {
    if (!marbleOverlapsYSpan(marble.y, marble.collisionRadius, minY, maxY)) return false;
    return marble.x < faceX - FACE_PLANE_EPSILON;
  }

  function marbleUnderTop(marble, minX, minY, maxX, maxY, topZ, coverZ) {
    if (topZ <= coverZ + TOP_FACE_Z_EPSILON) return false;
    return (
      marbleOverlapsXSpan(marble.x, marble.collisionRadius, minX, maxX) &&
      marbleOverlapsYSpan(marble.y, marble.collisionRadius, minY, maxY)
    );
  }

function getPolygonMaxY(points) {
  let maxY = -Infinity;
  for (const point of points || []) {
    if (point.y > maxY) maxY = point.y;
  }
  return maxY;
}

function getSurfaceTileDepthY(runtime, tx, ty, view) {
  const cell = window.MarbleLevels.getSurfaceCell(runtime.level, tx, ty);
  if (!cell || cell.kind === 'void') return -Infinity;

  const top = buildSurfaceTopPolygon(runtime.level, runtime, tx, ty, view);
  if (!top) return -Infinity;

  let maxY = getPolygonMaxY(top);

  const fillTop = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty, {
    runtime: runtime.dynamicState
  });
  const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, {
    runtime: runtime.dynamicState
  });
  const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, {
    runtime: runtime.dynamicState
  });

  if (fillTop > southFill + 0.01) {
    maxY = Math.max(maxY, getPolygonMaxY([
      project(tx, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, southFill, view),
      project(tx, ty + 1, southFill, view)
    ]));
  }

  if (fillTop > eastFill + 0.01) {
    maxY = Math.max(maxY, getPolygonMaxY([
      project(tx + 1, ty, fillTop, view),
      project(tx + 1, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, eastFill, view),
      project(tx + 1, ty, eastFill, view)
    ]));
  }

  return maxY;
}

function getBlockerTileDepthY(runtime, tx, ty, view) {
  const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
  if (!blocker) return -Infinity;

  let maxY = getPolygonMaxY([
    project(tx, ty, blocker.top, view),
    project(tx + 1, ty, blocker.top, view),
    project(tx + 1, ty + 1, blocker.top, view),
    project(tx, ty + 1, blocker.top, view)
  ]);

  const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, {
    runtime: runtime.dynamicState
  });
  const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, {
    runtime: runtime.dynamicState
  });

  if (blocker.top > southFill + 0.01) {
    maxY = Math.max(maxY, getPolygonMaxY([
      project(tx, ty + 1, blocker.top, view),
      project(tx + 1, ty + 1, blocker.top, view),
      project(tx + 1, ty + 1, southFill, view),
      project(tx, ty + 1, southFill, view)
    ]));
  }

  if (blocker.top > eastFill + 0.01) {
    maxY = Math.max(maxY, getPolygonMaxY([
      project(tx + 1, ty, blocker.top, view),
      project(tx + 1, ty + 1, blocker.top, view),
      project(tx + 1, ty + 1, eastFill, view),
      project(tx + 1, ty, eastFill, view)
    ]));
  }

  return maxY;
}

function getActorDepthY(actor, actorState, view) {
  const topZ = actorTopZ(actor, actorState);
  const baseZ = actorBaseZ(actor, actorState);

  let maxY = getPolygonMaxY([
    project(actorState.x, actorState.y, topZ, view),
    project(actorState.x + actor.width, actorState.y, topZ, view),
    project(actorState.x + actor.width, actorState.y + actor.height, topZ, view),
    project(actorState.x, actorState.y + actor.height, topZ, view)
  ]);

  if (
    actor.kind === window.MarbleLevels.ACTOR_KINDS.MOVING_PLATFORM ||
    actor.kind === window.MarbleLevels.ACTOR_KINDS.ELEVATOR ||
    actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE
  ) {
    maxY = Math.max(maxY, getPolygonMaxY([
      project(actorState.x, actorState.y + actor.height, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, baseZ, view),
      project(actorState.x, actorState.y + actor.height, baseZ, view)
    ]));

    maxY = Math.max(maxY, getPolygonMaxY([
      project(actorState.x + actor.width, actorState.y, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, baseZ, view),
      project(actorState.x + actor.width, actorState.y, baseZ, view)
    ]));
  }

  return maxY;
}

function buildDeferredCoverPlan(runtime) {
  const marble = runtime.marble;
  const marbleCoverZ = getMarbleCoverZ(runtime);
  const plan = {
    surfaceSouth: new Set(),
    surfaceEast: new Set(),
    surfaceTop: new Set(),
    blockerSouth: new Set(),
    blockerEast: new Set(),
    blockerTop: new Set(),
    actorSouth: new Set(),
    actorEast: new Set(),
    actorTop: new Set()
  };

  const tiles = getTileDrawOrder(runtime.level);

  for (const { tx, ty } of tiles) {
    const key = tileKey(tx, ty);

    const surface = window.MarbleLevels.getSurfaceCell(runtime.level, tx, ty);
    if (surface && surface.kind !== 'void') {
      const topZ = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty, {
        runtime: runtime.dynamicState
      });
      const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, {
        runtime: runtime.dynamicState
      });
      const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, {
        runtime: runtime.dynamicState
      });

      const behindSouth =
        topZ > southFill + 0.01 &&
        topZ > marbleCoverZ + SIDE_FACE_Z_EPSILON &&
        marbleBehindSouthFace(marble, tx, tx + 1, ty + 1);

      const behindEast =
        topZ > eastFill + 0.01 &&
        topZ > marbleCoverZ + SIDE_FACE_Z_EPSILON &&
        marbleBehindEastFace(marble, ty, ty + 1, tx + 1);

      const underTop =
        marbleUnderTop(marble, tx, ty, tx + 1, ty + 1, topZ, marbleCoverZ);

      if (behindSouth) plan.surfaceSouth.add(key);
      if (behindEast) plan.surfaceEast.add(key);

if (underTop) {
  plan.blockerTop.add(key);
  if (topZ > southFill + 0.01) plan.blockerSouth.add(key);
  if (topZ > eastFill + 0.01) plan.blockerEast.add(key);
}
    }

    const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
    if (blocker) {
      const topZ = blocker.top;
      const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, {
        runtime: runtime.dynamicState
      });
      const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, {
        runtime: runtime.dynamicState
      });

      const behindSouth =
        topZ > southFill + 0.01 &&
        topZ > marbleCoverZ + SIDE_FACE_Z_EPSILON &&
        marbleBehindSouthFace(marble, tx, tx + 1, ty + 1);

      const behindEast =
        topZ > eastFill + 0.01 &&
        topZ > marbleCoverZ + SIDE_FACE_Z_EPSILON &&
        marbleBehindEastFace(marble, ty, ty + 1, tx + 1);

      const underTop =
        marbleUnderTop(marble, tx, ty, tx + 1, ty + 1, topZ, marbleCoverZ);

      if (behindSouth) plan.blockerSouth.add(key);
      if (behindEast) plan.blockerEast.add(key);

      if (underTop) {
        plan.blockerTop.add(key);
        if (topZ > southFill + 0.01) plan.blockerSouth.add(key);
        if (topZ > eastFill + 0.01) plan.blockerEast.add(key);
      }
    }
  }

  for (const actor of runtime.level.actors) {
    const actorState = runtime.dynamicState.actors[actor.id];
    if (!actorState || actorState.active === false) continue;

    if (
      actor.kind === window.MarbleLevels.ACTOR_KINDS.MOVING_PLATFORM ||
      actor.kind === window.MarbleLevels.ACTOR_KINDS.ELEVATOR ||
      actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE
    ) {
      const topZ =
        actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE
          ? actor.topHeight
          : actorState.topHeight;

      const behindSouth =
        topZ > marbleCoverZ + SIDE_FACE_Z_EPSILON &&
        marbleBehindSouthFace(
          marble,
          actorState.x,
          actorState.x + actor.width,
          actorState.y + actor.height
        );

      const behindEast =
        topZ > marbleCoverZ + SIDE_FACE_Z_EPSILON &&
        marbleBehindEastFace(
          marble,
          actorState.y,
          actorState.y + actor.height,
          actorState.x + actor.width
        );

      const underTop =
        marbleUnderTop(
          marble,
          actorState.x,
          actorState.y,
          actorState.x + actor.width,
          actorState.y + actor.height,
          topZ,
          marbleCoverZ
        );

      if (behindSouth) plan.actorSouth.add(actor.id);
      if (behindEast) plan.actorEast.add(actor.id);

      if (underTop) {
        plan.actorTop.add(actor.id);
        plan.actorSouth.add(actor.id);
        plan.actorEast.add(actor.id);
      }
    }
  }

  return plan;
}

  function renderSurfaceSouthFace(ctx, runtime, tx, ty, view, baseColor) {
    const fillTop = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty, {
      runtime: runtime.dynamicState
    });
    const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, {
      runtime: runtime.dynamicState
    });
    if (fillTop <= southFill + 0.01) return;

    beginPoly(ctx, [
      project(tx, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, southFill, view),
      project(tx, ty + 1, southFill, view)
    ]);
    ctx.fillStyle = darken(baseColor, 0.58);
    ctx.fill();
  }

  function renderSurfaceEastFace(ctx, runtime, tx, ty, view, baseColor) {
    const fillTop = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty, {
      runtime: runtime.dynamicState
    });
    const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, {
      runtime: runtime.dynamicState
    });
    if (fillTop <= eastFill + 0.01) return;

    beginPoly(ctx, [
      project(tx + 1, ty, fillTop, view),
      project(tx + 1, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, eastFill, view),
      project(tx + 1, ty, eastFill, view)
    ]);
    ctx.fillStyle = darken(baseColor, 0.72);
    ctx.fill();
  }

  function renderSurfaceTopFace(ctx, runtime, tx, ty, view, playerReferenceZ, cell, top, baseColor, trigger) {
    const fillTop = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty, {
      runtime: runtime.dynamicState
    });

    beginPoly(ctx, top);
    ctx.fillStyle = baseColor;
    ctx.fill();

    renderRelativeHeightCue(ctx, top, fillTop, playerReferenceZ);

    ctx.strokeStyle = 'rgba(241,245,249,0.16)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    if (trigger?.kind === 'hazard') {
      const center = project(tx + 0.5, ty + 0.5, window.MarbleLevels.getSurfaceTopZ(cell) + 0.02, view);
      ctx.beginPath();
      ctx.moveTo(center.x - 6, center.y - 4);
      ctx.lineTo(center.x + 6, center.y + 4);
      ctx.moveTo(center.x + 6, center.y - 4);
      ctx.lineTo(center.x - 6, center.y + 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    if (cell.conveyor) {
      const center = project(tx + 0.5, ty + 0.5, window.MarbleLevels.getSurfaceTopZ(cell) + 0.02, view);
      const dx = cell.conveyor.x * 8;
      const dy = cell.conveyor.y * 8;
      ctx.beginPath();
      ctx.moveTo(center.x - dx, center.y - dy);
      ctx.lineTo(center.x + dx, center.y + dy);
      ctx.strokeStyle = 'rgba(224,242,254,0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    if (cell.crumble) {
      const center = project(tx + 0.5, ty + 0.5, window.MarbleLevels.getSurfaceTopZ(cell) + 0.02, view);
      ctx.beginPath();
      ctx.moveTo(center.x - 5, center.y - 3);
      ctx.lineTo(center.x + 4, center.y + 1);
      ctx.moveTo(center.x - 2, center.y + 4);
      ctx.lineTo(center.x + 6, center.y - 4);
      ctx.strokeStyle = 'rgba(255,237,213,0.88)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    if (cell.bounce > 0) {
      const center = project(tx + 0.5, ty + 0.5, window.MarbleLevels.getSurfaceTopZ(cell) + 0.03, view);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(186,230,253,0.92)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  function renderSurfaceTile(ctx, runtime, tx, ty, view, playerReferenceZ, deferPlan = null) {
    const cell = window.MarbleLevels.getSurfaceCell(runtime.level, tx, ty);
    if (!cell || cell.kind === 'void') return;

    const top = buildSurfaceTopPolygon(runtime.level, runtime, tx, ty, view);
    if (!top) return;

    const trigger = window.MarbleLevels.getTriggerCell(runtime.level, tx, ty);
    const baseColor = getSurfaceBaseColor(cell, trigger);
    const key = tileKey(tx, ty);

    if (!deferPlan || !deferPlan.surfaceSouth.has(key)) {
      renderSurfaceSouthFace(ctx, runtime, tx, ty, view, baseColor);
    }

    if (!deferPlan || !deferPlan.surfaceEast.has(key)) {
      renderSurfaceEastFace(ctx, runtime, tx, ty, view, baseColor);
    }

    if (!deferPlan || !deferPlan.surfaceTop.has(key)) {
      renderSurfaceTopFace(ctx, runtime, tx, ty, view, playerReferenceZ, cell, top, baseColor, trigger);
    }
  }

  function renderBlockerSouthFace(ctx, runtime, tx, ty, view, baseColor, top) {
    const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, {
      runtime: runtime.dynamicState
    });
    if (top <= southFill + 0.01) return;

    beginPoly(ctx, [
      project(tx, ty + 1, top, view),
      project(tx + 1, ty + 1, top, view),
      project(tx + 1, ty + 1, southFill, view),
      project(tx, ty + 1, southFill, view)
    ]);
    ctx.fillStyle = darken(baseColor, 0.55);
    ctx.fill();
  }

  function renderBlockerEastFace(ctx, runtime, tx, ty, view, baseColor, top) {
    const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, {
      runtime: runtime.dynamicState
    });
    if (top <= eastFill + 0.01) return;

    beginPoly(ctx, [
      project(tx + 1, ty, top, view),
      project(tx + 1, ty + 1, top, view),
      project(tx + 1, ty + 1, eastFill, view),
      project(tx + 1, ty, eastFill, view)
    ]);
    ctx.fillStyle = darken(baseColor, 0.7);
    ctx.fill();
  }

  function renderBlockerTopFace(ctx, tx, ty, top, view, baseColor) {
    beginPoly(ctx, [
      project(tx, ty, top, view),
      project(tx + 1, ty, top, view),
      project(tx + 1, ty + 1, top, view),
      project(tx, ty + 1, top, view)
    ]);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(241,245,249,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function renderBlockerTile(ctx, runtime, tx, ty, view, deferPlan = null) {
    const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
    if (!blocker) return;

    const baseColor = blocker.transparent ? '#64748b' : '#334155';
    const top = blocker.top;
    const key = tileKey(tx, ty);

    if (!deferPlan || !deferPlan.blockerSouth.has(key)) {
      renderBlockerSouthFace(ctx, runtime, tx, ty, view, baseColor, top);
    }

    if (!deferPlan || !deferPlan.blockerEast.has(key)) {
      renderBlockerEastFace(ctx, runtime, tx, ty, view, baseColor, top);
    }

    if (!deferPlan || !deferPlan.blockerTop.has(key)) {
      renderBlockerTopFace(ctx, tx, ty, top, view, baseColor);
    }
  }

  function actorTopZ(actor, actorState) {
    return actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE
      ? actor.topHeight
      : actorState.topHeight;
  }

  function actorBaseZ(actor, actorState) {
    return actorTopZ(actor, actorState) - ACTOR_THICKNESS;
  }

  function renderActorSouthFace(ctx, actor, actorState, view, color) {
    const topZ = actorTopZ(actor, actorState);
    const baseZ = actorBaseZ(actor, actorState);

    beginPoly(ctx, [
      project(actorState.x, actorState.y + actor.height, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, baseZ, view),
      project(actorState.x, actorState.y + actor.height, baseZ, view)
    ]);
    ctx.fillStyle = darken(color, 0.58);
    ctx.fill();
  }

  function renderActorEastFace(ctx, actor, actorState, view, color) {
    const topZ = actorTopZ(actor, actorState);
    const baseZ = actorBaseZ(actor, actorState);

    beginPoly(ctx, [
      project(actorState.x + actor.width, actorState.y, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, baseZ, view),
      project(actorState.x + actor.width, actorState.y, baseZ, view)
    ]);
    ctx.fillStyle = darken(color, 0.72);
    ctx.fill();
  }

  function renderActorTopFace(ctx, actor, actorState, view, playerReferenceZ, color) {
    const topZ = actorTopZ(actor, actorState);
    const top = [
      project(actorState.x, actorState.y, topZ, view),
      project(actorState.x + actor.width, actorState.y, topZ, view),
      project(actorState.x + actor.width, actorState.y + actor.height, topZ, view),
      project(actorState.x, actorState.y + actor.height, topZ, view)
    ];

    beginPoly(ctx, top);
    ctx.fillStyle = color;
    ctx.fill();

    renderRelativeHeightCue(ctx, top, topZ, playerReferenceZ);

    ctx.strokeStyle = actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE
      ? 'rgba(254,215,170,0.4)'
      : 'rgba(241,245,249,0.2)';
    ctx.lineWidth = actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE ? 1 : 1.1;
    ctx.stroke();
  }

  function renderActor(ctx, runtime, actor, view, playerReferenceZ, deferPlan = null) {
    const actorState = runtime.dynamicState.actors[actor.id];
    if (!actorState || actorState.active === false) return;
    const color = getActorColor(actor);

    if (
      actor.kind === window.MarbleLevels.ACTOR_KINDS.MOVING_PLATFORM ||
      actor.kind === window.MarbleLevels.ACTOR_KINDS.ELEVATOR ||
      actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE
    ) {
      if (!deferPlan || !deferPlan.actorSouth.has(actor.id)) {
        renderActorSouthFace(ctx, actor, actorState, view, color);
      }
      if (!deferPlan || !deferPlan.actorEast.has(actor.id)) {
        renderActorEastFace(ctx, actor, actorState, view, color);
      }
      if (!deferPlan || !deferPlan.actorTop.has(actor.id)) {
        renderActorTopFace(ctx, actor, actorState, view, playerReferenceZ, color);
      }
      return;
    }

    const cx = actorState.x + actor.width * 0.5;
    const cy = actorState.y + actor.height * 0.5;
    const ex = cx + Math.cos(actorState.angle) * actor.armLength;
    const ey = cy + Math.sin(actorState.angle) * actor.armLength;
    const center = project(cx, cy, actor.topHeight + 0.1, view);
    const end = project(ex, ey, actor.topHeight + 0.1, view);

    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, actor.armWidth * view.tileW * 0.6);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fecaca';
    ctx.fill();
  }


  function getShadowScreenPosition(baseShadow, heightAboveSurface, view) {
    if (SHADOW_MODE !== 'light' || heightAboveSurface <= 0.0001) {
      return baseShadow;
    }

    const len = Math.hypot(SHADOW_LIGHT_DIR.x, SHADOW_LIGHT_DIR.y) || 1;
    const dirX = SHADOW_LIGHT_DIR.x / len;
    const dirY = SHADOW_LIGHT_DIR.y / len;
    const offset = heightAboveSurface * view.heightScale * SHADOW_OFFSET_FACTOR;

    return {
      x: baseShadow.x + dirX * offset,
      y: baseShadow.y + dirY * offset
    };
  }

  function getMarbleRenderData(runtime, view) {
    const marble = runtime.marble;
    const shadowZ = getVisualSupportZ(
      runtime,
      marble.x,
      marble.y,
      marble.supportRadius,
      runtime.level.voidFloor ?? -1.5
    );

    const depthBelowSupport = Math.max(0, shadowZ - marble.z);
    const liftedRenderZ = marble.grounded
      ? marble.z
      : marble.z + Math.min(depthBelowSupport * AIRBORNE_RENDER_LIFT_FACTOR, AIRBORNE_RENDER_LIFT_MAX);

    const baseShadow = project(marble.x, marble.y, shadowZ, view);
    const heightAboveSurface = Math.max(0, marble.z - shadowZ);
    const shadow = getShadowScreenPosition(baseShadow, heightAboveSurface, view);

    return {
      shadowZ,
      shadow,
      ball: project(marble.x, marble.y, liftedRenderZ, view),
      radius: Math.max(8, view.tileW * marble.renderRadius * 0.9)
    };
  }

  function renderMarble(ctx, runtime, view) {
    const marbleRender = getMarbleRenderData(runtime, view);

    const shadowX = marbleRender.shadow.x;
    const shadowY = marbleRender.shadow.y + marbleRender.radius * 0.35;
    const shadowRx = marbleRender.radius * 0.95;
    const shadowRy = marbleRender.radius * 0.48;

    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fill();

    const ball = marbleRender.ball;
    const radius = marbleRender.radius;
    const gradient = ctx.createRadialGradient(
      ball.x - radius * 0.35,
      ball.y - radius * 0.48,
      radius * 0.14,
      ball.x,
      ball.y,
      radius
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.22, '#dbeafe');
    gradient.addColorStop(1, '#475569');

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function renderDeferredCoverPass(ctx, runtime, view, playerReferenceZ, deferPlan) {
    const tiles = getTileDrawOrder(runtime.level);

    for (const { tx, ty } of tiles) {
      const key = tileKey(tx, ty);

      const surface = window.MarbleLevels.getSurfaceCell(runtime.level, tx, ty);
      if (surface && surface.kind !== 'void') {
        const top = buildSurfaceTopPolygon(runtime.level, runtime, tx, ty, view);
        if (top) {
          const trigger = window.MarbleLevels.getTriggerCell(runtime.level, tx, ty);
          const baseColor = getSurfaceBaseColor(surface, trigger);

          if (deferPlan.surfaceSouth.has(key)) {
            renderSurfaceSouthFace(ctx, runtime, tx, ty, view, baseColor);
          }
          if (deferPlan.surfaceEast.has(key)) {
            renderSurfaceEastFace(ctx, runtime, tx, ty, view, baseColor);
          }
          if (deferPlan.surfaceTop.has(key)) {
            renderSurfaceTopFace(ctx, runtime, tx, ty, view, playerReferenceZ, surface, top, baseColor, trigger);
          }
        }
      }

      const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
      if (blocker) {
        const baseColor = blocker.transparent ? '#64748b' : '#334155';

        if (deferPlan.blockerSouth.has(key)) {
          renderBlockerSouthFace(ctx, runtime, tx, ty, view, baseColor, blocker.top);
        }
        if (deferPlan.blockerEast.has(key)) {
          renderBlockerEastFace(ctx, runtime, tx, ty, view, baseColor, blocker.top);
        }
        if (deferPlan.blockerTop.has(key)) {
          renderBlockerTopFace(ctx, tx, ty, blocker.top, view, baseColor);
        }
      }
    }

    const actors = [...runtime.level.actors];
    actors.sort((a, b) => {
      const sa = runtime.dynamicState.actors[a.id];
      const sb = runtime.dynamicState.actors[b.id];
      return (sa.x + sa.y) - (sb.x + sb.y);
    });

    for (const actor of actors) {
      const actorState = runtime.dynamicState.actors[actor.id];
      if (!actorState || actorState.active === false) continue;
      const color = getActorColor(actor);

      if (deferPlan.actorSouth.has(actor.id)) {
        renderActorSouthFace(ctx, actor, actorState, view, color);
      }
      if (deferPlan.actorEast.has(actor.id)) {
        renderActorEastFace(ctx, actor, actorState, view, color);
      }
      if (deferPlan.actorTop.has(actor.id)) {
        renderActorTopFace(ctx, actor, actorState, view, playerReferenceZ, color);
      }
    }
  }

  function renderGoal(ctx, runtime, view) {
    const goal = runtime.level.goal;
    if (!goal) return;

    const support = window.MarbleLevels.sampleVisualSurface(runtime.level, goal.x, goal.y, runtime.dynamicState);
    const z = (support ? support.z : 0) + 0.22;
    const p = project(goal.x, goal.y, z, view);
    const radius = Math.max(8, view.tileW * goal.radius * 0.42);

    const gradient = ctx.createRadialGradient(
      p.x - radius * 0.25,
      p.y - radius * 0.3,
      radius * 0.15,
      p.x,
      p.y,
      radius
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.35, 'rgba(110,231,183,0.95)');
    gradient.addColorStop(1, 'rgba(34,197,94,0.42)');

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function renderRouteGraph(ctx, runtime, view) {
    if (!runtime.debug.showRouteGraph || !runtime.level.routeGraph) return;

    const nodes = runtime.level.routeGraph.nodes || [];
    const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));

    ctx.save();
    ctx.strokeStyle = 'rgba(250,204,21,0.6)';
    ctx.lineWidth = 1.4;

    for (const edge of runtime.level.routeGraph.edges || []) {
      const a = nodeById[edge.from];
      const b = nodeById[edge.to];
      if (!a || !b || typeof a.x !== 'number' || typeof b.x !== 'number') continue;

      const p1 = project(a.x, a.y, (a.z ?? 0) + 0.1, view);
      const p2 = project(b.x, b.y, (b.z ?? 0) + 0.1, view);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (const node of nodes) {
      if (typeof node.x !== 'number') continue;
      const p = project(node.x, node.y, (node.z ?? 0) + 0.14, view);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(253,224,71,0.88)';
      ctx.fill();
    }

    ctx.restore();
  }

  function renderStatus(ctx, runtime, cssWidth) {
    if (runtime.status === 'running') return;

    ctx.save();
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(230,237,243,0.88)';

    const label =
      runtime.status === 'completed'
        ? 'Cleared'
        : runtime.status === 'failed'
          ? 'Failed'
          : runtime.status;

    ctx.fillText(label, cssWidth - 18, 28);
    ctx.restore();
  }

function renderTerrain(ctx, runtime, view, playerReferenceZ, deferPlan = null) {
  const tiles = getTileDrawOrder(runtime.level);
  for (const { tx, ty } of tiles) {
    renderSurfaceTile(ctx, runtime, tx, ty, view, playerReferenceZ, deferPlan);
    renderBlockerTile(ctx, runtime, tx, ty, view, deferPlan);
  }
}

function renderActors(ctx, runtime, view, playerReferenceZ, deferPlan = null) {
  const actors = [...runtime.level.actors];
  actors.sort((a, b) => {
    const sa = runtime.dynamicState.actors[a.id];
    const sb = runtime.dynamicState.actors[b.id];
    return (sa.x + sa.y) - (sb.x + sb.y);
  });

  for (const actor of actors) {
    renderActor(ctx, runtime, actor, view, playerReferenceZ, deferPlan);
  }
}

function draw(runtime, canvas) {
  if (!runtime || !canvas) return;

  const { ctx, cssWidth, cssHeight } = fitCanvasToDisplay(canvas);
  const view = createView(runtime, cssWidth, cssHeight);
  const playerReferenceZ = getPlayerReferenceZ(runtime);
  const deferPlan = buildDeferredCoverPlan(runtime);

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  renderBackground(ctx, cssWidth, cssHeight);
  renderTerrain(ctx, runtime, view, playerReferenceZ, deferPlan);
  renderActors(ctx, runtime, view, playerReferenceZ, deferPlan);
  renderGoal(ctx, runtime, view);
  renderMarble(ctx, runtime, view);
  renderDeferredCoverPass(ctx, runtime, view, playerReferenceZ, deferPlan);
  renderRouteGraph(ctx, runtime, view);
  renderStatus(ctx, runtime, cssWidth);
}

  function prepare(runtime) {
    return runtime;
  }

  window.MarbleRenderer = {
    prepare,
    render: draw
  };
})();