export const SAVE_SCHEMA_VERSION = 8;

/**
 * Normalizes hosted state to preserve current save compatibility guarantees.
 */
export function normalizeHostedState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  if (!data.meta || typeof data.meta !== 'object' || Array.isArray(data.meta)) {
    data.meta = {};
  }

  if (typeof data.meta.saveVersion !== 'number') {
    data.meta.saveVersion = SAVE_SCHEMA_VERSION;
  }

  if (!data.app || typeof data.app !== 'object' || Array.isArray(data.app)) {
    data.app = {};
  }

  if (typeof data.app.activeScene !== 'string' || !data.app.activeScene) {
    data.app.activeScene = 'button_idle';
  }

  if (!data.flags || typeof data.flags !== 'object' || Array.isArray(data.flags)) {
    data.flags = {};
  }

  if (typeof data.flags.idleGameComplete !== 'boolean') {
    data.flags.idleGameComplete = false;
  }

  if (!data.scenes || typeof data.scenes !== 'object' || Array.isArray(data.scenes)) {
    data.scenes = {};
  }

  if (!data.scenes.button_idle || typeof data.scenes.button_idle !== 'object' || Array.isArray(data.scenes.button_idle)) {
    data.scenes.button_idle = {};
  }

  if (!data.scenes.marble || typeof data.scenes.marble !== 'object' || Array.isArray(data.scenes.marble)) {
    data.scenes.marble = {};
  }

  if (typeof data.scenes.marble.unlocked !== 'boolean') {
    data.scenes.marble.unlocked = false;
  }

  if (typeof data.scenes.marble.currentLevelId !== 'string' || !data.scenes.marble.currentLevelId) {
    data.scenes.marble.currentLevelId = 'training_run';
  }

  data.scenes.marble.bestTimes = data.scenes.marble.bestTimes || {};
  data.scenes.marble.clearedLevels = Array.isArray(data.scenes.marble.clearedLevels) ? data.scenes.marble.clearedLevels : [];
  data.scenes.marble.rewardClaims = data.scenes.marble.rewardClaims || {};
  data.scenes.marble.unlockedFlags = Array.isArray(data.scenes.marble.unlockedFlags) ? data.scenes.marble.unlockedFlags : [];

  ensureSceneSlice(data.scenes, 'mud');
  data.scenes.retro_rpg = ensureRetroRpgSlice(data.scenes.retro_rpg);
  data.scenes.platformer = ensurePlatformerSlice(data.scenes.platformer);
  data.scenes.racing = ensureRacingSlice(data.scenes.racing);
  ensureSceneSlice(data.scenes, 'go');
  ensureSceneSlice(data.scenes, 'number_munchers');
  data.scenes.pokemon_like = ensurePokemonLikeSlice(data.scenes.pokemon_like);
  data.scenes.point_click = ensurePointClickSlice(data.scenes.point_click);
  ensureSceneSlice(data.scenes, 'tower_defense');
  data.scenes.metroidvania = ensureMetroidvaniaSlice(data.scenes.metroidvania);
  data.scenes.jrpg = ensureJrpgSlice(data.scenes.jrpg);

  return data;
}



