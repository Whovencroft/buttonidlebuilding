(() => {
  const SURFACE_SAMPLE_EPSILON = 0.0001;
  const HEIGHT_AXIS_SCREEN_X_FACTOR = 0.32;
  const TILE_DRAW_ORDER_CACHE = new WeakMap();
  const HEIGHT_CUE_THRESHOLD = 0.35;
  const ABOVE_TINT_BASE = 'rgba(250, 204, 21, ';
  const BELOW_TINT_BASE = 'rgba(96, 165, 250, ';
  const FRONT_FACE_OCCLUSION_Y_MARGIN = 0.08;
  const TOP_OCCLUDER_CENTER_OFFSET = 0.12;
  const AIRBORNE_RENDER_LIFT_FACTOR = 0.18;
  const AIRBORNE_RENDER_LIFT_MAX = 0.22;
  const SHADOW_MODE = 'under'; // 'under' or 'light'
  const SHADOW_LIGHT_DIR = { x: 0.82, y: 0.57 };
  const SHADOW_OFFSET_FACTOR = 0.34;
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
    return { ctx, dpr, cssWidth: Math.max(1, rect.width), cssHeight: Math.max(1, rect.height) };
  }

  function createView(runtime, cssWidth, cssHeight) {
    const base = Math.min(cssWidth, cssHeight);
    const tileW = Math.max(54, Math.min(110, Math.min(cssWidth / 10.5, cssHeight / 6.8, base / 5.8)));
    const tileH = tileW * 0.5;
    const heightScale = tileH * 0.92;
    return {
      camX: runtime.camera?.x ?? runtime.marble.x,
      camY: runtime.camera?.y ?? runtime.marble.y,
      tileW,
      tileH,
      heightScale,
      screenCx: cssWidth * 0.5,
      screenCy: cssHeight * 0.42
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
    const cam = worldProject(view.camX, view.camY, 0, view);
    return {
      x: view.screenCx + p.x - cam.x,
      y: view.screenCy + p.y - cam.y
    };
  }

  function beginPoly(ctx, points) {
    if (!points?.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  }

  function addPolyPath(ctx, points) {
    if (!points?.length) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
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

  function getPlayerReferenceZ(runtime) {
    return getVisualSupportZ(
      runtime,
      runtime.marble.x,
      runtime.marble.y,
      runtime.marble.supportRadius,
      runtime.marble.z - runtime.marble.collisionRadius
    );
  }

  function renderBackground(ctx, cssWidth, cssHeight) {
    const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
    gradient.addColorStop(0, '#0b1323');
    gradient.addColorStop(1, '#04070e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.save();
    ctx.globalAlpha = 0.16;
    const glowA = ctx.createRadialGradient(cssWidth * 0.24, cssHeight * 0.2, 10, cssWidth * 0.24, cssHeight * 0.2, cssWidth * 0.3);
    glowA.addColorStop(0, 'rgba(125,211,252,0.42)');
    glowA.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const glowB = ctx.createRadialGradient(cssWidth * 0.78, cssHeight * 0.74, 10, cssWidth * 0.78, cssHeight * 0.74, cssWidth * 0.25);
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

  function renderSurfaceTile(ctx, runtime, tx, ty, view, playerReferenceZ) {
    const cell = window.MarbleLevels.getSurfaceCell(runtime.level, tx, ty);
    if (!cell || cell.kind === 'void') return;

    const top = buildSurfaceTopPolygon(runtime.level, runtime, tx, ty, view);
    if (!top) return;

    const trigger = window.MarbleLevels.getTriggerCell(runtime.level, tx, ty);
    const baseColor = getSurfaceBaseColor(cell, trigger);

    const fillTop = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty, { runtime: runtime.dynamicState });
    const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, { runtime: runtime.dynamicState });
    const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, { runtime: runtime.dynamicState });

    if (fillTop > southFill + 0.01) {
      const p1 = project(tx, ty + 1, fillTop, view);
      const p2 = project(tx + 1, ty + 1, fillTop, view);
      const p3 = project(tx + 1, ty + 1, southFill, view);
      const p4 = project(tx, ty + 1, southFill, view);
      beginPoly(ctx, [p1, p2, p3, p4]);
      ctx.fillStyle = darken(baseColor, 0.58);
      ctx.fill();
    }

    if (fillTop > eastFill + 0.01) {
      const p1 = project(tx + 1, ty, fillTop, view);
      const p2 = project(tx + 1, ty + 1, fillTop, view);
      const p3 = project(tx + 1, ty + 1, eastFill, view);
      const p4 = project(tx + 1, ty, eastFill, view);
      beginPoly(ctx, [p1, p2, p3, p4]);
      ctx.fillStyle = darken(baseColor, 0.72);
      ctx.fill();
    }

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

  function renderBlockerTile(ctx, runtime, tx, ty, view) {
    const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
    if (!blocker) return;
    const baseColor = blocker.transparent ? '#64748b' : '#334155';
    const top = blocker.top;
    const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, { runtime: runtime.dynamicState });
    const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, { runtime: runtime.dynamicState });

    if (top > southFill + 0.01) {
      beginPoly(ctx, [
        project(tx, ty + 1, top, view),
        project(tx + 1, ty + 1, top, view),
        project(tx + 1, ty + 1, southFill, view),
        project(tx, ty + 1, southFill, view)
      ]);
      ctx.fillStyle = darken(baseColor, 0.55);
      ctx.fill();
    }

    if (top > eastFill + 0.01) {
      beginPoly(ctx, [
        project(tx + 1, ty, top, view),
        project(tx + 1, ty + 1, top, view),
        project(tx + 1, ty + 1, eastFill, view),
        project(tx + 1, ty, eastFill, view)
      ]);
      ctx.fillStyle = darken(baseColor, 0.7);
      ctx.fill();
    }

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

  function renderActor(ctx, runtime, actor, view, playerReferenceZ) {
    const actorState = runtime.dynamicState.actors[actor.id];
    if (!actorState || actorState.active === false) return;
    const color = getActorColor(actor);

    if (actor.kind === window.MarbleLevels.ACTOR_KINDS.MOVING_PLATFORM || actor.kind === window.MarbleLevels.ACTOR_KINDS.ELEVATOR) {
      const x = actorState.x;
      const y = actorState.y;
      const z = actorState.topHeight;
      const top = [
        project(x, y, z, view),
        project(x + actor.width, y, z, view),
        project(x + actor.width, y + actor.height, z, view),
        project(x, y + actor.height, z, view)
      ];

      beginPoly(ctx, top);
      ctx.fillStyle = color;
      ctx.fill();

      renderRelativeHeightCue(ctx, top, z, playerReferenceZ);

      ctx.strokeStyle = 'rgba(241,245,249,0.2)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    } else if (actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE) {
      const x = actorState.x;
      const y = actorState.y;
      const z = actor.topHeight;
      beginPoly(ctx, [
        project(x, y, z, view),
        project(x + actor.width, y, z, view),
        project(x + actor.width, y + actor.height, z, view),
        project(x, y + actor.height, z, view)
      ]);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(254,215,170,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
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

  function getVisualSupportZ(runtime, x, y, radius, fallbackZ) {
    const offsets = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
    for (const [ox, oy] of offsets) {
      const sample = window.MarbleLevels.sampleVisualSurface(runtime.level, x + ox, y + oy, runtime.dynamicState);
      if (sample) return sample.z;
    }
    return fallbackZ;
  }

    function getPolygonBounds(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of points) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }

    return { minX, minY, maxX, maxY };
  }

  function boundsOverlapEllipse(points, cx, cy, rx, ry) {
    const bounds = getPolygonBounds(points);
    if (bounds.maxX < cx - rx) return false;
    if (bounds.minX > cx + rx) return false;
    if (bounds.maxY < cy - ry) return false;
    if (bounds.minY > cy + ry) return false;
    return true;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    const { x, y } = point;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersects =
        ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.0000001) + xi);

      if (intersects) inside = !inside;
    }

    return inside;
  }

  function distanceSqPointToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;

    if (abLenSq <= 0.0000001) {
      const dx = px - ax;
      const dy = py - ay;
      return dx * dx + dy * dy;
    }

    const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
    const qx = ax + abx * t;
    const qy = ay + aby * t;
    const dx = px - qx;
    const dy = py - qy;
    return dx * dx + dy * dy;
  }

  function ellipseIntersectsPolygon(points, cx, cy, rx, ry) {
    if (!points || points.length < 3) return false;
    if (!boundsOverlapEllipse(points, cx, cy, rx, ry)) return false;

    const normalized = points.map((point) => ({
      x: (point.x - cx) / Math.max(rx, 0.0001),
      y: (point.y - cy) / Math.max(ry, 0.0001)
    }));

    if (pointInPolygon({ x: 0, y: 0 }, normalized)) return true;

    for (const point of normalized) {
      if ((point.x * point.x) + (point.y * point.y) <= 1) return true;
    }

    for (let i = 0; i < normalized.length; i += 1) {
      const a = normalized[i];
      const b = normalized[(i + 1) % normalized.length];
      if (distanceSqPointToSegment(0, 0, a.x, a.y, b.x, b.y) <= 1) return true;
    }

    return false;
  }

  function getSurfaceOccluderPolygons(runtime, tx, ty, view) {
  const cell = window.MarbleLevels.getSurfaceCell(runtime.level, tx, ty);
  if (!cell || cell.kind === 'void') return null;

  const top = buildSurfaceTopPolygon(runtime.level, runtime, tx, ty, view);
  if (!top) return null;

  const fillTop = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty, { runtime: runtime.dynamicState });
  const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, { runtime: runtime.dynamicState });
  const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, { runtime: runtime.dynamicState });

  return {
    tx,
    ty,
    top,
    topZ: fillTop,
    southTopZ: fillTop,
    eastTopZ: fillTop,
    south: fillTop > southFill + 0.01 ? [
      project(tx, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, southFill, view),
      project(tx, ty + 1, southFill, view)
    ] : null,
    east: fillTop > eastFill + 0.01 ? [
      project(tx + 1, ty, fillTop, view),
      project(tx + 1, ty + 1, fillTop, view),
      project(tx + 1, ty + 1, eastFill, view),
      project(tx + 1, ty, eastFill, view)
    ] : null
  };
}

