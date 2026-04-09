(() => {
  const GROUND_STEER_ACCEL = 12.5;
  const AIR_STEER_ACCEL = 4.0;
  const SLOPE_ACCEL = 16.0;
  const MAX_GROUND_SPEED = 7.2;
  const MAX_AIR_SPEED = 8.0;
  const MAX_STEP_UP = 0.48;
  const MAX_STEP_DOWN = 0.8;
  const GROUND_SNAP = 0.24;
  const VERTICAL_GRAVITY = -22.0;
  const MOVE_STEP = 0.08;

  const GROUND_SUPPORT_CLEARANCE = 0.54;
  const LANDING_SUPPORT_CLEARANCE = 0.5;
  const WALL_COLLISION_CLEARANCE = 0.92;

  const MIN_GROUNDED_SUPPORT_RATIO = 0.45;
  const MIN_LANDING_SUPPORT_RATIO = 0.34;

  const WALL_Z_EPSILON = 0.04;

  const JUMP_IMPULSE = 6.7;
  const COYOTE_TIME = 0.11;
  const JUMP_BUFFER_TIME = 0.14;
  const JUMP_COOLDOWN = 0.12;
  const JUMP_LIFT = 0.08;

  function ensureJumpState(marble) {
    if (typeof marble.coyoteTime !== 'number') marble.coyoteTime = 0;
    if (typeof marble.jumpBufferTime !== 'number') marble.jumpBufferTime = 0;
    if (typeof marble.jumpCooldownTime !== 'number') marble.jumpCooldownTime = 0;
  }

  function getFootprintOffsets(radius, clearance) {
    const r = radius * clearance;
    const d = r * 0.7071;

    return [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
      [d, d],
      [d, -d],
      [-d, d],
      [-d, -d]
    ];
  }

  function clampSpeed(marble, maxSpeed) {
    const speed = Math.hypot(marble.vx, marble.vy);
    if (speed <= maxSpeed || speed <= 0) return;

    const scale = maxSpeed / speed;
    marble.vx *= scale;
    marble.vy *= scale;
  }

  function averageGradient(samples) {
    if (!samples.length) return { gx: 0, gy: 0 };

    let gx = 0;
    let gy = 0;

    for (const sample of samples) {
      gx += sample.gradient?.gx ?? 0;
      gy += sample.gradient?.gy ?? 0;
    }

    return {
      gx: gx / samples.length,
      gy: gy / samples.length
    };
  }

  function sampleSupport(level, x, y, radius, clearance, minRatio) {
    const offsets = getFootprintOffsets(radius, clearance);
    const samples = [];
    let center = null;

    for (const [ox, oy] of offsets) {
      const sample = window.MarbleLevels.sampleCellSurface(
        level,
        x + ox,
        y + oy,
        { includeWalls: false }
      );

      if (ox === 0 && oy === 0) {
        center = sample;
      }

      if (sample) {
        samples.push(sample);
      }
    }

    if (!samples.length) return null;

    const supportRatio = samples.length / offsets.length;
    if (supportRatio < minRatio) {
      return null;
    }

    const bestSample = center || samples.reduce((best, sample) => {
      if (!best) return sample;
      return sample.z > best.z ? sample : best;
    }, null);

    return {
      ...bestSample,
      centerSample: center,
      supportSamples: samples,
      supportRatio,
      minSupportZ: Math.min(...samples.map((sample) => sample.z)),
      maxSupportZ: Math.max(...samples.map((sample) => sample.z)),
      z: center ? center.z : bestSample.z,
      gradient: center?.gradient || averageGradient(samples)
    };
  }

  function getGroundSupport(level, x, y, radius) {
    return sampleSupport(
      level,
      x,
      y,
      radius,
      GROUND_SUPPORT_CLEARANCE,
      MIN_GROUNDED_SUPPORT_RATIO
    );
  }

  function getLandingSupport(level, x, y, radius) {
    return sampleSupport(
      level,
      x,
      y,
      radius,
      LANDING_SUPPORT_CLEARANCE,
      MIN_LANDING_SUPPORT_RATIO
    );
  }

  function applyGroundForces(runtime, inputAxis, dt, surface) {
    const marble = runtime.marble;
    const downhillX = -(surface.gradient?.gx ?? 0);
    const downhillY = -(surface.gradient?.gy ?? 0);

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

    const stepUp = nextSurface.maxSupportZ - currentSurface.z;
    if (stepUp > MAX_STEP_UP) {
      return 'blocked';
    }

    const stepDown = currentSurface.z - nextSurface.z;
    if (stepDown > MAX_STEP_DOWN) {
      return 'air';
    }

    return 'ground';
  }

  function getBlockingWallTop(level, x, y, radius = 0) {
    let maxTop = null;

    for (const [ox, oy] of getFootprintOffsets(radius, WALL_COLLISION_CLEARANCE)) {
      const tx = Math.floor(x + ox);
      const ty = Math.floor(y + oy);
      const cell = window.MarbleLevels.getCell(level, tx, ty);

      if (!cell || cell.kind !== 'wall') continue;

      const top =
        typeof window.MarbleLevels.getCellTopZ === 'function'
          ? window.MarbleLevels.getCellTopZ(cell)
          : (cell.h || 0);

      maxTop = maxTop === null ? top : Math.max(maxTop, top);
    }

    return maxTop;
  }

  function wallBlocksAtHeight(level, marble, targetX, targetY, targetZ) {
    const wallTop = getBlockingWallTop(level, targetX, targetY, marble.radius);
    if (wallTop === null) return false;

    const marbleBottom = targetZ - marble.radius;
    return marbleBottom <= wallTop + WALL_Z_EPSILON;
  }

  function tryGroundMove(runtime, currentSurface, targetX, targetY) {
    const level = runtime.level;
    const marble = runtime.marble;
    const targetZ = currentSurface.z + marble.radius;

    if (wallBlocksAtHeight(level, marble, targetX, targetY, targetZ)) {
      return {
        blocked: true,
        x: marble.x,
        y: marble.y,
        groundSurface: currentSurface
      };
    }

    const nextSurface = getGroundSupport(level, targetX, targetY, marble.radius);
    const transition = classifySurfaceTransition(currentSurface, nextSurface);

    if (transition === 'blocked') {
      return {
        blocked: true,
        x: marble.x,
        y: marble.y,
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
    let currentSurface = getGroundSupport(level, marble.x, marble.y, marble.radius);

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

      const xSurface = getGroundSupport(level, marble.x, marble.y, marble.radius) || currentSurface;

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

      currentSurface = getGroundSupport(level, marble.x, marble.y, marble.radius);

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
      const targetZ = marble.z + marble.vz * stepDt;
      const targetX = marble.x + marble.vx * stepDt;
      const targetY = marble.y + marble.vy * stepDt;

      if (wallBlocksAtHeight(level, marble, targetX, marble.y, targetZ)) {
        marble.vx = 0;
      } else {
        marble.x = targetX;
      }

      if (wallBlocksAtHeight(level, marble, marble.x, targetY, targetZ)) {
        marble.vy = 0;
      } else {
        marble.y = targetY;
      }

      marble.z = targetZ;

      const surface = getLandingSupport(level, marble.x, marble.y, marble.radius);

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
    const marble = runtime.marble;
    const speed = Math.hypot(marble.vx, marble.vy);

    if (!runtime.camera) {
      runtime.camera = { x: marble.x, y: marble.y, lookX: 0, lookY: 0 };
    }

    if (typeof runtime.camera.lookX !== 'number') runtime.camera.lookX = 0;
    if (typeof runtime.camera.lookY !== 'number') runtime.camera.lookY = 0;

    let dirX = 0;
    let dirY = 0;

    if (speed > 0.001) {
      dirX = marble.vx / speed;
      dirY = marble.vy / speed;
    }

    const desiredLookDistance =
      speed > 0.05
        ? Math.min(1.6, 0.45 + speed * 0.18)
        : 0;

    const lookFollow = Math.min(1, dt * 10);
    runtime.camera.lookX += (dirX * desiredLookDistance - runtime.camera.lookX) * lookFollow;
    runtime.camera.lookY += (dirY * desiredLookDistance - runtime.camera.lookY) * lookFollow;

    const targetX = marble.x + runtime.camera.lookX;
    const targetY = marble.y + runtime.camera.lookY;

    const follow = Math.min(1, dt * 12.5);
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

  function performJump(marble, surface) {
    marble.grounded = false;
    marble.vz = JUMP_IMPULSE;
    marble.z = Math.max(
      marble.z,
      surface.z + marble.radius + JUMP_LIFT
    );
    marble.coyoteTime = 0;
    marble.jumpBufferTime = 0;
    marble.jumpCooldownTime = JUMP_COOLDOWN;
  }

  function updateJumpTimers(marble, jumpPressed, grounded, dt) {
    ensureJumpState(marble);

    if (jumpPressed) {
      marble.jumpBufferTime = JUMP_BUFFER_TIME;
    } else {
      marble.jumpBufferTime = Math.max(0, marble.jumpBufferTime - dt);
    }

    if (grounded) {
      marble.coyoteTime = COYOTE_TIME;
    } else {
      marble.coyoteTime = Math.max(0, marble.coyoteTime - dt);
    }

    marble.jumpCooldownTime = Math.max(0, marble.jumpCooldownTime - dt);
  }

  function updatePhysics(runtime, inputState, dt) {
    if (runtime.status !== 'running') {
      return runtime.lastResult;
    }

    const marble = runtime.marble;
    const level = runtime.level;
    const inputAxis = inputState?.axis || { x: 0, y: 0 };
    const jumpPressed = !!inputState?.jumpPressed;

    let groundSurface = getGroundSupport(level, marble.x, marble.y, marble.radius);
    const isSupportedNow = !!(marble.grounded && groundSurface);

    updateJumpTimers(marble, jumpPressed, isSupportedNow, dt);

    if (
      groundSurface &&
      marble.coyoteTime > 0 &&
      marble.jumpBufferTime > 0 &&
      marble.jumpCooldownTime <= 0
    ) {
      performJump(marble, groundSurface);
      groundSurface = null;
    }

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