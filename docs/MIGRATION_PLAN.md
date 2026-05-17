# Button Idle Building Migration Plan

## Purpose

This document defines the migration path from the current static browser prototype into a modular, browser first anthology host that can later be packaged as an Android and iOS app.

The plan is intentionally staged to avoid rewriting everything at once.

## Current Starting Point

The repository currently has:

- `index.html` as the shell and content container
- `css/styles.css` as the main stylesheet
- `js/main.js` as the central runtime loop and host coordinator
- `js/core/scene_manager.js` as the scene switcher
- `js/scenes/button_idle_scene.js` as the main DOM heavy scene
- `js/scenes/marble_scene.js` plus `js/scenes/marble/*` as the marble runtime path

This migration plan preserves those concepts while moving them into a typed module based build.

## Migration Goals

1. Preserve current behavior while improving structure.
2. Keep the game runnable in a browser at every milestone.
3. Prepare the codebase for many future scene types.
4. Make mobile packaging possible without a full rewrite.
5. Add a clean path for Phaser backed scenes.
6. Avoid breaking save data without explicit migrations.

## Non Goals

These are not part of the initial migration:

- converting every planned future scene immediately
- rebuilding the current idle game from scratch
- perfect visual polish during the first restructuring pass
- shipping native only codepaths
- removing the browser build in favor of mobile packaging

## Phase Overview

### Phase 0: Freeze the current baseline
### Phase 1: Introduce Vite and TypeScript
### Phase 2: Port the current host into modules
### Phase 3: Abstract save and input services
### Phase 4: Add touch safe scene handling
### Phase 5: Add a Phaser scene adapter
### Phase 6: Formalize progression and rewards
### Phase 7: Add Capacitor
### Phase 8: Begin content expansion by scene type

## Phase 0: Freeze the Current Baseline

### Goal

Capture the current behavior before structural changes.

### Tasks

- create a branch for migration work
- snapshot the current save schema
- record current scene flow:
  - button idle
  - ending transition
  - marble scene
- record known current controls:
  - button scene pointer behavior
  - marble scene keyboard behavior
- record known current layout behavior:
  - standard shell
  - full screen marble mode
  - transition overlay

### Deliverables

- `docs/BASELINE_BEHAVIOR.md`
- `docs/SAVE_SCHEMA_SNAPSHOT.md`

### Exit criteria

- current runtime behaviors are documented
- the migration can be checked against a known baseline

## Phase 1: Introduce Vite and TypeScript

### Goal

Move from static script tag loading toward a maintainable module build.

### Tasks

Create these files at the repository root:

```text
package.json
tsconfig.json
vite.config.js
```

Create this initial source structure:

```text
src/
  main.js
  app/
    App.js
    bootstrap.js
```

### Rules

- do not rewrite scene behavior yet
- do not add new gameplay features yet
- do not split current files aggressively in this phase

### Deliverables

- Vite build works
- TypeScript compiles
- browser app still launches

### Exit criteria

- `npm install` works
- `npm run dev` works
- app shell boots from `src/main.js`

## Phase 2: Port the Current Host into Modules

### Goal

Move the current runtime into module files that match the existing architecture.

### File moves and replacements

#### Entry and shell

- `js/main.js` becomes `src/main.js` and `src/app/App.js`

#### Scene manager

- `js/core/scene_manager.js` becomes `src/core/scene/SceneManager.js`

#### Button scene

- `js/scenes/button_idle_scene.js` becomes `src/scenes/button_idle/ButtonIdleScene.js`

#### Marble scene

- `js/scenes/marble_scene.js` becomes `src/scenes/marble/MarbleScene.js`
- `js/scenes/marble/marble_levels.js` becomes `src/scenes/marble/MarbleLevels.js`
- `js/scenes/marble/marble_state.js` becomes `src/scenes/marble/MarbleRuntime.js`
- `js/scenes/marble/marble_input.js` becomes `src/scenes/marble/MarbleInput.js`
- `js/scenes/marble/marble_physics.js` becomes `src/scenes/marble/MarblePhysics.js`
- `js/scenes/marble/marble_renderer.js` becomes `src/scenes/marble/MarbleRenderer.js`

#### Styles

- `css/styles.css` becomes `src/styles/styles.css`

