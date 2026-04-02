(() => {
  const MARBLE_RADIUS = 0.26;

  function getStartZ(level) {
    const sample = window.MarbleLevels.sampleCellSurface(level, level.start.x, level.start.y);
    if (!sample) return MARBLE_RADIUS;
    return sample.z + MARBLE_RADIUS;
  }

  function createRuntime(levelId = 'training_run') {
    const level = window.MarbleLevels.getLevelById(levelId);

    return {
      levelId: level.id,
      level,
      marble: {
        x: level.start.x,
        y: level.start.y,
        z: getStartZ(level),
        vx: 0,
        vy: 0,
        vz: 0,
        radius: MARBLE_RADIUS,
        grounded: true
      },
      camera: {
        x: level.start.x,
        y: level.start.y
      },
      status: 'running',
      timerMs: 0,
      resultApplied: false,
      lastResult: null
    };
  }

  function restartRuntime(runtime) {
    const level = runtime.level;
    runtime.marble.x = level.start.x;
    runtime.marble.y = level.start.y;
    runtime.marble.z = getStartZ(level);
    runtime.marble.vx = 0;
    runtime.marble.vy = 0;
    runtime.marble.vz = 0;
    runtime.marble.grounded = true;

    runtime.camera.x = level.start.x;
    runtime.camera.y = level.start.y;

    runtime.status = 'running';
    runtime.timerMs = 0;
    runtime.resultApplied = false;
    runtime.lastResult = null;
    return runtime;
  }

  window.MarbleState = {
    MARBLE_RADIUS,
    createRuntime,
    restartRuntime
  };
})();