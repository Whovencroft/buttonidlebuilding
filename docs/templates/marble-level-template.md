# Marble Level Template

## Purpose
Defines reusable isometric marble level content for the `marble` scene including terrain height, slopes, walls, hazards, goal placement, and reward metadata.

## Template Definition
```js
{
  id: 'level_id',
  name: 'Level Name',
  width: 18,
  height: 18,
  killZ: -4,
  voidFloor: -2,
  start: { x: 2.5, y: 2.5 },
  goal: { x: 15.5, y: 15.5, radius: 0.42 },
  reward: {
    presses: 5000,
    unlocks: ['marble_level_complete'],
    claimKey: 'level_id'
  },
  cells: [
    [
      { kind: 'void', h: 0, slope: null },
      { kind: 'track', h: 4, slope: null }
    ]
  ]
}

Field Reference
id (string, required): unique level id.
name (string, required): player-facing level name.
width, height (number, required): whole-number grid dimensions.
killZ (number, required): fail threshold for falling off the course.
voidFloor (number, required): visual/render fallback floor height below valid terrain.
start (object, required): marble spawn position in tile/world coordinates.
goal (object, required): goal trigger center and radius.
reward (object, required): completion payout and unlock metadata.
cells (array<array<object>>, required): full grid of cell definitions, indexed as cells[y][x].
cells[*][*].kind (string, required): one of void, track, hazard, goal, or wall.
cells[*][*].h (number, required): base tile or wall height.
cells[*][*].slope (string|null, optional): one of N, S, E, W, or null.
Usage Instructions
Add level objects to the marble level source used by the scene runtime.
Keep all ids unique.
Keep start and goal coordinates inside level bounds.
Ensure cells.length === height and every row length equals width.
Use wall cells for solid raised blockers and track cells for playable terrain.
Use slopes only on terrain meant to be traversed.
Update runtime/doc templates together when schema changes.
Extension Rules
Do not remove required fields.
Keep released level ids stable for save/progression compatibility.
Add new gameplay fields only with matching runtime support.
Keep cell kinds and slope codes consistent with the marble runtime.
Example Instance

{
  id: 'training_ramp',
  name: 'Training Ramp',
  width: 6,
  height: 6,
  killZ: -4,
  voidFloor: -2,
  start: { x: 1.5, y: 1.5 },
  goal: { x: 4.5, y: 4.5, radius: 0.42 },
  reward: {
    presses: 5000,
    unlocks: ['marble_training_complete'],
    claimKey: 'training_ramp'
  },
  cells: [
    [
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null }
    ],
    [
      { kind: 'void', h: 0, slope: null },
      { kind: 'track', h: 4, slope: null },
      { kind: 'track', h: 4, slope: 'E' },
      { kind: 'track', h: 3, slope: null },
      { kind: 'wall', h: 5, slope: null },
      { kind: 'void', h: 0, slope: null }
    ],
    [
      { kind: 'void', h: 0, slope: null },
      { kind: 'track', h: 4, slope: null },
      { kind: 'track', h: 3, slope: null },
      { kind: 'hazard', h: 3, slope: null },
      { kind: 'track', h: 3, slope: null },
      { kind: 'void', h: 0, slope: null }
    ],
    [
      { kind: 'void', h: 0, slope: null },
      { kind: 'track', h: 3, slope: null },
      { kind: 'track', h: 3, slope: 'S' },
      { kind: 'track', h: 2, slope: null },
      { kind: 'track', h: 2, slope: null },
      { kind: 'void', h: 0, slope: null }
    ],
    [
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'track', h: 2, slope: null },
      { kind: 'track', h: 2, slope: null },
      { kind: 'goal', h: 2, slope: null },
      { kind: 'void', h: 0, slope: null }
    ],
    [
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null },
      { kind: 'void', h: 0, slope: null }
    ]
  ]
}