### New supporting files

```text
src/core/scene/SceneTypes.js
src/core/scene/SceneHost.js
src/app/registry.js
```

### Rules

- preserve current scene IDs:
  - `button_idle`
  - `marble`
- preserve current host element concepts:
  - `sceneHost`
  - `buttonIdleSceneRoot`
  - `marbleSceneRoot`
- preserve the current transition from idle ending to marble

### Exit criteria

- browser build still runs
- button scene still works
- marble scene still works
- current scene switching still works
- no scene logic depends on `window.*` globals anymore

## Phase 3: Abstract Save and Input Services

### Goal

Remove direct persistence and raw input assumptions from scene code.

### New files

```text
src/core/state/AppState.js
src/core/state/SaveSchema.js
src/core/state/SaveService.js
src/core/state/migration/index.js
src/core/state/migration/v1.js

src/core/input/InputService.js
src/core/input/ActionMap.js
src/core/input/KeyboardProvider.js
src/core/input/PointerProvider.js
src/core/input/TouchProvider.js
```

### Save work

- move direct save logic out of `App.js`
- wrap current localStorage behavior behind `SaveService`
- assign a save version number
- create first migration file for the current schema

### Input work

- remove direct raw key handling from `MarbleInput.js`
- remove direct scene local assumptions where practical from button scene input
- expose action based input snapshots

### Rules

- current browser controls must still work during this phase
- no mobile UI yet, only the service layer

### Exit criteria

- scenes no longer talk directly to `localStorage`
- scenes no longer depend on raw global keyboard only assumptions
- save versioning exists
- current save data still loads

## Phase 4: Add Touch Safe Scene Handling

### Goal

Make the current project structurally safe for mobile interaction before app packaging.

### Tasks

#### Button idle scene

- remove any critical hover only behavior
- make every important interaction pointer safe on touch devices
- verify fake buttons and main button behavior are usable without mouse hover

#### Marble scene

- add touch controls
- support at least one of:
  - on screen directional controls
  - virtual stick
  - swipe movement interpretation

#### Shell

- verify top level UI controls work on smaller screens
- account for safe areas in later mobile packaging

### New files

```text
src/mobile/TouchOverlay.js
src/mobile/SafeArea.js
src/styles/scenes/mobile.css
```

### Exit criteria

- the current app is playable on a touchscreen browser
- no mandatory keyboard only scene remains in the current playable path

## Phase 5: Add a Phaser Scene Adapter

### Goal

Prepare for future heavy gameplay scenes without rewriting the host again.

### New files

```text
src/core/scene/adapters/PhaserSceneAdapter.js
src/scenes/phaser_test/PhaserTestScene.js
```

### Tasks

- add Phaser as a dependency
- create a scene adapter that mounts Phaser into the existing scene host
- prove the host can switch between:
  - DOM scene
  - Canvas scene
  - Phaser scene

### Rules

- do not migrate button idle into Phaser
- do not migrate marble into Phaser unless the current canvas path becomes a blocker
- use Phaser only for scenes that need it

### Exit criteria

- one test Phaser scene can mount and unmount cleanly
- scene switching still works
- shell overlays still work above a Phaser scene

## Phase 6: Formalize Progression and Rewards

### Goal

Replace hardcoded scene handoff assumptions with data driven progression.

### New files

```text
src/progression/ChapterGraph.js
src/progression/EndingService.js
src/progression/RewardService.js
src/progression/UnlockService.js

src/content/scenes.json
src/content/chapters.json
src/content/endings.json
src/content/unlocks.json
```

### Tasks

- move scene metadata into a registry
- move unlock conditions into content
- move next scene rules into progression data
- formalize structured scene results

### Rules

- scenes may report results
- only progression services may mutate global unlock state
- only reward services may apply cross scene rewards

### Exit criteria

- the idle to marble path uses the progression layer
- new future scenes can be added without hardcoding another `if` ladder in `App.js`

## Phase 7: Add Capacitor

### Goal

Package the browser app as Android and iOS apps without replacing the core runtime.

### New files

```text
capacitor.config.js
android/
ios/
```

### Tasks

- install Capacitor
- initialize Android project
- initialize iOS project
- add a platform service abstraction

### New files for platform abstraction

