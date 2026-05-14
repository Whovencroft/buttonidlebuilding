#!/usr/bin/env python3
"""
generate_expansions.py — Additional areas to bring the world to 500+ rooms.

Adds:
- Shattered Crown Dungeon (floor 2) — 30 rooms
- Neon Grid Underground (floor 2) — 25 rooms
- Blood & Chrome Bunker Complex (floor 2) — 25 rooms
- Midnight Rain Catacombs (floor 2) — 25 rooms
- Ethereal Drift Deep Void (floor 2) — 20 rooms
- Forgotten Epoch Lost Civilizations (floor 2) — 25 rooms

Total addition: ~150 rooms (bringing total to 500+)
"""

import csv
import os
from pathlib import Path

MAPS_DIR = Path(__file__).parent / 'maps'


def write_csv(filename, grid):
    """Write a 2D grid of cell strings to a CSV file."""
    filepath = MAPS_DIR / filename
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        for row in grid:
            writer.writerow(row)
    count = sum(1 for row in grid for cell in row if cell.strip())
    print(f"  {filename}: {count} rooms")
    return count


def cell(vnum, name, sector, desc, flags='', mobs='', items='', interact='', special='', vertical=''):
    """Build a pipe-delimited cell string."""
    desc = desc.replace('\n', '\\n')
    return f"{vnum}|{name}|{sector}|{desc}|{flags}|{mobs}|{items}|{interact}|{special}|{vertical}"


