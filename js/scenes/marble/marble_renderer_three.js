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
  const BASE_FRUSTUM = 9;  // 20% zoom-in vs original 11

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
    crumbleTop:    0x7c5c3a,   // warm brown — crumble tile base
    crumbleDark:   0x4a3520,   // dark brown grid lines
    iceTop:        0xbae6fd,   // pale cyan — ice tile base
    iceDark:       0x7dd3fc,   // slightly deeper cyan grid
    funnelTop:     0x22d3ee,   // cyan — tunnel funnel bowl
    funnelEmissive:0x083344,   // dark teal emissive for funnel
  };

  // ─── Module state ────────────────────────────────────────────────────────────

  let renderer       = null;
  let scene          = null;
  let camera         = null;
  let THREE          = null;
  let levelMeshGroup = null;
  let lastLevelId    = null;
  let dynamicGroup   = null;
  let actorMeshMap   = {};   // actorId -> { group, kind } — persistent per level
  let crumbleMeshMap = {};   // 'tx,ty' -> THREE.Group — individual crumble tile meshes, toggled per-frame
  let marbleMesh     = null;
  let dragArrowGroup = null;
  // Fixed camera Z anchor computed once per level load
  let levelCamZ      = 0;
  // Guards to avoid redundant GPU state changes every frame
  let lastRendererW  = 0;
  let lastRendererH  = 0;
  let lastCamZoom    = -1;
  let lastCamW       = 0;
  let lastCamH       = 0;
  // Smoothed camera Z — follows marble height changes gradually to avoid jitter
  let smoothCamZ     = 0;
  let lastRenderTime = 0;  // performance.now() at last render call, for dt computation

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
  let texCrumbleTop = null;
  let texIceTop     = null;

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

  function makeCrumbleTexture(size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#' + COL.crumbleTop.toString(16).padStart(6,'0');
    ctx.fillRect(0, 0, size, size);
    // Crack lines
    ctx.strokeStyle = '#' + COL.crumbleDark.toString(16).padStart(6,'0');
    ctx.lineWidth = Math.max(2, size / 48);
    ctx.beginPath(); ctx.moveTo(0, 0);       ctx.lineTo(size*0.4, size*0.5); ctx.lineTo(size, size*0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(size*0.6, 0); ctx.lineTo(size*0.3, size*0.7); ctx.lineTo(size, size); ctx.stroke();
    ctx.lineWidth = Math.max(1, size / 128);
    ctx.strokeRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function ensureTextures() {
    if (texTileTop) return;
    texTileTop    = makeTileTopTexture(256, COL.tileTop,     COL.tileGrid);
    texBounceTop  = makeTileTopTexture(128, COL.bounceTop,   COL.bounceDark);
    texGoalTop    = makeCheckerTexture(128, COL.goalLight,   COL.goalDark, 0xaa8800, 4);
    texConvTop    = makeTileTopTexture(128, COL.conveyorTop, COL.conveyorSide);
    texHazardTop  = makeHazardTexture(128);
    texCrumbleTop = makeCrumbleTexture(128);
    texIceTop     = makeTileTopTexture(128, COL.iceTop,      COL.iceDark);
  }

  // ─── Material cache ──────────────────────────────────────────────────────────

  const matCache = {};
  function getMat(key, factory) {
    if (!matCache[key]) matCache[key] = factory();
    return matCache[key];
  }

  function matTileTop(bounce, conveyor, goal, crumble, ice) {
    if (goal)     return getMat('goal_top',    () => new THREE.MeshLambertMaterial({ map: texGoalTop }));
    if (bounce)   return getMat('bounce_top',  () => new THREE.MeshLambertMaterial({ map: texBounceTop }));
    if (conveyor) return getMat('conv_top',    () => new THREE.MeshLambertMaterial({ map: texConvTop }));
    if (crumble)  return getMat('crumble_top', () => new THREE.MeshLambertMaterial({ map: texCrumbleTop }));
    if (ice)      return getMat('ice_top',     () => new THREE.MeshLambertMaterial({ map: texIceTop, shininess: 120 }));
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
  function matFunnel()        { return getMat('funnel_bowl', () => new THREE.MeshPhongMaterial({ color: COL.funnelTop, emissive: new THREE.Color(COL.funnelEmissive), side: THREE.DoubleSide, shininess: 40 })); }

  // ─── Mesh builders ───────────────────────────────────────────────────────────

  /**
   * Flat tile top. UV always 0→1 per tile.
   */
  function buildTileTopMesh(tx, ty, z, w, d, mat) {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(tx + w / 2, z, ty + d / 2);

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
    // Winding reversed vs east face so front face points toward -X (west/camera side)
    const indices = [0,2,1, 1,2,3];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, mat);

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
   * Build a smooth circular funnel bowl mesh for a group of FUNNEL tiles.
   * Takes all funnel tiles sharing the same center and generates a single
   * radial cone geometry with no per-tile sidewalls.
   * @param {Array} funnelTiles - [{tx, ty, cell}] all tiles in this funnel
   * @returns {THREE.Mesh}
   */
  function buildFunnelBowlMesh(funnelTiles) {
    if (!funnelTiles || funnelTiles.length === 0) return null;
    const ML = window.MarbleLevels;
    const cell0 = funnelTiles[0].cell;
    const cx = cell0.funnelCenterX;
    const cy = cell0.funnelCenterY;
    const maxDist = cell0.funnelMaxDist || 2;
    const baseZ = cell0.baseHeight;
    const rise = cell0.rise || 1;

    // Generate a disc mesh with radial height variation (cone/bowl)
    const segments = 32; // angular segments
    const rings = 12;    // radial rings
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    // Center vertex
    positions.push(cx, baseZ, cy);
    normals.push(0, 1, 0);
    uvs.push(0.5, 0.5);

    for (let r = 1; r <= rings; r++) {
      const t = r / rings;
      const radius = t * maxDist;
      const z = baseZ + rise * t;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        positions.push(px, z, py);
        // Normal: points upward and slightly inward (bowl surface normal)
        const nx = -Math.cos(angle) * (rise / maxDist);
        const nz = -Math.sin(angle) * (rise / maxDist);
        const ny = 1;
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        normals.push(nx/len, ny/len, nz/len);
        uvs.push(0.5 + Math.cos(angle) * t * 0.5, 0.5 + Math.sin(angle) * t * 0.5);
      }
    }

    // Triangles: center fan
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments;
      indices.push(0, 1 + s, 1 + next);
    }
    // Triangles: ring strips
    for (let r = 1; r < rings; r++) {
      const ringStart = 1 + (r - 1) * segments;
      const nextRingStart = 1 + r * segments;
      for (let s = 0; s < segments; s++) {
        const next = (s + 1) % segments;
        indices.push(
          ringStart + s, nextRingStart + s, ringStart + next,
          ringStart + next, nextRingStart + s, nextRingStart + next
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(indices);
    return new THREE.Mesh(geo, matFunnel());
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

  // ─── GeoBatch: accumulate quads per material key, flush to one mesh per key ─
  // All geometry in buildLevelMeshes is flat quads with position/normal/uv.
  // Batching reduces thousands of draw calls to ~9 (one per material type).
  class GeoBatch {
    constructor() { this._b = {}; }
    _bucket(key, mat) {
      if (!this._b[key]) this._b[key] = { pos:[], nrm:[], uvs:[], idx:[], mat, vc:0 };
      return this._b[key];
    }
    // pos: flat [x,y,z]×4, nrm: flat [nx,ny,nz]×4, uvs: flat [u,v]×4, idx: [i0..i5] local 0-3
    quad(key, mat, pos, nrm, uvs, idx) {
      const b = this._bucket(key, mat);
      const base = b.vc;
      for (let i=0;i<12;i++){b.pos.push(pos[i]);b.nrm.push(nrm[i]);}
      for (let i=0;i<8;i++) b.uvs.push(uvs[i]);
      for (let i=0;i<6;i++) b.idx.push(base+idx[i]);
      b.vc += 4;
    }
    flush(group) {
      for (const key of Object.keys(this._b)) {
        const b = this._b[key];
        if (!b.vc) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
        geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(b.nrm), 3));
        geo.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(b.uvs), 2));
        geo.setIndex(b.idx);
        const mesh = new THREE.Mesh(geo, b.mat);
    
        group.add(mesh);
      }
    }
  }

  function buildLevelMeshes(level) {
    const ML = window.MarbleLevels;
    const group = new THREE.Group();
    const batch = new GeoBatch();

    // Shared quad data helpers
    const NUP  = [0,1,0, 0,1,0, 0,1,0, 0,1,0];
    const NS   = [0,0,1, 0,0,1, 0,0,1, 0,0,1];
    const NE   = [1,0,0, 1,0,0, 1,0,0, 1,0,0];
    const UV01 = [0,0, 1,0, 0,1, 1,1];
    // Winding conventions (Three.js right-handed, Y-up, CCW = front-face):
    //   IDX_TOP: vertices (tx,z,ty),(tx+1,z,ty),(tx,z,ty+1),(tx+1,z,ty+1)  → normal +Y
    //   IDX_S:   vertices (x0,zBot,fy),(x1,zBot,fy),(x0,zTop,fy),(x1,zTop,fy) → normal +Z
    //   IDX_E:   vertices (fx,zBot,z0),(fx,zBot,z1),(fx,zTop,z0),(fx,zTop,z1) → normal +X
    const IDX_TOP = [0,2,1, 2,3,1]; // horizontal top faces  — verified: normal +Y
    const IDX_S   = [0,1,2, 1,3,2]; // south/north wall faces — verified: normal +Z
    const IDX_E   = [0,2,1, 1,2,3]; // east/west wall faces   — verified: normal +X

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

    // Helper: get the height of a cell's edge at the shared boundary with a neighbour.
    const edgeH = (ttx, tty, edge) => {
      const nc = ML.getSurfaceCell(level, ttx, tty);
      if (!nc || nc.kind === 'void') return 0;
      const nc_ = ML.getSurfaceCornerHeights
        ? ML.getSurfaceCornerHeights(nc)
        : { nw: nc.baseHeight, ne: nc.baseHeight, sw: nc.baseHeight, se: nc.baseHeight };
      if (edge === 'south') return Math.max(nc_.sw, nc_.se);
      if (edge === 'north') return Math.max(nc_.nw, nc_.ne);
      if (edge === 'west')  return Math.max(nc_.nw, nc_.sw);
      if (edge === 'east')  return Math.max(nc_.ne, nc_.se);
      return nc.baseHeight;
    };

    // ── Pass 1: Tile tops ────────────────────────────────────────────────────
    crumbleMeshMap = {}; // reset for this level
    const funnelGroups = {}; // group funnel tiles by center key
    for (const { tx, ty, cell } of tiles) {
      // Skip FUNNEL tiles from normal rendering — they get a single bowl mesh
      if (cell.shape === 'funnel') {
        const key = `${cell.funnelCenterX},${cell.funnelCenterY}`;
        if (!funnelGroups[key]) funnelGroups[key] = [];
        funnelGroups[key].push({ tx, ty, cell });
        continue;
      }
      const isGoal     = ML.getTriggerCell(level, tx, ty)?.kind === 'goal';
      const isBounce   = !!cell.bounce;
      const isConveyor = !!cell.conveyor;
      const isCrumble  = !!cell.crumble;
      const isIce      = !isCrumble && !isBounce && !isConveyor && (cell.friction ?? 1) < 0.45;
      if (!cell.shape || cell.shape === 'flat') {
        const z = cell.baseHeight;
        if (isCrumble) {
          // Crumble tiles get individual meshes so they can be hidden when broken
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array([tx,z,ty, tx+1,z,ty, tx,z,ty+1, tx+1,z,ty+1]);
          const nor = new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0]);
          const uv  = new Float32Array([0,0, 1,0, 0,1, 1,1]);
          const idx = new Uint16Array([0,2,1, 2,3,1]);
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
          geo.setAttribute('uv',       new THREE.BufferAttribute(uv,  2));
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
          const mesh = new THREE.Mesh(geo, getMat('crumble_top', () => new THREE.MeshLambertMaterial({ map: texCrumbleTop })));
          group.add(mesh);
          crumbleMeshMap[`${tx},${ty}`] = mesh;
        } else {
          const matKey = isGoal ? 'goal_top' : isBounce ? 'bounce_top' : isConveyor ? 'conv_top' : isIce ? 'ice_top' : 'tile_top';
          const mat    = matTileTop(isBounce, isConveyor, isGoal, false, isIce);
          batch.quad(matKey, mat,
            [tx, z, ty,  tx+1, z, ty,  tx, z, ty+1,  tx+1, z, ty+1],
            NUP, UV01, IDX_TOP);
        }
      } else {
        // Slope: keep as individual mesh (needs computeVertexNormals)
        group.add(buildSlopeMesh(tx, ty, cell));
      }
    }

    // ── Pass 1b: Funnel bowl meshes (one smooth circular mesh per funnel) ────
    for (const key of Object.keys(funnelGroups)) {
      const mesh = buildFunnelBowlMesh(funnelGroups[key]);
      if (mesh) group.add(mesh);
    }

    // ── Pass 2: Wall faces — all four edges ──────────────────────────────────
    const W_HL = 0.06;
    for (const { tx, ty, cell } of tiles) {
      // Skip funnel tiles — the bowl mesh handles its own geometry
      if (cell.shape === 'funnel') continue;
      const corners = ML.getSurfaceCornerHeights
        ? ML.getSurfaceCornerHeights(cell)
        : { nw: cell.baseHeight, ne: cell.baseHeight, sw: cell.baseHeight, se: cell.baseHeight };

      // South face: at y = ty+1
      const southEdgeZ = Math.max(corners.sw, corners.se);
      const southNbrZ  = edgeH(tx, ty + 1, 'north');
      if (southEdgeZ > southNbrZ + 0.01) {
        const fy = ty + 1;
        batch.quad('wall_s', matWallSouth(),
          [tx, southNbrZ, fy,  tx+1, southNbrZ, fy,  tx, southEdgeZ, fy,  tx+1, southEdgeZ, fy],
          NS, UV01, IDX_S);
        // highlight strip
        const hy = southEdgeZ + 0.004;
        batch.quad('wall_hl', matWallHighlight(),
          [tx, hy, fy-W_HL,  tx+1, hy, fy-W_HL,  tx, hy, fy,  tx+1, hy, fy],
          NUP, UV01, IDX_TOP);
      }

      // East face: at x = tx+1
      const eastEdgeZ = Math.max(corners.ne, corners.se);
      const eastNbrZ  = edgeH(tx + 1, ty, 'west');
      if (eastEdgeZ > eastNbrZ + 0.01) {
        const fx = tx + 1;
        batch.quad('wall_e', matWallEast(),
          [fx, eastNbrZ, ty,  fx, eastNbrZ, ty+1,  fx, eastEdgeZ, ty,  fx, eastEdgeZ, ty+1],
          NE, UV01, IDX_E);
        // highlight strip
        const hy = eastEdgeZ + 0.004;
        batch.quad('wall_hl', matWallHighlight(),
          [fx-W_HL, hy, ty,  fx-W_HL, hy, ty+1,  fx, hy, ty,  fx, hy, ty+1],
          NUP, UV01, IDX_TOP);
      }

      // North boundary: at y = ty (south-facing quad at north edge)
      const northEdgeZ = Math.max(corners.nw, corners.ne);
      const northNbrZ  = edgeH(tx, ty - 1, 'south');
      if (northEdgeZ > northNbrZ + 0.01) {
        const fy = ty;
        batch.quad('wall_s', matWallSouth(),
          [tx, northNbrZ, fy,  tx+1, northNbrZ, fy,  tx, northEdgeZ, fy,  tx+1, northEdgeZ, fy],
          NS, UV01, IDX_S);
        const hy = northEdgeZ + 0.004;
        batch.quad('wall_hl', matWallHighlight(),
          [tx, hy, fy-W_HL,  tx+1, hy, fy-W_HL,  tx, hy, fy,  tx+1, hy, fy],
          NUP, UV01, IDX_TOP);
      }

      // West boundary: at x = tx (east-facing quad at west edge)
      const westEdgeZ = Math.max(corners.nw, corners.sw);
      const westNbrZ  = edgeH(tx - 1, ty, 'east');
      if (westEdgeZ > westNbrZ + 0.01) {
        const fx = tx;
        batch.quad('wall_e', matWallEast(),
          [fx, westNbrZ, ty,  fx, westNbrZ, ty+1,  fx, westEdgeZ, ty,  fx, westEdgeZ, ty+1],
          NE, UV01, IDX_E);
        const hy = westEdgeZ + 0.004;
        batch.quad('wall_hl', matWallHighlight(),
          [fx-W_HL, hy, ty,  fx-W_HL, hy, ty+1,  fx, hy, ty,  fx, hy, ty+1],
          NUP, UV01, IDX_TOP);
      }
    }

    // ── Pass 3: Blockers ─────────────────────────────────────────────────────
    // Blockers are rare — keep as individual meshes (buildBoxGroup)
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
        const z = (ML.getSurfaceTopZ ? ML.getSurfaceTopZ(cell) : cell.baseHeight) + 0.05;
        batch.quad('hazard', matHazard(),
          [tx, z, ty,  tx+1, z, ty,  tx, z, ty+1,  tx+1, z, ty+1],
          NUP, UV01, IDX_TOP);
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
        batch.quad('goal_overlay',
          getMat('goal_overlay', () => new THREE.MeshLambertMaterial({ map: texGoalTop })),
          [tx, z, ty,  tx+1, z, ty,  tx, z, ty+1,  tx+1, z, ty+1],
          NUP, UV01, IDX_TOP);
        // Goal pole — individual mesh (one per level)
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8),
          getMat('pole', () => new THREE.MeshLambertMaterial({ color: 0xffd700 }))
        );
        pole.position.set(tx + 0.5, z + 0.6, ty + 0.5);
        group.add(pole);
      }
    }

    // Flush all batched quads into the group
    batch.flush(group);

    return group;
  }

  // ─── Dynamic actor meshes ────────────────────────────────────────────────────

  // Build persistent actor meshes for the current level (called once on level load).
  // Returns a group containing all actor meshes and populates actorMeshMap.
  function buildActorMeshes(level) {
    const ML = window.MarbleLevels;
    const group = new THREE.Group();
    actorMeshMap = {};

    for (const actor of level.actors || []) {
      const kind = actor.kind;
      let actorGroup = null;

      if (kind === ML.ACTOR_KINDS.MOVING_PLATFORM || kind === ML.ACTOR_KINDS.ELEVATOR) {
        const w = actor.width ?? 2;
        const d = actor.depth ?? 2;
        actorGroup = buildBoxGroup(0, 0, -0.3, w, d, 0.3, matPlatformTop(), matPlatformSide());
        actorMeshMap[actor.id] = { group: actorGroup, kind };
        group.add(actorGroup);
      }

      if (kind === ML.ACTOR_KINDS.ROTATING_BAR || kind === ML.ACTOR_KINDS.SWEEPER) {
        // SWEEPER HIT FIX: use armLength * 2 so the visual arm exactly matches
        // the hit detection radius. The old code used actor.length (never set)
        // which defaulted to 3 regardless of armLength, causing a mismatch.
        // The arm mesh is offset by armLength/2 along +X so the pivot is at the
        // actor center (matching the hit detection which sweeps from center out).
        const armLen = actor.armLength ?? 1.5;
        const len = armLen * 2;
        const geo = new THREE.BoxGeometry(len, 0.15, actor.armWidth ?? 0.26);
        const mat = getMat('haz_bar', () => new THREE.MeshLambertMaterial({ color: COL.hazardTop }));
        const mesh = new THREE.Mesh(geo, mat);
        // No offset needed — BoxGeometry is centered, hit detection sweeps
        // from center to armLength in the angle direction, so the visual
        // arm centered on the pivot is correct.
        actorGroup = new THREE.Group();
        actorGroup.add(mesh);
        actorMeshMap[actor.id] = { group: actorGroup, kind, mesh };
        group.add(actorGroup);
      }

      if (kind === ML.ACTOR_KINDS.TIMED_GATE) {
        // Gate spans actor.width tiles on X and actor.height tiles on Y
        // Render as a tall slab: X-size = width, Z-size (depth in 3D) = height, Y-size (vertical) = 2
        const gw = actor.width ?? 1;
        const gh = actor.height ?? 1;
        const gateVertical = 2; // gate is 2 units tall visually
        const geo = new THREE.BoxGeometry(gw, gateVertical, gh);
        const mat = getMat('gate', () => new THREE.MeshLambertMaterial({ color: 0xfbbf24 }));
        const mesh = new THREE.Mesh(geo, mat);
        // Position: center of the gate's footprint, raised by half the vertical height
        mesh.position.set(
          (actor.x ?? 0) + gw / 2,
          (actor.z ?? 0) + gateVertical / 2,
          (actor.y ?? 0) + gh / 2
        );
        actorGroup = new THREE.Group();
        actorGroup.add(mesh);
        actorMeshMap[actor.id] = { group: actorGroup, kind, mesh };
        group.add(actorGroup);
      }

      if (kind === ML.ACTOR_KINDS.TUNNEL) {
        actorGroup = buildTunnelMesh(actor);
        if (actorGroup) {
          actorMeshMap[actor.id] = { group: actorGroup, kind };
          group.add(actorGroup);
        }
      }
    }
    return group;
  }

  // ─── Tunnel tube mesh generation ─────────────────────────────────────────────
  function buildTunnelMesh(actor) {
    const path = actor.tunnelPath;
    if (!path || path.length < 2) return null;

    const tubeRadius = actor.tunnelRadius ?? 0.45;
    const radialSegments = 8;
    const pathSamples = path.length * 8; // smooth sampling

    // Build a THREE.Curve from the Catmull-Rom path
    const curvePoints = [];
    for (let i = 0; i <= pathSamples; i++) {
      const t = i / pathSamples;
      const pt = tunnelSplinePoint(path, t);
      // Three.js uses Y-up: our x -> x, z -> y (height), y -> z (depth)
      curvePoints.push(new THREE.Vector3(pt.x, pt.z, pt.y));
    }

    const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0);
    const tubeGeo = new THREE.TubeGeometry(curve, pathSamples, tubeRadius, radialSegments, false);

    const tunnelMat = getMat('tunnel_tube', () => new THREE.MeshPhongMaterial({
      color: 0x22d3ee,
      emissive: 0x083344,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      shininess: 60,
      specular: 0x67e8f9
    }));

    const tubeMesh = new THREE.Mesh(tubeGeo, tunnelMat);

    // Build funnel ring at entry (a torus/ring to mark the entrance)
    const entryPt = path[0];
    const funnelGeo = new THREE.TorusGeometry(tubeRadius * 1.8, tubeRadius * 0.3, 8, 16);
    const funnelMat = getMat('tunnel_funnel', () => new THREE.MeshLambertMaterial({
      color: 0x06b6d4,
      emissive: 0x0e7490
    }));
    const funnelMesh = new THREE.Mesh(funnelGeo, funnelMat);
    funnelMesh.position.set(entryPt.x, entryPt.z, entryPt.y);
    funnelMesh.rotation.x = Math.PI / 2; // lay flat

    // Build exit ring
    const exitPt = path[path.length - 1];
    const exitRingMesh = new THREE.Mesh(funnelGeo, funnelMat);
    exitRingMesh.position.set(exitPt.x, exitPt.z, exitPt.y);
    exitRingMesh.rotation.x = Math.PI / 2;

    const tunnelGroup = new THREE.Group();
    tunnelGroup.add(tubeMesh);
    tunnelGroup.add(funnelMesh);
    tunnelGroup.add(exitRingMesh);

    return tunnelGroup;
  }

  // Catmull-Rom spline evaluation (mirrors physics version)
  function tunnelSplinePoint(path, progress) {
    const n = path.length;
    const totalSegments = n - 1;
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const scaledT = clampedProgress * totalSegments;
    const segIndex = Math.min(Math.floor(scaledT), totalSegments - 1);
    const localT = scaledT - segIndex;

    const p0 = path[Math.max(0, segIndex - 1)];
    const p1 = path[segIndex];
    const p2 = path[Math.min(n - 1, segIndex + 1)];
    const p3 = path[Math.min(n - 1, segIndex + 2)];

    const t = localT;
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
    };
  }

  // Update persistent actor mesh positions/rotations/visibility each frame.
  // No geometry or material allocation — just transforms.
  function updateActorMeshes(level, dynState) {
    const ML = window.MarbleLevels;
    if (!dynState?.actors) return;

    for (const actor of level.actors || []) {
      const entry = actorMeshMap[actor.id];
      if (!entry) continue;
      const state = dynState.actors[actor.id];
      if (!state) { entry.group.visible = false; continue; }
      entry.group.visible = true;
      const kind = actor.kind;

      if (kind === ML.ACTOR_KINDS.MOVING_PLATFORM || kind === ML.ACTOR_KINDS.ELEVATOR) {
        const w = actor.width ?? 2;
        const d = actor.depth ?? 2;
        const topZ = state.z ?? actor.z ?? actor.topHeight ?? 0;
        entry.group.position.set(state.x - w / 2, topZ - 0.3, state.y - d / 2);
      }

      if (kind === ML.ACTOR_KINDS.ROTATING_BAR || kind === ML.ACTOR_KINDS.SWEEPER) {
        entry.group.position.set(
          state.x ?? actor.x ?? 0,
          (actor.z ?? 0) + 0.15,
          state.y ?? actor.y ?? 0
        );
        entry.group.rotation.y = state.angle ?? 0;
      }

      if (kind === ML.ACTOR_KINDS.TIMED_GATE) {
        entry.group.visible = !!state.blocking;
      }
    }
  }

  // Update crumble tile visibility each frame based on dynamic crumble state
  function updateCrumbleMeshes(dynState) {
    if (!dynState) return;
    const broken = dynState.crumble || {};
    for (const key of Object.keys(crumbleMeshMap)) {
      const mesh = crumbleMeshMap[key];
      if (!mesh) continue;
      const state = broken[key];
      mesh.visible = !(state && state.broken);
    }
  }

  // ─── Marble mesh ─────────────────────────────────────────────────────────────

  function buildMarbleMesh() {
    const r = 0.225;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 16),
      new THREE.MeshPhongMaterial({ color: COL.marbleTop, emissive: 0x0a1020, shininess: 80, specular: 0x7dd3fc })
    );


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
    renderer.shadowMap.enabled = false; // Disabled: shadow cost too high for large levels
    renderer.setClearColor(COL.void, 1);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(COL.void);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const sun = new THREE.DirectionalLight(0xffffff, 0.70);
    sun.position.set(-8, 20, -6);
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

    dynamicGroup = null;
    actorMeshMap = {};
    crumbleMeshMap = {};

    levelCamZ      = 0;
    smoothCamZ     = 0;
    lastRenderTime = 0;
    lastLevelId    = null;
    lastRendererW = 0;
    lastRendererH = 0;
    lastCamZoom   = -1;
    lastCamW      = 0;
    lastCamH      = 0;
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

    // Only call setSize when dimensions actually change — avoids framebuffer resize every frame
    if (w !== lastRendererW || h !== lastRendererH) {
      renderer.setSize(w, h, false);
      lastRendererW = w;
      lastRendererH = h;
    }

    if (runtime.level.id !== lastLevelId) {
      // Dispose old level geometry AND materials (prevents GPU leak on level switch)
      if (levelMeshGroup) {
        scene.remove(levelMeshGroup);
        levelMeshGroup.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          // Only dispose non-cached materials (cached ones live in matCache)
          if (obj.material && !Object.values(matCache).includes(obj.material)) {
            obj.material.dispose();
          }
        });
      }
      // Dispose old actor meshes geometry (materials are all cached, skip)
      if (dynamicGroup) {
        scene.remove(dynamicGroup);
        dynamicGroup.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
      }
      levelMeshGroup = buildLevelMeshes(runtime.level);
      scene.add(levelMeshGroup);
      // Build persistent actor meshes once for this level
      dynamicGroup = buildActorMeshes(runtime.level);
      scene.add(dynamicGroup);
      lastLevelId = runtime.level.id;
      // Seed smoothCamZ to marble's current Z so there's no pop on level load
      smoothCamZ = runtime.marble.z;
    }

    // Update actor positions/rotations in-place — no allocations per frame
    updateActorMeshes(runtime.level, runtime.dynamicState);
    // Show/hide crumble tiles based on dynamic crumble state
    updateCrumbleMeshes(runtime.dynamicState);

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
    // Only update projection matrix when zoom or viewport dimensions change
    if (zoom !== lastCamZoom || w !== lastCamW || h !== lastCamH) {
      updateCameraFrustum(camera, w, h, zoom);
      lastCamZoom = zoom;
      lastCamW = w;
      lastCamH = h;
    }

    // Center exactly on the marble — XY tracks instantly, Z smoothed to avoid jitter
    const camX = marble.x;
    const camY = marble.y;
    // Compute per-frame dt from wall clock for smooth Z lerp
    const now = performance.now();
    const renderDt = lastRenderTime > 0 ? Math.min((now - lastRenderTime) / 1000, 0.1) : 0.016;
    lastRenderTime = now;
    // Lerp smoothCamZ toward marble.z at ~4 units/sec — fast enough to follow ramps
    // and descents without the camera bobbing on every bump or airborne frame.
    const CAM_Z_SPEED = 4.0;
    smoothCamZ += (marble.z - smoothCamZ) * Math.min(1, CAM_Z_SPEED * renderDt);
    const camZ = smoothCamZ;

    const dist = 30;
    camera.position.set(
      camX + dist * Math.cos(ISO_YAW),
      camZ  + dist * Math.sin(ISO_ANGLE) + 5,
      camY  + dist * Math.cos(ISO_YAW)
    );
    camera.lookAt(camX, camZ, camY);

    renderer.render(scene, camera);

    // ── Debug coordinate overlay ──────────────────────────────────────────────
    if (runtime.debug?.showCoords) {
      renderCoordOverlay(runtime, canvas, w, h);
    } else {
      hideCoordOverlay();
    }
  }

  // ─── Coordinate overlay (2D canvas drawn on top of WebGL) ─────────────────

  let coordCanvas = null;
  let coordCtx    = null;
  let coordFrameCounter = 0;
  let coordLastMx = -1;
  let coordLastMy = -1;

  function renderCoordOverlay(runtime, glCanvas, w, h) {
    const ML = window.MarbleLevels;
    const level = runtime.level;
    if (!level || !camera) return;

    // Only redraw every 4th frame or when marble moves to a new tile
    const mx = Math.floor(runtime.marble.x);
    const my = Math.floor(runtime.marble.y);
    coordFrameCounter++;
    const marbleMoved = mx !== coordLastMx || my !== coordLastMy;
    if (!marbleMoved && (coordFrameCounter % 4) !== 0) return;
    coordLastMx = mx;
    coordLastMy = my;

    // Ensure overlay canvas exists and is sized correctly
    if (!coordCanvas || coordCanvas.parentNode !== glCanvas.parentNode) {
      coordCanvas = document.createElement('canvas');
      coordCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
      coordCanvas.className = 'marble-coord-overlay';
      glCanvas.parentNode.insertBefore(coordCanvas, glCanvas.nextSibling);
    }
    const dpr = Math.min(window.devicePixelRatio, 2);
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (coordCanvas.width !== cw || coordCanvas.height !== ch) {
      coordCanvas.width = cw;
      coordCanvas.height = ch;
    }
    if (!coordCtx) coordCtx = coordCanvas.getContext('2d');
    const ctx = coordCtx;
    ctx.clearRect(0, 0, cw, ch);

    // Project world position to screen via Three.js camera
    const vec = new THREE.Vector3();
    const halfW = cw / 2;
    const halfH = ch / 2;

    // Determine visible tile range — reduced range for performance
    const RANGE = 10;
    const x0 = Math.max(0, mx - RANGE);
    const x1 = Math.min(level.width - 1, mx + RANGE);
    const y0 = Math.max(0, my - RANGE);
    const y1 = Math.min(level.height - 1, my + RANGE);

    const fontSize = Math.round(9 * dpr);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pad = 2 * dpr;
    const labelH = 10 * dpr;
    // Approximate char width for monospace to avoid measureText per label
    const charW = fontSize * 0.6;

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const cell = ML.getSurfaceCell(level, tx, ty);
        if (!cell || cell.kind === 'void') continue;
        const z = cell.baseHeight;

        // World position: center of tile
        vec.set(tx + 0.5, z, ty + 0.5);
        vec.project(camera);

        // NDC to screen
        const sx = (vec.x * halfW) + halfW;
        const sy = (-vec.y * halfH) + halfH;

        // Skip if off-screen
        if (sx < -20 || sx > cw + 20 || sy < -20 || sy > ch + 20) continue;

        // Draw label — round z to avoid long decimals on ramp tiles
        const zDisp = Number.isInteger(z) ? z : z.toFixed(1);
        const label = `${tx},${ty},${zDisp}`;
        const tw = label.length * charW;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx - tw/2 - pad, sy - labelH/2, tw + pad*2, labelH);
        ctx.fillStyle = '#00ffcc';
        ctx.fillText(label, sx, sy);
      }
    }
  }

  function hideCoordOverlay() {
    if (coordCanvas) {
      coordCanvas.width = 0;
      coordCanvas.height = 0;
    }
  }

  function prepare(runtime, canvas) {
    ensureRenderer(canvas);
  }

  function getDebugInfo() {
    if (!renderer) return null;
    const info = renderer.info;
    return {
      geometries: info.memory.geometries,
      textures:   info.memory.textures,
      programs:   info.programs ? info.programs.length : '?',
      calls:      info.render.calls,
      triangles:  info.render.triangles,
      sceneChildren: scene ? scene.children.length : 0
    };
  }

  window.MarbleRenderer = { render, prepare, getDebugInfo };
})();
