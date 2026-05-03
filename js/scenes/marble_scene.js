(() => {
  const DEFAULT_RENDER_RADIUS = 0.26;
  const DEFAULT_COLLISION_RADIUS = 0.225;
  const DEFAULT_SUPPORT_RADIUS = 0.12;
  const DEFAULT_SEED = 0x5f3759df;

  function resolveLevel(levelOrId = 'fork_rejoin_test') {
    if (levelOrId && typeof levelOrId === 'object' && typeof levelOrId.id === 'string') {
      return levelOrId;
    }
    return window.MarbleLevels.getLevelById(levelOrId);
  }

  function getContactRadius(marble) {
    return marble.collisionRadius ?? DEFAULT_COLLISION_RADIUS;
  }

  function getStartZ(level, marble = {}, dynamicState = null) {
    const sample = window.MarbleLevels.sampleSupportSurface(
      level,
      level.start.x,
      level.start.y,
      marble.supportRadius ?? DEFAULT_SUPPORT_RADIUS,
      0.72,
      {
        minRatio: 0.45,
        runtime: dynamicState
      }
    );

    if (!sample) return getContactRadius(marble);
    return sample.z + getContactRadius(marble);
  }

  function createReplaySeed(level) {
    if (level?.generatorSpec?.seed !== undefined) {
      return level.generatorSpec.seed >>> 0;
    }
    if (typeof window.MarbleLevels?.hashSeed === 'function') {
      return window.MarbleLevels.hashSeed(level?.id || 'fork_rejoin_test');
    }
    return DEFAULT_SEED;
  }

  function createMarbleBody() {
    return {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
      renderRadius: DEFAULT_RENDER_RADIUS,
      collisionRadius: DEFAULT_COLLISION_RADIUS,
      supportRadius: DEFAULT_SUPPORT_RADIUS,
      coyoteTime: 0,
      jumpBufferTime: 0,
      jumpCooldownTime: 0,
      supportSource: null,
      supportRef: null,
      lastSafePosition: null
    };
  }

  function buildReplaySkeleton(level, marble, seed) {
    return {
      version: 2,
      levelId: level.id,
      seed,
      fixedStep: 1 / 120,
      radii: {
        renderRadius: marble.renderRadius,
        collisionRadius: marble.collisionRadius,
        supportRadius: marble.supportRadius
      },
      frames: [],
      result: null
    };
  }

  function createRuntime(levelOrId = 'fork_rejoin_test') {
    const level = resolveLevel(levelOrId);
    const marble = createMarbleBody();
    const seed = createReplaySeed(level);
    const dynamicState = window.MarbleLevels.createDynamicState(level, seed);

    marble.x = level.start.x;
    marble.y = level.start.y;
    marble.z = getStartZ(level, marble, dynamicState);

    return {
      levelId: level.id,
      level,
      marble,
      dynamicState,
      camera: {
        x: level.start.x,
        y: level.start.y,
        lookX: 0,
        lookY: 0
      },
      fixedStep: 1 / 120,
      accumulator: 0,
      simTick: 0,
      seed,
      replay: buildReplaySkeleton(level, marble, seed),
      cameraSmoothing: 1,
      status: 'running',
      timerMs: 0,
      resultApplied: false,
      lastResult: null,
      debug: {
        showRouteGraph: false,
        showCoords: false,
        showGrid: false,
        showActorBounds: false
      }
    };
  }

  function restartRuntime(runtime) {
    const level = runtime.level;
    const marble = runtime.marble;
    runtime.dynamicState = window.MarbleLevels.createDynamicState(level, runtime.seed);

    marble.x = level.start.x;
    marble.y = level.start.y;
    marble.z = getStartZ(level, marble, runtime.dynamicState);
    marble.vx = 0;
    marble.vy = 0;
    marble.vz = 0;
    marble.grounded = true;
    marble.coyoteTime = 0;
    marble.jumpBufferTime = 0;
    marble.jumpCooldownTime = 0;
    marble.supportSource = null;
    marble.supportRef = null;
    marble.lastSafePosition = null;

    runtime.camera.x = level.start.x;
    runtime.camera.y = level.start.y;
    runtime.camera.lookX = 0;
    runtime.camera.lookY = 0;

    runtime.accumulator = 0;
    runtime.simTick = 0;
    runtime.status = 'running';
    runtime.timerMs = 0;
    runtime.resultApplied = false;
    runtime.lastResult = null;
    runtime.replay = buildReplaySkeleton(level, marble, runtime.seed);
    return runtime;
  }

  window.MarbleState = {
    DEFAULT_RENDER_RADIUS,
    DEFAULT_COLLISION_RADIUS,
    DEFAULT_SUPPORT_RADIUS,
    getStartZ,
    createRuntime,
    restartRuntime
  };
})();