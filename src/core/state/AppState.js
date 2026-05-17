import { SAVE_SCHEMA_VERSION, normalizeHostedState } from './SaveSchema.js';

/**
 * Creates the default hosted app state used by the modular host runtime.
 */
export function createDefaultAppState(config) {
  const now = Date.now();

  return normalizeHostedState({
    meta: {
      saveVersion: SAVE_SCHEMA_VERSION
    },
    presses: 0,
    totalPressesEarned: 0,
    totalManualPresses: 0,
    totalGeneratedPresses: 0,
    regret: 0,
    metaPresses: 0,
    hyperPresses: 0,
    pressDerivatives: 0,
    autonomy: 0,
    debt: 0,
    larceny: 0,
    upgrades: Object.fromEntries(config.upgrades.map((upgrade) => [upgrade.id, 0])),
    activeModules: [],
    unlockedLayers: [],
    stats: {
      clicks: 0,
      realClicks: 0,
      fakeClicks: 0,
      popupsClosed: 0,
      prestiges: 0,
      dumbDowns: 0,
      imports: 0,
      exports: 0
    },
    session: {
      lastTick: now,
      lastSave: 0,
      lastClick: now,
      currentMessage: 0,
      buttonNameIndex: 0,
      liarsShown: 0,
      lastButtonJump: 0,
      fakeCrashCount: 0,
      offlineSeconds: 0,
      pointerHoldingButton: false,
      autonomySuppressedUntil: 0,
      autonomyEndingCooldownUntil: 0,
      lastFakeCrashAt: 0
    },
    ui: {
      activeTab: 'play',
      mainButtonPos: { x: 50, y: 50 },
      fakeButtons: [],
      popups: [],
      autonomyEndingOpen: false
    },
    flags: {
      introducedDebt: false,
      introducedFakeButtons: false,
      introducedLayers: false,
      autonomyEndingSeen: false,
      idleGameComplete: false
    },
    app: {
      activeScene: 'button_idle'
    },
    scenes: {
      button_idle: {},
      marble: {
        unlocked: false,
        currentLevelId: 'training_run',
        bestTimes: {},
        clearedLevels: [],
        rewardClaims: {},
        unlockedFlags: []
      },
      // Purpose: scene-local save placeholders for future milestone scaffolds.
      mud: {},
      retro_rpg: {
        currentMapId: null,
        player: { x: 2, y: 2 },
        flags: {},
        completedEvents: {},
        dialogueSeen: {},
        message: 'Explore and press E near NPCs.',
        lastOutcome: null
      },
      platformer: {
        currentLevelId: null,
        checkpoint: null,
        deaths: 0,
        completions: {},
        bestTimeMs: {},
        message: 'Reach the goal. Jump with W / Up / Space.',
        lastOutcome: null
      },
      racing: {
        currentTrackId: null,
        bestTimes: {},
        completedTracks: [],
        currentLap: 1,
        checkpointIndex: 0,
        message: 'Complete laps by driving through checkpoints in order.',
        lastOutcome: null
      },
      go: {},
      number_munchers: {},
      pokemon_like: {
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
      },
      point_click: {
        currentRoomId: null,
        inventory: [],
        flags: {},
        solvedPuzzles: {},
        dialogueSeen: {},
        visitedRooms: [],
        message: 'Explore the room and click interactables.',
        lastOutcome: null
      },
      tower_defense: {},
      metroidvania: {
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
      },
      jrpg: {
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
      }
    }
  });
}
