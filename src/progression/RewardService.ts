import type { AppState } from '../core/state/AppState';
import type { ProgressionSceneId } from './ChapterGraph';

export interface RewardPayload {
  presses?: number;
  unlockScenes?: ProgressionSceneId[];
  markMarbleUnlocked?: boolean;
  bestTimeMs?: number;
  clearedLevelId?: string;
  notes?: string[];
}

export interface RewardApplicationResult {
  changed: boolean;
  notes: string[];
  unlockedScenes: ProgressionSceneId[];
}

/**
 * Reward application is intentionally conservative in this scaffold.
 * It only mutates fields that already exist in the current AppState.
 * Future scene slices can extend this service without rewriting the host.
 */
export class RewardService {
  public apply(state: AppState, reward: RewardPayload | null | undefined): RewardApplicationResult {
    if (!reward) {
      return {
        changed: false,
        notes: [],
        unlockedScenes: []
      };
    }

    let changed = false
    const notes = [...(reward.notes ?? [])];
    const unlockedScenes: ProgressionSceneId[] = [];

    if (typeof reward.presses === 'number' && Number.isFinite(reward.presses) && reward.presses !== 0) {
      state.scenes.button_idle.totalPresses += reward.presses;
      changed = true;
      notes.push(`Applied ${reward.presses} shared presses to button_idle.totalPresses.`);
    }

    const unlockRequests = new Set<ProgressionSceneId>(reward.unlockScenes ?? []);
    if (reward.markMarbleUnlocked) {
      unlockRequests.add('marble');
    }

    for (const sceneId of unlockRequests) {
      if (sceneId === 'marble' && !state.scenes.marble.unlocked) {
        state.scenes.marble.unlocked = true;
        changed = true;
        unlockedScenes.push(sceneId);
        notes.push('Unlocked marble scene.');
      }
    }

    if (
      typeof reward.bestTimeMs === 'number' &&
      Number.isFinite(reward.bestTimeMs) &&
      reward.clearedLevelId
    ) {
      const currentBest = state.scenes.marble.bestTimes[reward.clearedLevelId];
      if (currentBest === undefined || reward.bestTimeMs < currentBest) {
        state.scenes.marble.bestTimes[reward.clearedLevelId] = reward.bestTimeMs;
        changed = true;
        notes.push(`Updated best time for marble level "${reward.clearedLevelId}".`);
      }

      if (!state.scenes.marble.clearedLevels.includes(reward.clearedLevelId)) {
        state.scenes.marble.clearedLevels.push(reward.clearedLevelId);
        changed = true;
        notes.push(`Marked marble level "${reward.clearedLevelId}" as cleared.`);
      }
    }

    return {
      changed,
      notes,
      unlockedScenes
    };
  }
}