function ensureJrpgSlice(jrpg) {
  if (!jrpg || typeof jrpg !== 'object' || Array.isArray(jrpg)) {
    return {
      routeId: null,
      nodeId: null,
      party: [],
      inventory: { potions: 2, ethers: 1 },
      equipment: {},
      clearedNodes: [],
      wins: 0,
      losses: 0,
      completed: false,
      message: 'Use Left/Right to choose a node. Enter to engage.',
      lastOutcome: null
    };
  }

  return {
    routeId: typeof jrpg.routeId === 'string' ? jrpg.routeId : null,
    nodeId: typeof jrpg.nodeId === 'string' ? jrpg.nodeId : null,
    party: Array.isArray(jrpg.party) ? jrpg.party : [],
    inventory: jrpg.inventory && typeof jrpg.inventory === 'object'
      ? {
        potions: Number.isInteger(jrpg.inventory.potions) ? jrpg.inventory.potions : 2,
        ethers: Number.isInteger(jrpg.inventory.ethers) ? jrpg.inventory.ethers : 1
      }
      : { potions: 2, ethers: 1 },
    equipment: jrpg.equipment && typeof jrpg.equipment === 'object' ? jrpg.equipment : {},
    clearedNodes: Array.isArray(jrpg.clearedNodes) ? jrpg.clearedNodes : [],
    wins: Number.isInteger(jrpg.wins) ? jrpg.wins : 0,
    losses: Number.isInteger(jrpg.losses) ? jrpg.losses : 0,
    completed: !!jrpg.completed,
    message: typeof jrpg.message === 'string' ? jrpg.message : 'Use Left/Right to choose a node. Enter to engage.',
    lastOutcome: jrpg.lastOutcome && typeof jrpg.lastOutcome === 'object' ? jrpg.lastOutcome : null
  };
}

function ensureMetroidvaniaSlice(metroidvania) {
  if (!metroidvania || typeof metroidvania !== 'object' || Array.isArray(metroidvania)) {
    return {
      currentRoomId: null,
      spawn: null,
      checkpoint: null,
      abilities: { doubleJump: false, dash: false },
      regionFlags: {},
      visitedRooms: [],
      collectedAbilities: [],
      deaths: 0,
      completed: false,
      message: 'Explore and find traversal abilities.',
      lastOutcome: null
    };
  }

  return {
    currentRoomId: typeof metroidvania.currentRoomId === 'string' ? metroidvania.currentRoomId : null,
    spawn: metroidvania.spawn && typeof metroidvania.spawn === 'object'
      ? {
        roomId: typeof metroidvania.spawn.roomId === 'string' ? metroidvania.spawn.roomId : null,
        x: Number.isFinite(metroidvania.spawn.x) ? metroidvania.spawn.x : null,
        y: Number.isFinite(metroidvania.spawn.y) ? metroidvania.spawn.y : null
      }
      : null,
    checkpoint: metroidvania.checkpoint && typeof metroidvania.checkpoint === 'object'
      ? {
        id: typeof metroidvania.checkpoint.id === 'string' ? metroidvania.checkpoint.id : null,
        roomId: typeof metroidvania.checkpoint.roomId === 'string' ? metroidvania.checkpoint.roomId : null,
        x: Number.isFinite(metroidvania.checkpoint.x) ? metroidvania.checkpoint.x : null,
        y: Number.isFinite(metroidvania.checkpoint.y) ? metroidvania.checkpoint.y : null
      }
      : null,
    abilities: metroidvania.abilities && typeof metroidvania.abilities === 'object'
      ? {
        doubleJump: !!metroidvania.abilities.doubleJump,
        dash: !!metroidvania.abilities.dash
      }
      : { doubleJump: false, dash: false },
    regionFlags: metroidvania.regionFlags && typeof metroidvania.regionFlags === 'object' ? metroidvania.regionFlags : {},
    visitedRooms: Array.isArray(metroidvania.visitedRooms) ? metroidvania.visitedRooms : [],
    collectedAbilities: Array.isArray(metroidvania.collectedAbilities) ? metroidvania.collectedAbilities : [],
    deaths: Number.isInteger(metroidvania.deaths) ? metroidvania.deaths : 0,
    completed: !!metroidvania.completed,
    message: typeof metroidvania.message === 'string' ? metroidvania.message : 'Explore and find traversal abilities.',
    lastOutcome: metroidvania.lastOutcome && typeof metroidvania.lastOutcome === 'object' ? metroidvania.lastOutcome : null
  };
}

