# MUD Parser and Command System Design

## 1. Overview

The MUD uses a hybrid command system designed to accommodate both traditional keyboard players and mobile users. It combines a natural language parser with context-sensitive quick-action buttons.

## 2. The Parser

The parser is responsible for taking raw string input from the user, tokenizing it, identifying the intent (verb), and extracting the targets (nouns/prepositions).

### 2.1 Tokenization and Normalization
1. **Lowercase:** Convert all input to lowercase.
2. **Punctuation Removal:** Strip periods, commas, and exclamation marks.
3. **Stop Word Removal:** Remove common articles and prepositions that don't affect meaning (e.g., "the", "a", "an", "to", "at").
4. **Tokenization:** Split the remaining string by spaces into an array of tokens.

*Example:* `Look at the glowing sword` → `["look", "glowing", "sword"]`

### 2.2 Verb Resolution
The first token is evaluated against a dictionary of verbs and their aliases.

| Primary Verb | Aliases | Action |
|---|---|---|
| `go` | `walk`, `move`, `head` | Move to an adjacent room |
| `look` | `l`, `examine`, `x`, `read` | Inspect a room, item, or mob |
| `take` | `get`, `grab`, `pick` | Move an item from room to inventory |
| `drop` | `leave`, `discard` | Move an item from inventory to room |
| `inventory` | `i`, `inv`, `bag` | List carried items |
| `equipment` | `eq`, `worn` | List equipped items |
| `wear` | `equip`, `wield`, `put` | Equip an item from inventory |
| `remove` | `unequip`, `takeoff` | Unequip an item to inventory |
| `use` | `activate`, `pull`, `push` | Interact with an object or puzzle |
| `combine` | `mix`, `join` | Combine two items in inventory |
| `attack` | `kill`, `hit`, `fight` | Initiate combat with a mob |
| `flee` | `run`, `escape` | Attempt to escape combat |
| `write` | `note`, `leave` | Leave an asynchronous message |
| `help` | `?`, `commands` | Display available commands |

### 2.3 Target Resolution
Tokens following the verb are evaluated to find the target. The parser checks the current room's interactables, visible items, visible mobs, and the player's inventory.

*Example:* `take glowing sword`
1. Verb: `take`
2. Target string: `"glowing sword"`
3. Resolution: Search room items for an item with keywords matching "glowing" and "sword".

## 3. Combat System (CircleMUD Style)

Combat is initiated via the `attack [target]` command or automatically if an aggressive mob is in the room.

### 3.1 The Combat Loop
Once combat begins, the game enters a "combat state."
- **Tick Rate:** Combat resolves in "rounds" occurring every 2.5 seconds (real-time).
- **Auto-Attack:** The player and the mob automatically exchange basic attacks each round based on their stats and equipped weapons.
- **Active Commands:** During combat, the player can input commands to use abilities, consume items, or flee. These actions occur immediately, independent of the auto-attack tick.

### 3.2 Combat Output
Combat output is terse to prevent log spam.
- `You slash the Undead Guard for 12 damage.`
- `The Undead Guard bashes you for 8 damage.`
- `[Ability] You shield bash the Undead Guard, stunning it!`

## 4. Mobile Quick-Action UI

To support mobile play, the UI includes a dynamic button bar below the text log.

### 4.1 Persistent Buttons
- **Compass Rose:** A 3x3 grid or D-pad layout for N, S, E, W, U, D.
- **Core Actions:** `Look`, `Inventory`, `Equipment`.

### 4.2 Context-Sensitive Buttons
When the player enters a room or looks at an object, the UI generates temporary buttons based on available interactions.
- If a mob is present: `[Attack Wraith]`
- If an item is present: `[Take Sword]`
- If a puzzle element is present: `[Rotate Statue]`
- During combat: `[Flee]`, `[Use Potion]`, `[Ability: Shield Bash]`

These buttons simply inject the corresponding text command into the parser and execute it, ensuring parity between UI clicks and typed commands.
