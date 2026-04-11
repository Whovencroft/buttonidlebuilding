# Marble Level Design Guide

This guide matches the branch-level marble schema used by `buttonidlebuilding`.

It is written for two jobs:

1. hand-authoring new levels
2. understanding how generated graph courses are assembled

---

## File layout

The branch keeps the host and scene split described in the marble host plan. The marble scene remains separated into runtime, scene control, physics, rendering, and level data so the host can keep layering future game styles on top of one another. The project-wide instruction also says requested code should be fully surfaced in-window and remain web-runnable unless told otherwise.

Relevant files in this branch set:

- `js/scenes/marble_scene.js`
- `js/scenes/marble/marble_state.js`
- `js/scenes/marble/marble_physics.js`
- `js/scenes/marble/marble_renderer.js`
- `js/scenes/marble/marble_levels.js`

---

## Core level schema

Each level is a single object with these important sections:

```js
{
  id,
  name,
  width,
  height,
  killZ,
  voidFloor,
  start,
  reward,
  routeGraph,
  templates,
  surface,
  blockers,
  triggers,
  actors,
  goal
}
```

### `start`

The marble spawns at:

```js
{ x: number, y: number }
```

The actual `z` is sampled from the support surface at that position.

### `goal`

The goal is stored as:

```js
{ x: number, y: number, radius: number }
```

### `routeGraph`

This is the pathing metadata for a hand-authored or generated course.

```js
{
  nodes: [ ... ],
  edges: [ ... ]
}
```

Nodes describe important path points.  
Edges describe how the player is expected to travel between those points.

### `templates`

This is a plain list of tags describing the design pattern used in the level.

Example:

```js
['fork_rejoin', 'safe_branch', 'hazard_branch']
```

---

## Grid model

The marble game still uses a coarse tile grid.

- `x` increases to the right in level data
- `y` increases downward in level data
- each cell is one world tile
- sub-tile behavior comes from shape math

### How to read the grid

If a level is:

```js
width: 28,
height: 18
```

Then valid tile coordinates are:

- `x = 0..27`
- `y = 0..17`

A marble position of:

```js
x: 3.5,
y: 9.5
```

means the marble starts at the center of tile `(3, 9)`.

---

## Surface layer

The `surface` grid is the primary walkable layer.

Each cell is normalized into a structure like this:

```js
{
  kind: 'track' | 'void',
  shape: 'flat' | 'slope_n' | 'slope_s' | 'slope_e' | 'slope_w' |
         'diag_ne' | 'diag_nw' | 'diag_se' | 'diag_sw' |
         'curve_convex_ne' | 'curve_convex_nw' | 'curve_convex_se' | 'curve_convex_sw' |
         'curve_concave_ne' | 'curve_concave_nw' | 'curve_concave_se' | 'curve_concave_sw' |
         'drop_ramp_n' | 'drop_ramp_s' | 'drop_ramp_e' | 'drop_ramp_w' |
         'landing_pad',
  baseHeight: number,
  rise: number,
  friction: number,
  conveyor: { x, y, strength } | null,
  bounce: number,
  crumble: { delay, downtime, respawnEase } | null,
  failType: string | null,
  landingPad: boolean,
  data: any
}
```

### `baseHeight`

The nominal height of the tile.

### `rise`

Used by sloped and drop-ramp surfaces.

Examples:

- cardinal slopes normally use `rise: 1`
- diagonal slopes normally use `rise: 1`
- drop ramps use negative values like `-1.8` or `-2.5`

### `friction`

Used by physics.

Rough interpretation:

- `0.55` to `0.8` = slippery / icy
- `1.0` = neutral
- `1.15` to `1.35` = sticky / heavy drag

### `conveyor`

Adds surface motion:

```js
conveyor: { x: 0.6, y: 0, strength: 1.6 }
```

### `bounce`

Turns a surface into a bounce pad.

Example:

```js
bounce: 4.2
```

### `crumble`

Turns a surface into a crumble tile.

Example:

```js
crumble: {
  delay: 0.24,
  downtime: 1.7
}
```

The tile breaks after the marble spends `delay` seconds on it, then stays broken for `downtime` seconds.

### `failType`

Immediate failure surface.

Example:

```js
failType: 'acid'
```

### `landingPad`

Landing pads tolerate larger vertical landings and are rendered differently.

---

## Surface shapes

These are the supported authored shapes in this branch.

### Flat

```js
{ shape: 'flat', baseHeight: 4 }
```

### Cardinal slopes

```js
{ shape: 'slope_n', baseHeight: 4, rise: 1 }
{ shape: 'slope_s', baseHeight: 4, rise: 1 }
{ shape: 'slope_e', baseHeight: 4, rise: 1 }
{ shape: 'slope_w', baseHeight: 4, rise: 1 }
```

### Diagonal slopes

```js
{ shape: 'diag_ne', baseHeight: 4, rise: 1 }
{ shape: 'diag_nw', baseHeight: 4, rise: 1 }
{ shape: 'diag_se', baseHeight: 4, rise: 1 }
{ shape: 'diag_sw', baseHeight: 4, rise: 1 }
```

