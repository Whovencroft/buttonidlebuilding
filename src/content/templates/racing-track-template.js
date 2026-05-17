/**
 * Racing track template.
 * Purpose: defines repeatable top-down racing track instances.
 */
export const RACING_TRACK_TEMPLATE = {
  // Unique track id used by startTrackId, save currentTrackId, and nextTrackId.
  id: 'track_id',
  // Player-facing track name shown in race HUD.
  name: 'Track Name',
  // Pixel width of the track world bounds.
  width: 1600,
  // Pixel height of the track world bounds.
  height: 1000,
  // Spawn point and heading at race start/reset.
  spawn: {
    // Spawn x position in world pixels.
    x: 320,
    // Spawn y position in world pixels.
    y: 500,
    // Spawn heading in radians.
    angle: 0
  },
  // Visual road segments used for readability/debugging of drivable area.
  road: [
    {
      // Segment center x position.
      x: 800,
      // Segment center y position.
      y: 500,
      // Segment width in pixels.
      w: 1160,
      // Segment height in pixels.
      h: 520
    }
  ],
  // Collision walls that block the car when hit.
  walls: [
    {
      // Wall center x position.
      x: 800,
      // Wall center y position.
      y: 200,
      // Wall width in pixels.
      w: 1180,
      // Wall height in pixels.
      h: 20
    }
  ],
  // Ordered checkpoints for lap progression.
  checkpoints: [
    {
      // Unique checkpoint id for progress messaging.
      id: 'cp_start',
      // Checkpoint center x position.
      x: 320,
      // Checkpoint center y position.
      y: 500,
      // Trigger radius in pixels.
      radius: 48
    }
  ],
  // Number of laps required to complete this race.
  totalLaps: 3,
  // Optional next track id to auto-load after completion.
  nextTrackId: 'next_track_id_or_null'
};

export const RACING_TRACK_USAGE = [
  '1) Copy RACING_TRACK_TEMPLATE into public/data/racing-tracks.json.tracks.',
  '2) Ensure startTrackId and nextTrackId values reference existing track ids.',
  '3) Keep checkpoints ordered by intended driving path for lap logic correctness.',
  '4) Keep wall/road coordinates within width/height bounds.',
  '5) If schema changes, update docs/templates/racing-track-template.md in the same pass.'
];

export const RACING_TRACK_EXAMPLE = {
  id: 'oval_test',
  name: 'Oval Test',
  width: 1600,
  height: 1000,
  spawn: { x: 320, y: 500, angle: 0 },
  road: [{ x: 800, y: 500, w: 1160, h: 520 }],
  walls: [{ x: 800, y: 200, w: 1180, h: 20 }],
  checkpoints: [
    { id: 'cp_start', x: 320, y: 500, radius: 48 },
    { id: 'cp_north', x: 800, y: 300, radius: 48 }
  ],
  totalLaps: 3,
  nextTrackId: 'chicane_run'
};
