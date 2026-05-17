# MUD Data Architecture Document

## 1. Overview

The MUD utilizes a hybrid architecture:
- **Client-Side (Browser):** Handles the parser, command execution, combat loop, inventory management, and local state (player stats, location, quest flags).
- **Server-Side (Railway Backend):** Handles asynchronous multiplayer features (notes, global bazaar, ghost visions) and account authentication.

This document defines the JSON schemas for the static world data (rooms, mobs, items) and the dynamic state data (player save slice, server API).

## 2. Static World Data Schemas

Static data is loaded into memory when the MUD initializes. It defines the prototypes for all entities in the world.

### 2.1 Room Schema

Rooms define the navigable graph and environmental interactions.

```json
{
  "vnum": 1017,
  "zone": 1,
  "name": "The Throne Room",
  "description": "The ruined throne room of the Shattered Crown. Four massive stone statues surround a central dais.",
  "flags": ["indoors", "no_mob_wander"],
  "exits": {
    "south": {
      "target_vnum": 1016,
      "door": {
        "is_door": true,
        "state": "open",
        "key_vnum": null
      }
    }
  },
  "interactables": [
    {
      "keyword": ["statue", "statues"],
      "description": "Four stone statues depicting ancient kings. They appear to be rotatable.",
      "action": "rotate_statue_puzzle"
    }
  ],
  "initial_mobs": [1050],
  "initial_items": []
}
```

### 2.2 Mob Schema

Mobs define enemies and NPCs.

```json
{
  "vnum": 1050,
  "zone": 1,
  "name": "The Usurper Wraith",
  "keywords": ["usurper", "wraith", "boss"],
  "description": "A spectral figure wearing a crown of embers, hovering above the ground.",
  "tier": "boss",
  "stats": {
    "hp": 200,
    "damage_min": 20,
    "damage_max": 30,
    "ac": 15,
    "speed": 1.2
  },
  "flags": ["aggressive", "undead"],
  "loot_table": [
    { "item_vnum": 1090, "chance": 1.0 },
    { "item_vnum": 1091, "chance": 0.5 }
  ],
  "dialogue": {
    "greet": "You dare enter my domain?",
    "death": "The crown... burns..."
  }
}
```

### 2.3 Item Schema

Items define equipment, consumables, and quest objects.

```json
{
  "vnum": 1090,
  "zone": 1,
  "name": "Crown of Embers",
  "keywords": ["crown", "embers", "headgear"],
  "description": "A blackened iron crown that radiates a faint, unnatural heat.",
  "type": "armor",
  "rarity": "rare",
  "wear_slot": "head",
  "stats": {
    "ac": 8,
    "resist_fire": 10
  },
  "flags": ["magic", "no_drop"],
  "value": 500
}
```

## 3. Dynamic State Schemas

Dynamic data represents the current state of the player and the world, which must be saved and loaded.

### 3.1 Player Save Slice

The player's state is serialized into a JSON object and saved locally (or synced to the server for backup).

```json
{
  "account": {
    "username": "PlayerOne",
    "token": "jwt_token_string"
  },
  "character": {
    "base_class": "fighter",
    "specialization": "knight",
    "genre_echoes": {
      "fantasy": 150,
      "scifi": 20
    },
    "stats": {
      "max_hp": 150,
      "current_hp": 120,
      "attack_power": 15,
      "defense": 25
    },
    "unlocked_abilities": ["shield_bash", "holy_strike"]
  },
  "location": {
    "current_room_vnum": 1017,
    "visited_rooms": [0, 1000, 1001, 1017]
  },
  "inventory": {
    "items": [1090, 1005, 1005],
    "equipped": {
      "head": 1090,
      "body": null,
      "weapon": 1080
    },
    "gold": 1250
  },
  "world_state": {
    "zone_1_statues_aligned": true,
    "zone_2_door_unlocked": false,
    "defeated_bosses": [1050]
  }
}
```

## 4. Server API Architecture

The Railway backend provides RESTful endpoints for asynchronous multiplayer features.

### 4.1 Notes API (Dark Souls Style)

- `GET /api/notes/:room_vnum`
  - Returns a list of notes left by players in the specified room.
  - Response: `[{ "id": "n123", "author": "PlayerTwo", "text": "Beware of ambush ahead.", "rating": 5, "timestamp": "2026-05-10T12:00:00Z" }]`
- `POST /api/notes`
  - Submits a new note. Requires authentication.
  - Payload: `{ "room_vnum": 1017, "text": "Try rotating the statues." }`
- `POST /api/notes/:note_id/rate`
  - Upvotes or downvotes a note.

### 4.2 Global Bazaar API

- `GET /api/bazaar`
  - Returns a paginated list of items currently for sale.
  - Response: `[{ "listing_id": "b456", "seller": "PlayerThree", "item_vnum": 1090, "price": 1000, "expires_at": "..." }]`
- `POST /api/bazaar/list`
  - Lists an item for sale. Removes it from the player's local inventory.
  - Payload: `{ "item_vnum": 1090, "price": 1000 }`
- `POST /api/bazaar/buy/:listing_id`
  - Purchases an item. Deducts gold locally, transfers item to buyer, credits seller asynchronously.

### 4.3 Ghost Visions API

- `POST /api/ghosts/record`
  - Periodically sends a snapshot of the player's recent action to the server.
  - Payload: `{ "room_vnum": 1017, "action": "combat", "target": "The Usurper Wraith" }`
- `GET /api/ghosts/:room_vnum`
  - Retrieves recent ghost snapshots for the current room to display as flavor text.

## 5. Moderation System

The server implements an automated moderation layer for player-generated text (Notes).

- **Profanity Filter:** All incoming `POST /api/notes` requests are checked against a comprehensive blocklist of profanity, slurs, and offensive terms.
- **Action:** If a blocked term is detected, the API returns a `400 Bad Request` with a generic error message ("Note contains inappropriate language"). The note is not saved.
- **Rate Limiting:** To prevent spam, players are limited to posting one note per room per hour, and a maximum of 10 notes globally per day.
