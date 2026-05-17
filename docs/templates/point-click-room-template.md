# Point-and-Click Room Template

## Purpose
Defines reusable room graph and interactable content for the `point_click` scene.

## Template Definition
```js
{
  id: 'room_id',
  name: 'Room Name',
  description: 'Room description text.',
  exits: [
    {
      id: 'exit_id',
      label: 'Other Room',
      targetRoomId: 'other_room_id',
      requiresFlag: 'optional_flag_id'
    }
  ],
  interactables: [
    {
      id: 'interactable_id',
      type: 'inspect',
      label: 'Inspect object',
      message: 'Interaction result text.',
      itemId: 'optional_item_id',
      puzzleId: 'optional_puzzle_id',
      requiresItems: ['optional_item_id'],
      consumeItems: false,
      requiresFlag: 'optional_flag_id',
      setFlag: 'optional_flag_id',
      hideWhenSolved: false,
      repeatMessage: 'Optional repeated interaction text.',
      failMessage: 'Optional failure text.',
      successMessage: 'Optional success text.',
      lines: ['Dialogue line 1', 'Dialogue line 2'],
      completesScene: false
    }
  ]
}
```

## Field Reference
- `id` (string, required): unique room id.
- `name` (string, required): room title shown in UI.
- `description` (string, required): room text description.
- `exits` (array, required): transition definitions to other rooms.
- `exits[].targetRoomId` (string, required): must match an existing room id.
- `exits[].requiresFlag` (string, optional): visibility gate.
- `interactables` (array, required): clickable interactions.
- `interactables[].type` (string, required): `inspect` | `pickup` | `talk` | `puzzle`.
- `interactables[].itemId` (string, optional): pickup inventory item id.
- `interactables[].requiresItems` (array<string>, optional): puzzle inventory gates.
- `interactables[].requiresFlag` / `setFlag` (string, optional): state gating and progression.
- `interactables[].lines` (array<string>, optional): talk dialogue sequence.
- `interactables[].completesScene` (boolean, optional): marks final completion interaction.

## Usage Instructions
1. Copy the template object into `public/data/point-click-rooms.json.rooms`.
2. Keep all room ids unique.
3. Ensure each `targetRoomId` resolves to a room in the same file.
4. Use only runtime-supported interactable types.
5. Pair puzzle requirements (`requiresItems`, `requiresFlag`) with unlock effects (`setFlag`).
6. Update runtime and docs templates together when schema changes.

## Extension Rules
- Do not remove required room fields.
- Keep ids stable after release for save compatibility.
- Add new interactable fields only when runtime support is implemented.

## Example Instance
```js
{
  id: 'office',
  name: 'Office',
  description: 'A detective office with a locked drawer.',
  exits: [
    { id: 'to_hallway', label: 'Hallway', targetRoomId: 'hallway', requiresFlag: 'drawer_open' }
  ],
  interactables: [
    { id: 'desk_note', type: 'inspect', label: 'Read desk note', message: 'The note hints where the key is hidden.' },
    { id: 'lamp_key', type: 'pickup', label: 'Take brass key', itemId: 'brass_key', message: 'You found a brass key.' },
    {
      id: 'drawer_lock',
      type: 'puzzle',
      label: 'Unlock drawer',
      puzzleId: 'unlock_drawer',
      requiresItems: ['brass_key'],
      setFlag: 'drawer_open',
      successMessage: 'Drawer unlocked.',
      failMessage: 'The drawer is locked.'
    }
  ]
}
```
