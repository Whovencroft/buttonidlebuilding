/**
 * mud_merchants.js — Local Merchant System
 *
 * Gives NPC mobs shop inventories so players can buy/sell items
 * without needing a server API. Merchants are identified by the
 * 'merchant' flag in their mob data.
 *
 * Shop data is defined per-mob in the mobs.json `shop` field:
 *   shop: { markup: 1.5, items: [ { vnum, price, qty } ] }
 *
 * If a merchant has no explicit shop data, a default inventory
 * is generated based on the sector/zone they inhabit.
 */
(function () {
  'use strict';

  // ─── Default Shop Templates by Sector ────────────────────────────────
  // Used when a merchant NPC has no explicit shop inventory.
  const SECTOR_SHOPS = {
    nexus: {
      markup: 1.0,
      items: [
        { name: 'Bread Loaf',      type: 'consumable', effect: 'heal',    value: 15,  price: 10,  desc: 'A simple loaf. Restores 15 HP.' },
        { name: 'Herbal Salve',    type: 'consumable', effect: 'heal',    value: 40,  price: 30,  desc: 'A soothing paste. Restores 40 HP.' },
        { name: 'Focus Tonic',     type: 'consumable', effect: 'focus',   value: 20,  price: 25,  desc: 'A bitter drink. Restores 20 Focus.' },
        { name: 'Torch',           type: 'misc',       effect: 'light',   value: 0,   price: 5,   desc: 'Lights dark rooms.' },
        { name: 'Rope',            type: 'misc',       effect: 'utility', value: 0,   price: 15,  desc: 'Useful for climbing and binding.' },
      ]
    },
    shattered_crown: {
      markup: 1.2,
      items: [
        { name: 'Healing Potion',     type: 'consumable', effect: 'heal',    value: 50,  price: 40,  desc: 'A red potion. Restores 50 HP.' },
        { name: 'Mana Draught',       type: 'consumable', effect: 'focus',   value: 30,  price: 35,  desc: 'A blue draught. Restores 30 Focus.' },
        { name: 'Iron Shield',        type: 'equipment',  slot: 'offhand',   stats: { defense: 5 },  price: 120, desc: 'A sturdy iron shield. +5 defense.' },
        { name: 'Leather Armor',      type: 'equipment',  slot: 'body',      stats: { defense: 3, maxHp: 10 }, price: 100, desc: 'Tough leather. +3 defense, +10 HP.' },
        { name: 'Steel Sword',        type: 'equipment',  slot: 'weapon',    stats: { attackPower: 8 }, price: 150, desc: 'A reliable blade. +8 attack.' },
        { name: 'Antidote',           type: 'consumable', effect: 'cure',    value: 0,   price: 20,  desc: 'Cures poison.' },
      ]
    },
    neon_grid: {
      markup: 1.3,
      items: [
        { name: 'Stim Pack',          type: 'consumable', effect: 'heal',    value: 60,  price: 50,  desc: 'Nano-repair injection. Restores 60 HP.' },
        { name: 'Neural Booster',     type: 'consumable', effect: 'focus',   value: 40,  price: 45,  desc: 'Cortical stimulant. Restores 40 Focus.' },
        { name: 'Synth-Weave Vest',   type: 'equipment',  slot: 'body',      stats: { defense: 6, maxHp: 15 }, price: 200, desc: 'Ballistic fiber. +6 defense, +15 HP.' },
        { name: 'Shock Baton',        type: 'equipment',  slot: 'weapon',    stats: { attackPower: 12 }, price: 250, desc: 'Electrified melee weapon. +12 attack.' },
        { name: 'EMP Grenade',        type: 'consumable', effect: 'stun',    value: 2,   price: 80,  desc: 'Stuns a target for 2 rounds.' },
        { name: 'Holo-Map Chip',      type: 'misc',       effect: 'reveal',  value: 0,   price: 60,  desc: 'Reveals hidden exits in the current room.' },
      ]
    },
    midnight_rain: {
      markup: 1.4,
      items: [
        { name: 'Whiskey Flask',       type: 'consumable', effect: 'heal',    value: 35,  price: 25,  desc: 'Burns going down. Restores 35 HP.' },
        { name: 'Smelling Salts',      type: 'consumable', effect: 'focus',   value: 25,  price: 30,  desc: 'Clears the head. Restores 25 Focus.' },
        { name: 'Trench Coat',         type: 'equipment',  slot: 'body',      stats: { defense: 4 }, price: 150, desc: 'Heavy coat. +4 defense.' },
        { name: 'Snub-Nose Revolver',  type: 'equipment',  slot: 'weapon',    stats: { attackPower: 10 }, price: 180, desc: 'Compact and deadly. +10 attack.' },
        { name: 'Lockpick Set',        type: 'misc',       effect: 'unlock',  value: 0,   price: 50,  desc: 'Opens locked doors and containers.' },
        { name: 'Cigarette Case',      type: 'misc',       effect: 'calm',    value: 0,   price: 10,  desc: 'Steadies the nerves. Cosmetic.' },
      ]
    },
    blood_chrome: {
      markup: 1.3,
      items: [
        { name: 'Field Medkit',        type: 'consumable', effect: 'heal',    value: 80,  price: 70,  desc: 'Military-grade first aid. Restores 80 HP.' },
        { name: 'Adrenaline Shot',     type: 'consumable', effect: 'focus',   value: 50,  price: 55,  desc: 'Combat stimulant. Restores 50 Focus.' },
        { name: 'Tactical Vest',       type: 'equipment',  slot: 'body',      stats: { defense: 8, maxHp: 20 }, price: 300, desc: 'Kevlar-lined. +8 defense, +20 HP.' },
        { name: 'Combat Rifle',        type: 'equipment',  slot: 'weapon',    stats: { attackPower: 15 }, price: 350, desc: 'Standard-issue rifle. +15 attack.' },
        { name: 'Frag Grenade',        type: 'consumable', effect: 'aoe',     value: 40,  price: 100, desc: 'Deals 40 damage to all enemies.' },
        { name: 'Night Vision Goggles', type: 'equipment', slot: 'head',      stats: { defense: 1 }, price: 120, desc: 'See in the dark. +1 defense.' },
      ]
    },
    ethereal_drift: {
      markup: 1.5,
      items: [
        { name: 'Starlight Elixir',    type: 'consumable', effect: 'heal',    value: 100, price: 90,  desc: 'Liquid starlight. Restores 100 HP.' },
        { name: 'Void Crystal',        type: 'consumable', effect: 'focus',   value: 60,  price: 70,  desc: 'Crystallized void energy. Restores 60 Focus.' },
        { name: 'Nebula Cloak',        type: 'equipment',  slot: 'body',      stats: { defense: 10, maxHp: 25 }, price: 400, desc: 'Woven from cosmic dust. +10 defense, +25 HP.' },
        { name: 'Gravity Blade',       type: 'equipment',  slot: 'weapon',    stats: { attackPower: 18 }, price: 450, desc: 'Bends space around its edge. +18 attack.' },
        { name: 'Phase Charm',         type: 'consumable', effect: 'dodge',   value: 3,   price: 150, desc: 'Grants 3 rounds of guaranteed dodge.' },
      ]
    },
    forgotten_epoch: {
      markup: 1.6,
      items: [
        { name: 'Temporal Salve',      type: 'consumable', effect: 'heal',    value: 120, price: 110, desc: 'Reverses wounds through time. Restores 120 HP.' },
        { name: 'Chrono Shard',        type: 'consumable', effect: 'focus',   value: 70,  price: 80,  desc: 'Frozen moment of clarity. Restores 70 Focus.' },
        { name: 'Epoch Plate',         type: 'equipment',  slot: 'body',      stats: { defense: 12, maxHp: 30 }, price: 500, desc: 'Armor from a forgotten age. +12 defense, +30 HP.' },
        { name: 'Paradox Edge',        type: 'equipment',  slot: 'weapon',    stats: { attackPower: 22 }, price: 550, desc: 'Cuts through cause and effect. +22 attack.' },
        { name: 'Hourglass Bomb',      type: 'consumable', effect: 'stun',    value: 3,   price: 200, desc: 'Freezes time around a target for 3 rounds.' },
      ]
    },
    undercity: {
      markup: 1.5,
      items: [
        { name: 'Sewer Rat Jerky',     type: 'consumable', effect: 'heal',    value: 20,  price: 8,   desc: 'Tastes terrible. Restores 20 HP.' },
        { name: 'Moonshine',           type: 'consumable', effect: 'focus',   value: 15,  price: 10,  desc: 'Brewed in the tunnels. Restores 15 Focus.' },
        { name: 'Rusted Pipe',         type: 'equipment',  slot: 'weapon',    stats: { attackPower: 6 }, price: 40, desc: 'Better than nothing. +6 attack.' },
        { name: 'Scrap Armor',         type: 'equipment',  slot: 'body',      stats: { defense: 4 }, price: 60, desc: 'Cobbled together. +4 defense.' },
        { name: 'Poison Vial',         type: 'consumable', effect: 'dot',     value: 10,  price: 45,  desc: 'Coats your weapon. 10 damage/round for 3 rounds.' },
      ]
    },
    training_grounds: {
      markup: 1.0,
      items: [
        { name: 'Training Dummy Wrap', type: 'consumable', effect: 'heal',    value: 30,  price: 15,  desc: 'Basic bandage. Restores 30 HP.' },
        { name: 'Meditation Incense',  type: 'consumable', effect: 'focus',   value: 25,  price: 20,  desc: 'Calming scent. Restores 25 Focus.' },
        { name: 'Practice Sword',      type: 'equipment',  slot: 'weapon',    stats: { attackPower: 4 }, price: 30, desc: 'Dulled edge. +4 attack.' },
        { name: 'Sparring Pads',       type: 'equipment',  slot: 'body',      stats: { defense: 2, maxHp: 5 }, price: 40, desc: 'Light padding. +2 defense, +5 HP.' },
      ]
    },
    afterlife: {
      markup: 2.0,
      items: [
        { name: 'Soul Nectar',         type: 'consumable', effect: 'heal',    value: 150, price: 200, desc: 'Essence of departed spirits. Restores 150 HP.' },
        { name: 'Memory Fragment',     type: 'consumable', effect: 'focus',   value: 80,  price: 150, desc: 'A piece of forgotten knowledge. Restores 80 Focus.' },
        { name: 'Spectral Shroud',     type: 'equipment',  slot: 'body',      stats: { defense: 15, maxHp: 40 }, price: 800, desc: 'Woven from ectoplasm. +15 defense, +40 HP.' },
        { name: 'Reaper Scythe',       type: 'equipment',  slot: 'weapon',    stats: { attackPower: 28 }, price: 900, desc: 'Harvests life force. +28 attack.' },
        { name: 'Resurrection Charm',  type: 'consumable', effect: 'revive',  value: 0,   price: 500, desc: 'Prevents death once. Consumed on use.' },
      ]
    }
  };

  // ─── Sector Name Mapping ─────────────────────────────────────────────
  // Maps room vnum ranges to sector keys for default shop generation.
  const VNUM_TO_SECTOR = [
    { min: 1,    max: 99,   sector: 'nexus' },
    { min: 100,  max: 199,  sector: 'training_grounds' },
    { min: 1000, max: 1199, sector: 'shattered_crown' },
    { min: 1200, max: 1399, sector: 'neon_grid' },
    { min: 1400, max: 1599, sector: 'midnight_rain' },
    { min: 1600, max: 1799, sector: 'blood_chrome' },
    { min: 1800, max: 1999, sector: 'ethereal_drift' },
    { min: 2000, max: 2199, sector: 'forgotten_epoch' },
    { min: 2200, max: 2399, sector: 'undercity' },
    { min: 2400, max: 2599, sector: 'training_grounds' },
    { min: 2600, max: 2799, sector: 'afterlife' },
    // Expansion floors inherit parent sector
    { min: 3000, max: 3199, sector: 'shattered_crown' },
    { min: 3200, max: 3399, sector: 'neon_grid' },
    { min: 3400, max: 3599, sector: 'blood_chrome' },
    { min: 3600, max: 3799, sector: 'midnight_rain' },
    { min: 3800, max: 3999, sector: 'ethereal_drift' },
    { min: 4000, max: 4199, sector: 'forgotten_epoch' },
  ];

  /**
   * Determine which sector a room vnum belongs to.
   * @param {number} vnum - Room vnum
   * @returns {string} Sector key
   */
  function getSectorForRoom(vnum) {
    for (const range of VNUM_TO_SECTOR) {
      if (vnum >= range.min && vnum <= range.max) return range.sector;
    }
    return 'nexus'; // fallback
  }

  /**
   * Get the shop inventory for a merchant mob.
   * Uses explicit shop data if available, otherwise generates
   * a default inventory based on the sector the merchant is in.
   * @param {object} mob - The mob object
   * @param {number} roomVnum - The room the merchant is in
   * @returns {object|null} Shop data: { markup, items }
   */
  function getShopForMerchant(mob, roomVnum) {
    if (!mob) return null;
    const isMerchant = (mob.flags || []).includes('merchant') ||
                       (mob.flags || []).includes('npc') && mob.shop;
    // Explicit shop data on the mob
    if (mob.shop && mob.shop.items && mob.shop.items.length > 0) {
      return mob.shop;
    }
    // Only generate default shops for mobs flagged as merchants or
    // NPCs whose name/keywords suggest they sell things
    const merchantNames = ['merchant', 'vendor', 'shopkeeper', 'trader',
      'peddler', 'dealer', 'hawker', 'seller', 'smith', 'blacksmith',
      'armorer', 'apothecary', 'alchemist', 'doc', 'medic',
      'bartender', 'barkeep', 'innkeeper', 'quartermaster', 'fletcher'];
    const nameLC = (mob.name || '').toLowerCase();
    const isMerchantByName = merchantNames.some(n => nameLC.includes(n));
    if (!isMerchant && !isMerchantByName) return null;
    // Generate default inventory from sector
    const sector = getSectorForRoom(roomVnum);
    const template = SECTOR_SHOPS[sector] || SECTOR_SHOPS.nexus;
    return {
      markup: template.markup,
      items: template.items.map((item, idx) => ({
        id: idx + 1,
        ...item
      }))
    };
  }

  /**
   * Format a shop listing for display.
   * @param {object} mob - The merchant mob
   * @param {object} shop - Shop data from getShopForMerchant
   * @param {number} playerGold - Player's current gold
   * @returns {Array} Output lines
   */
  function formatShopListing(mob, shop, playerGold) {
    const output = [];
    output.push({ type: 'info', text: `═══ ${mob.name}'s Wares ═══` });
    output.push({ type: 'info', text: '' });
    for (let i = 0; i < shop.items.length; i++) {
      const item = shop.items[i];
      const num = i + 1;
      const affordable = playerGold >= item.price ? '' : ' [cannot afford]';
      const typeTag = item.type === 'equipment' ? ` [${item.slot}]` : '';
      output.push({ type: 'info', text: `  [${num}] ${item.name}${typeTag} — ${item.price} gold${affordable}` });
      output.push({ type: 'info', text: `       ${item.desc}` });
    }
    output.push({ type: 'info', text: '' });
    output.push({ type: 'info', text: `  Your gold: ${playerGold}` });
    output.push({ type: 'info', text: `  Type 'buy <number>' or 'buy <name>' to purchase.` });
    output.push({ type: 'info', text: `  Type 'sell <item>' to sell from your inventory.` });
    return output;
  }

  /**
   * Find a merchant in the current room.
   * @param {Array} roomMobVnums - Alive mob vnums in the room
   * @param {object} allMobs - Global mobs lookup
   * @param {number} roomVnum - Current room vnum
   * @returns {object|null} { mob, shop } or null
   */
  function findMerchantInRoom(roomMobVnums, allMobs, roomVnum) {
    for (const vnum of roomMobVnums) {
      const mob = allMobs[vnum];
      if (!mob) continue;
      const shop = getShopForMerchant(mob, roomVnum);
      if (shop) return { mob, shop };
    }
    return null;
  }

  /** Counter for assigning unique vnums to merchant-purchased items. */
  let nextPurchaseVnum = 50000;

  /**
   * Inject a purchased item definition into the engine's items map so
   * the entire engine (inventory, equip, inspect, sell) treats it as
   * a real item. Returns the assigned vnum.
   * @param {object} def - Item definition to register
   * @param {object} itemsMap - Engine's items map (engine._internals.items)
   * @returns {number} The vnum assigned to this item
   */
  function registerPurchasedItem(def, itemsMap) {
    const vnum = nextPurchaseVnum++;
    def.vnum = vnum;
    if (itemsMap) {
      itemsMap[vnum] = def;          // Numeric key for direct lookups
      itemsMap[String(vnum)] = def;  // String key for JSON-loaded consistency
    }
    return vnum;
  }

  /**
   * Re-register purchased items on resume so the engine's items map
   * recognises them after a page reload.
   * @param {Array} purchasedItems - player.purchasedItems array
   * @param {object} itemsMap - Engine's items map
   */
  function restorePurchasedItems(purchasedItems, itemsMap) {
    if (!purchasedItems || !itemsMap) return;
    for (const entry of purchasedItems) {
      if (!entry) continue;
      if (entry.vnum != null) {
        // Use String key for consistency with JSON-loaded items map
        itemsMap[String(entry.vnum)] = entry;
        itemsMap[entry.vnum] = entry; // Also set numeric key for direct lookups
        if (entry.vnum >= nextPurchaseVnum) nextPurchaseVnum = entry.vnum + 1;
      } else if (entry.name) {
        // Old-format entry without vnum — assign one now
        const vnum = nextPurchaseVnum++;
        entry.vnum = vnum;
        itemsMap[String(vnum)] = entry;
        itemsMap[vnum] = entry;
      }
    }
  }

  /**
   * Process a buy command.
   * Finds the item in the shop, deducts gold, creates a full item
   * definition, registers it in the engine's items map, and adds
   * the vnum to the player's inventory.
   * @param {string} target - Item number or name
   * @param {object} shop - Shop data
   * @param {object} mob - Merchant mob
   * @param {object} player - Player object (mutated: gold, inventory)
   * @param {object} [itemsMap] - Engine's items map for registration
   * @returns {Array} Output lines
   */
  function processBuy(target, shop, mob, player, itemsMap) {
    if (!target) {
      return [{ type: 'info', text: `Type 'buy <number>' or 'buy <name>' to purchase from ${mob.name}.` }];
    }
    // Try by number first
    let item = null;
    const num = parseInt(target);
    if (!isNaN(num) && num >= 1 && num <= shop.items.length) {
      item = shop.items[num - 1];
    } else {
      const targetLC = target.toLowerCase();
      item = shop.items.find(i => i.name.toLowerCase().includes(targetLC));
    }
    if (!item) {
      return [{ type: 'error', text: `${mob.name} doesn't sell anything matching '${target}'.` }];
    }
    if (player.gold < item.price) {
      return [{ type: 'error', text: `You can't afford ${item.name}. (Need ${item.price} gold, have ${player.gold})` }];
    }
    if (player.inventory.length >= 99) {
      return [{ type: 'error', text: 'Your inventory is full (99 items). Drop something first.' }];
    }
    // Deduct gold
    player.gold -= item.price;
    // Build a full item definition the engine can use
    const def = {
      name: item.name,
      type: item.type || (item.slot ? 'equipment' : 'consumable'),
      description: item.desc || item.description || '',
      slot: item.slot || null,
      stats: item.stats || {},
      rarity: item.rarity || 'common',
      value: item.value || Math.floor(item.price * 0.5),
      effect: item.effect || null,
      keywords: item.name.toLowerCase().split(/\s+/)
    };
    // Register in engine items map and get a real vnum
    const allItems = itemsMap || window.MudData?.items || {};
    const vnum = registerPurchasedItem(def, allItems);
    // Track in purchasedItems for save persistence
    if (!player.purchasedItems) player.purchasedItems = [];
    player.purchasedItems.push(def);
    // Add to inventory
    player.inventory.push(vnum);
    return [
      { type: 'success', text: `You buy ${item.name} from ${mob.name} for ${item.price} gold.` },
      { type: 'info', text: `  Gold remaining: ${player.gold}` }
    ];
  }

  /**
   * Sell an item from the player's inventory to a merchant.
   * Checks regular inventory items (by vnum → MudData) first,
   * then falls back to purchasedItems (synthetic merchant buys).
   * Sell price = half the item's value (or 1 gold minimum).
   * @param {string} target - Item name/keyword to sell
   * @param {object} mob - Merchant mob
   * @param {object} player - Player object (mutated: gold, inventory)
   * @param {object} [itemData] - Item definitions map (MudData.items)
   * @returns {Array} Output lines
   */
  function processSell(target, mob, player, itemData) {
    if (!target) {
      return [{ type: 'info', text: `Type 'sell <item>' to sell something from your inventory.` }];
    }
    const targetLC = target.toLowerCase();
    const allItems = itemData || window.MudData?.items || {};

    // 1. Check regular inventory items (vnums resolved via MudData)
    const invIdx = player.inventory.findIndex(v => {
      const def = allItems[v];
      if (!def) return false;
      return def.name.toLowerCase().includes(targetLC)
        || String(def.vnum) === targetLC;
    });
    if (invIdx !== -1) {
      const vnum = player.inventory[invIdx];
      const def = allItems[vnum];
      const sellPrice = Math.max(1, Math.floor((def.value || 10) * 0.5));
      player.gold += sellPrice;
      player.inventory.splice(invIdx, 1);
      return [
        { type: 'success', text: `You sell ${def.name} to ${mob.name} for ${sellPrice} gold.` },
        { type: 'info', text: `  Gold: ${player.gold}` }
      ];
    }

    // 2. Fallback: check purchasedItems (synthetic merchant items)
    if (player.purchasedItems) {
      const pIdx = player.purchasedItems.findIndex(i =>
        i && i.name.toLowerCase().includes(targetLC)
      );
      if (pIdx !== -1) {
        const item = player.purchasedItems[pIdx];
        const sellPrice = item.sellPrice || Math.max(1, Math.floor((item.price || 10) * 0.5));
        player.gold += sellPrice;
        player.purchasedItems[pIdx] = null;
        const synVnum = 90001 + pIdx;
        const synIdx = player.inventory.indexOf(synVnum);
        if (synIdx !== -1) player.inventory.splice(synIdx, 1);
        return [
          { type: 'success', text: `You sell ${item.name} to ${mob.name} for ${sellPrice} gold.` },
          { type: 'info', text: `  Gold: ${player.gold}` }
        ];
      }
    }

    return [{ type: 'error', text: `You don't have anything matching '${target}' to sell.` }];
  }

  // ─── Public API ──────────────────────────────────────────────────────
  window.MudMerchants = {
    getShopForMerchant,
    findMerchantInRoom,
    formatShopListing,
    processBuy,
    processSell,
    restorePurchasedItems,
    getSectorForRoom,
    SECTOR_SHOPS
  };
})();
