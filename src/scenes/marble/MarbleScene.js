import { loadLegacyScriptOnce } from '../legacy_loader.js';
import { createMarbleInputAdapter } from './MarbleInput.js';
import { getMarbleLevelsApi } from './MarbleLevels.js';
import { getMarblePhysicsApi } from './MarblePhysics.js';
import { getMarbleRendererApi } from './MarbleRenderer.js';
import { getMarbleRuntimeApi } from './MarbleRuntime.js';

/**
 * Loads and exposes the existing marble scene implementation with all of its
 * supporting modules in deterministic dependency order.
 */
export async function createMarbleScene(api) {
  const marbleLevels = await getMarbleLevelsApi(api.assetService);
  await getMarblePhysicsApi();
  await getMarbleRendererApi();
  await getMarbleRuntimeApi();

  // Purpose: route marble input through the shared InputService.
  window.MarbleInput = {
    createInput() {
      return createMarbleInputAdapter(api.inputService);
    }
  };

  await loadLegacyScriptOnce('/js/scenes/marble/marble_state.js');

  if (typeof window.MarbleScene?.create !== 'function') {
    throw new Error('MarbleScene.create is unavailable after loading legacy scripts.');
  }

  const wrappedApi = {
    ...api,
    // Purpose: keep reward handoff host-owned and data-driven using external level metadata.
    applyMarbleReward: (result) => {
      const progression = marbleLevels?.externalProgression;
      const rewardConfig = progression?.rewards?.[result?.levelId] || {};
      const baseReward = result?.reward || {};
      const bonusPresses = Number.isFinite(rewardConfig.bonusPresses) ? rewardConfig.bonusPresses : 0;

      const normalizedResult = {
        ...result,
        reward: {
          ...baseReward,
          presses: (baseReward.presses || 0) + bonusPresses,
          hostNote: rewardConfig.statusNote || null
        }
      };

      api.applyMarbleReward(normalizedResult);

      if (rewardConfig.statusNote && typeof api.setSaveStatus === 'function') {
        api.setSaveStatus(`Marble: ${rewardConfig.statusNote}`);
      }
    }
  };

  const legacyScene = window.MarbleScene.create(wrappedApi);

  return {
    ...legacyScene,
    enter(context) {
      // Purpose: improve scene usability by surfacing controls on scene entry.
      api.setSaveStatus?.('Marble controls: WASD/Arrows move, R restart, Esc return.');
      legacyScene.enter?.(context);
    },
    exit(context) {
      legacyScene.exit?.(context);
      api.setSaveStatus?.('Returned from marble scene.');
    }
  };
}
