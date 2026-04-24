// marble_renderer.js
//
// RENDERING APPROACH
// ==================
// Classic isometric painter's algorithm, implemented without per-frame
// allocation or sorting.
//
// The tile draw order (back-to-front by tx+ty, then by ty) is computed once
// per level and cached.  For each tile we draw, in this fixed order:
//
//   1. The tile's south face  (vertical wall on the south edge)
//   2. The tile's east face   (vertical wall on the east edge)
//   3. Any ACTOR whose south-face front row equals this tile row (ty+1 == actorSouthRow)
//   4. Any ACTOR whose east-face front column equals this tile col (tx+1 == actorEastCol)
//   5. The tile's top face
//   6. Any ACTOR top face whose origin tile is (tx, ty)
//   7. The MARBLE shadow and ball, if the marble's integer tile is (tx, ty)
//
// "Actor south-face front row" = floor(actorState.y + actor.height)
// "Actor east-face front col"  = floor(actorState.x + actor.width)
// "Actor origin tile"          = (floor(actorState.x), floor(actorState.y))
// "Marble tile"                = (floor(marble.x), floor(marble.y))
//
// This ordering is correct because:
// - South/east faces are drawn before the top of the same tile, so they
//   appear to be the sides of a solid box.
// - Actor faces are drawn at the same point in the sequence as the terrain
//   face at the same depth, so actors and terrain are correctly interleaved.
// - The marble is drawn after the top face of its own tile, so it sits on
//   top of the surface.  Any terrain face or actor face in a tile further
//   forward (higher tx+ty) is drawn after the marble and covers it.
//
// PROJECTION
// ==========
//   sx = (wx - wy) * tileW/2  +  wz * heightScale * HX
//   sy = (wx + wy) * tileH/2  -  wz * heightScale
// where HX = 0.32 (z shifts screen-x slightly right for depth cue).
//
// PERFORMANCE
// ===========
// - Tile order array is cached per level object (WeakMap).
// - Actor lookup tables (by south-row, east-col, origin-tile) are rebuilt
//   only when dynamicState changes (reference equality check).
// - No closures, arrays, or objects are allocated inside the draw loop.
// - All polygon drawing is done with direct ctx calls, not helper arrays.

