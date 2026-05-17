# MUD World Design Document

## 1. Global Architecture

The MUD world is structured around a central hub called **The Nexus of Echoes**, which connects physically to six genre-themed zones. Navigation uses a standard room graph with directional exits (N/S/E/W/U/D) and special portal commands from the hub. Players can freely travel between any zone via the hub, though higher-difficulty zones will punish underprepared characters.

### Zone Summary

| Zone ID | Zone Name | Theme | Vnum Range | Rooms | Difficulty |
|---|---|---|---|---|---|
| 0 | The Nexus of Echoes | Central Hub / Surreal | 0000–0099 | 15 | Safe |
| 1 | The Shattered Crown | High Fantasy | 1000–1199 | 30 | Beginner |
| 2 | Neon Grid | Cyberpunk / Sci-Fi | 2000–2199 | 30 | Intermediate |
| 3 | Midnight Rain | Film Noir | 3000–3199 | 25 | Intermediate |
| 4 | Blood & Chrome | 80s Action Flick | 4000–4199 | 25 | Advanced |
| 5 | The Floating Shards | Anime / Wuxia | 5000–5199 | 25 | Advanced |
| 6 | The Forgotten Epoch | Historical / Antiquity | 6000–6199 | 25 | Expert |

**Total planned rooms: ~175.** Each zone follows a three-act structure: an entrance area with easy mobs, a mid-zone with branching paths and moderate mobs, and a boss/puzzle area that gates progression and reveals the next marble clue.

---

## 2. The Nexus of Echoes (Zone 0)

The Nexus is a surreal, shifting space where the laws of physics are loose. It serves as the safe haven, central marketplace, class training hall, and gateway to all zones.

### Key Rooms

| Vnum | Room Name | Purpose |
|---|---|---|
| 0000 | The Arrival Point | Spawn location; marble indentation in dust sets the chase |
| 0001 | The Echoing Corridor | Connects Arrival to main hub areas |
| 0002 | The Whispering Gallery | Asynchronous player notes are displayed here (Dark Souls messages) |
| 0003 | The Armory Alcove | Basic starter gear vendor |
| 0004 | The Healer's Nook | Healing NPC, rest point |
| 0005 | The Global Bazaar | Asynchronous player marketplace (buy/sell) |
| 0006 | The Bazaar Back Room | Rare item listings, high-value trades |
| 0007 | The Training Grounds | Combat tutorial area with practice dummies |
| 0008 | The Hall of Reflections (East Wing) | Fighter and Rogue trainers |
| 0009 | The Hall of Reflections (West Wing) | Mage and Cleric trainers |
| 0010 | The Hall of Reflections (Center) | Class specialization selection |
| 0011 | The Gateway Approach | Corridor leading to zone portals |
| 0012 | The Gateway Chamber | Six archways to the themed zones |
| 0013 | The Chronicler's Study | Lore NPC, note system tutorial |
| 0014 | The Ghost Theater | View replays of other players' actions (visions) |

### Hub NPCs

**The Chronicler** resides in Room 0013. This mysterious, ageless figure explains the asynchronous note system, provides the player with their first notebook (allowing them to leave messages for other players), and offers cryptic hints about the marble's path. The Chronicler has seen the marble pass through and will describe it differently each time the player asks, always with a sense of awe.

**The Merchant of Echoes** manages the Global Bazaar in Room 0005. This NPC provides the interface for listing items at player-set prices and purchasing items left by other players. The Merchant takes no commission and speaks in riddles about the nature of value.

**The Four Masters** occupy the Hall of Reflections (Rooms 0008–0010). Each Master represents one of the four base classes and guides players toward genre specializations once they have gathered enough Genre Echoes from the themed zones.

### The Marble Trail (Hub)

Upon arrival in Room 0000, the player finds a perfectly round indentation pressed into the dust of the pedestal, as if something impossibly heavy rested there briefly. A faint trail of displaced dust leads toward the Gateway Chamber. The Chronicler, when asked, mentions seeing "a perfect sphere of impossible density" roll through one of the six archways. The specific archway it entered is randomized per player, giving each player a unique starting direction for the chase.

---

## 3. Zone 1: The Shattered Crown (High Fantasy)

