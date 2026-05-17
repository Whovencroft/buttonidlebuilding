# Retro RPG Map Template

## Purpose
Defines reusable map content for the `retro_rpg` scene, including collision tiles, NPC dialogue, and event triggers.

## Template Definition
```js
{
  id: 'map_id',
  name: 'Map Name',
  width: 16,
  height: 12,
  spawn: { x: 2, y: 2 },
  blocked: ['0,0', '1,0'],
  npcs: [
    {
      id: 'npc_id',
      x: 4,
      y: 3,
      lines: ['Line one.', 'Line two.'],
      setFlag: 'optional_flag_id'
    }
  ],
  triggers: [
    {
      id: 'trigger_id',
      type: 'flag',
      x: 10,
      y: 6,
      requiresFlag: 'optional_required_flag',
      setFlag: 'optional_set_flag',
      targetMapId: 'other_map_id',
      targetPlayer: { x: 2, y: 2 },
      message: 'Event message text.'
    }
  ]
}
```

## Field Reference
- `id` (string, required): unique map id.
- `name` (string, required): map name shown in HUD.
- `width`, `height` (number, required): positive tile-grid dimensions.
- `spawn` (object, optional): fallback player spawn coordinates.
- `blocked` (array<string>, required): collision coordinates in `"x,y"` format.
- `npcs` (array<object>, optional): dialogue actors.
- `npcs[].lines` (array<string>, required for talk flow): dialogue sequence.
- `npcs[].setFlag` (string, optional): flag assigned on interaction.
- `triggers` (array<object>, optional): map events.
- `triggers[].type` (string, required): `flag` | `warp` | `complete`.
- `triggers[].requiresFlag` (string, optional): activation gate.
- `triggers[].setFlag` (string, optional): assigned by `flag` type.
- `triggers[].targetMapId` (string, optional): required for `warp` type.
- `triggers[].targetPlayer` (object, optional): warp destination player tile.

## Usage Instructions
1. Add map entries in `public/data/retro-rpg-maps.json.maps`.
2. Keep every map id unique.
3. Ensure each `targetMapId` references an existing map.
4. Keep blocked coordinates inside map bounds.
5. Use only runtime-supported trigger types.
6. Update runtime and docs templates together when schema changes.

## Extension Rules
- Do not remove required fields from map objects.
- Keep map ids stable for save compatibility.
- Add new trigger fields only after runtime support lands.

## Example Instance
```js
{
  id: 'town_square',
  name: 'Town Square',
  width: 16,
  height: 12,
  spawn: { x: 2, y: 2 },
  blocked: ['0,0', '1,0', '2,0'],
  npcs: [
    {
      id: 'village_elder',
      x: 4,
      y: 3,
      lines: ['Elder: Pull the lever by the east gate.'],
      setFlag: 'met_elder'
    }
  ],
  triggers: [
    {
      id: 'lever_event',
      type: 'flag',
      x: 12,
      y: 8,
      requiresFlag: 'met_elder',
      setFlag: 'east_gate_open',
      message: 'The east gate unlocks.'
    }
  ]
}
```
