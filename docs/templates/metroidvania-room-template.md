# Metroidvania Room Template

## Purpose
Defines reusable room-map content for the `metroidvania` scene, including collision layout, doors, ability gates, checkpoints, and completion goals.

## Template Definition
```js
{
  id: 'room_id',
  name: 'Room Name',
  width: 20,
  height: 12,
  solids: ['0,11', '1,11'],
  hazards: ['8,11'],
  checkpoints: [{ id: 'cp_room', x: 2, y: 10 }],
  abilities: [{ id: 'ability_double_jump', type: 'doubleJump', x: 12, y: 5 }],
  flags: [{ id: 'entered_upper_passage', x: 15, y: 10 }],
  doors: [{
    id: 'door_to_other_room',
    x: 19,
    y: 10,
    width: 1,
    height: 1,
    targetRoomId: 'other_room_id',
    targetSpawn: { x: 1, y: 10 },
    requiresAbility: 'doubleJump',
    requiresFlag: 'entered_upper_passage',
    setFlagOnEnter: 'entered_upper_passage'
  }],
  goal: { x: 13, y: 10, endingId: 'metroidvania_complete' }
}
```

## Field Reference
- `id` (string, required): unique room identifier.
- `name` (string, required): HUD/display room name.
- `width`, `height` (number, required): tile-grid bounds.
- `solids` (array<string>, required): collision tiles in `"x,y"` format.
- `hazards` (array<string>, optional): respawn-triggering tiles.
- `checkpoints` (array<object>, optional): save checkpoints that update `checkpoint` and `spawn`.
- `abilities` (array<object>, optional): traversal unlock pickups (`doubleJump`, `dash`).
- `flags` (array<object>, optional): room markers that set `regionFlags` keys.
- `doors` (array<object>, optional): room transitions, optionally gated by `requiresAbility` and/or `requiresFlag`.
- `goal` (object|null, optional): completion marker in this room.

## Usage Instructions
1. Add room entries into `public/data/metroidvania-rooms.json.rooms`.
2. Keep all room ids unique.
3. Keep top-level `startRoomId` and `startSpawn` aligned to an existing room.
4. Keep coordinates inside `width` / `height` bounds.
5. Set each door `targetRoomId` to an existing room and provide `targetSpawn`.
6. Only use ability keys currently supported by runtime (`doubleJump`, `dash`).
7. Update this doc and runtime template together whenever schema fields change.

## Extension Rules
- Do not remove required fields.
- Keep ids stable once released to avoid save breakage.
- Add new gate types only with matching runtime implementation.
- If save slice shape changes, add a migration in `src/core/state/migration`.

## Example Instance
```js
{
  id: 'upper_passage',
  name: 'Upper Passage',
  width: 18,
  height: 12,
  solids: ['0,11', '1,11', '2,11', '5,8', '6,8'],
  hazards: ['8,11', '9,11'],
  checkpoints: [{ id: 'cp_upper', x: 11, y: 5 }],
  abilities: [{ id: 'ability_double_jump', type: 'doubleJump', x: 12, y: 5 }],
  flags: [{ id: 'upper_beacon', x: 15, y: 10 }],
  doors: [{
    id: 'door_return',
    x: 0,
    y: 10,
    width: 1,
    height: 1,
    targetRoomId: 'atrium',
    targetSpawn: { x: 19, y: 10 },
    requiresAbility: null,
    requiresFlag: null,
    setFlagOnEnter: null
  }],
  goal: null
}
```
