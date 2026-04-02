(() => {
  function circleIntersectsRect(circle, rect) {
    const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
    const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;
    return (dx * dx + dy * dy) < (circle.radius * circle.radius);
  }

  function circleIntersectsGoal(circle, goal) {
    const dx = circle.x - goal.x;
    const dy = circle.y - goal.y;
    const distance = Math.hypot(dx, dy);
    return distance <= circle.radius + goal.radius;
  }

  function resolveAxis(runtime, axis) {
    const marble = runtime.marble;
    const walls = runtime.level.walls;

    for (const wall of walls) {
      if (!circleIntersectsRect(marble, wall)) continue;

      if (axis === 'x') {
        if (marble.vx > 0) {
          marble.x = wall.x - marble.radius;
        } else if (marble.vx < 0) {
          marble.x = wall.x + wall.w + marble.radius;
        }
        marble.vx = 0;
      } else {
        if (marble.vy > 0) {
          marble.y = wall.y - marble.radius;
        } else if (marble.vy < 0) {
          marble.y = wall.y + wall.h + marble.radius;
        }
        marble.vy = 0;
      }
    }
  }

  function updatePhysics(runtime, inputAxis, dt) {
    if (runtime.status !== 'running') {
      return runtime.lastResult;
    }

    const marble = runtime.marble;

    const acceleration = 920;
    const maxSpeed = 450;
    const drag = Math.pow(0.885, dt * 60);

    marble.vx += inputAxis.x * acceleration * dt;
    marble.vy += inputAxis.y * acceleration * dt;

    marble.vx *= drag;
    marble.vy *= drag;

    const speed = Math.hypot(marble.vx, marble.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      marble.vx *= scale;
      marble.vy *= scale;
    }

    marble.x += marble.vx * dt;
    resolveAxis(runtime, 'x');

    marble.y += marble.vy * dt;
    resolveAxis(runtime, 'y');

    runtime.timerMs += dt * 1000;

    for (const failZone of runtime.level.failZones) {
      if (circleIntersectsRect(marble, failZone)) {
        runtime.status = 'failed';
        runtime.lastResult = {
          type: 'failed',
          levelId: runtime.level.id
        };
        return runtime.lastResult;
      }
    }

    if (circleIntersectsGoal(marble, runtime.level.goal)) {
      runtime.status = 'completed';
      runtime.lastResult = {
        type: 'completed',
        levelId: runtime.level.id,
        bestTimeMs: Math.round(runtime.timerMs),
        reward: runtime.level.reward
      };
      return runtime.lastResult;
    }

    runtime.lastResult = null;
    return null;
  }

  window.MarblePhysics = {
    updatePhysics
  };
})();