function getBlockerOccluderPolygons(runtime, tx, ty, view) {
  const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
  if (!blocker) return null;

  const top = blocker.top;
  const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, { runtime: runtime.dynamicState });
  const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, { runtime: runtime.dynamicState });

  return {
    tx,
    ty,
    top: [
      project(tx, ty, top, view),
      project(tx + 1, ty, top, view),
      project(tx + 1, ty + 1, top, view),
      project(tx, ty + 1, top, view)
    ],
    topZ: top,
    southTopZ: top,
    eastTopZ: top,
    south: top > southFill + 0.01 ? [
      project(tx, ty + 1, top, view),
      project(tx + 1, ty + 1, top, view),
      project(tx + 1, ty + 1, southFill, view),
      project(tx, ty + 1, southFill, view)
    ] : null,
    east: top > eastFill + 0.01 ? [
      project(tx + 1, ty, top, view),
      project(tx + 1, ty + 1, top, view),
      project(tx + 1, ty + 1, eastFill, view),
      project(tx + 1, ty, eastFill, view)
    ] : null
  };
}

   function rangesOverlap(minA, maxA, minB, maxB) {
  return maxA >= minB && minA <= maxB;
}

function shouldOccludeSouthFace(meta, marbleX, marbleY, marbleZ, marbleRadius) {
  if (!meta?.south) return false;
  if (meta.southTopZ <= marbleZ + 0.04) return false;

  const ballMinX = marbleX - marbleRadius;
  const ballMaxX = marbleX + marbleRadius;
  if (!rangesOverlap(ballMinX, ballMaxX, meta.tx, meta.tx + 1)) return false;

  const faceY = meta.ty + 1;
  const ballBackY = marbleY - marbleRadius;

  return ballBackY <= faceY + 0.02;
}