function ensurePokemonLikeSlice(pokemonLike) {
  if (!pokemonLike || typeof pokemonLike !== 'object' || Array.isArray(pokemonLike)) {
    return {
      mapId: null,
      player: { x: 3, y: 3 },
      party: [],
      roster: [],
      inventory: { captureOrbs: 5, potions: 2 },
      encounters: 0,
      wins: 0,
      captures: 0,
      flags: {},
      message: 'Explore tall grass to trigger encounters.',
      lastOutcome: null
    };
  }

  return {
    mapId: typeof pokemonLike.mapId === 'string' ? pokemonLike.mapId : null,
    player: pokemonLike.player && typeof pokemonLike.player === 'object'
      ? {
        x: Number.isFinite(pokemonLike.player.x) ? pokemonLike.player.x : 3,
        y: Number.isFinite(pokemonLike.player.y) ? pokemonLike.player.y : 3
      }
      : { x: 3, y: 3 },
    party: Array.isArray(pokemonLike.party) ? pokemonLike.party : [],
    roster: Array.isArray(pokemonLike.roster) ? pokemonLike.roster : [],
    inventory: pokemonLike.inventory && typeof pokemonLike.inventory === 'object'
      ? {
        captureOrbs: Number.isInteger(pokemonLike.inventory.captureOrbs) ? pokemonLike.inventory.captureOrbs : 5,
        potions: Number.isInteger(pokemonLike.inventory.potions) ? pokemonLike.inventory.potions : 2
      }
      : { captureOrbs: 5, potions: 2 },
    encounters: Number.isInteger(pokemonLike.encounters) ? pokemonLike.encounters : 0,
    wins: Number.isInteger(pokemonLike.wins) ? pokemonLike.wins : 0,
    captures: Number.isInteger(pokemonLike.captures) ? pokemonLike.captures : 0,
    flags: pokemonLike.flags && typeof pokemonLike.flags === 'object' ? pokemonLike.flags : {},
    message: typeof pokemonLike.message === 'string' ? pokemonLike.message : 'Explore tall grass to trigger encounters.',
    lastOutcome: pokemonLike.lastOutcome && typeof pokemonLike.lastOutcome === 'object' ? pokemonLike.lastOutcome : null
  };
}


function ensureRacingSlice(racing) {
  if (!racing || typeof racing !== 'object' || Array.isArray(racing)) {
    return {
      currentTrackId: null,
      bestTimes: {},
      completedTracks: [],
      currentLap: 1,
      checkpointIndex: 0,
      message: 'Complete laps by driving through checkpoints in order.',
      lastOutcome: null
    };
  }

  return {
    currentTrackId: typeof racing.currentTrackId === 'string' ? racing.currentTrackId : null,
    bestTimes: racing.bestTimes && typeof racing.bestTimes === 'object' ? racing.bestTimes : {},
    completedTracks: Array.isArray(racing.completedTracks) ? racing.completedTracks : [],
    currentLap: Number.isInteger(racing.currentLap) ? racing.currentLap : 1,
    checkpointIndex: Number.isInteger(racing.checkpointIndex) ? racing.checkpointIndex : 0,
    message: typeof racing.message === 'string' ? racing.message : 'Complete laps by driving through checkpoints in order.',
    lastOutcome: racing.lastOutcome && typeof racing.lastOutcome === 'object' ? racing.lastOutcome : null
  };
}


function ensurePlatformerSlice(platformer) {
  if (!platformer || typeof platformer !== 'object' || Array.isArray(platformer)) {
    return {
      currentLevelId: null,
      checkpoint: null,
      deaths: 0,
      completions: {},
      bestTimeMs: {},
      message: 'Reach the goal. Jump with W / Up / Space.',
      lastOutcome: null
    };
  }

  return {
    currentLevelId: typeof platformer.currentLevelId === 'string' ? platformer.currentLevelId : null,
    checkpoint: platformer.checkpoint && typeof platformer.checkpoint === 'object'
      ? {
        levelId: typeof platformer.checkpoint.levelId === 'string' ? platformer.checkpoint.levelId : null,
        x: Number.isFinite(platformer.checkpoint.x) ? platformer.checkpoint.x : null,
        y: Number.isFinite(platformer.checkpoint.y) ? platformer.checkpoint.y : null
      }
      : null,
    deaths: Number.isInteger(platformer.deaths) ? platformer.deaths : 0,
    completions: platformer.completions && typeof platformer.completions === 'object' ? platformer.completions : {},
    bestTimeMs: platformer.bestTimeMs && typeof platformer.bestTimeMs === 'object' ? platformer.bestTimeMs : {},
    message: typeof platformer.message === 'string' ? platformer.message : 'Reach the goal. Jump with W / Up / Space.',
    lastOutcome: platformer.lastOutcome && typeof platformer.lastOutcome === 'object' ? platformer.lastOutcome : null
  };
}