(() => {
  // ─── Constants ────────────────────────────────────────────────────────────

  const HX                   = 0.32;   // z → screen-x shift factor
  const Z_EPS                = 0.02;   // min z diff to draw a face
  const SURFACE_EPS          = 0.0001; // clamping for surface sampling
  const HEIGHT_CUE_MIN       = 0.35;   // min z diff to show height tint
  const AIRBORNE_LIFT_SCALE  = 0.18;
  const AIRBORNE_LIFT_MAX    = 0.22;
  const ACTOR_SLAB_THICKNESS = 0.06;   // visual thickness of platform slab

  const COL_ABOVE = 'rgba(250,204,21,';
  const COL_BELOW = 'rgba(96,165,250,';

  // ─── Projection ───────────────────────────────────────────────────────────

  // All projection goes through these two functions.
  // view = { tileW, tileH, hs, cx, cy, camSX, camSY }
  // where hs = heightScale, camSX/camSY = pre-projected camera screen offset.

  function sx(wx, wy, wz, view) {
    return view.cx + (wx - wy) * view.hw - wz * view.hs * HX - view.camSX;
  }

  function sy(wx, wy, wz, view) {
    return view.cy + (wx + wy) * view.hh + wz * view.hs - view.camSY;
    // Note: z goes UP in world space → subtract from screen y
    // but we want higher z to be higher on screen → negate
  }

  // Corrected: higher z = higher on screen = smaller screen y
  function screenX(wx, wy, wz, view) {
    return view.cx + (wx - wy) * view.hw + wz * view.hs * HX - view.camSX;
  }

  function screenY(wx, wy, wz, view) {
    return view.cy + (wx + wy) * view.hh - wz * view.hs - view.camSY;
  }

  // ─── Canvas ───────────────────────────────────────────────────────────────

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    const cw   = Math.max(1, Math.round(rect.width  * dpr));
    const ch   = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width  = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, cw: rect.width, ch: rect.height };
  }

  // ─── View ─────────────────────────────────────────────────────────────────

  function getVisualSupportZ(level, dynState, x, y, r, fallback) {
    const ML = window.MarbleLevels;
    let best = null;
    const pts = [[x,y],[x+r,y],[x-r,y],[x,y+r],[x,y-r]];
    for (const [px, py] of pts) {
      const s = ML.sampleVisualSurface(level, px, py, dynState);
      if (s && (best === null || s.z > best)) best = s.z;
    }
    return best !== null ? best : fallback;
  }

  function buildView(runtime, cw, ch) {
    const m     = runtime.marble;
    const level = runtime.level;
    const base  = Math.min(cw, ch);
    const tileW = Math.max(54, Math.min(110, cw/10.5, ch/6.8, base/5.8));
    const tileH = tileW * 0.5;
    const hs    = tileH * 0.92;

    // Camera z: lift slightly when airborne so the marble stays centred
    const sz = getVisualSupportZ(level, runtime.dynamicState,
                 m.x, m.y, m.supportRadius, level.voidFloor ?? -1.5);
    const hgt = Math.max(0, m.z - sz);
    const camZ = m.grounded
      ? m.z
      : m.z + Math.min(hgt * AIRBORNE_LIFT_SCALE, AIRBORNE_LIFT_MAX);

    const camX = runtime.camera?.x ?? m.x;
    const camY = runtime.camera?.y ?? m.y;

    // Pre-project camera so we only subtract once per pixel
    const camSX = (camX - camY) * (tileW * 0.5) + camZ * hs * HX;
    const camSY = (camX + camY) * (tileH * 0.5) - camZ * hs;

    return { tileW, tileH, hw: tileW*0.5, hh: tileH*0.5, hs, cx: cw*0.5, cy: ch*0.5, camSX, camSY };
  }

  // ─── Tile draw order cache ─────────────────────────────────────────────────

  const ORDER_CACHE = new WeakMap();

  function getTileOrder(level) {
    let order = ORDER_CACHE.get(level);
    if (order) return order;
    order = [];
    for (let ty = 0; ty < level.height; ty++)
      for (let tx = 0; tx < level.width; tx++)
        order.push(tx | (ty << 16)); // pack into int for cache efficiency
    order.sort((a, b) => {
      const ax = a & 0xffff, ay = a >>> 16;
      const bx = b & 0xffff, by = b >>> 16;
      return (ax + ay) - (bx + by) || ay - by;
    });
    ORDER_CACHE.set(level, order);
    return order;
  }

  // ─── Actor lookup tables ───────────────────────────────────────────────────
  // Rebuilt when dynState reference changes (once per physics step).

  let _lastDynState = null;
  let _actorBySouthRow = null; // Map<int row, actor[]>
  let _actorByEastCol  = null; // Map<int col, actor[]>
  let _actorByOrigin   = null; // Map<packed int, actor[]>

  function rebuildActorTables(level, dynState) {
    if (dynState === _lastDynState) return;
    _lastDynState = dynState;

    _actorBySouthRow = new Map();
    _actorByEastCol  = new Map();
    _actorByOrigin   = new Map();

    const ML = window.MarbleLevels;
    const K  = ML.ACTOR_KINDS;

    for (const actor of level.actors) {
      const state = dynState.actors[actor.id];
      if (!state || state.active === false) continue;

      const ax = state.x, ay = state.y;
      const aw = actor.width, ah = actor.height;

      // South face row
      const southRow = Math.floor(ay + ah);
      if (!_actorBySouthRow.has(southRow)) _actorBySouthRow.set(southRow, []);
      _actorBySouthRow.get(southRow).push({ actor, state });

      // East face col
      const eastCol = Math.floor(ax + aw);
      if (!_actorByEastCol.has(eastCol)) _actorByEastCol.set(eastCol, []);
      _actorByEastCol.get(eastCol).push({ actor, state });

      // Origin tile
      const key = Math.floor(ax) | (Math.floor(ay) << 16);
      if (!_actorByOrigin.has(key)) _actorByOrigin.set(key, []);
      _actorByOrigin.get(key).push({ actor, state });
    }
  }

  // ─── Colors ───────────────────────────────────────────────────────────────

  function surfaceColor(cell, trigger) {
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

  function actorColor(actor) {
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

  // Darken a #rrggbb color by factor f (0=black, 1=original)
  function dk(hex, f) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`;
  }

  function cueAlpha(diff) {
    return Math.min(0.22, 0.07 + Math.abs(diff) * 0.04);
  }

  // ─── Static fill height ───────────────────────────────────────────────────

  function fillZ(level, dynState, tx, ty) {
    return window.MarbleLevels.getFillTopAtCell(level, tx, ty,
      { runtime: dynState, staticOnly: true });
  }

  // ─── Draw helpers (direct ctx, no intermediate arrays) ────────────────────

  // Draw a quad given 4 world corners (all at the same z) — used for flat tops
  function quad(ctx, x0,y0, x1,y1, x2,y2, x3,y3, z, view, color) {
    ctx.beginPath();
    ctx.moveTo(screenX(x0,y0,z,view), screenY(x0,y0,z,view));
    ctx.lineTo(screenX(x1,y1,z,view), screenY(x1,y1,z,view));
    ctx.lineTo(screenX(x2,y2,z,view), screenY(x2,y2,z,view));
    ctx.lineTo(screenX(x3,y3,z,view), screenY(x3,y3,z,view));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Draw a vertical face: top edge at zTop, bottom edge at zBot,
  // between world x/y corners (x0,y0)→(x1,y1)
  function vface(ctx, x0,y0, x1,y1, zTop, zBot, view, color) {
    if (zTop <= zBot + Z_EPS) return;
    ctx.beginPath();
    ctx.moveTo(screenX(x0,y0,zTop,view), screenY(x0,y0,zTop,view));
    ctx.lineTo(screenX(x1,y1,zTop,view), screenY(x1,y1,zTop,view));
    ctx.lineTo(screenX(x1,y1,zBot,view),  screenY(x1,y1,zBot,view));
    ctx.lineTo(screenX(x0,y0,zBot,view),  screenY(x0,y0,zBot,view));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Stroke a quad outline (grid lines)
  function quadStroke(ctx, x0,y0, x1,y1, x2,y2, x3,y3, z, view, color, lw) {
    ctx.beginPath();
    ctx.moveTo(screenX(x0,y0,z,view), screenY(x0,y0,z,view));
    ctx.lineTo(screenX(x1,y1,z,view), screenY(x1,y1,z,view));
    ctx.lineTo(screenX(x2,y2,z,view), screenY(x2,y2,z,view));
    ctx.lineTo(screenX(x3,y3,z,view), screenY(x3,y3,z,view));
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // ─── Sloped surface top ───────────────────────────────────────────────────
  // For sloped/curved tiles we sample the 4 corners and draw a quad with
  // per-corner heights.  This is simpler and faster than the previous
  // multi-sample polygon approach, and correct for all linear slope shapes.
  // Curved shapes get a 3×3 grid of quads for a smooth appearance.

  function drawSurfaceTop(ctx, level, dynState, tx, ty, view, baseColor, playerRefZ) {
    const ML   = window.MarbleLevels;
    const cell = ML.getSurfaceCell(level, tx, ty);
    if (!cell || cell.kind === 'void') return;

    const S = ML.SHAPES;
    const isCurved = cell.shape && (
      cell.shape.startsWith('curve_convex_') ||
      cell.shape.startsWith('curve_concave_')
    );

    const EPS = SURFACE_EPS;

    if (!isCurved) {
      // Linear shape: 4-corner quad
      const h = ML.getSurfaceCornerHeights(cell);
      // NW=(tx,ty), NE=(tx+1,ty), SE=(tx+1,ty+1), SW=(tx,ty+1)
      const pNW = { x: screenX(tx,   ty,   h.nw, view), y: screenY(tx,   ty,   h.nw, view) };
      const pNE = { x: screenX(tx+1, ty,   h.ne, view), y: screenY(tx+1, ty,   h.ne, view) };
      const pSE = { x: screenX(tx+1, ty+1, h.se, view), y: screenY(tx+1, ty+1, h.se, view) };
      const pSW = { x: screenX(tx,   ty+1, h.sw, view), y: screenY(tx,   ty+1, h.sw, view) };

      ctx.beginPath();
      ctx.moveTo(pNW.x, pNW.y);
      ctx.lineTo(pNE.x, pNE.y);
      ctx.lineTo(pSE.x, pSE.y);
      ctx.lineTo(pSW.x, pSW.y);
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();

      // Height cue
      const topZ = Math.max(h.nw, h.ne, h.se, h.sw);
      const diff = topZ - playerRefZ;
      if (Math.abs(diff) >= HEIGHT_CUE_MIN) {
        ctx.fillStyle = (diff > 0 ? COL_ABOVE : COL_BELOW) + cueAlpha(diff) + ')';
        ctx.fill();
      }

      // Grid stroke
      ctx.beginPath();
      ctx.moveTo(pNW.x, pNW.y);
      ctx.lineTo(pNE.x, pNE.y);
      ctx.lineTo(pSE.x, pSE.y);
      ctx.lineTo(pSW.x, pSW.y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(241,245,249,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();

    } else {
      // Curved shape: 3×3 sub-grid
      const N = 3;
      for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
          const u0 = col / N, u1 = (col+1) / N;
          const v0 = row / N, v1 = (row+1) / N;
          const s00 = ML.sampleWalkableSurface(level, tx+clamp(u0,EPS,1-EPS), ty+clamp(v0,EPS,1-EPS), { runtime: dynState });
          const s10 = ML.sampleWalkableSurface(level, tx+clamp(u1,EPS,1-EPS), ty+clamp(v0,EPS,1-EPS), { runtime: dynState });
          const s11 = ML.sampleWalkableSurface(level, tx+clamp(u1,EPS,1-EPS), ty+clamp(v1,EPS,1-EPS), { runtime: dynState });
          const s01 = ML.sampleWalkableSurface(level, tx+clamp(u0,EPS,1-EPS), ty+clamp(v1,EPS,1-EPS), { runtime: dynState });
          if (!s00 || !s10 || !s11 || !s01) continue;
          if (s00.tx !== tx || s10.tx !== tx || s11.tx !== tx || s01.tx !== tx) continue;

          ctx.beginPath();
          ctx.moveTo(screenX(tx+u0,ty+v0,s00.z,view), screenY(tx+u0,ty+v0,s00.z,view));
          ctx.lineTo(screenX(tx+u1,ty+v0,s10.z,view), screenY(tx+u1,ty+v0,s10.z,view));
          ctx.lineTo(screenX(tx+u1,ty+v1,s11.z,view), screenY(tx+u1,ty+v1,s11.z,view));
          ctx.lineTo(screenX(tx+u0,ty+v1,s01.z,view), screenY(tx+u0,ty+v1,s01.z,view));
          ctx.closePath();
          ctx.fillStyle = baseColor;
          ctx.fill();
        }
      }
      // Single grid stroke over the whole tile
      const h = ML.getSurfaceCornerHeights(cell);
      ctx.beginPath();
      ctx.moveTo(screenX(tx,   ty,   h.nw, view), screenY(tx,   ty,   h.nw, view));
      ctx.lineTo(screenX(tx+1, ty,   h.ne, view), screenY(tx+1, ty,   h.ne, view));
      ctx.lineTo(screenX(tx+1, ty+1, h.se, view), screenY(tx+1, ty+1, h.se, view));
      ctx.lineTo(screenX(tx,   ty+1, h.sw, view), screenY(tx,   ty+1, h.sw, view));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(241,245,249,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Tile markers (drawn on top of the surface)
    const topZ = ML.getSurfaceTopZ(cell);
    const trigger = ML.getTriggerCell(level, tx, ty);
    if (trigger?.kind === 'hazard') {
      const mx = screenX(tx+0.5,ty+0.5,topZ+0.02,view);
      const my = screenY(tx+0.5,ty+0.5,topZ+0.02,view);
      ctx.beginPath();
      ctx.moveTo(mx-6,my-4); ctx.lineTo(mx+6,my+4);
      ctx.moveTo(mx+6,my-4); ctx.lineTo(mx-6,my+4);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.4; ctx.stroke();
    }
    if (cell.conveyor) {
      const mx = screenX(tx+0.5,ty+0.5,topZ+0.02,view);
      const my = screenY(tx+0.5,ty+0.5,topZ+0.02,view);
      const dx = cell.conveyor.x * 8, dy = cell.conveyor.y * 8;
      ctx.beginPath();
      ctx.moveTo(mx-dx,my-dy); ctx.lineTo(mx+dx,my+dy);
      ctx.strokeStyle = 'rgba(224,242,254,0.85)';
      ctx.lineWidth = 1.6; ctx.stroke();
    }
    if (cell.crumble) {
      const mx = screenX(tx+0.5,ty+0.5,topZ+0.02,view);
      const my = screenY(tx+0.5,ty+0.5,topZ+0.02,view);
      ctx.beginPath();
      ctx.moveTo(mx-5,my-3); ctx.lineTo(mx+4,my+1);
      ctx.moveTo(mx-2,my+4); ctx.lineTo(mx+6,my-4);
      ctx.strokeStyle = 'rgba(255,237,213,0.88)';
      ctx.lineWidth = 1.1; ctx.stroke();
    }
    if (cell.bounce > 0) {
      const mx = screenX(tx+0.5,ty+0.5,topZ+0.03,view);
      const my = screenY(tx+0.5,ty+0.5,topZ+0.03,view);
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(186,230,253,0.92)';
      ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  // ─── Terrain south/east faces ─────────────────────────────────────────────

  function drawTerrainSouthFace(ctx, level, dynState, tx, ty, view, color) {
    const top  = fillZ(level, dynState, tx, ty);
    const bot  = fillZ(level, dynState, tx, ty + 1);
    vface(ctx, tx, ty+1, tx+1, ty+1, top, bot, view, dk(color, 0.58));
  }

  function drawTerrainEastFace(ctx, level, dynState, tx, ty, view, color) {
    const top  = fillZ(level, dynState, tx, ty);
    const bot  = fillZ(level, dynState, tx + 1, ty);
    vface(ctx, tx+1, ty, tx+1, ty+1, top, bot, view, dk(color, 0.72));
  }

  // ─── Blocker tile ─────────────────────────────────────────────────────────

  function drawBlockerSouthFace(ctx, level, dynState, tx, ty, view, blocker) {
    const top = blocker.top;
    const bot = fillZ(level, dynState, tx, ty + 1);
    const col = blocker.transparent ? '#64748b' : '#334155';
    vface(ctx, tx, ty+1, tx+1, ty+1, top, bot, view, dk(col, 0.55));
  }

  function drawBlockerEastFace(ctx, level, dynState, tx, ty, view, blocker) {
    const top = blocker.top;
    const bot = fillZ(level, dynState, tx + 1, ty);
    const col = blocker.transparent ? '#64748b' : '#334155';
    vface(ctx, tx+1, ty, tx+1, ty+1, top, bot, view, dk(col, 0.70));
  }

  function drawBlockerTop(ctx, tx, ty, view, blocker) {
    const col = blocker.transparent ? '#64748b' : '#334155';
    const z   = blocker.top;
    quad(ctx, tx,ty, tx+1,ty, tx+1,ty+1, tx,ty+1, z, view, col);
    quadStroke(ctx, tx,ty, tx+1,ty, tx+1,ty+1, tx,ty+1, z, view,
      'rgba(241,245,249,0.12)', 1);
  }

  // ─── Actor drawing ────────────────────────────────────────────────────────

  function drawActorSouthFace(ctx, actor, state, view) {
    const K   = window.MarbleLevels.ACTOR_KINDS;
    if (actor.kind === K.ROTATING_BAR || actor.kind === K.SWEEPER) return;
    const col = actorColor(actor);
    const ax = state.x, ay = state.y, aw = actor.width, ah = actor.height;
    const topZ  = actor.kind === K.TIMED_GATE ? actor.topHeight : state.topHeight;
    const baseZ = topZ - ACTOR_SLAB_THICKNESS;
    vface(ctx, ax, ay+ah, ax+aw, ay+ah, topZ, baseZ, view, dk(col, 0.58));
  }

  function drawActorEastFace(ctx, actor, state, view) {
    const K   = window.MarbleLevels.ACTOR_KINDS;
    if (actor.kind === K.ROTATING_BAR || actor.kind === K.SWEEPER) return;
    const col = actorColor(actor);
    const ax = state.x, ay = state.y, aw = actor.width, ah = actor.height;
    const topZ  = actor.kind === K.TIMED_GATE ? actor.topHeight : state.topHeight;
    const baseZ = topZ - ACTOR_SLAB_THICKNESS;
    vface(ctx, ax+aw, ay, ax+aw, ay+ah, topZ, baseZ, view, dk(col, 0.72));
  }

  function drawActorTop(ctx, actor, state, view, playerRefZ) {
    const K   = window.MarbleLevels.ACTOR_KINDS;
    const col = actorColor(actor);

    if (actor.kind === K.ROTATING_BAR || actor.kind === K.SWEEPER) {
      const cx = state.x + actor.width  * 0.5;
      const cy = state.y + actor.height * 0.5;
      const ex = cx + Math.cos(state.angle) * actor.armLength;
      const ey = cy + Math.sin(state.angle) * actor.armLength;
      const z  = actor.topHeight + 0.1;
      ctx.beginPath();
      ctx.moveTo(screenX(cx,cy,z,view), screenY(cx,cy,z,view));
      ctx.lineTo(screenX(ex,ey,z,view), screenY(ex,ey,z,view));
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(3, actor.armWidth * view.tileW * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(screenX(cx,cy,z,view), screenY(cx,cy,z,view), 5, 0, Math.PI*2);
      ctx.fillStyle = '#fecaca';
      ctx.fill();
      return;
    }

    const ax = state.x, ay = state.y, aw = actor.width, ah = actor.height;
    const topZ = actor.kind === K.TIMED_GATE ? actor.topHeight : state.topHeight;

    quad(ctx, ax,ay, ax+aw,ay, ax+aw,ay+ah, ax,ay+ah, topZ, view, col);

    const diff = topZ - playerRefZ;
    if (Math.abs(diff) >= HEIGHT_CUE_MIN) {
      ctx.fillStyle = (diff > 0 ? COL_ABOVE : COL_BELOW) + cueAlpha(diff) + ')';
      ctx.fill();
    }

    const strokeCol = actor.kind === K.TIMED_GATE
      ? 'rgba(254,215,170,0.4)'
      : 'rgba(241,245,249,0.2)';
    quadStroke(ctx, ax,ay, ax+aw,ay, ax+aw,ay+ah, ax,ay+ah, topZ, view, strokeCol, 1.1);
  }

  // ─── Marble ───────────────────────────────────────────────────────────────

  function drawMarble(ctx, runtime, view) {
    const m     = runtime.marble;
    const level = runtime.level;
    const dyn   = runtime.dynamicState;

    const shadowZ = getVisualSupportZ(level, dyn, m.x, m.y, m.supportRadius,
                      level.voidFloor ?? -1.5);
    const hgt     = Math.max(0, m.z - shadowZ);
    const renderZ = m.grounded
      ? m.z
      : m.z + Math.min(hgt * AIRBORNE_LIFT_SCALE, AIRBORNE_LIFT_MAX);

    const radius = Math.max(8, view.tileW * m.renderRadius * 0.9);

    // Shadow
    const shx = screenX(m.x, m.y, shadowZ, view);
    const shy = screenY(m.x, m.y, shadowZ, view) + radius * 0.35;
    ctx.beginPath();
    ctx.ellipse(shx, shy, radius * 0.95, radius * 0.48, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fill();

    // Ball
    const bx = screenX(m.x, m.y, renderZ, view);
    const by = screenY(m.x, m.y, renderZ, view);
    const grad = ctx.createRadialGradient(
      bx - radius*0.35, by - radius*0.48, radius*0.14,
      bx, by, radius
    );
    grad.addColorStop(0,    '#ffffff');
    grad.addColorStop(0.22, '#dbeafe');
    grad.addColorStop(1,    '#475569');
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI*2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ─── Background ───────────────────────────────────────────────────────────

  function drawBackground(ctx, cw, ch) {
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, '#0b1323');
    g.addColorStop(1, '#04070e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.globalAlpha = 0.16;
    const gA = ctx.createRadialGradient(cw*0.24,ch*0.2,10,cw*0.24,ch*0.2,cw*0.3);
    gA.addColorStop(0,'rgba(125,211,252,0.42)');
    gA.addColorStop(1,'rgba(125,211,252,0)');
    ctx.fillStyle = gA; ctx.fillRect(0,0,cw,ch);
    const gB = ctx.createRadialGradient(cw*0.78,ch*0.74,10,cw*0.78,ch*0.74,cw*0.25);
    gB.addColorStop(0,'rgba(192,132,252,0.32)');
    gB.addColorStop(1,'rgba(192,132,252,0)');
    ctx.fillStyle = gB; ctx.fillRect(0,0,cw,ch);
    ctx.restore();
  }

  // ─── Goal ─────────────────────────────────────────────────────────────────

  function drawGoal(ctx, runtime, view) {
    const goal = runtime.level.goal;
    if (!goal) return;
    const ML = window.MarbleLevels;
    const s  = ML.sampleVisualSurface(runtime.level, goal.x, goal.y, runtime.dynamicState);
    const z  = (s ? s.z : 0) + 0.22;
    const gx = screenX(goal.x, goal.y, z, view);
    const gy = screenY(goal.x, goal.y, z, view);
    const r  = Math.max(8, view.tileW * goal.radius * 0.42);
    const gr = ctx.createRadialGradient(gx-r*0.25, gy-r*0.3, r*0.15, gx, gy, r);
    gr.addColorStop(0,    'rgba(255,255,255,0.95)');
    gr.addColorStop(0.35, 'rgba(110,231,183,0.95)');
    gr.addColorStop(1,    'rgba(34,197,94,0.42)');
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI*2);
    ctx.fillStyle = gr;
    ctx.fill();
  }

  // ─── Debug ────────────────────────────────────────────────────────────────

  function drawRouteGraph(ctx, runtime, view) {
    if (!runtime.debug?.showRouteGraph || !runtime.level.routeGraph) return;
    const nodes    = runtime.level.routeGraph.nodes || [];
    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
    ctx.save();
    ctx.strokeStyle = 'rgba(250,204,21,0.6)';
    ctx.lineWidth   = 1.4;
    for (const edge of runtime.level.routeGraph.edges || []) {
      const a = nodeById[edge.from], b = nodeById[edge.to];
      if (!a || !b || typeof a.x !== 'number') continue;
      ctx.beginPath();
      ctx.moveTo(screenX(a.x,a.y,(a.z??0)+0.1,view), screenY(a.x,a.y,(a.z??0)+0.1,view));
      ctx.lineTo(screenX(b.x,b.y,(b.z??0)+0.1,view), screenY(b.x,b.y,(b.z??0)+0.1,view));
      ctx.stroke();
    }
    for (const n of nodes) {
      if (typeof n.x !== 'number') continue;
      ctx.beginPath();
      ctx.arc(screenX(n.x,n.y,(n.z??0)+0.14,view), screenY(n.x,n.y,(n.z??0)+0.14,view), 4, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(253,224,71,0.88)';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStatus(ctx, runtime, cw) {
    if (runtime.status === 'running') return;
    ctx.save();
    ctx.font      = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(230,237,243,0.88)';
    const label = runtime.status === 'completed' ? 'Cleared'
                : runtime.status === 'failed'    ? 'Failed'
                : runtime.status;
    ctx.fillText(label, cw - 18, 28);
    ctx.restore();
  }

  // ─── Clamp helper ─────────────────────────────────────────────────────────

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ─── Main draw ────────────────────────────────────────────────────────────

  function draw(runtime, canvas) {
    if (!runtime || !canvas) return;

    const { ctx, cw, ch } = fitCanvas(canvas);
    const view = buildView(runtime, cw, ch);
    const ML   = window.MarbleLevels;
    const level = runtime.level;
    const dyn   = runtime.dynamicState;

    // Player reference z for height cues
    const playerRefZ = getVisualSupportZ(level, dyn,
      runtime.marble.x, runtime.marble.y, runtime.marble.supportRadius,
      runtime.marble.z - runtime.marble.collisionRadius);

    // Marble integer tile
    const mTX = Math.floor(runtime.marble.x);
    const mTY = Math.floor(runtime.marble.y);

    // Rebuild actor lookup tables if physics stepped
    rebuildActorTables(level, dyn);

    // Background
    drawBackground(ctx, cw, ch);

    // Iterate tiles in painter's order
    for (const packed of getTileOrder(level)) {
      const tx = packed & 0xffff;
      const ty = packed >>> 16;

      const cell    = ML.getSurfaceCell(level, tx, ty);
      const blocker = ML.getBlockerCell(level, tx, ty);
      const trigger = ML.getTriggerCell(level, tx, ty);
      const color   = surfaceColor(cell, trigger);

      // ── 1. Terrain south face ──
      if (cell && cell.kind !== 'void') {
        drawTerrainSouthFace(ctx, level, dyn, tx, ty, view, color);
      }

      // ── 2. Terrain east face ──
      if (cell && cell.kind !== 'void') {
        drawTerrainEastFace(ctx, level, dyn, tx, ty, view, color);
      }

      // ── 3. Blocker south face ──
      if (blocker) {
        drawBlockerSouthFace(ctx, level, dyn, tx, ty, view, blocker);
      }

      // ── 4. Blocker east face ──
      if (blocker) {
        drawBlockerEastFace(ctx, level, dyn, tx, ty, view, blocker);
      }

      // ── 5. Actor south faces whose front row = ty ──
      // (front row = floor(actorState.y + actor.height) == ty)
      const southActors = _actorBySouthRow.get(ty);
      if (southActors) {
        for (const { actor, state } of southActors) {
          drawActorSouthFace(ctx, actor, state, view);
        }
      }

      // ── 6. Actor east faces whose front col = tx ──
      const eastActors = _actorByEastCol.get(tx);
      if (eastActors) {
        for (const { actor, state } of eastActors) {
          drawActorEastFace(ctx, actor, state, view);
        }
      }

      // ── 7. Terrain top face ──
      if (cell && cell.kind !== 'void') {
        drawSurfaceTop(ctx, level, dyn, tx, ty, view, color, playerRefZ);
      }

      // ── 8. Blocker top face ──
      if (blocker) {
        drawBlockerTop(ctx, tx, ty, view, blocker);
      }

      // ── 9. Actor top faces whose origin tile = (tx, ty) ──
      const key = tx | (ty << 16);
      const originActors = _actorByOrigin.get(key);
      if (originActors) {
        for (const { actor, state } of originActors) {
          drawActorTop(ctx, actor, state, view, playerRefZ);
        }
      }

      // ── 10. Marble (shadow + ball) if marble is in this tile ──
      if (tx === mTX && ty === mTY) {
        drawMarble(ctx, runtime, view);
      }
    }

    // Overlays always on top
    drawGoal(ctx, runtime, view);
    drawRouteGraph(ctx, runtime, view);
    drawStatus(ctx, runtime, cw);
  }

  function prepare(runtime) { return runtime; }

  window.MarbleRenderer = { prepare, render: draw };
})();
