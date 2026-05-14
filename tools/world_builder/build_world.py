#!/usr/bin/env python3
"""
build_world.py — CSV Grid → JSON World Builder

Reads all world_*.csv files from the maps/ directory and converts them
into rooms.json and mobs.json for the MUD engine.

Adjacency rules:
  - Cell above    = north exit
  - Cell below    = south exit
  - Cell right    = east exit
  - Cell left     = west exit
  - Diagonals     = northeast, northwest, southeast, southwest

Usage:
  python3 tools/world_builder/build_world.py [--maps-dir DIR] [--output-dir DIR]
"""

import csv
import json
import os
import sys
import glob
import argparse
from pathlib import Path


# ─── Constants ─────────────────────────────────────────────────────────────────

DIRECTIONS = {
    (-1,  0): 'north',
    ( 1,  0): 'south',
    ( 0,  1): 'east',
    ( 0, -1): 'west',
    (-1,  1): 'northeast',
    (-1, -1): 'northwest',
    ( 1,  1): 'southeast',
    ( 1, -1): 'southwest',
}

OPPOSITE = {
    'north': 'south', 'south': 'north',
    'east': 'west', 'west': 'east',
    'northeast': 'southwest', 'southwest': 'northeast',
    'northwest': 'southeast', 'southeast': 'northwest',
    'up': 'down', 'down': 'up',
}

VALID_FLAGS = {'safe', 'dark', 'norecall', 'shop', 'train', 'hidden', 'indoors'}


# ─── Cell Parsing ──────────────────────────────────────────────────────────────

def parse_cell(cell_text):
    """
    Parse a pipe-delimited cell into a room dict.
    Format: ID|NAME|SECTOR|DESC|FLAGS|MOBS|ITEMS|INTERACTABLES|SPECIAL_EXITS|VERTICAL
    """
    cell_text = cell_text.strip()
    if not cell_text:
        return None

    parts = cell_text.split('|')
    if len(parts) < 4:
        return None  # Minimum: ID, NAME, SECTOR, DESC

    # Pad to 10 fields
    while len(parts) < 10:
        parts.append('')

    try:
        vnum = int(parts[0].strip())
    except ValueError:
        print(f"  WARNING: Invalid vnum '{parts[0]}', skipping cell")
        return None

    room = {
        'vnum': vnum,
        'name': parts[1].strip(),
        'sector': parts[2].strip(),
        'description': parts[3].strip().replace('\\n', '\n'),
        'flags': parse_flags(parts[4]),
        'mob_spawns': parse_int_list(parts[5]),
        'initial_items': parse_int_list(parts[6]),
        'interactables': parse_interactables(parts[7]),
        'special_exits': parse_special_exits(parts[8]),
        'vertical': parse_vertical(parts[9]),
        'exits': {},  # Populated by adjacency pass
    }
    return room


def parse_flags(text):
    """Parse comma-separated flags."""
    if not text.strip():
        return []
    return [f.strip() for f in text.split(',') if f.strip() in VALID_FLAGS]


def parse_int_list(text):
    """Parse comma-separated integers."""
    if not text.strip():
        return []
    result = []
    for item in text.split(','):
        item = item.strip()
        if item:
            try:
                result.append(int(item))
            except ValueError:
                pass
    return result


def parse_interactables(text):
    """
    Parse semicolon-separated interactables.
    Format: keyword:description:action
    """
    if not text.strip():
        return []
    result = []
    for entry in text.split(';'):
        parts = entry.strip().split(':')
        if len(parts) >= 2:
            interactable = {
                'keyword': [parts[0].strip()],
                'description': parts[1].strip(),
                'action': parts[2].strip() if len(parts) > 2 else None,
            }
            result.append(interactable)
    return result


def parse_special_exits(text):
    """
    Parse semicolon-separated special exits.
    Format: dir:target_vnum:type:key
    """
    if not text.strip():
        return {}
    result = {}
    for entry in text.split(';'):
        parts = entry.strip().split(':')
        if len(parts) >= 3:
            direction = parts[0].strip()
            try:
                target = int(parts[1].strip())
            except ValueError:
                continue
            exit_type = parts[2].strip() if len(parts) > 2 else 'normal'
            key = parts[3].strip() if len(parts) > 3 else None

            exit_def = {'target_vnum': target}
            if exit_type == 'hidden':
                exit_def['hidden'] = True
                if key and key != 'none':
                    exit_def['reveal_command'] = key
            elif exit_type == 'door':
                if key and key != 'none':
                    exit_def['door'] = {'state': 'closed', 'key_vnum': int(key) if key.isdigit() else None}
            elif exit_type == 'locked':
                exit_def['locked'] = True
                if key and key != 'none':
                    exit_def['door'] = {'state': 'locked', 'key_vnum': int(key) if key.isdigit() else None}
            elif exit_type == 'oneway':
                exit_def['oneway'] = True

            result[direction] = exit_def
    return result