```text
src/core/platform/PlatformService.js
src/core/platform/WebPlatform.js
src/core/platform/MobilePlatform.js
```

### Platform work

- app pause triggers save
- app resume restores lifecycle cleanly
- audio resumes correctly
- safe area padding works
- touch controls remain functional
- orientation rules are respected per scene

### Exit criteria

- Android build opens and runs
- iOS build opens and runs
- existing browser build still works unchanged

## Phase 8: Begin Content Expansion

### Goal

Add future scenes on top of the stabilized host.

### Recommended order

#### First wave

- finish marble
- add Go or Number Munchers
- add MUD or point and click

#### Second wave

- add one Phaser heavy scene:
  - retro RPG
  - platformer
  - or tower defense

#### Third wave

- add larger long form scenes:
  - Pokémon like RPG
  - metroidvania
  - JRPG
  - racing

### Reason for this order

This validates:

- DOM scenes
- Canvas scenes
- Phaser scenes

before the project is too large to restructure safely.

## Immediate File Creation Plan

These are the first files to add.

### Repository root

```text
package.json
tsconfig.json
vite.config.js
capacitor.config.js
```

### Initial source tree

```text
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
    state/
      AppState.js
      SaveSchema.js
      SaveService.js
      migration/
        index.js
        v1.js
    input/
      InputService.js
      ActionMap.js
      KeyboardProvider.js
      PointerProvider.js
      TouchProvider.js
  scenes/
    button_idle/
      ButtonIdleScene.js
    marble/
      MarbleScene.js
      MarbleRuntime.js
      MarbleLevels.js
      MarbleInput.js
      MarblePhysics.js
      MarbleRenderer.js
  styles/
    styles.css
```

## Concrete Migration Order

### Step 1

Add the new build files and source folders.

### Step 2

Move `js/core/scene_manager.js` into `src/core/scene/SceneManager.js`.

### Step 3

Move `js/main.js` into `src/main.js` and `src/app/App.js`.

### Step 4

Move the button idle scene into `src/scenes/button_idle/ButtonIdleScene.js`.

### Step 5

Move the marble scene modules into `src/scenes/marble/*`.

### Step 6

Move `css/styles.css` into `src/styles/styles.css`.

### Step 7

Replace direct global references with imports and exports.

### Step 8

Introduce `SaveService`.

### Step 9

Introduce `InputService`.

### Step 10

Add touch controls for marble.

### Step 11

Add Phaser adapter.

### Step 12

Add progression and reward services.

### Step 13

Add Capacitor.

## Acceptance Criteria by Milestone

### Milestone A: Module build established

- Vite dev server runs
- TypeScript compiles
- current browser app loads

### Milestone B: Current scenes preserved

- button idle still runs
- marble still runs
- current transition still runs
- saves still load

### Milestone C: Shared services established

- saves go through `SaveService`
- input goes through `InputService`
- scene registration goes through `registry.js`

### Milestone D: Mobile safe browser behavior

- marble works on touch
- no mandatory hover only actions remain
- layout remains usable on small screens

### Milestone E: Future scene path established

- one Phaser test scene works
- progression is data driven
- Capacitor can package the app

## Rules During Migration

1. Do not change behavior and structure in the same commit unless necessary.
2. Do not delete the current browser path before the module path is working.
3. Do not move all button scene logic into one giant replacement file.
4. Do not add new future genres before the service layer exists.
5. Do not hardcode future scene unlocks in `App.js`.
6. Do not let scenes write global progression directly.
7. Do not skip save migrations.

## Recommended Branch Strategy

### Branch names

- `migration/vite-typescript-foundation`
- `migration/scene-manager-modules`
- `migration/save-input-services`
- `migration/mobile-input`
- `migration/phaser-adapter`
- `migration/progression-layer`
- `migration/capacitor-packaging`

### Commit style

Each commit should do one of these:

- move files without behavior change
- add one service
- add one adapter
- add one mobile safe input path
- add one progression feature

## Final Target State

The migration is complete when the repository supports:

- browser first play
- Android packaging
- iOS packaging
- one persistent shell
- many scene types
- modular save schema
- modular progression
- modular input
- modular transitions
- a clean path for adding each new genre

At that point, adding new scenes becomes content and scene work, not host surgery.
