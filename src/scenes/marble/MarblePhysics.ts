import type { InputSnapshot } from '../../core/input/InputService';
import type { MarbleRuntimeState } from './MarbleRuntime';

const ACCELERATION = 10;
const DRAG = 0.88;
const MAX_SPEED = 6;

export function updateMarblePhysics(runtime: MarbleRuntimeState, input: InputSnapshot, dt: number): void {
  if (runtime.status !== 'running') {
    return;
  }

  runtime.marble.vx += input.moveX * ACCELERATION * dt;
  runtime.marble.vy += input.moveY * ACCELERATION * dt;

  runtime.marble.vx *= Math.pow(DRAG, dt * 60);
  runtime.marble.vy *= Math.pow(DRAG, dt * 60);

  const speed = Math.hypot(runtime.marble.vx, runtime.marble.vy);
  if (speed > MAX_SPEED) {
    runtime.marble.vx = (runtime.marble.vx / speed) * MAX_SPEED;
    runtime.marble.vy = (runtime.marble.vy / speed) * MAX_SPEED;
  }

  runtime.marble.x += runtime.marble.vx * dt;
  runtime.marble.y += runtime.marble.vy * dt;
  runtime.timerMs += dt * 1000;

  clampToLevel(runtime);
  detectGoal(runtime);
}

function clampToLevel(runtime: MarbleRuntimeState): void {
  const minX = runtime.marble.radius;
  const minY = runtime.marble.radius;
  const maxX = runtime.level.width - runtime.marble.radius;
  const maxY = runtime.level.height - runtime.marble.radius;

  runtime.marble.x = clamp(runtime.marble.x, minX, maxX);
  runtime.marble.y = clamp(runtime.marble.y, minY, maxY);
}

function detectGoal(runtime: MarbleRuntimeState): void {
  const dx = runtime.level.goal.x - runtime.marble.x;
  const dy = runtime.level.goal.y - runtime.marble.y;
  if (Math.hypot(dx, dy) <= 0.55) {
    runtime.status = 'complete';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
