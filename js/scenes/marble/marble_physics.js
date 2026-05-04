(() => {
  const GROUND_STEER_ACCEL = 12.2;
  const AIR_STEER_ACCEL = 4.3;
  const SLOPE_ACCEL = 18.4;
  const MAX_GROUND_SPEED = 7.6;
  const MAX_AIR_SPEED = 8.4;

  const MAX_STEP_UP_GROUND = 0.52;
  const MAX_STEP_UP_AIR = 0.52;
  const MAX_STEP_DOWN = 1.15;
  const GROUND_SNAP = 0.14;
  const LEDGE_FALL_HORIZONTAL_DAMPING = 0.55;
  const LEDGE_FALL_DOWNWARD_KICK = -0.4;
  // Air drag tuned for 90% horizontal momentum preservation over a ~0.6s jump arc.
  // At 60fps a 0.6s jump = ~36 frames.
  // 0.9971^36 ≈ 0.90  (idle — no steering input while airborne)
  // 0.9985^36 ≈ 0.95  (active — player steers during jump)
  const AIR_IDLE_DRAG = 0.9971;
  const AIR_ACTIVE_DRAG = 0.9985;
  const HAZARD_TRIGGER_RADIUS = 0.28;

  const VERTICAL_GRAVITY = -22.5;
  const MOVE_STEP = 0.05;

  const GROUND_SUPPORT_CLEARANCE = 1.0;
  const LANDING_SUPPORT_CLEARANCE = 0.92;
  const MIN_GROUNDED_SUPPORT_RATIO = 0.38;
  const MIN_LANDING_SUPPORT_RATIO = 0.28;

  const COLLISION_PUSH_EPSILON = 0.0015;
  const COLLISION_BINARY_STEPS = 10;
  const COLLISION_RESOLVE_PASSES = 3;

  const JUMP_IMPULSE = 6.9;
  const COYOTE_TIME = 0.11;
  const JUMP_BUFFER_TIME = 0.14;
  const JUMP_COOLDOWN = 0.12;
  const JUMP_LIFT = 0.08;

  const LOWEST_PLAYABLE_Z_CACHE = new WeakMap();
  const VOID_FAIL_BELOW_LOWEST_PLAYABLE = 4.5;

  function ensureJumpState(marble) {
    if (typeof marble.coyoteTime !== 'number') marble.coyoteTime = 0;
    if (typeof marble.jumpBufferTime !== 'number') marble.jumpBufferTime = 0;
    if (typeof marble.jumpCooldownTime !== 'number') marble.jumpCooldownTime = 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
    return { gx: gx / samples.length, gy: gy / samples.length };
  }

  function mapScreenInputToWorld(axis) {
    // If the input already carries pre-projected world-space components
    // (set by the drag input system), use them directly.
    if (axis?.worldSpace) {
      let wx = axis.x ?? 0;
      let wy = axis.y ?? 0;
      const length = Math.hypot(wx, wy);
      if (length > 1) { wx /= length; wy /= length; }
      return { x: wx, y: wy };
    }

    // Legacy keyboard path: screen-space WASD → isometric world axes
    const sx = axis?.x ?? 0;
    const sy = axis?.y ?? 0;

    let wx = (sx + sy) * 0.5;
    let wy = (sy - sx) * 0.5;

    const length = Math.hypot(wx, wy);
    if (length > 1) {
      wx /= length;
      wy /= length;
    }

    return { x: wx, y: wy };
  }

  function sampleSupport(runtime, x, y, radius, clearance, minRatio) {
    const support = window.MarbleLevels.sampleSupportSurface(
      runtime.level,
      x,
      y,
      radius,
      clearance,
      {
        minRatio,
        runtime: runtime.dynamicState
      }
    );

    if (!support) return null;
    return {
      ...support,
      gradient: support.gradient || averageGradient(support.supportSamples || [])
    };
  }

  function getGroundSupport(runtime, x, y, radius) {
    const staticSupport = sampleSupport(runtime, x, y, radius, GROUND_SUPPORT_CLEARANCE, MIN_GROUNDED_SUPPORT_RATIO);
    if (staticSupport) return staticSupport;
    // PLATFORM GROUND FIX: if the multi-sample spread misses a narrow platform,
    // fall back to the center-point direct check so the marble stays grounded
    // on the platform while rolling across it (not just on landing).
    const marble = runtime.marble;
    const actorSurface = window.MarbleLevels.sampleActorSurfaceDirect(
      runtime.level, runtime.dynamicState, x, y, marble.z
    );
    if (actorSurface) {
      const platTop = actorSurface.z + (marble.collisionRadius ?? 0.5);
      // Only treat as ground if marble is within 0.6 units above platform top
      if (marble.z <= platTop + 0.6 && marble.z >= actorSurface.z - 1.5) {
        return { ...actorSurface, gradient: { gx: 0, gy: 0 } };
      }
    }
    return null;
  }

  function getLandingSupport(runtime, x, y, radius) {
    return sampleSupport(runtime, x, y, radius, LANDING_SUPPORT_CLEARANCE, MIN_LANDING_SUPPORT_RATIO);
  }

  function classifySurfaceTransition(currentSurface, nextSurface) {
    if (!nextSurface) return 'air';
    const stepUp = nextSurface.maxSupportZ - currentSurface.z;
    if (stepUp > MAX_STEP_UP_GROUND) return 'blocked';
    const stepDown = currentSurface.z - nextSurface.z;
    if (stepDown > MAX_STEP_DOWN && !nextSurface.landingPad) return 'air';
    return 'ground';
  }

  function rectCircleOverlapData(minX, minY, maxX, maxY, circleX, circleY, radius) {
    const closestX = clamp(circleX, minX, maxX);
    const closestY = clamp(circleY, minY, maxY);
    const dx = circleX - closestX;
    const dy = circleY - closestY;
    const distSq = dx * dx + dy * dy;
    if (distSq > radius * radius) return null;

    if (distSq > 0.0000001) {
      const dist = Math.sqrt(distSq);
      return {
        penetration: radius - dist,
        normal: { x: dx / dist, y: dy / dist }
      };
    }

    const left = circleX - minX;
    const right = maxX - circleX;
    const top = circleY - minY;
    const bottom = maxY - circleY;

    let penetration = left + radius;
    let normal = { x: -1, y: 0 };
    if (right < left && right <= top && right <= bottom) {
      penetration = right + radius;
      normal = { x: 1, y: 0 };
    } else if (top < left && top <= right && top <= bottom) {
      penetration = top + radius;
      normal = { x: 0, y: -1 };
    } else if (bottom < left && bottom <= right && bottom <= top) {
      penetration = bottom + radius;
      normal = { x: 0, y: 1 };
    }

    return { penetration, normal };
  }

 function isSecurelyOnBlockerTop(x, y, radius, tx, ty) {
  const inset = Math.min(0.32, Math.max(0.26, radius + 0.04));
  return (
    x >= tx + inset &&
    x <= tx + 1 - inset &&
    y >= ty + inset &&
    y <= ty + 1 - inset
  );
}

  function getStaticBlockingOverlaps(runtime, x, y, zCheck, radius, supportZ) {
    const level = runtime.level;
    const overlaps = [];
    const marbleBottom = zCheck - radius;
    const minTx = Math.floor(x - radius) - 1;
    const maxTx = Math.floor(x + radius) + 1;
    const minTy = Math.floor(y - radius) - 1;
    const maxTy = Math.floor(y + radius) + 1;

    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        const blocker = window.MarbleLevels.getBlockerCell(level, tx, ty);
        if (blocker) {
          if (marbleBottom > blocker.top + 0.04) continue;

          const standingSecurelyOnTop =
            blocker.walkableTop &&
            supportZ !== null &&
            supportZ !== undefined &&
            Math.abs(supportZ - blocker.top) <= 0.02 &&
            marbleBottom >= blocker.top - 0.02 &&
            isSecurelyOnBlockerTop(x, y, radius, tx, ty);

          if (standingSecurelyOnTop) continue;

          const overlap = rectCircleOverlapData(tx, ty, tx + 1, ty + 1, x, y, radius);
          if (!overlap) continue;

          overlaps.push({
            penetration: overlap.penetration,
            normal: overlap.normal,
            blockerTop: blocker.top,
            blocker,
            tx,
            ty
          });
          continue;
        }

        // Terrain tiles that are too tall to step up also act as walls,
        // but ONLY for flat-topped tiles (shape === 'flat').  Ramp and slope
        // tiles have a high max-corner height but are walkable from the low
        // end; treating them as walls would block the marble from rolling
        // alongside or onto them.
        const surface = window.MarbleLevels.getSurfaceCell(level, tx, ty);
        if (!surface || surface.kind === 'void') continue;
        if (surface.shape !== 'flat') continue;

        // CRUMBLE WALL-TELEPORT FIX: if this tile is a crumble tile that is
        // currently broken, do NOT treat it as a wall blocker. The marble
        // should fall through the void, not be pushed sideways/upward by the
        // wall collision resolver. Without this, a marble standing next to a
        // wall on a crumble tile gets pushed onto top of the wall when the
        // tile breaks, because the collision push vector has an upward
        // component in isometric space.
        if (surface.crumble && window.MarbleLevels.isCrumbleBroken(runtime.dynamicState, tx, ty)) continue;

        const fz = surface.baseHeight;
        if (fz <= marbleBottom + MAX_STEP_UP_AIR + 0.04) continue;

        // Don't block if the marble is standing on top of this terrain tile
        // (supportZ matches the tile's surface height).
        if (supportZ !== null && supportZ !== undefined && Math.abs(supportZ - fz) <= 0.04) continue;

        const overlap = rectCircleOverlapData(tx, ty, tx + 1, ty + 1, x, y, radius);
        if (!overlap) continue;

        overlaps.push({
          penetration: overlap.penetration,
          normal: overlap.normal,
          blockerTop: fz,
          blocker: null,
          tx,
          ty
        });
      }
    }

    return overlaps;
  }
  
  function combineCollisionNormal(overlaps) {
    if (!overlaps.length) return null;
    let nx = 0;
    let ny = 0;
    let best = overlaps[0];
    for (const overlap of overlaps) {
      nx += overlap.normal.x * overlap.penetration;
      ny += overlap.normal.y * overlap.penetration;
      if (overlap.penetration > best.penetration) best = overlap;
    }
    const len = Math.hypot(nx, ny);
    if (len <= 0.000001) return { x: best.normal.x, y: best.normal.y };
    return { x: nx / len, y: ny / len };
  }

  function removeIntoWallComponent(vx, vy, normal) {
    if (!normal) return { vx, vy };
    const into = vx * normal.x + vy * normal.y;
    if (into >= 0) return { vx, vy };
    return {
      vx: vx - normal.x * into,
      vy: vy - normal.y * into
    };
  }

  // Reusable overlap buffer to avoid GC pressure in hot collision path
  const _overlapBuf = [];
  function getAllBlockingOverlaps(runtime, x, y, zCheck, radius, supportZ) {
    _overlapBuf.length = 0;
    const statics = getStaticBlockingOverlaps(runtime, x, y, zCheck, radius, supportZ);
    for (let i = 0; i < statics.length; i++) _overlapBuf.push(statics[i]);
    const actors = window.MarbleLevels.getActorBlockingOverlaps(runtime.level, runtime.dynamicState, x, y, zCheck, radius, supportZ);
    for (let i = 0; i < actors.length; i++) _overlapBuf.push(actors[i]);
    return _overlapBuf;
  }

  function resolveSweptBlockerMovement(runtime, startX, startY, moveX, moveY, zCheck, supportZ) {
    const marble = runtime.marble;
    let currentX = startX;
    let currentY = startY;
    let remainingX = moveX;
    let remainingY = moveY;
    let collided = false;
    let lastNormal = null;

    for (let pass = 0; pass < COLLISION_RESOLVE_PASSES; pass += 1) {
      const targetX = currentX + remainingX;
      const targetY = currentY + remainingY;
      const targetOverlaps = getAllBlockingOverlaps(runtime, targetX, targetY, zCheck, marble.collisionRadius, supportZ);
      if (!targetOverlaps.length) {
        return { x: targetX, y: targetY, collided, normal: lastNormal };
      }

      collided = true;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < COLLISION_BINARY_STEPS; i += 1) {
        const mid = (lo + hi) * 0.5;
        const testX = currentX + remainingX * mid;
        const testY = currentY + remainingY * mid;
        const overlaps = getAllBlockingOverlaps(runtime, testX, testY, zCheck, marble.collisionRadius, supportZ);
        if (overlaps.length) hi = mid;
        else lo = mid;
      }

      const safeX = currentX + remainingX * lo;
      const safeY = currentY + remainingY * lo;
      const hitX = currentX + remainingX * hi;
      const hitY = currentY + remainingY * hi;
      const hitOverlaps = getAllBlockingOverlaps(runtime, hitX, hitY, zCheck, marble.collisionRadius, supportZ);
      const normal = combineCollisionNormal(hitOverlaps);
      lastNormal = normal;
      if (!normal) {
        return { x: safeX, y: safeY, collided: true, normal: null };
      }

      currentX = safeX + normal.x * COLLISION_PUSH_EPSILON;
      currentY = safeY + normal.y * COLLISION_PUSH_EPSILON;
      const remainingFactor = 1 - lo;
      const slide = removeIntoWallComponent(remainingX * remainingFactor, remainingY * remainingFactor, normal);
      remainingX = slide.vx;
      remainingY = slide.vy;
      if (Math.hypot(remainingX, remainingY) < 0.0001) {
        return { x: currentX, y: currentY, collided: true, normal };
      }
    }

    return { x: currentX, y: currentY, collided, normal: lastNormal };
  }

  function applyGroundForces(runtime, inputAxis, dt, surface) {
    const marble = runtime.marble;
    const worldInput = mapScreenInputToWorld(inputAxis);
    const downhillX = -(surface.gradient?.gx ?? 0);
    const downhillY = -(surface.gradient?.gy ?? 0);
    const friction = surface.friction ?? 1;
    const conveyor = surface.conveyor ?? null;

    marble.vx += (worldInput.x * GROUND_STEER_ACCEL + downhillX * SLOPE_ACCEL) * dt;
    marble.vy += (worldInput.y * GROUND_STEER_ACCEL + downhillY * SLOPE_ACCEL) * dt;

    if (conveyor) {
      // Conveyor multiplier boosted to 3.0 (was 1.1) — conveyors now push
      // hard enough to meaningfully affect marble trajectory and force
      // players to actively counteract them.
      marble.vx += conveyor.x * conveyor.strength * 3.0 * dt;
      marble.vy += conveyor.y * conveyor.strength * 3.0 * dt;
    }

    // Ice tiles (friction < 0.4): very low drag, speed builds uncontrollably
    // Normal tiles: standard drag formula
    const isIce = friction < 0.4;
    const dragBase = isIce ? 0.998 : 0.972;
    const drag = Math.pow(dragBase / Math.max(0.40, friction), dt * 60);
    marble.vx *= drag;
    marble.vy *= drag;

    // Ice tiles allow much higher speed; normal tiles cap at 1.35x
    const speedMult = isIce ? clamp(1.2 / friction, 1.0, 4.5) : clamp(1.2 / friction, 0.78, 1.35);
    clampSpeed(marble, MAX_GROUND_SPEED * speedMult);
  }

  function applyAirForces(runtime, inputAxis, dt) {
  const marble = runtime.marble;
  const worldInput = mapScreenInputToWorld(inputAxis);

  marble.vx += worldInput.x * AIR_STEER_ACCEL * dt;
  marble.vy += worldInput.y * AIR_STEER_ACCEL * dt;
  marble.vz += VERTICAL_GRAVITY * dt;

  const inputMag = Math.hypot(worldInput.x, worldInput.y);
  const airDrag = Math.pow(inputMag < 0.05 ? AIR_IDLE_DRAG : AIR_ACTIVE_DRAG, dt * 60);

  marble.vx *= airDrag;
  marble.vy *= airDrag;

  clampSpeed(marble, MAX_AIR_SPEED);
}

  function moveGrounded(runtime, dt) {
  const marble = runtime.marble;
  let currentSurface = getGroundSupport(runtime, marble.x, marble.y, marble.supportRadius);
  if (!currentSurface) {
    // CRUMBLE WALL-TELEPORT FIX: apply a downward kick immediately when the
    // marble loses ground support (e.g. crumble tile just broke). This
    // prevents the marble from floating at the old z for one frame, which
    // combined with nearby wall tiles could push it upward onto the wall top.
    if (marble.vz >= 0) marble.vz = LEDGE_FALL_DOWNWARD_KICK;
    marble.grounded = false;
    return null;
  }

  window.MarbleLevels.resolveSupportInteraction(runtime, currentSurface);
  const totalDx = marble.vx * dt;
  const totalDy = marble.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.hypot(totalDx, totalDy) / MOVE_STEP));
  const stepDt = dt / steps;

  for (let i = 0; i < steps; i += 1) {
    const startX = marble.x;
    const startY = marble.y;

    const stepDx = marble.vx * stepDt;
    const stepDy = marble.vy * stepDt;
    const previewSurface = getGroundSupport(runtime, marble.x + stepDx, marble.y + stepDy, marble.supportRadius);
    const transition = classifySurfaceTransition(currentSurface, previewSurface);
    const collisionSupportZ = transition === 'ground' && previewSurface ? previewSurface.z : currentSurface.z;

    const resolved = resolveSweptBlockerMovement(runtime, marble.x, marble.y, stepDx, stepDy, marble.z, collisionSupportZ);

    marble.x = resolved.x;
    marble.y = resolved.y;

    if (resolved.collided && resolved.normal) {
      const adjusted = removeIntoWallComponent(marble.vx, marble.vy, resolved.normal);
      marble.vx = adjusted.vx;
      marble.vy = adjusted.vy;
    }

    const landedSurface = getGroundSupport(runtime, marble.x, marble.y, marble.supportRadius);

    if (
      landedSurface &&
      !landedSurface.landingPad &&
      landedSurface.z - currentSurface.z > MAX_STEP_UP_GROUND + 0.01
    ) {
      marble.x = startX;
      marble.y = startY;

      const len = Math.hypot(stepDx, stepDy) || 1;
      const blockNormal = { x: -stepDx / len, y: -stepDy / len };
      const adjusted = removeIntoWallComponent(marble.vx, marble.vy, blockNormal);
      marble.vx = adjusted.vx;
      marble.vy = adjusted.vy;

      marble.grounded = true;
      marble.z = currentSurface.z + marble.collisionRadius;
      marble.vz = 0;
      continue;
    }

    const landedTransition = classifySurfaceTransition(currentSurface, landedSurface);

    if (landedTransition === 'ground' && landedSurface) {
      currentSurface = landedSurface;
      marble.grounded = true;
      marble.z = currentSurface.z + marble.collisionRadius;
      marble.vz = 0;
      continue;
    }

    if (landedTransition === 'air') {
      marble.vx *= LEDGE_FALL_HORIZONTAL_DAMPING;
      marble.vy *= LEDGE_FALL_HORIZONTAL_DAMPING;
      marble.vz = Math.min(marble.vz, LEDGE_FALL_DOWNWARD_KICK);
      marble.grounded = false;
      return null;
    }

    marble.grounded = true;
    marble.z = currentSurface.z + marble.collisionRadius;
    marble.vz = 0;
  }

  return currentSurface;
}

  function moveAirborne(runtime, dt) {
    const marble = runtime.marble;
    const totalDx = marble.vx * dt;
    const totalDy = marble.vy * dt;
    const totalDz = marble.vz * dt;

    const horizontalSteps = Math.ceil(Math.hypot(totalDx, totalDy) / MOVE_STEP);
    // PLATFORM CLIP FIX: use a much smaller vertical step size so a fast-falling
    // marble cannot skip over a platform surface in a single sub-step.
    // The old value (0.12-0.21) was too large relative to the effective platform
    // thickness (near zero), causing clip-through on jump landings.
    const verticalStepSize = Math.max(0.04, marble.collisionRadius * 0.18);
    const verticalSteps = Math.ceil(Math.abs(totalDz) / verticalStepSize);
    const steps = Math.max(1, horizontalSteps, verticalSteps);
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i += 1) {
      const startZ = marble.z;
      const stepDx = marble.vx * stepDt;
      const stepDy = marble.vy * stepDt;
      const targetZ = marble.z + marble.vz * stepDt;

      // PLATFORM CLIP FIX: before moving, check if a platform surface exists
      // at the current position and the marble is about to cross its top.
      // This catches the case where the marble arrives exactly at the platform
      // level at the start of a sub-step rather than the end.
      if (marble.vz <= 0) {
        const preSurface = getLandingSupport(runtime, marble.x, marble.y, marble.supportRadius);
        if (preSurface) {
          const preLandZ = preSurface.z + marble.collisionRadius + (preSurface.landingPad ? 0.35 : GROUND_SNAP);
          if (marble.z >= preLandZ && targetZ <= preLandZ) {
            marble.grounded = true;
            marble.z = preSurface.z + marble.collisionRadius;
            marble.vz = 0;
            return preSurface;
          }
        }
      }

      const previewSupport = getLandingSupport(
        runtime,
        marble.x + stepDx,
        marble.y + stepDy,
        marble.supportRadius
      );

      const collisionSupportZ = previewSupport ? previewSupport.z : null;
      const zCheck = Math.min(startZ, targetZ);

      const resolved = resolveSweptBlockerMovement(
        runtime,
        marble.x,
        marble.y,
        stepDx,
        stepDy,
        zCheck,
        collisionSupportZ
      );

      marble.x = resolved.x;
      marble.y = resolved.y;
      marble.z = targetZ;

      if (resolved.collided && resolved.normal) {
        const adjusted = removeIntoWallComponent(marble.vx, marble.vy, resolved.normal);
        marble.vx = adjusted.vx;
        marble.vy = adjusted.vy;
        // Wall-climb prevention: if the marble is moving upward and the wall
        // it hit extends above the marble's current z, cancel upward velocity.
        // This prevents the marble from climbing arbitrarily tall walls by
        // jumping against their side faces.
        if (marble.vz > 0) {
          const wallOverlaps = getAllBlockingOverlaps(
            runtime, marble.x, marble.y, zCheck, marble.collisionRadius, collisionSupportZ
          );
          const wallTop = wallOverlaps.reduce((best, o) => Math.max(best, o.blockerTop ?? 0), 0);
          if (wallTop > marble.z + 0.15) {
            marble.vz = 0;
          }
        }
      }

      const surface = getLandingSupport(runtime, marble.x, marble.y, marble.supportRadius);
      if (surface && marble.vz <= 0) {
        const landingZ = surface.z + marble.collisionRadius + (surface.landingPad ? 0.35 : GROUND_SNAP);
        const crossedLandingPlane = startZ > landingZ && marble.z <= landingZ;
        const endedBelowLandingPlane = marble.z <= landingZ;

        if (crossedLandingPlane || endedBelowLandingPlane) {
          marble.grounded = true;
          marble.z = surface.z + marble.collisionRadius;
          marble.vz = 0;
          return surface;
        }
      }

      // PLATFORM HITBOX FIX: dedicated center-point platform sweep.
      // The standard getLandingSupport uses a 16-point radius spread, which
      // can miss narrow platforms when most sample points fall outside the
      // platform rect. This pass checks only the marble center XY against
      // every platform's rect with a generous tolerance, then tests whether
      // the marble's vertical path crossed the platform top this sub-step.
      // This is the primary landing detection for moving platforms.
      if (marble.vz <= 0) {
        const directSurface = window.MarbleLevels.sampleActorSurfaceDirect(
          runtime.level, runtime.dynamicState, marble.x, marble.y, startZ + 0.2
        );
        if (directSurface) {
          const platTop = directSurface.z + marble.collisionRadius;
          // Generous slab: platform top down to top-2.0 so a fast-falling
          // marble that overshoots by up to 2 units still lands cleanly.
          const platSlab = directSurface.z - 2.0;
          // Case 1: marble crossed the platform top this sub-step (normal landing)
          const crossedDown = startZ >= platTop - 0.08 && marble.z <= platTop;
          // Case 2: marble ended below platform top but within the slab
          // (fell through in a previous sub-step, catch it now)
          const alreadyBelow = marble.z < platTop && marble.z >= platSlab;
          const withinSlab   = marble.z >= platSlab;
          if ((crossedDown || alreadyBelow) && withinSlab) {
            marble.grounded = true;
            marble.z = directSurface.z + marble.collisionRadius;
            marble.vz = 0;
            return directSurface;
          }
          // Case 3: platform rose up into the marble between frames (dz > 0)
          const platformDz = directSurface.actorState?.dz ?? 0;
          if (platformDz > 0) {
            const platTopAtStart = platTop - platformDz;
            if (startZ >= platTopAtStart - 0.08 && marble.z <= platTop + platformDz) {
              marble.grounded = true;
              marble.z = directSurface.z + marble.collisionRadius;
              marble.vz = 0;
              return directSurface;
            }
          }
        }
      }
    }

    marble.grounded = false;
    return null;
  }

  // ─── Tunnel Physics ─────────────────────────────────────────────────────
  // Catmull-Rom spline interpolation for smooth tunnel paths
  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
    };
  }

  function catmullRomTangent(p0, p1, p2, p3, t) {
    const t2 = t * t;
    return {
      x: 0.5 * ((-p0.x + p2.x) + (4 * p0.x - 10 * p1.x + 8 * p2.x - 2 * p3.x) * t + (-3 * p0.x + 9 * p1.x - 9 * p2.x + 3 * p3.x) * t2),
      y: 0.5 * ((-p0.y + p2.y) + (4 * p0.y - 10 * p1.y + 8 * p2.y - 2 * p3.y) * t + (-3 * p0.y + 9 * p1.y - 9 * p2.y + 3 * p3.y) * t2),
      z: 0.5 * ((-p0.z + p2.z) + (4 * p0.z - 10 * p1.z + 8 * p2.z - 2 * p3.z) * t + (-3 * p0.z + 9 * p1.z - 9 * p2.z + 3 * p3.z) * t2)
    };
  }

  function getTunnelSplinePoint(path, progress) {
    const n = path.length;
    const totalSegments = n - 1;
    const clampedProgress = clamp(progress, 0, 1);
    const scaledT = clampedProgress * totalSegments;
    const segIndex = Math.min(Math.floor(scaledT), totalSegments - 1);
    const localT = scaledT - segIndex;

    const p0 = path[Math.max(0, segIndex - 1)];
    const p1 = path[segIndex];
    const p2 = path[Math.min(n - 1, segIndex + 1)];
    const p3 = path[Math.min(n - 1, segIndex + 2)];

    return catmullRom(p0, p1, p2, p3, localT);
  }

  function getTunnelSplineTangent(path, progress) {
    const n = path.length;
    const totalSegments = n - 1;
    const clampedProgress = clamp(progress, 0, 1);
    const scaledT = clampedProgress * totalSegments;
    const segIndex = Math.min(Math.floor(scaledT), totalSegments - 1);
    const localT = scaledT - segIndex;

    const p0 = path[Math.max(0, segIndex - 1)];
    const p1 = path[segIndex];
    const p2 = path[Math.min(n - 1, segIndex + 1)];
    const p3 = path[Math.min(n - 1, segIndex + 2)];

    return catmullRomTangent(p0, p1, p2, p3, localT);
  }

  function findTunnelActorAtTile(level, tx, ty) {
    for (const actor of level.actors) {
      if (actor.kind !== 'tunnel') continue;
      if (!actor.tunnelPath || actor.tunnelPath.length < 2) continue;
      const entry = actor.tunnelPath[0];
      // Entry tile is the tile containing the first path point
      if (Math.floor(entry.x) === tx && Math.floor(entry.y) === ty) return actor;
    }
    return null;
  }

  function enterTunnel(runtime, actor) {
    const marble = runtime.marble;
    marble.inTunnel = {
      actorId: actor.id,
      progress: 0,
      speed: actor.tunnelSpeed ?? 8.0,
      path: actor.tunnelPath,
      exitType: actor.exitType ?? 'emerge',
      exitVelocity: actor.exitVelocity ?? null
    };
    marble.grounded = false;
    marble.vx = 0;
    marble.vy = 0;
    marble.vz = 0;
  }

  function updateTunnelPhysics(runtime, dt) {
    const marble = runtime.marble;
    const tunnel = marble.inTunnel;
    if (!tunnel) return false;

    const path = tunnel.path;
    if (!path || path.length < 2) {
      marble.inTunnel = null;
      return false;
    }

    // Compute approximate total spline length for speed normalization
    // (cached on first call)
    if (!tunnel._totalLength) {
      let totalLen = 0;
      const samples = path.length * 10;
      let prev = getTunnelSplinePoint(path, 0);
      for (let i = 1; i <= samples; i++) {
        const pt = getTunnelSplinePoint(path, i / samples);
        totalLen += Math.sqrt((pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2 + (pt.z - prev.z) ** 2);
        prev = pt;
      }
      tunnel._totalLength = totalLen;
    }

    // Advance progress based on speed
    const progressPerSecond = tunnel.speed / tunnel._totalLength;
    tunnel.progress += progressPerSecond * dt;

    if (tunnel.progress >= 1.0) {
      // Exit tunnel
      const exitPoint = getTunnelSplinePoint(path, 1.0);
      const exitTangent = getTunnelSplineTangent(path, 0.98);
      const tangentLen = Math.sqrt(exitTangent.x ** 2 + exitTangent.y ** 2 + exitTangent.z ** 2) || 1;

      marble.x = exitPoint.x;
      marble.y = exitPoint.y;
      marble.z = exitPoint.z + marble.collisionRadius;

      if (tunnel.exitVelocity) {
        marble.vx = tunnel.exitVelocity.x ?? 0;
        marble.vy = tunnel.exitVelocity.y ?? 0;
        marble.vz = tunnel.exitVelocity.z ?? 0;
      } else {
        // Default: eject along tangent at tunnel speed
        const exitSpeed = tunnel.speed * 0.6;
        marble.vx = (exitTangent.x / tangentLen) * exitSpeed;
        marble.vy = (exitTangent.y / tangentLen) * exitSpeed;
        marble.vz = (exitTangent.z / tangentLen) * exitSpeed;
      }

      if (tunnel.exitType === 'drop') {
        // Void drop: just let marble fall
        marble.vz = Math.min(marble.vz, -2);
      } else if (tunnel.exitType === 'floor') {
        // Land on floor below
        marble.vz = Math.min(marble.vz, 0);
      }
      // 'emerge' = normal exit with tangent velocity

      marble.grounded = false;
      marble.inTunnel = null;
      return true;
    }

    // Interpolate position along spline
    const pos = getTunnelSplinePoint(path, tunnel.progress);
    marble.x = pos.x;
    marble.y = pos.y;
    marble.z = pos.z + marble.collisionRadius;

    return true;
  }

  function checkTunnelEntry(runtime, groundSurface) {
    if (!groundSurface) return false;
    const marble = runtime.marble;
    if (marble.inTunnel) return false;

    const trigger = window.MarbleLevels.getTriggerCell(runtime.level, groundSurface.tx, groundSurface.ty);
    if (!trigger || trigger.kind !== 'tunnel_entry') return false;

    const actor = findTunnelActorAtTile(runtime.level, groundSurface.tx, groundSurface.ty);
    if (!actor) return false;

    // Check marble is close to entry center
    const entry = actor.tunnelPath[0];
    const dx = marble.x - entry.x;
    const dy = marble.y - entry.y;
    if (Math.hypot(dx, dy) > 0.7) return false;

    enterTunnel(runtime, actor);
    return true;
  }

  function updateCamera(runtime, dt) {
    const marble = runtime.marble;
    const speed = Math.hypot(marble.vx, marble.vy);
    if (!runtime.camera) {
      runtime.camera = { x: marble.x, y: marble.y, lookX: 0, lookY: 0 };
    }

    let dirX = 0;
    let dirY = 0;
    if (speed > 0.001) {
      dirX = marble.vx / speed;
      dirY = marble.vy / speed;
    }

    const desiredLookDistance = speed > 0.05 ? Math.min(1.8, 0.5 + speed * 0.2) : 0;
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
    runtime.lastResult = { type: 'failed', reason, levelId: runtime.level.id };
    return runtime.lastResult;
  }

  function complete(runtime, bestTimeMs) {
    runtime.status = 'completed';
    runtime.lastResult = { type: 'completed', levelId: runtime.level.id, bestTimeMs, reward: runtime.level.reward };
    return runtime.lastResult;
  }

  function performJump(marble, surface) {
    marble.grounded = false;
    marble.vz = JUMP_IMPULSE + (surface.bounce ? surface.bounce * 0.15 : 0);
    marble.z = Math.max(marble.z, surface.z + marble.collisionRadius + JUMP_LIFT);
    marble.coyoteTime = 0;
    marble.jumpBufferTime = 0;
    marble.jumpCooldownTime = JUMP_COOLDOWN;
  }

  function updateJumpTimers(marble, jumpPressed, grounded, dt) {
    ensureJumpState(marble);
    if (jumpPressed) marble.jumpBufferTime = JUMP_BUFFER_TIME;
    else marble.jumpBufferTime = Math.max(0, marble.jumpBufferTime - dt);

    if (grounded) marble.coyoteTime = COYOTE_TIME;
    else marble.coyoteTime = Math.max(0, marble.coyoteTime - dt);

    marble.jumpCooldownTime = Math.max(0, marble.jumpCooldownTime - dt);
  }

  function applyBounceSurface(runtime, groundSurface) {
    if (!groundSurface || !groundSurface.bounce) return false;
    const marble = runtime.marble;
    if (marble.jumpCooldownTime > 0.05) return false;
    marble.grounded = false;
    marble.vz = Math.max(marble.vz, groundSurface.bounce);
    marble.z = groundSurface.z + marble.collisionRadius + 0.05;
    marble.jumpCooldownTime = 0.2;
    return true;
  }

  function evaluateTriggers(runtime, groundSurface) {
    if (!groundSurface) return null;
    if (groundSurface.failType) {
      return fail(runtime, groundSurface.failType);
    }

    const trigger = window.MarbleLevels.getTriggerCell(runtime.level, groundSurface.tx, groundSurface.ty);
    if (trigger?.kind === 'hazard') {
  const cx = groundSurface.tx + 0.5;
  const cy = groundSurface.ty + 0.5;
  const dx = runtime.marble.x - cx;
  const dy = runtime.marble.y - cy;
  const radius = trigger.radius ?? HAZARD_TRIGGER_RADIUS;

  if (Math.hypot(dx, dy) <= radius) {
    return fail(runtime, trigger.data?.type || 'hazard');
  }
}

    if (trigger?.kind === 'goal') {
      const cx = groundSurface.tx + 0.5;
      const cy = groundSurface.ty + 0.5;
      const radius = trigger.radius ?? runtime.level.goal?.radius ?? 0.42;
      const dx = runtime.marble.x - cx;
      const dy = runtime.marble.y - cy;
      if (Math.hypot(dx, dy) <= radius) return complete(runtime, Math.round(runtime.timerMs));
    }

    const hazardContacts = window.MarbleLevels.getHazardContacts(runtime.level, runtime.dynamicState, runtime.marble);
    if (hazardContacts.length) {
      return fail(runtime, hazardContacts[0].actor.kind);
    }

    return null;
  }

  function rememberSafePosition(runtime, groundSurface) {
    if (!groundSurface) return;
    runtime.marble.lastSafePosition = {
      x: runtime.marble.x,
      y: runtime.marble.y,
      z: runtime.marble.z,
      levelId: runtime.level.id
    };
  }

  function getLevelLowestPlayableZ(level) {
    const cached = LOWEST_PLAYABLE_Z_CACHE.get(level);
    if (typeof cached === 'number') return cached;

    let lowest = Infinity;

    for (let ty = 0; ty < level.height; ty += 1) {
      for (let tx = 0; tx < level.width; tx += 1) {
        const surface = window.MarbleLevels.getSurfaceCell(level, tx, ty);
        if (surface && surface.kind !== 'void') {
          lowest = Math.min(lowest, window.MarbleLevels.getSurfaceTopZ(surface));
        }

        const blocker = window.MarbleLevels.getBlockerCell(level, tx, ty);
        if (blocker?.walkableTop) {
          lowest = Math.min(lowest, blocker.top);
        }
      }
    }

    for (const actor of level.actors || []) {
      if (
        actor.kind !== window.MarbleLevels.ACTOR_KINDS.MOVING_PLATFORM &&
        actor.kind !== window.MarbleLevels.ACTOR_KINDS.ELEVATOR
      ) {
        continue;
      }

      if (actor.path?.points?.length) {
        for (const point of actor.path.points) {
          lowest = Math.min(lowest, point.z ?? actor.z ?? actor.topHeight ?? 0);
        }
      } else if (actor.travel) {
        lowest = Math.min(lowest, actor.travel.min ?? actor.z ?? actor.topHeight ?? 0);
      } else {
        lowest = Math.min(lowest, actor.z ?? actor.topHeight ?? 0);
      }
    }

    if (!Number.isFinite(lowest)) {
      lowest = level.voidFloor ?? level.killZ ?? -5;
    }

    LOWEST_PLAYABLE_Z_CACHE.set(level, lowest);
    return lowest;
  }

  

function shouldFailFromVoidFall(runtime) {
  const marble = runtime.marble;
  if (marble.grounded) return false;

  const lowestPlayableZ = getLevelLowestPlayableZ(runtime.level);
  return marble.z < (lowestPlayableZ - VOID_FAIL_BELOW_LOWEST_PLAYABLE);
}

  function updatePhysics(runtime, inputState, dt) {
    if (runtime.status !== 'running') return runtime.lastResult;
    const marble = runtime.marble;
    const inputAxis = inputState?.axis || { x: 0, y: 0 };
    const jumpPressed = !!inputState?.jumpPressed;

    // ─── Tunnel mode: bypass all normal physics ───
    if (marble.inTunnel) {
      window.MarbleLevels.advanceDynamicState(runtime, dt, null);
      updateTunnelPhysics(runtime, dt);
      runtime.timerMs += dt * 1000;
      const timeLimit = runtime.level.timeLimit ?? 60;
      if (runtime.timerMs >= timeLimit * 1000) return fail(runtime, 'timeout');
      updateCamera(runtime, dt);
      runtime.lastResult = null;
      return null;
    }

    // Sample previous support only to inform actor movement (e.g. riding a platform);
    // skip the extra sample when already airborne to avoid a redundant sampleSupportSurface call.
    const previousSupport = marble.grounded
      ? getGroundSupport(runtime, marble.x, marble.y, marble.supportRadius)
      : null;
    window.MarbleLevels.advanceDynamicState(runtime, dt, previousSupport);

    let groundSurface = marble.grounded
      ? (previousSupport ?? getGroundSupport(runtime, marble.x, marble.y, marble.supportRadius))
      : getGroundSupport(runtime, marble.x, marble.y, marble.supportRadius);
    const isSupportedNow = !!(marble.grounded && groundSurface);
    updateJumpTimers(marble, jumpPressed, isSupportedNow, dt);

    if (groundSurface) {
      rememberSafePosition(runtime, groundSurface);
    }

    if (groundSurface && marble.coyoteTime > 0 && marble.jumpBufferTime > 0 && marble.jumpCooldownTime <= 0) {
      performJump(marble, groundSurface);
      groundSurface = null;
    }

    if (marble.grounded && groundSurface) {
      applyGroundForces(runtime, inputAxis, dt, groundSurface);
      groundSurface = moveGrounded(runtime, dt);
      if (groundSurface && applyBounceSurface(runtime, groundSurface)) {
        groundSurface = null;
      }
    } else {
      marble.grounded = false;
      applyAirForces(runtime, inputAxis, dt);
      groundSurface = moveAirborne(runtime, dt);
      if (groundSurface && applyBounceSurface(runtime, groundSurface)) {
        groundSurface = null;
      }
    }

    runtime.timerMs += dt * 1000;
    const timeLimit = runtime.level.timeLimit ?? 60;
    if (runtime.timerMs >= timeLimit * 1000) return fail(runtime, 'timeout');
    updateCamera(runtime, dt);

    // Check tunnel entry before normal triggers
    if (checkTunnelEntry(runtime, groundSurface)) {
      runtime.lastResult = null;
      return null;
    }

    const triggerResult = evaluateTriggers(runtime, groundSurface);
    if (triggerResult) return triggerResult;
    if (shouldFailFromVoidFall(runtime)) return fail(runtime, 'fall');

    runtime.lastResult = null;
    return null;
  }

  window.MarblePhysics = {
    updatePhysics
  };
})();