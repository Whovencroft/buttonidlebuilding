# MASTER_BUILD_SPEC.md

# Button Idle Building Master Build Specification

## Purpose

This document is the single authoritative build specification for **Button Idle Building**.

It is written so it can be handed to a developer or team and used as the complete project brief for:

- the full target scope
- the intended technology choices
- the final architecture
- the scene system
- progression and unlock rules
- save structure
- browser and app packaging requirements
- implementation order
- acceptance criteria

This file is meant to replace ambiguity.

---

# 1. Project Summary

## Core concept

The project begins as a browser-based idle game about pressing a button.  
When the current game reaches an ending or completion state, the project transitions into a different style of game.

This is not a collection of unrelated minigames.  
It is one persistent host application that transforms across layers and genres.

## Final vision

The finished project is a **browser-first anthology game host** that supports a sequence of distinct playable scenes, including but not limited to:

- button idle game
- marble game
- MUD
- 1980s style 2D RPG
- platformer
- racing game
- game of Go
- Number Munchers style game
- 1990s style Pokémon-like RPG
- point and click adventure
- tower defense
- metroidvania
- JRPG

The host must remain one unified application with shared progression, shared saves, shared shell UI, and structured scene transitions.

## Primary runtime goals

The game must:

- run in a browser
- remain playable as a web page during development
- later be packageable as an Android app
- later be packageable as an iOS app
- keep one codebase as much as possible

---

# 2. Non-Negotiable Design Rules

1. **The project remains browser-first.**  
   Native app packaging happens later through a wrapper around the web runtime, not by rewriting the project into a separate native codebase.

2. **The app shell is persistent.**  
   Menus, save tools, progression, and transitions belong to the host, not to individual scenes.

3. **Each playable mode is a scene.**  
   A scene can be DOM-based, Canvas-based, or Phaser-based.

4. **Scenes do not directly own global progression.**  
   Scenes report structured results. The shell interprets those results.

5. **The current repo structure matters.**  
   Migration must respect the fact that the current project already has:
   - a scene host
   - a button scene
   - a marble scene
   - shared state
   - local save behavior
   - DOM shell structure

6. **The current browser build must stay runnable throughout migration.**

7. **Mobile support is required in the target design.**  
   New scene systems must be designed so they can be used on touch devices.

---

# 3. Technology Decision

## Required stack

### Core stack
- **TypeScript**
- **Vite**
- **HTML/CSS**
- **Custom scene host**
- **Custom save/progression layer**

### Rendering stack by scene type
- **DOM** for shell-heavy and text-heavy scenes
- **Canvas 2D** for board, puzzle, and lightweight real-time scenes
- **Phaser** for action-heavy or animation-heavy 2D scenes

### App packaging
- **Capacitor** for Android and iOS builds

## Explicit decisions

### Use DOM for:
- MUD
- menus
- save/config panels
- some point and click interfaces
- shell overlays

### Use Canvas for:
- marble
- Go
- Number Munchers
- simple board and puzzle scenes

### Use Phaser for:
- 1980s style 2D RPG
- platformer
- racing game
- Pokémon-like RPG
- tower defense
- metroidvania
- JRPG
- any later scene that needs camera movement, animation, tilemaps, or richer collisions

## Do not use these as the main gameplay architecture
- React
- Vue
- Angular
- DOM-only animation for action scenes

These can be used for tooling or shell-like interfaces if needed, but they are not the core gameplay framework.

---

# 4. Current Repository Baseline

The current repository already contains the seed of the host architecture.

## Current known runtime files

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

## Current known behavior

The current project already has:

- a shell page
- a `sceneHost`
- scene roots for the button and marble scenes
- shared app state
- `app.activeScene`
- per-scene save slices
- a custom scene manager with enter, exit, update, and render flow
- a DOM-heavy button scene
- a real-time marble scene path
- a transition from the idle game toward the marble game

This must be preserved and evolved, not discarded.

---

# 5. Final Product Definition

The final product is a **multi-scene, genre-shifting game host** with:

- one persistent shell
- one shared save file
- scene-based progression
- unlockable future scenes
- chapter and ending logic
- app packaging capability
- reusable services for saves, input, assets, audio, transitions, and platform lifecycle

The player should feel like they are moving through one strange, escalating project rather than launching separate unrelated games.

---

# 6. Final Repository Layout

The target repository layout is:

