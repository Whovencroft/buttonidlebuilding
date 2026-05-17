/**
 * Retro RPG map template.
 * Purpose: defines repeatable map instances used by the retro_rpg scene runtime.
 */
export const RETRO_RPG_MAP_TEMPLATE = {
  // Unique map id used by warp targets and save currentMapId.
  id: 'map_id',
  // Player-facing map name shown in HUD.
  name: 'Map Name',
  // Grid width in whole tiles; valid values are positive integers.
  width: 16,
  // Grid height in whole tiles; valid values are positive integers.
  height: 12,
  // Optional spawn tile for map entry fallback behavior.
  spawn: {
    // Spawn tile x coordinate in grid space.
    x: 2,
    // Spawn tile y coordinate in grid space.
    y: 2
  },
  // Blocked tile coordinates using "x,y" strings for collision walls.
  blocked: ['0,0', '1,0'],
  // NPC definitions for dialogue and optional flag updates.
  npcs: [
    {
      // Unique NPC id for dialogueSeen tracking.
      id: 'npc_id',
      // NPC tile x position.
      x: 4,
      // NPC tile y position.
      y: 3,
      // Dialogue lines cycled by interaction count.
      lines: ['Line one.', 'Line two.'],
      // Optional flag set when this NPC is interacted with.
      setFlag: 'optional_flag_id'
    }
  ],
  // Trigger definitions for events, map warps, and completion.
  triggers: [
    {
      // Unique trigger id for completedEvents tracking.
      id: 'trigger_id',
      // Supported trigger types: flag | warp | complete.
      type: 'flag',
      // Trigger tile x coordinate.
      x: 10,
      // Trigger tile y coordinate.
      y: 6,
      // Optional visibility/activation gate flag.
      requiresFlag: 'optional_required_flag',
      // Optional flag assigned by flag triggers.
      setFlag: 'optional_set_flag',
      // Optional target map id for warp triggers.
      targetMapId: 'other_map_id',
      // Optional player placement after warp.
      targetPlayer: { x: 2, y: 2 },
      // Player-facing trigger result text.
      message: 'Event message text.'
    }
  ]
};

export const RETRO_RPG_MAP_USAGE = [
  '1) Copy RETRO_RPG_MAP_TEMPLATE into public/data/retro-rpg-maps.json.maps.',
  '2) Keep map ids unique and update warp targetMapId references to valid ids.',
  '3) Keep blocked coordinates within width/height bounds for collision safety.',
  '4) Use trigger.type values supported by runtime: flag, warp, complete.',
  '5) If schema changes, update docs/templates/retro-rpg-map-template.md in the same pass.'
];

export const RETRO_RPG_MAP_EXAMPLE = {
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
};
