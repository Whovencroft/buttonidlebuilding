(() => {
  const DEFAULT_RENDER_RADIUS = 0.26;
  const DEFAULT_COLLISION_RADIUS = 0.235;
  const DEFAULT_SUPPORT_RADIUS = 0.17;
  const DEFAULT_SEED = 0x5f3759df;

  function resolveLevel(levelOrId = 'training_run') {
    if (levelOrId && typeof levelOrId === 'object' && typeof levelOrId.id === 'string') {
      return levelOrId;
    }
    return window.MarbleLevels.getLevelById(levelOrId);
  }

  function getContactRadius(marble) {
    return marble.collisionRadius ?? DEFAULT_COLLISION_RADIUS;
  }

  function getStartZ(level, marble = {}) {
    const sample =
      typeof window.MarbleLevels.sampleSupportSurface === 'function'
        ? window.MarbleLevels.sampleSupportSurface(
            level,
            level.start.x,
            level.start.y,
            marble.supportRadius ?? DEFAULT_SUPPORT_RADIUS,
            0.72,
            { minRatio: 0.45 }
          )
        : window.MarbleLevels.sampleWalkableSurface(level, level.start.x, level.start.y);

    if (!sample) return getContactRadius(marble);
    return sample.z + getContactRadius(marble);
  }

  function createReplaySeed(level) {
    if (level?.generatorSpec?.seed !== undefined) {
      return level.generatorSpec.seed >>> 0;
    }
    if (typeof window.MarbleLevels?.hashSeed === 'function') {
      return window.MarbleLevels.hashSeed(level?.id || 'training_run');
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
      jumpCooldownTime: 0
    };
  }

  function createRuntime(levelOrId = 'training_run') {
    const level = resolveLevel(levelOrId);
    const marble = createMarbleBody();
    marble.x = level.start.x;
    marble.y = level.start.y;
    marble.z = getStartZ(level, marble);

    return {
      levelId: level.id,
      level,
      marble,
      camera: {
        x: level.start.x,
        y: level.start.y,
        lookX: 0,
        lookY: 0
      },
      fixedStep: 1 / 120,
      accumulator: 0,
      simTick: 0,
      seed: createReplaySeed(level),
      replay: {
        version: 1,
        levelId: level.id,
        seed: createReplaySeed(level),
        fixedStep: 1 / 120,
        radii: {
          renderRadius: DEFAULT_RENDER_RADIUS,
          collisionRadius: DEFAULT_COLLISION_RADIUS,
          supportRadius: DEFAULT_SUPPORT_RADIUS
        },
        frames: [],
        result: null
      },
      cameraSmoothing: 1,
      status: 'running',
      timerMs: 0,
      resultApplied: false,
      lastResult: null
    };
  }

  function restartRuntime(runtime) {
    const level = runtime.level;
    const marble = runtime.marble;

    marble.x = level.start.x;
    marble.y = level.start.y;
    marble.z = getStartZ(level, marble);
    marble.vx = 0;
    marble.vy = 0;
    marble.vz = 0;
    marble.grounded = true;
    marble.coyoteTime = 0;
    marble.jumpBufferTime = 0;
    marble.jumpCooldownTime = 0;

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
    runtime.replay = {
      version: 1,
      levelId: level.id,
      seed: runtime.seed,
      fixedStep: runtime.fixedStep,
      radii: {
        renderRadius: marble.renderRadius,
        collisionRadius: marble.collisionRadius,
        supportRadius: marble.supportRadius
      },
      frames: [],
      result: null
    };
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