A ruined kingdom suspended in perpetual twilight. Castle walls crumble under the weight of centuries, and the surrounding forest is overgrown with corrupted magic. The air smells of moss and iron.

### Room Graph

| Vnum | Room Name | Exits | Notes |
|---|---|---|---|
| 1000 | Forest Edge | S→Hub, N→1001 | Zone entrance from Gateway |
| 1001 | The Whispering Woods (South) | S→1000, N→1002 | Easy mobs spawn |
| 1002 | The Whispering Woods (Center) | S→1001, N→1003, E→1004 | Fork in path |
| 1003 | The Whispering Woods (North) | S→1002, N→1006 | Leads to courtyard |
| 1004 | The Mossy Hollow | W→1002, N→1005 | Hidden item location |
| 1005 | The Ruined Shrine | S→1004 | Quest item: tapestry clue 1 |
| 1006 | The Outer Courtyard | S→1003, N→1007, E→1008, W→1010 | Central branching area |
| 1007 | The Castle Gate | S→1006, N→1012 | Locked; requires Silver Key |
| 1008 | The Eastern Tower (Base) | W→1006, U→1009 | Mid-tier mobs |
| 1009 | The Eastern Tower (Top) | D→1008 | Tapestry clue 2 |
| 1010 | The Guardhouse | E→1006, N→1011 | Silver Key location |
| 1011 | The Guardhouse Cellar | S→1010 | Tapestry clue 3 |
| 1012 | The Inner Courtyard | S→1007, N→1016, E→1013, W→1014 | High-tier mobs |
| 1013 | The Chapel Ruins | W→1012 | Tapestry clue 4 |
| 1014 | The Armory | E→1012, N→1015 | Loot room |
| 1015 | The Collapsed Library | S→1014 | Lore, optional puzzle hint |
| 1016 | The Throne Room Antechamber | S→1012, N→1017 | Pre-boss area |
| 1017 | The Throne Room | S→1016 | Boss: The Usurper Wraith; main puzzle |

### Mobs

| Name | Tier | HP | Damage | Drops |
|---|---|---|---|---|
| Corrupted Treant | Low | 30 | 4–8 | Splintered Bark, Potion of Minor Healing |
| Shadow Wolf | Low | 25 | 6–10 | Wolf Pelt, Raw Meat |
| Undead Royal Guard | Mid | 60 | 10–16 | Rusted Chainmail, Iron Longsword |
| Cursed Archer | Mid | 45 | 12–18 | Shortbow, Quiver of Arrows |
| The Usurper Wraith | Boss | 200 | 20–30 | Crown of Embers (Rare), Dark Scepter |

### Key Items

| Item | Type | Rarity | Location | Purpose |
|---|---|---|---|---|
| The Silver Key | Quest | N/A | Room 1010 (Guardhouse) | Unlocks Castle Gate (1007) |
| Tapestry Fragment (x4) | Quest | N/A | Rooms 1005, 1009, 1011, 1013 | Clues for Throne Room puzzle |
| Potion of Minor Healing | Consumable | Common | Mob drops | Restores 20 HP |
| Knight's Broadsword | Weapon | Uncommon | Room 1014 (Armory) | 12–18 damage |
| Rusted Chainmail | Armor (Body) | Common | Mob drop | +5 AC |
| Crown of Embers | Armor (Head) | Rare | Boss drop | +8 AC, fire resist |

### The Puzzle: The Altar of the True King

In the Throne Room (1017), four stone statues surround a central throne. Each statue can be rotated to face one of four directions. The correct configuration is encoded in the four tapestry fragments found throughout the zone. Each tapestry depicts a cardinal direction through imagery (a rising sun for East, a setting sun for West, a star for North, a river flowing South). The player must `rotate statue 1 east`, `rotate statue 2 north`, etc.

**Marble Clue:** Once the statues are correctly aligned, the throne slides backward with a grinding roar, revealing a perfectly smooth, circular tunnel leading downward. A faint rolling sound echoes from the darkness below. The tunnel is too small for the player to follow — the marble has escaped deeper.

---

## 4. Zone 2: Neon Grid (Cyberpunk / Sci-Fi)

A rain-slicked, neon-lit metropolis where mega-corporations rule from glass towers and scavengers fight over scraps in the gutters below. The air tastes of ozone and synthetic food.

### Room Graph