```text
index.html
package.json
vite.config.ts
tsconfig.json
capacitor.config.ts

public/
  audio/
  icons/
  data/

src/
  main.ts
  app/
    App.ts
    bootstrap.ts
    registry.ts
  core/
    scene/
      SceneManager.ts
      SceneTypes.ts
      SceneHost.ts
      adapters/
        DomSceneAdapter.ts
        CanvasSceneAdapter.ts
        PhaserSceneAdapter.ts
    state/
      AppState.ts
      SaveSchema.ts
      SaveService.ts
      migration/
        index.ts
        v1.ts
        v2.ts
    input/
      InputService.ts
      ActionMap.ts
      KeyboardProvider.ts
      PointerProvider.ts
      TouchProvider.ts
      GamepadProvider.ts
    transitions/
      TransitionService.ts
      scripted/
        ButtonToMarble.ts
        GenericEndingTransition.ts
    assets/
      AssetManifest.ts
      AssetService.ts
    audio/
      AudioService.ts
    platform/
      PlatformService.ts
      WebPlatform.ts
      MobilePlatform.ts
  shell/
    ShellView.ts
    TopBar.ts
    Tabs.ts
    OverlayLayer.ts
    SavePanel.ts
    SettingsPanel.ts
  scenes/
    button_idle/
      ButtonIdleScene.ts
      ButtonIdleLogic.ts
      ButtonIdleRenderer.ts
      ButtonIdleUI.ts
      data.ts
    marble/
      MarbleScene.ts
      MarbleRuntime.ts
      MarbleLevels.ts
      MarbleInput.ts
      MarblePhysics.ts
      MarbleRenderer.ts
    mud/
      MudScene.ts
      parser/
      world/
      content/
    retro_rpg/
      RetroRpgScene.ts
    platformer/
      PlatformerScene.ts
    racing/
      RacingScene.ts
    go/
      GoScene.ts
    number_munchers/
      NumberMunchersScene.ts
    pokemon_like/
      PokemonLikeScene.ts
    point_click/
      PointClickScene.ts
    tower_defense/
      TowerDefenseScene.ts
    metroidvania/
      MetroidvaniaScene.ts
    jrpg/
      JrpgScene.ts
    phaser_test/
      PhaserTestScene.ts
  progression/
    ChapterGraph.ts
    EndingService.ts
    RewardService.ts
    UnlockService.ts
  content/
    scenes.json
    chapters.json
    endings.json
    unlocks.json
  mobile/
    TouchOverlay.ts
    SafeArea.ts
  styles/
    styles.css
    shell.css
    scenes/
      mobile.css
      button_idle.css
      marble.css
```

---

# 7. System Architecture

## 7.1 Host shell

The shell owns:

- top bar
- tabs
- status bar
- save tools
- settings
- overlays
- transition presentation
- current scene mount
- progression and unlock handling
- scene switching
- audio and asset services
- platform lifecycle
- browser/app integration

The shell never owns scene-specific gameplay simulation.

## 7.2 Scene manager

The scene manager owns:

- scene registration
- scene activation
- scene enter and exit
- active scene update
- active scene render
- state-load notification
- adapter support for different scene types

## 7.3 Shared services

Shared services include:

- `SaveService`
- `InputService`
- `AssetService`
- `AudioService`
- `TransitionService`
- `PlatformService`
- `EndingService`
- `RewardService`
- `UnlockService`

## 7.4 Scene adapters

The host must support three scene modes:

### DOM scene adapter
Used for:
- MUD
- shell-heavy interfaces
- text systems
- some point and click interfaces

### Canvas scene adapter
Used for:
- marble
- Go
- Number Munchers
- board and puzzle scenes

### Phaser scene adapter
Used for:
- retro RPG
- platformer
- racing
- Pokémon-like RPG
- tower defense
- metroidvania
- JRPG

---

# 8. Scene Contract

Every scene must conform to the host-facing contract below.

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

## Important rule

Scenes may produce results.  
Scenes may not directly mutate global progression or directly decide the app’s next long-term progression state.

---

# 9. Global State and Save Design

## Save principles

- one primary save file
- explicit versioning
- migration support
- scene-local save slices
- platform-agnostic persistence interface

## Host state shape

