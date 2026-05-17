export type AssetKind = 'image' | 'audio' | 'json' | 'text';

export interface AssetDefinition {
  id: string;
  kind: AssetKind;
  url: string;
  preload?: boolean;
  tags?: string[];
}

export interface AssetManifest {
  version: number;
  assets: AssetDefinition[];
}

export const DEFAULT_ASSET_MANIFEST: AssetManifest = {
  version: 1,
  assets: [
    {
      id: 'scene.button_idle.note',
      kind: 'text',
      url: '/data/button_idle_note.txt',
      preload: false,
      tags: ['button_idle']
    },
    {
      id: 'scene.marble.levels',
      kind: 'json',
      url: '/data/marble_levels.json',
      preload: false,
      tags: ['marble']
    },
    {
      id: 'audio.ui.click',
      kind: 'audio',
      url: '/audio/ui-click.ogg',
      preload: false,
      tags: ['ui']
    }
  ]
};