| Vnum | Room Name | Exits | Notes |
|---|---|---|---|
| 2000 | Sector 4 Gate | S→Hub, N→2001 | Zone entrance |
| 2001 | Noodle Alley | S→2000, N→2002, E→2003 | Flavor NPCs, cheap food |
| 2002 | The Gutter Market | S→2001, N→2005, W→2004 | Vendor, low mobs |
| 2003 | Back Alley Clinic | W→2001 | Severed Cyber-Eye location |
| 2004 | Scavenger Den | E→2002 | Low-tier mob camp |
| 2005 | Main Street (South) | S→2002, N→2006 | Transition to mid-zone |
| 2006 | Main Street (Central) | S→2005, N→2007, E→2008, W→2009 | Hub of mid-zone |
| 2007 | Main Street (North) | S→2006, N→2012 | Leads to Data Exchange |
| 2008 | The Neon Bar | W→2006 | NPC info, side quest |
| 2009 | Abandoned Parking Garage | E→2006, U→2010 | Mid-tier mobs |
| 2010 | Garage Rooftop | D→2009, N→2011 | Power Cell location |
| 2011 | Maintenance Catwalk | S→2010 | Shortcut, hidden loot |
| 2012 | Data Exchange Lobby | S→2007, N→2013, U→2015 | Security checkpoint |
| 2013 | Security Office | S→2012, E→2014 | Encrypted Keycard drop |
| 2014 | Server Room B | W→2013 | Lore terminal |
| 2015 | Data Exchange (Floor 2) | D→2012, U→2016, N→2017 | Mid-tier security mobs |
| 2016 | Data Exchange (Floor 3) | D→2015, N→2018 | High-tier mobs |
| 2017 | Executive Lounge | S→2015 | Optional loot |
| 2018 | Biometric Door | S→2016, N→2019 | Puzzle gate (requires eye + cell) |
| 2019 | The Mainframe Core | S→2018 | Boss: Cyber-Ninja Assassin |

### Mobs

| Name | Tier | HP | Damage | Drops |
|---|---|---|---|---|
| Alley Scavenger | Low | 25 | 5–9 | Scrap Metal, Energy Drink |
| Street Punk | Low | 30 | 6–10 | Switchblade, Stim-Patch |
| CorpSec Drone | Mid | 55 | 12–18 | Kevlar Vest, Stun Baton |
| Security Chief | Mid | 70 | 14–20 | Encrypted Keycard, Shock Rifle |
| Cyber-Ninja Assassin | Boss | 220 | 22–34 | Monomolecular Blade (Rare), Neural Cloak |

### Key Items

| Item | Type | Rarity | Location | Purpose |
|---|---|---|---|---|
| Severed Cyber-Eye | Quest | N/A | Room 2003 (Clinic) | Combine with Power Cell for biometric |
| Power Cell | Quest | N/A | Room 2010 (Rooftop) | Combine with Eye for biometric |
| Encrypted Keycard | Quest | N/A | Room 2013 (Security) | Opens elevator to Floor 2 |
| Stim-Patch | Consumable | Common | Mob drops | Restores 25 HP + speed buff |
| Kevlar Vest | Armor (Body) | Common | Mob drop | +6 AC |
| Hacker's Neural Interface | Armor (Head) | Uncommon | Room 2017 | +4 AC, bonus to tech abilities |
| Monomolecular Blade | Weapon | Rare | Boss drop | 18–28 damage, armor pierce |

### The Puzzle: The Biometric Override

