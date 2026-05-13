/**
 * mud_api.js — MUD Backend API Client
 *
 * Thin wrapper around the Railway backend. Handles auth token persistence,
 * save/load, notes, marketplace, and ghost recordings.
 *
 * Usage:
 *   MudAPI.login(username, password)   → { token, username }
 *   MudAPI.register(username, password) → { token, username }
 *   MudAPI.loadSave()                  → save data object or null
 *   MudAPI.storeSave(data)             → { success: true }
 *   MudAPI.getNotes(roomVnum)          → [{ content, username, created_at }]
 *   MudAPI.postNote(roomVnum, content) → { success: true }
 *   MudAPI.getMarketplace()            → { stock, refreshesAt }
 *   MudAPI.buyItem(stockId)            → { success, gold, item_vnum }
 *   MudAPI.getGhosts(roomVnum)         → [{ action, direction, username, timestamp }]
 *   MudAPI.recordGhost(roomVnum, action, direction) → { success: true }
 */
(() => {
  const BASE_URL = 'https://ambitiousthing-production.up.railway.app';
  const TOKEN_KEY = 'mud_auth_token';
  const USER_KEY = 'mud_auth_user';

  /** Retrieve the stored JWT token. */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  /** Store auth credentials after login/register. */
  function setAuth(token, username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
  }

  /** Clear stored auth. */
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  /** Get the logged-in username, or null. */
  function getUsername() {
    return localStorage.getItem(USER_KEY);
  }

  /** Check if the player is logged in. */
  function isLoggedIn() {
    return !!getToken();
  }

  /**
   * Make an authenticated fetch request to the backend.
   * Automatically attaches the bearer token if available.
   */
  async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    const body = await res.json();

    if (!res.ok) {
      throw new Error(body.error || `API error ${res.status}`);
    }
    return body;
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  /** Register a new account. Returns { token, username }. */
  async function register(username, password) {
    const result = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setAuth(result.token, result.username);
    return result;
  }

  /** Log in to an existing account. Returns { token, username }. */
  async function login(username, password) {
    const result = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setAuth(result.token, result.username);
    return result;
  }

  /** Log out (client-side only). */
  function logout() {
    clearAuth();
  }

  // ─── Saves ─────────────────────────────────────────────────────────────────

  /** Load the player's save from the server. Returns the data object or null. */
  async function loadSave() {
    const result = await apiFetch('/api/saves');
    return result.data || null;
  }

  /** Store the player's save to the server. */
  async function storeSave(data) {
    return apiFetch('/api/saves', {
      method: 'PUT',
      body: JSON.stringify({ data })
    });
  }

  // ─── Notes ─────────────────────────────────────────────────────────────────

  /** Get player-written notes for a room. */
  async function getNotes(roomVnum) {
    return apiFetch(`/api/notes/${roomVnum}`);
  }

  /** Post a note in a room (max 280 chars, 60s cooldown). */
  async function postNote(roomVnum, content) {
    return apiFetch('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ roomVnum, content })
    });
  }

  // ─── Marketplace ───────────────────────────────────────────────────────────

  /** Get the current rotating shop stock. */
  async function getMarketplace() {
    return apiFetch('/api/marketplace');
  }

  /** Buy an item from the marketplace by stock ID. */
  async function buyItem(stockId) {
    return apiFetch('/api/marketplace/buy', {
      method: 'POST',
      body: JSON.stringify({ stockId })
    });
  }

  // ─── Ghosts ────────────────────────────────────────────────────────────────

  /** Get ghost recordings for a room (other players' recent actions). */
  async function getGhosts(roomVnum) {
    return apiFetch(`/api/ghosts/${roomVnum}`);
  }

  /** Record a ghost action (move, attack, flee, quest, train, buy, look). */
  async function recordGhost(roomVnum, action, direction) {
    return apiFetch('/api/ghosts', {
      method: 'POST',
      body: JSON.stringify({ roomVnum, action, direction })
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  window.MudAPI = {
    isLoggedIn,
    getUsername,
    register,
    login,
    logout,
    loadSave,
    storeSave,
    getNotes,
    postNote,
    getMarketplace,
    buyItem,
    getGhosts,
    recordGhost
  };
})();
