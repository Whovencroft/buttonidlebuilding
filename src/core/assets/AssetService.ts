import {
  DEFAULT_ASSET_MANIFEST,
  type AssetDefinition,
  type AssetManifest
} from './AssetManifest';

export type LoadedAsset = string | Record<string, unknown> | HTMLImageElement | ArrayBuffer;

export class AssetService {
  private readonly manifest: AssetManifest;
  private readonly cache = new Map<string, LoadedAsset>();

  public constructor(manifest: AssetManifest = DEFAULT_ASSET_MANIFEST) {
    this.manifest = manifest;
  }

  public listAssets(): AssetDefinition[] {
    return [...this.manifest.assets];
  }

  public getDefinition(assetId: string): AssetDefinition | null {
    return this.manifest.assets.find((asset) => asset.id === assetId) ?? null;
  }

  public async preloadMarkedAssets(): Promise<void> {
    const preloadAssets = this.manifest.assets.filter((asset) => asset.preload);
    await Promise.all(preloadAssets.map((asset) => this.load(asset.id)));
  }

  public async load(assetId: string): Promise<LoadedAsset> {
    const cached = this.cache.get(assetId);
    if (cached !== undefined) {
      return cached;
    }

    const definition = this.getDefinition(assetId);
    if (!definition) {
      throw new Error(`Unknown asset "${assetId}".`);
    }

    const loaded = await this.fetchAsset(definition);
    this.cache.set(assetId, loaded);
    return loaded;
  }

  public clear(assetId?: string): void {
    if (assetId) {
      this.cache.delete(assetId);
      return;
    }

    this.cache.clear();
  }

  private async fetchAsset(definition: AssetDefinition): Promise<LoadedAsset> {
    switch (definition.kind) {
      case 'image':
        return await loadImage(definition.url);
      case 'json':
        return await fetch(definition.url).then((response) => response.json() as Promise<Record<string, unknown>>);
      case 'text':
        return await fetch(definition.url).then((response) => response.text());
      case 'audio':
        return await fetch(definition.url).then((response) => response.arrayBuffer());
      default:
        throw new Error(`Unsupported asset kind "${(definition as AssetDefinition).kind}".`);
    }
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image "${url}".`));
    image.src = url;
  });
}
