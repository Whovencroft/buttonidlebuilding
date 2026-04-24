// marble_renderer.js — integer-tile painter's algorithm
//
// ARCHITECTURE
// ============
// The world is divided into integer tiles.  Every element is assigned a
// (tileX, tileY) bucket — its integer grid position — and drawn in strict
// back-to-front order: ascending (tileX + tileY), then ascending tileY.
//
// Within each tile bucket, items are drawn in this fixed sub-order:
//   0  terrain south face  (the vertical drop at the south edge of this tile)
//   1  terrain east face   (the vertical drop at the east edge of this tile)
//   2  terrain top face    (the sloped/flat surface of this tile)
//   3  blocker south face
//   4  blocker east face
//   5  blocker top face
//   6  actor south face(s) whose front edge falls in this tile column
//   7  actor east face(s)  whose front edge falls in this tile column
//   8  actor top face(s)   whose origin tile is this tile
//   9  marble shadow       (placed in the tile the marble currently occupies)
//  10  marble ball         (same tile as shadow)
//
// This means: anything in tile bucket N is always drawn before anything in
// tile bucket N+1.  The marble and platforms are placed in the correct bucket
// by their integer tile coordinates, so occlusion is automatic.
//
// The grid appearance is a thin stroke overlay on each top face — no separate
// geometry needed.
//
// PROJECTION
// ==========
//   screenX = (x - y) * tileW/2  +  z * heightScale * HEIGHT_X_SHIFT
//   screenY = (x + y) * tileH/2  -  z * heightScale

