# Button Idle Building Architecture

## Purpose

This repository is becoming a browser first anthology game host.

The project starts as an idle game, then transitions into new game types after each ending or completion. The host must support multiple scene styles without forcing every future game into the same rendering model.

The architecture is designed to support:

- browser play as the primary runtime
- later Android and iOS packaging through Capacitor
- one persistent shell with many scene implementations
- shared progression, save data, settings, transitions, and unlock logic
- a mix of DOM, Canvas, and Phaser backed scenes

## Current Repository Baseline

The current repository already contains the first version of the host pattern.

### Current runtime entrypoints

- `index.html`
- `css/styles.css`
- `js/main.js`
- `js/core/scene_manager.js`
- `js/scenes/button_idle_scene.js`
- `js/scenes/marble_scene.js`
- `js/scenes/marble/marble_levels.js`
- `js/scenes/marble/marble_state.js`
- `js/scenes/marble/marble_input.js`
- `js/scenes/marble/marble_physics.js`
- `js/scenes/marble/marble_renderer.js`

### Current runtime model

The current app already has:

- a shell in `index.html`
- a neutral `sceneHost`
- scene roots for button and marble scenes
- a central `js/main.js` loop
- a scene manager in `js/core/scene_manager.js`
- shared state with `app.activeScene`
- per scene save slices under `state.scenes`
- a DOM heavy button scene
- a real time marble scene path

This is the correct base for future expansion.

## Architectural Goals

1. Keep the project runnable in a web page at all times.
2. Preserve the idea of one host and many game styles.
3. Prevent `js/main.js` from becoming a permanent god file.
4. Separate shell concerns from scene concerns.
5. Make future mobile packaging possible without rewriting core game logic.
6. Let simple scenes stay simple.
7. Let action scenes use a proper rendering path.

## Core Principles

### 1. The shell owns progression

Scenes do not decide global progression directly.

Scenes report a structured result. The shell interprets that result and applies:

- progression updates
- unlocks
- rewards
- save writes
- transitions
- next scene routing

### 2. Scenes own only their own slice

Each scene should read and write only its own save slice plus scene local runtime state.

Cross scene rewards must go through a shared reward pipeline.

### 3. Rendering strategy is scene specific

Not every scene should use the same rendering path.

Use:

- DOM scenes for text heavy and UI heavy scenes
- Canvas scenes for simple board and puzzle scenes
- Phaser scenes for animation heavy and action heavy gameplay

### 4. Services are shared, content is modular

The host provides shared services:

- state
- saves
- transitions
- audio
- input
- asset loading
- platform lifecycle
- progression

Scenes consume those services instead of reimplementing them.

### 5. Every schema change gets a migration

Save structure will change as the project grows. Every save version bump must ship with an explicit migration.

### 6. Mobile is a first class constraint

Every new scene should be added with touch safe input and mobile safe layout in mind, even before the app packaging step is complete.

## Target Runtime Architecture

```text
Browser / Mobile WebView
└── App Shell
    ├── Shell UI
    ├── Scene Host
    ├── Scene Manager
    ├── Save Service
    ├── Progression Service
    ├── Reward Service
    ├── Transition Service
    ├── Input Service
    ├── Audio Service
    ├── Asset Service
    └── Platform Service
         └── active scene
             ├── DOM scene
             ├── Canvas scene
             └── Phaser scene
```

## Scene Types

### DOM Scene

Best for:

- MUD
- menus
- save/config views
- text systems
- some point and click interactions

Characteristics:

- standard HTML markup
- CSS driven layout
- low animation pressure
- shell like interaction patterns

### Canvas Scene

Best for:

- Go
- Number Munchers
- simple boards
- lightweight puzzles

Characteristics:

- custom render loop
- manual drawing
- simple input mapping
- low engine overhead

### Phaser Scene

Best for:

- 1980s style 2D RPG
- platformer
- racing
- Pokémon like RPG
- tower defense
- metroidvania
- JRPG

Characteristics:

- sprite animation
- camera systems
- tilemaps
- action movement
- collision heavy gameplay
- scalable content pipeline

## Planned Repository Layout

The current root level static layout will migrate into a Vite plus TypeScript layout while preserving the same conceptual modules.

### Target layout

