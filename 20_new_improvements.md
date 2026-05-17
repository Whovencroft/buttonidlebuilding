# MUD Deep Audit: 20 New Improvement Suggestions

Based on a deep audit of the codebase, data files, and game design goals, here are 20 new improvement suggestions focused on progression, economy, quest depth, exploration, and the meta-puzzle.

## Economy & Multiplayer Foundation
1. **Shared Merchant Pool (Backend Hook):** The current `mud_merchants.js` uses hardcoded templates per zone. We need to wire merchants to `MudAPI.getMarketplace()` so players buy/sell from a persistent, shared server pool (a core design goal).
2. **Gold Economy Rebalance:** Mobs currently drop 0 gold (only quests give gold). We should add gold drops to mob loot tables based on their power level to make combat a viable economic path.
3. **Item Placement & Loot Tables:** Out of 195 items, 147 are currently unobtainable (not on the ground, not in loot tables, not in quests). We need to distribute these across mob loot tables and room `initial_items`.
4. **Merchant NPC Flags:** There are currently 0 mobs with the `merchant` flag in `mobs.json`. The engine relies on name heuristics ("peddler", "dealer"). We should explicitly flag merchant mobs and assign them specific locations.

## Progression & Combat Depth
5. **Ability Focus Costs:** Abilities in `mud_abilities.js` currently have no `focusCost` defined, meaning they all default to the base cost (10). We should assign varying focus costs based on tier and power.
6. **Endgame Bosses (Zones 80 & 90):** The highest power zones (Zone 80: power ~3000, Zone 90: power ~800) currently have 0 bosses. We need to add pinnacle bosses to these zones for endgame progression.
7. **Death Penalty Tick-Down Fix:** The `death_weakness` flag is set to 24 rounds, but the tick-down logic in `update()` only decrements it if it's an object with a `rounds` property, which it is, but the loop over `worldFlags` might not handle the object structure correctly for expiration. We should verify and robustly test the debuff expiration.
8. **Power Gain Formula Tuning:** The current formula gives 10% of creature power if within ±10% power, but scales up linearly if the creature is stronger. We should add a diminishing return for killing creatures vastly weaker than the player (currently a flat 2% minimum, which could be exploited by farming low-level mobs).

## Quest System & Procedural Content
9. **Procedural Mission Variety:** `mud_missions.js` only generates `hunt` and `fetch` quests. We should add `escort` (move an NPC to a room), `defend` (survive X rounds in a room), and `explore` (visit X new rooms) mission types.
10. **Quest Shop Item Wiring:** The Quest Shop sells a "Treasure Map", "XP Tome", and "Respec Token", but these items have no use logic in `useConsumable` or elsewhere. We need to implement their effects.
11. **Red Herring Quest Cleanup:** 10 out of 35 quests are marked as `red_herring`. While good for the meta-puzzle, we should ensure they still provide some minor reward (e.g., a small amount of QP or a lore item) so players don't feel entirely cheated.
12. **Quest Objective Scaling:** Procedural hunt quests require 1-3 kills. We should scale this based on player power (e.g., high-power players get asked to kill 10-20 mobs for larger rewards).

## Exploration & World Building
13. **Locked Doors & Keys:** There are currently 0 locked doors in `rooms.json`, despite the engine having logic for them. We should add locked doors to gate high-value areas and distribute the corresponding keys in loot or quests.
14. **Hidden Rooms & Secret Exits:** There are 0 hidden or secret rooms. We should add rooms that don't appear in the `exits` list and require specific actions (like the Treasure Map) to reveal.
15. **Ground Item Distribution:** Only 4 rooms out of 550 have `initial_items` on the ground (all in the Training Tower). We should scatter flavor items, lore notes, and minor consumables across the world.
16. **Zone 7-11 Puzzles:** Zones 1-6 have dedicated puzzle logic (`puzzleUseScannerZ2`, etc.), but Zones 7-11 have none. We need to design and implement puzzles for the latter half of the game.

## Meta-Puzzle & Narrative
17. **The "Solve" Moment:** The meta-puzzle (finding the marble) currently lacks a definitive "solve" trigger. We need a system that checks if all 11 clues are found and unlocks the final confrontation with Aldric.
18. **Aldric's Tower Integration:** Aldric's Tower (room 1125) exists, but the `wizard_research` quest needs to explicitly tie into the marble clues, perhaps requiring the player to bring him specific items before he betrays them.
19. **Save Migration & Versioning:** `mud_api.js` and `mud_scene.js` have no save versioning or migration logic. As we add these new features (like shared merchants or new flags), we need a schema version in the save slice to handle old saves gracefully.
20. **Glimmer Sparking Visibility:** When a glimmer sparks, it replaces the attack, but the UI feedback might get lost in combat spam. We should add a dedicated UI toast or persistent log entry when a new ability is permanently learned via sparking.
