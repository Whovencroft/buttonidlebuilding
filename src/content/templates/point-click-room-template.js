/**
 * Point-and-click room content template.
 * Purpose: defines reusable room graph + interactables for the point_click scene.
 */
export const POINT_CLICK_ROOM_TEMPLATE = {
  // Unique room id used by exits and currentRoomId save values.
  id: 'room_id',
  // Player-facing room title in the scene header.
  name: 'Room Name',
  // Deterministic room description rendered in the scene body.
  description: 'Room description text.',
  // Outbound transitions to other rooms in the room graph.
  exits: [
    {
      // Unique exit id for analytics/debug and stable editing.
      id: 'exit_id',
      // Player-facing label shown on the room transition button.
      label: 'Other Room',
      // Target room id that must exist in the same dataset.
      targetRoomId: 'other_room_id',
      // Optional flag gate; exit only appears after this flag is true.
      requiresFlag: 'optional_flag_id'
    }
  ],
  // Clickable actions inside the room.
  interactables: [
    {
      // Unique interactable id for dialogue/puzzle tracking.
      id: 'interactable_id',
      // Supported types: inspect | pickup | talk | puzzle.
      type: 'inspect',
      // Player-facing action label.
      label: 'Inspect object',
      // Generic response text used by inspect/pickup flows.
      message: 'Interaction result text.',
      // Optional inventory item id granted by pickup.
      itemId: 'optional_item_id',
      // Optional puzzle id used for solved state checks.
      puzzleId: 'optional_puzzle_id',
      // Optional required inventory ids for puzzle actions.
      requiresItems: ['optional_item_id'],
      // Optional: remove requiredItems after puzzle success.
      consumeItems: false,
      // Optional requirement flag for visibility.
      requiresFlag: 'optional_flag_id',
      // Optional flag set on success/inspection.
      setFlag: 'optional_flag_id',
      // Optional hide behavior after puzzle is solved.
      hideWhenSolved: false,
      // Optional repeat response for re-click behavior.
      repeatMessage: 'Optional repeated interaction text.',
      // Optional failure text for unmet puzzle requirements.
      failMessage: 'Optional failure text.',
      // Optional success text for puzzle completion.
      successMessage: 'Optional success text.',
      // Optional dialogue lines for talk interactions (cycled by count).
      lines: ['Dialogue line 1', 'Dialogue line 2'],
      // Optional completion marker for final puzzle in the scene.
      completesScene: false
    }
  ]
};

export const POINT_CLICK_USAGE = [
  '1) Add room objects based on POINT_CLICK_ROOM_TEMPLATE into public/data/point-click-rooms.json.rooms.',
  '2) Ensure every exit.targetRoomId references an existing room id in the same file.',
  '3) Use interactable.type values supported by runtime: inspect, pickup, talk, puzzle.',
  '4) For puzzle gating, pair requiresItems/requiresFlag with setFlag consistently across rooms.',
  '5) If schema changes, update docs/templates/point-click-room-template.md in the same pass.'
];

export const POINT_CLICK_EXAMPLE = {
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
};
