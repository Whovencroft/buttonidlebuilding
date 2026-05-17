# Meta-Game Planning Document: lessambitiousthing

## Overview

**lessambitiousthing** is the meta-game narrative version of the project. It stitches scaled-back versions of each standalone game into a single genre-spanning experience. The target completion time is **5.5 hours on average** across all genre shifts.

**ambitiousthing** remains the fully-developed standalone versions of each game with no time constraints.

**buttonidlebuilding** serves as the live testing deployment (GitHub Pages) for the meta-game.

## Architecture

Each game segment exists as a "scene" within the same web application. The meta-narrative connects them through transitions that feel like the game itself is breaking, evolving, or revealing something hidden. The player is never told they are playing multiple games - each transition should feel like a discovery.

## Time Budget

| Game Segment | Target Time | Transition Into |
|---|---|---|
| Idle Game (Red Herring) | 15-20 min | Button escapes at 100% autonomy (glitch/shatter) |
| Marble Madness | 20-30 min | Secret tunnel discovery at end of level 6 |
| MUD (Text Adventure) | 60-90 min | Terminal/Matrix-style reveal (planned) |
| Shmup | TBD | TBD |
| Golf | TBD | TBD |
| Gold-Box RPG | TBD | TBD |
| Driving/Road Rash | TBD | TBD |
| Additional games | TBD | TBD |
| **Total** | **~5.5 hours** | |

## Game 1: Idle Game (Red Herring)

### Current State (ambitiousthing)
- Full prestige system with 4 layers (regret, meta-presses, hyper-presses, press derivatives)
- 14 upgrades with synergy bonuses
- Module system with overclock mechanics
- Autonomy grows over time, chaos effects escalate at 10/30/60/85%
- Current trigger: presses reach Infinity (1e308), then meltdown + shatter + marble transition
- Time to complete: 1-2 hours

### Meta-Game Changes (lessambitiousthing)
- **New trigger**: Autonomy reaches 100% (not Infinity presses)
- **Remove**: The autonomy ending modal (observe/reassert/prestige choices). At 100%, the button escapes - no choice.
- **Remove**: The meltdown system (tied to 1e250+ presses, not needed)
- **Add**: Escalating screen glitch effects as autonomy approaches 100%
  - 70%: Subtle flickers, occasional text corruption
  - 80%: Screen tearing, color shifts, UI elements jittering
  - 90%: Heavy distortion, fake error messages, elements rearranging
  - 95%+: Full screen chaos, the button visibly "pulling away" from the UI
  - 100%: The button breaks free, shatter animation, transition to marble
- **Simplify**: Prestige may be limited to 1-2 layers max (enough to reach 100% autonomy in 15-20 min)
- **Keep**: All upgrade and module mechanics (they drive autonomy growth)
- **Keep**: The existing shatter animation and orb transition to marble

### Implementation Priority
1. Replace `hasReachedInfinityEnding()` with autonomy >= 100 check
2. Remove the autonomy ending modal (openAutonomyEnding, closeAutonomyEnding, reassertControl)
3. Add escalating glitch effects tied to autonomy % (expand existing chaos tiers)
4. Tune autonomy growth rate so 100% is reachable in 15-20 minutes
5. Keep the existing shatter + orb transition to marble

## Game 2: Marble Madness

### Current State (ambitiousthing)
- 21 levels with progressive difficulty
- Tile types: floor, wall, ice, crumble, conveyor, bounce, gate, sweeper, platform, tunnel, elevator, hazard
- Level builder system with CSV support
- Time to complete all levels: 30-40 minutes

### Meta-Game Changes (lessambitiousthing)
- **Reduce to 6 levels** designed as true Marble Madness successors
- Level 1: "The Mountain" (completely redesigned from current version)
- Levels 2-6: TBD (user will provide CSV layouts)
- **Keep**: All tile types and physics systems
- **Keep**: The secret tunnel mechanic that leads to the MUD
- **Remove**: The other 15 levels (they remain in ambitiousthing only)
- The secret tunnel should be discoverable on or after level 6

### Implementation Priority
1. Replace LEVEL_REGISTRY with 6 new entries
2. Accept CSV uploads for each level layout
3. Ensure secret tunnel discovery still triggers MUD transition
4. Tune difficulty curve across 6 levels (gentle intro to challenging finale)

## Game 3: MUD (Text Adventure)

### Current State (ambitiousthing)
- 570+ rooms across 11 themed zones
- Full combat system with per-hit power gain
- Character creation with 12 races and quiz-based class selection
- Weather system, ambient events, examine depth
- Meta-puzzle spanning 11 rooms with marble sightings
- Multiplayer ghost/invasion system
- Time to complete: 4-5+ hours minimum

### Meta-Game Changes (lessambitiousthing)
- **Streamline the meta-puzzle path**: Guide the player through the 11 puzzle rooms more directly
- **Reduce zone count**: Keep only the zones that contain meta-puzzle rooms
- **Remove most side quests**: Keep only quests that are on the critical path
- **Keep all systems**: Combat, power gain, weather, examine, chargen, abilities
- **Simplify chargen**: Possibly reduce quiz to fewer questions for faster start
- **Add breadcrumbs**: NPCs and room descriptions should more clearly hint at the next puzzle room
- **Target**: 60-90 minutes to reach the MUD's ending

### Implementation Priority
1. Map which zones contain meta-puzzle rooms (required zones)
2. Remove or gate off non-essential zones
3. Add NPC dialogue that points toward puzzle rooms
4. Reduce mob density in non-combat-critical areas
5. Ensure the meta-puzzle can be completed in 60-90 min with moderate combat

## Games 4-8: Future Segments

These are planned but not yet developed:

| Game | Genre | Notes |
|---|---|---|
| Shmup | Shoot-em-up | Classic vertical/horizontal scrolling shooter |
| Golf | Sports/Puzzle | Physics-based golf game |
| Gold-Box RPG | Turn-based RPG | Inspired by classic SSI Gold Box games |
| Driving/Road Rash | Racing/Combat | Road Rash-style motorcycle combat racing |
| TBD | TBD | Additional games as needed |

Each should target 20-40 minutes in the meta-game version, with full standalone versions developed separately in ambitiousthing.

## Standalone Access

After completing the meta-game, players can access the full standalone versions of each game. The mechanism is undecided but options include:
- Separate releases that accept save data from the meta-game
- Unlock menu within the meta-game after completion
- Bonuses in standalone versions based on meta-game progress

## Repository Structure

| Repo | Purpose |
|---|---|
| ambitiousthing | Full standalone game development (all games, no time limits) |
| lessambitiousthing | Meta-game narrative (scaled-back, 5.5hr target) |
| buttonidlebuilding | Live deployment for meta-game testing (GitHub Pages) |

## Current Task Checklist

- [x] Clone ambitiousthing to lessambitiousthing
- [ ] Implement autonomy-100% trigger with glitch effects
- [ ] Remove infinity-based meltdown trigger
- [ ] Remove autonomy ending modal
- [ ] Replace marble LEVEL_REGISTRY with 6 new levels
- [ ] Accept CSV uploads for level layouts
- [ ] Streamline MUD meta-puzzle path
- [ ] Add future game scene scaffolds
