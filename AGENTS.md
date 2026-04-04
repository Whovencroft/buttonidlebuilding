# AGENTS.md

# Codex Instructions for Button Idle Building

## Mission

Build **Button Idle Building** into a browser-first anthology game host that starts as a button idle game and transitions into multiple future game genres after endings or completion states.

You are not building separate unrelated games.
You are building one persistent host application with shared progression, shared saves, shared shell UI, and structured scene transitions.

This file is the Codex-facing execution guide for the repository.
The full source of truth for target scope is `MASTER_BUILD_SPEC.md`.
If any local implementation choice conflicts with `MASTER_BUILD_SPEC.md`, follow `MASTER_BUILD_SPEC.md`.

---

## Read These Files First

Before changing code, read these files in this order:

1. `MASTER_BUILD_SPEC.md`
2. `ARCHITECTURE.md`
3. `MIGRATION_PLAN.md`
4. `BASELINE_BEHAVIOR.md`
5. `SAVE_SCHEMA_SNAPSHOT.md`

Then inspect the current runtime files:

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

Do not start by rewriting blindly. Ground yourself in the current repository first.

---

## Primary Objective

Implement the migration and build plan so the repository becomes:

- Vite + TypeScript based
- browser-first
- scene-host driven
- save-service driven
- progression-service driven
- ready for later Android and iOS packaging via Capacitor
- capable of supporting DOM, Canvas, and Phaser scenes inside one persistent host

---

## Non-Negotiable Constraints

1. Keep the browser build runnable throughout migration.
2. Do not destroy current gameplay behavior in the first restructuring pass.
3. Do not replace the project with React, Vue, Angular, or another SPA framework.
4. Do not force every scene into DOM rendering.
5. Do not force every scene into Phaser if DOM or Canvas is enough.
6. Do not leave progression hardcoded in scene files.
7. Do not let scenes mutate global progression directly.
8. Do not access localStorage directly from scene files in the target architecture.
9. Do not introduce giant monolithic replacement files.
10. Do not skip save migrations when changing save structure.

---

## Architecture Rules

### Shell ownership

The shell owns:

- top bar
- tabs
- status bar
- save controls
- settings
- overlays
- transitions
- current scene mount
- progression
- unlocks
- scene switching
- audio and asset services
- platform lifecycle integration

### Scene ownership

A scene owns:

- its own runtime
- its own rendering
- its own local input interpretation
- its own scene-local save slice
- reporting a structured result back to the host

### Service ownership

Shared services own:

- save/load
- input abstraction
- audio
- assets
- transitions
- progression
- rewards
- platform lifecycle

---

## Rendering Rules

Use the following rendering strategy.

### DOM scenes

Use for:

- button idle
- MUD
- shell-heavy interfaces
- some point and click interfaces
- text-heavy systems

### Canvas scenes

Use for:

- marble
- Go
- Number Munchers
- lightweight puzzle and board scenes

### Phaser scenes

Use for:

- retro RPG
- platformer
- racing
- Pokémon-like RPG
- tower defense
- metroidvania
- JRPG

---

## Current Known Scene IDs

Preserve these IDs exactly:

- `button_idle`
- `marble`

Future scene IDs should match the master spec:

- `mud`
- `retro_rpg`
- `platformer`
- `racing`
- `go`
- `number_munchers`
- `pokemon_like`
- `point_click`
- `tower_defense`
- `metroidvania`
- `jrpg`
- `phaser_test`

Do not rename the current IDs during migration.

---

## Required Build Order

Follow this order unless the repository state makes a minor reordering necessary.

### Phase 0
Preserve and document current behavior.

### Phase 1
Introduce build tooling:

- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `src/`

### Phase 2
Port current host into modules:

- `src/main.ts`
- `src/app/App.ts`
- `src/app/bootstrap.ts`
- `src/core/scene/SceneManager.ts`

### Phase 3
Port current scenes without redesigning gameplay first:

- `src/scenes/button_idle/*`
- `src/scenes/marble/*`

### Phase 4
Introduce shared services:

- `SaveService`
- `InputService`
- `AssetService`
- `AudioService`
- `PlatformService`

### Phase 5
Introduce progression layer:

- `ChapterGraph`
- `EndingService`
- `RewardService`
- `UnlockService`
- content JSON files

### Phase 6
Make the current path mobile-safe:

- touch-safe shell
- marble touch controls
- no hover-only critical actions

### Phase 7
Add Phaser adapter and Phaser test scene

### Phase 8
Expand content in the order defined by `MASTER_BUILD_SPEC.md`

---

## Immediate Milestone

The first working milestone must achieve all of the following:

1. Vite dev server works
2. TypeScript compiles
3. the button scene still runs
4. the marble scene still runs
5. scene switching still works
6. the current ending transition still works
7. save/load still works
8. the shell still renders properly

Do not add future genre scenes before this milestone is stable.

---

## Required Working Style

### Always work in small, reviewable steps

Each commit or patch should do one of these:

- move files without changing behavior
- add one service
- add one adapter
- add one migration
- add one mobile-safe input path
- add one progression feature
- add one scene scaffold

### Before major changes

Always answer these questions in your own scratch notes:

- What currently owns this behavior?
- Should this behavior belong to the shell, a scene, or a service?
- Does this change preserve the browser build?
- Does this create a save migration need?
- Does this make mobile support easier or harder?

### When stuck

Do not jump ahead to future genre scenes.
Finish the current layer first.

---

## Required Output Behavior

When making significant progress, update or create the following files as needed:

- `ARCHITECTURE.md`
- `MIGRATION_PLAN.md`
- `MASTER_BUILD_SPEC.md`

If implementation choices force a change in architecture, update the docs in the same work pass.

---

## Acceptance Criteria

A task is not complete unless:

- the code compiles or runs
- the browser build still works
- the change follows the architecture boundaries
- scene ownership and shell ownership remain clean
- save changes are migrated
- the result moves the project closer to the target structure rather than adding more one-off hacks

---

## Final Instruction

Build this project as one persistent browser-first host that can gradually change genres without rewriting the app every time.

Do not solve the problem by building separate unrelated games.
Do not solve the problem by forcing every scene into the same rendering model.
Do not solve the problem by leaving progression hardcoded inside scene files.

Use `MASTER_BUILD_SPEC.md` as the authoritative scope document.
