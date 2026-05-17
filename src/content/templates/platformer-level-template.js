/**
 * Platformer level template.
 * Purpose: defines repeatable level instances for the platformer scene runtime.
 */
export const PLATFORMER_LEVEL_TEMPLATE = {
  // Unique level id used in progression and save currentLevelId.
  id: 'level_id',
  // Player-facing level name displayed in HUD.
  name: 'Level Name',
  // Whole-number tile-grid width for this level.
  width: 24,
  // Whole-number tile-grid height for this level.
  height: 14,
  // Spawn tile used for level start and fallback respawn.
  spawn: {
    // Spawn tile x coordinate in grid space.
    x: 2,
    // Spawn tile y coordinate in grid space.
    y: 10
  },
  // Solid platform tiles in "x,y" format for collision.
  platforms: ['0,13', '1,13'],
  // Hazard tiles that trigger death/respawn.
  hazards: [
    {
      // Hazard tile x coordinate.
      x: 7,
      // Hazard tile y coordinate.
      y: 12
    }
  ],
  // Checkpoint markers that update save checkpoint state.
  checkpoints: [
    {
      // Unique checkpoint id for debugging/telemetry.
      id: 'cp_mid',
      // Checkpoint tile x coordinate.
      x: 11,
      // Checkpoint tile y coordinate.
      y: 8
    }
  ],
  // Goal tile that triggers stage completion.
  goal: {
    // Goal tile x coordinate.
    x: 21,
    // Goal tile y coordinate.
    y: 7
  },
  // Optional next-level id loaded after completion.
  nextLevelId: 'next_level_id_or_null'
};

export const PLATFORMER_LEVEL_USAGE = [
  '1) Copy PLATFORMER_LEVEL_TEMPLATE into public/data/platformer-levels.json.levels.',
  '2) Keep ids unique and set startLevelId to a valid level id.',
  '3) Keep platform/hazard/checkpoint/goal coordinates within width/height bounds.',
  '4) Set nextLevelId to another existing level id or null for final stage.',
  '5) If schema changes, update docs/templates/platformer-level-template.md in the same pass.'
];

export const PLATFORMER_LEVEL_EXAMPLE = {
  id: 'training_platforms',
  name: 'Training Platforms',
  width: 24,
  height: 14,
  spawn: { x: 2, y: 10 },
  platforms: ['0,13', '1,13', '2,13', '3,13'],
  hazards: [{ x: 7, y: 12 }],
  checkpoints: [{ id: 'cp_mid', x: 11, y: 8 }],
  goal: { x: 21, y: 7 },
  nextLevelId: 'spike_corridor'
};