# ═══════════════════════════════════════════════════════════════════════════════
# SHATTERED CROWN — Dungeon Floor (beneath the castle)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_crown_dungeon():
    """Deep dungeon beneath the Shattered Crown castle."""
    grid = [[''] * 8 for _ in range(8)]
    v = 1100

    rooms = [
        (0, 3, "Dungeon Descent — Top", "Stone stairs spiral downward into the earth. The air grows cold and damp. Torches gutter."),
        (0, 4, "Dungeon — Guard Room", "An abandoned guard post. A table with cards still dealt. The guards left in a hurry."),
        (1, 2, "Dungeon — West Cells", "Iron-barred cells line the corridor. Scratching sounds come from the darkest one."),
        (1, 3, "Dungeon — Central Hall", "A wide corridor with vaulted ceilings. Water drips from above. Chains hang from the walls."),
        (1, 4, "Dungeon — East Cells", "More cells. One has been broken open from the inside. The bars are bent outward."),
        (1, 5, "Dungeon — Torture Chamber", "Implements of pain hang on the walls. A rack, an iron maiden, thumbscrews. All well-maintained."),
        (2, 1, "Oubliette — Edge", "A pit in the floor drops into darkness. A rope ladder hangs over the edge. It looks frayed."),
        (2, 2, "Crypt — Entrance", "Stone sarcophagi line the walls. The names are those of ancient kings. One lid is askew."),
        (2, 3, "Crypt — Central Chamber", "The largest crypt. A single ornate coffin on a raised platform. Candles burn with blue flame."),
        (2, 4, "Crypt — East Wing", "More tombs. These are older. The inscriptions are in a dead language."),
        (2, 5, "Secret Laboratory", "Hidden behind a false tomb. Alchemical equipment and forbidden texts. Someone studies necromancy."),
        (3, 1, "Oubliette — Bottom", "The bottom of the pit. Bones and forgotten prisoners. A tunnel leads deeper."),
        (3, 2, "Underground Lake — Shore", "A vast underground lake. The water is perfectly still and black. Something glows in the depths."),
        (3, 3, "Underground Lake — Island", "A small island in the lake. A stone chest sits here, sealed with magical wards."),
        (3, 4, "Fungal Cavern", "Massive mushrooms grow here, some taller than a person. The air is thick with spores."),
        (3, 5, "Crystal Cave", "Natural crystals grow from every surface, casting rainbow light. Beautiful and disorienting."),
        (4, 2, "Dragon's Lair — Approach", "The tunnel widens. Scorch marks blacken the walls. The temperature rises sharply."),
        (4, 3, "Dragon's Lair — Hoard", "Mountains of gold and treasure. A massive shape breathes in the darkness beyond."),
        (4, 4, "Dragon's Lair — Nest", "Enormous eggs sit in a nest of melted gold. The dragon mother is never far."),
        (5, 2, "Dwarven Ruins — Gate", "Ancient dwarven construction. The stonework is flawless despite its age. Runes glow faintly."),
        (5, 3, "Dwarven Ruins — Forge", "A forge that still burns with magical fire. Dwarven tools lie ready. The smiths are long gone."),
        (5, 4, "Dwarven Ruins — Treasury", "The dwarven vault. Most has been looted. But the deepest chamber remains sealed."),
        (5, 5, "Dwarven Ruins — Throne Room", "A stone throne sized for a dwarf king. The crown still sits on the seat, waiting."),
        (6, 3, "The Sealed Door", "A door of black metal covered in warning runes. Every language says the same thing: DO NOT OPEN."),
        (6, 4, "Beyond the Seal", "Whatever was sealed away is gone. Only claw marks on the walls remain. Very large claw marks."),
    ]

    for row, col, name, desc in rooms:
        flags = 'dark' if 'Lair' in name or 'Oubliette' in name else ''
        vert = 'up:1045' if v == 1100 else ''  # Connect to castle dungeon entrance
        grid[row][col] = cell(v, name, 'shattered_crown', desc, flags, '', '', '', '', vert)
        v += 1

    return write_csv('world_shattered_crown_f2.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# NEON GRID — Deep Net (virtual reality sub-layer)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_neon_deep():
    """The Deep Net — virtual reality layer beneath Neon Grid."""
    grid = [[''] * 7 for _ in range(7)]
    v = 2100

    rooms = [
        (0, 3, "Deep Net — Access Point", "You jack in. Reality dissolves into data streams. The digital world renders around you in wireframe."),
        (1, 2, "Data Highway — West", "A river of pure information flows past. Packets of data zip by like glowing fish."),
        (1, 3, "Data Highway — Central", "The main data artery. Traffic is heavy. Firewalls loom like fortress walls in the distance."),
        (1, 4, "Data Highway — East", "The highway branches. One path leads to corporate servers. The other to the dark net."),
        (2, 1, "Abandoned Server — Lobby", "A derelict virtual space. Corrupted textures and broken geometry. Someone lived here once."),
        (2, 2, "Abandoned Server — Core", "The server's processing core. Data ghosts flicker — echoes of deleted programs."),
        (2, 3, "The Firewall — Exterior", "A massive wall of code blocks the path. ICE programs patrol its surface like sharks."),
        (2, 4, "The Firewall — Breach", "A hole in the firewall. Someone punched through. The edges still spark with broken code."),
        (2, 5, "Corporate Server — Outer", "Beyond the firewall. Clean, sterile virtual architecture. Everything is monitored."),
        (3, 1, "Dark Net — Entry", "The other path. No rules here. The geometry is non-Euclidean. Viruses swim freely."),
        (3, 2, "Dark Net — Market", "A black market in cyberspace. Stolen data, illegal programs, digital weapons."),
        (3, 3, "Dark Net — Arena", "A virtual combat arena. Programs fight to the death. Spectators bet in cryptocurrency."),
        (3, 4, "Corporate Server — Vault", "The data vault. Encrypted files worth billions. The security here is lethal."),
        (3, 5, "Corporate Server — AI Chamber", "The corporate AI's home. It manifests as a perfect geometric shape. It sees you."),
        (4, 2, "Virus Nest", "A corrupted zone where viruses breed. The code here is infectious. Don't stay long."),
        (4, 3, "The Archive", "A vast library of all human knowledge, digitized. Accessible to those who can find it."),
        (4, 4, "Ghost in the Machine", "A sentient program that escaped deletion. It hides here, afraid and angry."),
        (5, 2, "The Void — Digital", "Where deleted data goes. Fragments of destroyed files drift like digital snow."),
        (5, 3, "The Void — Core", "The deepest layer. The original code of the network is visible here. The foundation of everything."),
        (5, 4, "The Backdoor", "A hidden exit point. It leads somewhere that shouldn't exist. A developer's secret."),
    ]

    for row, col, name, desc in rooms:
        flags = ''
        if 'Market' in name:
            flags = 'shop'
        elif 'Archive' in name:
            flags = 'safe'
        grid[row][col] = cell(v, name, 'neon_grid', desc, flags)
        v += 1

    return write_csv('world_neon_grid_f2.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# BLOOD & CHROME — Underground Bunker Complex
# ═══════════════════════════════════════════════════════════════════════════════

def generate_chrome_bunker():
    """Underground military bunker complex."""
    grid = [[''] * 7 for _ in range(7)]
    v = 4100

    rooms = [
        (0, 3, "Bunker — Blast Door", "A massive blast door, partially open. The hydraulics have failed. You squeeze through."),
        (1, 2, "Bunker — Decontamination", "Chemical showers and UV lights. A sign reads: 'ALL PERSONNEL MUST DECONTAMINATE.'"),
        (1, 3, "Bunker — Reception", "A security desk with shattered monitors. Bullet holes in the wall behind it."),
        (1, 4, "Bunker — Armory", "Weapon racks, mostly empty. What remains is experimental. Serial numbers filed off."),
        (2, 1, "Bunker — Barracks", "Rows of bunks. Some still have personal effects. Photos of families. Letters never sent."),
        (2, 2, "Bunker — Mess Hall", "A cafeteria frozen in time. Trays of petrified food. The vending machine still works somehow."),
        (2, 3, "Bunker — Command Center", "A war room with a massive tactical display. Red dots everywhere. The situation was dire."),
        (2, 4, "Bunker — Communications", "Radio equipment. Static on every frequency. One channel plays music from decades ago."),
        (2, 5, "Bunker — Medical Bay", "An operating theater. Surgical tools laid out. The patient left mid-procedure."),
        (3, 1, "Bunker — Generator Room", "Diesel generators hum. Fuel is low. When it runs out, the lights go forever."),
        (3, 2, "Bunker — Server Room", "Military servers still processing. Classified data scrolls across screens. Eyes only."),
        (3, 3, "Bunker — Research Lab", "Biological containment units. Most are intact. One is broken. The contents are gone."),
        (3, 4, "Bunker — Cold Storage", "Freezers at -40. Biological samples. Some are labeled. Some are deliberately unlabeled."),
        (3, 5, "Bunker — Escape Tunnel", "A narrow tunnel with emergency lighting. It leads somewhere outside the base perimeter."),
        (4, 2, "Sub-Level — Stairwell", "Stairs descend further. The walls change from concrete to bedrock. This wasn't in the plans."),
        (4, 3, "Sub-Level — Containment", "A room designed to hold something. The restraints are massive. They've been broken."),
        (4, 4, "Sub-Level — Project Room", "Files marked 'PROJECT PROMETHEUS.' Whatever they made, it got out."),
        (5, 2, "Deep Storage — Vault", "A bank vault door. Inside: crates marked with radiation symbols and 'DO NOT OPEN UNTIL 2099.'"),
        (5, 3, "Deep Storage — Archive", "Filing cabinets of classified documents. Decades of secrets. Some pages are redacted entirely."),
        (5, 4, "The Pit", "The deepest point. A shaft drilled into the earth. Something is down there. Something is coming up."),
    ]

    for row, col, name, desc in rooms:
        flags = 'indoors,dark'
        if 'Mess' in name or 'Barracks' in name:
            flags = 'safe,indoors'
        grid[row][col] = cell(v, name, 'blood_chrome', desc, flags)
        v += 1

    return write_csv('world_blood_chrome_f2.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# MIDNIGHT RAIN — Catacombs (beneath the city)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_rain_catacombs():
    """Catacombs beneath Midnight Rain."""
    grid = [[''] * 7 for _ in range(7)]
    v = 3100

    rooms = [
        (0, 3, "Catacombs — Entrance", "Stone stairs descend from the cemetery crypt. The air is cold and still. Bones line the walls."),
        (1, 2, "Catacombs — West Passage", "A narrow tunnel. Skulls are stacked in neat rows. Candle niches are empty."),
        (1, 3, "Catacombs — Central Hall", "A wider chamber. Pillars of stacked bones support the ceiling. It's architecturally impressive."),
        (1, 4, "Catacombs — East Passage", "The tunnel curves. Newer bones here — less than a century old. The tradition continues."),
        (2, 1, "Catacombs — Dead End", "The tunnel ends. But the wall here sounds hollow when you knock."),
        (2, 2, "Catacombs — Shrine", "A small altar with fresh flowers. Someone still visits. A name is carved: 'REMEMBER.'"),
        (2, 3, "Catacombs — Crossroads", "Four tunnels meet. Each is marked with a different symbol. One smells of incense."),
        (2, 4, "Catacombs — Flooded Section", "Water fills the tunnel to ankle depth. It's cold and dark. Something ripples ahead."),
        (2, 5, "Catacombs — Collapsed", "A cave-in blocks most of the passage. A gap at the top is barely passable."),
        (3, 1, "Secret Room — Mob Archive", "Behind the hollow wall: filing cabinets of criminal records. Every crime family documented."),
        (3, 2, "Catacombs — Ritual Chamber", "A circular room with symbols on the floor. Candles burn in a circle. Fresh blood on the altar."),
        (3, 3, "Catacombs — Ossuary", "An artistic arrangement of bones. Chandeliers of femurs. Walls of skulls. Macabre beauty."),
        (3, 4, "Catacombs — Underground River", "A river flows through a natural cave. A boat is tied to a post. It could carry two."),
        (3, 5, "Catacombs — Exit to Docks", "A tunnel that emerges at the waterfront. Used by smugglers for generations."),
        (4, 2, "Catacombs — Deep Tombs", "Older tombs. The inscriptions are in Latin. These are the city's founders."),
        (4, 3, "Catacombs — The Vault", "A sealed chamber. The lock is modern — someone added it recently. What's worth protecting down here?"),
        (4, 4, "Catacombs — Forgotten Chapel", "A tiny underground chapel. Pews for twelve. The crucifix is inverted. Not a good sign."),
        (5, 2, "Catacombs — Ancient Passage", "Pre-city tunnels. The stonework is Roman. This city is older than anyone knows."),
        (5, 3, "Catacombs — Roman Bath", "An ancient bathhouse, still partially intact. The water is warm from geothermal heat."),
        (5, 4, "Catacombs — Deepest Point", "The lowest accessible point. A door of ancient bronze. No keyhole. No handle. Just a face."),
    ]

    for row, col, name, desc in rooms:
        flags = 'dark'
        if 'Shrine' in name or 'Chapel' in name:
            flags = 'dark,indoors'
        grid[row][col] = cell(v, name, 'midnight_rain', desc, flags)
        v += 1

    return write_csv('world_midnight_rain_f2.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# ETHEREAL DRIFT — Deep Void (below the abyss)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_drift_deep():
    """Deep Void — the space beneath the Ethereal Drift."""
    grid = [[''] * 6 for _ in range(6)]
    v = 5100

    rooms = [
        (0, 2, "Deep Void — Entry", "Below the abyss floor. The living thing you stood on has an underside. It's covered in eyes."),
        (0, 3, "Deep Void — Tendril Path", "Organic tendrils form a path through absolute darkness. They pulse with bioluminescence."),
        (1, 1, "Void Pocket — Memories", "A bubble of reality containing someone's memories. You can walk through their life."),
        (1, 2, "Void Pocket — Dreams", "A bubble of pure dream-stuff. Reality is whatever you imagine. Dangerous."),
        (1, 3, "Void Pocket — Nightmares", "A bubble of concentrated fear. Your worst memories given form. Face them or flee."),
        (1, 4, "Void Pocket — Time", "A bubble where time flows backward. You see the end before the beginning."),
        (2, 1, "The Womb of Worlds", "Where new realities gestate. Proto-universes bubble and pop. Some survive."),
        (2, 2, "The Dead God's Corpse — Head", "You're standing on something that was once divine. Its skull is a continent."),
        (2, 3, "The Dead God's Corpse — Heart", "The heart still beats. Once per century. The next beat is soon."),
        (2, 4, "The Dead God's Corpse — Hand", "A hand the size of a mountain, fingers curled. Something is clutched in the fist."),
        (3, 1, "Primordial Ocean", "An ocean of liquid potential. Before matter, before energy, there was this."),
        (3, 2, "The First Light", "A single point of light in infinite darkness. The first photon ever created. Still shining."),
        (3, 3, "The Last Thought", "The final thought of the dead god. It echoes eternally. It sounds like a question."),
        (3, 4, "The Seed", "A seed of pure creation. Plant it anywhere and a new world grows. Handle with care."),
        (4, 2, "The Edge of Everything", "Beyond this, nothing exists. Not void. Not darkness. Not even the concept of 'beyond.'"),
        (4, 3, "The Mirror of Worlds", "A surface that shows other realities. Some are similar. Some are horrifying. One is watching back."),
    ]

    for row, col, name, desc in rooms:
        flags = 'dark'
        grid[row][col] = cell(v, name, 'ethereal_drift', desc, flags)
        v += 1

    return write_csv('world_ethereal_drift_f2.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# FORGOTTEN EPOCH — Lost Civilizations (hidden areas)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_epoch_lost():
    """Lost Civilizations — hidden areas of the Forgotten Epoch."""
    grid = [[''] * 7 for _ in range(7)]
    v = 6100

    rooms = [
        (0, 3, "Atlantis — Dome Entrance", "A glass dome rises from the ocean floor. Air fills it impossibly. Coral grows on ancient architecture."),
        (1, 2, "Atlantis — Market District", "Underwater market stalls preserved in stasis. Goods from a civilization that mastered the sea."),
        (1, 3, "Atlantis — Central Plaza", "A grand plaza with a fountain that flows upward. Bioluminescent fish swim through the air."),
        (1, 4, "Atlantis — Temple of Poseidon", "A temple of blue marble. Tridents line the walls. The god's throne is empty but warm."),
        (2, 2, "Atlantis — Library", "Crystal tablets containing all Atlantean knowledge. The language shifts to be readable."),
        (2, 3, "Atlantis — Power Core", "The engine that keeps the dome intact. It's failing. Slowly. Centuries left, but still."),
        (2, 4, "Atlantis — Royal Palace", "Opulent halls of pearl and gold. The last king left a note: 'We chose to sink.'"),
        (3, 1, "El Dorado — Jungle Approach", "The jungle parts to reveal golden light. A city of gold, hidden for millennia."),
        (3, 2, "El Dorado — Golden Gate", "Gates of solid gold, twenty feet tall. They open at a touch. No one has touched them in ages."),
        (3, 3, "El Dorado — Main Avenue", "A street paved with gold. Buildings of gold. Even the trees have golden leaves. It's blinding."),
        (3, 4, "El Dorado — Temple", "The central temple. Gold and jade. The altar holds a single emerald the size of a head."),
        (4, 1, "El Dorado — Treasury", "If the city is gold, this is platinum. The wealth of an empire concentrated in one room."),
        (4, 2, "El Dorado — Sacrifice Pit", "A pit where offerings were made. Gold statues of the sacrificed line the edges. Their faces are peaceful."),
        (4, 3, "Lemuria — Crystal Spire", "A tower of living crystal that grows from the earth. Lemurian technology — organic and alive."),
        (4, 4, "Lemuria — Thought Gardens", "Plants that grow from ideas. Think of something and it blooms. Be careful what you think."),
        (5, 2, "Lemuria — Harmony Chamber", "A room that resonates with your life force. Stand here and hear the music of your soul."),
        (5, 3, "Lemuria — The Akashic Record", "Every event that ever happened, recorded in crystal. Past, present, and future. All accessible."),
        (5, 4, "Lemuria — Ascension Point", "Where the Lemurians transcended physical form. The air shimmers with their residual presence."),
        (6, 2, "Shangri-La — Valley", "A hidden valley of eternal spring. People here don't age. They've been waiting for visitors."),
        (6, 3, "Shangri-La — Monastery", "A peaceful monastery where masters teach the secrets of immortality. The price is staying forever."),
        (6, 4, "Shangri-La — Peak", "The highest point of the hidden valley. From here, you can see all of time laid out like a map."),
    ]

    for row, col, name, desc in rooms:
        flags = ''
        if 'Library' in name or 'Monastery' in name or 'Harmony' in name:
            flags = 'safe'
        elif 'Market' in name or 'Treasury' in name:
            flags = 'shop'
        grid[row][col] = cell(v, name, 'forgotten_epoch', desc, flags)
        v += 1

    return write_csv('world_forgotten_epoch_f2.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("Generating expansion CSV files...")
    print()
    total = 0
    total += generate_crown_dungeon()
    total += generate_neon_deep()
    total += generate_chrome_bunker()
    total += generate_rain_catacombs()
    total += generate_drift_deep()
    total += generate_epoch_lost()
    print()
    print(f"Total expansion rooms: {total}")
    print("Done!")


if __name__ == '__main__':
    main()
