# MUD World CSV Format Specification

## Overview

The world CSV is a grid-based map where **each cell represents a room**. Physical adjacency in the grid determines exits automatically:

- Cell above = **north** exit
- Cell below = **south** exit
- Cell to the right = **east** exit
- Cell to the left = **west** exit
- Diagonal cells = **northeast**, **northwest**, **southeast**, **southwest**

Empty cells are walls/void — no room exists there, and no exit is generated toward them.

## File Structure

Each CSV file represents one **floor/layer** of the world. Multiple files can represent vertical connections (up/down).

**Naming convention:** `world_<sector>_<floor>.csv`

Example: `world_nexus_f1.csv`, `world_shattered_crown_f1.csv`, `world_shattered_crown_f2.csv`

## Cell Format

Each non-empty cell contains a **pipe-delimited** (`|`) record with the following fields:

```
ID|NAME|SECTOR|DESC|FLAGS|MOBS|ITEMS|INTERACTABLES|SPECIAL_EXITS|VERTICAL
```

### Field Definitions

| # | Field | Required | Description |
|---|-------|----------|-------------|
| 1 | ID | Yes | Unique room vnum (integer). Must be globally unique across all CSV files. |
| 2 | NAME | Yes | Room name displayed to the player. |
| 3 | SECTOR | Yes | Sector/zone tag for mob roaming and grouping (e.g., `forest`, `city`, `dungeon`). |
| 4 | DESC | Yes | Full room description shown on `look`. Use `\n` for line breaks within the cell. |
| 5 | FLAGS | No | Comma-separated flags: `safe`, `dark`, `norecall`, `shop`, `train`, `hidden`, `indoors`. |
| 6 | MOBS | No | Comma-separated mob vnums that spawn here (e.g., `1001,1002`). |
| 7 | ITEMS | No | Comma-separated item vnums found here (e.g., `2001`). |
| 8 | INTERACTABLES | No | Semicolon-separated interactables. Format: `keyword:description:action` (e.g., `lever:A rusty lever on the wall:flag:lever_pulled`). |
| 9 | SPECIAL_EXITS | No | Override or add non-standard exits. Format: `dir:target_vnum:type:key` (e.g., `north:5001:hidden:search`, `east:6001:door:iron_key`). |
| 10 | VERTICAL | No | Vertical connections. Format: `up:target_vnum` or `down:target_vnum` (e.g., `up:4050`, `down:4001`). |

### Field Details

**FLAGS:**
- `safe` — No combat allowed in this room
- `dark` — Requires light source to see description
- `norecall` — Cannot use recall from this room
- `shop` — Room has a shop NPC
- `train` — Room is a Training Hall
- `hidden` — Room doesn't appear on maps
- `indoors` — Room is indoors (flavor)

**SPECIAL_EXITS:**
- `hidden` type — Exit only appears after using a specific command (the key field)
- `door` type — Exit requires an item key to open
- `locked` type — Exit is locked, requires key item
- `oneway` type — Exit only goes one direction (no return)
- If a SPECIAL_EXIT overrides a direction that would be auto-generated from adjacency, the special version takes priority.

**VERTICAL:**
- Points to a room vnum on another floor/layer
- The target room should have a reciprocal vertical connection back
- Multiple vertical exits allowed: `up:4050;down:4001`

## Sector Definitions

Sectors are defined in a separate file: `sectors.csv`

```
SECTOR_ID,SECTOR_NAME,MOB_POOL,LEVEL_RANGE,DESCRIPTION
```

| Field | Description |
|-------|-------------|
| SECTOR_ID | Short identifier matching the SECTOR field in room cells |
| SECTOR_NAME | Display name for the sector |
| MOB_POOL | Comma-separated mob vnums that can roam this sector |
| LEVEL_RANGE | Min-max power range for mobs (e.g., `50-200`) |
| DESCRIPTION | Flavor text for the sector |

Mobs listed in the sector's MOB_POOL will be randomly distributed across rooms in that sector (in addition to any room-specific mob spawns).

## Mob Definitions

Mobs are defined in: `mobs.csv`

```
VNUM,NAME,DESC,HOSTILE,HP,ATTACK,DEFENSE,LOOT,RESPAWN,DIALOGUE,FLAGS
```

| Field | Description |
|-------|-------------|
| VNUM | Unique mob identifier |
| NAME | Display name |
| DESC | Description shown on `look` |
| HOSTILE | `true` or `false` |
| HP | Hit points |
| ATTACK | Attack stat |
| DEFENSE | Defense stat |
| LOOT | Comma-separated item vnums (drop table) |
| RESPAWN | Respawn time in seconds (0 = never) |
| DIALOGUE | Semicolon-separated dialogue lines |
| FLAGS | Comma-separated: `npc`, `boss`, `roaming`, `stationary` |

## Example Cell

```
1001|King's Road — Southern Gate|shattered_crown|A wide cobblestone road stretches northward toward distant castle spires. The southern gate stands behind you, its iron portcullis raised. Guards in silver tabards watch travelers pass.\nTorch sconces line the walls, casting dancing shadows.|safe|1101|2001|gate:The iron portcullis is raised, allowing passage. Guards nod as you pass.:none|south:1:door:none|
```

## Example Grid (3x3)

```csv
1003|Forest Clearing|forest|A small clearing...||| ||,1001|King's Road North|shattered_crown|The road continues...||||,
1002|Forest Edge|forest|Trees thin here...||||,1001|King's Road — Southern Gate|shattered_crown|A wide road...|safe|1101|2001||,1004|Eastern Field|shattered_crown|Rolling hills...||||
,,1005|Farmstead|shattered_crown|A small farm...||||,
```

In this grid:
- Room 1001 (center) has exits: north (to 1001 Road North), west (to 1002 Forest Edge), east (to 1004 Eastern Field), south (to 1005 Farmstead), northwest (to 1003 Forest Clearing)
- Room 1003 (top-left) has exits: southeast (to 1001), south (to 1002), east (to 1001 Road North)

## Build Script Usage

```bash
python3 tools/world_builder/build_world.py
```

This reads all `world_*.csv` files and `sectors.csv` from the `tools/world_builder/maps/` directory and outputs:
- `data/mud/rooms.json` — All room definitions with computed exits
- `data/mud/mobs.json` — All mob definitions (merged with existing)

## Tips for Editing

1. **Use a spreadsheet app** (Google Sheets, Excel, LibreOffice Calc) — each cell is visually a room on the map.
2. **Leave cells empty** to create walls, corridors, and irregular shapes.
3. **Use consistent sector tags** across adjacent rooms to define roaming zones.
4. **Vertical connections** link between separate CSV files (floors).
5. **Hidden rooms** can be placed anywhere — mark the exit as `hidden` in the connecting room's SPECIAL_EXITS field.
6. **One-way exits** create maze-like areas or trap rooms.
