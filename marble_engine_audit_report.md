# Marble Engine Comprehensive Audit Report

**Author:** Manus AI**Date:** April 26, 2026

This document provides a comprehensive audit of the custom isometric marble engine used in the project. The audit covers the renderer, physics system, level definitions, and host integration layer. The goal is to identify bugs, glitches, painter-order violations, and edge cases that could prevent the game from functioning correctly at 100%.

## 1. Renderer and Painter's Algorithm

The renderer uses a classic isometric painter's algorithm, drawing tiles back-to-front based on their `tx + ty` bucket. While the recent fix to terrain face grouping resolved the missing south and east walls, several edge cases and potential violations remain.

### 1.1 Terrain Face Grouping Edge Cases

The terrain face grouping logic now correctly triggers at the rightmost (for south faces) and bottommost (for east faces) tiles of a contiguous run. However, the logic relies on `isFlatTerrainAt` and `hasSouthFaceAt`/`hasEastFaceAt` to determine the run boundaries.

- **Sloped Neighbor Seams:** When a flat run is adjacent to a sloped tile, the renderer draws a trapezoidal face (`quadFace`) for the boundary tile and a solid sheet (`vface`) for the rest. If the sloped tile's corner heights do not perfectly match the flat tile's height, a visual seam or gap can appear. The current logic attempts to mitigate this by using the neighbor's corner heights, but complex intersections (e.g., a ramp meeting a flat tile at an angle) may still exhibit minor artifacts.

- **Blocker Overrides:** The `isFlatTerrainAt` function correctly returns `false` if a blocker is present, ensuring blocker faces take precedence. However, if a blocker is transparent or partially covers the tile, the underlying terrain face might be incorrectly suppressed, leading to missing geometry.

### 1.2 Actor Rendering Order

Actors (moving platforms, elevators, etc.) are drawn in specific buckets to interleave correctly with terrain.

- **Actor Top Faces:** Actor top faces are drawn at the bottom-right tile of their footprint (`floor(ax+aw-ε)`, `floor(ay+ah-ε)`). This ensures they are painted after all terrain top faces in their footprint. However, if an actor is significantly larger than a single tile and overlaps multiple terrain heights, the single bucket assignment might cause it to clip incorrectly through higher terrain tiles that fall within its footprint but have a higher painter bucket.

- **Actor Side Faces:** Actor south and east faces are drawn at `(floor(ax), southRow)` and `(eastCol, floor(ay))` respectively. This generally works, but fast-moving actors might exhibit single-frame flickering if their fractional position crosses a tile boundary mid-frame, causing their painter bucket to jump.

### 1.3 Marble Occlusion and Shadow

The marble occlusion logic (`isMarbleOccluded`) hides the marble when it is behind taller terrain.

- **False Positives:** The occlusion check uses the marble's collision radius. If the marble is very close to a wall but not actually behind it (e.g., resting against the south face of a taller tile), the sphere overlap check might incorrectly flag it as occluded, causing the marble to disappear prematurely.

- **Shadow Bleed:** The marble shadow is drawn at step 9b of the marble's own tile bucket. If the marble is airborne and its shadow falls on a lower terrain tier, the shadow might be drawn in the wrong bucket relative to the lower terrain, causing it to render behind the floor or float incorrectly.

## 2. Physics and Collision

The physics engine uses a fixed-step simulation with swept collision detection.

### 2.1 Collision Resolution

The `resolveSweptBlockerMovement` function uses a binary search to find the exact point of collision.

- **Corner Snagging:** When sliding along a wall composed of multiple tiles, the marble can sometimes snag on the microscopic seams between tiles. The `COLLISION_PUSH_EPSILON` helps mitigate this, but at high speeds or specific angles, the combined collision normal might incorrectly deflect the marble away from the wall instead of allowing it to slide smoothly.

- **Wall-Climb Prevention:** The physics engine includes a specific check to prevent the marble from climbing arbitrarily tall walls by jumping against their side faces. However, this check relies on `getAllBlockingOverlaps`. If a wall is composed of sloped tiles (which are not treated as static blockers in the same way), the marble might still be able to gain unintended vertical velocity.

### 2.2 Support Sampling

The `sampleSupportSurface` function uses a multi-point sampling pattern to determine the ground height and gradient beneath the marble.

- **Edge Jitter:** When the marble rolls over the edge of a tile, the support samples transition from the tile surface to the void. If the marble is moving fast, the sudden change in support height can cause the physics engine to incorrectly classify the transition as a fall (`air`) instead of a smooth roll off the edge, leading to unexpected downward kicks or loss of control.

- **Moving Platform Interaction:** When resting on a moving platform, the marble's support is derived from the actor's surface. If the platform moves rapidly downwards, the marble might momentarily lose support and enter the `airborne` state, causing it to bounce or stutter on the platform.

## 3. Level Definitions and Host Integration

The level definitions and the host application integration contain several critical issues that affect testing and gameplay.

### 3.1 Stale Default Level ID

The most significant integration bug is the presence of a stale default level ID.

- **The Issue:** The top-level `main.js` initializes the persistent save state (`state.scenes.marble.currentLevelId`) to `'training_run'`. The `normalizeHostedState` function also force-fills missing or empty IDs with `'training_run'`. Furthermore, `button_idle_scene.js` sets the ID to `'training_run'` when unlocking the marble mode.

- **The Impact:** The active shipped marble levels (`LEVELS` array in `marble_levels.js`) no longer include a level named `'training_run'`. When the game loads or transitions to the marble scene, it attempts to load this non-existent level. The marble scene's runtime factory (`marble_scene.js`) silently falls back to the first available level (usually `'fork_rejoin_test'`) when an invalid ID is provided. This discrepancy causes confusing startup behavior, bad save migration, and makes testing appear flaky, as the intended level might not load correctly.

### 3.2 Level Design Constraints

Based on the engine's current capabilities, certain level design patterns should be avoided.

- **Moving Platform Placement:** Moving platforms should generally be positioned outside of static terrain. If a moving platform intersects with terrain, the painter's algorithm and support sampling can produce visual artifacts and physics glitches. The exception is 'elevator' style platforms that move strictly vertically within a defined shaft.

- **Goal Placement:** Goals should be placed on standard flat terrain tiles. Placing goals on non-standard tiles, such as bounce tiles or conveyors, can interfere with the trigger evaluation logic and cause the level completion to fail or trigger prematurely.

## 4. Recommendations

1. **Fix Stale Level IDs:** Immediately update `main.js` and `button_idle_scene.js` to use a valid default level ID (e.g., `'fork_rejoin_test'`) instead of `'training_run'`. This will resolve the most prominent integration blocker.

1. **Refine Occlusion Logic:** Adjust the `isMarbleOccluded` function to use a slightly smaller radius or a more precise depth check to prevent false positives when the marble is resting against walls.

1. **Engine Rewrite Consideration:** The current isometric engine, while functional, relies on complex, hard-coded painter-order rules and multi-point physics sampling that are fragile and difficult to maintain. If persistent bugs continue to arise, prioritize a complete rewrite of the engine using a more robust 3D framework (e.g., Three.js) with an orthographic camera. This would eliminate painter-order issues entirely and provide a more stable foundation for future development.

1. **Level Design Guidelines:** Enforce strict level design guidelines, particularly regarding moving platform placement and goal locations, to avoid triggering known engine edge cases.

