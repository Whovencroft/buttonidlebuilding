(() => {
  function createRuntime(levelId = 'training_run') {
    const level = window.MarbleLevels.getLevelById(levelId);

    return {
      levelId: level.id,
      level,
      marble: {
        x: level.start.x,
        y: level.start.y,
        vx: 0,
        vy: 0,
        radius: 18
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
    runtime.marble.vx = 0;
    runtime.marble.vy = 0;
    runtime.status = 'running';
    runtime.timerMs = 0;
    runtime.resultApplied = false;
    runtime.lastResult = null;
    return runtime;
  }

  window.MarbleState = {
    createRuntime,
    restartRuntime
  };
})();