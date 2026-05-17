import endingsContent from '../content/endings.json';

/**
 * EndingService maps scene endings to next-scene routes and unlock/reward ops.
 */
export class EndingService {
  #chapterGraph;
  #unlockService;
  #rewardService;
  #endingsById = new Map();

  constructor({ chapterGraph, unlockService, rewardService }, content = endingsContent) {
    this.#chapterGraph = chapterGraph;
    this.#unlockService = unlockService;
    this.#rewardService = rewardService;

    for (const ending of content?.endings || []) {
      this.#endingsById.set(ending.id, ending);
    }
  }

  handleEnding(state, { sceneId, endingId, reward }) {
    const ending = this.#endingsById.get(endingId) || null;

    const unlockedFromEnding = this.#unlockService.applyUnlocksForEnding(state, sceneId, endingId);
    const rewardResult = this.#rewardService.apply(state, reward || ending?.reward || null);
    const nextSceneId = this.#chapterGraph.getNextSceneId(sceneId, endingId);

    return {
      nextSceneId,
      unlockedScenes: [...new Set([...unlockedFromEnding, ...rewardResult.unlockedScenes])]
    };
  }
}