```text
index.html
package.json
vite.config.js
tsconfig.json
capacitor.config.js

src/
  main.js
  app/
    App.js
    bootstrap.js
    registry.js
  core/
    scene/
      SceneManager.js
      SceneTypes.js
      SceneHost.js
      adapters/
        DomSceneAdapter.js
        CanvasSceneAdapter.js
        PhaserSceneAdapter.js
    state/
      AppState.js
      SaveSchema.js
      SaveService.js
      migration/
        index.js
        v1.js
        v2.js
    input/
      InputService.js
      ActionMap.js
      KeyboardProvider.js
      PointerProvider.js
      TouchProvider.js
      GamepadProvider.js
    transitions/
      TransitionService.js
      scripted/
        ButtonToMarble.js
    assets/
      AssetService.js
      AssetManifest.js
    audio/
      AudioService.js
    platform/
      PlatformService.js
      WebPlatform.js
      MobilePlatform.js
  shell/
    ShellView.js
    TopBar.js
    Tabs.js
    OverlayLayer.js
    SavePanel.js
    SettingsPanel.js
  scenes/
    button_idle/
      ButtonIdleScene.js
      ButtonIdleLogic.js
      ButtonIdleRenderer.js
      ButtonIdleUI.js
      data.js
    marble/
      MarbleScene.js
      MarbleRuntime.js
      MarbleLevels.js
      MarbleInput.js
      MarblePhysics.js
      MarbleRenderer.js
    mud/
      MudScene.js
    retro_rpg/
      RetroRpgScene.js
    platformer/
      PlatformerScene.js
    racing/
      RacingScene.js
    go/
      GoScene.js
    number_munchers/
      NumberMunchersScene.js
    pokemon_like/
      PokemonLikeScene.js
    point_click/
      PointClickScene.js
    tower_defense/
      TowerDefenseScene.js
    metroidvania/
      MetroidvaniaScene.js
    jrpg/
      JrpgScene.js
  progression/
    ChapterGraph.js
    EndingService.js
    RewardService.js
    UnlockService.js
  content/
    scenes.json
    chapters.json
    endings.json
    unlocks.json
  styles/
    styles.css
    shell.css
    scenes/
      button_idle.css
      marble.css
      mobile.css
```

## Current to Target Module Mapping

### Entry and shell

- `index.html` remains `index.html`
- `css/styles.css` becomes `src/styles/styles.css`
- `js/main.js` becomes `src/main.js` plus `src/app/App.js`

### Core scene management

- `js/core/scene_manager.js` becomes `src/core/scene/SceneManager.js`

### Button idle scene

- `js/scenes/button_idle_scene.js` becomes `src/scenes/button_idle/ButtonIdleScene.js`

Button specific logic currently inside that file should later be split into:

- `ButtonIdleLogic.js`
- `ButtonIdleRenderer.js`
- `ButtonIdleUI.js`

### Marble scene

- `js/scenes/marble_scene.js` becomes `src/scenes/marble/MarbleScene.js`
- `js/scenes/marble/marble_levels.js` becomes `src/scenes/marble/MarbleLevels.js`
- `js/scenes/marble/marble_state.js` becomes `src/scenes/marble/MarbleRuntime.js`
- `js/scenes/marble/marble_input.js` becomes `src/scenes/marble/MarbleInput.js`
- `js/scenes/marble/marble_physics.js` becomes `src/scenes/marble/MarblePhysics.js`
- `js/scenes/marble/marble_renderer.js` becomes `src/scenes/marble/MarbleRenderer.js`

## App Layers

### 1. Shell Layer

The shell is persistent across scenes.

Responsibilities:

- top bar
- tabs
- status bar
- save controls
- settings
- overlays
- scene transition presentation
- progression feedback
- scene host mount point

The shell must never contain game specific simulation logic.

### 2. Scene Layer

Each scene is mounted into the scene host and runs through a shared scene contract.

Responsibilities:

- scene local runtime
- scene local rendering
- scene local input interpretation
- reporting scene results to the shell

### 3. Service Layer

Shared services sit between shell and scenes.

Responsibilities:

- save/load
- platform lifecycle
- transition orchestration
- asset preloading
- input aggregation
- audio lifecycle
- progression handling
- reward application

### 4. Content Layer

Game content should be data driven where practical.

Responsibilities:

- scene registry
- unlock graph
- ending graph
- scene metadata
- level and content data

## Scene Contract

Every scene must implement the same basic host facing contract.

