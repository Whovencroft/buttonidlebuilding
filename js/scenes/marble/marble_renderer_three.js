/**
 * marble_renderer_three.js  (v8)
 *
 * Three.js-based renderer for the marble scene.
 *
 * Fixes in v8:
 *  1. Ramp geometry   — uses getSurfaceCornerHeights() for exact per-corner Z
 *                       values so slopes match the physics surface exactly.
 *                       No more sky-pointing fins.
 *  2. Camera Z lock   — camera vertical target is fixed to the level's median
 *                       tile height, not the marble's live Z.  This eliminates
 *                       all void-background vibration as the marble moves.
 *  3. Internal walls  — north and west wall faces are NOT rendered.  From the
 *                       isometric camera (looking south-east from above) only
 *                       the south and east faces of any raised tile are ever
 *                       visible.  North/west faces were the ones clipping
 *                       through adjacent tiles and occluding the marble.
 *
 * Coordinate system: world X = east, world Y = south, world Z = up
 */
(() => {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────

  const ISO_ANGLE  = Math.atan(1 / Math.sqrt(2));  // ~35.26°
  const ISO_YAW    = Math.PI / 4;                  // 45°
  const BASE_FRUSTUM = 11;

  const COL = {
    void:          0x000000,
    tileTop:       0xb0bec5,
    tileGrid:      0x7a8f9a,
    wallSouth:     0x2e3440,
    wallEast:      0x3b4252,
    wallHighlight: 0xd8e0e8,
    // Ramp colours are pre-compensated for lighting angle so all four
    // slope directions appear at similar perceived brightness.
    // Sun is at (-8,20,-6); normals for each slope direction:
    //   slope_n  normal ≈ (0, +0.7, +0.7)  → faces sun well  → darker base
    //   slope_s  normal ≈ (0, +0.7, -0.7)  → faces away      → lighter base
    //   slope_e  normal ≈ (+0.7, +0.7, 0)  → moderate        → mid base
    //   slope_w  normal ≈ (-0.7, +0.7, 0)  → faces away      → lighter base
    rampN:         0x8fa8b5,   // north slope  — sun-facing, match tile top
    rampS:         0xb0c8d4,   // south slope  — slightly lighter than tile top
    rampE:         0x9ab2be,   // east slope   — moderate
    rampW:         0xa8c0cc,   // west slope   — slightly lighter
    rampEmissive:  0x1a2530,   // emissive floor prevents any slope going black
    hazardOverlay: 0xef4444,
    marbleTop:     0x253244,
    marbleRing:    0x7dd3fc,
    goalLight:     0x22c55e,
    goalDark:      0x16a34a,
    bounceTop:     0x38bdf8,
    bounceDark:    0x0ea5e9,
    platformTop:   0x64748b,
    platformSide:  0x475569,
    hazardTop:     0xef4444,
    hazardSide:    0xdc2626,
    conveyorTop:   0x0891b2,
    conveyorSide:  0x0e7490,
  };

  // ─── Module state ────────────────────────────────────────────────────────────

  let renderer       = null;
  let scene          = null;
  let camera         = null;
  let THREE          = null;
  let levelMeshGroup = null;
  let lastLevelId    = null;
  let dynamicGroup   = null;
  let marbleMesh     = null;
  let dragArrowGroup = null;
  // Fixed camera Z anchor computed once per level load
  let levelCamZ      = 0;

  // ─── Texture helpers ─────────────────────────────────────────────────────────

  function makeCheckerTexture(size, col1, col2, gridCol, squares) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const sq = size / squares;
    for (let r = 0; r < squares; r++) {
      for (let c = 0; c < squares; c++) {
        ctx.fillStyle = '#' + ((r + c) % 2 === 0 ? col1 : col2).toString(16).padStart(6,'0');
        ctx.fillRect(c * sq, r * sq, sq, sq);
      }
    }
    ctx.strokeStyle = '#' + gridCol.toString(16).padStart(6,'0');
    ctx.lineWidth = Math.max(1, size / 128);
    for (let i = 0; i <= squares; i++) {
      const p = i * sq;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /**
   * Tile-top texture: 45° diamond grid (two diagonals + border per tile).
   */
  function makeTileTopTexture(size, col, gridCol) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#' + col.toString(16).padStart(6,'0');
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#' + gridCol.toString(16).padStart(6,'0');
    ctx.lineWidth = Math.max(2, size / 80);
    ctx.beginPath(); ctx.moveTo(0, 0);    ctx.lineTo(size, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(0, size);    ctx.stroke();

    ctx.lineWidth = Math.max(1, size / 128);
    ctx.strokeRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Shared textures (created once after THREE is available)
  let texTileTop    = null;
  let texBounceTop  = null;
  let texGoalTop    = null;
  let texConvTop    = null;
  let texHazardTop  = null;

  /**
   * Hazard stripe texture: diagonal red/dark-red stripes.
   */
  function makeHazardTexture(size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = size / 8;
    // Diagonal stripes
    for (let i = -2; i <= 4; i++) {
      const x = i * size / 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + size, size);
      ctx.stroke();
    }
    // Border
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = Math.max(2, size / 64);
    ctx.strokeRect(1, 1, size - 2, size - 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function ensureTextures() {
    if (texTileTop) return;
    texTileTop   = makeTileTopTexture(256, COL.tileTop,    COL.tileGrid);
    texBounceTop = makeTileTopTexture(128, COL.bounceTop,  COL.bounceDark);
    texGoalTop   = makeCheckerTexture(128, COL.goalLight,  COL.goalDark, 0xaa8800, 4);
    texConvTop   = makeTileTopTexture(128, COL.conveyorTop,COL.conveyorSide);
    texHazardTop = makeHazardTexture(128);
  }

  // ─── Material cache ──────────────────────────────────────────────────────────

  const matCache = {};
  function getMat(key, factory) {
    if (!matCache[key]) matCache[key] = factory();
    return matCache[key];
  }

  function matTileTop(bounce, conveyor, goal) {
    if (goal)     return getMat('goal_top',   () => new THREE.MeshLambertMaterial({ map: texGoalTop }));
    if (bounce)   return getMat('bounce_top', () => new THREE.MeshLambertMaterial({ map: texBounceTop }));
    if (conveyor) return getMat('conv_top',   () => new THREE.MeshLambertMaterial({ map: texConvTop }));
    return getMat('tile_top', () => new THREE.MeshLambertMaterial({ map: texTileTop }));
  }
  // Ramp material: same tile-top texture as flat tiles so ramps read as part
  // of the level rather than separate floating objects.  A mild emissive floor
  // prevents the slope going dark on sun-away faces.
  function matRampDir(_shape) {
    return getMat('ramp_top', () => new THREE.MeshLambertMaterial({
      map:      texTileTop,
      emissive: new THREE.Color(COL.rampEmissive),
      side:     THREE.DoubleSide,
    }));
  }
  function matHazard() {
    // Use MeshLambertMaterial to match goal overlay approach — always visible.
    return getMat('hazard', () => new THREE.MeshLambertMaterial({
      map: texHazardTop,
    }));
  }
  // Wall faces: FrontSide only — south and east faces always face the camera.
  function matWallSouth()     { return getMat('wall_s',  () => new THREE.MeshLambertMaterial({ color: COL.wallSouth })); }
  function matWallEast()      { return getMat('wall_e',  () => new THREE.MeshLambertMaterial({ color: COL.wallEast  })); }
  function matWallHighlight() { return getMat('wall_hl', () => new THREE.MeshLambertMaterial({ color: COL.wallHighlight, emissive: new THREE.Color(COL.wallHighlight), emissiveIntensity: 0.25 })); }
  function matPlatformTop()   { return getMat('plat_top',  () => new THREE.MeshLambertMaterial({ color: COL.platformTop  })); }
  function matPlatformSide()  { return getMat('plat_side', () => new THREE.MeshLambertMaterial({ color: COL.platformSide })); }

  // ─── Mesh builders ───────────────────────────────────────────────────────────

  /**
   * Flat tile top. UV always 0→1 per tile.
   */
  function buildTileTopMesh(tx, ty, z, w, d, mat) {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(tx + w / 2, z, ty + d / 2);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * South-facing wall face.
   * Spans world x [x0,x1], at world y = fy (south edge of tile), z [zBot,zTop].
   *
   * Three.js coordinate system: X=east, Y=up, Z=south.
   * A PlaneGeometry in XY with normal +Z already faces south (+Z). ✓
   * We only need to rotate it so it stands vertically:
   *   rotateX(-PI/2) tilts the plane from XY into XZ (horizontal → vertical),
   *   but that flips the normal to -Y.  We want it vertical AND facing +Z.
   *   Solution: build a vertical plane directly using a custom quad.
   */
  function buildSouthFace(x0, x1, fy, zBot, zTop, mat) {
    if (zTop <= zBot + 0.001) return null;
    const w = x1 - x0;
    const h = zTop - zBot;
    // Build quad manually: 4 verts in world space, normal = +Z (south)
    const positions = new Float32Array([
      x0, zBot, fy,
      x1, zBot, fy,
      x0, zTop, fy,
      x1, zTop, fy,
    ]);
    const normals = new Float32Array([
      0,0,1, 0,0,1, 0,0,1, 0,0,1,
    ]);
    const uvs = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    const indices = [0,1,2, 1,3,2];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * North-facing wall face.
   * Spans world x [x0,x1], at world y = fy (north edge of tile), z [zBot,zTop].
   * Normal = -Z (north). Used only for slope high-end connections.
   */
  function buildNorthFace(x0, x1, fy, zBot, zTop, mat) {
    if (zTop <= zBot + 0.001) return null;
    const positions = new Float32Array([
      x0, zBot, fy,
      x1, zBot, fy,
      x0, zTop, fy,
      x1, zTop, fy,
    ]);
    const normals = new Float32Array([
      0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
    ]);
    const uvs = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    const indices = [0,2,1, 1,2,3];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }
  /**
   * West-facing wall face.
   * Spans world y [y0,y1], at world x = fx (west edge of tile), z [zBot,zTop].
   * Normal = -X (west). Used only for slope high-end connections.
   */
  function buildWestFace(y0, y1, fx, zBot, zTop, mat) {
    if (zTop <= zBot + 0.001) return null;
    const positions = new Float32Array([
      fx, zBot, y0,
      fx, zBot, y1,
      fx, zTop, y0,
      fx, zTop, y1,
    ]);
    const normals = new Float32Array([
      -1,0,0, -1,0,0, -1,0,0, -1,0,0,
    ]);
    const uvs = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    const indices = [0,1,2, 1,3,2];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }
  /**
   * East-facing wall face.
   * Spans world y [y0,y1], at world x = fx (east edge of tile), z [zBot,zTop].
   * Normal = +X (east).
   */
  function buildEastFace(y0, y1, fx, zBot, zTop, mat) {
    if (zTop <= zBot + 0.001) return null;
    const d = y1 - y0;
    const h = zTop - zBot;
    const positions = new Float32Array([
      fx, zBot, y0,
      fx, zBot, y1,
      fx, zTop, y0,
      fx, zTop, y1,
    ]);
    const normals = new Float32Array([
      1,0,0, 1,0,0, 1,0,0, 1,0,0,
    ]);
    const uvs = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    const indices = [0,2,1, 1,2,3];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Flat highlight strip at the top edge of a south or east wall face.
   * Lies horizontally just inside the tile edge at height zTop.
   */
  function buildWallHighlight(along0, along1, perp, zTop, dir) {
    const span = along1 - along0;
    const W = 0.06;
    const y = zTop + 0.004;
    let positions;
    if (dir === 's') {
      // strip runs along X, inset from south edge
      positions = new Float32Array([
        along0, y, perp - W,
        along1, y, perp - W,
        along0, y, perp,
        along1, y, perp,
      ]);
    } else {
      // east: strip runs along Z, inset from east edge
      positions = new Float32Array([
        perp - W, y, along0,
        perp - W, y, along1,
        perp,     y, along0,
        perp,     y, along1,
      ]);
    }
    const normals = new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0]);
    const uvs = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    const indices = [0,1,2, 1,3,2];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, matWallHighlight());
    return mesh;
  }

  /**
   * Slope tile (ramp) as a single angled quad.
   * Uses getSurfaceCornerHeights() for exact physics-matching corner Z values.
   */
  function buildSlopeMesh(tx, ty, cell) {
    const ML = window.MarbleLevels;
    const h = ML.getSurfaceCornerHeights ? ML.getSurfaceCornerHeights(cell)
            : { nw: cell.baseHeight, ne: cell.baseHeight, sw: cell.baseHeight, se: cell.baseHeight };

    // World positions: NW=(tx,ty), NE=(tx+1,ty), SW=(tx,ty+1), SE=(tx+1,ty+1)
    // Three.js Y = world Z (up), Three.js X = world X, Three.js Z = world Y
    const positions = new Float32Array([
      tx,     h.nw, ty,
      tx + 1, h.ne, ty,
      tx,     h.sw, ty + 1,
      tx + 1, h.se, ty + 1,
    ]);
    // Two triangles: NW-SW-NE and NE-SW-SE
    const indices = [0, 2, 1,  1, 2, 3];
    const uvs = new Float32Array([0,1, 0,0, 1,1, 1,0]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, matRampDir(cell.shape));
  }

  /**
   * Box group (top + south + east faces) — used for blockers and platforms.
   */
  function buildBoxGroup(tx, ty, zBot, w, d, h, matTop, matSide) {
    const group = new THREE.Group();
    group.add(buildTileTopMesh(tx, ty, zBot + h, w, d, matTop));
    const sf = buildSouthFace(tx, tx + w, ty + d, zBot, zBot + h, matSide);
    if (sf) group.add(sf);
    const ef = buildEastFace(ty, ty + d, tx + w, zBot, zBot + h, matSide);
    if (ef) group.add(ef);
    return group;
  }

  // ─── Level mesh builder ──────────────────────────────────────────────────────

  function buildLevelMeshes(level) {
    const ML = window.MarbleLevels;
    const group = new THREE.Group();

    // Collect non-void tiles
    const tiles = [];
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const cell = ML.getSurfaceCell(level, tx, ty);
        if (!cell || cell.kind === 'void') continue;
        tiles.push({ tx, ty, cell });
      }
    }

    // Compute level median Z for camera anchor (fixed, no vibration)
    if (tiles.length > 0) {
      const zVals = tiles.map(({ cell }) => cell.baseHeight).sort((a, b) => a - b);
      levelCamZ = zVals[Math.floor(zVals.length / 2)];
    } else {
      levelCamZ = 0;
    }

    // ── Pass 1: Tile tops ────────────────────────────────────────────────────
    for (const { tx, ty, cell } of tiles) {
      const isGoal     = ML.getTriggerCell(level, tx, ty)?.kind === 'goal';
      const isBounce   = !!cell.bounce;
      const isConveyor = !!cell.conveyor;

      if (!cell.shape || cell.shape === 'flat') {
        group.add(buildTileTopMesh(tx, ty, cell.baseHeight, 1, 1,
          matTileTop(isBounce, isConveyor, isGoal)));
      } else {
        group.add(buildSlopeMesh(tx, ty, cell));
      }
    }

    // ── Pass 2: Wall faces — SOUTH and EAST only ─────────────────────────────
    // North and west faces are never visible from the isometric camera and
    // were causing incorrect occlusion of the marble from the inside.
    const fillZ = (ttx, tty) => ML.getFillTopAtCell(level, ttx, tty, { staticOnly: true });
    for (const { tx, ty, cell } of tiles) {
      // Use per-edge heights so ramp walls only extend to the actual edge height,
      // not the maximum corner of the whole tile.
      const corners = ML.getSurfaceCornerHeights
        ? ML.getSurfaceCornerHeights(cell)
        : { nw: cell.baseHeight, ne: cell.baseHeight, sw: cell.baseHeight, se: cell.baseHeight };

      // South face: at y = ty+1, wall top = max of south edge (sw, se)
      const southEdgeZ = Math.max(corners.sw, corners.se);
      const southZ     = fillZ(tx, ty + 1);
      if (southZ < southEdgeZ - 0.01) {
        const sf = buildSouthFace(tx, tx + 1, ty + 1, southZ, southEdgeZ, matWallSouth());
        if (sf) {
          group.add(sf);
          group.add(buildWallHighlight(tx, tx + 1, ty + 1, southEdgeZ, 's'));
        }
      }

      // East face: at x = tx+1, wall top = max of east edge (ne, se)
      const eastEdgeZ = Math.max(corners.ne, corners.se);
      const eastZ     = fillZ(tx + 1, ty);
      if (eastZ < eastEdgeZ - 0.01) {
        const ef = buildEastFace(ty, ty + 1, tx + 1, eastZ, eastEdgeZ, matWallEast());
        if (ef) {
          group.add(ef);
          group.add(buildWallHighlight(ty, ty + 1, tx + 1, eastEdgeZ, 'e'));
        }
      }

      // North/west faces for slope tiles: drawn when the ramp edge is LOWER than the
      // neighbour, filling the void gap below the ramp's low end.
      const isSlope = cell.shape && cell.shape.startsWith('slope_');
      if (isSlope) {
        // North face: fill gap when ramp's north edge is LOWER than the tile to the north
        // (low end of ramp descends northward — neighbour is higher, void gap below ramp edge)
        const northEdgeZ = Math.max(corners.nw, corners.ne);
        const northZ     = fillZ(tx, ty - 1);
        if (northEdgeZ < northZ - 0.01) {
          const nf = buildNorthFace(tx, tx + 1, ty, northEdgeZ, northZ, matWallSouth());
          if (nf) group.add(nf);
        }
        // West face: fill gap when ramp's west edge is LOWER than the tile to the west
        const westEdgeZ = Math.max(corners.nw, corners.sw);
        const westZ     = fillZ(tx - 1, ty);
        if (westEdgeZ < westZ - 0.01) {
          const wf = buildWestFace(ty, ty + 1, tx, westEdgeZ, westZ, matWallEast());
          if (wf) group.add(wf);
        }
      }
    }

    // ── Pass 3: Blockers ─────────────────────────────────────────────────────
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const blk = ML.getBlockerCell(level, tx, ty);
        if (!blk) continue;
        const surface = ML.getSurfaceCell(level, tx, ty);
        const baseZ = surface ? surface.baseHeight : (level.voidFloor ?? -12);
        const h = blk.top - baseZ;
        if (h <= 0.01) continue;
        group.add(buildBoxGroup(tx, ty, baseZ, 1, 1, h,
          matTileTop(false, false, false), matWallSouth()));
      }
    }

    // ── Pass 4: Hazard trigger overlays ──────────────────────────────────────
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const trig = ML.getTriggerCell(level, tx, ty);
        if (trig?.kind !== 'hazard') continue;
        const cell = ML.getSurfaceCell(level, tx, ty);
        if (!cell) continue;
        // Use buildTileTopMesh — identical approach to goal overlay (which works).
        const z = (ML.getSurfaceTopZ ? ML.getSurfaceTopZ(cell) : cell.baseHeight) + 0.05;
        group.add(buildTileTopMesh(tx, ty, z, 1, 1, matHazard()));
      }
    }
    // ── Pass 5: Goal trigger visuals ─────────────────────────────────────────
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const trig = ML.getTriggerCell(level, tx, ty);
        if (trig?.kind !== 'goal') continue;
        const cell = ML.getSurfaceCell(level, tx, ty);
        if (!cell) continue;
        const z = cell.baseHeight + 0.02;
        group.add(buildTileTopMesh(tx, ty, z, 1, 1,
          getMat('goal_overlay', () => new THREE.MeshLambertMaterial({ map: texGoalTop }))));
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8),
          getMat('pole', () => new THREE.MeshLambertMaterial({ color: 0xffd700 }))
        );
        pole.position.set(tx + 0.5, z + 0.6, ty + 0.5);
        group.add(pole);
      }
    }

    return group;
  }

  // ─── Dynamic actor meshes ────────────────────────────────────────────────────

  function buildDynamicMeshes(level, dynState) {
    const ML = window.MarbleLevels;
    const group = new THREE.Group();
    if (!dynState?.actors) return group;

    for (const actor of level.actors || []) {
      const state = dynState.actors[actor.id];
      if (!state) continue;
      const kind = actor.kind;

      if (kind === ML.ACTOR_KINDS.MOVING_PLATFORM || kind === ML.ACTOR_KINDS.ELEVATOR) {
        const w = actor.width ?? 2;
        const d = actor.depth ?? 2;
        const topZ = state.z ?? actor.z ?? actor.topHeight ?? 0;
        group.add(buildBoxGroup(
          state.x - w / 2, state.y - d / 2,
          topZ - 0.3, w, d, 0.3,
          matPlatformTop(), matPlatformSide()
        ));
      }

      if (kind === ML.ACTOR_KINDS.ROTATING_BAR || kind === ML.ACTOR_KINDS.SWEEPER) {
        const len = actor.length ?? 3;
        const geo = new THREE.BoxGeometry(len, 0.15, 0.3);
        const mat = getMat('haz_bar', () => new THREE.MeshLambertMaterial({ color: COL.hazardTop }));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(state.x ?? actor.x ?? 0, (actor.z ?? 0) + 0.15, state.y ?? actor.y ?? 0);
        mesh.rotation.y = state.angle ?? 0;
        group.add(mesh);
      }

      if (kind === ML.ACTOR_KINDS.TIMED_GATE && state.blocking) {
        const gw = actor.width ?? 1;
        const geo = new THREE.BoxGeometry(gw, 1.5, 0.2);
        const mat = getMat('gate', () => new THREE.MeshLambertMaterial({ color: 0xfbbf24 }));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((actor.x ?? 0) + gw / 2, (actor.z ?? 0) + 0.75, actor.y ?? 0);
        group.add(mesh);
      }
    }
    return group;
  }

  // ─── Marble mesh ─────────────────────────────────────────────────────────────

  function buildMarbleMesh() {
    const r = 0.225;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 16),
      new THREE.MeshPhongMaterial({ color: COL.marbleTop, emissive: 0x0a1020, shininess: 80, specular: 0x7dd3fc })
    );
    sphere.castShadow = true;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.05, r * 0.08, 8, 32),
      new THREE.MeshPhongMaterial({ color: COL.marbleRing, emissive: 0x1a4060, shininess: 120 })
    );
    ring.rotation.x = Math.PI / 2;

    const group = new THREE.Group();
    group.add(sphere);
    group.add(ring);
    return group;
  }

  // ─── Drag arrow overlay ──────────────────────────────────────────────────────

  function buildDragArrow() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), mat);
    shaft.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), mat);
    head.position.y = 1.15;
    const group = new THREE.Group();
    group.add(shaft);
    group.add(head);
    group.visible = false;
    return group;
  }

  // ─── Camera setup ────────────────────────────────────────────────────────────

  function setupCamera(w, h) {
    const aspect = w / h;
    const frust  = BASE_FRUSTUM;
    const cam = new THREE.OrthographicCamera(
      -frust * aspect, frust * aspect, frust, -frust, -100, 200
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.y = -Math.PI / 4;
    cam.rotation.x = -Math.atan(1 / Math.sqrt(2));
    return cam;
  }

  function updateCameraFrustum(cam, w, h, zoom) {
    const aspect = w / h;
    const frust  = BASE_FRUSTUM / (zoom || 1);
    cam.left   = -frust * aspect;
    cam.right  =  frust * aspect;
    cam.top    =  frust;
    cam.bottom = -frust;
    cam.updateProjectionMatrix();
  }

  // ─── Renderer setup ──────────────────────────────────────────────────────────

  function ensureRenderer(canvas) {
    if (renderer && renderer.domElement === canvas) return;
    if (renderer) { renderer.dispose(); renderer = null; }

    THREE = window.THREE;
    if (!THREE) { console.error('[MarbleRenderer3] THREE not loaded'); return; }

    ensureTextures();

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(COL.void, 1);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(COL.void);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const sun = new THREE.DirectionalLight(0xffffff, 0.70);
    sun.position.set(-8, 20, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 200;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -50;
    sun.shadow.camera.right = sun.shadow.camera.top   =  50;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xaaccff, 0.20);
    fill.position.set(6, 10, 8);
    scene.add(fill);

    camera = setupCamera(canvas.clientWidth || 800, canvas.clientHeight || 600);
    scene.add(camera);

    marbleMesh = buildMarbleMesh();
    scene.add(marbleMesh);

    dragArrowGroup = buildDragArrow();
    scene.add(dragArrowGroup);

    dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    levelCamZ   = 0;
    lastLevelId = null;
  }

  // ─── Main render function ────────────────────────────────────────────────────

  function render(runtime, canvas) {
    if (!canvas) return;

    const w = canvas.clientWidth  || canvas.width  || 800;
    const h = canvas.clientHeight || canvas.height || 600;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }

    ensureRenderer(canvas);
    if (!renderer || !THREE) return;

    renderer.setSize(w, h, false);

    if (runtime.level.id !== lastLevelId) {
      if (levelMeshGroup) {
        scene.remove(levelMeshGroup);
        levelMeshGroup.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
      }
      levelMeshGroup = buildLevelMeshes(runtime.level);
      scene.add(levelMeshGroup);
      lastLevelId = runtime.level.id;
      // levelCamZ is set inside buildLevelMeshes
    }

    scene.remove(dynamicGroup);
    dynamicGroup.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
    dynamicGroup = buildDynamicMeshes(runtime.level, runtime.dynamicState);
    scene.add(dynamicGroup);

    // Marble position
    const marble = runtime.marble;
    marbleMesh.position.set(marble.x, marble.z, marble.y);

    const speed = Math.hypot(marble.vx, marble.vy);
    if (speed > 0.01) {
      const r = marble.collisionRadius ?? 0.225;
      const roll = speed * (1 / r) * (1 / 120);
      marbleMesh.rotation.x += marble.vy * roll;
      marbleMesh.rotation.z -= marble.vx * roll;
    }

    // Drag arrow
    const drag = runtime.dragInput;
    if (drag && drag.active && drag.worldDx !== undefined) {
      dragArrowGroup.visible = true;
      dragArrowGroup.position.set(marble.x, marble.z + 0.5, marble.y);
      const len = Math.hypot(drag.worldDx, drag.worldDy);
      dragArrowGroup.scale.set(1, Math.min(len * 0.5, 2), 1);
      if (len > 0.01) dragArrowGroup.rotation.y = Math.atan2(drag.worldDx, drag.worldDy);
    } else {
      dragArrowGroup.visible = false;
    }

    // Camera — XY follows marble, Z is fixed to level median (no vibration)
    const zoom = runtime.camera?.zoom ?? 1;
    updateCameraFrustum(camera, w, h, zoom);

    // Always center on the marble — use marble XY directly, no smoothing needed
    const camX = marble.x;
    const camY = marble.y;
    // Use level median Z as the camera anchor — completely eliminates void jitter
    const camZ = levelCamZ;

    const dist = 30;
    camera.position.set(
      camX + dist * Math.cos(ISO_YAW),
      camZ  + dist * Math.sin(ISO_ANGLE) + 5,
      camY  + dist * Math.cos(ISO_YAW)
    );
    camera.lookAt(camX, camZ, camY);

    renderer.render(scene, camera);
  }

  function prepare(runtime, canvas) {
    ensureRenderer(canvas);
  }

  window.MarbleRenderer = { render, prepare };
})();
