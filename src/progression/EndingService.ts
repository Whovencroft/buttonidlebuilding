import type { AppState } from '../core/state/AppState';
import { ChapterGraph, type EndingId, type ProgressionSceneId } from './ChapterGraph';
import { RewardService, type RewardPayload } from './RewardService';
import { UnlockService } from './UnlockService';

export interface SceneCompletionPayload {
  sceneId: ProgressionSceneId;
  endingId?: EndingId | null;
  reward?: RewardPayload | null;
  completed?: boolean;
  failed?: boolean;
}

export interface SceneCompletionResult {
  nextSceneId: ProgressionSceneId | null;
  unlockedScenes: ProgressionSceneId[];
  rewardNotes: string[];
}

/**
 * EndingService is the boundary between scene results and app progression.
 * Scenes should report structured outcomes. The host should call this service.
 */
export class EndingService {
  public constructor(
    private readonly chapterGraph: ChapterGraph = new ChapterGraph(),
    private readonly rewardService: RewardService = new RewardService(),
    private readonly unlockService: UnlockService = new UnlockService()
  ) {}

  public handleSceneCompletion(state: AppState, payload: SceneCompletionPayload): SceneCompletionResult {
    const unlocksFromGraph = this.chapterGraph.getUnlocksForScene(payload.sceneId);
    const unlockedScenes: ProgressionSceneId[] = [];

    for (const sceneId of unlocksFromGraph) {
      const result = this.unlockService.unlock(state, sceneId, 'chapter_graph');
      if (result.unlocked) {
        unlockedScenes.push(result.sceneId);
      }
    }

    const rewardResult = this.rewardService.apply(state, payload.reward ?? null);
    for (const sceneId of rewardResult.unlockedScenes) {
      if (!unlockedScenes.includes(sceneId)) {
        unlockedScenes.push(sceneId);
      }
    }

    const nextSceneId = this.chapterGraph.getNextSceneId(payload.sceneId, payload.endingId ?? null);
    if (nextSceneId) {
      state.app.activeScene = nextSceneId === 'marble' ? 'marble' : state.app.activeScene;
    }

    state.meta.lastPlayedAt = Date.now();

    return {
      nextSceneId,
      unlockedScenes,
      rewardNotes: rewardResult.notes
    };
  }

  public getChapterGraph(): ChapterGraph {
    return this.chapterGraph;
  }

  public getUnlockService(): UnlockService {
    return this.unlockService;
  }

  public getRewardService(): RewardService {
    return this.rewardService;
  }
}