### Quarter-tile parametric curves

Convex corner cuts:

```js
{ shape: 'curve_convex_ne', baseHeight: 4 }
{ shape: 'curve_convex_nw', baseHeight: 4 }
{ shape: 'curve_convex_se', baseHeight: 4 }
{ shape: 'curve_convex_sw', baseHeight: 4 }
```

Concave quarter arcs:

```js
{ shape: 'curve_concave_ne', baseHeight: 4 }
{ shape: 'curve_concave_nw', baseHeight: 4 }
{ shape: 'curve_concave_se', baseHeight: 4 }
{ shape: 'curve_concave_sw', baseHeight: 4 }
```

### Drop ramps

```js
{ shape: 'drop_ramp_n', baseHeight: 4, rise: -1.8 }
{ shape: 'drop_ramp_s', baseHeight: 4, rise: -1.8 }
{ shape: 'drop_ramp_e', baseHeight: 4, rise: -1.8 }
{ shape: 'drop_ramp_w', baseHeight: 4, rise: -1.8 }
```

### Landing pads

```js
{ shape: 'landing_pad', baseHeight: 0, landingPad: true, friction: 1.25 }
```

---

## Blocker layer

The `blockers` grid is for static blockers and solid top volumes.

```js
{
  kind: 'wall',
  top: number,
  walkableTop: boolean,
  transparent: boolean,
  timed: any,
  data: any
}
```

### Example static wall

```js
setBlocker(level, 10, 6, {
  top: 6,
  walkableTop: false
});
```

### Example raised block with usable top

```js
setBlocker(level, 10, 6, {
  top: 6,
  walkableTop: true
});
```

---

## Trigger layer

The `triggers` grid is for goal and direct hazard triggers.

```js
{
  kind: 'goal' | 'hazard',
  radius: number | null,
  data: any
}
```

### Goal example

```js
setGoal(level, 24, 9, 0.42);
```

### Hazard example

```js
setTrigger(level, 12, 5, {
  kind: 'hazard',
  data: { type: 'spike_strip' }
});
```

---

## Dynamic actors

Actors are non-grid or semi-grid dynamic stage objects.

Supported kinds:

- `moving_platform`
- `elevator`
- `rotating_bar`
- `sweeper`
- `timed_gate`

### Moving platform

```js
addActor(level, {
  id: 'platform_a',
  kind: 'moving_platform',
  x: 6,
  y: 8,
  z: 4,
  width: 2,
  height: 2,
  topHeight: 4,
  path: {
    type: 'ping_pong',
    speed: 0.75,
    points: [
      { x: 6, y: 8, z: 4 },
      { x: 12, y: 8, z: 4 }
    ]
  }
});
```

### Elevator

```js
addActor(level, {
  id: 'elevator_b',
  kind: 'elevator',
  x: 14,
  y: 4,
  z: 2,
  width: 2,
  height: 2,
  topHeight: 2,
  travel: {
    axis: 'z',
    min: 2,
    max: 5,
    speed: 0.8,
    cycle: 4.2
  }
});
```

### Rotating bar / sweeper

```js
addActor(level, {
  id: 'bar_upper',
  kind: 'rotating_bar',
  x: 18,
  y: 10,
  z: 6,
  width: 1,
  height: 1,
  topHeight: 6,
  armLength: 1.8,
  armWidth: 0.22,
  angularSpeed: 1.7,
  fatal: true
});
```

### Timed gate

```js
addActor(level, {
  id: 'gate_d',
  kind: 'timed_gate',
  x: 21,
  y: 8,
  z: 0,
  width: 1,
  height: 2,
  topHeight: 7,
  closedDuration: 1.5,
  openDuration: 1.1
});
```

---

## Route graph metadata

Each node should answer:

- where the route point is
- what type of route point it is
- what height band it belongs to
- whether it is safe, risky, moving, or drop-based

### Node shape

```js
{
  id: 'fork',
  type: 'fork',
  x: 8.5,
  y: 9.5,
  z: 4,
  tag: 'safe'
}
```

### Edge shape

```js
{
  from: 'fork',
  to: 'risk',
  kind: 'hazard_lane'
}
```

Useful `kind` values in this branch:

- `roll`
- `switchback`
- `jump_drop`
- `controlled_fall`
- `platform_transfer`
- `timed_cross`
- `hazard_lane`
- `risk_skip`
- `shortcut`

---

## Authored level list in this branch

### 1. `fork_rejoin_test`

Start:

```js
start: { x: 2.5, y: 9.5 }
```

Goal:

```js
setGoal(level, 24, 9, 0.42)
```

Path idea:

- central entry lane
- fork into safe upper and risky lower branch
- rejoin at center-right
- landing pad near final straight

### 2. `switchback_descent`

Start:

```js
start: { x: 3.5, y: 3.5 }
```

Goal:

```js
setGoal(level, 19, 14, 0.44)
```

Path idea:

- high ledge start
- descending switchbacks
- quarter-curve corners
- final drop-ramp into landing pad

### 3. `drop_network`

Start:

```js
start: { x: 4.5, y: 4.5 }
```

Goal:

```js
setGoal(level, 20, 15, 0.44)
```

