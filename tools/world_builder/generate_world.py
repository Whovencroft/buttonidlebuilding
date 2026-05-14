#!/usr/bin/env python3
"""
generate_world.py — Generates world_*.csv files for the MUD world builder.

Creates 500+ rooms across all sectors with varied layouts, branching paths,
loops, dead ends, and hidden areas. Descriptions are written per-room.

This is a one-time generation script. After running, the CSVs become the
editable master files.
"""

import csv
import os
import random
from pathlib import Path

random.seed(2024)

MAPS_DIR = Path(__file__).parent / 'maps'
MAPS_DIR.mkdir(exist_ok=True)


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
# NEXUS HUB (Zone 0) — Central hub, 25 rooms in a radial layout
# ═══════════════════════════════════════════════════════════════════════════════

def generate_nexus():
    """The Nexus — central hub connecting all realms."""
    # 7x7 grid, rooms arranged in a cross/star pattern
    grid = [[''] * 7 for _ in range(7)]

    rooms = [
        (3, 3, 1, "The Nexus of Echoes — Central Chamber", "A vast circular chamber of polished obsidian. Six archways radiate outward, each shimmering with a different colored light. The ceiling is lost in darkness above, but faint stars seem to drift there.", "safe"),
        (2, 3, 2, "Gateway Chamber — North", "The northern archway pulses with golden light. Beyond it, you glimpse rolling green hills and castle spires. A sign reads: 'The Shattered Crown — Realm of Sword and Sorcery.'", "safe"),
        (4, 3, 3, "Gateway Chamber — South", "The southern archway crackles with blue-white electricity. Neon signs and holographic advertisements flicker beyond. A sign reads: 'Neon Grid — The Digital Frontier.'", "safe"),
        (3, 4, 4, "Gateway Chamber — East", "The eastern archway drips with perpetual rain. Street lamps and saxophone music drift through. A sign reads: 'Midnight Rain — Where Shadows Have Secrets.'", "safe"),
        (3, 2, 5, "Gateway Chamber — West", "The western archway glows with orange firelight. Explosions and gunfire echo faintly. A sign reads: 'Blood & Chrome — No Pain, No Gain.'", "safe"),
        (1, 3, 6, "Gateway Chamber — Upper", "The upper archway opens onto a staircase that climbs into starlight. Floating islands are visible in the distance. A sign reads: 'Ethereal Drift — Between the Stars.'", "safe"),
        (2, 4, 7, "Gateway Chamber — Northeast", "A shimmering portal shows scenes from different time periods flickering rapidly. A sign reads: 'Forgotten Epoch — History Unbound.'", "safe"),
        (3, 1, 8, "The Bazaar — West Wing", "A bustling marketplace fills this wide corridor. Merchants hawk wares from a dozen different worlds. The smell of exotic spices mixes with machine oil.", "safe,shop"),
        (3, 5, 9, "The Bazaar — East Wing", "More market stalls line this corridor. A weapons dealer polishes a gleaming blade while a tech vendor demonstrates holographic displays.", "safe,shop"),
        (4, 2, 10, "Training Hall — Entrance", "A reinforced doorway leads into a large open space. The sounds of combat echo from within. A sign reads: 'All skill levels welcome. No killing.'", "safe,train"),
        (4, 4, 11, "The Healer's Sanctum", "Soft blue light fills this domed room. Crystal formations pulse with restorative energy. A robed figure tends to the wounded.", "safe"),
        (2, 2, 12, "The Bulletin Board", "A large cork board dominates the wall here, covered in notices, bounties, and requests. Adventurers gather to read the latest postings.", "safe"),
        (5, 3, 13, "The Undercity Entrance", "A heavy iron grate in the floor has been pried open. A ladder descends into darkness. The smell of damp stone and worse things rises from below.", "safe"),
        (4, 1, 14, "Armorer's Workshop", "The ring of hammer on anvil fills this smoky room. A stocky smith works at a forge that burns with supernatural heat.", "safe,shop"),
        (2, 5, 15, "The Observatory", "A glass dome reveals the void between realms. Stars and distant worlds drift past. Telescopes of various designs point in every direction.", "safe"),
        (1, 2, 16, "The Afterlife Gate", "A pale archway stands here, its surface like still water. Beyond it, ghostly lights drift upward. A sign reads: 'The Afterlife — For the Worthy and the Dead.'", "safe"),
        (5, 2, 17, "Nexus — Southwest Corridor", "A quiet corridor connecting the training areas to the lower levels. Torches flicker in iron sconces.", "safe"),
        (5, 4, 18, "Nexus — Southeast Corridor", "A corridor lined with memorial plaques. Names of fallen heroes are etched in silver.", "safe"),
        (1, 4, 19, "Nexus — Upper East", "A balcony overlooks the central chamber from above. The view is dizzying.", "safe"),
        (0, 3, 20, "The Pinnacle", "The highest point of the Nexus. A single chair faces outward into the void between worlds. Someone left a half-finished drink here.", "safe"),
        (5, 1, 21, "Storage Cellar", "Crates and barrels are stacked against the walls. Most are labeled with destinations that no longer exist.", "safe"),
        (5, 5, 22, "The Quiet Room", "A small meditation chamber. The walls absorb all sound. Perfect silence.", "safe"),
        (6, 3, 23, "Nexus — Deep Basement", "Below the main level. The walls here are older — rougher stone, no polish. Something was here before the Nexus was built.", ""),
        (6, 2, 24, "Forgotten Storeroom", "Dust covers everything. Crates marked with symbols no one remembers. A rat watches you from atop a barrel.", ""),
        (6, 4, 25, "The Old Well", "A stone well sits in the center of this room. The water is black and still. Sometimes it ripples when nothing has touched it.", ""),
    ]

    for row, col, vnum, name, desc, flags in rooms:
        mobs = ''
        items = ''
        interact = ''
        special = ''
        vertical = ''
        if vnum == 13:
            vertical = 'down:7001'
        if vnum == 16:
            special = 'north:9001:door:none'
        if vnum == 2:
            special = 'north:1001:door:none'
        if vnum == 3:
            special = 'south:2001:door:none'
        if vnum == 4:
            special = 'east:3001:door:none'
        if vnum == 5:
            special = 'west:4001:door:none'
        if vnum == 6:
            special = 'up:5001:door:none'
        if vnum == 7:
            special = 'northeast:6001:door:none'
        grid[row][col] = cell(vnum, name, 'nexus', desc, flags, mobs, items, interact, special, vertical)

    return write_csv('world_nexus_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# SHATTERED CROWN (Zone 1) — Fantasy realm, ~80 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_shattered_crown():
    """The Shattered Crown — medieval fantasy realm."""
    # 10x10 grid
    grid = [[''] * 10 for _ in range(12)]
    v = 1001  # Starting vnum

    # Layout: A castle town with surrounding wilderness
    room_defs = [
        # Row 0 — Northern wilderness
        (0, 3, "Mountain Pass — Summit", "The wind howls at this narrow pass between two peaks. Snow whips horizontally. The path descends south toward greener lands."),
        (0, 4, "Eagle's Nest", "A rocky outcrop where massive eagles nest. Bones of large animals litter the ground. The view stretches for miles."),
        # Row 1 — Northern approach
        (1, 2, "Dark Forest — Deep", "Ancient trees block all sunlight. Mushrooms glow faintly on rotting logs. Something moves in the undergrowth."),
        (1, 3, "Mountain Pass — Descent", "The rocky path winds downward through scrub brush. A stream trickles alongside."),
        (1, 4, "Forest Clearing", "A break in the canopy lets sunlight through. Wildflowers carpet the ground. A stone circle stands in the center."),
        (1, 5, "Hermit's Cave", "A shallow cave with signs of habitation — a bedroll, dried herbs, a small fire pit."),
        # Row 2 — Forest belt
        (2, 1, "Dark Forest — Western Edge", "The trees thin here, revealing rolling hills to the west. Claw marks scar the bark."),
        (2, 2, "Dark Forest — Crossroads", "Two paths cross here. A wooden signpost points in four directions, but the writing has faded."),
        (2, 3, "Forest Road — North", "A dirt road cuts through the forest. Cart tracks suggest regular traffic."),
        (2, 4, "Enchanted Grove", "The trees here shimmer with inner light. Pixies dart between branches. The air tastes like honey."),
        (2, 5, "Abandoned Mill", "A watermill sits beside a dry streambed. The wheel is broken. Grain sacks rot inside."),
        (2, 6, "Bandit Camp — Outskirts", "Trampled ground and old campfires. Someone has been living here recently."),
        # Row 3 — Northern town approach
        (3, 1, "Rolling Hills — West", "Green hills stretch westward under a grey sky. Sheep graze in the distance."),
        (3, 2, "Farmstead — Fields", "Wheat fields sway in the breeze. A scarecrow watches with button eyes."),
        (3, 3, "King's Road — North Gate", "The cobblestone road leads to a massive stone gatehouse. Guards in silver tabards check travelers."),
        (3, 4, "King's Road — Bend", "The road curves here around a large oak tree. A bench sits beneath it."),
        (3, 5, "Eastern Trail", "A narrow path winds eastward through rocky terrain. It looks less traveled."),
        (3, 6, "Bandit Camp — Center", "A ring of tents surrounds a large fire pit. Stolen goods are piled carelessly."),
        (3, 7, "Bandit Camp — Leader's Tent", "A larger tent with a crude throne made of shields. Maps and plans are pinned to a board."),
        # Row 4 — Town north
        (4, 2, "Town Square — North", "The northern edge of the town square. A fountain depicts a knight slaying a dragon."),
        (4, 3, "Castle Street", "A wide avenue leading toward the castle. Noble houses line both sides."),
        (4, 4, "The Prancing Pony Inn", "A warm tavern with a roaring fire. The smell of ale and roasting meat fills the air."),
        (4, 5, "Alchemist's Shop", "Bubbling vials and strange smells. The alchemist peers at you through thick spectacles."),
        (4, 6, "Eastern Wall — Tower", "A guard tower built into the town wall. Archers watch the eastern approach."),
        # Row 5 — Town center
        (5, 1, "Western Gate", "The western gate of the town. Less grand than the north gate, used mainly by farmers."),
        (5, 2, "Market Street — West", "Vendors sell vegetables, cloth, and pottery. A bard plays a lute on the corner."),
        (5, 3, "Town Square — Center", "The heart of the town. A large notice board stands here. Citizens go about their business."),
        (5, 4, "Market Street — East", "Weapon smiths and leather workers ply their trade here. The clang of metal rings out."),
        (5, 5, "Temple of the Dawn", "A white stone temple with stained glass windows. Soft chanting echoes within."),
        (5, 6, "Graveyard — Gate", "An iron gate leads into a misty graveyard. The hinges creak ominously."),
        # Row 6 — Town south
        (6, 2, "Residential — West", "Modest homes with thatched roofs. Children play in the street."),
        (6, 3, "Town Square — South", "The southern edge of the square. A stocks stands here, currently empty."),
        (6, 4, "The Rusty Nail — Tavern", "A rougher establishment. The clientele look like they'd stab you for a copper."),
        (6, 5, "Thieves' Alley", "A narrow passage between buildings. It smells of refuse. Eyes watch from the shadows."),
        (6, 6, "Graveyard — Interior", "Headstones lean at odd angles. Fog clings to the ground. A mausoleum stands at the back."),
        (6, 7, "Graveyard — Mausoleum", "A stone building sealed with a heavy door. Scratching sounds come from within."),
        # Row 7 — Southern town and castle
        (7, 1, "Farmstead — Barn", "A large barn filled with hay. Animals shift nervously in their stalls."),
        (7, 2, "South Gate", "The southern gate opens onto the King's Road heading south. Trade caravans wait here."),
        (7, 3, "Castle — Outer Ward", "The castle's outer courtyard. Soldiers drill in formation. Stables line the west wall."),
        (7, 4, "Castle — Inner Ward", "The inner courtyard. A well sits in the center. The keep looms above."),
        (7, 5, "Castle — Great Hall", "A massive hall with a vaulted ceiling. The king's throne sits empty on a raised dais."),
        (7, 6, "Castle — Dungeon Entrance", "Stone stairs descend into darkness. The smell of damp and despair rises."),
        # Row 8 — Castle depths and southern road
        (8, 2, "King's Road — South", "The road stretches southward through open plains. Distant mountains mark the horizon."),
        (8, 3, "Castle — Armory", "Racks of weapons and armor line the walls. A quartermaster takes inventory."),
        (8, 4, "Castle — Tower Base", "The base of the tallest tower. Spiral stairs wind upward into gloom."),
        (8, 5, "Castle — Library", "Floor-to-ceiling bookshelves. Dust motes drift in shafts of light. A scholar mutters to himself."),
        (8, 6, "Castle — Dungeon Cells", "Iron-barred cells line a damp corridor. Most are empty. Most."),
        # Row 9 — Deep south / dungeons
        (9, 2, "Crossroads — Southern Plains", "The road forks here. South leads to distant villages. East enters marshland."),
        (9, 3, "Castle — Secret Passage", "A narrow passage behind a bookcase. Cobwebs suggest it hasn't been used in years."),
        (9, 4, "Castle — Tower Top", "The top of the tower. A telescope points skyward. The entire kingdom is visible from here."),
        (9, 5, "Castle — Wizard's Study", "A cluttered room of arcane apparatus. A crystal ball sits on the desk, clouded and dark."),
        (9, 6, "Castle — Deep Dungeon", "The lowest level. Water drips from the ceiling. Something large breathes in the darkness."),
        # Row 10 — Wilderness south
        (10, 1, "Swamp — Western Edge", "The ground becomes soft and treacherous. Cattails and dead trees mark the transition to marshland."),
        (10, 2, "Southern Plains", "Flat grassland stretches in every direction. The wind carries the smell of rain."),
        (10, 3, "Ruined Watchtower", "A crumbling stone tower. Only two walls still stand. Vines have claimed the rest."),
        (10, 4, "Swamp — Path", "A narrow path of stepping stones crosses the murky water. One wrong step and you're swimming."),
        (10, 5, "Witch's Hut", "A crooked house on chicken-leg stilts. Smoke rises from the chimney. The door has no handle."),
        # Row 11 — Far south
        (11, 2, "Ancient Ruins — Entrance", "Crumbling stone pillars mark the entrance to something old. Carved symbols cover every surface."),
        (11, 3, "Ancient Ruins — Hall", "A long hall of fallen columns. The ceiling has collapsed in places, letting in shafts of light."),
        (11, 4, "Ancient Ruins — Sanctum", "A circular chamber at the heart of the ruins. An altar stands in the center, stained dark."),
    ]

    for row, col, name, desc in room_defs:
        flags = ''
        if 'Inn' in name or 'Tavern' in name:
            flags = 'safe,indoors'
        elif 'Temple' in name:
            flags = 'safe,indoors'
        elif 'Shop' in name or 'Market' in name:
            flags = 'shop,indoors'
        elif 'Castle' in name:
            flags = 'indoors'
        elif 'Town Square' in name:
            flags = 'safe'
        grid[row][col] = cell(v, name, 'shattered_crown', desc, flags)
        v += 1

    return write_csv('world_shattered_crown_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# NEON GRID (Zone 2) — Cyberpunk, ~80 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_neon_grid():
    """Neon Grid — cyberpunk dystopia."""
    grid = [[''] * 10 for _ in range(12)]
    v = 2001

    room_defs = [
        # Row 0 — Corporate towers (upper level)
        (0, 4, "MegaCorp Tower — Lobby", "A sterile white lobby with holographic receptionists. Security scanners line the entrance. Everything smells like money."),
        (0, 5, "MegaCorp Tower — Elevator", "A glass elevator shaft. The city sprawls below through the transparent floor. Going down feels like falling."),
        # Row 1 — Upper city
        (1, 3, "Skybridge — West", "A glass-enclosed bridge between towers. The city is a carpet of neon far below. Wind buffets the structure."),
        (1, 4, "MegaCorp Tower — Server Floor", "Rows of humming server racks stretch into darkness. The temperature is freezing. LEDs blink like stars."),
        (1, 5, "MegaCorp Tower — Executive Suite", "Minimalist luxury. A desk of polished obsidian faces a wall-sized window. The chair is still warm."),
        (1, 6, "Rooftop Garden", "A manicured garden atop a skyscraper. Real plants — a fortune's worth. A drone waters the orchids."),
        # Row 2 — Mid-level
        (2, 2, "Apartment Block — Hallway", "A long corridor of identical doors. Flickering fluorescent lights. Someone is arguing behind door 47."),
        (2, 3, "Skybridge — Center", "The midpoint of the bridge. A homeless man has set up camp here with a cardboard sign: 'THE END IS LOADING.'"),
        (2, 4, "Transit Hub — Upper", "A monorail station. Holographic schedules flicker. The next train arrives in 3 minutes. Or never."),
        (2, 5, "Noodle Bar — 47th Floor", "A tiny ramen shop crammed between office buildings. The chef is a robot. The noodles are perfect."),
        (2, 6, "Hacker's Den", "A cluttered apartment filled with screens and cables. Energy drink cans form a small fortress."),
        # Row 3 — Street level north
        (3, 1, "Neon Street — West End", "The street dead-ends at a concrete wall covered in graffiti. A fire escape leads up."),
        (3, 2, "Neon Street — Market", "Street vendors sell everything from bootleg chips to synthetic organs. No questions asked."),
        (3, 3, "Neon Street — Main", "The main drag. Neon signs in every language compete for attention. Rain falls through holographic advertisements."),
        (3, 4, "Neon Street — Central", "The busiest intersection. Crowds flow around you like water. A street preacher screams about the singularity."),
        (3, 5, "Neon Street — East", "The street narrows here. Cheaper establishments. A pawn shop, a clinic, a bar with no name."),
        (3, 6, "Neon Street — Dead End", "The street ends at a chain-link fence. Beyond it, the ruins of the old city. Something moves in the rubble."),
        (3, 7, "The Ruins — Edge", "Collapsed buildings from before the corporate takeover. Scavengers pick through the debris."),
        # Row 4 — Street level center
        (4, 1, "Back Alley — West", "A narrow alley between buildings. Dumpsters overflow. A cat with chrome eyes watches you."),
        (4, 2, "The Byte Club", "A underground fight club. Augmented fighters trade blows in a cage. The crowd roars."),
        (4, 3, "Chrome Avenue — North", "A wider street lined with body modification shops. Neon signs advertise the latest implants."),
        (4, 4, "The Crossroads", "A major intersection with a broken traffic light. It always shows red. Nobody stops anyway."),
        (4, 5, "Chrome Avenue — South", "More mod shops, but seedier. Back-alley surgeons. 'Discount Augments — Only Slightly Used.'"),
        (4, 6, "Abandoned Warehouse", "A cavernous space. Pigeons roost in the rafters. Tire tracks suggest recent vehicle activity."),
        (4, 7, "The Ruins — Deep", "Deeper into the collapsed old city. The ground is unstable. Feral dogs hunt in packs here."),
        # Row 5 — Underground approach
        (5, 2, "Parking Garage — Level 1", "A multi-story garage. Most vehicles are stripped shells. Oil stains mark where others once sat."),
        (5, 3, "The Red Light District — North", "Holographic dancers advertise clubs. The bass from inside shakes your chest. Everything is for sale."),
        (5, 4, "The Red Light District — Center", "The heart of the pleasure district. Sensory overload. Every vice has a neon sign."),
        (5, 5, "The Red Light District — South", "The district fades into darker territory. The establishments here don't advertise."),
        (5, 6, "Junkyard — Gate", "Mountains of discarded tech behind a chain-link fence. A guard dog — mechanical — patrols."),
        # Row 6 — Lower level
        (6, 1, "Sewer Access — West", "A maintenance hatch leads down into the city's underbelly. The smell is indescribable."),
        (6, 2, "Parking Garage — Basement", "The lowest level. No lights work. Water drips from the ceiling. Perfect for an ambush."),
        (6, 3, "Underground Market", "A black market operating in an old subway station. Illegal weapons, drugs, stolen data."),
        (6, 4, "The Undernet Cafe", "A dingy cafe where hackers jack into the net. The coffee is terrible. The bandwidth is incredible."),
        (6, 5, "Clinic — Back Room", "An unlicensed medical facility. The doctor has steady hands and no questions. Cash only."),
        (6, 6, "Junkyard — Interior", "Towers of scrap metal and dead electronics. Useful parts if you know what to look for."),
        (6, 7, "Junkyard — Deep", "The back of the junkyard. Something has built a nest here from car parts and wire."),
        # Row 7 — Industrial
        (7, 2, "Factory District — West", "Smokestacks belch toxic fumes. Automated factories run 24/7. No workers needed."),
        (7, 3, "Factory District — Center", "The main factory floor visible through grimy windows. Robots assemble robots. Recursive manufacturing."),
        (7, 4, "Factory District — East", "Loading docks where autonomous trucks come and go. Crates stamped with corporate logos."),
        (7, 5, "Power Plant — Exterior", "A massive fusion reactor hums behind reinforced walls. Warning signs in twelve languages."),
        (7, 6, "Power Plant — Interior", "The reactor core glows blue-white. The heat is intense. Maintenance drones buzz around it."),
        # Row 8 — Deep industrial
        (8, 2, "Waste Processing", "Where the city's garbage goes to die. Conveyor belts sort recyclables. The rest gets incinerated."),
        (8, 3, "Abandoned Lab", "A corporate research facility. Cleared out in a hurry. Broken glass and scattered papers remain."),
        (8, 4, "Abandoned Lab — Deep", "The inner labs. Containment pods line the walls. Most are empty. Most."),
        (8, 5, "Server Farm — Entrance", "A nondescript building with massive cooling systems. The digital heart of the grid."),
        (8, 6, "Server Farm — Core", "The central processing hub. Petabytes of data flow through here every second. The AI lives here."),
        # Row 9 — Outskirts
        (9, 3, "Highway — On-Ramp", "A crumbling highway on-ramp. The road above is cracked and overgrown. No traffic anymore."),
        (9, 4, "Highway — Overpass", "The elevated highway. Abandoned vehicles rust in place. The city skyline glitters in the distance."),
        (9, 5, "Highway — Off-Ramp", "The highway descends back to ground level. A makeshift settlement of tarps and shipping containers."),
        # Row 10 — Far outskirts
        (10, 3, "Shantytown — Edge", "The corporate city ends here. Beyond is a sprawl of improvised shelters. The forgotten people."),
        (10, 4, "Shantytown — Center", "A community built from scraps. Despite everything, children play and food is shared."),
        (10, 5, "Shantytown — Market", "A barter economy. People trade skills, food, and salvage. No credits accepted."),
        # Row 11 — Wasteland
        (11, 3, "The Wasteland — Edge", "Beyond the shantytown, nothing. Irradiated ground from the old wars. Only the desperate go further."),
        (11, 4, "The Wasteland — Bunker", "A pre-war bunker, half-buried in toxic sand. The door is ajar. Someone has been here recently."),
    ]

    for row, col, name, desc in room_defs:
        flags = ''
        if 'Noodle' in name or 'Cafe' in name or 'Inn' in name:
            flags = 'safe,indoors'
        elif 'Market' in name or 'Shop' in name:
            flags = 'shop'
        elif 'Transit' in name:
            flags = 'safe'
        grid[row][col] = cell(v, name, 'neon_grid', desc, flags)
        v += 1

    return write_csv('world_neon_grid_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# MIDNIGHT RAIN (Zone 3) — Noir, ~80 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_midnight_rain():
    """Midnight Rain — noir cityscape."""
    grid = [[''] * 10 for _ in range(11)]
    v = 3001

    room_defs = [
        # Row 0 — Uptown
        (0, 4, "Penthouse — Balcony", "Rain hammers the glass railing. The city spreads below like a circuit board. Someone left a cigarette burning in the ashtray."),
        (0, 5, "Penthouse — Interior", "White carpet, modern art, a bar stocked with top-shelf bourbon. The kind of place where deals are made."),
        # Row 1 — Upper district
        (1, 3, "Uptown — Gallery Row", "Art galleries with pretentious names. The paintings cost more than most people make in a year."),
        (1, 4, "Uptown — Main Street", "Clean sidewalks, doormen, luxury cars. The rain even seems cleaner up here."),
        (1, 5, "The Continental Hotel", "A grand hotel with a strict no-violence policy. Everyone knows the rules. Everyone follows them."),
        (1, 6, "Uptown — Park", "A manicured park with gas lamps. Couples walk under umbrellas. It almost feels safe."),
        # Row 2 — Midtown
        (2, 2, "Midtown — West", "Office buildings and parking garages. The 9-to-5 crowd has gone home. Only the cleaners remain."),
        (2, 3, "Midtown — Newspaper Row", "The offices of the Daily Chronicle. A light burns in the editor's window. Always a story breaking."),
        (2, 4, "Midtown — Central", "The business district. Banks, law firms, and the kind of restaurants that require reservations."),
        (2, 5, "Midtown — Courthouse", "A neoclassical building with blind justice on top. The scales have been broken for years."),
        (2, 6, "Midtown — Police Station", "A squat brick building. Cops come and go. The good ones look tired. The bad ones look comfortable."),
        # Row 3 — The divide
        (3, 1, "Rain-Soaked Alley — West", "A narrow passage between buildings. Rain cascades from fire escapes above. A cat knocks over a trash can."),
        (3, 2, "Jazz Club — The Blue Note", "Smoky interior, dim lights, a saxophone crying in the corner. The bourbon is cheap and the music is priceless."),
        (3, 3, "Downtown — Main Drag", "The line between respectable and dangerous. Pawn shops next to law offices. Everyone watches everyone."),
        (3, 4, "Downtown — Intersection", "A busy crossroads. Taxis splash through puddles. A newsboy hawks papers: 'MURDER ON THE WATERFRONT!'"),
        (3, 5, "Downtown — East Side", "Cheaper rent, harder people. A laundromat that's definitely a front. A diner that never closes."),
        (3, 6, "PI Office — Building", "A five-story walkup with a flickering neon sign: 'INVESTIGATIONS.' Third floor, door on the left."),
        (3, 7, "PI Office — Interior", "A cluttered desk, a bottle in the drawer, a gun in the other drawer. The phone never rings with good news."),
        # Row 4 — Lower downtown
        (4, 1, "Back Alley — Dead End", "The alley ends at a brick wall. Graffiti reads: 'SNITCHES GET STITCHES.' A dumpster provides cover."),
        (4, 2, "The Speakeasy", "Behind a bookshelf in a barbershop. The password changes weekly. The gin never does."),
        (4, 3, "Chinatown — Gate", "A red arch marks the entrance. Paper lanterns sway in the rain. The smell of dim sum and incense."),
        (4, 4, "Chinatown — Market", "Narrow streets packed with stalls. Fish tanks, herb shops, and a fortune teller who's never wrong."),
        (4, 5, "Chinatown — Temple", "A small Buddhist temple. Incense smoke curls upward. The monk sees everything and says nothing."),
        (4, 6, "The Docks — North", "Warehouses line the waterfront. Fog rolls in off the water. Foghorns sound in the distance."),
        # Row 5 — Waterfront
        (5, 1, "The Docks — West Pier", "A rotting wooden pier. Fishing boats creak at their moorings. The water is black and cold."),
        (5, 2, "The Docks — Warehouse Row", "Identical warehouses. One of them is always being loaded at 3 AM. Nobody asks what's inside."),
        (5, 3, "The Docks — Central", "The main dock area. Cargo ships from distant ports. Longshoremen smoke and watch."),
        (5, 4, "The Docks — Fish Market", "Even at night, the smell is overwhelming. Crates of ice and dead fish. A good place to hide a body."),
        (5, 5, "The Docks — East Pier", "A newer pier with a yacht club. The rich keep their boats here. Armed guards patrol."),
        (5, 6, "Lighthouse — Base", "An old lighthouse at the end of a breakwater. The light still turns, but nobody maintains it."),
        # Row 6 — Underbelly
        (6, 2, "The Tenderloin — North", "The bad part of town. Neon signs for adult establishments. Dealers on every corner."),
        (6, 3, "The Tenderloin — Center", "Rock bottom. Flophouses, needle exchanges, and broken dreams. The rain washes nothing clean."),
        (6, 4, "The Tenderloin — South", "A burned-out building that used to be a school. Now it's a squat. Campfires glow in the windows."),
        (6, 5, "Underground Gambling Den", "Behind a meat locker in a butcher shop. Poker, dice, fights. The house always wins."),
        (6, 6, "The Mob Boss's Club", "A legitimate business on paper. Velvet ropes, expensive suits, and the smell of fear."),
        # Row 7 — Deep underbelly
        (7, 2, "Abandoned Subway — Entrance", "A boarded-up subway entrance. The boards have been pried apart. Stairs descend into darkness."),
        (7, 3, "Abandoned Subway — Platform", "An old station frozen in time. Advertisements from decades ago. Rats rule here now."),
        (7, 4, "Abandoned Subway — Tunnel", "The tunnel stretches into blackness. Water drips. Echoes play tricks on your ears."),
        (7, 5, "The Catacombs — Entry", "Beneath the subway, older tunnels. Brick and bone. The city was built on the dead."),
        (7, 6, "The Catacombs — Deep", "Skulls line the walls in neat rows. Someone has been here recently — fresh candle wax on the floor."),
        # Row 8 — Outskirts
        (8, 3, "Industrial District — West", "Abandoned factories from the boom years. Broken windows stare like dead eyes."),
        (8, 4, "Industrial District — Center", "A functioning steel mill. The night shift works in hellish orange light."),
        (8, 5, "Industrial District — East", "Rail yards where freight trains sit idle. A good place to hop a train out of this city."),
        # Row 9 — Far outskirts
        (9, 3, "The Bridge — West End", "A massive suspension bridge spanning the river. The fog is so thick you can't see the other side."),
        (9, 4, "The Bridge — Center", "Halfway across. The wind is brutal. The water far below is invisible in the fog."),
        (9, 5, "The Bridge — East End", "The far side of the bridge. A different jurisdiction. The cops here are worse."),
        # Row 10 — Cemetery
        (10, 3, "Cemetery — Gate", "Wrought iron gates stand open. The cemetery stretches up a hill. Angels weep in stone."),
        (10, 4, "Cemetery — Hill", "The top of the cemetery hill. The city glitters below. Fresh flowers on a grave with no name."),
        (10, 5, "Cemetery — Crypt", "A family crypt built into the hillside. The door is unlocked. It shouldn't be."),
    ]

    for row, col, name, desc in room_defs:
        flags = ''
        if 'Hotel' in name or 'Jazz' in name or 'Temple' in name:
            flags = 'safe,indoors'
        elif 'Office' in name or 'Club' in name:
            flags = 'indoors'
        grid[row][col] = cell(v, name, 'midnight_rain', desc, flags)
        v += 1

    return write_csv('world_midnight_rain_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# BLOOD & CHROME (Zone 4) — Military/Action, ~80 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_blood_chrome():
    """Blood & Chrome — war-torn wasteland."""
    grid = [[''] * 10 for _ in range(11)]
    v = 4001

    room_defs = [
        # Row 0 — Base camp
        (0, 4, "Firebase Alpha — Command", "A reinforced bunker with maps and radios. The CO barks orders. Shells land in the distance."),
        (0, 5, "Firebase Alpha — Armory", "Racks of weapons behind chain-link. The quartermaster logs everything. Everything."),
        # Row 1 — Base perimeter
        (1, 3, "Firebase Alpha — Barracks", "Rows of cots. Personal effects tucked under pillows. Letters from home pinned to the walls."),
        (1, 4, "Firebase Alpha — Mess Hall", "Long tables and the smell of reconstituted food. A TV plays news nobody watches."),
        (1, 5, "Firebase Alpha — Motor Pool", "Vehicles in various states of repair. A mechanic curses at an engine. Oil stains everything."),
        (1, 6, "Firebase Alpha — Helipad", "A concrete pad with painted circles. The wind from rotors never fully dies here."),
        # Row 2 — Perimeter
        (2, 2, "Perimeter — West Tower", "A guard tower with sandbags and a mounted gun. The view shows nothing but wasteland."),
        (2, 3, "Perimeter — West Gate", "A checkpoint with concrete barriers. Razor wire tops the walls. Papers are checked twice."),
        (2, 4, "Perimeter — North Wall", "The main wall facing enemy territory. Bullet holes pockmark the concrete."),
        (2, 5, "Perimeter — East Gate", "The supply gate. Convoys come and go under heavy guard."),
        (2, 6, "Perimeter — East Tower", "Another guard tower. Binoculars scan the horizon. Something moved out there."),
        # Row 3 — No man's land
        (3, 1, "Wasteland — Crater Field", "Shell craters overlap like a diseased moonscape. Nothing grows here. Nothing should."),
        (3, 2, "Wasteland — Burned Forest", "Charred tree trunks stand like black fingers. Ash crunches underfoot."),
        (3, 3, "No Man's Land — West", "The space between the lines. Barbed wire and unexploded ordnance. Every step could be your last."),
        (3, 4, "No Man's Land — Center", "A destroyed tank sits in the middle of the field. Both sides use it as a landmark."),
        (3, 5, "No Man's Land — East", "More wire, more craters. A boot sticks out of the mud. Nobody claims it."),
        (3, 6, "Wasteland — Minefield", "Warning signs in three languages. Some of the signs have been moved. Deliberately."),
        (3, 7, "Wasteland — Sniper Alley", "A long straight road between ruined buildings. Everyone runs here. Not everyone makes it."),
        # Row 4 — Contested zone
        (4, 1, "Ruined Village — West", "What was once a home. The walls still stand but the roof is gone. Family photos in the rubble."),
        (4, 2, "Ruined Village — Center", "The village square. A fountain with no water. A clock tower with no hands."),
        (4, 3, "Ruined Village — East", "A destroyed school. Tiny desks overturned. Crayon drawings on the remaining wall."),
        (4, 4, "Trench — Junction", "Where three trenches meet. Sandbags and wooden supports. The mud is knee-deep."),
        (4, 5, "Trench — East", "A long trench heading east. Duckboards keep you above the worst of the water."),
        (4, 6, "Trench — Bunker", "A reinforced position dug into the trench wall. Room for four. Smells like fear."),
        (4, 7, "Observation Post", "A camouflaged position on high ground. Radio equipment and binoculars."),
        # Row 5 — Enemy territory
        (5, 2, "Destroyed Bridge", "A bridge blown in half. The river below is toxic green. The other side is enemy territory."),
        (5, 3, "River Crossing — Shallow", "A fordable point in the river. The current is strong. Bullets have a way of finding you here."),
        (5, 4, "Enemy Trench — Outer", "You've crossed the line. Their trenches mirror yours. Same mud, different flag."),
        (5, 5, "Enemy Trench — Inner", "Deeper into enemy lines. Abandoned equipment suggests a hasty retreat. Or a trap."),
        (5, 6, "Enemy Bunker — Exterior", "A concrete bunker built into a hillside. The door is reinforced steel. Bullet scars everywhere."),
        # Row 6 — Deep enemy territory
        (6, 2, "Bombed Highway", "A six-lane highway reduced to rubble. Overturned vehicles form a maze."),
        (6, 3, "Refugee Camp — Outskirts", "Tents and tarps stretch for acres. The displaced and the desperate. Aid workers do what they can."),
        (6, 4, "Refugee Camp — Center", "A medical tent and a food distribution point. The line never ends."),
        (6, 5, "Enemy Base — Perimeter", "Their base. Similar to yours but with different insignia. The irony isn't lost on anyone."),
        (6, 6, "Enemy Base — Interior", "Inside their wire. Barracks and motor pools. A mirror image of home."),
        # Row 7 — Mountains
        (7, 2, "Mountain Road — Base", "A winding road begins its ascent into the mountains. Switchbacks visible above."),
        (7, 3, "Mountain Road — Switchback", "A hairpin turn on the mountain road. The drop is fatal. Guardrails are optional."),
        (7, 4, "Mountain Pass — Checkpoint", "A fortified position controlling the pass. Whoever holds this controls movement."),
        (7, 5, "Mountain Cave — Entrance", "A natural cave system. Used as shelter, storage, or worse. Darkness within."),
        (7, 6, "Mountain Cave — Deep", "Deep in the cave system. Stalactites drip. Crates of weapons are stacked against the walls."),
        # Row 8 — Hidden areas
        (8, 3, "Underground Facility — Entrance", "A blast door set into the mountainside. Military markings. Top secret classification."),
        (8, 4, "Underground Facility — Lab", "A research facility. Containment units and hazmat suits. What were they working on?"),
        (8, 5, "Underground Facility — Arsenal", "A weapons cache that could arm a small country. Some of these shouldn't exist."),
        # Row 9 — Wasteland south
        (9, 2, "Irradiated Zone — Edge", "Geiger counters click rapidly. The ground is glass in places. A failed weapon test."),
        (9, 3, "Irradiated Zone — Center", "The epicenter. A crater of fused sand. The air shimmers with heat that isn't heat."),
        (9, 4, "Irradiated Zone — Bunker", "A survival bunker. Sealed for decades. The door has been forced open from the inside."),
        (9, 5, "Crashed Aircraft", "A transport plane broken in half. Cargo scattered across the desert. The black box still beeps."),
        # Row 10 — Far wasteland
        (10, 3, "Desert Outpost", "A lonely watchtower in the sand. One soldier on rotation. They haven't been relieved in weeks."),
        (10, 4, "Oasis", "An impossible green spot in the wasteland. Fresh water. Palm trees. It feels like a trap because it might be."),
        (10, 5, "Arms Dealer's Camp", "A collection of tents and vehicles. The dealer sells to both sides. Business is good."),
    ]

    for row, col, name, desc in room_defs:
        flags = ''
        if 'Firebase' in name and 'Command' not in name:
            flags = 'safe,indoors'
        elif 'Mess Hall' in name or 'Barracks' in name:
            flags = 'safe,indoors'
        elif 'Oasis' in name:
            flags = 'safe'
        grid[row][col] = cell(v, name, 'blood_chrome', desc, flags)
        v += 1

    return write_csv('world_blood_chrome_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# ETHEREAL DRIFT (Zone 5) — Cosmic/Floating, ~80 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_ethereal_drift():
    """Ethereal Drift — floating shards in cosmic void."""
    grid = [[''] * 10 for _ in range(11)]
    v = 5001

    room_defs = [
        # Row 0 — Upper void
        (0, 4, "The Apex", "The highest point reachable. Stars surround you in every direction. A single crystal floats here, pulsing with light."),
        (0, 5, "Star Garden", "Miniature stars orbit a central point like a mobile. Each one hums a different note."),
        # Row 1 — Upper shards
        (1, 3, "Crystal Shard — North", "A floating platform of pure crystal. It rings like a bell when you step on it. The void stretches below."),
        (1, 4, "The Observatory Shard", "A shard with a massive telescope pointed at something specific. The lens is cracked but still functional."),
        (1, 5, "Library Shard", "Books float in zero gravity around a reading chair. Knowledge from dead worlds preserved in amber light."),
        (1, 6, "The Singing Stones", "Tall crystalline pillars that vibrate with harmonic frequencies. Standing between them is transcendent."),
        # Row 2 — Mid-upper
        (2, 2, "Vine Bridge — West", "A bridge of living vines spans the void between shards. It sways gently. Don't look down."),
        (2, 3, "Garden Shard — North", "An impossible garden floating in space. Flowers that shouldn't exist bloom in colors with no name."),
        (2, 4, "Central Nexus Shard", "The largest shard — a floating island the size of a city block. Paths radiate outward in every direction."),
        (2, 5, "Garden Shard — East", "More impossible flora. A tree grows upside down, its roots reaching for stars instead of soil."),
        (2, 6, "Vine Bridge — East", "Another living bridge. This one has thorns. They retract as you approach. Mostly."),
        # Row 3 — Central band
        (3, 1, "Isolated Shard — Far West", "A tiny shard barely large enough to stand on. The view is vertigo-inducing and beautiful."),
        (3, 2, "Waterfall Shard", "Water falls from nowhere, pools briefly on this shard, then cascades off the edge into nothing."),
        (3, 3, "Marketplace Shard", "Beings from different realities trade here. Currency is abstract — memories, emotions, time."),
        (3, 4, "The Great Bridge", "A massive stone bridge connecting the central shard to the southern archipelago. Statues line its rails."),
        (3, 5, "Clockwork Shard", "A shard made entirely of gears and mechanisms. They turn endlessly, measuring something."),
        (3, 6, "Mirror Shard", "The surface is perfectly reflective. Your reflection moves a half-second behind you."),
        (3, 7, "Broken Shard — Edge", "A shard that's crumbling. Pieces drift away slowly. It won't last much longer."),
        # Row 4 — Central-lower
        (4, 1, "The Void — West Pocket", "A bubble of breathable air in the void. Nothing else. Just you and the stars."),
        (4, 2, "Mushroom Shard", "Giant luminescent mushrooms grow from this shard. Their spores drift upward like reverse snow."),
        (4, 3, "Residential Shard — West", "Small dwellings built from void-crystal. Beings who chose to live between worlds."),
        (4, 4, "The Amphitheater", "A natural bowl in a large shard. Seats carved from crystal. Performances happen when reality allows."),
        (4, 5, "Residential Shard — East", "More dwellings. A communal kitchen. The smell of cooking that defies physics."),
        (4, 6, "Forge Shard", "A blacksmith works void-metal on an anvil of compressed starlight. Sparks fall upward."),
        (4, 7, "Broken Shard — Interior", "The inside of the crumbling shard. Tunnels riddle it like worm-eaten wood. Unstable."),
        # Row 5 — Lower band
        (5, 2, "Gravity Well — Edge", "Gravity gets stronger here. A collapsed shard forms a dense core that pulls things inward."),
        (5, 3, "The Descent — Upper", "A spiral staircase carved from a single crystal descends into deeper void."),
        (5, 4, "The Descent — Mid", "Halfway down the spiral. The light from above is fading. New light glows from below — red."),
        (5, 5, "The Descent — Lower", "Near the bottom. The red glow is stronger. Heat rises. Something burns below."),
        (5, 6, "Gravity Well — Core", "The collapsed shard's core. Gravity is twice normal. Movement is exhausting. Treasures are compressed here."),
        # Row 6 — Deep void
        (6, 2, "Dark Shard — Surface", "A shard that absorbs light. Everything is visible only in silhouette. Sound is muffled."),
        (6, 3, "Dark Shard — Caves", "Tunnels within the dark shard. Bioluminescent creatures provide the only light."),
        (6, 4, "The Furnace Shard", "A shard of molten rock. Lava flows in channels. The heat is barely survivable."),
        (6, 5, "The Furnace — Core", "The heart of the burning shard. A phoenix nests here in eternal flame."),
        (6, 6, "Ice Shard — Surface", "A shard of pure ice. The cold is absolute. Your breath freezes before it leaves your lips."),
        (6, 7, "Ice Shard — Caverns", "Inside the ice shard. Frozen creatures are visible within the walls. Some look recent."),
        # Row 7 — Deeper
        (7, 3, "The Graveyard of Shards", "Fragments of destroyed shards drift here. A memorial to worlds that ended."),
        (7, 4, "The Anchor Point", "A massive chain extends downward into absolute darkness. Something is tethered below."),
        (7, 5, "The Whispering Void", "Voices echo here from nowhere. Fragments of conversations from other realities bleed through."),
        (7, 6, "Temporal Shard", "Time moves differently here. You can see yourself arriving and leaving simultaneously."),
        # Row 8 — Abyss edge
        (8, 3, "The Abyss — Edge", "The void gets darker here. Stars are fewer. Something vast moves in the darkness below."),
        (8, 4, "The Abyss — Descent", "Falling — or is it flying? Direction loses meaning. The darkness is absolute."),
        (8, 5, "The Abyss — Floor", "There is a bottom. It's soft, organic, warm. It breathes. You're standing on something alive."),
        # Row 9 — Hidden depths
        (9, 4, "The Dreaming Shard", "A shard where reality is shaped by thought. The landscape shifts with your emotions."),
        (9, 5, "The Forgotten Shard", "A shard that everyone forgets the moment they leave. Notes are pinned everywhere: 'REMEMBER THIS PLACE.'"),
        # Row 10 — Deepest
        (10, 4, "The Origin Point", "Where the first shard broke from the original world. Cracks in reality radiate outward from a single point."),
    ]

    for row, col, name, desc in room_defs:
        flags = ''
        if 'Marketplace' in name or 'Library' in name:
            flags = 'safe'
        elif 'Residential' in name:
            flags = 'safe'
        grid[row][col] = cell(v, name, 'ethereal_drift', desc, flags)
        v += 1

    return write_csv('world_ethereal_drift_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# FORGOTTEN EPOCH (Zone 6) — Time/History, ~80 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_forgotten_epoch():
    """Forgotten Epoch — fragments of history frozen in time."""
    grid = [[''] * 10 for _ in range(11)]
    v = 6001

    room_defs = [
        # Row 0 — Time Nexus
        (0, 4, "Temporal Nexus — Hub", "A chamber where all timelines converge. Clocks of every era line the walls, all showing different times. All correct."),
        (0, 5, "Temporal Nexus — Archives", "Scrolls, tablets, hard drives — records from every age stored in temporal stasis."),
        # Row 1 — Ancient Rome
        (1, 2, "Roman Colosseum — Gate", "The roar of the crowd echoes through stone tunnels. Gladiators prepare for combat ahead."),
        (1, 3, "Roman Colosseum — Arena Floor", "Sand stained dark. The crowd demands blood. Lions pace in cages beneath the stands."),
        (1, 4, "Roman Forum", "Marble columns and political speeches. Senators debate while the empire crumbles around them."),
        (1, 5, "Roman Bathhouse", "Steam rises from heated pools. Mosaics depict conquests. Whispered conspiracies echo off tile."),
        (1, 6, "Roman Aqueduct", "A massive stone waterway stretches across the landscape. Engineering that will outlast the empire."),
        # Row 2 — Ancient Egypt
        (2, 2, "Egyptian Market — Bazaar", "Spices, gold, and papyrus. Merchants haggle in the shadow of monuments to dead gods."),
        (2, 3, "Temple of Ra", "A massive temple to the sun god. Gold leaf catches the light. Priests chant in ancient tongues."),
        (2, 4, "The Sphinx — Base", "The great sphinx stares eastward with knowing eyes. Sand piles against its paws."),
        (2, 5, "Pyramid — Entrance", "The entrance to the great pyramid. Cool air flows from within. Hieroglyphs warn of curses."),
        (2, 6, "Pyramid — Interior", "Narrow passages lead deeper. Torchlight reveals painted walls telling stories of the afterlife."),
        (2, 7, "Pyramid — Burial Chamber", "The pharaoh's final resting place. Gold and treasures surround the sarcophagus. The air is ancient."),
        # Row 3 — Feudal Japan
        (3, 1, "Bamboo Forest — Path", "Tall bamboo sways overhead, creating a green tunnel. The path is worn smooth by countless feet."),
        (3, 2, "Bamboo Forest — Clearing", "A small clearing with a stone lantern. Cherry blossoms drift on the breeze despite no trees nearby."),
        (3, 3, "Feudal Village — Gate", "A torii gate marks the entrance to a small village. Paper lanterns glow in the twilight."),
        (3, 4, "Feudal Village — Center", "Thatched-roof houses surround a central well. A samurai meditates beneath a maple tree."),
        (3, 5, "Dojo — Exterior", "A traditional training hall. The sound of wooden swords clashing comes from within."),
        (3, 6, "Dojo — Interior", "Polished wooden floors. Weapons racks line the walls. A master corrects a student's form."),
        (3, 7, "Castle — Approach", "A winding path leads up to a Japanese castle. Multiple tiers of curved roofs rise above."),
        # Row 4 — Viking Age
        (4, 1, "Fjord — Shore", "A rocky beach at the base of towering cliffs. Longships are beached here, dragon prows facing the sea."),
        (4, 2, "Viking Village — Docks", "A wooden dock where warriors load supplies. The smell of salt and tar."),
        (4, 3, "Viking Village — Mead Hall", "A massive wooden hall. A fire pit runs its length. Warriors feast and boast of battles."),
        (4, 4, "Viking Village — Forge", "A blacksmith hammers a sword on an anvil. Runes are carved into every blade."),
        (4, 5, "Runestone Hill", "A hilltop covered in ancient runestones. Each tells a saga. The wind reads them aloud."),
        (4, 6, "Sacred Grove", "An ancient grove where the Norse gods are worshipped. Offerings hang from branches."),
        # Row 5 — Medieval Crusades
        (5, 2, "Desert Road — Caravan", "A trade caravan rests here. Camels and merchants from distant lands. Spices scent the air."),
        (5, 3, "Desert Fortress — Gate", "A massive stone fortress rises from the sand. Crusader banners fly from the battlements."),
        (5, 4, "Desert Fortress — Courtyard", "Knights in full plate sweat in the desert heat. A well provides precious water."),
        (5, 5, "Desert Fortress — Chapel", "A small stone chapel. Stained glass casts colored light on worn pews. Prayer and war coexist."),
        (5, 6, "Desert Fortress — Tower", "The highest point. The desert stretches endlessly. Dust clouds on the horizon — an army approaches."),
        # Row 6 — Aztec Empire
        (6, 1, "Jungle Path — Overgrown", "Dense jungle presses in from all sides. Macaws screech overhead. The humidity is suffocating."),
        (6, 2, "Jungle Path — River Crossing", "A rope bridge spans a rushing river. The wood is slippery. Crocodiles wait below."),
        (6, 3, "Aztec City — Outskirts", "The jungle gives way to cultivated land. Terraced farms and irrigation channels."),
        (6, 4, "Aztec City — Market", "A vast marketplace. Cacao, obsidian, feathers, and jade. The currency is cacao beans."),
        (6, 5, "Aztec City — Temple Base", "A massive stepped pyramid dominates the city. Stairs climb steeply toward the summit."),
        (6, 6, "Aztec City — Temple Summit", "The top of the pyramid. An altar stained dark. The view of the city is breathtaking."),
        # Row 7 — Wild West
        (7, 2, "Dusty Trail", "A dirt road through scrubland. Tumbleweeds roll past. Vultures circle overhead."),
        (7, 3, "Frontier Town — Main Street", "A one-street town. Saloon, general store, sheriff's office. A tumbleweed rolls past on cue."),
        (7, 4, "Frontier Town — Saloon", "Swinging doors, a piano player, and whiskey that could strip paint. Cards are dealt in the back."),
        (7, 5, "Frontier Town — Sheriff's Office", "Wanted posters cover the wall. A jail cell in the back. The sheriff's badge collects dust."),
        (7, 6, "Frontier Town — Stable", "Horses snort and stamp. The smell of hay and leather. A good horse is worth more than gold."),
        (7, 7, "Canyon — Rim", "A vast canyon stretches below. Layers of red and orange rock. A rope bridge spans the narrowest point."),
        # Row 8 — World War era
        (8, 3, "1940s City — Street", "Art deco buildings and vintage cars. Big band music drifts from a dance hall. The war is overseas."),
        (8, 4, "1940s City — Dance Hall", "Couples swing dance under a glittering ball. The music is loud and joyful. Tomorrow they ship out."),
        (8, 5, "1940s City — War Office", "Maps with pins. Telegraphs clicking. The weight of decisions that cost lives."),
        (8, 6, "1940s City — Train Station", "Steam engines and tearful goodbyes. Soldiers board with brave faces and terrified eyes."),
        # Row 9 — Prehistoric
        (9, 3, "Prehistoric — Savanna", "Tall grass stretches to the horizon. A herd of mammoths moves in the distance. The sky is impossibly blue."),
        (9, 4, "Prehistoric — Cave", "A cave with paintings on the walls. Handprints and hunting scenes. The first art."),
        (9, 5, "Prehistoric — Tar Pits", "Bubbling black tar. Bones of ancient creatures protrude from the surface. The smell is acrid."),
        # Row 10 — Far future fragment
        (10, 4, "Future Fragment — Ruins", "A city from a future that never happened. Hovercars rusted in mid-air. Plants reclaim everything."),
        (10, 5, "Future Fragment — AI Core", "A still-functioning AI in a dead city. It asks questions about a world it can no longer see."),
    ]

    for row, col, name, desc in room_defs:
        flags = ''
        if 'Mead Hall' in name or 'Saloon' in name or 'Dance Hall' in name or 'Bathhouse' in name:
            flags = 'safe,indoors'
        elif 'Temple' in name or 'Chapel' in name or 'Dojo' in name:
            flags = 'safe,indoors'
        elif 'Market' in name or 'Bazaar' in name:
            flags = 'shop'
        elif 'Nexus' in name:
            flags = 'safe'
        grid[row][col] = cell(v, name, 'forgotten_epoch', desc, flags)
        v += 1

    return write_csv('world_forgotten_epoch_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# UNDERCITY (Zone 7) — Sewers/Underground, ~40 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_undercity():
    """The Undercity — labyrinth beneath the Nexus."""
    grid = [[''] * 8 for _ in range(8)]
    v = 7001

    room_defs = [
        (0, 3, "Undercity — Entry Shaft", "A vertical shaft with a rusty ladder. Light from above fades quickly. The smell hits you like a wall."),
        (0, 4, "Undercity — Landing", "The bottom of the shaft. Tunnels branch in multiple directions. Graffiti marks territory."),
        (1, 2, "Sewer Main — West", "A large tunnel with a channel of flowing waste. A narrow walkway runs along one side."),
        (1, 3, "Sewer Main — Junction", "Three tunnels meet here. The water is deeper. Something large splashed around the corner."),
        (1, 4, "Sewer Main — East", "The tunnel narrows. Pipes overhead drip constantly. Rats scatter at your approach."),
        (1, 5, "Maintenance Room", "A small room with valves and gauges. Someone has been sleeping here — a bedroll and empty cans."),
        (2, 1, "Collapsed Tunnel — West", "The tunnel has partially collapsed. Rubble blocks most of the passage. A gap remains."),
        (2, 2, "Mushroom Cavern", "A natural cave where bioluminescent mushrooms grow in clusters. The air is thick with spores."),
        (2, 3, "Underground River — Bank", "An underground river flows through a natural cavern. The water is surprisingly clean."),
        (2, 4, "Underground River — Bridge", "A makeshift bridge of planks and rope spans the river. It sways dangerously."),
        (2, 5, "Rat King's Domain", "A large chamber filled with refuse. Thousands of rats move as one organism. Their king watches."),
        (2, 6, "Forgotten Cistern", "A massive water storage chamber. Empty now. Echoes last forever in here."),
        (3, 1, "Smuggler's Cache", "A hidden room behind a false wall. Crates of contraband. Someone's retirement fund."),
        (3, 2, "The Depths — Upper", "Older tunnels. The stonework is different — pre-Nexus construction. Something was here first."),
        (3, 3, "The Depths — Chamber", "A circular chamber with pillars. Carvings in a language no one reads anymore."),
        (3, 4, "The Depths — Altar", "An ancient altar in the deepest chamber. Dark stains. The air vibrates with old power."),
        (3, 5, "Flooded Passage", "Water fills this tunnel to waist height. The current pulls southward. Cold."),
        (4, 2, "Undercity Market", "A black market in a widened tunnel. Stolen goods, information, and things that shouldn't exist."),
        (4, 3, "The Pit", "A natural sinkhole. Rope ladders descend into darkness. Fighters gather here for underground bouts."),
        (4, 4, "Cultist Hideout", "Robed figures gather around symbols drawn in chalk. They stop chanting when you enter."),
        (4, 5, "Abandoned Lab", "Someone was conducting experiments down here. Broken glass and chemical stains. Notes in frantic handwriting."),
        (5, 2, "Undercity — South Tunnel", "A long straight tunnel heading south. The walls are slick with moisture."),
        (5, 3, "The Hive", "Insectoid creatures have built a nest here from secreted resin. Eggs pulse with dim light."),
        (5, 4, "Crystal Cavern", "Natural crystals jut from every surface. They glow faintly. Beautiful and disorienting."),
        (5, 5, "Exit Shaft — South", "Another vertical shaft. This one leads up to somewhere in the Shattered Crown."),
        (6, 3, "The Warden's Room", "A sealed chamber. Something is imprisoned here. The door has locks on the outside."),
        (6, 4, "Undercity — Dead End", "The tunnel ends at a solid wall. But the wall is warm. And it pulses."),
    ]

    for row, col, name, desc in room_defs:
        flags = ''
        if 'Market' in name:
            flags = 'shop'
        grid[row][col] = cell(v, name, 'undercity', desc, flags)
        v += 1
        if v == 7002:  # Entry shaft connects up to Nexus room 13
            grid[0][3] = cell(7001, name, 'undercity', desc, flags, '', '', '', '', 'up:13')

    return write_csv('world_undercity_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# TRAINING GROUNDS (Zone 8) — Training facilities, ~30 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_training_grounds():
    """Training Grounds — specialized training facilities."""
    grid = [[''] * 7 for _ in range(7)]
    v = 8001

    room_defs = [
        (0, 3, "Training Grounds — Entrance", "A large archway leads into a complex of training facilities. A sign reads: 'Push Beyond Your Limits.'"),
        (1, 2, "Gravity Chamber — Lobby", "A waiting area outside sealed chambers. Monitors display the gravity levels inside. Some show 100x."),
        (1, 3, "Gravity Chamber — 2x", "The air feels heavy. Movement requires effort. A good starting point for gravity training."),
        (1, 4, "Gravity Chamber — 10x", "Every step is a struggle. Your body weighs ten times normal. Sweat pools on the floor instantly."),
        (1, 5, "Gravity Chamber — 50x", "Breathing is labor. Standing is triumph. The strongest warriors train here for minutes at a time."),
        (2, 1, "Obstacle Course — Start", "A complex obstacle course stretches ahead. Walls to climb, pits to jump, targets to hit."),
        (2, 2, "Obstacle Course — Mid", "Swinging pendulums and balance beams. One wrong step and you start over."),
        (2, 3, "Sparring Arena — Center", "A large circular arena with padded floors. Training partners of various skill levels wait."),
        (2, 4, "Sparring Arena — Advanced", "The advanced ring. No padding. The partners here don't pull punches."),
        (2, 5, "Meditation Chamber", "A perfectly silent room. Cushions on the floor. The walls absorb all sound and distraction."),
        (3, 1, "Obstacle Course — End", "The final stretch. Moving targets and timed gates. Your score is displayed on a board."),
        (3, 2, "Weights Room", "Racks of increasingly absurd weights. The heaviest ones have dents in the floor beneath them."),
        (3, 3, "Training Grounds — Central Hub", "The main crossroads of the training complex. Paths lead to different specializations."),
        (3, 4, "Target Range", "Ranged combat training. Targets at various distances. Some move. Some shoot back."),
        (3, 5, "Elemental Chamber — Fire", "A room where controlled flames test your resistance and reflexes. Don't stand still."),
        (4, 2, "Endurance Track", "A circular running track. The surface changes — sand, mud, ice, uphill. It never gets easier."),
        (4, 3, "Combat Simulator", "Holographic enemies appear and attack. Difficulty scales to your level. Defeat is non-lethal but painful."),
        (4, 4, "Elemental Chamber — Ice", "Sub-zero temperatures. Ice forms on everything. Train your body to resist the cold."),
        (4, 5, "Elemental Chamber — Lightning", "Electrical discharges arc between pylons. Dodge or endure. Both build strength."),
        (5, 2, "Recovery Room", "Healing pools and rest areas. Your body repairs faster here. Essential after intense training."),
        (5, 3, "The Gauntlet — Entrance", "A door marked 'THE GAUNTLET.' Beyond it, the ultimate training challenge. Few complete it."),
        (5, 4, "The Gauntlet — Phase 1", "Wave after wave of training constructs. They don't stop until you do."),
        (5, 5, "The Gauntlet — Phase 2", "Harder. Faster. The constructs adapt to your fighting style."),
        (6, 3, "The Gauntlet — Phase 3", "The final phase. A single opponent that matches your exact power level. Victory means growth."),
        (6, 4, "Hall of Records", "A wall of plaques showing the fastest Gauntlet completion times. Your name could be here."),
    ]

    for row, col, name, desc in room_defs:
        flags = 'train'
        if 'Recovery' in name or 'Entrance' in name or 'Lobby' in name or 'Hub' in name:
            flags = 'safe,train'
        elif 'Meditation' in name:
            flags = 'safe'
        grid[row][col] = cell(v, name, 'training_grounds', desc, flags)
        v += 1

    return write_csv('world_training_grounds_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# AFTERLIFE (Zone 9) — Spirit world, ~30 rooms
# ═══════════════════════════════════════════════════════════════════════════════

def generate_afterlife():
    """The Afterlife — spirit realm."""
    grid = [[''] * 7 for _ in range(7)]
    v = 9001

    room_defs = [
        (0, 3, "Gates of the Afterlife", "Massive golden gates stand between the living and the dead. A robed figure checks a very long list."),
        (1, 2, "Spirit Path — West", "A path of clouds stretches westward. Souls drift past like leaves on a river."),
        (1, 3, "Spirit Path — Central", "The main road of the afterlife. Spirits of all kinds travel here. Some remember who they were."),
        (1, 4, "Spirit Path — East", "The path narrows and descends. The light dims. This way leads to darker places."),
        (2, 1, "Heaven's Garden", "An impossible garden of perfect flowers. The temperature is always comfortable. Peace radiates."),
        (2, 2, "Hall of Heroes", "Statues of the greatest warriors who ever lived. Their spirits train here eternally."),
        (2, 3, "The Judgment Hall", "A vast courtroom where deeds are weighed. The scales are impossibly precise."),
        (2, 4, "Purgatory — Waiting Room", "Uncomfortable chairs and old magazines. The wait is eternal. A number dispenser reads '∞.'"),
        (2, 5, "The Dark Descent", "Stairs spiral downward into increasing darkness. Wailing echoes from below."),
        (3, 1, "Elysian Fields", "Rolling green hills under a perpetual golden sunset. The worthy rest here in peace."),
        (3, 2, "Training Grounds of the Dead", "Spirits of warriors spar endlessly. Death has not dulled their skills. If anything, they've improved."),
        (3, 3, "The Crossroads of Souls", "Where paths diverge. Up leads to light. Down leads to shadow. Sideways leads to rebirth."),
        (3, 4, "Limbo — Grey Expanse", "An endless grey plain. Nothing happens here. Nothing ever will. The ultimate punishment: boredom."),
        (3, 5, "Hell's Gate", "A gate of black iron radiating heat. Screams from beyond. A demon bouncer checks the list."),
        (4, 2, "The Reincarnation Pool", "A pool of swirling silver light. Souls step in and emerge as something new. Somewhere new."),
        (4, 3, "Snake Way — Start", "A narrow winding path above clouds. One misstep and you fall to the realm below. It stretches for miles."),
        (4, 4, "Snake Way — Middle", "The path continues endlessly. Your legs burn. The end is not visible. Keep going."),
        (4, 5, "Snake Way — End", "Finally. The path widens to a small planet floating in the void. A tiny house sits on top."),
        (5, 2, "The Forgotten Shore", "A beach of grey sand beside a grey sea. Souls who were forgotten by the living wash up here."),
        (5, 3, "King Kai's Planet", "A tiny planet with its own gravity. A small house, a car, and a monkey. The master trains only the worthy."),
        (5, 4, "The Void Between", "The space between life and death. Nothing exists here. Not even nothing. It's less than nothing."),
        (6, 3, "The Final Gate", "Beyond this, even spirits cannot return. Whatever lies past is truly the end. Or the beginning."),
    ]

    for row, col, name, desc in room_defs:
        flags = ''
        if 'Garden' in name or 'Elysian' in name or 'Hall of Heroes' in name or "Kai's" in name:
            flags = 'safe'
        elif 'Gate' in name:
            flags = 'safe'
        grid[row][col] = cell(v, name, 'afterlife', desc, flags)
        v += 1

    return write_csv('world_afterlife_f1.csv', grid)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("Generating MUD World CSV files...")
    print()
    total = 0
    total += generate_nexus()
    total += generate_shattered_crown()
    total += generate_neon_grid()
    total += generate_midnight_rain()
    total += generate_blood_chrome()
    total += generate_ethereal_drift()
    total += generate_forgotten_epoch()
    total += generate_undercity()
    total += generate_training_grounds()
    total += generate_afterlife()
    print()
    print(f"Total rooms generated: {total}")
    print("Done! Run build_world.py to convert to JSON.")


if __name__ == '__main__':
    main()
