# MUD Room Template

## Purpose
Defines one room entry for the MUD room-graph system used by traversal (`go`), room narration (`look`), item pickup (`take`), and flag updates.

## Template Definition
```js
{
  id: 'room_id',
  title: 'Room Title',
  description: 'Room description text.',
  exits: {
    north: 'another_room_id'
  },
  items: ['item_id'],
  onEnterFlag: 'visited_room_id'
}
```

## Field Reference
- `id` (string, required): unique room identifier.
- `title` (string, required): room name displayed in MUD UI/log.
- `description` (string, required): narrative text shown on look/enter.
- `exits` (object<string,string>, required): maps direction commands (`north`, `south`, `east`, `west`, etc.) to target room ids.
- `items` (string[], required): item ids that can be collected in this room.
- `onEnterFlag` (string, optional but recommended): flag key set in scene state when entering this room.

## Usage Instructions
1. Copy the template into `public/data/mud-rooms.json` under `rooms`.
2. Set each required field to concrete values.
3. Validate that every `exits` target id exists.
4. Keep ids stable after release to preserve save compatibility.
5. Update `startRoomId` if this room should be initial spawn.

## Extension Rules
- Do not remove required fields.
- Keep `id` and exit keys deterministic.
- Add new optional fields only if scene parser/renderer also supports them.
- Update this doc and runtime template together for any structure change.

## Example Instance
```js
{
  id: 'atrium',
  title: 'Atrium of Lost Buttons',
  description: 'A tiled room hums with old switchboard ghosts. A brass door stands north.',
  exits: {
    north: 'archive'
  },
  items: ['rusted_key'],
  onEnterFlag: 'visited_atrium'
}
```
