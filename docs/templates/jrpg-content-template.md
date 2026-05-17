# JRPG Content Template

## Purpose
Defines reusable JRPG content for route traversal, party setup, enemy encounters, equipment, node rewards, and completion progression.

## Template Definition
```js
{
  version: 1,
  startRouteId: 'route_id',
  startNodeId: 'node_id',
  starterInventory: { potions: 2, ethers: 1 },
  starterEquipment: { hero: 'bronze_sword', 'hero:armor': 'leather_tunic' },
  starterParty: [{
    id: 'hero', name: 'Hero', maxHp: 64, attack: 11, defense: 6, skillPower: 5,
    weaponId: 'bronze_sword', armorId: 'leather_tunic'
  }],
  equipment: {
    weapons: { bronze_sword: { attackBonus: 2 } },
    armors: { leather_tunic: { defenseBonus: 1 } }
  },
  enemies: [{ id: 'slime', name: 'Slime', maxHp: 24, attack: 6, defense: 2, skillPower: 0 }],
  routes: [{
    id: 'frontier_road',
    name: 'Frontier Road',
    nodes: [{ id: 'gate', name: 'Gate Outpost', enemyId: 'slime', reward: { potions: 1, equipment: null } }]
  }]
}
```

## Field Reference
- `version` (number, required): content schema version.
- `startRouteId` (string, required): initial route id.
- `startNodeId` (string, required): initial node id.
- `starterInventory` (object, required): initial consumables.
- `starterEquipment` (object, required): initial weapon/armor mapping by member keys.
- `starterParty` (array<object>, required): party member stat blocks.
- `equipment.weapons` (object, required): weapon attack bonuses.
- `equipment.armors` (object, required): armor defense bonuses.
- `enemies` (array<object>, required): encounter enemy templates.
- `routes` (array<object>, required): route definitions containing ordered `nodes`.
- `nodes.enemyId` (string, required): enemy template reference.
- `nodes.reward` (object, optional): deterministic post-battle rewards.

## Usage Instructions
1. Add/update content in `public/data/jrpg-content.json` using this schema.
2. Keep route/node/member/enemy ids stable once released.
3. Ensure `startRouteId` and `startNodeId` point to existing entries.
4. Ensure each `nodes.enemyId` references an existing enemy template.
5. Ensure reward equipment ids exist in `equipment.weapons` when present.
6. Update runtime template and this doc in the same pass if schema changes.

## Extension Rules
- Do not remove required fields.
- Add new combat fields only with matching runtime logic.
- Keep rewards deterministic unless runtime explicitly adds RNG.
- If save structure changes, add a new migration under `src/core/state/migration`.

## Example Instance
```js
{
  version: 1,
  startRouteId: 'frontier_road',
  startNodeId: 'gate',
  starterInventory: { potions: 2, ethers: 1 },
  starterEquipment: { hero: 'bronze_sword', 'hero:armor': 'leather_tunic' },
  starterParty: [{
    id: 'hero', name: 'Hero', maxHp: 64, attack: 11, defense: 6, skillPower: 5,
    weaponId: 'bronze_sword', armorId: 'leather_tunic'
  }],
  equipment: {
    weapons: { bronze_sword: { attackBonus: 2 }, steel_blade: { attackBonus: 4 } },
    armors: { leather_tunic: { defenseBonus: 1 }, chain_mail: { defenseBonus: 3 } }
  },
  enemies: [{ id: 'slime', name: 'Slime', maxHp: 24, attack: 6, defense: 2, skillPower: 0 }],
  routes: [{
    id: 'frontier_road',
    name: 'Frontier Road',
    nodes: [{ id: 'gate', name: 'Gate Outpost', enemyId: 'slime', reward: { potions: 1, equipment: null } }]
  }]
}
```