The door at Room 2018 requires a retinal scan. The player must `combine cyber-eye power-cell` to create a *Charged Cyber-Eye*, then `use charged-eye scanner` at the biometric door. The eye is found in the Back Alley Clinic (a black-market surgeon's table), and the Power Cell is on the Garage Rooftop (pulled from a defunct security drone).

**Marble Clue:** Inside the Mainframe Core, the central data pillar has been smashed open from the inside. A security hologram plays on loop, showing a small, incredibly dense sphere shattering the reinforced glass casing and dropping into the cooling vents below. The vents are sealed — the marble has escaped into the infrastructure.

---

## 5. Zone 3: Midnight Rain (Film Noir)

A black-and-white city drenched in perpetual rain. Jazz drifts from smoky clubs, streetlights reflect off wet cobblestones, and everyone has a secret they would kill to protect.

### Room Graph

| Vnum | Room Name | Exits | Notes |
|---|---|---|---|
| 3000 | The Pier | S→Hub, N→3001, E→3002 | Zone entrance, foggy |
| 3001 | Warehouse Row | S→3000, N→3003 | Low mobs, crates |
| 3002 | The Fishmonger's | W→3000 | Photo fragment 1 |
| 3003 | Dock Street | S→3001, N→3005, E→3004 | Transition area |
| 3004 | The Pawn Shop | W→3003 | Vendor NPC |
| 3005 | Downtown (South) | S→3003, N→3006, W→3007 | Mid-zone start |
| 3006 | Downtown (Central) | S→3005, N→3008, E→3009 | Main intersection |
| 3007 | The Blue Note Club | E→3005 | NPC info, atmosphere |
| 3008 | Downtown (North) | S→3006, N→3012 | Leads to uptown |
| 3009 | The Alley Behind the Club | W→3006, N→3010 | Photo fragment 2 |
| 3010 | Fire Escape | S→3009, U→3011 | Shortcut up |
| 3011 | Rooftop | D→3010 | Photo fragment 3, overlook |
| 3012 | Uptown Gate | S→3008, N→3013 | Guarded, mid-tier mobs |
| 3013 | The Grand Hotel Lobby | S→3012, U→3014, E→3015 | Elegant, NPCs |
| 3014 | Hotel Corridor | D→3013, N→3016 | Leads to penthouse |
| 3015 | The Hotel Bar | W→3013 | NPC: informant |
| 3016 | Penthouse Entrance | S→3014, N→3017 | Locked; requires defeating guards |
| 3017 | The Penthouse | S→3016 | Boss: Don Falcone; wall safe puzzle |

### Mobs

| Name | Tier | HP | Damage | Drops |
|---|---|---|---|---|
| Dock Thug | Low | 28 | 5–9 | Brass Knuckles, Pack of Cigarettes |
| Pickpocket | Low | 20 | 4–7 | Stolen Wallet, Lockpick |
| Corrupt Detective | Mid | 55 | 11–17 | Snub-nosed Revolver, Trenchcoat |
| Hotel Bodyguard | Mid | 65 | 13–19 | Tommy Gun Ammo, Fine Suit |
| Don "The Hammer" Falcone | Boss | 180 | 18–28 | Tommy Gun (Rare), Gold Ring |

### Key Items

| Item | Type | Rarity | Location | Purpose |
|---|---|---|---|---|
| Torn Photograph (x3) | Quest | N/A | Rooms 3002, 3009, 3011 | Combine for safe combination |
| Flask of Whiskey | Consumable | Common | Various | Restores 15 HP |
| Snub-nosed Revolver | Weapon | Common | Mob drop | 10–16 damage |
| Trenchcoat | Armor (Body) | Uncommon | Mob drop | +5 AC, +stealth |
| Fedora | Armor (Head) | Uncommon | Room 3007 (Club) | +3 AC, +evasion |
| Tommy Gun | Weapon | Rare | Boss drop | 16–24 damage, multi-hit |

### The Puzzle: The Wall Safe

In the Penthouse (3017), after defeating Don Falcone, a painting on the wall can be examined to reveal a wall safe. The player must `combine photograph photograph photograph` to assemble the full image, which depicts a clock face with hands pointing to 3, 7, and 11. The command `open safe 3-7-11` unlocks it.

**Marble Clue:** Inside the safe there is no money — only a perfectly round hole punched straight through the back of the heavy steel safe and into the brick wall behind it, as if a cannonball had been fired at point-blank range. Dust still trickles from the edges.

---

## 6. Zone 4: Blood & Chrome (80s Action Flick)

A jungle compound heavily fortified by a rogue military faction. Explosive barrels litter every clearing, helicopter pads sit idle, and the air is thick with the smell of gunpowder and diesel. Everything is one spark away from detonation.

### Room Graph

| Vnum | Room Name | Exits | Notes |
|---|---|---|---|
| 4000 | Jungle Trail | S→Hub, N→4001 | Zone entrance |
| 4001 | Dense Undergrowth | S→4000, N→4002, E→4003 | Tripwires, low mobs |
| 4002 | Jungle Clearing | S→4001, N→4005 | Patrol route |
| 4003 | Hidden Stream | W→4001, N→4004 | Rest point |
| 4004 | Sniper's Perch | S→4003 | Launch Code 1 |
| 4005 | Perimeter Fence | S→4002, N→4006 | Transition to camp |
| 4006 | Camp Entrance | S→4005, N→4007, E→4008 | Guard checkpoint |
| 4007 | The Mess Hall | S→4006, N→4010, W→4009 | NPCs, food consumables |
| 4008 | The Motor Pool | W→4006 | Vehicles (flavor), loot |
| 4009 | The Barracks | E→4007, N→4011 | Mid-tier mobs, Launch Code 2 |
| 4010 | The Armory | S→4007, N→4012 | Weapons vendor/loot |
| 4011 | Officer's Quarters | S→4009 | Launch Code 3 |
| 4012 | The Helipad | S→4010, N→4013 | Open area, heavy mobs |
| 4013 | Bunker Entrance | S→4012, D→4014 | Locked; requires C4 |
| 4014 | Bunker Corridor | U→4013, N→4015, E→4016 | Underground |
| 4015 | The Control Room | S→4014 | Launch terminal puzzle |
| 4016 | The Missile Silo | W→4014 | Boss: General Iron Blood |

### Mobs

| Name | Tier | HP | Damage | Drops |
|---|---|---|---|---|
| Jungle Patroller | Low | 30 | 6–10 | Combat Knife, MRE |
| Guard Dog | Low | 22 | 8–12 | Dog Tags |
| Heavy Gunner | Mid | 65 | 14–20 | Flak Jacket, Assault Rifle |
| Elite Officer | Mid | 75 | 16–22 | Launch Code, Officer's Pistol |
| General "Iron" Blood | Boss | 250 | 24–36 | Rocket Launcher (Rare), Medal of Valor |

### Key Items

| Item | Type | Rarity | Location | Purpose |
|---|---|---|---|---|
| C4 Explosive | Quest | N/A | Room 4010 (Armory) | Blow open bunker door (4013) |
| Launch Code Alpha | Quest | N/A | Room 4004 | Part of abort sequence |
| Launch Code Bravo | Quest | N/A | Room 4009 | Part of abort sequence |
| Launch Code Charlie | Quest | N/A | Room 4011 | Part of abort sequence |
| First Aid Kit | Consumable | Uncommon | Various | Restores 40 HP |
| MRE | Consumable | Common | Mob drops | Restores 10 HP |
| Assault Rifle | Weapon | Uncommon | Mob drop | 14–22 damage |
| Flak Jacket | Armor (Body) | Uncommon | Mob drop | +8 AC |
| Aviator Sunglasses | Armor (Head) | Uncommon | Room 4008 | +2 AC, +charisma |
| Rocket Launcher | Weapon | Rare | Boss drop | 30–50 damage, slow |

### The Puzzle: The Launch Abort Sequence

In the Control Room (4015), a countdown timer is running. The player must enter the three launch codes in the correct order at the terminal: `enter code alpha`, `enter code bravo`, `enter code charlie`. The correct order is alphabetical (hinted by NATO phonetic alphabet posters on the bunker walls). Entering them wrong resets the puzzle and spawns additional guards.

**Marble Clue:** When the abort succeeds, the escape hatch opens to reveal the missile's warhead has been completely hollowed out. A smooth, spherical groove rests at the center where the marble nested, and the metal is still hot from whatever rested there moments ago.

---

## 7. Zone 5: The Floating Shards (Anime / Wuxia)

A series of floating islands connected by shimmering energy bridges, adorned with cherry blossoms, ancient dojos, and gravity-defying architecture. The sky is an eternal sunset of gold and violet.

### Room Graph

| Vnum | Room Name | Exits | Notes |
|---|---|---|---|
| 5000 | The Stone Stairway | S→Hub, N→5001 | Zone entrance, ascending |
| 5001 | The Blossom Path (South) | S→5000, N→5002 | Serene, training dummies |
| 5002 | The Blossom Path (North) | S→5001, N→5003, E→5004 | Fork |
| 5003 | The Garden of Stones | S→5002, N→5007 | Meditation spot, lore |
| 5004 | The Waterfall Ledge | W→5002 | Hidden item |
| 5005 | The First Bridge | S→5003, N→5006 | Energy bridge, scenic |
| 5006 | The Training Grounds | S→5005, N→5007 | Practice area |
| 5007 | Sky Dojo (Entrance) | S→5003, N→5008, E→5009, W→5010 | Main dojo hub |
| 5008 | Sky Dojo (Main Hall) | S→5007, N→5012, U→5011 | Central training hall |
| 5009 | The Meditation Chamber | W→5007 | Haiku clue location |
| 5010 | The Sparring Arena | E→5007 | Mid-tier mobs, duels |
| 5011 | The Bell Tower | D→5008 | Brazier: Wind |
| 5012 | The Inner Sanctum | S→5008, N→5013, E→5014, W→5015 | High-tier area |
| 5013 | The Elemental Hall | S→5012 | Braziers: Earth, Water, Fire |
| 5014 | The Armory of the Masters | W→5012 | Rare gear |
| 5015 | The Scroll Repository | E→5012 | Scroll of the Void location |
| 5016 | The Second Bridge | S→5012, N→5017 | Requires Scroll of the Void |
| 5017 | The Apex Pagoda (Base) | S→5016, U→5018 | Pre-boss |
| 5018 | The Apex Pagoda (Summit) | D→5017 | Boss: Grandmaster Shin |

### Mobs

| Name | Tier | HP | Damage | Drops |
|---|---|---|---|---|
| Novice Monk | Low | 28 | 5–9 | Wooden Bokken, Rice Ball |
| Training Golem | Low | 35 | 7–11 | Stone Fragment |
| Wind Adept | Mid | 60 | 12–18 | Silk Gi, Steel Katana |
| Shadow Disciple | Mid | 55 | 14–20 | Smoke Bomb, Throwing Stars |
| Grandmaster Shin | Boss | 240 | 22–32 | Blade of the Four Winds (Rare), Master's Sash |

### Key Items

| Item | Type | Rarity | Location | Purpose |
|---|---|---|---|---|
| Scroll of the Void | Quest | N/A | Room 5015 | Activates Second Bridge (5016) |
| Haiku Scroll | Quest | N/A | Room 5009 | Clue for brazier order |
| Rice Ball | Consumable | Common | Mob drops | Restores 12 HP |
| Healing Tea | Consumable | Uncommon | Room 5003 | Restores 30 HP + focus |
| Steel Katana | Weapon | Uncommon | Mob drop | 14–20 damage |
| Silk Gi | Armor (Body) | Uncommon | Mob drop | +6 AC, +agility |
| Headband of Focus | Armor (Head) | Uncommon | Room 5014 | +4 AC, +ability power |
| Blade of the Four Winds | Weapon | Rare | Boss drop | 20–30 damage, wind element |

### The Puzzle: The Elements Alignment

In the Elemental Hall (5013) and Bell Tower (5011), four braziers represent Earth, Water, Fire, and Wind. They must be lit in the correct order using `light brazier [element]`. The order is encoded in a haiku found in the Meditation Chamber (5009):

> *"Earth holds the mountain,*
> *Water carves the ancient stone,*
> *Fire births the wind."*

The correct order is: Earth → Water → Fire → Wind.

**Marble Clue:** Defeating Grandmaster Shin reveals he was guarding a sacred artifact on a silk cushion atop a pedestal. He steps aside reverently, but the pedestal is empty. A perfectly round indentation remains in the silk, and a trail of crushed cherry blossoms leads off the edge of the floating island into the void below.

---

## 8. Zone 6: The Forgotten Epoch (Historical / Antiquity)

A sprawling ancient city in the style of Rome and Greece, half-buried in desert sand. A massive colosseum dominates the skyline, and beneath the city lies a labyrinthine catacomb where an emperor was buried with his secrets.

### Room Graph

| Vnum | Room Name | Exits | Notes |
|---|---|---|---|
| 6000 | The Sand Gate | S→Hub, N→6001 | Zone entrance, desert wind |
| 6001 | The Sunken Forum (South) | S→6000, N→6002, E→6003 | Ruined pillars |
| 6002 | The Sunken Forum (North) | S→6001, N→6005, W→6004 | Low mobs |
| 6003 | The Bathhouse Ruins | W→6001 | Rest point, lore |
| 6004 | The Merchant's Stall | E→6002 | Vendor NPC |
| 6005 | The Colosseum Approach | S→6002, N→6006 | Impressive vista |
| 6006 | The Colosseum Gate | S→6005, N→6007 | Ticket/entry |
| 6007 | The Colosseum Stands | S→6006, D→6008 | Spectator area, NPC |
| 6008 | The Gladiator Pit | U→6007, N→6009, E→6010 | Combat waves |
| 6009 | The Champion's Cell | S→6008 | Post-victory, Golden Laurel |
| 6010 | The Holding Cells | W→6008 | Prisoners, lore |
| 6011 | The Emperor's Box | U→6007 | Lever location (after trial) |
| 6012 | The Hidden Stairway | D→6011 | Revealed by lever |
| 6013 | Catacombs Entrance | U→6012, N→6014, E→6015 | Dark, torches needed |
| 6014 | Catacombs (West Passage) | S→6013, N→6016 | Traps |
| 6015 | Catacombs (East Passage) | W→6013, N→6017 | Mobs |
| 6016 | Catacombs (Deep West) | S→6014, E→6018 | Dead end with loot |
| 6017 | Catacombs (Deep East) | S→6015, W→6018 | Mid-tier mobs |
| 6018 | The Emperor's Antechamber | W→6016, E→6017, N→6019 | Pre-boss |
| 6019 | The Emperor's Tomb | S→6018 | Boss: Emperor's Shade |

### Mobs

| Name | Tier | HP | Damage | Drops |
|---|---|---|---|---|
| Feral Lion | Low | 32 | 7–11 | Animal Pelt, Raw Meat |
| Sand Bandit | Low | 28 | 6–10 | Crude Spear, Coin Pouch |
| Undead Gladiator | Mid | 65 | 13–19 | Bronze Breastplate, Gladius |
| Catacomb Guardian | Mid | 70 | 15–21 | Ancient Shield, Bone Dust |
| Emperor's Shade | Boss | 260 | 24–34 | Aegis Shield (Rare), Imperial Crown |

### Key Items

| Item | Type | Rarity | Location | Purpose |
|---|---|---|---|---|
| Golden Laurel | Quest | N/A | Room 6009 (after trial) | Opens Emperor's Box lever |
| Torch | Quest | N/A | Room 6004 (Merchant) | Required for catacombs |
| Amphora of Wine | Consumable | Common | Various | Restores 15 HP |
| Raw Meat | Consumable | Common | Mob drop | Restores 8 HP |
| Gladius | Weapon | Common | Mob drop | 10–16 damage |
| Bronze Breastplate | Armor (Body) | Uncommon | Mob drop | +7 AC |
| Centurion's Helm | Armor (Head) | Uncommon | Room 6016 | +5 AC, +intimidation |
| Aegis Shield | Armor (Shield) | Rare | Boss drop | +12 AC, reflect damage |

### The Puzzle: The Gladiator's Trial

To access the catacombs, the player must first survive three waves of combat in the Gladiator Pit (6008). Wave 1: two Feral Lions. Wave 2: two Undead Gladiators. Wave 3: a Catacomb Guardian. After victory, the Champion's Cell (6009) opens, containing the Golden Laurel. The player then takes the Laurel to the Emperor's Box (6011) and `use laurel pedestal` to activate a lever that opens the Hidden Stairway (6012) leading down to the catacombs.

**Marble Clue:** Deep in the Emperor's Tomb, the sarcophagus has been breached. A perfectly round hole is bored through the heavy stone lid as if drilled by something spinning at impossible speed. Inside, the dust is disturbed by a spherical track leading deeper into the earth — into passages too narrow and too deep for any person to follow.

---

## 9. The Marble Chase: Meta-Puzzle Structure

The marble is always one step ahead of the player. It never appears directly (except in the final confrontation), but its presence is felt through environmental storytelling.

### Chase Progression

Each zone contains one **Marble Clue** — a piece of environmental evidence that the marble passed through. These clues serve two purposes: they confirm the player is on the right track, and they collectively build toward the final confrontation.

| Zone | Clue Type | Evidence |
|---|---|---|
| Hub | Trace | Round indentation in dust, Chronicler testimony |
| Fantasy | Sound | Rolling sound in a revealed tunnel |
| Sci-Fi | Visual | Security footage of the marble smashing glass |
| Noir | Physical | Hole punched through steel safe |
| Action | Thermal | Hot spherical groove in hollowed warhead |
| Anime | Absence | Empty pedestal, crushed blossoms trailing off edge |
| Historical | Geological | Hole bored through stone, track in dust |

### The Final Confrontation

After completing all six zone puzzles, the player returns to the Hub. The Chronicler reveals that the marble has been circling back — it is now trapped in the Gateway Chamber, bouncing between the six sealed archways. The player must use knowledge from all six puzzles to corner it. The specific ending depends on the player's class specialization and which zone they completed last.

---

## 10. Class Specialization System

### Base Classes and Genre Variants

| Base Class | Fantasy | Sci-Fi | Noir | Action | Anime | Historical |
|---|---|---|---|---|---|---|
| **Fighter** | Knight | Mech Pilot | Enforcer | Commando | Samurai | Gladiator |
| **Mage** | Sorcerer | Hacker | Occultist | Demolitions | Elementalist | Oracle |
| **Rogue** | Assassin | Cyber-Thief | Detective | Infiltrator | Ninja | Scavenger |
| **Cleric** | Paladin | Field Medic | Grifter | Combat Medic | Monk | Priest |

### Progression: Genre Echoes

Defeating mobs and bosses in a specific zone grants **Genre Echoes** (e.g., Fantasy Echoes, Sci-Fi Echoes). Players spend these Echoes at the Four Masters in the Hub to unlock abilities for their chosen specialization. A player can mix and match abilities from different specializations if they gather enough Echoes from multiple zones, allowing for hybrid builds.

### Ability Unlocks (Example: Fighter)

| Echoes Required | Knight (Fantasy) | Commando (Action) | Samurai (Anime) |
|---|---|---|---|
| 10 | Shield Bash | Suppressing Fire | Quick Draw |
| 25 | Holy Strike | Frag Grenade | Blade Dance |
| 50 | Rallying Cry | Adrenaline Rush | Bushido Stance |
| 100 | Divine Aegis | One-Man Army | Thousand Cuts |

---

## 11. Asynchronous Multiplayer Systems

### Player Notes (Dark Souls Style)

Players can leave short messages (max 140 characters) at any room using `write note [message]`. Other players will see these notes when they enter the room. Notes can be rated helpful or unhelpful by other players; highly-rated notes persist longer. An automated moderation filter screens for profanity and slurs before a note becomes visible.

### Ghost Visions

At random intervals, players may see a brief "ghost" replay of another player's recent actions in the same room — a translucent figure performing an action (fighting a mob, solving a puzzle step, dying). These are purely visual flavor and provide no mechanical advantage, but they reinforce the sense of a shared world.

### The Global Bazaar

The marketplace in Room 0005 allows players to list items for sale at prices they set. Other players can browse and purchase. Items are removed from the seller's inventory immediately upon listing. If an item doesn't sell within 7 real-time days, it is returned to the seller's inventory (or mailed to them if full). The Merchant of Echoes NPC facilitates all transactions.

---

## 12. Endings

The game features multiple endings, all culminating in the capture of the marble. The ending is determined by three factors:

1. **Last zone completed** — determines the setting of the final confrontation.
2. **Primary class specialization** — determines how the player captures the marble.
3. **Side-puzzle completion** — determines the richness of the ending narrative.

### Example Endings

**Sci-Fi / Hacker:** The player corners the marble in a virtual construct within the Mainframe. Using their hacking abilities, they trap it in a localized gravity well subroutine, finally containing its impossible momentum.

**Fantasy / Knight:** The player confronts the marble in the Throne Room. Drawing upon the power of the Crown of Embers, they create a ring of divine fire that the marble cannot escape, and it finally comes to rest at their feet.

**Noir / Detective:** The player deduces the marble's pattern — it always runs from noise. In the silent, rain-soaked penthouse, they simply wait. The marble rolls in, finding nowhere left to flee, and stops.

**Anime / Samurai:** The player achieves perfect stillness atop the Apex Pagoda. The marble, sensing no threat, returns of its own accord, rolling gently into the player's open palm.

All endings transition the player back to the host game with the marble secured, unlocking the next phase of Button Idle Building.
