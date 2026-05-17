/**
 * Pokémon-like content template.
 * Purpose: defines repeatable creature roster and overworld encounter maps.
 */
export const POKEMON_LIKE_CONTENT_TEMPLATE = {
  // Initial map id loaded when scene starts.
  startMapId: 'map_id',
  // Starting player tile position in map grid space.
  startPlayer: {
    // Player x tile coordinate.
    x: 3,
    // Player y tile coordinate.
    y: 3
  },
  // Creature ids used to form initial party roster.
  starterParty: ['creature_id'],
  // Creature catalog used for encounters and capture recruitment.
  creatures: [
    {
      // Unique creature id referenced by encounter pools.
      id: 'creature_id',
      // Player-facing creature name.
      name: 'Creature Name',
      // Maximum hit points used in battle flow.
      maxHp: 18,
      // Attack rating used for simple damage rolls.
      attack: 5
    }
  ],
  // Overworld maps with collision and encounter zones.
  maps: [
    {
      // Unique map id referenced by startMapId and saves.
      id: 'map_id',
      // Player-facing map name for HUD/debug output.
      name: 'Map Name',
      // Grid width in tiles.
      width: 20,
      // Grid height in tiles.
      height: 14,
      // Collision tiles in "x,y" coordinate format.
      walls: ['0,0', '1,0'],
      // Encounter-zone tiles in "x,y" coordinate format.
      grass: ['4,4', '5,4'],
      // Encounter probability per movement check in grass tiles.
      encounterChance: 0.22,
      // Creature ids eligible to appear in this map.
      encounterPool: ['creature_id']
    }
  ]
};

export const POKEMON_LIKE_CONTENT_USAGE = [
  '1) Copy POKEMON_LIKE_CONTENT_TEMPLATE into public/data/pokemon-like-content.json.',
  '2) Define creature entries and ensure encounterPool ids reference creatures[].id.',
  '3) Keep startMapId and map ids aligned with maps[].id values.',
  '4) Keep wall/grass coordinates within map width/height bounds.',
  '5) If schema changes, update docs/templates/pokemon-like-content-template.md in the same pass.'
];

export const POKEMON_LIKE_CONTENT_EXAMPLE = {
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
};
