# TASKS.md

# Button Idle Building Task Ladder

## Purpose

This file is the step-by-step build order for an autonomous coding agent.

It is meant to be used with:

- `MASTER_BUILD_SPEC.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `MIGRATION_PLAN.md`

This task file converts the full project scope into an ordered execution plan.

## Rules for the agent

1. Work in milestone-sized chunks.
2. Do not skip ahead to future genre scenes until the current architectural layer is stable.
3. Keep the browser build runnable throughout migration.
4. Prefer small, reviewable changes over giant rewrites.
5. If a task changes save structure, add or update a save migration.
6. If blocked, write the blocker into `STATUS.md` and stop.
7. When a milestone is complete, mark it complete in `STATUS.md` and stop.

---

# Milestone 0: Ground the current repo

## Goal
Understand and preserve the current runtime before restructuring it.

## Tasks
- [ ] Read:
  - [ ] `MASTER_BUILD_SPEC.md`
  - [ ] `AGENTS.md`
  - [ ] `ARCHITECTURE.md`
  - [ ] `MIGRATION_PLAN.md`
  - [ ] `BASELINE_BEHAVIOR.md`
  - [ ] `SAVE_SCHEMA_SNAPSHOT.md`
- [ ] Inspect current runtime files:
  - [ ] `index.html`
  - [ ] `css/styles.css`
  - [ ] `js/main.js`
  - [ ] `js/core/scene_manager.js`
  - [ ] `js/scenes/button_idle_scene.js`
  - [ ] `js/scenes/marble_scene.js`
  - [ ] `js/scenes/marble/marble_levels.js`
  - [ ] `js/scenes/marble/marble_state.js`
  - [ ] `js/scenes/marble/marble_input.js`
  - [ ] `js/scenes/marble/marble_physics.js`
  - [ ] `js/scenes/marble/marble_renderer.js`
- [ ] Verify current scene IDs:
  - [ ] `button_idle`
  - [ ] `marble`
- [ ] Verify current DOM host IDs:
  - [ ] `sceneHost`
  - [ ] `buttonIdleSceneRoot`
  - [ ] `marbleSceneRoot`
- [ ] Record any runtime mismatches between docs and actual code in `STATUS.md`

## Acceptance criteria
- [ ] The current runtime is understood well enough to preserve behavior during migration.
- [ ] No code changes yet unless needed for documentation parity.

---

# Milestone 1: Build foundation

## Goal
Create the new toolchain and source tree without replacing behavior yet.

## Systems to build
- build tooling
- module entry path
- TypeScript compiler path
- source tree

## Tasks
- [ ] Add `package.json`
- [ ] Add `vite.config.js`
- [ ] Add `tsconfig.json`
- [ ] Add `src/`
- [ ] Add `src/main.js`
- [ ] Add `src/app/bootstrap.js`
- [ ] Add `src/app/App.js`
- [ ] Confirm Vite can boot the app
- [ ] Confirm TypeScript compiles

## Acceptance criteria
- [ ] `npm install` works
- [ ] `npm run dev` works
- [ ] `npm run build` works
- [ ] Browser app boots from `src/main.js`

---

# Milestone 2: Rebuild the host in modules

## Goal
Move the current app host into modular code while preserving behavior.

## Systems to build
- app bootstrap system
- host runtime
- scene registration system
- scene switching system

## Tasks
- [ ] Port `js/main.js` responsibilities into:
  - [ ] `src/main.js`
  - [ ] `src/app/bootstrap.js`
  - [ ] `src/app/App.js`
- [ ] Port `js/core/scene_manager.js` into:
  - [ ] `src/core/scene/SceneManager.js`
- [ ] Add:
  - [ ] `src/core/scene/SceneTypes.js`
  - [ ] `src/core/scene/SceneHost.js`
- [ ] Add:
  - [ ] `src/app/registry.js`
- [ ] Preserve current host concepts:
  - [ ] `sceneHost`
  - [ ] `buttonIdleSceneRoot`
  - [ ] `marbleSceneRoot`
- [ ] Preserve current scene IDs:
  - [ ] `button_idle`
  - [ ] `marble`

## Acceptance criteria
- [ ] Host runs through modular code
- [ ] Scene activation still works
- [ ] Browser build is still runnable

---

# Milestone 3: Port current scenes without redesigning them

## Goal
Move current button and marble scenes into the new module layout first, then improve them later.

## Systems to build
- button idle scene module
- marble scene module
- marble support modules

## Tasks

### Button Idle
- [ ] Create:
  - [ ] `src/scenes/button_idle/ButtonIdleScene.js`
- [ ] Move current button scene behavior there without redesigning mechanics yet

### Marble
- [ ] Create:
  - [ ] `src/scenes/marble/MarbleScene.js`
  - [ ] `src/scenes/marble/MarbleRuntime.js`
  - [ ] `src/scenes/marble/MarbleLevels.js`
  - [ ] `src/scenes/marble/MarbleInput.js`
  - [ ] `src/scenes/marble/MarblePhysics.js`
  - [ ] `src/scenes/marble/MarbleRenderer.js`
- [ ] Preserve current marble runtime behavior first

## Acceptance criteria
- [ ] `button_idle` still works
- [ ] `marble` still works
- [ ] current transition path still works
- [ ] no future scene work has started yet

---

# Milestone 4: Build save architecture

## Goal
Remove ad hoc persistence and replace it with a real save layer.

## Systems to build
- app state model
- save schema
- save service
- save migration system

## Tasks
- [ ] Create:
  - [ ] `src/core/state/AppState.js`
  - [ ] `src/core/state/SaveSchema.js`
  - [ ] `src/core/state/SaveService.js`
  - [ ] `src/core/state/migration/index.js`
  - [ ] `src/core/state/migration/v1.js`
- [ ] Move current local save logic behind `SaveService`
- [ ] Add explicit save versioning
- [ ] Preserve current save loading behavior
- [ ] Make sure scene code no longer owns persistence directly

## Acceptance criteria
- [ ] Save/load works through `SaveService`
- [ ] Current saves can still load or migrate
- [ ] No scene file talks directly to localStorage in target paths

---

# Milestone 5: Build input architecture

## Goal
Normalize keyboard, pointer, and touch input into a shared service.

## Systems to build
- input abstraction
- action map
- keyboard provider
- pointer provider
- touch provider
- optional gamepad provider scaffold

## Tasks
- [ ] Create:
  - [ ] `src/core/input/InputService.js`
  - [ ] `src/core/input/ActionMap.js`
  - [ ] `src/core/input/KeyboardProvider.js`
  - [ ] `src/core/input/PointerProvider.js`
  - [ ] `src/core/input/TouchProvider.js`
  - [ ] `src/core/input/GamepadProvider.js` (scaffold acceptable)
- [ ] Convert marble from raw keyboard handling to `InputService`
- [ ] Reduce direct scene-local event dependence where practical
- [ ] Make action vocabulary support:
  - [ ] `confirm`
  - [ ] `cancel`
  - [ ] `pause`
  - [ ] `move_left`
  - [ ] `move_right`
  - [ ] `move_up`
  - [ ] `move_down`
  - [ ] `interact`
  - [ ] `menu`
  - [ ] `primary`
  - [ ] `secondary`

## Acceptance criteria
- [ ] Current scenes still work
- [ ] Input is routed through service abstractions
- [ ] Touch integration path exists

---

# Milestone 6: Build shell UI architecture

## Goal
Make the persistent host shell modular and independent from scene logic.

## Systems to build
- shell view
- top bar
- tabs
- overlay layer
- save panel
- settings panel
- status bar integration

## Tasks
- [ ] Create:
  - [ ] `src/shell/ShellView.js`
  - [ ] `src/shell/TopBar.js`
  - [ ] `src/shell/Tabs.js`
  - [ ] `src/shell/OverlayLayer.js`
  - [ ] `src/shell/SavePanel.js`
  - [ ] `src/shell/SettingsPanel.js`
- [ ] Connect shell rendering to `App.js`
- [ ] Keep the existing shell DOM alive while migrating ownership to these modules
- [ ] Make save panel use `SaveService`
- [ ] Make shell reflect current active scene and status

## Acceptance criteria
- [ ] Shell renders from modular code
- [ ] Save controls still work
- [ ] Status and top bar are host-owned, not scene-owned

---

# Milestone 7: Build asset and audio systems

## Goal
Move asset and audio responsibilities out of scenes and into reusable services.

## Systems to build
- asset manifest
- asset service
- audio service
- public runtime data path
- public audio path

## Tasks
- [ ] Create:
  - [ ] `src/core/assets/AssetManifest.js`
  - [ ] `src/core/assets/AssetService.js`
  - [ ] `src/core/audio/AudioService.js`
- [ ] Create:
  - [ ] `public/data/`
  - [ ] `public/audio/`
- [ ] Add placeholder runtime data files:
  - [ ] marble levels
  - [ ] button idle text data
- [ ] Make marble consume level data through assets or content paths
- [ ] Make shell able to trigger audio cues through `AudioService`

## Acceptance criteria
- [ ] Assets can load through `AssetService`
- [ ] Audio can be registered and played through `AudioService`
- [ ] No future scene needs to invent its own asset loader

---

# Milestone 8: Build progression architecture

## Goal
Replace hardcoded unlock flow with data-driven progression.

## Systems to build
- scene registry data
- chapter graph
- endings
- unlock rules
- reward handling
- completion handling

## Tasks
- [ ] Create:
  - [ ] `src/progression/ChapterGraph.js`
  - [ ] `src/progression/EndingService.js`
  - [ ] `src/progression/RewardService.js`
  - [ ] `src/progression/UnlockService.js`
- [ ] Create:
  - [ ] `src/content/scenes.json`
  - [ ] `src/content/chapters.json`
  - [ ] `src/content/endings.json`
  - [ ] `src/content/unlocks.json`
- [ ] Move button-to-marble progression into this layer
- [ ] Make scene completion report structured results to the host
- [ ] Make rewards route through `RewardService`

## Acceptance criteria
- [ ] Scene unlocks are data-driven
- [ ] Current button-to-marble path works through progression services
- [ ] Future scenes can be registered before being fully implemented

---

# Milestone 9: Build transition architecture

## Goal
Make transitions first-class host behavior.

## Systems to build
- transition service
- scripted transition support
- button-to-marble transition module
- generic transition scaffolding

## Tasks
- [ ] Create:
  - [ ] `src/core/transitions/TransitionService.js`
  - [ ] `src/core/transitions/scripted/ButtonToMarble.js`
  - [ ] `src/core/transitions/scripted/GenericEndingTransition.js`
- [ ] Move current button-to-marble presentation logic into transition modules
- [ ] Ensure scene switching, shell fading, and transition visuals are host-controlled
- [ ] Provide a generic path for future scene transitions

## Acceptance criteria
- [ ] Current button-to-marble transition still works
- [ ] Transition logic is no longer stuck inside scene code
- [ ] Future transitions have a defined home

---

# Milestone 10: Build platform and mobile architecture

## Goal
Make the browser build structurally ready for Android/iOS packaging.

## Systems to build
- platform service
- web platform implementation
- mobile platform implementation
- safe area support
- touch overlay support
- mobile scene CSS

## Tasks
- [ ] Create:
  - [ ] `src/core/platform/PlatformService.js`
  - [ ] `src/core/platform/WebPlatform.js`
  - [ ] `src/core/platform/MobilePlatform.js`
  - [ ] `src/mobile/TouchOverlay.js`
  - [ ] `src/mobile/SafeArea.js`
  - [ ] `src/styles/scenes/mobile.css`
- [ ] Make shell respect safe areas
- [ ] Make marble playable via touch
- [ ] Remove any critical hover-only dependency from the button scene path
- [ ] Ensure pause/resume hooks exist

## Acceptance criteria
- [ ] Current playable flow works on a touch device in-browser
- [ ] Mobile support path is structurally present
- [ ] Platform lifecycle hooks exist

---

# Milestone 11: Build Phaser adapter path

## Goal
Prove the host can support Phaser scenes without rewriting the host again later.

## Systems to build
- Phaser scene adapter
- Phaser test scene
- host support for DOM + Canvas + Phaser

## Tasks
- [ ] Add Phaser dependency
- [ ] Create:
  - [ ] `src/core/scene/adapters/PhaserSceneAdapter.js`
  - [ ] `src/scenes/phaser_test/PhaserTestScene.js`
- [ ] Add `phaser_test` to content data
- [ ] Confirm mount, update, render, resize, and unmount work cleanly
- [ ] Keep shell overlays working above a Phaser scene

## Acceptance criteria
- [ ] Phaser test scene works
- [ ] Scene manager supports all three scene kinds
- [ ] Host remains stable

---

# Milestone 12: Deepen current scene implementations

## Goal
Improve current scenes after the architecture is stable.

## Systems to build
- button idle internals split
- marble improvements
- data-driven marble levels
- touch-safe marble polish

## Tasks

### Button Idle split
- [ ] Create:
  - [ ] `src/scenes/button_idle/ButtonIdleLogic.js`
  - [ ] `src/scenes/button_idle/ButtonIdleRenderer.js`
  - [ ] `src/scenes/button_idle/ButtonIdleUI.js`
  - [ ] `src/scenes/button_idle/data.js`
- [ ] Split logic, render, and UI responsibilities cleanly

### Marble improvements
- [ ] Fix movement and depth problems
- [ ] Make level data-driven
- [ ] Add multiple levels
- [ ] Add reward handoff structure
- [ ] Improve restart, fail, and completion handling

## Acceptance criteria
- [ ] Button idle scene has cleaner ownership boundaries
- [ ] Marble is stable and expandable
- [ ] Marble uses externalized data

---

# Milestone 13: Add future scene scaffolds

## Goal
Create minimal scaffolds for every future scene in the project scope.

## Systems to build
- MUD scaffold
- retro RPG scaffold
- platformer scaffold
- racing scaffold
- Go scaffold
- Number Munchers scaffold
- Pokémon-like RPG scaffold
- point and click scaffold
- tower defense scaffold
- metroidvania scaffold
- JRPG scaffold

## Tasks
- [ ] Create:
  - [ ] `src/scenes/mud/MudScene.js`
  - [ ] `src/scenes/retro_rpg/RetroRpgScene.js`
  - [ ] `src/scenes/platformer/PlatformerScene.js`
  - [ ] `src/scenes/racing/RacingScene.js`
  - [ ] `src/scenes/go/GoScene.js`
  - [ ] `src/scenes/number_munchers/NumberMunchersScene.js`
  - [ ] `src/scenes/pokemon_like/PokemonLikeScene.js`
  - [ ] `src/scenes/point_click/PointClickScene.js`
  - [ ] `src/scenes/tower_defense/TowerDefenseScene.js`
  - [ ] `src/scenes/metroidvania/MetroidvaniaScene.js`
  - [ ] `src/scenes/jrpg/JrpgScene.js`
- [ ] Add each to:
  - [ ] `src/app/registry.js`
  - [ ] `src/content/scenes.json`
  - [ ] `src/content/chapters.json`
  - [ ] `src/content/endings.json`
  - [ ] `src/content/unlocks.json`
- [ ] Add save slice placeholders for each scene in app state or schema planning layer

## Acceptance criteria
- [ ] Every planned scene exists as a scaffold
- [ ] Every planned scene is represented in content data
- [ ] Future work can proceed scene by scene

---

# Milestone 14: Implement MUD systems

## Goal
Build the first full future DOM scene.

## Systems to build
- command input
- parser
- room graph
- inventory
- world flags
- log/history
- MUD save slice

## Tasks
- [ ] Build input field and command history
- [ ] Build parser scaffold
- [ ] Build room graph data
- [ ] Build inventory and flag model
- [ ] Build response log rendering
- [ ] Build scene completion and ending hooks

## Acceptance criteria
- [ ] MUD is playable
- [ ] MUD saves and loads
- [ ] MUD reports structured completion results

---

# Milestone 15: Implement Go systems

## Goal
Build a full board-based Canvas scene.

## Systems to build
- board model
- legal move validation
- capture logic
- score logic
- restart and reset behavior
- Go save slice

## Tasks
- [ ] Implement board state
- [ ] Implement move legality
- [ ] Implement captures
- [ ] Implement score/pass flow
- [ ] Implement restart and completion flow

## Acceptance criteria
- [ ] Go scene is playable
- [ ] Rules function correctly at intended scope
- [ ] Save slice exists and works

---

# Milestone 16: Implement Number Munchers systems

## Goal
Build the educational grid/puzzle scene.

## Systems to build
- grid
- movement
- prompt rules
- valid target checking
- scoring
- round flow
- Number Munchers save slice

## Tasks
- [ ] Build grid state
- [ ] Build movement and input handling
- [ ] Build target rule system
- [ ] Build round and score system
- [ ] Build fail and completion handling

## Acceptance criteria
- [ ] Scene is playable
- [ ] Prompt/target rules work
- [ ] Save state works as designed

---

# Milestone 17: Implement point and click systems

## Goal
Build a tap-first narrative/puzzle scene.

## Systems to build
- room graph
- interactables
- inventory
- conversation state
- puzzle combinations
- point and click save slice

## Tasks
- [ ] Build room transitions
- [ ] Build clickable interactables
- [ ] Build inventory system
- [ ] Build puzzle resolution flow
- [ ] Build dialogue and flag tracking

## Acceptance criteria
- [ ] Scene is playable
- [ ] Room and item logic work
- [ ] Mobile tap flow works

---

# Milestone 18: Implement retro RPG systems

## Goal
Build the first Phaser-heavy exploration scene.

## Systems to build
- tilemap traversal
- interactables
- NPC dialogue
- map flags
- retro RPG save slice

## Tasks
- [ ] Build map loading path
- [ ] Build movement and collision
- [ ] Build NPC interaction
- [ ] Build event trigger system
- [ ] Build progression and completion path

## Acceptance criteria
- [ ] Scene is playable
- [ ] Movement and interaction work
- [ ] Save state works

---

# Milestone 19: Implement platformer systems

## Goal
Build the platformer scene.

## Systems to build
- platform movement
- jump/gravity
- hazards
- checkpoints
- completion path
- platformer save slice

## Tasks
- [ ] Build movement and jump
- [ ] Build level collision
- [ ] Build hazards/checkpoints
- [ ] Build stage completion tracking

## Acceptance criteria
- [ ] Scene is playable
- [ ] Movement feels correct
- [ ] Completion and save flow work

---

# Milestone 20: Implement racing systems

## Goal
Build the racing scene.

## Systems to build
- steering and movement
- track state
- lap logic
- timing
- racing save slice

## Tasks
- [ ] Build vehicle control
- [ ] Build track and collision
- [ ] Build lap/timer system
- [ ] Build completion and best-time tracking

## Acceptance criteria
- [ ] Scene is playable
- [ ] Lap/timing logic works
- [ ] Save data works

---

# Milestone 21: Implement Pokémon-like RPG systems

## Goal
Build a creature/party RPG scene.

## Systems to build
- overworld traversal
- encounter trigger system
- battle system
- party/roster model
- Pokémon-like save slice

## Tasks
- [ ] Build overworld traversal
- [ ] Build encounter trigger path
- [ ] Build minimal battle flow
- [ ] Build party and inventory model
- [ ] Build capture/roster or recruitment flow if included

## Acceptance criteria
- [ ] Scene is playable
- [ ] Encounters and battle work
- [ ] Save state is stable

---

# Milestone 22: Implement tower defense systems

## Goal
Build the tower defense scene.

## Systems to build
- pathing
- waves
- placement
- upgrades
- attack/projectile logic
- tower defense save slice

## Tasks
- [ ] Build map and enemy pathing
- [ ] Build wave spawning
- [ ] Build tower placement
- [ ] Build tower attack logic
- [ ] Build upgrade path and completion state

## Acceptance criteria
- [ ] Scene is playable
- [ ] Wave/placement logic works
- [ ] Save state works

---

# Milestone 23: Implement metroidvania systems

## Goal
Build the metroidvania scene.

## Systems to build
- movement
- room map
- traversal abilities
- gated progression
- checkpoint/save flow
- metroidvania save slice

## Tasks
- [ ] Build platform movement
- [ ] Build room map transitions
- [ ] Build ability gating
- [ ] Build region flags and unlocks
- [ ] Build checkpoint/save system

## Acceptance criteria
- [ ] Scene is playable
- [ ] Progression gating works
- [ ] Save state is stable

---

# Milestone 24: Implement JRPG systems

## Goal
Build the JRPG scene.

## Systems to build
- overworld or node traversal
- party model
- combat model
- inventory/equipment
- encounter progression
- JRPG save slice

## Tasks
- [ ] Build party and roster state
- [ ] Build overworld or node flow
- [ ] Build turn-based combat
- [ ] Build inventory and equipment
- [ ] Build progression and completion path

## Acceptance criteria
- [ ] Scene is playable
- [ ] Combat works
- [ ] Save state is stable

---

# Milestone 25: Package for Android and iOS

## Goal
Wrap the browser-first app into mobile app targets.

## Systems to build
- Capacitor config
- Android packaging
- iOS packaging
- lifecycle handling
- safe area behavior
- touch polish

## Tasks
- [ ] Add `capacitor.config.js`
- [ ] Initialize Android project
- [ ] Initialize iOS project
- [ ] Verify platform service behavior
- [ ] Verify pause/resume handling
- [ ] Verify touch controls
- [ ] Verify safe-area layout
- [ ] Verify audio resume behavior

## Acceptance criteria
- [ ] Android build launches
- [ ] iOS build launches
- [ ] Browser build still works unchanged
- [ ] current active scenes remain playable

---

# Milestone 26: Polish, hardening, and parity

## Goal
Make the full host coherent and maintainable.

## Systems to build
- consistency pass
- scene transition parity
- doc parity
- save migration hardening
- error handling
- performance cleanup

## Tasks
- [ ] Review all scene registrations
- [ ] Review all save slices
- [ ] Review all progression routes
- [ ] Review all transitions
- [ ] Review mobile safety across scenes
- [ ] Review asset loading and audio handling
- [ ] Update docs to match actual implementation:
  - [ ] `MASTER_BUILD_SPEC.md`
  - [ ] `ARCHITECTURE.md`
  - [ ] `MIGRATION_PLAN.md`
- [ ] Add missing migrations if schema drift occurred

## Acceptance criteria
- [ ] Docs match code
- [ ] Save path is stable
- [ ] Scene system is coherent
- [ ] Packaging path is stable

---

# Summary by system

This project must build all of the following systems across the full implementation:

## Core host systems
- [ ] build tooling
- [ ] app bootstrap
- [ ] scene manager
- [ ] scene host
- [ ] scene registry
- [ ] shell UI
- [ ] save system
- [ ] migration system
- [ ] input system
- [ ] transition system
- [ ] asset system
- [ ] audio system
- [ ] progression system
- [ ] reward system
- [ ] unlock system
- [ ] platform system
- [ ] mobile support system
- [ ] Phaser adapter system

## Current scene systems
- [ ] button idle systems
- [ ] marble systems

## Future scene systems
- [ ] MUD systems
- [ ] retro RPG systems
- [ ] platformer systems
- [ ] racing systems
- [ ] Go systems
- [ ] Number Munchers systems
- [ ] Pokémon-like systems
- [ ] point and click systems
- [ ] tower defense systems
- [ ] metroidvania systems
- [ ] JRPG systems

## Packaging systems
- [ ] Android packaging
- [ ] iOS packaging

---

# Final instruction to the agent

Do not try to complete every milestone in one run.

Read this file.
Read `MASTER_BUILD_SPEC.md`.
Choose the next incomplete milestone.
Complete only that milestone.
Update `STATUS.md`.
Stop when the milestone is done or when blocked.