def parse_vertical(text):
    """
    Parse vertical connections.
    Format: up:vnum;down:vnum
    """
    if not text.strip():
        return {}
    result = {}
    for entry in text.split(';'):
        parts = entry.strip().split(':')
        if len(parts) == 2:
            direction = parts[0].strip().lower()
            if direction in ('up', 'down'):
                try:
                    result[direction] = int(parts[1].strip())
                except ValueError:
                    pass
    return result


# ─── Grid Processing ───────────────────────────────────────────────────────────

def load_csv_grid(filepath):
    """
    Load a CSV file into a 2D grid of parsed room dicts.
    Returns: (grid, room_positions) where room_positions maps vnum → (row, col)
    """
    grid = []
    room_positions = {}

    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        for row_idx, row in enumerate(reader):
            grid_row = []
            for col_idx, cell in enumerate(row):
                room = parse_cell(cell)
                if room:
                    room_positions[room['vnum']] = (row_idx, col_idx)
                grid_row.append(room)
            grid.append(grid_row)

    return grid, room_positions


def compute_adjacency_exits(grid):
    """
    For each room in the grid, compute exits based on adjacent non-empty cells.
    """
    rows = len(grid)

    for row_idx in range(rows):
        cols = len(grid[row_idx])
        for col_idx in range(cols):
            room = grid[row_idx][col_idx]
            if not room:
                continue

            for (dr, dc), direction in DIRECTIONS.items():
                nr, nc = row_idx + dr, col_idx + dc
                if 0 <= nr < rows and 0 <= nc < len(grid[nr]):
                    neighbor = grid[nr][nc]
                    if neighbor:
                        # Don't override special exits
                        if direction not in room.get('special_exits', {}):
                            room['exits'][direction] = neighbor['vnum']


def build_rooms_from_grids(maps_dir):
    """
    Load all world_*.csv files, compute adjacency, and return a unified rooms dict.
    """
    all_rooms = {}
    csv_files = sorted(glob.glob(os.path.join(maps_dir, 'world_*.csv')))

    if not csv_files:
        print(f"  No world_*.csv files found in {maps_dir}")
        return all_rooms

    for filepath in csv_files:
        filename = os.path.basename(filepath)
        print(f"  Processing: {filename}")

        grid, positions = load_csv_grid(filepath)
        compute_adjacency_exits(grid)

        # Flatten grid into rooms dict
        for row in grid:
            for room in row:
                if room:
                    vnum = room['vnum']
                    if vnum in all_rooms:
                        print(f"    WARNING: Duplicate vnum {vnum} in {filename}, overwriting")
                    all_rooms[vnum] = room

    # Second pass: apply vertical connections and special exits
    for vnum, room in all_rooms.items():
        # Merge vertical connections into exits
        for direction, target in room.get('vertical', {}).items():
            if target in all_rooms:
                room['exits'][direction] = target
            else:
                print(f"    WARNING: Room {vnum} vertical {direction}→{target} target not found")

        # Merge special exits into exits (overriding adjacency)
        for direction, exit_def in room.get('special_exits', {}).items():
            room['exits'][direction] = exit_def

    # Third pass: create reverse exits for cross-file connections
    # If room A has a special exit to room B, room B should have a return exit to A
    for vnum, room in all_rooms.items():
        for direction, exit_def in room.get('special_exits', {}).items():
            target_vnum = exit_def.get('target_vnum') if isinstance(exit_def, dict) else exit_def
            if target_vnum and target_vnum in all_rooms:
                target_room = all_rooms[target_vnum]
                reverse_dir = OPPOSITE.get(direction)
                if reverse_dir and reverse_dir not in target_room['exits']:
                    target_room['exits'][reverse_dir] = vnum
                elif reverse_dir:
                    # Direction is occupied — try 'down' as portal fallback
                    for fallback in ['down', 'up', 'west', 'north']:
                        if fallback not in target_room['exits']:
                            target_room['exits'][fallback] = vnum
                            break
        # Also handle vertical connections
        for direction, target in room.get('vertical', {}).items():
            if target in all_rooms:
                target_room = all_rooms[target]
                reverse_dir = OPPOSITE.get(direction)
                if reverse_dir and reverse_dir not in target_room['exits']:
                    target_room['exits'][reverse_dir] = vnum

    return all_rooms


