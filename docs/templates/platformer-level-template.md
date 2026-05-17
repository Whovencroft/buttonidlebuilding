# Platformer Level Template

## Purpose
Defines reusable level content for the `platformer` scene including collision tiles, hazards, checkpoints, and completion path.

## Template Definition
```js
{
  id: 'level_id',
  name: 'Level Name',
  width: 24,
  height: 14,
  spawn: { x: 2, y: 10 },
  platforms: ['0,13', '1,13'],
  hazards: [{ x: 7, y: 12 }],
  checkpoints: [{ id: 'cp_mid', x: 11, y: 8 }],
  goal: { x: 21, y: 7 },
  nextLevelId: 'next_level_id_or_null'
}
```

## Field Reference
- `id` (string, required): unique level id.
- `name` (string, required): player-facing stage name.
- `width`, `height` (number, required): tile-grid dimensions.
- `spawn` (object, required): default player spawn tile.
- `platforms` (array<string>, required): solid collision tiles in `"x,y"` format.
- `hazards` (array<object>, optional): hazard tiles that cause death/respawn.
- `checkpoints` (array<object>, optional): persistent respawn markers.
- `goal` (object, required): completion trigger tile.
- `nextLevelId` (string|null, required): next stage id or `null`.

## Usage Instructions
1. Add level objects to `public/data/platformer-levels.json.levels`.
2. Keep all ids unique.
3. Ensure `startLevelId` points to a defined level id.
4. Keep all tile coordinates inside level bounds.
5. Set `nextLevelId` to a valid id or `null`.
6. Update runtime/doc templates together when schema changes.

## Extension Rules
- Do not remove required fields.
- Keep level ids stable after release for save compatibility.
- Add new gameplay fields only with matching runtime support.

## Example Instance
```js
{
  id: 'training_platforms',
  name: 'Training Platforms',
  width: 24,
  height: 14,
  spawn: { x: 2, y: 10 },
  platforms: ['0,13', '1,13', '2,13', '3,13'],
  hazards: [{ x: 7, y: 12 }],
  checkpoints: [{ id: 'cp_mid', x: 11, y: 8 }],
  goal: { x: 21, y: 7 },
  nextLevelId: 'spike_corridor'
}
```
