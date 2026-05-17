/**
 * Loads optional button-idle data payloads used by the scene wrapper.
 * Purpose: keep external content loading separate from scene lifecycle wiring.
 */
export async function loadButtonIdleData(assetService) {
  if (!assetService) {
    return null;
  }

  try {
    return await assetService.loadJson('/data/button-idle-text.json');
  } catch (error) {
    console.warn(error);
    return null;
  }
}
