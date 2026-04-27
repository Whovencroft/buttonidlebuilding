/**
 * marble_renderer_three.js  (v7)
 *
 * Three.js-based renderer for the marble scene.
 *
 * Fixes in v7:
 *  1. Grid 45° rotation  — tile-top texture now draws a diamond/argyle grid
 *                          (lines at ±45°) instead of axis-aligned squares.
 *  2. External wall faces visible — all four wall directions now use
 *                          double-sided materials so they are never back-culled.
 *                          North and West face meshes are rebuilt with correct
 *                          outward normals instead of post-hoc rotation hacks.
 *  3. Internal faces don't occlude marble — wall faces are inset 0.01 units
 *                          from the tile boundary so they never z-fight with
 *                          or clip into an adjacent tile's surface.
 *  4. Ramp visibility    — ramp mesh uses a dedicated material with a mild
 *                          emissive boost so the slope reads clearly regardless
 *                          of lighting angle.  Ramp side walls also use the
 *                          correct per-direction materials.
 *
 * Coordinate system: world X = east, world Y = south, world Z = up
 */
(() => {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────

  const ISO_ANGLE  = Math.atan(1 / Math.sqrt(2));  // ~35.26°
  const ISO_YAW    = Math.PI / 4;                  // 45°
  const BASE_FRUSTUM = 8;

  const COL = {
    void:          0x000000,
    tileTop:       0xb0bec5,
    tileGrid:      0x7a8f9a,
    wallSouth:     0x2e3440,
    wallEast:      0x3b4252,
    wallNorth:     0x4a5568,   // slightly lighter — faces camera from above
    wallWest:      0x374151,
    wallHighlight: 0xd8e0e8,
    rampTop:       0xc8d6dc,   // slightly lighter than flat tiles — stands out
    rampEmissive:  0x1a2530,   // mild emissive so slope reads in low light
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
  let smoothCamZ     = null;

  // ─── Texture helpers ─────────────────────────────────────────────────────────

  function makeCheckerTexture(size, col1, col2, gridCol, squares) {
    const T = THREE;
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
    const tex = new T.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  /**
   * Tile-top texture with a 45°-rotated (diamond) grid.
   * We draw the fill, then rotate the canvas 45° and draw two crossing lines
   * through the centre — this produces a diamond/argyle border on each tile.
   */
  function makeTileTopTexture(size, col, gridCol) {
    const T = THREE;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');

    // Solid fill
    ctx.fillStyle = '#' + col.toString(16).padStart(6,'0');
    ctx.fillRect(0, 0, size, size);

    // Draw diagonal grid lines (45°) — two diagonals per tile
    ctx.strokeStyle = '#' + gridCol.toString(16).padStart(6,'0');
    ctx.lineWidth = Math.max(2, size / 80);

    // Main diagonal: top-left → bottom-right
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size);
    ctx.stroke();

    // Anti-diagonal: top-right → bottom-left
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(0, size);
    ctx.stroke();

    // Border outline so tile edges are still clear
    ctx.lineWidth = Math.max(1, size / 128);
    ctx.strokeRect(0, 0, size, size);

    const tex = new T.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  // Shared textures (created once)
  let texTileTop   = null;
  let texBounceTop = null;
  let texGoalTop   = null;
  let texConvTop   = null;
  let texRampTop   = null;

  function ensureTextures() {
    if (texTileTop) return;
    texTileTop   = makeTileTopTexture(256, COL.tileTop,    COL.tileGrid);
    texBounceTop = makeTileTopTexture(128, COL.bounceTop,  COL.bounceDark);
    texGoalTop   = makeCheckerTexture(128, COL.goalLight,  COL.goalDark, 0xaa8800, 4);
    texConvTop   = makeTileTopTexture(128, COL.conveyorTop,COL.conveyorSide);
    texRampTop   = makeTileTopTexture(256, COL.rampTop,    COL.tileGrid);
  }

  // ─── Material cache ──────────────────────────────────────────────────────────

  const matCache = {};
  function getMat(key, factory) {
    if (!matCache[key]) matCache[key] = factory();
    return matCache[key];
  }

  // All wall materials are double-sided so they render regardless of which
  // way the camera happens to face them.
  const DS = () => THREE.DoubleSide;

  function matTileTop(bounce, conveyor, goal) {
    if (goal)     return getMat('goal_top',   () => new THREE.MeshLambertMaterial({ map: texGoalTop,   side: THREE.FrontSide }));
    if (bounce)   return getMat('bounce_top', () => new THREE.MeshLambertMaterial({ map: texBounceTop, side: THREE.FrontSide }));
    if (conveyor) return getMat('conv_top',   () => new THREE.MeshLambertMaterial({ map: texConvTop,   side: THREE.FrontSide }));
    return getMat('tile_top', () => new THREE.MeshLambertMaterial({ map: texTileTop, side: THREE.FrontSide }));
  }
  function matRampTop() {
    return getMat('ramp_top', () => new THREE.MeshLambertMaterial({
      map: texRampTop,
      side: THREE.DoubleSide,   // double-sided so slope is always visible
      emissive: new THREE.Color(COL.rampEmissive),
    }));
  }
  function matWallSouth()     { return getMat('wall_s',  () => new THREE.MeshLambertMaterial({ color: COL.wallSouth,     side: DS() })); }
  function matWallEast()      { return getMat('wall_e',  () => new THREE.MeshLambertMaterial({ color: COL.wallEast,      side: DS() })); }
  function matWallNorth()     { return getMat('wall_n',  () => new THREE.MeshLambertMaterial({ color: COL.wallNorth,     side: DS() })); }
  function matWallWest()      { return getMat('wall_w',  () => new THREE.MeshLambertMaterial({ color: COL.wallWest,      side: DS() })); }
  function matWallHighlight() { return getMat('wall_hl', () => new THREE.MeshLambertMaterial({ color: COL.wallHighlight, side: DS(), emissive: new THREE.Color(COL.wallHighlight), emissiveIntensity: 0.25 })); }
  function matPlatformTop()   { return getMat('plat_top',  () => new THREE.MeshLambertMaterial({ color: COL.platformTop  })); }
  function matPlatformSide()  { return getMat('plat_side', () => new THREE.MeshLambertMaterial({ color: COL.platformSide, side: DS() })); }

  // ─── Mesh builders ───────────────────────────────────────────────────────────

  /**
   * Flat tile top. UV is always 0→1 per tile.
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
   * Build a vertical wall face using an explicit position + normal direction.
   *
   * @param {number} along0  start along the wall's long axis (world units)
   * @param {number} along1  end along the wall's long axis
   * @param {number} perp    position along the perpendicular axis
   * @param {number} zBot    bottom Z
   * @param {number} zTop    top Z
   * @param {'s'|'n'|'e'|'w'} dir  which face direction
   * @param {THREE.Material} mat
   * @param {number} [inset=0.01]  how far to pull the face inward from the tile boundary
   */
  function buildWallFace(along0, along1, perp, zBot, zTop, dir, mat, inset = 0.01) {
    if (zTop <= zBot + 0.001) return null;
    const span = along1 - along0;
    const h    = zTop - zBot;

    const geo  = new THREE.PlaneGeometry(span, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;

    // PlaneGeometry default: lies in XY plane, normal = +Z.
    // We need it vertical (in the XZ or YZ plane) facing a cardinal direction.
    // Strategy: rotateX(PI/2) makes it lie in XZ plane, normal = +Y (south).
    // Then rotateY to point in the desired direction.
    //
    // After rotateX(PI/2):
    //   normal = (0, 1, 0) — faces +Y (south)
    //   "width" axis = X, "height" axis = Z (up)
    //
    // Rotations around Y to get other directions:
    //   south (+Y): rotY = 0
    //   north (-Y): rotY = PI
    //   east  (+X): rotY = -PI/2
    //   west  (-X): rotY = +PI/2

    mesh.rotation.x = Math.PI / 2;

    switch (dir) {
      case 's':
        // South face: normal +Y, at world y = perp (inset inward = smaller y)
        mesh.rotation.y = 0;
        mesh.position.set(along0 + span / 2, zBot + h / 2, perp - inset);
        break;
      case 'n':
        // North face: normal -Y, at world y = perp (inset inward = larger y)
        mesh.rotation.y = Math.PI;
        mesh.position.set(along0 + span / 2, zBot + h / 2, perp + inset);
        break;
      case 'e':
        // East face: normal +X, at world x = perp (inset inward = smaller x)
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.set(perp - inset, zBot + h / 2, along0 + span / 2);
        break;
      case 'w':
        // West face: normal -X, at world x = perp (inset inward = larger x)
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(perp + inset, zBot + h / 2, along0 + span / 2);
        break;
    }
    return mesh;
  }

  /**
   * Thin highlight strip at the top edge of a wall face.
   * Rendered as a flat horizontal plane sitting on top of the tile edge,
   * slightly above zTop so it is always visible.
   * Only generated for south and east faces (the two camera-facing sides).
   */
  function buildWallTopHighlight(along0, along1, perp, zTop, dir) {
    const span = along1 - along0;
    const W    = 0.08;  // width of the strip (into the tile)
    // Lay flat in the XZ plane
    const geo  = new THREE.PlaneGeometry(span, W);
    geo.rotateX(-Math.PI / 2);  // now lies flat
    const mesh = new THREE.Mesh(geo, matWallHighlight());
    const y    = zTop + 0.005;  // just above the tile top
    switch (dir) {
      case 's':
        // South edge: strip runs along X, centred at y = perp, inset slightly
        mesh.position.set(along0 + span / 2, y, perp - W / 2);
        break;
      case 'e':
        // East edge: strip runs along Z, centred at x = perp, inset slightly
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(perp - W / 2, y, along0 + span / 2);
        break;
    }
    return mesh;
  }

  /**
   * Slope tile (ramp) as a single angled quad.
   * shape: 'slope_n' | 'slope_s' | 'slope_e' | 'slope_w'
   */
  function buildSlopeMesh(tx, ty, shape, baseHeight, rampHeight) {
    let corners = { NW: baseHeight, NE: baseHeight, SW: baseHeight, SE: baseHeight };
    switch (shape) {
      case 'slope_n': corners.NW = rampHeight; corners.NE = rampHeight; break;
      case 'slope_s': corners.SW = rampHeight; corners.SE = rampHeight; break;
      case 'slope_e': corners.NE = rampHeight; corners.SE = rampHeight; break;
      case 'slope_w': corners.NW = rampHeight; corners.SW = rampHeight; break;
    }
    // NW=(tx,ty), NE=(tx+1,ty), SW=(tx,ty+1), SE=(tx+1,ty+1)
    const positions = new Float32Array([
      tx,     corners.NW, ty,
      tx + 1, corners.NE, ty,
      tx,     corners.SW, ty + 1,
      tx + 1, corners.SE, ty + 1,
    ]);
    const indices = [0, 2, 1,  1, 2, 3];
    const uvs = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, matRampTop());
  }

  /**
   * Box group (top + 4 sides) — used for blockers and platforms.
   */
  function buildBoxGroup(tx, ty, zBot, w, d, h, matTop, matSide) {
    const group = new THREE.Group();
    group.add(buildTileTopMesh(tx, ty, zBot + h, w, d, matTop));
    // South face: at y = ty+d, faces south (+Y)
    const sf = buildWallFace(tx, tx + w, ty + d, zBot, zBot + h, 's', matSide);
    if (sf) group.add(sf);
    // East face: at x = tx+w, faces east (+X)
    const ef = buildWallFace(ty, ty + d, tx + w, zBot, zBot + h, 'e', matSide);
    if (ef) group.add(ef);
    // North face: at y = ty, faces north (-Y)
    const nf = buildWallFace(tx, tx + w, ty, zBot, zBot + h, 'n', matSide);
    if (nf) group.add(nf);
    // West face: at x = tx, faces west (-X)
    const wf = buildWallFace(ty, ty + d, tx, zBot, zBot + h, 'w', matSide);
    if (wf) group.add(wf);
    return group;
  }

  // ─── Level mesh builder ──────────────────────────────────────────────────────

  function buildLevelMeshes(level) {
    const T  = THREE;
    const ML = window.MarbleLevels;
    const group = new T.Group();
    const voidFloor = level.voidFloor ?? -12;

    // Collect non-void tiles
    const tiles = [];
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const cell = ML.getSurfaceCell(level, tx, ty);
        if (!cell || cell.kind === 'void') continue;
        tiles.push({ tx, ty, cell });
      }
    }

    // ── Pass 1: Tile tops ────────────────────────────────────────────────────
    for (const { tx, ty, cell } of tiles) {
      const isGoal     = !!ML.getTriggerCell(level, tx, ty)?.kind === 'goal';
      const isBounce   = !!cell.bounce;
      const isConveyor = !!cell.conveyor;

      if (!cell.shape || cell.shape === 'flat') {
        group.add(buildTileTopMesh(tx, ty, cell.baseHeight, 1, 1,
          matTileTop(isBounce, isConveyor, isGoal)));
      } else {
        const rampH = cell.rampHeight ?? (cell.baseHeight + 2);
        group.add(buildSlopeMesh(tx, ty, cell.shape, cell.baseHeight, rampH));
      }
    }

    // ── Pass 2: Wall faces ───────────────────────────────────────────────────
    const fillZ = (ttx, tty) => ML.getFillTopAtCell(level, ttx, tty, { staticOnly: true });

    for (const { tx, ty, cell } of tiles) {
      const topZ = ML.getSurfaceTopZ ? ML.getSurfaceTopZ(cell) : cell.baseHeight;

      // South face: at y = ty+1, faces +Y (south)
      const southZ = fillZ(tx, ty + 1);
      if (southZ < topZ - 0.01) {
        const sf = buildWallFace(tx, tx + 1, ty + 1, southZ, topZ, 's', matWallSouth());
        if (sf) { group.add(sf); group.add(buildWallTopHighlight(tx, tx + 1, ty + 1, topZ, 's')); }
      }

      // East face: at x = tx+1, faces +X (east)
      const eastZ = fillZ(tx + 1, ty);
      if (eastZ < topZ - 0.01) {
        const ef = buildWallFace(ty, ty + 1, tx + 1, eastZ, topZ, 'e', matWallEast());
        if (ef) { group.add(ef); group.add(buildWallTopHighlight(ty, ty + 1, tx + 1, topZ, 'e')); }
      }

      // North face: at y = ty, faces -Y (north)
      const northZ = fillZ(tx, ty - 1);
      if (northZ < topZ - 0.01) {
        const nf = buildWallFace(tx, tx + 1, ty, northZ, topZ, 'n', matWallNorth());
        if (nf) group.add(nf);
      }

      // West face: at x = tx, faces -X (west)
      const westZ = fillZ(tx - 1, ty);
      if (westZ < topZ - 0.01) {
        const wf = buildWallFace(ty, ty + 1, tx, westZ, topZ, 'w', matWallWest());
        if (wf) group.add(wf);
      }
    }

    // ── Pass 3: Blockers ─────────────────────────────────────────────────────
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const blk = ML.getBlockerCell(level, tx, ty);
        if (!blk) continue;
        const surface = ML.getSurfaceCell(level, tx, ty);
        const baseZ = surface ? surface.baseHeight : voidFloor;
        const h = blk.top - baseZ;
        if (h <= 0.01) continue;
        group.add(buildBoxGroup(tx, ty, baseZ, 1, 1, h,
          matTileTop(false, false, false), matWallSouth()));
      }
    }

    // ── Pass 4: Goal trigger visuals ─────────────────────────────────────────
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const trig = ML.getTriggerCell(level, tx, ty);
        if (trig?.kind !== 'goal') continue;
        const cell = ML.getSurfaceCell(level, tx, ty);
        if (!cell) continue;
        const z = cell.baseHeight + 0.02;
        group.add(buildTileTopMesh(tx, ty, z, 1, 1,
          getMat('goal_top_overlay', () => new THREE.MeshLambertMaterial({ map: texGoalTop }))));
        const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
        const poleMat = getMat('pole', () => new THREE.MeshLambertMaterial({ color: 0xffd700 }));
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(tx + 0.5, z + 0.6, ty + 0.5);
        group.add(pole);
      }
    }

    return group;
  }

  // ─── Dynamic actor meshes ────────────────────────────────────────────────────

  function buildDynamicMeshes(level, dynState) {
    const T  = THREE;
    const ML = window.MarbleLevels;
    const group = new T.Group();
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
        const geo = new T.BoxGeometry(len, 0.15, 0.3);
        const mat = getMat('haz_bar', () => new T.MeshLambertMaterial({ color: COL.hazardTop }));
        const mesh = new T.Mesh(geo, mat);
        mesh.position.set(state.x ?? actor.x ?? 0, (actor.z ?? 0) + 0.15, state.y ?? actor.y ?? 0);
        mesh.rotation.y = state.angle ?? 0;
        group.add(mesh);
      }

      if (kind === ML.ACTOR_KINDS.TIMED_GATE && state.blocking) {
        const gw = actor.width ?? 1;
        const geo = new T.BoxGeometry(gw, 1.5, 0.2);
        const mat = getMat('gate', () => new T.MeshLambertMaterial({ color: 0xfbbf24 }));
        const mesh = new T.Mesh(geo, mat);
        mesh.position.set((actor.x ?? 0) + gw / 2, (actor.z ?? 0) + 0.75, actor.y ?? 0);
        group.add(mesh);
      }
    }
    return group;
  }

  // ─── Marble mesh ─────────────────────────────────────────────────────────────

  function buildMarbleMesh() {
    const T = THREE;
    const r = 0.225;
    const sphere = new T.Mesh(
      new T.SphereGeometry(r, 24, 16),
      new T.MeshPhongMaterial({ color: COL.marbleTop, emissive: 0x0a1020, shininess: 80, specular: 0x7dd3fc })
    );
    sphere.castShadow = true;

    const ring = new T.Mesh(
      new T.TorusGeometry(r * 1.05, r * 0.08, 8, 32),
      new T.MeshPhongMaterial({ color: COL.marbleRing, emissive: 0x1a4060, shininess: 120 })
    );
    ring.rotation.x = Math.PI / 2;

    const group = new T.Group();
    group.add(sphere);
    group.add(ring);
    return group;
  }

  // ─── Drag arrow overlay ──────────────────────────────────────────────────────

  function buildDragArrow() {
    const T = THREE;
    const mat = new T.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85 });
    const shaft = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1, 8), mat);
    shaft.position.y = 0.5;
    const head = new T.Mesh(new T.ConeGeometry(0.12, 0.3, 8), mat);
    head.position.y = 1.15;
    const group = new T.Group();
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

    smoothCamZ  = null;
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
      smoothCamZ  = null;
    }

    scene.remove(dynamicGroup);
    dynamicGroup.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
    dynamicGroup = buildDynamicMeshes(runtime.level, runtime.dynamicState);
    scene.add(dynamicGroup);

    const marble = runtime.marble;
    marbleMesh.position.set(marble.x, marble.z, marble.y);

    const speed = Math.hypot(marble.vx, marble.vy);
    if (speed > 0.01) {
      const r = marble.collisionRadius ?? 0.225;
      const roll = speed * (1 / r) * (1 / 120);
      marbleMesh.rotation.x += marble.vy * roll;
      marbleMesh.rotation.z -= marble.vx * roll;
    }

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

    const zoom = runtime.camera?.zoom ?? 1;
    updateCameraFrustum(camera, w, h, zoom);

    const camX = runtime.camera?.x ?? marble.x;
    const camY = runtime.camera?.y ?? marble.y;
    if (smoothCamZ === null) smoothCamZ = marble.z;
    smoothCamZ += (marble.z - smoothCamZ) * 0.12;

    const dist = 30;
    camera.position.set(
      camX + dist * Math.cos(ISO_YAW),
      smoothCamZ + dist * Math.sin(ISO_ANGLE) + 5,
      camY + dist * Math.cos(ISO_YAW)
    );
    camera.lookAt(camX, smoothCamZ, camY);

    renderer.render(scene, camera);
  }

  function prepare(runtime, canvas) {
    ensureRenderer(canvas);
  }

  window.MarbleRenderer = { render, prepare };
})();
