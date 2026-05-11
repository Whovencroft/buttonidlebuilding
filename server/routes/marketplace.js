/**
 * Marketplace routes: rotating NPC shop with timed stock.
 * GET  /api/marketplace       — Get current stock
 * POST /api/marketplace/buy   — Purchase an item { stockId }
 *
 * Stock rotates every 6 hours. Items are seeded from a pool.
 */
const express = require('express');
const pool = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Item pool for the rotating shop (vnum, base price, weight for random selection)
const SHOP_POOL = [
  { vnum: 1003, price: 50, weight: 3 },   // Common consumable
  { vnum: 1004, price: 75, weight: 3 },
  { vnum: 1005, price: 100, weight: 2 },
  { vnum: 2003, price: 150, weight: 2 },  // Uncommon gear
  { vnum: 2004, price: 200, weight: 2 },
  { vnum: 3003, price: 300, weight: 1 },  // Rare items
  { vnum: 3004, price: 400, weight: 1 },
  { vnum: 4003, price: 500, weight: 1 },
  { vnum: 5003, price: 750, weight: 1 },  // Epic
  { vnum: 6003, price: 1000, weight: 1 }, // Legendary
];

const STOCK_SIZE = 6;
const ROTATION_HOURS = 6;

/** Get current marketplace stock. Refreshes if expired. */
router.get('/', async (req, res) => {
  try {
    // Remove expired stock
    await pool.query('DELETE FROM marketplace_stock WHERE expires_at < NOW()');

    // Check if we have current stock
    const current = await pool.query(
      'SELECT id, item_vnum, price, quantity, expires_at FROM marketplace_stock ORDER BY price ASC'
    );

    if (current.rows.length === 0) {
      // Generate new stock
      await generateStock();
      const fresh = await pool.query(
        'SELECT id, item_vnum, price, quantity, expires_at FROM marketplace_stock ORDER BY price ASC'
      );
      return res.json({ stock: fresh.rows, refreshesAt: fresh.rows[0]?.expires_at });
    }

    res.json({ stock: current.rows, refreshesAt: current.rows[0]?.expires_at });
  } catch (err) {
    console.error('Marketplace error:', err.message);
    res.status(500).json({ error: 'Failed to load marketplace.' });
  }
});

/** Purchase an item from the marketplace. */
router.post('/buy', requireAuth, async (req, res) => {
  const { stockId } = req.body;
  if (!stockId) {
    return res.status(400).json({ error: 'stockId required.' });
  }

  try {
    // Get the stock item
    const item = await pool.query(
      'SELECT * FROM marketplace_stock WHERE id = $1 AND quantity > 0 AND expires_at > NOW()',
      [stockId]
    );
    if (item.rows.length === 0) {
      return res.status(404).json({ error: 'Item not available.' });
    }

    const stock = item.rows[0];

    // Load player save to check gold
    const save = await pool.query('SELECT data FROM saves WHERE player_id = $1', [req.playerId]);
    if (save.rows.length === 0) {
      return res.status(400).json({ error: 'No save data found. Play the game first.' });
    }

    const playerData = save.rows[0].data;
    if ((playerData.player?.gold || 0) < stock.price) {
      return res.status(400).json({ error: 'Not enough gold.' });
    }

    // Deduct gold and add item
    playerData.player.gold -= stock.price;
    playerData.player.inventory = playerData.player.inventory || [];
    playerData.player.inventory.push(stock.item_vnum);

    // Update save and decrement stock
    await pool.query('UPDATE saves SET data = $1, updated_at = NOW() WHERE player_id = $2',
      [JSON.stringify(playerData), req.playerId]);
    await pool.query('UPDATE marketplace_stock SET quantity = quantity - 1 WHERE id = $1', [stockId]);

    res.json({ success: true, gold: playerData.player.gold, item_vnum: stock.item_vnum });
  } catch (err) {
    console.error('Buy error:', err.message);
    res.status(500).json({ error: 'Purchase failed.' });
  }
});

/** Generate fresh rotating stock. */
async function generateStock() {
  const expiresAt = new Date(Date.now() + ROTATION_HOURS * 60 * 60 * 1000);
  const selected = weightedSample(SHOP_POOL, STOCK_SIZE);

  for (const item of selected) {
    // Add some price variance (±20%)
    const variance = 0.8 + Math.random() * 0.4;
    const price = Math.round(item.price * variance);
    await pool.query(
      'INSERT INTO marketplace_stock (item_vnum, price, quantity, expires_at) VALUES ($1, $2, $3, $4)',
      [item.vnum, price, 1, expiresAt]
    );
  }
}

/** Weighted random sample without replacement. */
function weightedSample(items, count) {
  const pool = [...items];
  const result = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, it) => sum + it.weight, 0);
    let roll = Math.random() * totalWeight;
    for (let j = 0; j < pool.length; j++) {
      roll -= pool[j].weight;
      if (roll <= 0) {
        result.push(pool[j]);
        pool.splice(j, 1);
        break;
      }
    }
  }
  return result;
}

module.exports = router;
