# Racing Track Template

## Purpose
Defines reusable top-down racing track content for the `racing` scene including collision walls, checkpoint order, laps, and track chaining.

## Template Definition
```js
{
  id: 'track_id',
  name: 'Track Name',
  width: 1600,
  height: 1000,
  spawn: { x: 320, y: 500, angle: 0 },
  road: [{ x: 800, y: 500, w: 1160, h: 520 }],
  walls: [{ x: 800, y: 200, w: 1180, h: 20 }],
  checkpoints: [{ id: 'cp_start', x: 320, y: 500, radius: 48 }],
  totalLaps: 3,
  nextTrackId: 'next_track_id_or_null'
}
```

## Field Reference
- `id` (string, required): unique track id.
- `name` (string, required): track label shown in HUD.
- `width`, `height` (number, required): world bounds in pixels.
- `spawn` (object, required): race start position + heading.
- `road` (array<object>, required): visual drivable-track segments.
- `walls` (array<object>, required): collision boundaries.
- `checkpoints` (array<object>, required): ordered checkpoint sequence for lap counting.
- `totalLaps` (number, required): laps required for completion.
- `nextTrackId` (string|null, required): optional automatic next-track id.

## Usage Instructions
1. Add track objects into `public/data/racing-tracks.json.tracks`.
2. Keep all ids unique.
3. Ensure `startTrackId` and each `nextTrackId` reference valid track ids.
4. Keep checkpoint order aligned with desired race flow.
5. Keep dimensions/coordinates consistent inside world bounds.
6. Update runtime template and docs template together when schema changes.

## Extension Rules
- Do not remove required fields.
- Keep released track ids stable for save compatibility.
- Add new gameplay fields only after runtime support exists.

## Example Instance
```js
{
  id: 'oval_test',
  name: 'Oval Test',
  width: 1600,
  height: 1000,
  spawn: { x: 320, y: 500, angle: 0 },
  road: [{ x: 800, y: 500, w: 1160, h: 520 }],
  walls: [{ x: 800, y: 200, w: 1180, h: 20 }],
  checkpoints: [
    { id: 'cp_start', x: 320, y: 500, radius: 48 },
    { id: 'cp_north', x: 800, y: 300, radius: 48 }
  ],
  totalLaps: 3,
  nextTrackId: 'chicane_run'
}
```
