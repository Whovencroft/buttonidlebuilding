/**
 * mud_data.js — MUD World Data Loader
 *
 * Fetches room, mob, and item JSON files and exposes them on window.MudData.
 * Must be loaded before mud_engine.js.
 */
(() => {
  const DATA_PATH = './data/mud/';

  let loaded = false;
  let loadPromise = null;

  const data = {
    rooms: {},
    mobs: {},
    items: {}
  };

  /**
   * Fetch and parse a JSON file, returning an empty object on failure.
   */
  async function fetchJSON(filename) {
    try {
      const resp = await fetch(`${DATA_PATH}${filename}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error(`[MudData] Failed to load ${filename}:`, err);
      return {};
    }
  }

  /**
   * Load all world data files. Returns a promise that resolves when ready.
   */
  function load() {
    if (loadPromise) return loadPromise;

    loadPromise = Promise.all([
      fetchJSON('rooms.json'),
      fetchJSON('mobs.json'),
      fetchJSON('items.json')
    ]).then(([rooms, mobs, items]) => {
      data.rooms = rooms;
      data.mobs = mobs;
      data.items = items;
      loaded = true;
      console.log(`[MudData] Loaded: ${Object.keys(rooms).length} rooms, ${Object.keys(mobs).length} mobs, ${Object.keys(items).length} items`);
    });

    return loadPromise;
  }

  /**
   * Check if data has finished loading.
   */
  function isReady() {
    return loaded;
  }

  window.MudData = {
    get rooms() { return data.rooms; },
    get mobs() { return data.mobs; },
    get items() { return data.items; },
    load,
    isReady
  };
})();
