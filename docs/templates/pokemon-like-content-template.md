# Pokémon-like Content Template

## Purpose
Defines reusable creature and overworld encounter data for the `pokemon_like` scene.

## Template Definition
```js
{
  startMapId: 'map_id',
  startPlayer: { x: 3, y: 3 },
  starterParty: ['creature_id'],
  creatures: [
    { id: 'creature_id', name: 'Creature Name', maxHp: 18, attack: 5 }
  ],
  maps: [
    {
      id: 'map_id',
      name: 'Map Name',
      width: 20,
      height: 14,
      walls: ['0,0', '1,0'],
      grass: ['4,4', '5,4'],
      encounterChance: 0.22,
      encounterPool: ['creature_id']
    }
  ]
}
```

## Field Reference
- `startMapId` (string, required): initial map id.
- `startPlayer` (object, required): initial player tile coordinates.
- `starterParty` (array<string>, required): initial party creature ids.
- `creatures` (array<object>, required): capture/encounter catalog.
- `creatures[].id` (string, required): unique creature id.
- `creatures[].maxHp` (number, required): battle HP ceiling.
- `creatures[].attack` (number, required): simple attack stat.
- `maps` (array<object>, required): overworld map definitions.
- `maps[].walls` (array<string>, required): collision coordinates.
- `maps[].grass` (array<string>, required): encounter-zone coordinates.
- `maps[].encounterChance` (number, required): chance per movement check in grass.
- `maps[].encounterPool` (array<string>, required): valid creature ids for encounters.

## Usage Instructions
1. Copy template into `public/data/pokemon-like-content.json`.
2. Keep creature ids unique.
3. Ensure each map encounterPool id exists in `creatures`.
4. Ensure `startMapId` references an existing map id.
5. Keep wall/grass coordinates within map bounds.
6. Update runtime and docs templates together when schema changes.

## Extension Rules
- Do not remove required fields.
- Keep ids stable after release for save compatibility.
- Add new battle/map fields only after runtime support is implemented.

## Example Instance
```js
{
  startMapId: 'starter_route',
  startPlayer: { x: 3, y: 3 },
  starterParty: ['sproutlet'],
  creatures: [
    { id: 'sproutlet', name: 'Sproutlet', maxHp: 18, attack: 5 },
    { id: 'embercub', name: 'Embercub', maxHp: 20, attack: 6 }
  ],
  maps: [
    {
      id: 'starter_route',
      name: 'Starter Route',
      width: 20,
      height: 14,
      walls: ['0,0', '1,0'],
      grass: ['4,4', '5,4', '6,4'],
      encounterChance: 0.22,
      encounterPool: ['embercub']
    }
  ]
}
```
