import type { AppState, SceneId } from '../core/state/AppState';
import type { ProgressionSceneId } from './ChapterGraph';

export interface SceneUnlockRecord {
  sceneId: ProgressionSceneId;
  unlocked: boolean;
  reason: string;
}

/**
 * The current save schema only persists button_idle and marble.
 * This service exposes unlock checks in a way that can survive the
 * later schema expansion to all planned scenes.
 */
export class UnlockService {
  private readonly runtimeUnlocks = new Set<ProgressionSceneId>();

  public isUnlocked(state: AppState, sceneId: ProgressionSceneId): boolean {
    if (sceneId === 'button_idle') {
      return true;
    }

    if (sceneId === 'marble') {
      return state.scenes.marble.unlocked;
    }

    return this.runtimeUnlocks.has(sceneId);
  }

  public unlock(state: AppState, sceneId: ProgressionSceneId, reason = 'runtime_unlock'): SceneUnlockRecord {
    if (sceneId === 'marble') {
      state.scenes.marble.unlocked = true;
      return {
        sceneId,
        unlocked: true,
        reason
      };
    }

    if (sceneId !== 'button_idle') {
      this.runtimeUnlocks.add(sceneId);
    }

    return {
      sceneId,
      unlocked: true,
      reason
    };
  }

  public lockRuntimeScene(sceneId: Exclude<ProgressionSceneId, SceneId>): void {
    this.runtimeUnlocks.delete(sceneId);
  }

  public listKnownUnlocks(state: AppState): SceneUnlockRecord[] {
    const records: SceneUnlockRecord[] = [
      {
        sceneId: 'button_idle',
        unlocked: true,
        reason: 'default_start_scene'
      },
      {
        sceneId: 'marble',
        unlocked: state.scenes.marble.unlocked,
        reason: state.scenes.marble.unlocked ? 'save_state' : 'locked'
      }
    ];

    for (const sceneId of this.runtimeUnlocks) {
      records.push({
        sceneId,
        unlocked: true,
        reason: 'runtime_unlock'
      });
    }

    return records;
  }
}
