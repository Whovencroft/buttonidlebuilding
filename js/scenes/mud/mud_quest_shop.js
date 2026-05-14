/**
 * mud_quest_shop.js — Quest Point Shop
 *
 * A special shop at room 150 (Quest Reward Depot) where players spend
 * Quest Points (QP) instead of gold. Inventory is a curated catalog
 * of equipment, consumables, and special items.
 *
 * Commands (registered via integration):
 *   qshop           — List the shop's wares
 *   qbuy <name|#>   — Purchase an item with QP
 *
 * Exposes window.MudQuestShop for integration.
 */
(() => {
  'use strict';

  const QUEST_SHOP_ROOM = 150;

  /**
   * Shop catalog — each entry has a display name, item vnum to give,
   * QP cost, and a short description.
   * Items reference vnums from the expanded item pool (200+).
   */
  const CATALOG = [
    // ─── Weapons ───
    { name: 'Iron Longsword',       vnum: 200, cost: 5,  desc: 'A sturdy blade. +4 attack.' },
    { name: 'Steel Rapier',         vnum: 201, cost: 8,  desc: 'Quick and precise. +6 attack.' },
    { name: 'War Hammer',           vnum: 202, cost: 10, desc: 'Heavy and brutal. +8 attack.' },
    { name: 'Shadow Dagger',        vnum: 203, cost: 7,  desc: 'Whisper-quiet. +5 attack.' },
    { name: 'Arcane Staff',         vnum: 204, cost: 12, desc: 'Channels focus. +7 attack, +10 max focus.' },
    { name: 'Plasma Cutter',        vnum: 210, cost: 15, desc: 'Sci-fi sidearm. +10 attack.' },
    { name: 'Runic Greataxe',       vnum: 211, cost: 18, desc: 'Glowing runes. +12 attack.' },

    // ─── Armor ───
    { name: 'Chainmail Vest',       vnum: 220, cost: 6,  desc: 'Reliable protection. +4 defense.' },
    { name: 'Plated Cuirass',       vnum: 221, cost: 10, desc: 'Heavy plate. +7 defense.' },
    { name: 'Stealth Suit',         vnum: 222, cost: 8,  desc: 'Lightweight. +3 defense, +2 attack.' },
    { name: 'Energy Shield Module', vnum: 223, cost: 14, desc: 'Sci-fi barrier. +8 defense.' },
    { name: 'Mage Robes',          vnum: 224, cost: 7,  desc: 'Enchanted cloth. +2 defense, +15 max focus.' },

    // ─── Accessories ───
    { name: 'Ring of Vigor',        vnum: 240, cost: 5,  desc: 'Boosts vitality. +15 max HP.' },
    { name: 'Amulet of Focus',      vnum: 241, cost: 5,  desc: 'Sharpens the mind. +10 max focus.' },
    { name: 'Belt of Grit',         vnum: 242, cost: 8,  desc: 'Toughens resolve. +5 defense, +10 max HP.' },
    { name: 'Boots of Haste',       vnum: 243, cost: 10, desc: 'Move faster. +3 attack, +3 defense.' },

    // ─── Consumables ───
    { name: 'Healing Potion',       vnum: 260, cost: 2,  desc: 'Restores 50 HP.' },
    { name: 'Focus Elixir',         vnum: 261, cost: 2,  desc: 'Restores 30 focus.' },
    { name: 'Antidote',             vnum: 262, cost: 1,  desc: 'Cures poison.' },
    { name: 'Scroll of Recall',     vnum: 263, cost: 3,  desc: 'Teleport to your recall point.' },

    // ─── Special ───
    { name: 'Respec Token',         vnum: 270, cost: 20, desc: 'Reset your specialization.' },
    { name: 'XP Tome',              vnum: 271, cost: 15, desc: 'Gain a burst of stat XP.' },
    { name: 'Treasure Map',         vnum: 272, cost: 10, desc: 'Reveals a hidden room in a random zone.' }
  ];

  /**
   * Display the quest shop catalog.
   * @param {number} playerQP - Player's current quest points
   * @returns {Array} Output messages
   */
  function displayShop(playerQP) {
    const output = [
      { type: 'info', text: '═══ Quest Reward Depot ═══' },
      { type: 'info', text: `  Your Quest Points: ${playerQP || 0}` },
      { type: 'info', text: '' }
    ];

    let lastCategory = '';
    for (let i = 0; i < CATALOG.length; i++) {
      const item = CATALOG[i];
      // Infer category from vnum ranges
      let cat;
      if (item.vnum < 220) cat = 'Weapons';
      else if (item.vnum < 240) cat = 'Armor';
      else if (item.vnum < 260) cat = 'Accessories';
      else if (item.vnum < 270) cat = 'Consumables';
      else cat = 'Special';

      if (cat !== lastCategory) {
        output.push({ type: 'info', text: `  ─── ${cat} ───` });
        lastCategory = cat;
      }

      const affordable = (playerQP || 0) >= item.cost;
      output.push({
        type: affordable ? 'items' : 'info',
        text: `  ${i + 1}. ${item.name} — ${item.cost} QP${affordable ? '' : ' (not enough QP)'}`
      });
      output.push({ type: 'info', text: `     ${item.desc}` });
    }

    output.push({ type: 'info', text: '' });
    output.push({ type: 'success', text: "Type 'qbuy <number>' or 'qbuy <name>' to purchase." });
    return output;
  }

  /**
   * Attempt to purchase an item from the quest shop.
   * @param {string} target - Item name or catalog number
   * @param {object} player - Player state (mutated: questPoints, inventory)
   * @returns {Array} Output messages
   */
  function buyItem(target, player) {
    if (!target) {
      return [{ type: 'error', text: "Buy what? Type 'qshop' to see available items." }];
    }

    // Match by number or name
    let entry = null;
    const num = parseInt(target, 10);
    if (num >= 1 && num <= CATALOG.length) {
      entry = CATALOG[num - 1];
    } else {
      const lower = target.toLowerCase();
      entry = CATALOG.find(c => c.name.toLowerCase().includes(lower));
    }

    if (!entry) {
      return [{ type: 'error', text: `No item matching '${target}' in the Quest Reward Depot.` }];
    }

    const qp = player.questPoints || 0;
    if (qp < entry.cost) {
      return [{ type: 'error', text: `Not enough QP. ${entry.name} costs ${entry.cost} QP (you have ${qp}).` }];
    }

    // Check inventory cap
    if ((player.inventory || []).length >= 99) {
      return [{ type: 'error', text: 'Your inventory is full (99 items). Drop something first.' }];
    }

    // Deduct QP and add item
    player.questPoints = qp - entry.cost;
    if (!player.inventory) player.inventory = [];
    player.inventory.push(entry.vnum);

    return [
      { type: 'success', text: `Purchased: ${entry.name} for ${entry.cost} QP.` },
      { type: 'info', text: `  Remaining QP: ${player.questPoints}` }
    ];
  }

  /* ─── Public API ────────────────────────────────────────────────────────── */

  window.MudQuestShop = {
    QUEST_SHOP_ROOM,
    CATALOG,
    displayShop,
    buyItem
  };
})();
