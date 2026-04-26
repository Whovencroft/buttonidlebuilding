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
//   6. Any ACTOR top face whose BOTTOM-RIGHT footprint tile is (tx, ty)
//      (Drawing at the highest bucket in the footprint ensures the actor top
//       is painted AFTER all terrain tops in its footprint, preventing floor
//       tiles from bleeding over the actor when it emerges from the ground.)
//   7. The MARBLE shadow and ball, if the marble's integer tile is (tx, ty)
//
// "Actor south-face front row" = floor(actorState.y + actor.height)
// "Actor east-face front col"  = floor(actorState.x + actor.width)
// "Actor top draw tile"         = (floor(ax+aw-ε), floor(ay+ah-ε))  — bottom-right of footprint
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
  const FACE_MIN_EMERGE      = 1.0;    // min units above terrain before side faces are drawn

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
  // Rebuilt every frame because dynState is mutated in place (same reference
  // each frame), so reference equality cannot detect actor position changes.
  // We use the simulation clock to detect when a new physics step has run.

  let _lastSimClock = -1;
  let _actorBySouthTile    = null; // Map<packed (originX | southRow<<16), actor[]>
  let _actorByEastTile     = null; // Map<packed (eastCol | originY<<16), actor[]>
  let _actorByOrigin       = null; // Map<packed (topDrawX | topDrawY<<16), actor[]> — bottom-right tile of each actor's footprint

  function rebuildActorTables(level, dynState) {
    // dynState is mutated in place, so compare clock to detect physics steps
    if (dynState.clock === _lastSimClock) return;
    _lastSimClock = dynState.clock;

    _actorBySouthTile    = new Map();
    _actorByEastTile     = new Map();
    _actorByOrigin       = new Map();

    const ML = window.MarbleLevels;
    const K  = ML.ACTOR_KINDS;

    for (const actor of level.actors) {
      const state = dynState.actors[actor.id];
      if (!state || state.active === false) continue;

      const ax = state.x, ay = state.y;
      const aw = actor.width, ah = actor.height;
      const originX = Math.floor(ax);
      const originY = Math.floor(ay);

      // South face: drawn once at tile (originX, southRow)
      // This places it at bucket (originX + southRow), which is the correct
      // depth for the left edge of the actor's south face.  Terrain tiles to
      // the right (higher tx) are in higher buckets and will paint over the
      // right portion of the face, preventing it from bleeding through.
      const southRow = Math.floor(ay + ah);
      const southKey = originX | (southRow << 16);
      if (!_actorBySouthTile.has(southKey)) _actorBySouthTile.set(southKey, []);
      _actorBySouthTile.get(southKey).push({ actor, state });

      // East face: drawn once at tile (eastCol, originY)
      const eastCol = Math.floor(ax + aw);
      const eastKey = eastCol | (originY << 16);
      if (!_actorByEastTile.has(eastKey)) _actorByEastTile.set(eastKey, []);
      _actorByEastTile.get(eastKey).push({ actor, state });

      // Actor top face: draw at the BOTTOM-RIGHT tile of the footprint
      // (highest painter bucket = floor(ax+aw-ε) + floor(ay+ah-ε)).
      // This ensures the actor top is drawn AFTER all terrain top faces in
      // its footprint, preventing floor tiles from painting over the actor.
      const topDrawX = Math.floor(ax + aw - 0.001);
      const topDrawY = Math.floor(ay + ah - 0.001);
      const key = topDrawX | (topDrawY << 16);
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

  // Draw a trapezoidal face: top-left corner at zTop0, top-right corner at zTop1,
  // bottom edge at zBot (uniform).  Used for sloped terrain side faces.
  function trapFace(ctx, x0,y0, x1,y1, zTop0, zTop1, zBot, view, color) {
    const visTop = Math.max(zTop0, zTop1);
    if (visTop <= zBot + Z_EPS) return;
    ctx.beginPath();
    ctx.moveTo(screenX(x0,y0,zTop0,view), screenY(x0,y0,zTop0,view));
    ctx.lineTo(screenX(x1,y1,zTop1,view), screenY(x1,y1,zTop1,view));
    ctx.lineTo(screenX(x1,y1,zBot,view),  screenY(x1,y1,zBot,view));
    ctx.lineTo(screenX(x0,y0,zBot,view),  screenY(x0,y0,zBot,view));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Draw a general quadrilateral face with independent per-corner heights.
  // (x0,y0,zTL) = top-left, (x1,y1,zTR) = top-right,
  // (x1,y1,zBR) = bottom-right, (x0,y0,zBL) = bottom-left.
  // Skips drawing if the face has no visible area.
  function quadFace(ctx, x0,y0, x1,y1, zTL, zTR, zBR, zBL, view, color) {
    if (Math.max(zTL,zTR) <= Math.min(zBL,zBR) + Z_EPS) return;
    ctx.beginPath();
    ctx.moveTo(screenX(x0,y0,zTL,view), screenY(x0,y0,zTL,view));
    ctx.lineTo(screenX(x1,y1,zTR,view), screenY(x1,y1,zTR,view));
    ctx.lineTo(screenX(x1,y1,zBR,view), screenY(x1,y1,zBR,view));
    ctx.lineTo(screenX(x0,y0,zBL,view), screenY(x0,y0,zBL,view));
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

      // No grid stroke: a stroke bleeds outside the fill polygon boundary
      // and remains visible through terrain that correctly covers the fill.
      // (Same reason blocker tops and actor tops have no stroke.)

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
      // No grid stroke: a stroke bleeds outside the fill polygon boundary
      // and remains visible through terrain that correctly covers the fill.
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
  //
  // FLAT terrain tiles at the same height are grouped into contiguous solid
  // face sheets — exactly mirroring the blocker face grouping logic.
  // This eliminates seams between adjacent wall tiles that would otherwise
  // allow the marble sphere to visually bleed through.
  //
  // Sloped/curved tiles continue to draw per-tile because each has different
  // corner heights and cannot be grouped.
  //
  // South face grouping:
  //   Triggered at the LEFTMOST tile of a contiguous run of flat terrain at
  //   the same height with an exposed south face (tile to south is lower/void).
  //   Walks east to find the full width, then draws one wide polygon.
  //
  // East face grouping:
  //   Triggered at the TOPMOST (northernmost) tile of a contiguous run of flat
  //   terrain at the same height with an exposed east face (tile to east is
  //   lower/void).  Walks south to find the full height, then draws one tall
  //   polygon.

  // Helper: is this tile a flat terrain tile with a specific fillZ?
  function isFlatTerrainAt(level, dynState, tx, ty, expectedZ) {
    const ML   = window.MarbleLevels;
    const cell = ML.getSurfaceCell(level, tx, ty);
    if (!cell || cell.kind === 'void') return false;
    if (cell.shape && cell.shape !== 'flat') return false;
    if (ML.getBlockerCell(level, tx, ty)) return false; // blocker overrides terrain face
    const fz = fillZ(level, dynState, tx, ty);
    return Math.abs(fz - expectedZ) < 0.001;
  }

  // Helper: does this flat tile have an exposed south face?
  // (i.e. the tile to the south is lower, void, or a different height)
  function hasSouthFaceAt(level, dynState, tx, ty, topZ) {
    const ML = window.MarbleLevels;
    const bSouth = ML.getBlockerCell(level, tx, ty + 1);
    if (bSouth && bSouth.top >= topZ) return false; // blocker covers the face
    const botZ = fillZ(level, dynState, tx, ty + 1);
    return botZ === null || botZ < topZ - Z_EPS;
  }

  // Helper: does this flat tile have an exposed east face?
  function hasEastFaceAt(level, dynState, tx, ty, topZ) {
    const ML = window.MarbleLevels;
    const bEast = ML.getBlockerCell(level, tx + 1, ty);
    if (bEast && bEast.top >= topZ) return false;
    const botZ = fillZ(level, dynState, tx + 1, ty);
    return botZ === null || botZ < topZ - Z_EPS;
  }

  function drawTerrainSouthFace(ctx, level, dynState, tx, ty, view, color) {
    const ML   = window.MarbleLevels;
    const cell = ML.getSurfaceCell(level, tx, ty);
    const darkColor = dk(color, 0.58);
    if (cell && cell.kind !== 'void' && cell.shape && cell.shape !== 'flat') {
      // Sloped tile: draw per-tile with actual corner heights.
      // The bottom edge uses the NW/NE corners of the south neighbour tile so
      // that both the top AND bottom edges of the face polygon are correctly
      // sloped, eliminating triangular void gaps.
      const h = ML.getSurfaceCornerHeights(cell);
      const southCell = ML.getSurfaceCell(level, tx, ty + 1);
      let botL, botR;
      if (southCell && southCell.kind !== 'void' && southCell.shape && southCell.shape !== 'flat') {
        const hs = ML.getSurfaceCornerHeights(southCell);
        botL = Math.min(hs.nw, h.sw);
        botR = Math.min(hs.ne, h.se);
      } else {
        const flat = fillZ(level, dynState, tx, ty + 1);
        botL = Math.min(flat, h.sw);
        botR = Math.min(flat, h.se);
      }
      quadFace(ctx, tx, ty+1, tx+1, ty+1, h.sw, h.se, botR, botL, view, darkColor);
      return;
    }

    // Flat tile: group contiguous same-height flat tiles into a solid face sheet.
    const top = fillZ(level, dynState, tx, ty);
    if (top === null) return;

    // Only draw if this tile has an exposed south face
    if (!hasSouthFaceAt(level, dynState, tx, ty, top)) return;

    // Only draw at the LEFTMOST tile of the contiguous run
    // (west neighbour is not a flat tile at the same height with an exposed south face)
    if (isFlatTerrainAt(level, dynState, tx - 1, ty, top) &&
        hasSouthFaceAt(level, dynState, tx - 1, ty, top)) return;

    // Walk east to find the full width of this south face run
    let xEnd = tx + 1;
    while (isFlatTerrainAt(level, dynState, xEnd, ty, top) &&
           hasSouthFaceAt(level, dynState, xEnd, ty, top)) {
      xEnd++;
    }

    // Check for sloped neighbours that require bottom edge adjustment
    // (only for the leftmost and rightmost tiles in the run)
    const southCell2 = ML.getSurfaceCell(level, tx, ty + 1);
    const northCell2 = ML.getSurfaceCell(level, tx, ty - 1);
    const hasSlopedSouth = southCell2 && southCell2.kind !== 'void' && southCell2.shape && southCell2.shape !== 'flat';
    const hasLowerNorthRamp = northCell2 && northCell2.kind !== 'void' && northCell2.shape && northCell2.shape !== 'flat';

    if (hasSlopedSouth || hasLowerNorthRamp) {
      // For runs adjacent to slopes, fall back to per-tile drawing to preserve
      // the correct trapezoidal bottom edge shape at ramp transitions.
      // This only affects the first tile; the rest of the run draws normally below.
      let botL2 = fillZ(level, dynState, tx, ty + 1);
      let botR2 = botL2;
      if (hasSlopedSouth) {
        const hs2 = ML.getSurfaceCornerHeights(southCell2);
        botL2 = Math.min(botL2, hs2.nw);
        botR2 = Math.min(botR2, hs2.ne);
      }
      if (hasLowerNorthRamp) {
        const hn2 = ML.getSurfaceCornerHeights(northCell2);
        botL2 = Math.min(botL2, hn2.sw);
        botR2 = Math.min(botR2, hn2.se);
      }
      botL2 = Math.min(botL2, top);
      botR2 = Math.min(botR2, top);
      quadFace(ctx, tx, ty+1, tx+1, ty+1, top, top, botR2, botL2, view, darkColor);
      // Draw the rest of the run as a single solid sheet starting from tx+1
      if (xEnd > tx + 1) {
        const bot = fillZ(level, dynState, tx + 1, ty + 1) ?? (top - 2);
        vface(ctx, tx+1, ty+1, xEnd, ty+1, top, bot, view, darkColor);
      }
    } else {
      // Uniform run: draw as one solid sheet
      const bot = fillZ(level, dynState, tx, ty + 1) ?? (top - 2);
      vface(ctx, tx, ty+1, xEnd, ty+1, top, bot, view, darkColor);
    }
  }

  function drawTerrainEastFace(ctx, level, dynState, tx, ty, view, color) {
    const ML   = window.MarbleLevels;
    const cell = ML.getSurfaceCell(level, tx, ty);
    const lightColor = dk(color, 0.72);
    if (cell && cell.kind !== 'void' && cell.shape && cell.shape !== 'flat') {
      // Sloped tile: draw per-tile with actual corner heights.
      const h = ML.getSurfaceCornerHeights(cell);
      const eastCell = ML.getSurfaceCell(level, tx + 1, ty);
      let botT, botB;
      if (eastCell && eastCell.kind !== 'void' && eastCell.shape && eastCell.shape !== 'flat') {
        const he = ML.getSurfaceCornerHeights(eastCell);
        botT = Math.min(he.nw, h.ne);
        botB = Math.min(he.sw, h.se);
      } else {
        const flat = fillZ(level, dynState, tx + 1, ty);
        botT = Math.min(flat, h.ne);
        botB = Math.min(flat, h.se);
      }
      quadFace(ctx, tx+1, ty, tx+1, ty+1, h.ne, h.se, botB, botT, view, lightColor);
      return;
    }

    // Flat tile: group contiguous same-height flat tiles into a solid face sheet.
    const top = fillZ(level, dynState, tx, ty);
    if (top === null) return;

    // Only draw if this tile has an exposed east face
    if (!hasEastFaceAt(level, dynState, tx, ty, top)) return;

    // Only draw at the TOPMOST (northernmost) tile of the contiguous run
    // (north neighbour is not a flat tile at the same height with an exposed east face)
    if (isFlatTerrainAt(level, dynState, tx, ty - 1, top) &&
        hasEastFaceAt(level, dynState, tx, ty - 1, top)) return;

    // Walk south to find the full height of this east face run
    let yEnd = ty + 1;
    while (isFlatTerrainAt(level, dynState, tx, yEnd, top) &&
           hasEastFaceAt(level, dynState, tx, yEnd, top)) {
      yEnd++;
    }

    // Check for sloped neighbours that require bottom edge adjustment
    const eastCell2 = ML.getSurfaceCell(level, tx + 1, ty);
    const westCell2 = ML.getSurfaceCell(level, tx - 1, ty);
    const hasSlopedEast = eastCell2 && eastCell2.kind !== 'void' && eastCell2.shape && eastCell2.shape !== 'flat';
    const hasLowerWestRamp = westCell2 && westCell2.kind !== 'void' && westCell2.shape && westCell2.shape !== 'flat';

    if (hasSlopedEast || hasLowerWestRamp) {
      // Fall back to per-tile drawing for the first tile at a ramp transition.
      let botT2 = fillZ(level, dynState, tx + 1, ty);
      let botB2 = botT2;
      if (hasSlopedEast) {
        const he2 = ML.getSurfaceCornerHeights(eastCell2);
        botT2 = Math.min(botT2, he2.nw);
        botB2 = Math.min(botB2, he2.sw);
      }
      if (hasLowerWestRamp) {
        const hw2 = ML.getSurfaceCornerHeights(westCell2);
        botT2 = Math.min(botT2, hw2.ne);
        botB2 = Math.min(botB2, hw2.se);
      }
      botT2 = Math.min(botT2, top);
      botB2 = Math.min(botB2, top);
      quadFace(ctx, tx+1, ty, tx+1, ty+1, top, top, botB2, botT2, view, lightColor);
      // Draw the rest of the run as a single solid sheet starting from ty+1
      if (yEnd > ty + 1) {
        const bot = fillZ(level, dynState, tx + 1, ty + 1) ?? (top - 2);
        vface(ctx, tx+1, ty+1, tx+1, yEnd, top, bot, view, lightColor);
      }
    } else {
      // Uniform run: draw as one solid sheet
      const bot = fillZ(level, dynState, tx + 1, ty) ?? (top - 2);
      vface(ctx, tx+1, ty, tx+1, yEnd, top, bot, view, lightColor);
    }
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
    // No stroke: a stroke would bleed outside the fill polygon and remain
    // visible through terrain that correctly covers the fill.
  }

  // ─── Actor drawing ────────────────────────────────────────────────────────

  // Returns true if any terrain tile along the actor's south edge (the row of
  // tiles just inside the south boundary) has a fill top above actorTopZ.
  // We check every tile column that the actor spans.
  function actorSouthCovered(level, dyn, ax, ay, aw, ah, actorTopZ) {
    const southTY = Math.floor(ay + ah) - 1; // last row inside actor footprint
    const x0 = Math.floor(ax);
    const x1 = Math.floor(ax + aw - 0.001);
    for (let tx = x0; tx <= x1; tx++) {
      const t = fillZ(level, dyn, tx, southTY);
      if (t !== null && t > actorTopZ + Z_EPS) return true;
    }
    return false;
  }

  // Returns true if any terrain tile along the actor's east edge (the column
  // of tiles just inside the east boundary) has a fill top above actorTopZ.
  function actorEastCovered(level, dyn, ax, ay, aw, ah, actorTopZ) {
    const eastTX = Math.floor(ax + aw) - 1; // last column inside actor footprint
    const y0 = Math.floor(ay);
    const y1 = Math.floor(ay + ah - 0.001);
    for (let ty = y0; ty <= y1; ty++) {
      const t = fillZ(level, dyn, eastTX, ty);
      if (t !== null && t > actorTopZ + Z_EPS) return true;
    }
    return false;
  }

  // Returns true when the actor top face should be hidden because terrain at or
  // above the actor top covers any tile in the actor's footprint.
  // Only checks tiles WITHIN the footprint (no border) to avoid false positives
  // for platforms that travel along terrain edges (e.g. bridges).
  function actorTopCovered(level, dyn, ax, ay, aw, ah, actorTopZ) {
    const x0 = Math.floor(ax);
    const x1 = Math.floor(ax + aw - 0.001);
    const y0 = Math.floor(ay);
    const y1 = Math.floor(ay + ah - 0.001);
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const t = fillZ(level, dyn, tx, ty);
        if (t !== null && t >= actorTopZ - Z_EPS) return true;
      }
    }
    return false;
  }

  // Returns true if the actor has not yet emerged far enough above the terrain
  // for its south/east side faces to be worth drawing.  Prevents thin-line
  // artefacts when a platform is just barely poking through the floor.
  // Also checks the one-tile border surrounding the footprint so that elevators
  // rising through a shaft in a higher floor are correctly suppressed.
  function actorFaceSuppressed(level, dyn, ax, ay, aw, ah, actorTopZ) {
    const x0 = Math.floor(ax) - 1;
    const x1 = Math.floor(ax + aw - 0.001) + 1;
    const y0 = Math.floor(ay) - 1;
    const y1 = Math.floor(ay + ah - 0.001) + 1;
    let maxT = null;
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const t = fillZ(level, dyn, tx, ty);
        if (t !== null && (maxT === null || t > maxT)) maxT = t;
      }
    }
    // Suppress if actor top is within FACE_MIN_EMERGE of the highest terrain tile
    if (maxT !== null && actorTopZ < maxT + FACE_MIN_EMERGE) return true;
    return false;
  }

  function drawActorSouthFace(ctx, actor, state, view, level, dyn) {
    const K   = window.MarbleLevels.ACTOR_KINDS;
    if (actor.kind === K.ROTATING_BAR || actor.kind === K.SWEEPER) return;
    const col = actorColor(actor);
    const ax = state.x, ay = state.y, aw = actor.width, ah = actor.height;
    const topZ  = actor.kind === K.TIMED_GATE ? actor.topHeight : state.topHeight;
    // Skip if terrain covers the actor, or actor hasn't emerged enough above terrain
    const _sCov = actorTopCovered(level, dyn, ax, ay, aw, ah, topZ);
    const _sSup = actorFaceSuppressed(level, dyn, ax, ay, aw, ah, topZ);
    if (_sCov) return;
    if (_sSup) return;
    const baseZ = topZ - ACTOR_SLAB_THICKNESS;
    vface(ctx, ax, ay+ah, ax+aw, ay+ah, topZ, baseZ, view, dk(col, 0.58));
  }

  function drawActorEastFace(ctx, actor, state, view, level, dyn) {
    const K   = window.MarbleLevels.ACTOR_KINDS;
    if (actor.kind === K.ROTATING_BAR || actor.kind === K.SWEEPER) return;
    const col = actorColor(actor);
    const ax = state.x, ay = state.y, aw = actor.width, ah = actor.height;
    const topZ  = actor.kind === K.TIMED_GATE ? actor.topHeight : state.topHeight;
    // Skip if terrain covers the actor, or actor hasn't emerged enough above terrain
    if (actorTopCovered(level, dyn, ax, ay, aw, ah, topZ)) return;
    if (actorFaceSuppressed(level, dyn, ax, ay, aw, ah, topZ)) return;
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

    // No stroke: a stroke would bleed outside the fill polygon and remain
    // visible through terrain that correctly covers the fill.
  }

  // ─── Marble ───────────────────────────────────────────────────────────────
  //
  // The shadow and ball are drawn at DIFFERENT points in the tile loop:
  //
  //   Shadow: drawn at step 9 of bucket (mTX+mTY)  — after the terrain top
  //           face of the marble's own tile, so it sits ON the floor.
  //           Any terrain face in a higher bucket will paint over it.
  //
  //   Ball:   drawn at step 0 of bucket (mTX+mTY+1) — before the faces of
  //           the tile one step forward, so those faces correctly cover it.
  //
  // We cache the computed shadowZ and renderZ so both functions share the
  // same values without recomputing them.

  let _marbleShadowZ = 0;
  let _marbleRenderZ = 0;
  let _marbleRadius  = 0;

  function prepareMarble(runtime, view) {
    const m     = runtime.marble;
    const level = runtime.level;
    const dyn   = runtime.dynamicState;
    _marbleShadowZ = getVisualSupportZ(level, dyn, m.x, m.y, m.supportRadius,
                       level.voidFloor ?? -1.5);
    const hgt = Math.max(0, m.z - _marbleShadowZ);
    _marbleRenderZ = m.grounded
      ? m.z
      : m.z + Math.min(hgt * AIRBORNE_LIFT_SCALE, AIRBORNE_LIFT_MAX);
    _marbleRadius = Math.max(8, view.tileW * m.renderRadius * 0.9);
  }

  function drawMarbleShadow(ctx, runtime, view) {
    const m   = runtime.marble;
    const shx = screenX(m.x, m.y, _marbleShadowZ, view);
    const shy = screenY(m.x, m.y, _marbleShadowZ, view);
    ctx.beginPath();
    ctx.ellipse(shx, shy, _marbleRadius * 0.82, _marbleRadius * 0.38, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fill();
  }

  function drawMarbleBall(ctx, runtime, view) {
    const m  = runtime.marble;
    const bx = screenX(m.x, m.y, _marbleRenderZ, view);
    const by = screenY(m.x, m.y, _marbleRenderZ, view);
    const grad = ctx.createRadialGradient(
      bx - _marbleRadius*0.35, by - _marbleRadius*0.48, _marbleRadius*0.14,
      bx, by, _marbleRadius
    );
    grad.addColorStop(0,    '#ffffff');
    grad.addColorStop(0.22, '#dbeafe');
    grad.addColorStop(1,    '#475569');
    ctx.beginPath();
    ctx.arc(bx, by, _marbleRadius, 0, Math.PI*2);
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

  // ─── Marble visibility test ─────────────────────────────────────────────
  // Returns true if the marble is visually occluded by terrain in front of it.
  //
  // Occlusion model (isometric painter's algorithm):
  //
  //   SOUTH FACE of tile (tx, ty): a vertical wall at world y = ty+1, spanning
  //   world x [tx, tx+1).  It occludes the marble when the marble is in the
  //   SAME tile row (ty == mTY) and the face is taller than the marble.
  //   Checking only the marble's own row (ty=mTY) is correct because south
  //   faces in other rows are in different diagonal bands of the isometric
  //   grid and cannot visually overlap the marble's screen position.
  //
  //   EAST FACE of tile (tx, ty): a vertical wall at world x = tx+1, spanning
  //   world y [ty, ty+1).  It occludes the marble when the marble is in the
  //   SAME tile column (tx == mTX) and the face is taller than the marble.
  //
  //   BLOCKER south/east faces span multiple tiles; we walk the group to find
  //   the full extent and check if the marble falls within it.
  //
  //   The marble is occluded (hidden) in two situations:
  //
  //   1. INSIDE A WALL TILE — the marble's own tile is taller than the marble
  //      (e.g. spawned inside a wall, or physics tunnelling at high speed).
  //      Terrain collision normally prevents this during gameplay.
  //
  //   2. SPHERE OVERLAPS A LOWER-BUCKET FACE — the marble's sphere extends into
  //      a tile face that is drawn BEFORE the marble in painter's order (i.e. a
  //      face in a lower isometric bucket).  This happens when the marble is
  //      near the NW corner of its tile and an adjacent NW tile has a tall face.
  //
  //      In isometric projection, lower-bucket faces are drawn first.  If the
  //      marble's sphere overlaps such a face, the marble appears to float
  //      through the wall.  We hide the marble in this case.
  //
  //      The relevant faces are:
  //        - East face of tile (mTX-1, mTY): at world x = mTX, bucket mTX+mTY-1
  //          Overlaps marble sphere when mx - mTX < radius
  //        - South face of tile (mTX, mTY-1): at world y = mTY, bucket mTX+mTY-1
  //          Overlaps marble sphere when my - mTY < radius
  //
  //      We also check the adjacent SE tiles for the case where the marble is
  //      near the SE corner of its tile and a SE tile's face covers it:
  //        - South face of tile (mTX, mTY+1): at world y = mTY+2, bucket mTX+mTY+1
  //          This face is drawn AFTER the marble (same bucket, earlier step).
  //          Overlaps when my - mTY > 1 - radius
  //        - East face of tile (mTX+1, mTY): at world x = mTX+2, bucket mTX+mTY+1
  //          This face is drawn AFTER the marble (same bucket, earlier step).
  //          Overlaps when mx - mTX > 1 - radius
  function isMarbleOccluded(level, marble, _debugReason) {
    const ML     = window.MarbleLevels;
    const mx     = marble.x, my = marble.y, mz = marble.z;
    const mTX    = Math.floor(mx), mTY = Math.floor(my);
    const radius = marble.visualRadius ?? marble.collisionRadius ?? 0.225;
    const fx     = mx - mTX;   // fractional position within tile [0,1)
    const fy     = my - mTY;

    // Helper: is tile (tx,ty) tall enough to occlude the marble?
    function tallAt(tx, ty) {
      const blk = ML.getBlockerCell(level, tx, ty);
      if (blk && blk.top > mz + 0.05) return true;
      const fz = ML.getFillTopAtCell(level, tx, ty, { staticOnly: true });
      return fz !== null && fz > mz + 0.05;
    }

    // Case 1: marble is inside its own tile (wall tile or blocker)
    if (tallAt(mTX, mTY)) {
      if (_debugReason) _debugReason.reason = `own(${mTX},${mTY})`;
      return true;
    }

    // Case 2: marble sphere overlaps the east face of the tile to the NW
    // (tile (mTX-1, mTY), east face at world x = mTX, bucket mTX+mTY-1)
    // This face is drawn BEFORE the marble, so the marble floats through it.
    if (fx < radius && tallAt(mTX - 1, mTY)) {
      if (_debugReason) _debugReason.reason = `NW_east(${mTX-1},${mTY}) fx=${fx.toFixed(3)}`;
      return true;
    }

    // Case 3: marble sphere overlaps the south face of the tile to the NW
    // (tile (mTX, mTY-1), south face at world y = mTY, bucket mTX+mTY-1)
    if (fy < radius && tallAt(mTX, mTY - 1)) {
      if (_debugReason) _debugReason.reason = `NW_south(${mTX},${mTY-1}) fy=${fy.toFixed(3)}`;
      return true;
    }

    // Case 4: marble sphere overlaps the south face of the tile to the SE
    // (tile (mTX, mTY+1), south face at world y = mTY+2, bucket mTX+mTY+1)
    // This face is drawn in the same bucket as the marble but at an earlier step.
    if (fy > 1 - radius && tallAt(mTX, mTY + 1)) {
      if (_debugReason) _debugReason.reason = `SE_south(${mTX},${mTY+1}) fy=${fy.toFixed(3)}`;
      return true;
    }

    // Case 5: marble sphere overlaps the east face of the tile to the SE
    // (tile (mTX+1, mTY), east face at world x = mTX+2, bucket mTX+mTY+1)
    if (fx > 1 - radius && tallAt(mTX + 1, mTY)) {
      if (_debugReason) _debugReason.reason = `SE_east(${mTX+1},${mTY}) fx=${fx.toFixed(3)}`;
      return true;
    }

    return false;
  }

  // Expose for console debugging
  window._debugMarbleOcclusion = function() {
    const rt = window._marbleRuntime;
    if (!rt) return 'no runtime';
    const dbg = {};
    const result = isMarbleOccluded(rt.level, rt.marble, dbg);
    return `pos=(${rt.marble.x.toFixed(3)},${rt.marble.y.toFixed(3)},${rt.marble.z.toFixed(3)}) occluded=${result} reason=${dbg.reason||'none'}`;
  };

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

    // Pre-compute marble shadow/ball geometry once per frame.
    prepareMarble(runtime, view);
    const marbleOccluded = isMarbleOccluded(level, runtime.marble);

    // The shadow is drawn at step 9 of the marble's OWN tile bucket
    // (mTX+mTY), after the terrain top face of that tile.  This ensures
    // terrain faces in higher buckets paint over the shadow.
    //
    // The ball is drawn at step 0 of the NEXT bucket (mTX+mTY+1), before
    // the faces of that tile, so those faces correctly cover the ball.
    const mTX = Math.floor(runtime.marble.x);
    const mTY = Math.floor(runtime.marble.y);
    // The shadow and ball are both drawn after ALL top faces in bucket
    // (mTX+mTY) have been painted.  This prevents blocker top faces in the
    // marble's own tile bucket from appearing on top of the shadow.
    // The shadow fires at step 9b and the ball at step 9c of the same bucket,
    // so the ball is always drawn on top of the shadow.
    const shadowBucket = mTX + mTY;   // same bucket as ball — draw after all tops

    // When the marble is standing on a moving actor (elevator/bridge), the actor
    // top face is drawn at the bottom-right tile of the actor's footprint, which
    // may be in a HIGHER bucket than mTX+mTY+1.  If we draw the ball before that
    // bucket, the actor top face will paint over the marble.  So we advance
    // ballBucket to be at least the actor's top-draw bucket + 1.
    let ballBucket = mTX + mTY + 1;
    if (runtime.marble.supportSource === 'actor' && runtime.marble.supportRef) {
      const supportActorDef = level.actors.find(a => a.id === runtime.marble.supportRef);
      if (supportActorDef) {
        const supportActorState = dyn.actors[supportActorDef.id];
        if (supportActorState) {
          const ax = supportActorState.x, ay = supportActorState.y;
          const aw = supportActorDef.width, ah = supportActorDef.height;
          const topDrawX = Math.floor(ax + aw - 0.001);
          const topDrawY = Math.floor(ay + ah - 0.001);
          ballBucket = Math.max(ballBucket, topDrawX + topDrawY + 1);
        }
      }
    }

    // NOTE: SE corner ballBucket advancement was removed.
    // Wall occlusion is handled entirely by isMarbleOccluded(), which checks
    // whether any terrain tile in front of the marble is taller than the marble.
    // The ballBucket is only advanced for actor-on-platform cases (above).
    let shadowDrawn = false;
    let ballDrawn   = false;

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

      // Ball is drawn at step 9b of ballBucket (after the top face of that
      // tile), so the top face of the next tile does not cover the ball.
      // The ball is still covered by faces of tiles in higher buckets.
      // (Ball draw is at the BOTTOM of the loop body — see below)

      // ── 1. Actor south faces triggered at tile (tx, ty) ──
      // Each actor south face is drawn exactly once, at tile (floor(ax), southRow).
      // This gives it bucket (floor(ax)+southRow), so terrain tiles to the right
      // and south are in higher buckets and correctly paint over it.
      const southActors = _actorBySouthTile.get(tx | (ty << 16));
      if (southActors) {
        for (const { actor, state } of southActors) {
          drawActorSouthFace(ctx, actor, state, view, level, dyn);
        }
      }

      // ── 2. Actor east faces triggered at tile (tx, ty) ──
      // Each actor east face is drawn exactly once, at tile (eastCol, floor(ay)).
      const eastActors = _actorByEastTile.get(tx | (ty << 16));
      if (eastActors) {
        for (const { actor, state } of eastActors) {
          drawActorEastFace(ctx, actor, state, view, level, dyn);
        }
      }

      // ── 3. Terrain south face ──
      if (cell && cell.kind !== 'void' && !blocker) {
        const bSouth = ML.getBlockerCell(level, tx, ty + 1);
        const terrainTop = fillZ(level, dyn, tx, ty);
        const isSouthHidden = bSouth && bSouth.top >= terrainTop;
        if (!isSouthHidden) {
          drawTerrainSouthFace(ctx, level, dyn, tx, ty, view, color);
        }
      }

      // ── 4. Terrain east face ──
      if (cell && cell.kind !== 'void' && !blocker) {
        const bEast = ML.getBlockerCell(level, tx + 1, ty);
        const terrainTop = fillZ(level, dyn, tx, ty);
        const isEastHidden = bEast && bEast.top >= terrainTop;
        if (!isEastHidden) {
          drawTerrainEastFace(ctx, level, dyn, tx, ty, view, color);
        }
      }

      // ── 5. Blocker south face ──
      // Draw the ENTIRE south edge of the blocker group as a single wide polygon,
      // triggered at the LEFTMOST tile of the SOUTHERNMOST row of the group.
      // This prevents the staircase artifact caused by drawing per-tile faces at
      // different painter depths.
      if (blocker) {
        const southNeighbor = ML.getBlockerCell(level, tx, ty + 1);
        const westNeighbor  = ML.getBlockerCell(level, tx - 1, ty);
        const isSouthRow = !southNeighbor || southNeighbor.top !== blocker.top;
        const isLeftmost = !westNeighbor  || westNeighbor.top  !== blocker.top;
        if (isSouthRow && isLeftmost) {
          // Walk east to find the full width of this south edge
          let xEnd = tx + 1;
          while (true) {
            const nb = ML.getBlockerCell(level, xEnd, ty);
            const nbSouth = ML.getBlockerCell(level, xEnd, ty + 1);
            if (!nb || nb.top !== blocker.top) break;
            if (nbSouth && nbSouth.top === blocker.top) break; // not south row
            xEnd++;
          }
          const col = blocker.transparent ? '#64748b' : '#334155';
          const bot = fillZ(level, dyn, tx, ty + 1);
          vface(ctx, tx, ty+1, xEnd, ty+1, blocker.top, bot, view, dk(col, 0.55));
        }
      }

      // ── 6. Blocker east face ──
      // Draw the ENTIRE east edge of the blocker group as a single tall polygon,
      // triggered at the BOTTOMMOST tile of the EASTERNMOST column of the group.
      // Drawing at the bottommost tile ensures that the blocker top faces of all
      // tiles above it (which are in lower buckets) are painted first, so the
      // east face correctly appears in front of them.
      if (blocker) {
        const eastNeighbor  = ML.getBlockerCell(level, tx + 1, ty);
        const southNeighbor = ML.getBlockerCell(level, tx, ty + 1);
        const isEastCol    = !eastNeighbor  || eastNeighbor.top  !== blocker.top;
        const isBottommost = !southNeighbor || southNeighbor.top !== blocker.top;
        if (isEastCol && isBottommost) {
          // Walk north to find the full height of this east edge
          let yStart = ty;
          while (true) {
            const nb = ML.getBlockerCell(level, tx, yStart - 1);
            const nbEast = ML.getBlockerCell(level, tx + 1, yStart - 1);
            if (!nb || nb.top !== blocker.top) break;
            if (nbEast && nbEast.top === blocker.top) break; // not east col
            yStart--;
          }
          const col = blocker.transparent ? '#64748b' : '#334155';
          const bot = fillZ(level, dyn, tx + 1, yStart);
          vface(ctx, tx+1, yStart, tx+1, ty+1, blocker.top, bot, view, dk(col, 0.70));
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

      // ── 9. Actor top faces drawn at the bottom-right tile of their footprint ──
      // Drawing here (highest bucket in the footprint) ensures the actor top
      // is painted AFTER all terrain top faces in its footprint, so floor tiles
      // cannot bleed over the actor top face.
      const key = tx | (ty << 16);
      const originActors = _actorByOrigin.get(key);
      if (originActors) {
        for (const { actor, state } of originActors) {
          const actorTop = actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE
            ? actor.topHeight : state.topHeight;
          // Skip if ANY tile under the actor's footprint has terrain above the actor.
          // Note: actorFaceSuppressed is intentionally NOT checked here — it only
          // suppresses side faces, not the top face.  The top face should appear
          // as soon as the actor emerges above the terrain (actorTopCovered=false).
          const _topCov = actorTopCovered(level, dyn, state.x, state.y, actor.width, actor.height, actorTop);
          if (_topCov) continue;
          drawActorTop(ctx, actor, state, view, playerRefZ);
        }
      }

      // ── 9b. Shadow (drawn just before the first tile of bucket shadowBucket+1) ──
      // Wait until we've moved PAST shadowBucket so all terrain top faces in
      // that bucket are drawn before the shadow sits on top of them.
      // Suppressed when marble is behind terrain (shadow would bleed through wall).
      if (!shadowDrawn && (tx + ty) > shadowBucket) {
        if (!marbleOccluded) drawMarbleShadow(ctx, runtime, view);
        shadowDrawn = true;
      }

      // ── 9c. Ball (drawn just before the first tile of bucket ballBucket+1) ──
      // We wait until we've moved PAST ballBucket so that ALL terrain top
      // faces in ballBucket have been drawn before the ball.  This prevents
      // floor tiles in the same bucket from painting over the ball.
      // Faces in buckets > ballBucket (walls further forward) are drawn
      // after this point and will still correctly cover the ball.
      // marbleOccluded suppresses the ball when it is behind/below a wall.
      if (!ballDrawn && (tx + ty) > ballBucket) {
        if (!marbleOccluded) drawMarbleBall(ctx, runtime, view);
        ballDrawn = true;
      }
    }

    // If shadow/ball buckets were beyond the last tile, draw them now
    if (!shadowDrawn && !marbleOccluded) drawMarbleShadow(ctx, runtime, view);
    if (!ballDrawn && !marbleOccluded) drawMarbleBall(ctx, runtime, view);

    // Overlays always on top
    drawGoal(ctx, runtime, view);
    drawRouteGraph(ctx, runtime, view);
    drawStatus(ctx, runtime, cw);
  }

  function prepare(runtime) { return runtime; }

  window.MarbleRenderer = { prepare, render: draw };
})();
