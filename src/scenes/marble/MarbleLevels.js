import { loadLegacyScriptOnce } from '../legacy_loader.js';

/**
 * Loads and returns the existing marble level module API.
 */
export async function getMarbleLevelsApi(assetService) {
  await loadLegacyScriptOnce('/js/scenes/marble/marble_levels.js');

  if (!window.MarbleLevels) {
    throw new Error('MarbleLevels API is unavailable after loading legacy script.');
  }

  // Purpose: consume external level progression data through AssetService so
  // host reward handoff can stay data-driven as milestones deepen scene logic.
  if (assetService) {
    try {
      const externalLevelData = await assetService.loadJson('/data/marble-levels.json');
      window.MarbleLevels.externalLevelData = externalLevelData;
      window.MarbleLevels.externalProgression = normalizeExternalProgression(externalLevelData);
    } catch (error) {
      console.warn(error);
    }
  }

  return window.MarbleLevels;
}

function normalizeExternalProgression(data) {
  if (!data || typeof data !== 'object') {
    return { levelOrder: [], rewards: {} };
  }

  return {
    levelOrder: Array.isArray(data.levelOrder) ? data.levelOrder.slice() : [],
    rewards: data.rewards && typeof data.rewards === 'object' ? data.rewards : {}
  };
}