```ts
export type SceneKind = 'dom' | 'canvas' | 'phaser';

export interface SceneContext {
  appState: AppState;
  services: AppServices;
  payload?: unknown;
}

export interface SceneResult {
  completed?: boolean;
  failed?: boolean;
  endingId?: string;
  reward?: RewardPayload;
  nextSceneId?: string;
  savePatch?: Partial<AppState>;
}

export interface BaseScene {
  id: string;
  kind: SceneKind;
  enter(ctx: SceneContext): void | Promise<void>;
  exit(ctx: SceneContext): void;
  update(dt: number, ctx: SceneContext): void;
  render(ctx: SceneContext): void;
  pause?(ctx: SceneContext): void;
  resume?(ctx: SceneContext): void;
  onResize?(ctx: SceneContext): void;
}
```

## State and Save Architecture

### Host state

The app state contains:

- meta information
- app level progression
- settings
- profile stats
- per scene save slices

### Scene slices

Each scene gets its own save slice under `state.scenes`.

Example shape:

```ts
interface AppState {
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
  };

  scenes: {
    button_idle: ButtonIdleSave;
    marble: MarbleSave;
    mud: MudSave;
    retro_rpg: RetroRpgSave;
    platformer: PlatformerSave;
    racing: RacingSave;
    go: GoSave;
    number_munchers: NumberMunchersSave;
    pokemon_like: PokemonLikeSave;
    point_click: PointClickSave;
    tower_defense: TowerDefenseSave;
    metroidvania: MetroidvaniaSave;
    jrpg: JrpgSave;
  };
}
```

### Save adapter

Save persistence must be abstracted behind a save adapter.

- web uses localStorage at first
- mobile uses Capacitor Preferences or filesystem later

Direct `localStorage` access should not remain in scene files.

## Input Architecture

The current project mixes:

- pointer and mouse behavior in the button scene
- keyboard control in the marble scene

That is enough for current browser testing, but not enough for the final scope.

### Input Service responsibilities

- normalize keyboard, pointer, touch, and gamepad input
- expose action based state instead of raw browser events
- let scenes define their own action maps
- support mobile touch overlays
- clear transient input each frame

### Baseline action model

Actions should be named by intent, for example:

- `confirm`
- `cancel`
- `pause`
- `move_left`
- `move_right`
- `move_up`
- `move_down`
- `interact`
- `menu`
- `primary`
- `secondary`

## Transition Architecture

The project depends on transitions as part of the structure, not as optional polish.

### Transition responsibilities

- fade shell elements
- animate scene handoff
- support one off scripted transitions
- pause old scene
- prepare next scene
- resume next scene only after transition completion

### Important rule

Scenes should request transitions. They should not implement global transition behavior themselves.

## Progression Architecture

This is not a menu of disconnected minigames. It is a layered sequence.

### Progression responsibilities

- track scene completion
- track seen endings
- unlock future scenes
- trigger rewards
- select next scene
- allow secret branches later

### Recommended model

Use a graph, not a hardcoded chain.

## Mobile Architecture

The browser build remains primary, but mobile support is part of the plan.

### Packaging

Use Capacitor.

### Mobile specific concerns

- safe area handling
- pause/resume on app backgrounding
- touch first input
- orientation policies
- storage abstraction
- audio resume behavior
- performance on smaller devices

### Rule

Every new scene must be tested for:

- no hover only interaction
- no keyboard only requirement
- large enough touch targets
- stable behavior on resize and orientation change

## Genre Support Strategy

### DOM first scenes

- MUD
- save/config tools
- some point and click UI
- shell heavy interfaces

### Canvas first scenes

- Go
- Number Munchers
- lightweight boards and puzzles

### Phaser first scenes

- 1980s style 2D RPG
- platformer
- racing
- Pokémon like RPG
- tower defense
- metroidvania
- JRPG

## Rules for Future Work

1. Do not add new global state directly in scene files.
2. Do not let `js/main.js` grow forever. It is being replaced by `src/main.js` and `src/app/App.js`.
3. Do not bind scene progression directly inside individual gameplay scenes.
4. Do not make hover, mouseenter, or keyboard the only path for any future critical action.
5. Do not change save schema without adding a migration.
6. Do not force every scene into DOM rendering.
7. Do not force every simple scene into Phaser if Canvas or DOM is enough.

## Definition of Done for the Architecture Transition

The architecture transition is considered established when:

- the project builds through Vite
- current button and marble behavior still works
- scenes register through a typed scene registry
- save access is abstracted behind a service
- input is abstracted behind a service
- touch controls exist for the marble scene
- a Phaser adapter exists and can host one test scene
- Capacitor can wrap the app without structural rewrites
