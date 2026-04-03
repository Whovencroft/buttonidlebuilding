(() => {
  const GROUND_STEER_ACCEL = 12.5;
  const AIR_STEER_ACCEL = 4.0;
  const SLOPE_ACCEL = 16.0;
  const MAX_GROUND_SPEED = 7.2;
  const MAX_AIR_SPEED = 8.0;
  const MAX_STEP_UP = 0.34;
  const GROUND_SNAP = 0.18;
  const VERTICAL_GRAVITY = -22.0;

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

  function classifySurfaceTransition(currentSurface, nextSurface) {
    if (!nextSurface) return 'air';

    if (nextSurface.z > currentSurface.z + MAX_STEP_UP) {
      return 'blocked';
    }

    return 'ground';
  }

  function isWallAt(level, x, y) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cell = window.MarbleLevels.getCell(level, tx, ty);
    return !!cell && cell.kind === 'wall';
  }

  function tryGroundMove(runtime, currentSurface, targetX, targetY) {
    const level = runtime.level;

    if (isWallAt(level, targetX, targetY)) {
      return {
        blocked: true,
        x: runtime.marble.x,
        y: runtime.marble.y,
        groundSurface: currentSurface
      };
    }

    const nextSurface = window.MarbleLevels.sampleCellSurface(level, targetX, targetY);
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
    const currentSurface =
      window.MarbleLevels.sampleCellSurface(level, marble.x, marble.y);

    if (!currentSurface) {
      marble.grounded = false;
      return null;
    }

    const full = tryGroundMove(
      runtime,
      currentSurface,
      marble.x + marble.vx * dt,
      marble.y + marble.vy * dt
    );

    if (!full.blocked) {
      marble.x = full.x;
      marble.y = full.y;

      if (full.groundSurface) {
        marble.grounded = true;
        marble.z = full.groundSurface.z + marble.radius;
        marble.vz = 0;
        return full.groundSurface;
      }

      marble.grounded = false;
      return null;
    }

    const tryX = tryGroundMove(
      runtime,
      currentSurface,
      marble.x + marble.vx * dt,
      marble.y
    );

    if (!tryX.blocked) {
      marble.x = tryX.x;
      marble.y = tryX.y;
    } else {
      marble.vx = 0;
    }

    const xSurface =
      window.MarbleLevels.sampleCellSurface(level, marble.x, marble.y) || currentSurface;

    const tryY = tryGroundMove(
      runtime,
      xSurface,
      marble.x,
      marble.y + marble.vy * dt
    );

    if (!tryY.blocked) {
      marble.x = tryY.x;
      marble.y = tryY.y;
    } else {
      marble.vy = 0;
    }

    const finalSurface = window.MarbleLevels.sampleCellSurface(level, marble.x, marble.y);

    if (finalSurface) {
      marble.grounded = true;
      marble.z = finalSurface.z + marble.radius;
      marble.vz = 0;
      return finalSurface;
    }

    marble.grounded = false;
    return null;
  }

  function moveAirborne(runtime, dt) {
    const marble = runtime.marble;
    const level = runtime.level;

    const targetX = marble.x + marble.vx * dt;
    const targetY = marble.y + marble.vy * dt;

    if (isWallAt(level, targetX, marble.y)) {
      marble.vx = 0;
    } else {
      marble.x = targetX;
    }

    if (isWallAt(level, marble.x, targetY)) {
      marble.vy = 0;
    } else {
      marble.y = targetY;
    }

    marble.z += marble.vz * dt;

    const surface = window.MarbleLevels.sampleCellSurface(level, marble.x, marble.y);

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

    marble.grounded = false;
    return null;
  }

  function updateCamera(runtime, dt) {
    const speed = Math.hypot(runtime.marble.vx, runtime.marble.vy);
    const lookAhead = Math.min(0.42, speed * 0.06);
    const targetX = runtime.marble.x + runtime.marble.vx * lookAhead;
    const targetY = runtime.marble.y + runtime.marble.vy * lookAhead;
    const follow = Math.min(1, dt * 8.5);

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
    let groundSurface =
      window.MarbleLevels.sampleCellSurface(level, marble.x, marble.y);

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