# ─── Sector Processing ─────────────────────────────────────────────────────────

def load_sectors(maps_dir):
    """
    Load sectors.csv and return a dict of sector definitions.
    Format: SECTOR_ID,SECTOR_NAME,MOB_POOL,LEVEL_RANGE,DESCRIPTION
    """
    sectors = {}
    filepath = os.path.join(maps_dir, 'sectors.csv')

    if not os.path.exists(filepath):
        print("  No sectors.csv found, skipping sector mob distribution")
        return sectors

    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = next(reader, None)  # Skip header
        for row in reader:
            if len(row) < 5:
                continue
            sector_id = row[0].strip()
            sectors[sector_id] = {
                'name': row[1].strip(),
                'mob_pool': parse_int_list(row[2]),
                'level_range': row[3].strip(),
                'description': row[4].strip(),
            }

    print(f"  Loaded {len(sectors)} sector definitions")
    return sectors


def distribute_sector_mobs(rooms, sectors):
    """
    For rooms that have no explicit mob_spawns, assign mobs from their
    sector's mob_pool using a round-robin distribution.
    """
    import random
    random.seed(42)  # Deterministic for reproducibility

    # Group rooms by sector
    sector_rooms = {}
    for vnum, room in rooms.items():
        sector = room.get('sector', '')
        if sector not in sector_rooms:
            sector_rooms[sector] = []
        sector_rooms[sector].append(vnum)

    # Distribute mobs
    for sector_id, sector_def in sectors.items():
        if sector_id not in sector_rooms:
            continue
        mob_pool = sector_def['mob_pool']
        if not mob_pool:
            continue

        room_vnums = sector_rooms[sector_id]
        # Only add to rooms without explicit spawns and without 'safe' flag
        eligible = [v for v in room_vnums
                    if not rooms[v].get('mob_spawns')
                    and 'safe' not in rooms[v].get('flags', [])]

        if not eligible:
            continue

        # Distribute: each eligible room gets 0-2 mobs from the pool
        for vnum in eligible:
            count = random.randint(0, 2)
            if count > 0:
                chosen = random.choices(mob_pool, k=count)
                rooms[vnum]['mob_spawns'] = chosen


# ─── Mob Loading ───────────────────────────────────────────────────────────────

def load_mobs_csv(maps_dir):
    """
    Load mobs.csv and return a dict of mob definitions.
    Format: VNUM,NAME,DESC,HOSTILE,HP,ATTACK,DEFENSE,LOOT,RESPAWN,DIALOGUE,FLAGS
    """
    mobs = {}
    filepath = os.path.join(maps_dir, 'mobs.csv')

    if not os.path.exists(filepath):
        print("  No mobs.csv found, using existing mobs.json only")
        return mobs

    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = next(reader, None)  # Skip header
        for row in reader:
            if len(row) < 7:
                continue
            try:
                vnum = int(row[0].strip())
            except ValueError:
                continue

            mobs[vnum] = {
                'vnum': vnum,
                'name': row[1].strip(),
                'description': row[2].strip(),
                'hostile': row[3].strip().lower() == 'true',
                'stats': {
                    'hp': int(row[4].strip() or 100),
                    'max_hp': int(row[4].strip() or 100),
                    'attack': int(row[5].strip() or 10),
                    'defense': int(row[6].strip() or 5),
                },
                'loot_table': parse_int_list(row[7]) if len(row) > 7 else [],
                'respawn': int(row[8].strip() or 60) if len(row) > 8 else 60,
                'dialogue': parse_dialogue(row[9]) if len(row) > 9 else [],
                'flags': [f.strip() for f in row[10].split(',')] if len(row) > 10 and row[10].strip() else [],
            }

    print(f"  Loaded {len(mobs)} mob definitions from mobs.csv")
    return mobs


def parse_dialogue(text):
    """Parse semicolon-separated dialogue lines into dialogue array."""
    if not text.strip():
        return []
    return [{'text': line.strip(), 'conditions': []} for line in text.split(';') if line.strip()]