Path idea:

- upper hub
- planned falling routes
- layered lower pathing
- recovery spaces

### 4. `moving_platform_transfer`

Start:

```js
start: { x: 3.5, y: 8.5 }
```

Goal:

```js
setGoal(level, 27, 8, 0.42)
```

Path idea:

- static ledge entry
- moving platform
- elevator
- loop platform
- timed gate
- bounce finish patch

### 5. `crossover_spine`

Start:

```js
start: { x: 3.5, y: 15.5 }
```

Goal:

```js
setGoal(level, 25, 14, 0.42)
```

Path idea:

- split into upper and lower visible routes
- upper path crosses above lower path
- rotating bar hazard on upper route
- sweeper hazard on lower route
- upper route drops into shared finish

---

## Generated graph course flow

The generator no longer builds a single left-to-right strip.

It now does this:

1. choose a motif
2. build a route graph
3. assign node depth/lane information
4. rasterize graph edges into surfaces
5. inject hazards and actors based on edge kinds
6. stamp a goal zone from the goal node

### Supported generated motifs

- `fork_rejoin`
- `switchback`
- `drop_network`
- `platform_transfer`
- `crossover`

### Generator call

```js
window.MarbleSceneDebug.generate({
  level: 7,
  length: 31,
  complexity: 11,
  seed: 12345,
  motif: 'platform_transfer'
});
```

### What each value means now

- `level`: metadata only for now
- `length`: route depth and space budget
- `complexity`: affects hazard density and actor use
- `seed`: deterministic graph selection and rasterization
- `motif`: optional forced topology

---

## How to author a new level by hand

### Step 1

Create the shell.

```js
const level = createLevelShell({
  id: 'my_level',
  name: 'My Level',
  width: 24,
  height: 18,
  killZ: -6,
  voidFloor: -4,
  start: { x: 3.5, y: 8.5 },
  reward: { presses: 10000, claimKey: 'my_level' },
  templates: ['my_custom_tag']
});
```

### Step 2

Lay down surface routes.

```js
fillSurfaceRect(level, 2, 7, 4, 4, { baseHeight: 5 });
applyPath(level, [{ x: 6, y: 8 }, { x: 12, y: 8 }], { baseHeight: 5 }, 2);
```

### Step 3

Add geometry variation.

```js
setSurface(level, 12, 8, { baseHeight: 5, shape: 'drop_ramp_s', rise: -2.0 });
setSurface(level, 13, 10, { baseHeight: 3, shape: 'landing_pad', landingPad: true, friction: 1.25 });
```

### Step 4

Add hazards.

```js
setSurface(level, 10, 8, { baseHeight: 5, crumble: { delay: 0.2, downtime: 2.0 } });
setSurface(level, 11, 8, { baseHeight: 5, conveyor: { x: 0.5, y: 0, strength: 1.4 } });
setSurface(level, 12, 8, { baseHeight: 5, bounce: 4.5 });
setTrigger(level, 14, 8, { kind: 'hazard', data: { type: 'spike_strip' } });
```

### Step 5

Add actors if needed.

```js
addActor(level, { ... });
```

### Step 6

Add graph metadata.

```js
addGraphNode(level, { id: 'start', type: 'entry', x: 3.5, y: 8.5, z: 5 });
addGraphNode(level, { id: 'goal', type: 'goal', x: 18.5, y: 8.5, z: 3 });
addGraphEdge(level, { from: 'start', to: 'goal', kind: 'roll' });
```

### Step 7

Place the goal.

```js
setGoal(level, 18, 8, 0.42);
```

---

## Practical layout advice

### For fork / rejoin stages

- keep the branch split readable on screen
- make at least one branch recoverable
- rejoin on stable footing

### For switchbacks

- give each turn 1 tile of setup before the turn
- use convex curves to smooth outer corners
- use landing pads below deliberate drops

### For drop networks

- every intentional drop should have an obvious landing target
- avoid invisible lower routes under opaque blockers
- use route graph nodes to mark safe and risky falls

### For platform transfers

- keep first transfer generous
- only add timed gates after the player understands the platform rhythm
- elevators should land at stable receiving platforms

### For crossover stages

- upper and lower paths should be visually distinguishable by height and hazard color
- if the upper route drops to the goal, mark the landing zone clearly

---

## Quick authoring checklist

Before calling a level done, check:

- start tile has support
- goal tile has support
- all planned drops have landing space
- moving platform endpoints are actually reachable
- timed gate openings are not impossible
- route graph nodes match the actual traversable route
- hazard surfaces are readable by color and placement
- `killZ` is below the lowest intended recovery route

---

## Debug workflow

Console helpers:

```js
window.MarbleSceneDebug.listLevels()
window.MarbleSceneDebug.loadLevel('moving_platform_transfer')
window.MarbleSceneDebug.generate({ level: 3, length: 10, complexity: 5, seed: 333 })
window.MarbleSceneDebug.toggleRouteGraph()
window.MarbleSceneDebug.exportLastReplay()
```

In-scene:

- press `G` to toggle route graph overlay
- press `R` to restart
- press `Esc` to return to the button scene
