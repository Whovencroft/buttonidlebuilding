import { getMarbleLevelById, type MarbleLevel } from './MarbleLevels';

export interface MarbleRuntimeState {
  level: MarbleLevel;
  marble: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
  };
  status: 'running' | 'complete' | 'failed';
  timerMs: number;
}

export function createMarbleRuntime(levelId = 'training_run'): MarbleRuntimeState {
  const level = getMarbleLevelById(levelId);

  return {
    level,
    marble: {
      x: level.start.x,
      y: level.start.y,
      vx: 0,
      vy: 0,
      radius: 0.35
    },
    status: 'running',
    timerMs: 0
  };
}

export function restartMarbleRuntime(runtime: MarbleRuntimeState): void {
  const level = getMarbleLevelById(runtime.level.id);
  runtime.level = level;
  runtime.marble.x = level.start.x;
  runtime.marble.y = level.start.y;
  runtime.marble.vx = 0;
  runtime.marble.vy = 0;
  runtime.status = 'running';
  runtime.timerMs = 0;
}
