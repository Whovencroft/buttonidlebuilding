export type SceneId = 'button_idle' | 'marble';

export interface AppMetaState {
  saveVersion: number;
  createdAt: number;
  lastPlayedAt: number;
}

export interface AppRuntimeState {
  activeScene: SceneId;
}

export interface ButtonIdleSceneSave {
  unlocked: true;
  complete: boolean;
  totalPresses: number;
  totalManualPresses: number;
}

export interface MarbleSceneSave {
  unlocked: boolean;
  currentLevelId: string;
  bestTimes: Record<string, number>;
  clearedLevels: string[];
}

export interface AppState {
  meta: AppMetaState;
  app: AppRuntimeState;
  scenes: {
    button_idle: ButtonIdleSceneSave;
    marble: MarbleSceneSave;
  };
}

export const APP_SAVE_VERSION = 1;

export function createDefaultAppState(): AppState {
  const now = Date.now();

  return {
    meta: {
      saveVersion: APP_SAVE_VERSION,
      createdAt: now,
      lastPlayedAt: now
    },
    app: {
      activeScene: 'button_idle'
    },
    scenes: {
      button_idle: {
        unlocked: true,
        complete: false,
        totalPresses: 0,
        totalManualPresses: 0
      },
      marble: {
        unlocked: false,
        currentLevelId: 'training_run',
        bestTimes: {},
        clearedLevels: []
      }
    }
  };
}

export function cloneAppState(state: AppState): AppState {
  return structuredClone(state);
}
