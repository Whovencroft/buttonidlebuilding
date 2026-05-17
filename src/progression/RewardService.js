/**
 * RewardService applies cross-scene rewards in one host-owned place.
 */
export class RewardService {
  apply(state, reward) {
    if (!reward || typeof reward !== 'object') {
      return { unlockedScenes: [] };
    }

    const unlockedScenes = [];

    if (typeof reward.presses === 'number' && reward.presses > 0) {
      state.presses += reward.presses;
      state.totalPressesEarned += reward.presses;
    }

    if (Array.isArray(reward.unlocks)) {
      for (const unlock of reward.unlocks) {
        if (unlock === 'marble' && !state.scenes.marble.unlocked) {
          state.scenes.marble.unlocked = true;
          unlockedScenes.push(unlock);
        }

        if (unlock && !state.scenes.marble.unlockedFlags.includes(unlock)) {
          state.scenes.marble.unlockedFlags.push(unlock);
        }
      }
    }

    if (reward.claimKey) {
      state.scenes.marble.rewardClaims[reward.claimKey] = true;
    }

    return { unlockedScenes };
  }
}