# ─── Output Generation ─────────────────────────────────────────────────────────

def room_to_json(room):
    """Convert internal room dict to the engine's expected JSON format."""
    # Determine zone from sector (map sector names to zone numbers)
    output = {
        'vnum': room['vnum'],
        'zone': room.get('zone', 0),
        'name': room['name'],
        'description': room['description'],
        'exits': room['exits'],
    }

    if room.get('interactables'):
        output['interactables'] = room['interactables']

    if room.get('initial_items'):
        output['initial_items'] = room['initial_items']

    if room.get('mob_spawns'):
        output['mob_spawns'] = room['mob_spawns']

    if room.get('flags'):
        output['flags'] = room['flags']

    return output


def assign_zones(rooms, sectors):
    """
    Assign zone numbers to rooms based on their sector.
    Each unique sector gets a sequential zone number.
    """
    sector_to_zone = {}
    next_zone = 0

    # Sort sectors for deterministic assignment
    all_sectors = sorted(set(r.get('sector', '') for r in rooms.values()))
    for sector in all_sectors:
        sector_to_zone[sector] = next_zone
        next_zone += 1

    for room in rooms.values():
        room['zone'] = sector_to_zone.get(room.get('sector', ''), 0)

    return sector_to_zone


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Build MUD world from CSV grids')
    parser.add_argument('--maps-dir', default='tools/world_builder/maps',
                        help='Directory containing world_*.csv files')
    parser.add_argument('--output-dir', default='data/mud',
                        help='Output directory for rooms.json and mobs.json')
    parser.add_argument('--merge-existing', action='store_true',
                        help='Merge with existing JSON files instead of replacing')
    args = parser.parse_args()

    # Resolve paths relative to project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    maps_dir = project_root / args.maps_dir
    output_dir = project_root / args.output_dir

    print(f"MUD World Builder")
    print(f"  Maps directory: {maps_dir}")
    print(f"  Output directory: {output_dir}")
    print()

    # Ensure directories exist
    maps_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load and process
    print("Loading CSV grids...")
    rooms = build_rooms_from_grids(str(maps_dir))
    print(f"  Total rooms from CSV: {len(rooms)}")
    print()

    print("Loading sectors...")
    sectors = load_sectors(str(maps_dir))
    print()

    print("Distributing sector mobs...")
    distribute_sector_mobs(rooms, sectors)
    print()

    print("Assigning zones...")
    sector_to_zone = assign_zones(rooms, sectors)
    for sector, zone in sorted(sector_to_zone.items(), key=lambda x: x[1]):
        count = sum(1 for r in rooms.values() if r.get('sector') == sector)
        print(f"  Zone {zone}: {sector} ({count} rooms)")
    print()

    print("Loading mobs...")
    csv_mobs = load_mobs_csv(str(maps_dir))
    print()

    # Merge with existing if requested
    existing_rooms = {}
    existing_mobs = {}
    if args.merge_existing:
        rooms_path = output_dir / 'rooms.json'
        mobs_path = output_dir / 'mobs.json'
        if rooms_path.exists():
            with open(rooms_path, 'r') as f:
                existing_rooms = json.load(f)
            print(f"  Merging with {len(existing_rooms)} existing rooms")
        if mobs_path.exists():
            with open(mobs_path, 'r') as f:
                existing_mobs = json.load(f)
            print(f"  Merging with {len(existing_mobs)} existing mobs")

    # Build final output
    final_rooms = {}
    if args.merge_existing:
        final_rooms.update(existing_rooms)

    for vnum, room in rooms.items():
        final_rooms[str(vnum)] = room_to_json(room)

    final_mobs = {}
    if args.merge_existing:
        final_mobs.update(existing_mobs)

    for vnum, mob in csv_mobs.items():
        final_mobs[str(vnum)] = mob

    # Write output
    rooms_out = output_dir / 'rooms.json'
    mobs_out = output_dir / 'mobs.json'

    with open(rooms_out, 'w') as f:
        json.dump(final_rooms, f, indent=2)
    print(f"  Wrote {len(final_rooms)} rooms to {rooms_out}")

    with open(mobs_out, 'w') as f:
        json.dump(final_mobs, f, indent=2)
    print(f"  Wrote {len(final_mobs)} mobs to {mobs_out}")

    print()
    print("Done!")


if __name__ == '__main__':
    main()
