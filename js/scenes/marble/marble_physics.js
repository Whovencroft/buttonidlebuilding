(() => {
  const GROUND_STEER_ACCEL = 12.5;
  const AIR_STEER_ACCEL = 4.0;
  const SLOPE_ACCEL = 16.0;
  const MAX_GROUND_SPEED = 7.2;
  const MAX_AIR_SPEED = 8.0;
  const MAX_STEP_UP = 0.48;
  const GROUND_SNAP = 0.18;
  const VERTICAL_GRAVITY = -22.0;
  const MOVE_STEP = 0.12;

  function clampSpeed(marble, maxSpeed) {
    const speed = Math.hypot(marble.vx, marble.vy);
    if (speed <= maxSpeed || speed <= 0) return;

    const scale = maxSpeed / speed;
    marble.vx *= scale;
    marble.vy *= scale;
  }

  function applyGroundForces(runtime, inputAxis, dt, surface) {
    const marble = runtime.marble;
    const downhillX = -surface.gradient.gx;
    const downhillY = -surface.gradient.gy;

    marble.vx += (inputAxis.x * GROUND_STEER_ACCEL + downhillX * SLOPE_ACCEL) * dt;
    marble.vy += (inputAxis.y * GROUND_STEER_ACCEL + downhillY * SLOPE_ACCEL) * dt;

    const drag = Math.pow(0.972, dt * 60);
    marble.vx *= drag;
    marble.vy *= drag;

    clampSpeed(marble, MAX_GROUND_SPEED);
  }

  function applyAirForces(runtime, inputAxis, dt) {
    const marble = runtime.marble;

    marble.vx += inputAxis.x * AIR_STEER_ACCEL * dt;
    marble.vy += inputAxis.y * AIR_STEER_ACCEL * dt;
    marble.vz += VERTICAL_GRAVITY * dt;

    const airDrag = Math.pow(0.992, dt * 60);
    marble.vx *= airDrag;
    marble.vy *= airDrag;

    clampSpeed(marble, MAX_AIR_SPEED);
  }

  function getSupportedSurface(level, x, y, radius) {
    return window.MarbleLevels.sampleSupportSurface(level, x, y, radius);
  }

  function classifySurfaceTransition(currentSurface, nextSurface) {
    if (!nextSurface) return 'air';

    if (nextSurface.z > currentSurface.z + MAX_STEP_UP) {
      return 'blocked';
    }

    return 'ground';
  }

  function isWallAt(level, x, y, radius = 0) {
    const offsets = [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius]
    ];

    for (const [ox, oy] of offsets) {
      const tx = Math.floor(x + ox);
      const ty = Math.floor(y + oy);
      const cell = window.MarbleLevels.getCell(level, tx, ty);
      if (cell && cell.kind === 'wall') {
        return true;
      }
    }

    return false;
  }

  function tryGroundMove(runtime, currentSurface, targetX, targetY) {
    const level = runtime.level;
    const radius = runtime.marble.radius;

    if (isWallAt(level, targetX, targetY, radius * 0.8)) {
      return {
        blocked: true,
        x: runtime.marble.x,
        y: runtime.marble.y,
        groundSurface: currentSurface
      };
    }

    const nextSurface = getSupportedSurface(level, targetX, targetY, radius);
    const transition = classifySurfaceTransition(currentSurface, nextSurface);

    if (transition === 'blocked') {
      return {
        blocked: true,
        x: runtime.marble.x,
        y: runtime.marble.y,
        groundSurface: currentSurface
      };
    }

    return {
      blocked: false,
      x: targetX,
      y: targetY,
      groundSurface: transition === 'ground' ? nextSurface : null
    };
  }

  function moveGrounded(runtime, dt) {
    const marble = runtime.marble;
    const level = runtime.level;
    let currentSurface = getSupportedSurface(level, marble.x, marble.y, marble.radius);

    if (!currentSurface) {
      marble.grounded = false;
      return null;
    }

    const totalDx = marble.vx * dt;
    const totalDy = marble.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(totalDx, totalDy) / MOVE_STEP));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i += 1) {
      const full = tryGroundMove(
        runtime,
        currentSurface,
        marble.x + marble.vx * stepDt,
        marble.y + marble.vy * stepDt
      );

      if (!full.blocked) {
        marble.x = full.x;
        marble.y = full.y;

        if (full.groundSurface) {
          currentSurface = full.groundSurface;
          marble.grounded = true;
          marble.z = currentSurface.z + marble.radius;
          marble.vz = 0;
          continue;
        }

        marble.grounded = false;
        return null;
      }

      const tryX = tryGroundMove(
        runtime,
        currentSurface,
        marble.x + marble.vx * stepDt,
        marble.y
      );

      if (!tryX.blocked) {
        marble.x = tryX.x;
        marble.y = tryX.y;
      } else {
        marble.vx = 0;
      }

      const xSurface =
        getSupportedSurface(level, marble.x, marble.y, marble.radius) || currentSurface;

      const tryY = tryGroundMove(
        runtime,
        xSurface,
        marble.x,
        marble.y + marble.vy * stepDt
      );

      if (!tryY.blocked) {
        marble.x = tryY.x;
        marble.y = tryY.y;
      } else {
        marble.vy = 0;
      }

      currentSurface = getSupportedSurface(level, marble.x, marble.y, marble.radius);

      if (!currentSurface) {
        marble.grounded = false;
        return null;
      }

      marble.grounded = true;
      marble.z = currentSurface.z + marble.radius;
      marble.vz = 0;
    }

    return currentSurface;
  }

  function moveAirborne(runtime, dt) {
    const marble = runtime.marble;
    const level = runtime.level;
    const distance = Math.max(
      Math.hypot(marble.vx * dt, marble.vy * dt),
      Math.abs(marble.vz * dt) * 0.25
    );
    const steps = Math.max(1, Math.ceil(distance / MOVE_STEP));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i += 1) {
      const targetX = marble.x + marble.vx * stepDt;
      const targetY = marble.y + marble.vy * stepDt;

      if (isWallAt(level, targetX, marble.y, marble.radius * 0.8)) {
        marble.vx = 0;
      } else {
        marble.x = targetX;
      }

      if (isWallAt(level, marble.x, targetY, marble.radius * 0.8)) {
        marble.vy = 0;
      } else {
        marble.y = targetY;
      }

      marble.z += marble.vz * stepDt;

      const surface = getSupportedSurface(level, marble.x, marble.y, marble.radius);

      if (
        surface &&
        marble.z <= surface.z + marble.radius + GROUND_SNAP &&
        marble.vz <= 0
      ) {
        marble.grounded = true;
        marble.z = surface.z + marble.radius;
        marble.vz = 0;
        return surface;
      }
    }

    marble.grounded = false;
    return null;
  }

  function updateCamera(runtime, dt) {
    const speed = Math.hypot(runtime.marble.vx, runtime.marble.vy);
    const lookAhead = Math.min(0.18, speed * 0.025);
    const targetX = runtime.marble.x + runtime.marble.vx * lookAhead;
    const targetY = runtime.marble.y + runtime.marble.vy * lookAhead;
    const follow = Math.min(1, dt * 9.5);

    runtime.camera.x += (targetX - runtime.camera.x) * follow;
    runtime.camera.y += (targetY - runtime.camera.y) * follow;
  }

  function fail(runtime, reason) {
    runtime.status = 'failed';
    runtime.lastResult = {
      type: 'failed',
      reason,
      levelId: runtime.level.id
    };
    return runtime.lastResult;
  }

  function complete(runtime) {
    runtime.status = 'completed';
    runtime.lastResult = {
      type: 'completed',
      levelId: runtime.level.id,
      bestTimeMs: Math.round(runtime.timerMs),
      reward: runtime.level.reward
    };
    return runtime.lastResult;
  }

  function updatePhysics(runtime, inputAxis, dt) {
    if (runtime.status !== 'running') {
      return runtime.lastResult;
    }

    const marble = runtime.marble;
    const level = runtime.level;
    let groundSurface = getSupportedSurface(level, marble.x, marble.y, marble.radius);

    if (marble.grounded && groundSurface) {
      applyGroundForces(runtime, inputAxis, dt, groundSurface);
      groundSurface = moveGrounded(runtime, dt);
    } else {
      marble.grounded = false;
      applyAirForces(runtime, inputAxis, dt);
      groundSurface = moveAirborne(runtime, dt);
    }

    runtime.timerMs += dt * 1000;
    updateCamera(runtime, dt);

    if (groundSurface && groundSurface.cell.kind === 'hazard') {
      return fail(runtime, 'hazard');
    }

    const dx = marble.x - level.goal.x;
    const dy = marble.y - level.goal.y;
    if (Math.hypot(dx, dy) <= level.goal.radius) {
      return complete(runtime);
    }

    if (marble.z < level.killZ) {
      return fail(runtime, 'fall');
    }

    runtime.lastResult = null;
    return null;
  }

  window.MarblePhysics = {
    updatePhysics
  };
})();