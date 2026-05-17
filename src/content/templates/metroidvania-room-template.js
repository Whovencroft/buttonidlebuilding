/**
 * Metroidvania room template.
 * Purpose: defines repeatable room-map content, ability gates, and checkpoints.
 */
export const METROIDVANIA_ROOM_TEMPLATE = {
  // Unique room id used by save.currentRoomId and door targets.
  id: 'room_id',
  // Player-facing room/region title shown in HUD.
  name: 'Room Name',
  // Tile-grid width used for world bounds and coordinate validation.
  width: 20,
  // Tile-grid height used for world bounds and coordinate validation.
  height: 12,
  // Solid collision tiles in "x,y" format.
  solids: ['0,11', '1,11'],
  // Hazard tiles in "x,y" format that trigger checkpoint respawn.
  hazards: ['8,11'],
  // Checkpoint markers persisted in save.checkpoint and save.spawn.
  checkpoints: [
    {
      // Stable checkpoint id for telemetry/debug references.
      id: 'cp_room',
      // Tile x coordinate.
      x: 2,
      // Tile y coordinate.
      y: 10
    }
  ],
  // Ability pickups that permanently unlock traversal in save.abilities.
  abilities: [
    {
      // Stable pickup id tracked in save.collectedAbilities.
      id: 'ability_double_jump',
      // Ability key consumed by requiresAbility gates.
      type: 'doubleJump',
      // Tile x coordinate.
      x: 12,
      // Tile y coordinate.
      y: 5
    }
  ],
  // Region flag markers that set save.regionFlags[flagId] when touched.
  flags: [
    {
      // Stable flag id consumed by requiresFlag door gates.
      id: 'entered_upper_passage',
      // Tile x coordinate.
      x: 15,
      // Tile y coordinate.
      y: 10
    }
  ],
  // Door zones for room transitions and progression gating.
  doors: [
    {
      // Unique door id for debug and analytics.
      id: 'door_to_other_room',
      // Top-left tile x coordinate of the doorway zone.
      x: 19,
      // Top-left tile y coordinate of the doorway zone.
      y: 10,
      // Door width in tiles (default 1).
      width: 1,
      // Door height in tiles (default 1).
      height: 1,
      // Destination room id.
      targetRoomId: 'other_room_id',
      // Spawn tile in destination room.
      targetSpawn: {
        // Destination spawn x coordinate.
        x: 1,
        // Destination spawn y coordinate.
        y: 10
      },
      // Required ability key (doubleJump|dash|null).
      requiresAbility: 'doubleJump',
      // Required region flag id or null.
      requiresFlag: 'entered_upper_passage',
      // Optional flag to set when entering this door.
      setFlagOnEnter: 'entered_upper_passage'
    }
  ],
  // Optional goal marker for scene completion in this room.
  goal: {
    // Goal tile x coordinate.
    x: 13,
    // Goal tile y coordinate.
    y: 10,
    // Outcome id reported into save.lastOutcome.endingId.
    endingId: 'metroidvania_complete'
  }
};

export const METROIDVANIA_ROOM_USAGE = [
  '1) Copy METROIDVANIA_ROOM_TEMPLATE into public/data/metroidvania-rooms.json.rooms.',
  '2) Keep room ids unique and keep startRoomId/startSpawn valid at file top-level.',
  '3) Keep all tile coordinates inside width/height bounds.',
  '4) Keep door targetRoomId values aligned to existing room ids and set targetSpawn for safe entry.',
  '5) Only use requiresAbility keys currently supported by runtime (doubleJump, dash).',
  '6) If runtime schema changes, update docs/templates/metroidvania-room-template.md in the same pass.'
];

export const METROIDVANIA_ROOM_EXAMPLE = {
  id: 'upper_passage',
  name: 'Upper Passage',
  width: 18,
  height: 12,
  solids: ['0,11', '1,11', '2,11', '5,8', '6,8'],
  hazards: ['8,11', '9,11'],
  checkpoints: [{ id: 'cp_upper', x: 11, y: 5 }],
  abilities: [{ id: 'ability_double_jump', type: 'doubleJump', x: 12, y: 5 }],
  flags: [{ id: 'upper_beacon', x: 15, y: 10 }],
  doors: [
    {
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
    }
  ],
  goal: null
};
