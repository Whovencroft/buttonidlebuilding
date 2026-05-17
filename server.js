import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Static file serving (replaces GitHub Pages) ───────────────────────────
const staticOpts = { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 };

// Serve the game client files (only safe directories)
app.use('/js', express.static(path.join(__dirname, 'js'), staticOpts));
app.use('/css', express.static(path.join(__dirname, 'css'), staticOpts));
app.use('/public', express.static(path.join(__dirname, 'public'), staticOpts));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Health check endpoint (Railway uses this) ─────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── API routes placeholder ────────────────────────────────────────────────
// Future: mount MUD API routes, golf lobby API, user auth, etc.
// import mudRouter from './server/mud/routes.js';
// import golfRouter from './server/golf/routes.js';
// app.use('/api/mud', mudRouter);
// app.use('/api/golf', golfRouter);

// ─── Create HTTP server ────────────────────────────────────────────────────
const server = createServer(app);

// ─── WebSocket server ──────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const channel = url.searchParams.get('channel') || 'general';

  console.log(`[WS] Client connected to channel: ${channel}`);

  ws.channel = channel;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      handleMessage(ws, channel, msg);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected from channel: ${channel}`);
  });

  // Welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    channel,
    message: `Connected to ${channel} channel`
  }));
});

// ─── WebSocket message router ──────────────────────────────────────────────
function handleMessage(ws, channel, msg) {
  switch (channel) {
    case 'mud':
      handleMudMessage(ws, msg);
      break;
    case 'golf':
      handleGolfMessage(ws, msg);
      break;
    default:
      ws.send(JSON.stringify({ type: 'echo', data: msg }));
  }
}

// ─── MUD handler placeholder ───────────────────────────────────────────────
function handleMudMessage(ws, msg) {
  // Future: parse commands, update world state, broadcast to room
  ws.send(JSON.stringify({
    type: 'mud:response',
    message: '[MUD server not yet implemented]'
  }));
}

// ─── Golf multiplayer handler placeholder ──────────────────────────────────
function handleGolfMessage(ws, msg) {
  // Future: lobby management, turn sync, shot broadcasting
  ws.send(JSON.stringify({
    type: 'golf:response',
    message: '[Golf server not yet implemented]'
  }));
}

// ─── WebSocket heartbeat (detect dead connections) ─────────────────────────
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeatInterval));

// ─── Start server ──────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Server] Static files: ./ (repo root)`);
  console.log(`[Server] WebSocket: ws://localhost:${PORT}/ws`);
});
