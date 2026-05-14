#!/usr/bin/env python3
"""
fix_connections.py — Post-process rooms.json to add cross-floor vertical connections.

The expansion floors (f2) and training grounds need connections to their
parent zones. This script adds bidirectional up/down exits.
"""

import json

ROOMS_PATH = '/home/ubuntu/buttonidlebuilding/data/mud/rooms.json'

# Connections to add: (source_vnum, direction, target_vnum)
# Each pair creates a bidirectional link
CONNECTIONS = [
    # Neon Grid f1 -> f2 (room 2050 connects down to 2100)
    (2050, 'down', 2100),
    # Midnight Rain f1 -> f2 (room 3050 connects down to 3100)
    (3050, 'down', 3100),
    # Blood Chrome f1 -> f2 (room 4050 connects down to 4100)
    (4050, 'down', 4100),
    # Ethereal Drift f1 -> f2 (room 5040 connects down to 5100)
    (5040, 'down', 5100),
    # Forgotten Epoch f1 -> f2 (room 6050 connects down to 6100)
    (6050, 'down', 6100),
    # Training Grounds connects from Nexus room 15 (training hall in nexus)
    (15, 'down', 8001),
]

OPPOSITE = {
    'north': 'south', 'south': 'north',
    'east': 'west', 'west': 'east',
    'up': 'down', 'down': 'up',
}


def main():
    with open(ROOMS_PATH, 'r') as f:
        data = json.load(f)

    added = 0
    for src_vnum, direction, tgt_vnum in CONNECTIONS:
        src_key = str(src_vnum)
        tgt_key = str(tgt_vnum)

        if src_key not in data:
            # Try nearby rooms if exact vnum doesn't exist
            for offset in range(0, 10):
                alt = str(src_vnum + offset)
                if alt in data:
                    src_key = alt
                    break
                alt = str(src_vnum - offset)
                if alt in data:
                    src_key = alt
                    break
            else:
                print(f"  WARNING: Source room {src_vnum} not found, skipping")
                continue

        if tgt_key not in data:
            print(f"  WARNING: Target room {tgt_vnum} not found, skipping")
            continue

        # Add forward connection
        data[src_key]['exits'][direction] = tgt_vnum
        # Add reverse connection
        reverse = OPPOSITE.get(direction, 'up')
        data[tgt_key]['exits'][reverse] = int(src_key)
        added += 1
        print(f"  Connected room {src_key} ({data[src_key]['name']}) "
              f"<-> room {tgt_key} ({data[tgt_key]['name']}) via {direction}/{reverse}")

    with open(ROOMS_PATH, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"\nAdded {added} bidirectional connections.")


if __name__ == '__main__':
    main()
