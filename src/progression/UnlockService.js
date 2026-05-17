import unlocksContent from '../content/unlocks.json';

/**
 * UnlockService applies unlock rules from progression content data.
 */
export class UnlockService {
  #rules;

  constructor(content = unlocksContent) {
    this.#rules = Array.isArray(content?.rules) ? content.rules : [];
  }

  applyUnlocksForEnding(state, sceneId, endingId) {
    const unlocked = [];

    for (const rule of this.#rules) {
      if (rule.type !== 'ending') continue;
      if (rule.sourceSceneId !== sceneId) continue;
      if (rule.endingId !== endingId) continue;

      for (const unlockSceneId of rule.unlockScenes || []) {
        if (unlockSceneId === 'marble' && !state.scenes.marble.unlocked) {
          state.scenes.marble.unlocked = true;
          unlocked.push(unlockSceneId);
        }
      }
    }

    return unlocked;
  }
}
