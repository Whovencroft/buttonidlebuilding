/**
 * marble_renderer_three.js
 *
 * Three.js-based renderer for the marble scene.
 * Replaces the canvas 2D painter's-algorithm renderer.
 *
 * Visual style: Marble Madness arcade (1984)
 *   - Tile tops:   grey checkerboard grid
 *   - Side walls:  vertical black stripes on a coloured background
 *   - Void:        pure black
 *   - Marble:      navy-blue sphere (matches the idle-game button)
 *   - Ramps:       same tile grid, angled, matching striped sides
 *   - Goal:        checkerboard flag pattern
 *   - Bounce tile: bright yellow-green
 *   - Moving platform / elevator: lighter grey with blue edge
 *
 * Camera: orthographic, isometric angle (arctan(1/√2) ≈ 35.26°, 45° yaw)
 *
 * Coordinate system: world X = east, world Y = south, world Z = up
 *   (matches marble_levels.js grid convention)
 */
(() => {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────

  const TILE = 1;          // world units per tile
  const ISO_ANGLE = Math.atan(1 / Math.sqrt(2));   // ~35.26°
  const ISO_YAW   = Math.PI / 4;                   // 45°

  // Orthographic frustum half-size in world units (will be scaled by zoom)
  const BASE_FRUSTUM = 14;

  // Marble Madness colour palette
  const COL = {
    void:         0x000000,
    tileLight:    0xc8bfa8,   // light checker square
    tileDark:     0xa89f8a,   // dark checker square
    tileGrid:     0x6e6455,   // grid line colour
    wallBase:     0x8c3a1e,   // wall background (red-brown, like MM level 1)
    wallStripe:   0x000000,   // vertical stripe colour
    wallSide:     0x6b2c16,   // slightly darker for east face
    rampLight:    0xb8af9a,
    rampDark:     0x9a9180,
    marbleTop:    0x253244,   // button gradient top
    marbleBot:    0x1b2532,   // button gradient bottom
    marbleRing:   0x7dd3fc,   // accent blue
    goalLight:    0xffffff,
    goalDark:     0x222222,
    bounceTop:    0xb5e853,   // bright lime
    bounceDark:   0x7aaa2a,
    platformTop:  0x8ab4d4,
    platformSide: 0x5a8aaa,
    hazardTop:    0xfb7185,
    hazardSide:   0xc04060,
    conveyorTop:  0x6ee7b7,
    conveyorSide: 0x3aaa7a,
    goalFlag:     0xffd700,
  };

  // ─── Module state ────────────────────────────────────────────────────────────

  let renderer  = null;   // THREE.WebGLRenderer
  let scene     = null;   // THREE.Scene
  let camera    = null;   // THREE.OrthographicCamera
  let THREE     = null;   // reference to the global THREE object

  // Object pools / caches
  let levelMeshGroup = null;   // group rebuilt when level changes
  let lastLevelId    = null;

  // Dynamic objects (rebuilt each frame for moving actors)
  let dynamicGroup = null;

  // Marble mesh
  let marbleMesh = null;
  let marbleRingMesh = null;

  // Drag arrow
  let dragArrowGroup = null;

  // ─── Geometry helpers ────────────────────────────────────────────────────────

  function makeCheckerTexture(size, col1, col2, gridCol, squares) {
    const T = THREE;
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const sqSize = size / squares;

    for (let row = 0; row < squares; row++) {
      for (let col = 0; col < squares; col++) {
        const light = (row + col) % 2 === 0;
        ctx.fillStyle = light ? '#' + col1.toString(16).padStart(6,'0')
                               : '#' + col2.toString(16).padStart(6,'0');
        ctx.fillRect(col * sqSize, row * sqSize, sqSize, sqSize);
      }
    }

    // Grid lines
    ctx.strokeStyle = '#' + gridCol.toString(16).padStart(6,'0');
    ctx.lineWidth = Math.max(1, size / 128);
    for (let i = 0; i <= squares; i++) {
      const p = i * sqSize;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }

    const tex = new T.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  function makeStripedTexture(size, bgCol, stripeCol, stripeCount) {
    const T = THREE;
    const canvas = document.createElement('canvas');
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#' + bgCol.toString(16).padStart(6,'0');
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#' + stripeCol.toString(16).padStart(6,'0');
    const stripeW = size / (stripeCount * 2);
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillRect(i * stripeW * 2, 0, stripeW, size);
    }

    const tex = new T.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    return tex;
  }

  // Shared textures (created once)
  let texTileTop    = null;
  let texWallSouth  = null;
  let texWallEast   = null;
  let texBounceTop  = null;
  let texGoalTop    = null;
  let texConvTop    = null;

  function ensureTextures() {
    if (texTileTop) return;
    texTileTop   = makeCheckerTexture(256, COL.tileLight, COL.tileDark, COL.tileGrid, 8);
    texWallSouth = makeStripedTexture(128, COL.wallBase,  COL.wallStripe, 8);
    texWallEast  = makeStripedTexture(128, COL.wallSide,  COL.wallStripe, 8);
    texBounceTop = makeCheckerTexture(128, COL.bounceTop, COL.bounceDark, COL.tileGrid, 4);
    texGoalTop   = makeCheckerTexture(128, COL.goalLight, COL.goalDark,   0x888888, 4);
    texConvTop   = makeCheckerTexture(128, COL.conveyorTop, COL.conveyorSide, COL.tileGrid, 4);
  }

  // ─── Material cache ──────────────────────────────────────────────────────────

  const matCache = {};
  function getMat(key, factory) {
    if (!matCache[key]) matCache[key] = factory();
    return matCache[key];
  }

  function matTileTop(bounce, conveyor, goal) {
    if (goal)     return getMat('goal_top',    () => new THREE.MeshLambertMaterial({ map: texGoalTop }));
    if (bounce)   return getMat('bounce_top',  () => new THREE.MeshLambertMaterial({ map: texBounceTop }));
    if (conveyor) return getMat('conv_top',    () => new THREE.MeshLambertMaterial({ map: texConvTop }));
    return getMat('tile_top', () => new THREE.MeshLambertMaterial({ map: texTileTop }));
  }

  function matWallSouth() {
    return getMat('wall_south', () => new THREE.MeshLambertMaterial({ map: texWallSouth }));
  }

  function matWallEast() {
    return getMat('wall_east', () => new THREE.MeshLambertMaterial({ map: texWallEast }));
  }

  function matPlatformTop() {
    return getMat('plat_top', () => new THREE.MeshLambertMaterial({ color: COL.platformTop }));
  }

  function matPlatformSide() {
    return getMat('plat_side', () => new THREE.MeshLambertMaterial({ color: COL.platformSide }));
  }

  function matHazardTop() {
    return getMat('haz_top', () => new THREE.MeshLambertMaterial({ color: COL.hazardTop }));
  }

  function matHazardSide() {
    return getMat('haz_side', () => new THREE.MeshLambertMaterial({ color: COL.hazardSide }));
  }

  // ─── Mesh builders ───────────────────────────────────────────────────────────

  /**
   * Build a flat tile top face at world (tx, ty, z) with size (w x d).
   * UV repeating so the texture tiles per world unit.
   */
  function buildTileTopMesh(tx, ty, z, w, d, mat) {
    const geo = new THREE.PlaneGeometry(w, d);
    // Rotate to lie flat in XY plane (Three.js PlaneGeometry is in XY, we need XZ)
    geo.rotateX(-Math.PI / 2);
    // UV: repeat once per tile
    const uvAttr = geo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * w, uvAttr.getY(i) * d);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(tx + w / 2, z, ty + d / 2);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Build a vertical south-facing wall face.
   * Spans world x [x0, x1], at world y = fy, from z = zBot to z = zTop.
   */
  function buildWallFaceMesh(x0, x1, fy, zBot, zTop, mat) {
    if (zTop <= zBot + 0.001) return null;
    const w = x1 - x0;
    const h = zTop - zBot;
    const geo = new THREE.PlaneGeometry(w, h);
    // UV: repeat per world unit
    const uvAttr = geo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * w, uvAttr.getY(i) * h);
    }
    const mesh = new THREE.Mesh(geo, mat);
    // South face: normal points in +Y direction, so we don't rotate (PlaneGeometry faces +Z by default)
    // We need it to face south (+Y in world), so rotate around X by -PI/2 then around Y by PI
    mesh.rotation.x = Math.PI / 2;   // lay it vertical
    // PlaneGeometry after rotateX(PI/2) faces -Z; we want it to face +Y (south)
    mesh.rotation.y = Math.PI;
    mesh.position.set(x0 + w / 2, zBot + h / 2, fy);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Build a vertical east-facing wall face.
   * Spans world y [y0, y1], at world x = fx, from z = zBot to z = zTop.
   */
  function buildWallFaceEastMesh(y0, y1, fx, zBot, zTop, mat) {
    if (zTop <= zBot + 0.001) return null;
    const d = y1 - y0;
    const h = zTop - zBot;
    const geo = new THREE.PlaneGeometry(d, h);
    const uvAttr = geo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * d, uvAttr.getY(i) * h);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.y = -Math.PI / 2;  // face east (+X)
    mesh.position.set(fx, zBot + h / 2, y0 + d / 2);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Build a slope tile (ramp) as a single angled quad.
   * shape: 'slope_n' | 'slope_s' | 'slope_e' | 'slope_w'
   * baseHeight: low corner Z
   * rampHeight: high corner Z (= baseHeight + 2 typically)
   */
  function buildSlopeMesh(tx, ty, shape, baseHeight, rampHeight, mat) {
    // Four corners of the tile top face
    // NW=(tx,ty), NE=(tx+1,ty), SW=(tx,ty+1), SE=(tx+1,ty+1)
    const zNW = baseHeight, zNE = baseHeight, zSW = baseHeight, zSE = baseHeight;
    let corners = { NW: zNW, NE: zNE, SW: zSW, SE: zSE };

    switch (shape) {
      case 'slope_n': corners.NW = rampHeight; corners.NE = rampHeight; break;
      case 'slope_s': corners.SW = rampHeight; corners.SE = rampHeight; break;
      case 'slope_e': corners.NE = rampHeight; corners.SE = rampHeight; break;
      case 'slope_w': corners.NW = rampHeight; corners.SW = rampHeight; break;
    }

    // Build custom geometry: two triangles
    const positions = new Float32Array([
      tx,     corners.NW, ty,       // NW
      tx + 1, corners.NE, ty,       // NE
      tx,     corners.SW, ty + 1,   // SW
      tx + 1, corners.SE, ty + 1,   // SE
    ]);
    const indices = [0, 2, 1,  1, 2, 3];
    const uvs = new Float32Array([0,0, 1,0, 0,1, 1,1]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, mat);
  }

  /**
   * Build a box mesh (used for blockers, platforms, etc.)
   * at world position (tx, ty, zBot) with size (w x d x h).
   * Returns a group with top + 4 sides.
   */
  function buildBoxGroup(tx, ty, zBot, w, d, h, matTop, matSide) {
    const group = new THREE.Group();

    // Top
    group.add(buildTileTopMesh(tx, ty, zBot + h, w, d, matTop));

    // South face (y = ty + d)
    const sf = buildWallFaceMesh(tx, tx + w, ty + d, zBot, zBot + h, matSide);
    if (sf) group.add(sf);

    // East face (x = tx + w)
    const ef = buildWallFaceEastMesh(ty, ty + d, tx + w, zBot, zBot + h, matSide);
    if (ef) group.add(ef);

    // North face (y = ty) — faces -Y, rotate south face 180° around Z
    const nf = buildWallFaceMesh(tx, tx + w, ty, zBot, zBot + h, matSide);
    if (nf) { nf.rotation.y = 0; group.add(nf); }

    // West face (x = tx) — faces -X
    const wf = buildWallFaceEastMesh(ty, ty + d, tx, zBot, zBot + h, matSide);
    if (wf) { wf.rotation.y = Math.PI / 2; group.add(wf); }

    return group;
  }

  // ─── Level mesh builder ──────────────────────────────────────────────────────

  function buildLevelMeshes(level) {
    const T = THREE;
    const ML = window.MarbleLevels;
    const group = new T.Group();
    const voidFloor = level.voidFloor ?? -12;

    // We build the terrain in two passes:
    // Pass 1: tile tops
    // Pass 2: south and east wall faces (grouped into merged geometries for performance)

    // Collect all tile data first
    const tiles = [];
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const cell = ML.getSurfaceCell(level, tx, ty);
        if (!cell || cell.kind === 'void') continue;
        tiles.push({ tx, ty, cell });
      }
    }

    // Tile tops
    for (const { tx, ty, cell } of tiles) {
      const isGoal = !!ML.getTriggerCell(level, tx, ty)?.kind === 'goal';
      const isBounce = !!cell.bounce;
      const isConveyor = !!cell.conveyor;
      const mat = matTileTop(isBounce, isConveyor, isGoal);

      if (!cell.shape || cell.shape === 'flat') {
        const z = cell.baseHeight;
        const mesh = buildTileTopMesh(tx, ty, z, 1, 1, mat);
        group.add(mesh);
      } else {
        // Slope tile
        const rampH = cell.rampHeight ?? (cell.baseHeight + 2);
        const mesh = buildSlopeMesh(tx, ty, cell.shape, cell.baseHeight, rampH, mat);
        group.add(mesh);
      }
    }

    // Wall faces: all four directions for every tile.
    // Use getFillTopAtCell (staticOnly) so ramp tiles contribute their
    // actual max-corner height, not just baseHeight.
    const fillZ = (ttx, tty) => ML.getFillTopAtCell(level, ttx, tty, { staticOnly: true });
    for (const { tx, ty, cell } of tiles) {
      // Use the true max-corner height of this tile as the top of its faces.
      const topZ = ML.getSurfaceTopZ ? ML.getSurfaceTopZ(cell) : cell.baseHeight;
      // South face (visible when tile to south is lower)
      const southZ = fillZ(tx, ty + 1);
      if (southZ < topZ - 0.01) {
        const sf = buildWallFaceMesh(tx, tx + 1, ty + 1, southZ, topZ, matWallSouth());
        if (sf) group.add(sf);
      }
      // East face (visible when tile to east is lower)
      const eastZ = fillZ(tx + 1, ty);
      if (eastZ < topZ - 0.01) {
        const ef = buildWallFaceEastMesh(ty, ty + 1, tx + 1, eastZ, topZ, matWallEast());
        if (ef) group.add(ef);
      }
      // North face (visible when tile to north is lower)
      const northZ = fillZ(tx, ty - 1);
      if (northZ < topZ - 0.01) {
        const nf = buildWallFaceMesh(tx, tx + 1, ty, northZ, topZ, matWallSouth());
        if (nf) group.add(nf);
      }
      // West face (visible when tile to west is lower)
      const westZ = fillZ(tx - 1, ty);
      if (westZ < topZ - 0.01) {
        const wf = buildWallFaceEastMesh(ty, ty + 1, tx, westZ, topZ, matWallEast());
        if (wf) group.add(wf);
      }
    }
    // Blockers (walls / raised platforms)
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const blk = ML.getBlockerCell(level, tx, ty);
        if (!blk) continue;
        const surface = ML.getSurfaceCell(level, tx, ty);
        const baseZ = surface ? surface.baseHeight : voidFloor;
        const h = blk.top - baseZ;
        if (h <= 0.01) continue;
        const bg = buildBoxGroup(tx, ty, baseZ, 1, 1, h, matTileTop(false, false, false), matWallSouth());
        group.add(bg);
      }
    }

    // Goal trigger visual
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const trig = ML.getTriggerCell(level, tx, ty);
        if (trig?.kind !== 'goal') continue;
        const cell = ML.getSurfaceCell(level, tx, ty);
        if (!cell) continue;
        const z = cell.baseHeight + 0.02;
        const mesh = buildTileTopMesh(tx, ty, z, 1, 1, getMat('goal_top', () => new THREE.MeshLambertMaterial({ map: texGoalTop })));
        group.add(mesh);

        // Flag pole
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
    const T = THREE;
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
        const h = 0.3;
        const bg = buildBoxGroup(
          state.x - w / 2, state.y - d / 2,
          topZ - h, w, d, h,
          matPlatformTop(), matPlatformSide()
        );
        group.add(bg);
      }

      if (kind === ML.ACTOR_KINDS.ROTATING_BAR || kind === ML.ACTOR_KINDS.SWEEPER) {
        // Draw as a thin flat box
        const angle = state.angle ?? 0;
        const len = actor.length ?? 3;
        const geo = new THREE.BoxGeometry(len, 0.15, 0.3);
        const mat = getMat('haz_bar', () => new T.MeshLambertMaterial({ color: COL.hazardTop }));
        const mesh = new T.Mesh(geo, mat);
        const cx = state.x ?? actor.x ?? 0;
        const cy = state.y ?? actor.y ?? 0;
        const cz = actor.z ?? 0;
        mesh.position.set(cx, cz + 0.15, cy);
        mesh.rotation.y = angle;
        group.add(mesh);
      }

      if (kind === ML.ACTOR_KINDS.TIMED_GATE) {
        if (state.blocking) {
          const gx = actor.x ?? 0;
          const gy = actor.y ?? 0;
          const gz = actor.z ?? 0;
          const gw = actor.width ?? 1;
          const geo = new THREE.BoxGeometry(gw, 1.5, 0.2);
          const mat = getMat('gate', () => new T.MeshLambertMaterial({ color: 0xfbbf24 }));
          const mesh = new T.Mesh(geo, mat);
          mesh.position.set(gx + gw / 2, gz + 0.75, gy);
          group.add(mesh);
        }
      }
    }

    return group;
  }

  // ─── Marble mesh ─────────────────────────────────────────────────────────────

  function buildMarbleMesh() {
    const T = THREE;
    const r = 0.225;

    // Main sphere with gradient-like material (navy blue)
    const geo = new T.SphereGeometry(r, 24, 16);
    const mat = new T.MeshPhongMaterial({
      color:     COL.marbleTop,
      emissive:  0x0a1020,
      shininess: 80,
      specular:  0x7dd3fc,
    });
    const sphere = new T.Mesh(geo, mat);
    sphere.castShadow = true;

    // Equatorial ring (accent blue, matches button border)
    const ringGeo = new T.TorusGeometry(r * 1.05, r * 0.08, 8, 32);
    const ringMat = new T.MeshPhongMaterial({
      color:     COL.marbleRing,
      emissive:  0x1a4060,
      shininess: 120,
    });
    const ring = new T.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;  // equatorial plane

    const group = new T.Group();
    group.add(sphere);
    group.add(ring);
    return group;
  }

  // ─── Drag arrow overlay ──────────────────────────────────────────────────────

  function buildDragArrow() {
    const T = THREE;
    const group = new T.Group();

    // Arrow shaft
    const shaftGeo = new T.CylinderGeometry(0.04, 0.04, 1, 8);
    const arrowMat = new T.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85 });
    const shaft = new T.Mesh(shaftGeo, arrowMat);
    shaft.position.y = 0.5;
    group.add(shaft);

    // Arrow head
    const headGeo = new T.ConeGeometry(0.12, 0.3, 8);
    const head = new T.Mesh(headGeo, arrowMat);
    head.position.y = 1.15;
    group.add(head);

    group.visible = false;
    return group;
  }

  // ─── Camera setup ────────────────────────────────────────────────────────────

  function setupCamera(w, h) {
    const aspect = w / h;
    const frust  = BASE_FRUSTUM;
    const cam = new THREE.OrthographicCamera(
      -frust * aspect, frust * aspect,
       frust,          -frust,
      -100, 200
    );

    // Isometric position: look from NW-above
    // Standard isometric: rotate 45° around Y, then tilt ~35.26° around X
    cam.rotation.order = 'YXZ';
    cam.rotation.y = -Math.PI / 4;          // 45° yaw (NW)
    cam.rotation.x = -Math.atan(1 / Math.sqrt(2));  // ~35.26° pitch

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

    if (renderer) {
      renderer.dispose();
      renderer = null;
    }

    THREE = window.THREE;
    if (!THREE) {
      console.error('[MarbleRenderer3] THREE not loaded');
      return;
    }

    ensureTextures();

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(COL.void, 1);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(COL.void);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(-8, 20, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 200;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -50;
    sun.shadow.camera.right = sun.shadow.camera.top   =  50;
    scene.add(sun);

    // Fill light from south-east
    const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
    fill.position.set(6, 10, 8);
    scene.add(fill);

    // Camera
    camera = setupCamera(canvas.clientWidth || 800, canvas.clientHeight || 600);
    scene.add(camera);

    // Marble
    marbleMesh = buildMarbleMesh();
    scene.add(marbleMesh);

    // Drag arrow
    dragArrowGroup = buildDragArrow();
    scene.add(dragArrowGroup);

    // Dynamic group placeholder
    dynamicGroup = new THREE.Group();
    scene.add(dynamicGroup);

    lastLevelId = null;
  }

  // ─── Main render function ────────────────────────────────────────────────────

  function render(runtime, canvas) {
    if (!canvas) return;

    // Resize if needed
    const w = canvas.clientWidth  || canvas.width  || 800;
    const h = canvas.clientHeight || canvas.height || 600;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }

    ensureRenderer(canvas);
    if (!renderer || !THREE) return;

    renderer.setSize(w, h, false);

    // Rebuild level meshes if level changed
    if (runtime.level.id !== lastLevelId) {
      if (levelMeshGroup) {
        scene.remove(levelMeshGroup);
        // Dispose geometries
        levelMeshGroup.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
        });
      }
      levelMeshGroup = buildLevelMeshes(runtime.level);
      scene.add(levelMeshGroup);
      lastLevelId = runtime.level.id;
    }

    // Rebuild dynamic actor meshes every frame
    scene.remove(dynamicGroup);
    dynamicGroup.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
    dynamicGroup = buildDynamicMeshes(runtime.level, runtime.dynamicState);
    scene.add(dynamicGroup);

    // Update marble position
    const marble = runtime.marble;
    marbleMesh.position.set(marble.x, marble.z, marble.y);

    // Spin marble based on velocity
    const speed = Math.hypot(marble.vx, marble.vy);
    if (speed > 0.01) {
      const r = marble.collisionRadius ?? 0.225;
      const rollAngle = speed * (1 / r) * (1 / 120);  // approximate per-frame
      marbleMesh.rotation.x += marble.vy * rollAngle;
      marbleMesh.rotation.z -= marble.vx * rollAngle;
    }

    // Drag arrow
    const drag = runtime.dragInput;
    if (drag && drag.active && drag.worldDx !== undefined) {
      dragArrowGroup.visible = true;
      dragArrowGroup.position.set(marble.x, marble.z + 0.5, marble.y);
      const len = Math.hypot(drag.worldDx, drag.worldDy);
      dragArrowGroup.scale.set(1, Math.min(len * 0.5, 2), 1);
      if (len > 0.01) {
        dragArrowGroup.rotation.y = Math.atan2(drag.worldDx, drag.worldDy);
      }
    } else {
      dragArrowGroup.visible = false;
    }

    // Update camera to follow marble
    const zoom = runtime.camera?.zoom ?? 1;
    updateCameraFrustum(camera, w, h, zoom);

    const camX = runtime.camera?.x ?? marble.x;
    const camY = runtime.camera?.y ?? marble.y;
    const camZ = marble.z;

    // Camera target in world space (X, Z=up, Y=south)
    // Offset camera position along the isometric view direction
    const dist = 30;
    camera.position.set(
      camX + dist * Math.cos(ISO_YAW),
      camZ + dist * Math.sin(ISO_ANGLE) + 5,
      camY + dist * Math.cos(ISO_YAW)
    );
    camera.lookAt(camX, camZ, camY);

    renderer.render(scene, camera);
  }

  function prepare(runtime, canvas) {
    ensureRenderer(canvas);
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  window.MarbleRenderer = { render, prepare };
})();
