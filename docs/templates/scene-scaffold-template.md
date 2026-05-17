# Scene Scaffold Template

## Purpose
Use this template to add new scene scaffold entries consistently across host content, save placeholders, and registry wiring.

## Template Definition
```js
{
  id: 'example_scene_id',
  kind: 'dom',
  title: 'Example Scene Title',
  chapterId: 'chapter_example',
  rootId: 'exampleSceneRoot',
  hostMode: 'shell',
  unlockedByDefault: false,
  description: 'Short deterministic summary of scene purpose.'
}
```

## Field Reference
- `id` (string, required): unique scene id used by registry/progression/save slices.
- `kind` (string, required): one of `dom`, `canvas`, `phaser`; controls scaffold renderer path.
- `title` (string, required): player-facing scene label.
- `chapterId` (string, required): chapter graph mapping id for this scene.
- `rootId` (string, required): host scene root id mounted under `#sceneHost`.
- `hostMode` (string, required): `shell` or `fullscreen`; controls host shell presentation.
- `unlockedByDefault` (boolean, required): initial lock state before unlock rules run.
- `description` (string, required): deterministic summary for docs/debug UIs.

## Usage Instructions
1. Copy the template into `src/content/scenes.json`.
2. Fill every required field with concrete values (no placeholders).
3. Add matching entries in:
   - `src/content/chapters.json`
   - `src/content/endings.json`
   - `src/content/unlocks.json`
4. Add matching save slice placeholders in:
   - `src/core/state/AppState.js`
   - `src/core/state/SaveSchema.js`
5. Add and register a corresponding scene scaffold factory in:
   - `src/scenes/<scene_id>/...`
   - `src/app/registry.js`

## Extension Rules
- Do not remove required fields.
- Keep `id` stable once published.
- Keep `kind` aligned with architecture rendering rules.
- If template structure changes, update both runtime template and this doc in the same pass.

## Example Instance
```js
{
  id: 'mud',
  kind: 'dom',
  title: 'MUD',
  chapterId: 'chapter_2',
  rootId: 'mudSceneRoot',
  hostMode: 'shell',
  unlockedByDefault: false,
  description: 'Text-command scene scaffold for future MUD systems.'
}
```
