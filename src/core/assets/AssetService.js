/**
 * AssetService loads and caches runtime assets used by the host/scenes.
 */
export class AssetService {
  #jsonCache = new Map();

  async loadJson(path) {
    if (this.#jsonCache.has(path)) {
      return this.#jsonCache.get(path);
    }

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load JSON asset: ${path}`);
    }

    const json = await response.json();
    this.#jsonCache.set(path, json);
    return json;
  }

  async preload(manifest) {
    const jsonPaths = manifest?.json || [];

    await Promise.all(
      jsonPaths.map(async (path) => {
        try {
          await this.loadJson(path);
        } catch (error) {
          console.warn(error);
        }
      })
    );
  }
}
