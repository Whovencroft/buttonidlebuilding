/**
 * Scene scaffold template used for repeatable future-scene content definitions.
 * Purpose: provide a stable structure for adding new scene entries consistently.
 */
export const SCENE_SCAFFOLD_TEMPLATE = {
  // Unique scene id used by registry, save slices, and progression content.
  id: 'example_scene_id',
  // Scene render kind. Valid values: 'dom' | 'canvas' | 'phaser'.
  kind: 'dom',
  // Player-facing scene title shown in shell/debug context.
  title: 'Example Scene Title',
  // Chapter id that routes this scene inside chapter graph content.
  chapterId: 'chapter_example',
  // Root element id used by scene host mount lifecycle.
  rootId: 'exampleSceneRoot',
  // Host presentation mode. Valid values: 'shell' | 'fullscreen'.
  hostMode: 'shell',
  // Whether scene is available before unlock rules apply.
  unlockedByDefault: false,
  // Human-readable description for docs/debug tooling.
  description: 'Short deterministic summary of scene purpose.'
};

/**
 * Step-by-step usage instructions for adding a new scaffold instance.
 */
export const SCENE_SCAFFOLD_USAGE = [
  '1) Copy SCENE_SCAFFOLD_TEMPLATE into src/content/scenes.json as a new entry.',
  '2) Set id/kind/title/chapterId/rootId/hostMode/unlockedByDefault/description.',
  '3) Add matching chapter, ending, and unlock entries in content JSON files.',
  '4) Add a matching save slice placeholder in AppState + SaveSchema normalization.',
  '5) Add a matching scene factory file and register it in src/app/registry.js.'
];

/**
 * Complete deterministic example instance.
 */
export const SCENE_SCAFFOLD_EXAMPLE = {
  id: 'mud',
  kind: 'dom',
  title: 'MUD',
  chapterId: 'chapter_2',
  rootId: 'mudSceneRoot',
  hostMode: 'shell',
  unlockedByDefault: false,
  description: 'Text-command scene scaffold for future MUD systems.'
};