function shouldOccludeEastFace(meta, marbleX, marbleY, marbleZ, marbleRadius) {
  if (!meta?.east) return false;
  if (meta.eastTopZ <= marbleZ + 0.04) return false;

  const ballMinY = marbleY - marbleRadius;
  const ballMaxY = marbleY + marbleRadius;
  if (!rangesOverlap(ballMinY, ballMaxY, meta.ty, meta.ty + 1)) return false;

  const faceX = meta.tx + 1;
  const ballBackX = marbleX - marbleRadius;

  return ballBackX <= faceX + 0.02;
}

function shouldOccludeTopFace(meta, marbleX, marbleY, marbleZ, marbleRadius) {
  if (!meta?.top) return false;
  if (meta.topZ <= marbleZ + 0.02) return false;

  const ballMinX = marbleX - marbleRadius;
  const ballMaxX = marbleX + marbleRadius;
  const ballMinY = marbleY - marbleRadius;
  const ballMaxY = marbleY + marbleRadius;

  return (
    rangesOverlap(ballMinX, ballMaxX, meta.tx, meta.tx + 1) &&
    rangesOverlap(ballMinY, ballMaxY, meta.ty, meta.ty + 1)
  );
}

function shouldOccludeActorTopFace(actorState, actor, marbleX, marbleY, marbleZ, marbleRadius, topZ) {
  if (topZ <= marbleZ + 0.02) return false;

  const ballMinX = marbleX - marbleRadius;
  const ballMaxX = marbleX + marbleRadius;
  const ballMinY = marbleY - marbleRadius;
  const ballMaxY = marbleY + marbleRadius;

  return (
    rangesOverlap(ballMinX, ballMaxX, actorState.x, actorState.x + actor.width) &&
    rangesOverlap(ballMinY, ballMaxY, actorState.y, actorState.y + actor.height)
  );
}

