# Baseline Behavior Snapshot

## Purpose

This document captures the current runtime behavior of the repository before the Vite plus TypeScript migration begins.

It exists to prevent the migration from silently breaking the current playable flow.

## Current Playable Flow

1. The app loads from `index.html`.
2. The shell renders topbar, tabs, content, and status bar.
3. The default active scene is `button_idle`.
4. The button idle scene runs inside `#buttonIdleSceneRoot`.
5. The marble scene exists in `#marbleSceneRoot` and is hidden until activated.
6. A scene switcher exists in the Play panel:
   - `Button Scene`
   - `Marble Test` or `Marble Locked`
7. The idle game can unlock the marble scene.
8. The idle ending can trigger a transition overlay and handoff into marble.
9. The marble scene can become full screen by putting the shell into marble mode.

## Shell Behavior

### Layout

- The app shell is a grid with:
  - topbar
  - tabs
  - content
  - status bar
- The Play tab hosts the active scene area.
- The shell can collapse into a marble focused full screen mode by applying `app-marble-mode` on `.app`.

### Tabs

Current tabs are:

- `Game`
- `Rules`
- `Layers`
- `Save / Config`

The active tab is stored in save state.

### Save panel

The current shell provides:

- save now
- export save
- import save
- hard reset
- simulate browser abuse

## Scene Host Behavior

### Host structure

The Play area contains:

- `#sceneHost`
- `#buttonIdleSceneRoot`
- `#marbleSceneRoot`

### Scene manager behavior

The current scene manager:

- registers scenes by id
- stores one active scene id
- calls `enter()`
- calls `exit()`
- calls `update(dt)`
- calls `render()`
- calls `onStateLoaded()`
- toggles scene roots with the `active` class
- sets `aria-hidden` on scene roots

### Current scene IDs

- `button_idle`
- `marble`

## Button Idle Scene Baseline

### Scene type

DOM scene.

### Current behavior

- main button exists and can be pressed
- fake buttons may appear
- popups may appear
- modules can change rules
- autonomy can rise
- an autonomy ending modal can appear
- the game can prestige
- the game can unlock marble
- the game can transition into marble
- the scene updates in the shared app frame loop

### Input behavior

Current input paths include:

- `pointerdown` on main button
- `click` suppression on main button
- `pointerup` and `pointercancel` on `window`
- `mouseenter` on main button for evasive behavior
- `mousemove` on `document` for evasive behavior
- click handlers for ending modal actions
- click handler for the dumb down button

### Important baseline note

The button scene currently contains hover based and mouse movement based behavior. This must be preserved for desktop but cannot remain the only path once mobile support is added.

## Marble Scene Baseline

### Scene type

Canvas backed custom runtime.

### Current behavior

- marble runtime exists
- level data exists
- marble position, velocity, and grounded state are tracked
- camera state exists
- timer state exists
- runtime restart exists
- scene can be prepared and activated through the host
- marble can unlock and track cleared levels and best times

### Input behavior

Current marble input is keyboard based.

Supported keys:

- Arrow keys
- WASD

### Important baseline note

The current marble scene is not touch safe yet. Mobile support requires touch controls before packaging.

## Save and Persistence Baseline

### Current persistence path

- save data is stored in `localStorage`
- save key comes from config in `#gameData`
- export uses a base64 encoded string
- import restores state from the encoded string
- autosave runs every 5 seconds
- save occurs on major actions
- save runs on `beforeunload`

### Current top level save concepts

The current save contains at least:

- presses
- total presses earned
- manual and generated totals
- regret and later layer currencies
- autonomy
- debt
- larceny
- upgrades
- active modules
- unlocked layers
- stats
- session
- ui
- flags
- app
- scenes

### Current app level scene state

- `state.app.activeScene`
- `state.scenes.button_idle`
- `state.scenes.marble`

### Current marble save slice concepts

- `unlocked`
- `currentLevelId`
- `bestTimes`
- `clearedLevels`
- `rewardClaims`
- `unlockedFlags`

## Transition Baseline

### Current scripted transition

There is a button to marble transition overlay.

Current behavior includes:

- transition overlay creation
- shell fade and movement
- animated orb moving from button location toward the scene host
- delayed scene switch into marble
- save updates before and after the transition

### Important baseline note

This is currently implemented in host logic and should remain a supported scripted transition path after migration.

## Debug and Utility Behavior

### Debug scene advance

A typed command buffer exists in the host.

Current debug command:

- `NEXTSCENE`

Effect:

- advances to the next test scene in sequence

### Visibility behavior

When the document becomes visible again:

- offline progress may apply
- scene render runs
- shell render runs

When hidden:

- save runs

## Layout and Style Baseline

### Current full screen marble behavior

When `.app` has `app-marble-mode`:

- topbar is hidden
- tabs are hidden
- status bar is hidden
- content becomes full screen
- panel chrome disappears
- marble stage fills the viewport

### Current transition styling behavior

When `.app` has `app-scene-transitioning`:

- shell pieces fade and move
- button stage fades and scales
- transition overlay becomes active

## Browser Features Currently Relied On

The current runtime depends on:

- `localStorage`
- `requestAnimationFrame`
- DOM event listeners
- CSS classes for scene activation
- `performance.now()`
- `Date.now()`
- element measurements through `getBoundingClientRect()`

## Migration Guardrails

The migration should be considered correct only if all of these remain true after the first structural pass:

1. The app still opens in a browser.
2. The shell still renders.
3. `button_idle` is still the default playable scene.
4. Marble can still be unlocked and entered.
5. The idle to marble transition still works.
6. Save, export, import, autosave, and hard reset still work.
7. Current scene IDs remain stable unless a migration explicitly changes them.