(() => {
  // ─── Constants ────────────────────────────────────────────────────────────

  const HEIGHT_X_SHIFT       = 0.32;
  const SURFACE_SAMPLE_EPS   = 0.0001;
  const HEIGHT_CUE_THRESHOLD = 0.35;
  const AIRBORNE_LIFT_FACTOR = 0.18;
  const AIRBORNE_LIFT_MAX    = 0.22;
  const ACTOR_THICKNESS      = 0.06;
  const Z_EPS                = 0.02;

  const ABOVE_TINT = 'rgba(250,204,21,';
  const BELOW_TINT = 'rgba(96,165,250,';

  // Sub-order within a tile bucket (lower = drawn first)
  const SUB_TERRAIN_SOUTH = 0;
  const SUB_TERRAIN_EAST  = 1;
  const SUB_TERRAIN_TOP   = 2;
  const SUB_BLOCKER_SOUTH = 3;
  const SUB_BLOCKER_EAST  = 4;
  const SUB_BLOCKER_TOP   = 5;
  const SUB_ACTOR_SOUTH   = 6;
  const SUB_ACTOR_EAST    = 7;
  const SUB_ACTOR_TOP     = 8;
  const SUB_MARBLE_SHADOW = 9;
  const SUB_MARBLE_BALL   = 10;

  // ─── Utilities ────────────────────────────────────────────────────────────

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function darken(hex, f) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`;
  }

  function getCueAlpha(diff) {
    return Math.min(0.22, 0.07 + Math.abs(diff) * 0.04);
  }

  // ─── Canvas ───────────────────────────────────────────────────────────────

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    const w    = Math.max(1, Math.round(rect.width  * dpr));
    const h    = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, cssWidth: Math.max(1, rect.width), cssHeight: Math.max(1, rect.height) };
  }

  // ─── Projection ───────────────────────────────────────────────────────────

  function worldToScreen(x, y, z, view) {
    return {
      x: (x - y) * (view.tileW * 0.5) + z * view.heightScale * HEIGHT_X_SHIFT,
      y: (x + y) * (view.tileH * 0.5) - z * view.heightScale
    };
  }

  function project(x, y, z, view) {
    const p   = worldToScreen(x, y, z, view);
    const cam = worldToScreen(view.camX, view.camY, view.camZ, view);
    return { x: view.cx + p.x - cam.x, y: view.cy + p.y - cam.y };
  }

  // ─── View ─────────────────────────────────────────────────────────────────

  function getVisualSupportZ(runtime, x, y, radius, fallback) {
    const offsets = [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]];
    let best = null;
    for (const [ox, oy] of offsets) {
      const s = window.MarbleLevels.sampleVisualSurface(
        runtime.level, x + ox, y + oy, runtime.dynamicState
      );
      if (s && (best === null || s.z > best)) best = s.z;
    }
    return best !== null ? best : fallback;
  }

  function getCameraZ(runtime) {
    const m  = runtime.marble;
    const sz = getVisualSupportZ(runtime, m.x, m.y, m.supportRadius,
                 runtime.level.voidFloor ?? -1.5);
    const hgt = Math.max(0, m.z - sz);
    return m.grounded
      ? m.z
      : m.z + Math.min(hgt * AIRBORNE_LIFT_FACTOR, AIRBORNE_LIFT_MAX);
  }

  function createView(runtime, cssWidth, cssHeight) {
    const base  = Math.min(cssWidth, cssHeight);
    const tileW = Math.max(54, Math.min(110,
                    Math.min(cssWidth / 10.5, cssHeight / 6.8, base / 5.8)));
    const tileH = tileW * 0.5;
    return {
      camX: runtime.camera?.x ?? runtime.marble.x,
      camY: runtime.camera?.y ?? runtime.marble.y,
      camZ: getCameraZ(runtime),
      tileW, tileH,
      heightScale: tileH * 0.92,
      cx: cssWidth  * 0.5,
      cy: cssHeight * 0.5
    };
  }

  // ─── Polygon helpers ──────────────────────────────────────────────────────

  function fillPoly(ctx, pts, style) {
    if (!pts || pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  }

  function strokePoly(ctx, pts, style, lw) {
    if (!pts || pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.strokeStyle = style;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // ─── Colors ───────────────────────────────────────────────────────────────

  function getSurfaceColor(cell, trigger) {
    if (!cell || cell.kind === 'void') return '#374151';
    if (trigger?.kind === 'goal')   return '#22c55e';
    if (trigger?.kind === 'hazard') return '#ef4444';
    if (cell.landingPad)  return '#16a34a';
    if (cell.bounce > 0)  return '#38bdf8';
    if (cell.conveyor)    return '#0891b2';
    if (cell.crumble)     return '#d97706';
    if (cell.friction < 0.8)  return '#60a5fa';
    if (cell.friction > 1.15) return '#8b5cf6';
    if (cell.failType)    return '#dc2626';
    return '#94a3b8';
  }

  function getActorColor(actor) {
    const K = window.MarbleLevels.ACTOR_KINDS;
    switch (actor.kind) {
      case K.MOVING_PLATFORM: return '#64748b';
      case K.ELEVATOR:        return '#475569';
      case K.TIMED_GATE:      return '#7c2d12';
      case K.ROTATING_BAR:
      case K.SWEEPER:         return '#ef4444';
      default:                return '#64748b';
    }
  }

  // ─── Surface top polygon ──────────────────────────────────────────────────

  function getShapeSamplePoints(cell, seg) {
    const S = window.MarbleLevels.SHAPES;
    if (!cell) return [[0,0],[1,0],[1,1],[0,1]];
    seg = seg || 12;

    if (cell.shape === S.CURVE_CONVEX_NE) {
      const pts = [[0,0],[1,0]];
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * 0.5 * (i / seg);
        pts.push([1 - Math.cos(a)*0.48, Math.sin(a)*0.48]);
      }
      pts.push([0,1]); return pts;
    }
    if (cell.shape === S.CURVE_CONVEX_NW) {
      const c = [];
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * 0.5 * (i / seg);
        c.push([Math.sin(a)*0.48, Math.cos(a)*0.48]);
      }
      return [[1,0],...c,[1,1],[0,1],[0,0]];
    }
    if (cell.shape === S.CURVE_CONVEX_SE) {
      const c = [];
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * 0.5 * (i / seg);
        c.push([1 - Math.cos(a)*0.48, 1 - Math.sin(a)*0.48]);
      }
      return [[0,0],[1,0],[1,1],...c.reverse(),[0,1]];
    }
    if (cell.shape === S.CURVE_CONVEX_SW) {
      const c = [];
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * 0.5 * (i / seg);
        c.push([Math.sin(a)*0.48, 1 - Math.cos(a)*0.48]);
      }
      return [[0,0],[1,0],[1,1],[0,1],...c.reverse()];
    }
    if (cell.shape === S.CURVE_CONCAVE_NE) {
      const r = [[0,0],[1,0]];
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * 0.5 * (1 - i/seg);
        r.push([1 - Math.cos(a)*0.8, Math.sin(a)*0.8]);
      }
      r.push([0,1]); return r;
    }
    if (cell.shape === S.CURVE_CONCAVE_NW) {
      const r = [[1,0],[1,1]];
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * 0.5 * (i / seg);
        r.push([Math.sin(a)*0.8, Math.cos(a)*0.8]);
      }
      r.push([0,0]); return r;
    }
    if (cell.shape === S.CURVE_CONCAVE_SE) {
      const r = [[0,0],[1,0],[1,1]];
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * 0.5 * (1 - i/seg);
        r.push([1 - Math.cos(a)*0.8, 1 - Math.sin(a)*0.8]);
      }
      r.push([0,1]); return r;
    }
    if (cell.shape === S.CURVE_CONCAVE_SW) {
      const r = [[0,0],[1,0],[1,1],[0,1]];
      for (let i = 0; i <= seg; i++) {
        const a = Math.PI * 0.5 * (i / seg);
        r.push([Math.sin(a)*0.8, 1 - Math.cos(a)*0.8]);
      }
      return r;
    }
    return [[0,0],[1,0],[1,1],[0,1]];
  }

  function buildSurfaceTopPoly(level, runtime, tx, ty, view) {
    const cell = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!cell || cell.kind === 'void') return null;
    const pts = [];
    for (const [u, v] of getShapeSamplePoints(cell)) {
      const lu = clamp(u, SURFACE_SAMPLE_EPS, 1 - SURFACE_SAMPLE_EPS);
      const lv = clamp(v, SURFACE_SAMPLE_EPS, 1 - SURFACE_SAMPLE_EPS);
      const s  = window.MarbleLevels.sampleWalkableSurface(level, tx + lu, ty + lv,
                   { runtime: runtime.dynamicState });
      if (!s || s.source !== 'surface' || s.tx !== tx || s.ty !== ty) continue;
      pts.push(project(tx + u, ty + v, s.z, view));
    }
    return pts.length >= 3 ? pts : null;
  }

  // ─── Static fill height (no actor inflation) ──────────────────────────────

  function staticFillTop(level, runtime, tx, ty) {
    return window.MarbleLevels.getFillTopAtCell(level, tx, ty,
      { runtime: runtime.dynamicState, staticOnly: true });
  }

  // ─── Tile draw order (cached per level object) ────────────────────────────

  const DRAW_ORDER_CACHE = new WeakMap();

  function getTileOrder(level) {
    let cached = DRAW_ORDER_CACHE.get(level);
    if (cached) return cached;
    const tiles = [];
    for (let ty = 0; ty < level.height; ty++)
      for (let tx = 0; tx < level.width; tx++)
        tiles.push({ tx, ty });
    // Primary sort: tx+ty ascending (back to front).
    // Secondary: ty ascending (left-to-right within the same diagonal).
    tiles.sort((a, b) => (a.tx + a.ty) - (b.tx + b.ty) || a.ty - b.ty);
    DRAW_ORDER_CACHE.set(level, tiles);
    return tiles;
  }

  // ─── Draw-list item factory ───────────────────────────────────────────────
  // bucket = tx + ty of the tile this item "belongs to"
  // sub    = one of the SUB_* constants above

  function item(bucket, sub, drawFn) {
    return { bucket, sub, draw: drawFn };
  }

  // ─── Player reference Z ───────────────────────────────────────────────────

  function getPlayerRefZ(runtime) {
    return getVisualSupportZ(
      runtime, runtime.marble.x, runtime.marble.y, runtime.marble.supportRadius,
      runtime.marble.z - runtime.marble.collisionRadius
    );
  }

  // ─── Terrain tile items ───────────────────────────────────────────────────

  function terrainItems(ctx, runtime, tx, ty, view, playerRefZ) {
    const level = runtime.level;
    const cell  = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!cell || cell.kind === 'void') return [];

    const fillTop   = staticFillTop(level, runtime, tx, ty);
    const trigger   = window.MarbleLevels.getTriggerCell(level, tx, ty);
    const baseColor = getSurfaceColor(cell, trigger);
    const items     = [];

    // ── South face ──
    // This face belongs to the tile at (tx, ty) but its front edge is at
    // row ty+1.  In the painter's order it must be drawn in the bucket of
    // the tile it FACES (ty+1), not the tile it belongs to, so that it
    // appears in front of everything at depth tx+(ty) and behind everything
    // at depth tx+(ty+2).
    const southFill = staticFillTop(level, runtime, tx, ty + 1);
    if (fillTop > southFill + Z_EPS) {
      const poly = [
        project(tx,   ty+1, fillTop,   view),
        project(tx+1, ty+1, fillTop,   view),
        project(tx+1, ty+1, southFill, view),
        project(tx,   ty+1, southFill, view)
      ];
      const col = darken(baseColor, 0.58);
      items.push(item(tx + (ty + 1), SUB_TERRAIN_SOUTH,
        () => fillPoly(ctx, poly, col)));
    }

    // ── East face ──
    const eastFill = staticFillTop(level, runtime, tx + 1, ty);
    if (fillTop > eastFill + Z_EPS) {
      const poly = [
        project(tx+1, ty,   fillTop,  view),
        project(tx+1, ty+1, fillTop,  view),
        project(tx+1, ty+1, eastFill, view),
        project(tx+1, ty,   eastFill, view)
      ];
      const col = darken(baseColor, 0.72);
      items.push(item((tx + 1) + ty, SUB_TERRAIN_EAST,
        () => fillPoly(ctx, poly, col)));
    }

    // ── Top face ──
    const topPoly = buildSurfaceTopPoly(level, runtime, tx, ty, view);
    if (topPoly) {
      const topZ = window.MarbleLevels.getSurfaceTopZ(cell);
      items.push(item(tx + ty, SUB_TERRAIN_TOP, () => {
        fillPoly(ctx, topPoly, baseColor);

        // Height cue tint
        const diff = fillTop - playerRefZ;
        if (Math.abs(diff) >= HEIGHT_CUE_THRESHOLD) {
          const alpha = getCueAlpha(diff);
          fillPoly(ctx, topPoly,
            diff > 0 ? `${ABOVE_TINT}${alpha})` : `${BELOW_TINT}${alpha})`);
        }

        // Grid line overlay (replaces separate grid geometry)
        strokePoly(ctx, topPoly, 'rgba(241,245,249,0.16)', 1.1);

        // Tile markers
        if (trigger?.kind === 'hazard') {
          const c = project(tx+0.5, ty+0.5, topZ + 0.02, view);
          ctx.beginPath();
          ctx.moveTo(c.x-6,c.y-4); ctx.lineTo(c.x+6,c.y+4);
          ctx.moveTo(c.x+6,c.y-4); ctx.lineTo(c.x-6,c.y+4);
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 1.4; ctx.stroke();
        }
        if (cell.conveyor) {
          const c  = project(tx+0.5, ty+0.5, topZ + 0.02, view);
          const dx = cell.conveyor.x * 8;
          const dy = cell.conveyor.y * 8;
          ctx.beginPath();
          ctx.moveTo(c.x-dx,c.y-dy); ctx.lineTo(c.x+dx,c.y+dy);
          ctx.strokeStyle = 'rgba(224,242,254,0.85)';
          ctx.lineWidth = 1.6; ctx.stroke();
        }
        if (cell.crumble) {
          const c = project(tx+0.5, ty+0.5, topZ + 0.02, view);
          ctx.beginPath();
          ctx.moveTo(c.x-5,c.y-3); ctx.lineTo(c.x+4,c.y+1);
          ctx.moveTo(c.x-2,c.y+4); ctx.lineTo(c.x+6,c.y-4);
          ctx.strokeStyle = 'rgba(255,237,213,0.88)';
          ctx.lineWidth = 1.1; ctx.stroke();
        }
        if (cell.bounce > 0) {
          const c = project(tx+0.5, ty+0.5, topZ + 0.03, view);
          ctx.beginPath();
          ctx.arc(c.x, c.y, 6, 0, Math.PI*2);
          ctx.strokeStyle = 'rgba(186,230,253,0.92)';
          ctx.lineWidth = 1.2; ctx.stroke();
        }
      }));
    }

    return items;
  }

  // ─── Blocker tile items ───────────────────────────────────────────────────

  function blockerItems(ctx, runtime, tx, ty, view) {
    const level   = runtime.level;
    const blocker = window.MarbleLevels.getBlockerCell(level, tx, ty);
    if (!blocker) return [];

    const topZ      = blocker.top;
    const baseColor = blocker.transparent ? '#64748b' : '#334155';
    const items     = [];

    const southFill = staticFillTop(level, runtime, tx, ty + 1);
    if (topZ > southFill + Z_EPS) {
      const poly = [
        project(tx,   ty+1, topZ,      view),
        project(tx+1, ty+1, topZ,      view),
        project(tx+1, ty+1, southFill, view),
        project(tx,   ty+1, southFill, view)
      ];
      const col = darken(baseColor, 0.55);
      items.push(item(tx + (ty + 1), SUB_BLOCKER_SOUTH,
        () => fillPoly(ctx, poly, col)));
    }

    const eastFill = staticFillTop(level, runtime, tx + 1, ty);
    if (topZ > eastFill + Z_EPS) {
      const poly = [
        project(tx+1, ty,   topZ,     view),
        project(tx+1, ty+1, topZ,     view),
        project(tx+1, ty+1, eastFill, view),
        project(tx+1, ty,   eastFill, view)
      ];
      const col = darken(baseColor, 0.70);
      items.push(item((tx + 1) + ty, SUB_BLOCKER_EAST,
        () => fillPoly(ctx, poly, col)));
    }

    const topPoly = [
      project(tx,   ty,   topZ, view),
      project(tx+1, ty,   topZ, view),
      project(tx+1, ty+1, topZ, view),
      project(tx,   ty+1, topZ, view)
    ];
    items.push(item(tx + ty, SUB_BLOCKER_TOP, () => {
      fillPoly(ctx, topPoly, baseColor);
      strokePoly(ctx, topPoly, 'rgba(241,245,249,0.12)', 1);
    }));

    return items;
  }

  // ─── Actor items ──────────────────────────────────────────────────────────
  //
  // Each face of an actor is placed in the bucket of the tile its front edge
  // falls in — exactly the same rule as terrain faces.  This ensures actors
  // are correctly interleaved with terrain at every tile boundary.

  function actorItems(ctx, runtime, actor, view, playerRefZ) {
    const K          = window.MarbleLevels.ACTOR_KINDS;
    const actorState = runtime.dynamicState.actors[actor.id];
    if (!actorState || actorState.active === false) return [];

    const color = getActorColor(actor);
    const items = [];

    // Rotating bars / sweepers — drawn as lines, no face geometry
    if (actor.kind === K.ROTATING_BAR || actor.kind === K.SWEEPER) {
      const cx = actorState.x + actor.width  * 0.5;
      const cy = actorState.y + actor.height * 0.5;
      const ex = cx + Math.cos(actorState.angle) * actor.armLength;
      const ey = cy + Math.sin(actorState.angle) * actor.armLength;
      const center = project(cx, cy, actor.topHeight + 0.1, view);
      const end    = project(ex, ey, actor.topHeight + 0.1, view);
      // Place in the bucket of the actor's center tile
      const bucket = Math.floor(cx) + Math.floor(cy);
      items.push(item(bucket, SUB_ACTOR_TOP, () => {
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(3, actor.armWidth * view.tileW * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(center.x, center.y, 5, 0, Math.PI*2);
        ctx.fillStyle = '#fecaca';
        ctx.fill();
      }));
      return items;
    }

    // Platform / elevator / timed gate
    const ax   = actorState.x;
    const ay   = actorState.y;
    const aw   = actor.width;
    const ah   = actor.height;
    const topZ = actor.kind === K.TIMED_GATE
      ? actor.topHeight
      : actorState.topHeight;
    const baseZ = topZ - ACTOR_THICKNESS;

    // South face — front edge is at ay+ah, so bucket = floor(ax) + floor(ay+ah)
    const southPoly = [
      project(ax,    ay+ah, topZ,  view),
      project(ax+aw, ay+ah, topZ,  view),
      project(ax+aw, ay+ah, baseZ, view),
      project(ax,    ay+ah, baseZ, view)
    ];
    items.push(item(
      Math.floor(ax) + Math.floor(ay + ah),
      SUB_ACTOR_SOUTH,
      () => fillPoly(ctx, southPoly, darken(color, 0.58))
    ));

    // East face — front edge is at ax+aw, so bucket = floor(ax+aw) + floor(ay)
    const eastPoly = [
      project(ax+aw, ay,    topZ,  view),
      project(ax+aw, ay+ah, topZ,  view),
      project(ax+aw, ay+ah, baseZ, view),
      project(ax+aw, ay,    baseZ, view)
    ];
    items.push(item(
      Math.floor(ax + aw) + Math.floor(ay),
      SUB_ACTOR_EAST,
      () => fillPoly(ctx, eastPoly, darken(color, 0.72))
    ));

    // Top face — placed in the bucket of the actor's origin tile
    const topPoly = [
      project(ax,    ay,    topZ, view),
      project(ax+aw, ay,    topZ, view),
      project(ax+aw, ay+ah, topZ, view),
      project(ax,    ay+ah, topZ, view)
    ];
    items.push(item(
      Math.floor(ax) + Math.floor(ay),
      SUB_ACTOR_TOP,
      () => {
        fillPoly(ctx, topPoly, color);
        const diff = topZ - playerRefZ;
        if (Math.abs(diff) >= HEIGHT_CUE_THRESHOLD) {
          const alpha = getCueAlpha(diff);
          fillPoly(ctx, topPoly,
            diff > 0 ? `${ABOVE_TINT}${alpha})` : `${BELOW_TINT}${alpha})`);
        }
        const strokeColor = actor.kind === K.TIMED_GATE
          ? 'rgba(254,215,170,0.4)'
          : 'rgba(241,245,249,0.2)';
        strokePoly(ctx, topPoly, strokeColor,
          actor.kind === K.TIMED_GATE ? 1 : 1.1);
      }
    ));

    return items;
  }

  // ─── Marble items ─────────────────────────────────────────────────────────
  //
  // Both shadow and ball are placed in the integer tile bucket the marble
  // currently occupies: Math.floor(marble.x) + Math.floor(marble.y).
  // This guarantees that any terrain face or actor face in a tile further
  // forward (higher bucket) is drawn after the marble and correctly covers it.

  function marbleItems(ctx, runtime, view) {
    const marble  = runtime.marble;
    const shadowZ = getVisualSupportZ(
      runtime, marble.x, marble.y, marble.supportRadius,
      runtime.level.voidFloor ?? -1.5
    );
    const hgt     = Math.max(0, marble.z - shadowZ);
    const renderZ = marble.grounded
      ? marble.z
      : marble.z + Math.min(hgt * AIRBORNE_LIFT_FACTOR, AIRBORNE_LIFT_MAX);

    const shadowPt = project(marble.x, marble.y, shadowZ, view);
    const ballPt   = project(marble.x, marble.y, renderZ, view);
    const radius   = Math.max(8, view.tileW * marble.renderRadius * 0.9);

    // Integer tile bucket — the tile the marble is standing in
    const bucket = Math.floor(marble.x) + Math.floor(marble.y);

    const sx  = shadowPt.x;
    const sy  = shadowPt.y + radius * 0.35;
    const srx = radius * 0.95;
    const sry = radius * 0.48;

    return [
      item(bucket, SUB_MARBLE_SHADOW, () => {
        ctx.beginPath();
        ctx.ellipse(sx, sy, srx, sry, 0, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.fill();
      }),
      item(bucket, SUB_MARBLE_BALL, () => {
        const grad = ctx.createRadialGradient(
          ballPt.x - radius*0.35, ballPt.y - radius*0.48, radius*0.14,
          ballPt.x, ballPt.y, radius
        );
        grad.addColorStop(0,    '#ffffff');
        grad.addColorStop(0.22, '#dbeafe');
        grad.addColorStop(1,    '#475569');
        ctx.beginPath();
        ctx.arc(ballPt.x, ballPt.y, radius, 0, Math.PI*2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 2;
        ctx.stroke();
      })
    ];
  }

  // ─── Background ───────────────────────────────────────────────────────────

  function drawBackground(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1323');
    g.addColorStop(1, '#04070e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.16;
    const gA = ctx.createRadialGradient(w*0.24,h*0.2,10,w*0.24,h*0.2,w*0.3);
    gA.addColorStop(0,'rgba(125,211,252,0.42)');
    gA.addColorStop(1,'rgba(125,211,252,0)');
    ctx.fillStyle = gA; ctx.fillRect(0,0,w,h);
    const gB = ctx.createRadialGradient(w*0.78,h*0.74,10,w*0.78,h*0.74,w*0.25);
    gB.addColorStop(0,'rgba(192,132,252,0.32)');
    gB.addColorStop(1,'rgba(192,132,252,0)');
    ctx.fillStyle = gB; ctx.fillRect(0,0,w,h);
    ctx.restore();
  }

  // ─── Goal ─────────────────────────────────────────────────────────────────

  function drawGoal(ctx, runtime, view) {
    const goal = runtime.level.goal;
    if (!goal) return;
    const s = window.MarbleLevels.sampleVisualSurface(
      runtime.level, goal.x, goal.y, runtime.dynamicState
    );
    const z = (s ? s.z : 0) + 0.22;
    const p = project(goal.x, goal.y, z, view);
    const r = Math.max(8, view.tileW * goal.radius * 0.42);
    const g = ctx.createRadialGradient(
      p.x - r*0.25, p.y - r*0.3, r*0.15,
      p.x, p.y, r
    );
    g.addColorStop(0,    'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(110,231,183,0.95)');
    g.addColorStop(1,    'rgba(34,197,94,0.42)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI*2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // ─── Debug overlays ───────────────────────────────────────────────────────

  function drawRouteGraph(ctx, runtime, view) {
    if (!runtime.debug?.showRouteGraph || !runtime.level.routeGraph) return;
    const nodes    = runtime.level.routeGraph.nodes || [];
    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
    ctx.save();
    ctx.strokeStyle = 'rgba(250,204,21,0.6)';
    ctx.lineWidth   = 1.4;
    for (const edge of runtime.level.routeGraph.edges || []) {
      const a = nodeById[edge.from];
      const b = nodeById[edge.to];
      if (!a || !b || typeof a.x !== 'number') continue;
      const p1 = project(a.x, a.y, (a.z ?? 0) + 0.1, view);
      const p2 = project(b.x, b.y, (b.z ?? 0) + 0.1, view);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (const n of nodes) {
      if (typeof n.x !== 'number') continue;
      const p = project(n.x, n.y, (n.z ?? 0) + 0.14, view);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(253,224,71,0.88)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStatus(ctx, runtime, cssWidth) {
    if (runtime.status === 'running') return;
    ctx.save();
    ctx.font      = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(230,237,243,0.88)';
    const label = runtime.status === 'completed' ? 'Cleared'
                : runtime.status === 'failed'    ? 'Failed'
                : runtime.status;
    ctx.fillText(label, cssWidth - 18, 28);
    ctx.restore();
  }

  // ─── Main draw ────────────────────────────────────────────────────────────

  function draw(runtime, canvas) {
    if (!runtime || !canvas) return;

    const { ctx, cssWidth, cssHeight } = fitCanvas(canvas);
    const view       = createView(runtime, cssWidth, cssHeight);
    const playerRefZ = getPlayerRefZ(runtime);

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    drawBackground(ctx, cssWidth, cssHeight);

    // Collect all draw items
    const list = [];

    for (const { tx, ty } of getTileOrder(runtime.level)) {
      for (const it of terrainItems(ctx, runtime, tx, ty, view, playerRefZ))
        list.push(it);
      for (const it of blockerItems(ctx, runtime, tx, ty, view))
        list.push(it);
    }

    for (const actor of runtime.level.actors) {
      for (const it of actorItems(ctx, runtime, actor, view, playerRefZ))
        list.push(it);
    }

    for (const it of marbleItems(ctx, runtime, view))
      list.push(it);

    // Sort: ascending bucket (back to front), then ascending sub-order
    list.sort((a, b) => a.bucket - b.bucket || a.sub - b.sub);

    // Draw in order
    for (const it of list) it.draw();

    // Overlays always on top
    drawGoal(ctx, runtime, view);
    drawRouteGraph(ctx, runtime, view);
    drawStatus(ctx, runtime, cssWidth);
  }

  function prepare(runtime) { return runtime; }

  window.MarbleRenderer = { prepare, render: draw };
})();