function maybeAddOccluder(occluders, polygon, targetX, targetY, radiusX, radiusY) {
  if (!polygon) return;
  if (!ellipseIntersectsPolygon(polygon, targetX, targetY, radiusX, radiusY)) return;
  occluders.push(polygon);
}

function collectMarbleOccluders(runtime, view, marbleX, marbleY, targetX, targetY, radiusX, radiusY, marbleZ) {
  if (!Number.isFinite(marbleZ)) return [];

  const occluders = [];
  const marbleRadius = runtime.marble.collisionRadius;
  const tiles = getTileDrawOrder(runtime.level);

  for (const { tx, ty } of tiles) {
    const surfacePolys = getSurfaceOccluderPolygons(runtime, tx, ty, view);
    if (surfacePolys) {
      if (shouldOccludeSouthFace(surfacePolys, marbleX, marbleY, marbleZ, marbleRadius)) {
        maybeAddOccluder(occluders, surfacePolys.south, targetX, targetY, radiusX, radiusY);
      }
      if (shouldOccludeEastFace(surfacePolys, marbleX, marbleY, marbleZ, marbleRadius)) {
        maybeAddOccluder(occluders, surfacePolys.east, targetX, targetY, radiusX, radiusY);
      }
      if (shouldOccludeTopFace(surfacePolys, marbleX, marbleY, marbleZ, marbleRadius)) {
        maybeAddOccluder(occluders, surfacePolys.top, targetX, targetY, radiusX, radiusY);
      }
    }

    const blockerPolys = getBlockerOccluderPolygons(runtime, tx, ty, view);
    if (blockerPolys) {
      if (shouldOccludeSouthFace(blockerPolys, marbleX, marbleY, marbleZ, marbleRadius)) {
        maybeAddOccluder(occluders, blockerPolys.south, targetX, targetY, radiusX, radiusY);
      }
      if (shouldOccludeEastFace(blockerPolys, marbleX, marbleY, marbleZ, marbleRadius)) {
        maybeAddOccluder(occluders, blockerPolys.east, targetX, targetY, radiusX, radiusY);
      }
      if (shouldOccludeTopFace(blockerPolys, marbleX, marbleY, marbleZ, marbleRadius)) {
        maybeAddOccluder(occluders, blockerPolys.top, targetX, targetY, radiusX, radiusY);
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
      const topZ = actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE ? actor.topHeight : actorState.topHeight;
      if (!shouldOccludeActorTopFace(actorState, actor, marbleX, marbleY, marbleZ, marbleRadius, topZ)) continue;

      const top = [
        project(actorState.x, actorState.y, topZ, view),
        project(actorState.x + actor.width, actorState.y, topZ, view),
        project(actorState.x + actor.width, actorState.y + actor.height, topZ, view),
        project(actorState.x, actorState.y + actor.height, topZ, view)
      ];

      maybeAddOccluder(occluders, top, targetX, targetY, radiusX, radiusY);
    }
  }

  return occluders;
}

  function drawOccludedBall(ctx, ball, radius, occluders) {
    if (!occluders.length) {
      const gradient = ctx.createRadialGradient(ball.x - radius * 0.35, ball.y - radius * 0.48, radius * 0.14, ball.x, ball.y, radius);
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
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    for (const poly of occluders) addPolyPath(ctx, poly);
    ctx.clip('evenodd');

    const gradient = ctx.createRadialGradient(ball.x - radius * 0.35, ball.y - radius * 0.48, radius * 0.14, ball.x, ball.y, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.22, '#dbeafe');
    gradient.addColorStop(1, '#475569');
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
  }

  function drawOccludedShadow(ctx, shadowX, shadowY, radius, occluders) {
    const ellipseY = shadowY + radius * 0.35;
    const rx = radius * 0.95;
    const ry = radius * 0.48;

    if (!occluders.length) {
      ctx.beginPath();
      ctx.ellipse(shadowX, ellipseY, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fill();
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(shadowX, ellipseY, rx, ry, 0, 0, Math.PI * 2);
    for (const poly of occluders) addPolyPath(ctx, poly);
    ctx.clip('evenodd');

    ctx.beginPath();
    ctx.ellipse(shadowX, ellipseY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fill();

    ctx.restore();
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
  const shadowZ = getVisualSupportZ(runtime, marble.x, marble.y, marble.supportRadius, runtime.level.voidFloor ?? -1.5);
  const depthBelowSupport = Math.max(0, shadowZ - marble.z);
  const liftedRenderZ = marble.grounded
    ? marble.z
    : marble.z + Math.min(depthBelowSupport * AIRBORNE_RENDER_LIFT_FACTOR, AIRBORNE_RENDER_LIFT_MAX);

  const baseShadow = project(marble.x, marble.y, shadowZ, view);
  const heightAboveSurface = Math.max(0, marble.z - shadowZ);
  const shadow = getShadowScreenPosition(baseShadow, heightAboveSurface, view);

  return {
    worldX: marble.x,
    worldY: marble.y,
    shadowZ,
    ballOcclusionZ: marble.z,
    shadow,
    ball: project(marble.x, marble.y, liftedRenderZ, view),
    radius: Math.max(8, view.tileW * marble.renderRadius * 0.9)
  };
}

function renderMarble(ctx, runtime, view) {
  const marbleRender = getMarbleRenderData(runtime, view);

  const ballOccluders = collectMarbleOccluders(
    runtime,
    view,
    marbleRender.worldX,
    marbleRender.worldY,
    marbleRender.ball.x,
    marbleRender.ball.y,
    marbleRender.radius,
    marbleRender.radius,
    marbleRender.ballOcclusionZ
  );

  const shadowOccluders = collectMarbleOccluders(
    runtime,
    view,
    marbleRender.worldX,
    marbleRender.worldY,
    marbleRender.shadow.x,
    marbleRender.shadow.y + marbleRender.radius * 0.35,
    marbleRender.radius * 0.95,
    marbleRender.radius * 0.48,
    marbleRender.shadowZ
  );

  drawOccludedShadow(
    ctx,
    marbleRender.shadow.x,
    marbleRender.shadow.y,
    marbleRender.radius,
    shadowOccluders
  );

  drawOccludedBall(
    ctx,
    marbleRender.ball,
    marbleRender.radius,
    ballOccluders
  );
}

  function renderGoal(ctx, runtime, view) {
    const goal = runtime.level.goal;
    if (!goal) return;
    const support = window.MarbleLevels.sampleVisualSurface(runtime.level, goal.x, goal.y, runtime.dynamicState);
    const z = (support ? support.z : 0) + 0.22;
    const p = project(goal.x, goal.y, z, view);
    const radius = Math.max(8, view.tileW * goal.radius * 0.42);
    const gradient = ctx.createRadialGradient(p.x - radius * 0.25, p.y - radius * 0.3, radius * 0.15, p.x, p.y, radius);
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
    const label = runtime.status === 'completed' ? 'Cleared' : runtime.status === 'failed' ? 'Failed' : runtime.status;
    ctx.fillText(label, cssWidth - 18, 28);
    ctx.restore();
  }

  function draw(runtime, canvas) {
    if (!runtime || !canvas) return;
    const { ctx, cssWidth, cssHeight } = fitCanvasToDisplay(canvas);
    const view = createView(runtime, cssWidth, cssHeight);
    const playerReferenceZ = getPlayerReferenceZ(runtime);

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    renderBackground(ctx, cssWidth, cssHeight);
    renderTerrain(ctx, runtime, view, playerReferenceZ);
    renderActors(ctx, runtime, view, playerReferenceZ);
    renderGoal(ctx, runtime, view);
    renderMarble(ctx, runtime, view);
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

  function renderTerrain(ctx, runtime, view, playerReferenceZ) {
    const tiles = getTileDrawOrder(runtime.level);
    for (const { tx, ty } of tiles) {
      renderSurfaceTile(ctx, runtime, tx, ty, view, playerReferenceZ);
      renderBlockerTile(ctx, runtime, tx, ty, view);
    }
  }

  function renderActors(ctx, runtime, view, playerReferenceZ) {
    const actors = [...runtime.level.actors];
    actors.sort((a, b) => {
      const sa = runtime.dynamicState.actors[a.id];
      const sb = runtime.dynamicState.actors[b.id];
      return (sa.x + sa.y) - (sb.x + sb.y);
    });
    for (const actor of actors) renderActor(ctx, runtime, actor, view, playerReferenceZ);
  }
})();