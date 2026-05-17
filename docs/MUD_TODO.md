# MUD Scene — Master To-Do List

## Purpose

This document is the detailed build plan for the MUD scene within Button Idle Building. It expands on Milestone 14 in `TASKS.md` and serves as the working checklist for all MUD development. Each phase must be completed in order. The first phase is a design Q&A session with the project owner before any code is written.

---

## Constraints (from MASTER_BUILD_SPEC.md)

- **Scene type:** DOM-based
- **Scene ID:** `mud`
- **Core systems:** command line input, parser, room graph, inventory, state flags, response log, command history
- **Save slice:** current room, inventory, world flags, discovered text states
- **Completion style:** scene branch completion, puzzle completion, ending unlock
- **Mobile requirement:** input field and quick-action buttons, large text-friendly layout
- **Integration:** must conform to the host scene contract (enter, exit, update, render) and report structured results to the shell

---

## Phase 0: Design Q&A Session

> **[x] COMPLETED**
> The design Q&A is complete. The answers have been compiled into `docs/MUD_DESIGN.md`. All future phases must adhere to the design document.

### Questions asked to the project owner:

**Setting and Theme**
- [ ] What is the setting? (fantasy, sci-fi, post-apocalyptic, surreal, modern, historical, other)
- [ ] What is the tone? (serious, comedic, dark, whimsical, dry/sardonic, horror)
- [ ] Is there a specific aesthetic inspiration? (Zork, Hitchhiker's Guide, Anchorhead, Colossal Cave, etc.)
- [ ] Should the MUD feel like a standalone world or be narratively connected to the button idle / marble game?

**Gameplay Style**
- [ ] Parser-driven (type full commands like `take lamp`, `go north`) or choice-driven (pick from options)?
- [ ] Hybrid approach? (parser with suggested quick-actions on mobile)
- [ ] How important is puzzle complexity? (light exploration vs. multi-step logic puzzles)
- [ ] Should there be combat? If so, what style? (turn-based, stat-based, narrative, none)
- [ ] Should there be NPCs? Dialogue trees? Merchants?
- [ ] Should there be a time/turn limit or is it open-ended exploration?

**World Scope**
- [ ] Approximate number of rooms for the initial build? (5-10 demo, 20-50 small, 50-100 medium, 100+ large)
- [ ] Linear progression, branching paths, or open world?
- [ ] Multiple endings or a single completion path?
- [ ] Secret areas or hidden content?

**Inventory and Items**
- [ ] How complex should inventory be? (key items only, full inventory management, equipment/stats)
- [ ] Consumable items?
- [ ] Item combinations or crafting?
- [ ] Carry limit?

**Narrative and Writing**
- [ ] Who writes the room descriptions and narrative text? (owner provides, AI generates drafts for review, collaborative)
- [ ] Preferred writing style? (terse/classic, verbose/literary, conversational, atmospheric)
- [ ] Should room descriptions change based on state? (visited vs. first visit, item removed, flag set)

**Integration with Host**
- [ ] How does the player reach the MUD? (unlocked after marble, unlocked by progression, available from start)
- [ ] What does "completing" the MUD mean for overall game progression?
- [ ] Should MUD progress affect other scenes or vice versa?

**Mobile and Accessibility**
- [ ] Quick-action button preferences? (directional buttons, common verbs, context-sensitive)
- [ ] Font size / readability preferences?
- [ ] Color scheme for the MUD terminal? (green-on-black, amber, light theme, match host shell)

---

## Phase 1: World Design Document

> **[x] COMPLETED**
> The world design is complete. See `docs/MUD_WORLD_DESIGN.md` for the full specification.

- [x] Define the world map (room graph with connections) — 7 zones, ~175 rooms
- [x] Define key items and their locations — per-zone item tables
- [x] Define puzzles and their solutions — one per zone + meta-puzzle
- [x] Define NPCs and their roles — Hub NPCs + zone vendors/quest-givers
- [x] Define state flags and triggers — puzzle gates, quest items, zone completion
- [x] Define endings and completion conditions — multiple endings based on zone/class/puzzles
- [x] Define the narrative arc — Marble Chase meta-narrative across all zones
- [ ] Create a world map diagram (visual reference) — TODO: generate Mermaid diagram

---

## Phase 2: Data Architecture

> **[x] COMPLETED**
> The data architecture is complete. See `docs/MUD_DATA_ARCHITECTURE.md` for the full specification.

- [x] Define room data schema (extending `mud-room-template.md`)
- [x] Define item data schema
- [x] Define NPC/Mob data schema
- [x] Define puzzle/flag data schema
- [x] Define save slice schema (`MudSave`)
- [x] Define Server API endpoints for async multiplayer
- [ ] Create `public/data/mud-rooms.json` (or equivalent data file) — deferred to implementation
- [ ] Create `public/data/mud-items.json` — deferred to implementation
- [ ] Validate all room exit references (no dangling pointers) — deferred to implementation

---

## Phase 3: Parser and Command System

> **[x] COMPLETED**
> The parser and command system design is complete. See `docs/MUD_PARSER_DESIGN.md` for the full specification.

- [x] Define parser tokenization and normalization rules
- [x] Define verb vocabulary and aliases
- [x] Define target resolution logic
- [x] Define combat loop (CircleMUD style auto-attack + active abilities)
- [x] Define mobile quick-action UI (persistent + context-sensitive)
- [ ] Build command input field (DOM) — deferred to implementation
- [ ] Build command history (up/down arrow recall) — deferred to implementation
- [ ] Build error/unknown command responses — deferred to implementation
- [ ] Build help system — deferred to implementation

---

## Phase 4: Room Graph and Navigation

- [ ] Build room graph loader (from data file)
- [ ] Build `go` command — move between rooms via exits
- [ ] Build `look` command — display room description, exits, visible items
- [ ] Build first-visit vs. revisit description variants
- [ ] Build room enter hooks (flag setting, event triggers)
- [ ] Build locked exit support (requires item or flag)

---

## Phase 5: Inventory System

- [ ] Build inventory model (array of item IDs)
- [ ] Build `take` command — pick up items from rooms
- [ ] Build `drop` command — leave items in rooms
- [ ] Build `inventory` / `i` command — list carried items
- [ ] Build `examine` / `x` command — inspect item descriptions
- [ ] Build `use` command — apply item to environment or combine items
- [ ] Build carry limit (if applicable)

---

## Phase 6: State Flags and Puzzles

- [ ] Build world flag system (key-value store)
- [ ] Build conditional room descriptions (based on flags)
- [ ] Build conditional exits (based on flags or items)
- [ ] Build puzzle resolution logic (use item + target = flag change)
- [ ] Build multi-step puzzle chains
- [ ] Build hint system (if applicable)

---

## Phase 7: Response Log and UI

- [ ] Build scrollable response log (DOM)
- [ ] Build styled output (room titles, descriptions, system messages, errors)
- [ ] Build input prompt styling
- [ ] Build mobile-friendly layout (large text, touch targets)
- [ ] Build quick-action bar (directional buttons, common verbs)
- [ ] Build terminal color scheme
- [ ] Ensure accessibility (screen reader friendly, keyboard navigable)

---

## Phase 8: Save and Load

- [ ] Implement MUD save slice (current room, inventory, flags, discovered states)
- [ ] Hook into host `SaveService`
- [ ] Test save/load round-trip
- [ ] Test save migration compatibility

---

## Phase 9: Scene Integration

- [ ] Register MUD scene with host scene manager
- [ ] Implement `enter()` — initialize or restore from save
- [ ] Implement `exit()` — clean up DOM
- [ ] Implement `update()` — process pending commands
- [ ] Implement `render()` — update log display
- [ ] Implement scene completion reporting (structured results to shell)
- [ ] Implement ending unlock triggers
- [ ] Test transition into MUD from host
- [ ] Test transition out of MUD back to host

---

## Phase 10: Content Population

- [ ] Write all room descriptions
- [ ] Write all item descriptions
- [ ] Write all NPC dialogue (if applicable)
- [ ] Write all puzzle hint text
- [ ] Write all ending text
- [ ] Write intro/welcome text
- [ ] Playtest full path from start to completion
- [ ] Fix dead ends, missing connections, unclear puzzles

---

## Phase 11: Polish and Testing

- [ ] Test on desktop (keyboard-only flow)
- [ ] Test on mobile (touch + quick-action flow)
- [ ] Test edge cases (empty inventory use, invalid directions, repeated actions)
- [ ] Test save/load mid-game
- [ ] Test completion and progression integration
- [ ] Performance check (large log history)
- [ ] Proofread all narrative text
- [ ] Final playthrough

---

## Notes

- This to-do expands on Milestone 14 in `TASKS.md`
- The `mud-room-template.md` in `docs/templates/` defines the base room schema
- The MUD is a DOM scene — no Canvas or Phaser dependency
- Phase 0 must be completed before any implementation work begins
