# MUD Scene — Design Document

## 1. Core Concept and Setting
The MUD scene is a massive, multi-genre text adventure that players transition into after the marble game. The overarching narrative hook is the **"Marble Chase"** — the player is always one step behind the marble, which appears to be fleeing through the world. Players might hear NPCs mention a round object rolling by, or see a small hole in a puzzle door that the marble squeezed through.

The world is a blend of genres and tones, organized into distinct, physically connected zones radiating from a central hub. Planned genres include:
- High Fantasy
- Sci-Fi
- Film Noir
- 80s Action Flick
- Anime
- Historical

## 2. Multiplayer and Server Architecture
The MUD features **asynchronous multiplayer** with a persistent world state.
- **Server:** A lightweight backend hosted on Railway.
- **Accounts:** Players create a username and password (encrypted) to log in via the existing browser interface.
- **Interaction:** Players cannot interact directly in real-time. Instead, they interact asynchronously (similar to *Dark Souls*):
  - Leaving notes and messages for others to find.
  - Viewing "ghosts" or visions of other players' past actions.
  - Trading through a shared, global merchant pool where item prices are set by the selling player.
- **Persistence:** The world lives on even when no one is connected (e.g., mob respawns, global market).
- **Moderation:** Automated moderation tools will be implemented to filter profanity, racism, and inappropriate notes.

## 3. Gameplay and Combat
The gameplay is a hybrid of puzzle-solving and heavy combat.
- **Puzzles:** Solving puzzles is the primary way to progress through the world and chase the marble.
- **Combat:** Combat is a core pillar, heavily inspired by *CircleMUD*. It serves as the means to become strong enough to survive the zones and reach the puzzles.
- **Command Style:** A hybrid approach combining full parser commands (e.g., `take sword`) with shorthand/menu commands (e.g., `n`, `s`, `i`, `eq`).
- **Pacing:** Open-ended exploration with no time limits. Players can wander anywhere, though high-level zones will be lethal to underprepared characters.

## 4. Character Progression and Classes
Progression eschews traditional numbered levels in favor of a power progression system (inspired by *Dragon Ball* MUDs) where players unlock new abilities.

Players arrive as nameless visitors and choose their race/species (which fit the various zone themes). 

There are **4 base classes** (the classic quartet) that specialize based on the genre/zone the player leans toward:
1. **Fighter** (e.g., Knight in Fantasy, Detective in Noir, Soldier in Historical, Mech Pilot in Sci-Fi)
2. **Mage**
3. **Rogue**
4. **Cleric/Healer**

## 5. Items and Economy
- **Inventory:** Maximum of 99 items.
- **Equipment:** *CircleMUD*-style wear slots (head, body, arms, legs, hands, feet, weapon, shield, etc.).
- **Consumables:** Standard MUD consumables (healing, buffs, food/drink) are present.
- **Rarity:** Items have explicit rarity tiers (Common, Uncommon, Rare, Legendary, etc.).
- **Economy:** The shared marketplace allows players to buy and sell items, with prices fixed by the selling player.

## 6. Narrative and Writing
- **Authorship:** Writing will be a collaborative effort between the project owner and AI.
- **Style:** The writing style will adapt to the specific area, tone, and genre of the current zone.
- **Room Descriptions:** Descriptions will remain a consistent length upon revisit, but will dynamically update based on quest progress or world state.
- **Endings:** There are multiple endings. The ending received depends on which zone the player finishes in, which puzzles they completed, and their chosen class. All endings ultimately result in the player catching the marble.

## 7. Mobile and Accessibility
- **UI:** The interface will feature context-sensitive quick-action buttons that change per room.
- **Readability:** Text will be large and readable by default, starting with a classic black background and white text.
- **Customization:** Players will have settings to adjust font size, font family, and color scheme.
