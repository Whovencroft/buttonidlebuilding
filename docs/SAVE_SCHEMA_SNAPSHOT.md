# Save Schema Snapshot

## Purpose

This document records the current save shape and persistence behavior before schema versioning and migration files are introduced.

It is not a final schema contract. It is a baseline snapshot used to guide the first migration file.

## Current Persistence Mechanism

### Storage backend

Current storage backend:

- `localStorage`

### Save key source

The save key currently comes from the embedded JSON config in `#gameData`:

- `meta.saveKey`

### Save cadence

The current runtime saves:

- every 5 seconds through autosave
- on major actions
- before page unload
- during important scene transitions

### Export format

- JSON state
- encoded to base64 for export/import text

## Current State Construction Path

The current host builds state through:

- `defaultState()`
- `normalizeHostedState()`
- `deepMerge(defaultState(), parsedSave)`

This means the effective save schema is the normalized result of merging parsed saved data into the default host state.

## Current Top Level Shape

```ts
interface CurrentHostedState {
  presses: number;
  totalPressesEarned: number;
  totalManualPresses: number;
  totalGeneratedPresses: number;

  regret: number;
  metaPresses: number;
  hyperPresses: number;
  pressDerivatives: number;

  autonomy: number;
  debt: number;
  larceny: number;

  upgrades: Record<string, number>;
  activeModules: string[];
  unlockedLayers: string[];

  stats: {
    clicks: number;
    realClicks: number;
    fakeClicks: number;
    popupsClosed: number;
    prestiges: number;
    dumbDowns: number;
    imports: number;
    exports: number;
  };

  session: {
    lastTick: number;
    lastSave: number;
    lastClick: number;
    currentMessage: number;
    buttonNameIndex: number;
    liarsShown: number;
    lastButtonJump: number;
    fakeCrashCount: number;
    offlineSeconds: number;
    pointerHoldingButton: boolean;
    autonomySuppressedUntil: number;
    autonomyEndingCooldownUntil: number;
    lastFakeCrashAt: number;
  };

  ui: {
    activeTab: string;
    mainButtonPos: { x: number; y: number };
    fakeButtons: unknown[];
    popups: unknown[];
    autonomyEndingOpen: boolean;
  };

  flags: {
    introducedDebt: boolean;
    introducedFakeButtons: boolean;
    introducedLayers: boolean;
    autonomyEndingSeen: boolean;
    idleGameComplete: boolean;
  };

  app: {
    activeScene: string;
  };

  scenes: {
    button_idle: Record<string, never> | Record<string, unknown>;
    marble: {
      unlocked: boolean;
      currentLevelId: string;
      bestTimes: Record<string, number>;
      clearedLevels: string[];
      rewardClaims: Record<string, boolean>;
      unlockedFlags: string[];
    };
  };

  _log?: Array<{
    text: string;
    priority: string;
    ts: string;
  }>;
}
```

## Current Default Values

### Core numbers

```text
presses: 0
totalPressesEarned: 0
totalManualPresses: 0
totalGeneratedPresses: 0
regret: 0
metaPresses: 0
hyperPresses: 0
pressDerivatives: 0
autonomy: 0
debt: 0
larceny: 0
```

### Upgrades and modules

- `upgrades` starts as every configured upgrade id mapped to `0`
- `activeModules` starts as `[]`
- `unlockedLayers` starts as `[]`

### Stats defaults

```text
clicks: 0
realClicks: 0
fakeClicks: 0
popupsClosed: 0
prestiges: 0
dumbDowns: 0
imports: 0
exports: 0
```

### Session defaults

```text
lastTick: now()
lastSave: 0
lastClick: now()
currentMessage: 0
buttonNameIndex: 0
liarsShown: 0
lastButtonJump: 0
fakeCrashCount: 0
offlineSeconds: 0
pointerHoldingButton: false
autonomySuppressedUntil: 0
autonomyEndingCooldownUntil: 0
lastFakeCrashAt: 0
```

### UI defaults

```text
activeTab: "play"
mainButtonPos: { x: 50, y: 50 }
fakeButtons: []
popups: []
autonomyEndingOpen: false
```

### Flag defaults

```text
introducedDebt: false
introducedFakeButtons: false
introducedLayers: false
autonomyEndingSeen: false
idleGameComplete: false
```

### App defaults

```text
activeScene: "button_idle"
```

### Scene slice defaults

#### `scenes.button_idle`

```text
{}
```

#### `scenes.marble`

```text
unlocked: false
currentLevelId: "training_run"
bestTimes: {}
clearedLevels: []
rewardClaims: {}
unlockedFlags: []
```

## Current Normalization Behavior

The host currently normalizes save state to ensure:

- `app` exists
- `app.activeScene` is a non empty string
- `flags` exists
- `flags.idleGameComplete` exists as a boolean
- `scenes` exists
- `scenes.button_idle` exists as an object
- `scenes.marble` exists as an object
- `scenes.marble.unlocked` exists as a boolean
- `scenes.marble.currentLevelId` is a non empty string
- `scenes.marble.bestTimes` exists as an object
- `scenes.marble.clearedLevels` exists as an array
- `scenes.marble.rewardClaims` exists as an object
- `scenes.marble.unlockedFlags` exists as an array

This normalization behavior must be preserved in the first migration layer.

## Current Save Data Risks

These are the main structural risks in the current schema:

1. There is no explicit save version number yet.
2. Some state is top level idle game state rather than nested under `scenes.button_idle`.
3. `_log` is optional and not formally versioned.
4. UI state, session state, and gameplay state are stored together.
5. `button_idle` scene specific save data is not yet separated cleanly from global host state.

## Immediate Migration Targets

The first migration pass should add:

- an explicit `saveVersion`
- a typed root schema
- a real save service
- migration files
- a stable contract for `app`, `settings`, `profile`, and `scenes`

## Recommended Next Schema Direction

### New root sections to introduce

```ts
interface FutureAppState {
  meta: {
    saveVersion: number;
    firstRunAt: number;
    lastPlayedAt: number;
    platform: 'web' | 'android' | 'ios';
  };

  app: {
    activeScene: string;
    activeChapter: string;
    unlockedScenes: string[];
    completedScenes: string[];
    sceneHistory: string[];
  };

  settings: {
    musicVolume: number;
    sfxVolume: number;
    reduceMotion: boolean;
    touchControls: boolean;
    language: string;
  };

  profile: {
    totalPlaySeconds: number;
    totalEndingsSeen: number;
    totalTransitionsSeen: number;
  };

  scenes: {
    button_idle: ButtonIdleSave;
    marble: MarbleSave;
  };
}
```

### Important note

The first migration should not immediately move every current top level button idle field into `scenes.button_idle` unless the host is ready to consume that new shape everywhere.

The safer approach is:

1. add versioning
2. preserve current shape
3. introduce services
4. move fields into cleaner slices in a later migration

## Migration Guardrails

The first migration implementation must preserve all of these:

- current saves still load
- missing fields still normalize safely
- autosave still works
- export and import still work
- `button_idle` remains the default active scene unless a save explicitly says otherwise
- marble save data remains intact
