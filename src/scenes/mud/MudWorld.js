/**
 * Creates a room graph model from content JSON.
 * Purpose: centralize room lookup, exits, and deterministic world validation.
 */
export function createMudWorld(data) {
  const rooms = Array.isArray(data?.rooms) ? data.rooms : [];
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const startRoomId = roomById.has(data?.startRoomId) ? data.startRoomId : (rooms[0]?.id || null);

  return {
    startRoomId,
    getRoom(roomId) {
      return roomById.get(roomId) || null;
    },
    listRooms() {
      return rooms.slice();
    }
  };
}