function ensureRetroRpgSlice(retroRpg) {
  if (!retroRpg || typeof retroRpg !== 'object' || Array.isArray(retroRpg)) {
    return {
      currentMapId: null,
      player: { x: 2, y: 2 },
      flags: {},
      completedEvents: {},
      dialogueSeen: {},
      message: 'Explore and press E near NPCs.',
      lastOutcome: null
    };
  }

  return {
    currentMapId: typeof retroRpg.currentMapId === 'string' ? retroRpg.currentMapId : null,
    player: retroRpg.player && typeof retroRpg.player === 'object'
      ? {
        x: Number.isFinite(retroRpg.player.x) ? retroRpg.player.x : 2,
        y: Number.isFinite(retroRpg.player.y) ? retroRpg.player.y : 2
      }
      : { x: 2, y: 2 },
    flags: retroRpg.flags && typeof retroRpg.flags === 'object' ? retroRpg.flags : {},
    completedEvents: retroRpg.completedEvents && typeof retroRpg.completedEvents === 'object' ? retroRpg.completedEvents : {},
    dialogueSeen: retroRpg.dialogueSeen && typeof retroRpg.dialogueSeen === 'object' ? retroRpg.dialogueSeen : {},
    message: typeof retroRpg.message === 'string' ? retroRpg.message : 'Explore and press E near NPCs.',
    lastOutcome: retroRpg.lastOutcome && typeof retroRpg.lastOutcome === 'object' ? retroRpg.lastOutcome : null
  };
}


function ensurePointClickSlice(pointClick) {
  if (!pointClick || typeof pointClick !== 'object' || Array.isArray(pointClick)) {
    return {
      currentRoomId: null,
      inventory: [],
      flags: {},
      solvedPuzzles: {},
      dialogueSeen: {},
      visitedRooms: [],
      message: 'Explore the room and click interactables.',
      lastOutcome: null
    };
  }

  return {
    currentRoomId: typeof pointClick.currentRoomId === 'string' ? pointClick.currentRoomId : null,
    inventory: Array.isArray(pointClick.inventory) ? pointClick.inventory : [],
    flags: pointClick.flags && typeof pointClick.flags === 'object' ? pointClick.flags : {},
    solvedPuzzles: pointClick.solvedPuzzles && typeof pointClick.solvedPuzzles === 'object' ? pointClick.solvedPuzzles : {},
    dialogueSeen: pointClick.dialogueSeen && typeof pointClick.dialogueSeen === 'object' ? pointClick.dialogueSeen : {},
    visitedRooms: Array.isArray(pointClick.visitedRooms) ? pointClick.visitedRooms : [],
    message: typeof pointClick.message === 'string' ? pointClick.message : 'Explore the room and click interactables.',
    lastOutcome: pointClick.lastOutcome && typeof pointClick.lastOutcome === 'object' ? pointClick.lastOutcome : null
  };
}

function ensureSceneSlice(scenes, sceneId) {
  // Purpose: keep scaffold scenes persistence-safe before full implementations land.
  if (!scenes[sceneId] || typeof scenes[sceneId] !== 'object' || Array.isArray(scenes[sceneId])) {
    scenes[sceneId] = {};
  }
}
