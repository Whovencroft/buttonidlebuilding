/**
 * MUD room template for repeatable room-graph content definitions.
 * Purpose: standardize room authoring for parser, traversal, inventory, and flags.
 */
export const MUD_ROOM_TEMPLATE = {
  // Unique room id referenced by exits and save state currentRoomId.
  id: 'room_id',
  // Player-facing room title rendered in scene header/log output.
  title: 'Room Title',
  // Primary room narrative shown by look/on-enter behavior.
  description: 'Room description text.',
  // Exit map where key is command direction and value is target room id.
  exits: {
    north: 'another_room_id'
  },
  // Item ids available in this room for take/use command flow.
  items: ['item_id'],
  // Optional flag set to true when the room is entered.
  onEnterFlag: 'visited_room_id'
};

/**
 * Usage instructions for creating new room instances.
 */
export const MUD_ROOM_USAGE = [
  '1) Copy MUD_ROOM_TEMPLATE into public/data/mud-rooms.json rooms array.',
  '2) Set id/title/description/exits/items/onEnterFlag with concrete values.',
  '3) Ensure every exit target id exists in the same rooms array.',
  '4) Keep item ids stable for take/use parser commands and save compatibility.',
  '5) If start room changes, update startRoomId in mud-rooms.json.'
];

/**
 * Deterministic complete example room.
 */
export const MUD_ROOM_EXAMPLE = {
  id: 'atrium',
  title: 'Atrium of Lost Buttons',
  description: 'A tiled room hums with old switchboard ghosts. A brass door stands north.',
  exits: {
    north: 'archive'
  },
  items: ['rusted_key'],
  onEnterFlag: 'visited_atrium'
};
