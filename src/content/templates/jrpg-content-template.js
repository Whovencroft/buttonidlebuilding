/**
 * JRPG content template.
 * Purpose: defines routes, party members, encounters, rewards, equipment, and progression nodes.
 */
export const JRPG_CONTENT_TEMPLATE = {
  // Data schema version for content migration management.
  version: 1,
  // Initial route id loaded into save.routeId.
  startRouteId: 'route_id',
  // Initial node id loaded into save.nodeId.
  startNodeId: 'node_id',
  // Starting consumables loaded into save.inventory.
  starterInventory: {
    // Number of HP recovery items.
    potions: 2,
    // Number of MP/skill recovery items.
    ethers: 1
  },
  // Starting equipment map keyed by "memberId" and "memberId:armor".
  starterEquipment: {
    hero: 'bronze_sword',
    'hero:armor': 'leather_tunic'
  },
  // Initial party roster cloned into save.party.
  starterParty: [
    {
      // Stable party member id.
      id: 'hero',
      // Display name for HUD/combat logs.
      name: 'Hero',
      // Maximum HP at full health.
      maxHp: 64,
      // Base attack before weapon bonuses.
      attack: 11,
      // Base defense before armor bonuses.
      defense: 6,
      // Bonus damage when using skill actions.
      skillPower: 5,
      // Default weapon id if no saved override exists.
      weaponId: 'bronze_sword',
      // Default armor id if no saved override exists.
      armorId: 'leather_tunic'
    }
  ],
  // Equipment stat tables used by combat calculations.
  equipment: {
    // Weapon ids mapped to attack bonuses.
    weapons: {
      bronze_sword: {
        // Flat attack increase for equipped member.
        attackBonus: 2
      }
    },
    // Armor ids mapped to defense bonuses.
    armors: {
      leather_tunic: {
        // Flat defense increase for equipped member.
        defenseBonus: 1
      }
    }
  },
  // Enemy templates referenced by route nodes.
  enemies: [
    {
      // Stable enemy id referenced by nodes.enemyId.
      id: 'slime',
      // Display name shown in battle messages.
      name: 'Slime',
      // Enemy maximum HP.
      maxHp: 24,
      // Enemy attack stat.
      attack: 6,
      // Enemy defense stat.
      defense: 2,
      // Enemy skill bonus for advanced encounter systems.
      skillPower: 0
    }
  ],
  // Route map graph with deterministic node order.
  routes: [
    {
      // Stable route id used by save.routeId.
      id: 'frontier_road',
      // Display route name.
      name: 'Frontier Road',
      // Ordered progression nodes for encounter flow.
      nodes: [
        {
          // Stable node id used by save.nodeId and save.clearedNodes.
          id: 'gate',
          // Display node name.
          name: 'Gate Outpost',
          // Enemy template id for this node.
          enemyId: 'slime',
          // Rewards applied on first clear.
          reward: {
            // Potion count to add to inventory.
            potions: 1,
            // Optional equipment id to auto-equip.
            equipment: 'steel_blade_or_null'
          }
        }
      ]
    }
  ]
};

export const JRPG_CONTENT_USAGE = [
  '1) Copy JRPG_CONTENT_TEMPLATE into public/data/jrpg-content.json.',
  '2) Keep route/node/enemy ids unique and stable for save compatibility.',
  '3) Ensure startRouteId/startNodeId point to valid route/node entries.',
  '4) Keep every nodes.enemyId aligned to an existing enemies.id.',
  '5) Keep reward equipment ids aligned to equipment.weapons keys when used.',
  '6) If schema changes, update docs/templates/jrpg-content-template.md in the same pass.'
];

export const JRPG_CONTENT_EXAMPLE = {
  version: 1,
  startRouteId: 'frontier_road',
  startNodeId: 'gate',
  starterInventory: { potions: 2, ethers: 1 },
  starterEquipment: { hero: 'bronze_sword', 'hero:armor': 'leather_tunic' },
  starterParty: [
    {
      id: 'hero',
      name: 'Hero',
      maxHp: 64,
      attack: 11,
      defense: 6,
      skillPower: 5,
      weaponId: 'bronze_sword',
      armorId: 'leather_tunic'
    }
  ],
  equipment: {
    weapons: { bronze_sword: { attackBonus: 2 }, steel_blade: { attackBonus: 4 } },
    armors: { leather_tunic: { defenseBonus: 1 }, chain_mail: { defenseBonus: 3 } }
  },
  enemies: [
    { id: 'slime', name: 'Slime', maxHp: 24, attack: 6, defense: 2, skillPower: 0 }
  ],
  routes: [
    {
      id: 'frontier_road',
      name: 'Frontier Road',
      nodes: [
        { id: 'gate', name: 'Gate Outpost', enemyId: 'slime', reward: { potions: 1, equipment: null } }
      ]
    }
  ]
};