```ts
interface AppState {
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

## Save adapter requirement

All persistence must go through a save adapter abstraction.

### Web implementation
- localStorage at first

### Mobile implementation
- Capacitor Preferences or filesystem later

No scene file may talk to localStorage directly in the finished system.

---

# 10. Progression Model

## Progression concept

The player moves through a chain or graph of scenes.  
Each scene ends in one or more completion or ending states.  
Those endings unlock future scenes or branches.

## Required progression data files

- `src/content/scenes.json`
- `src/content/chapters.json`
- `src/content/endings.json`
- `src/content/unlocks.json`

## Required progression services

- `ChapterGraph`
- `EndingService`
- `RewardService`
- `UnlockService`

## Rules

- Scene unlocks must be data-driven.
- Completion routes must be data-driven.
- Cross-scene rewards must be centralized.
- Secret branches must be possible later.
- The current button-to-marble path is the first example, not the only one.

---

# 11. Input Model

## Input principles

The project must support:

- keyboard
- mouse
- pointer
- touch
- later gamepad support

## Required abstraction

All active scene input must go through `InputService`.

## Minimum action vocabulary

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

## Rule

No future scene may depend on hover-only or keyboard-only controls for its primary flow.

---

# 12. Audio Model

## Audio service responsibilities

- register tracks
- play music and SFX
- manage master volume
- pause and resume cleanly
- survive app lifecycle changes
- keep audio out of scenes

## Audio requirement

The host must be able to control:
- music volume
- SFX volume
- mute
- track stop and reset
- scene transition audio cues

---

# 13. Asset Model

## Asset service responsibilities

- preload marked assets
- load text, JSON, images, and audio
- cache assets
- keep asset loading out of scene internals

## Asset philosophy

Start with simple explicit manifests.  
Do not build an overcomplicated streaming system in the first pass.

---

# 14. Transition Model

Transitions are part of the product structure, not just decoration.

## Transition responsibilities

- fade shell elements
- animate scene handoff
- support one-off scripted transitions
- pause old scene
- prepare next scene
- resume next scene after transition completion

## First required scripted transition

### Button Idle -> Marble

This transition is already conceptually present and must remain part of the system.

It should:
- fade shell elements
- present a visible transformation from button to marble
- switch to marble scene
- restore runtime and shell state cleanly

---

# 15. Mobile and App Packaging Requirements

## Packaging target

Use **Capacitor** for Android and iOS packaging.

## Mobile requirements

- safe-area support
- touch overlays where needed
- pause/resume on backgrounding
- orientation-aware behavior
- audio resume safety
- touch-friendly target sizes
- no reliance on hover

## Mobile architecture files

- `src/mobile/TouchOverlay.ts`
- `src/mobile/SafeArea.ts`
- `src/styles/scenes/mobile.css`
- `src/core/platform/PlatformService.ts`
- `src/core/platform/WebPlatform.ts`
- `src/core/platform/MobilePlatform.ts`

---

# 16. Full Scene Catalog

Below is the complete target scope for scenes currently planned.

---

## 16.1 Button Idle Scene

### ID
`button_idle`

### Type
DOM

### Purpose
The opening scene and current starting game.

### Core mechanics
- manual button pressing
- auto-generation
- upgrade buying
- fake button behavior
- popups
- autonomy growth
- layer and resource escalation
- ending trigger that leads into marble

### Save slice
- total presses
- upgrades
- rules/modules
- autonomy state
- related scene-specific flags

### Required outcome
- must still work after migration
- must report a structured completion or ending result
- must no longer be the permanent owner of shell logic

### Mobile requirement
- touch-safe primary input
- no critical mouseenter-only dependency

---

## 16.2 Marble Scene

### ID
`marble`

### Type
Canvas

### Purpose
First real-time genre shift after the idle game.

### Core mechanics
- marble movement
- collision
- level completion
- failure handling
- reset and restart
- level timing
- reward reporting

### Save slice
- unlocked
- currentLevelId
- bestTimes
- clearedLevels
- reward claim records

### Required improvements
- fix movement and depth issues
- use level data
- support multiple levels
- support touch controls
- remain separate from shell logic

### Mobile requirement
- must be fully playable without keyboard

---

## 16.3 MUD Scene

### ID
`mud`

### Type
DOM

### Core systems
- command line input
- parser
- room graph
- inventory
- state flags
- response log
- command history

### Save slice
- current room
- inventory
- world flags
- discovered text states

### Completion style
- scene branch completion
- puzzle completion
- ending unlock

### Mobile requirement
- input field and quick-action buttons
- large text-friendly layout

---

## 16.4 1980s Style 2D RPG

### ID
`retro_rpg`

### Type
Phaser

### Core systems
- top-down tile movement
- NPC dialogue
- simple map collision
- interactables
- scene triggers
- optional simple battle or encounter logic

### Save slice
- player position
- map progress
- NPC flags
- inventory or quest flags

### Mobile requirement
- virtual movement controls
- touch interaction button

---

## 16.5 Platformer

### ID
`platformer`

### Type
Phaser

### Core systems
- horizontal movement
- jump
- gravity
- hazards
- checkpoints
- stage completion

### Save slice
- unlocked stages
- checkpoint or completion state
- collected items

### Mobile requirement
- movement plus jump/action buttons

---

## 16.6 Racing Game

### ID
`racing`

### Type
Phaser

### Core systems
- movement and steering
- lap tracking
- collision
- time trial or ranking
- course completion

### Save slice
- unlocked tracks
- best times
- completion flags

### Mobile requirement
- touch steering or virtual controls

---

## 16.7 Go Scene

### ID
`go`

### Type
Canvas

### Core systems
- board state
- legal move checking
- capture rules
- pass
- score calculation
- restart and undo support if desired

### Save slice
- board state
- turn state
- match completion state

### Mobile requirement
- tap-based placement
- zoom clarity on smaller screens

---

## 16.8 Number Munchers Scene

### ID
`number_munchers`

### Type
Canvas

### Core systems
- grid navigation
- rule prompt
- valid target selection
- score tracking
- failure state
- timed or round-based progression

### Save slice
- unlocked sets or modes
- best score
- current round or puzzle state if persistent

### Mobile requirement
- directional touch controls or tap-to-move

---

## 16.9 Pokémon-like RPG

### ID
`pokemon_like`

### Type
Phaser

### Core systems
- top-down exploration
- encounter triggers
- turn-based battle
- creature/party data
- capture or roster handling
- item and progression state

### Save slice
- map position
- party
- roster
- encounter flags
- inventory
- progression flags

### Mobile requirement
- touch movement and battle UI

---

## 16.10 Point and Click Adventure

### ID
`point_click`

### Type
DOM or Phaser hybrid

### Core systems
- room graph
- interactables
- inventory
- dialogue
- puzzle combinations
- transition between locations

### Save slice
- current room
- inventory
- solved puzzles
- dialogue and state flags

### Mobile requirement
- tap-first interaction model

---

## 16.11 Tower Defense

### ID
`tower_defense`

### Type
Phaser

### Core systems
- pathing
- wave spawning
- tower placement
- tower upgrades
- projectiles or attack systems
- level completion and fail states

### Save slice
- unlocked maps
- best clear results
- persistent upgrades if desired

### Mobile requirement
- tap placement and drag or tap upgrade interaction

---

## 16.12 Metroidvania

### ID
`metroidvania`

### Type
Phaser

### Core systems
- platform movement
- room map
- traversal abilities
- gated progression
- combat or hazards
- region unlock state

### Save slice
- map progress
- abilities obtained
- checkpoint or save room state
- collected items
- boss or encounter flags

### Mobile requirement
- robust virtual controls
- ability buttons
- pause and map access

---

## 16.13 JRPG

### ID
`jrpg`

### Type
Phaser

### Core systems
- overworld or node travel
- party data
- turn-based combat
- equipment and items
- progression
- story or encounter gates

### Save slice
- party roster
- stats
- equipment
- inventory
- world progress
- encounter flags

### Mobile requirement
- touch-ready menus and battle actions

---

# 17. Scene Unlock and Completion Rules

## Required rules

1. Every scene has:
   - an unlock condition
   - a completion condition
   - a reward or no-reward definition
   - a next-scene or next-branch rule

2. Every scene must be represented in content data even if it is not implemented yet.

3. Every scene should have a save slice placeholder before full implementation.

4. The first currently required path is:
   - `button_idle`
   - `marble`

5. Future scenes can be linear, branching, or hidden.

---

# 18. Exact Build Order

This is the required implementation order.

## Phase 0: Preserve current behavior
- document current runtime
- snapshot save schema
- keep current browser build runnable

## Phase 1: Build tooling foundation
- add `package.json`
- add `vite.config.ts`
- add `tsconfig.json`
- establish `src/`
- make Vite dev build run

## Phase 2: Port existing host into modules
- move `js/main.js` into `src/main.ts` and `src/app/App.ts`
- move `js/core/scene_manager.js` into `src/core/scene/SceneManager.ts`
- preserve scene IDs and current host behavior
- keep current shell DOM

## Phase 3: Port current scenes
- move button scene into `src/scenes/button_idle/`
- move marble scene into `src/scenes/marble/`
- preserve current functionality first
- do not redesign gameplay during the first move

## Phase 4: Add services
- SaveService
- InputService
- AssetService
- AudioService
- PlatformService
- scene type scaffolding

## Phase 5: Add progression layer
- ChapterGraph
- EndingService
- RewardService
- UnlockService
- content JSON files

## Phase 6: Add mobile-safe interaction
- touch overlay
- safe area handling
- marble touch controls
- removal of primary hover-only dependencies

## Phase 7: Add Phaser adapter
- Phaser scene adapter
- Phaser test scene
- host integration for DOM, Canvas, and Phaser scenes

## Phase 8: Expand content
Recommended expansion order:
1. finish marble improvements
2. add Go or Number Munchers
3. add MUD or point and click
4. add one Phaser-heavy test scene
5. add retro RPG or platformer
6. add remaining larger scenes

---

# 19. Exact File Ownership by Responsibility

## Host bootstrap
- `src/main.ts`
- `src/app/bootstrap.ts`
- `src/app/App.ts`

## Scene system
- `src/core/scene/SceneManager.ts`
- `src/core/scene/SceneTypes.ts`
- `src/core/scene/SceneHost.ts`
- `src/core/scene/adapters/*`

## Save system
- `src/core/state/AppState.ts`
- `src/core/state/SaveSchema.ts`
- `src/core/state/SaveService.ts`
- `src/core/state/migration/*`

## Input system
- `src/core/input/*`

## Transitions
- `src/core/transitions/*`

## Platform integration
- `src/core/platform/*`

## Audio
- `src/core/audio/AudioService.ts`

## Assets
- `src/core/assets/*`
- `public/data/*`
- `public/audio/*`

## Shell UI
- `src/shell/*`

## Progression
- `src/progression/*`
- `src/content/*`

## Scene implementations
- `src/scenes/*`

---

# 20. Coding Standards and Constraints

## Code requirements
- TypeScript
- human-readable names
- modular files
- explicit interfaces
- no giant monolith replacement file
- comments where behavior is not obvious
- low hidden magic

## Architecture constraints
- scene logic stays inside scenes
- shell logic stays inside shell and services
- no direct localStorage in scene files
- no direct global progression mutations from scenes
- no hardcoded unlock ladders in `App.ts`

## Performance constraints
- do not use DOM-heavy animation for action scenes
- keep shell DOM separate from gameplay rendering
- use Canvas or Phaser when animation pressure grows

---

# 21. Testing and Acceptance Criteria

## Foundation acceptance
- Vite dev server runs
- TypeScript compiles
- browser app launches

## Scene acceptance
- button scene works after port
- marble scene works after port
- scene switching still works
- current transition still works

## Service acceptance
- saves go through SaveService
- input goes through InputService
- progression goes through progression services
- assets load through AssetService
- audio goes through AudioService

## Mobile acceptance
- marble is playable via touch
- shell is usable on small screens
- safe area support exists
- pause/resume saves cleanly

## Phaser acceptance
- a Phaser test scene mounts
- a Phaser test scene unmounts
- shell overlays still work over a Phaser scene

## Scope acceptance
The full scope is achieved when the host can support all listed genres through the shared architecture and app packaging path, even if content quantity continues to grow afterward.

---

# 22. Immediate Deliverables Required From a Developer

A developer given this specification should produce the following in order:

## Deliverable A
A working Vite + TypeScript version of the current host with:
- button scene
- marble scene
- scene switching
- save loading
- shell rendering

## Deliverable B
Shared services wired in:
- SaveService
- InputService
- AssetService
- AudioService
- PlatformService

## Deliverable C
Progression layer wired in:
- ChapterGraph
- EndingService
- RewardService
- UnlockService
- content JSON files

## Deliverable D
Touch-safe marble plus mobile-safe shell behavior

## Deliverable E
Phaser adapter plus Phaser test scene

## Deliverable F
New scene implementation work by genre in the stated order

---

# 23. Final Instruction to the Implementer

Build this project as one persistent browser-first host that can gradually change genres without rewriting the app every time.

Do not solve the problem by building separate games with unrelated runtime logic.  
Do not solve the problem by forcing every scene into the same rendering model.  
Do not solve the problem by leaving progression hardcoded inside scene files.

The finished system must let the project keep escalating into new modes while still feeling like one coherent application.

This document is the full project scope and the required implementation path.
