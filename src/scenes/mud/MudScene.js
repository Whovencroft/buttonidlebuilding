import { createMudWorld } from './MudWorld.js';
import { parseMudCommand } from './MudParser.js';

/**
 * Creates the MUD scene with command input, parser scaffold, room graph,
 * inventory model, and completion-report handoff.
 */
export function createMudScene(api) {
  const root = ensureRoot();
  let refs = null;
  let world = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.mud || typeof state.scenes.mud !== 'object') {
      state.scenes.mud = {};
    }

    const mud = state.scenes.mud;
    mud.currentRoomId = typeof mud.currentRoomId === 'string' ? mud.currentRoomId : null;
    mud.inventory = Array.isArray(mud.inventory) ? mud.inventory : [];
    mud.flags = mud.flags && typeof mud.flags === 'object' ? mud.flags : {};
    mud.visitedRooms = Array.isArray(mud.visitedRooms) ? mud.visitedRooms : [];
    mud.history = Array.isArray(mud.history) ? mud.history : [];
    mud.completed = !!mud.completed;
    mud.lastOutcome = mud.lastOutcome && typeof mud.lastOutcome === 'object' ? mud.lastOutcome : null;
    return mud;
  }

  async function loadWorld() {
    if (world) return world;

    const mudData = await api.assetService.loadJson('/data/mud-rooms.json');
    world = createMudWorld(mudData);
    return world;
  }

  function pushLog(text, type = 'info') {
    const mud = slice();
    mud.history.push({ text, type, ts: Date.now() });
    mud.history = mud.history.slice(-60);
  }

  function currentRoom() {
    const mud = slice();
    return world?.getRoom(mud.currentRoomId) || null;
  }

  function visitRoom(room) {
    const mud = slice();
    mud.currentRoomId = room.id;

    if (!mud.visitedRooms.includes(room.id)) {
      mud.visitedRooms.push(room.id);
    }

    if (room.onEnterFlag) {
      mud.flags[room.onEnterFlag] = true;
    }

    pushLog(`[${room.title}] ${room.description}`);
    if (room.items?.length) {
      pushLog(`You notice: ${room.items.join(', ')}`);
    }
  }

  function executeCommand(command) {
    const mud = slice();
    const room = currentRoom();

    switch (command.verb) {
      case 'empty':
        return;
      case 'help':
        pushLog('Commands: look, go <dir>, take <item>, inventory, use <item>, flags, complete, help');
        break;
      case 'look':
        if (room) {
          pushLog(`[${room.title}] ${room.description}`);
          pushLog(`Exits: ${Object.keys(room.exits || {}).join(', ') || 'none'}`);
        }
        break;
      case 'go': {
        const direction = command.args[0];
        const nextRoomId = room?.exits?.[direction];
        const nextRoom = world.getRoom(nextRoomId);

        if (!direction || !nextRoom) {
          pushLog('You cannot go that way.', 'warn');
          break;
        }

        visitRoom(nextRoom);
        break;
      }
      case 'take': {
        const item = command.args[0];
        if (!item || !room?.items?.includes(item)) {
          pushLog('There is nothing like that here.', 'warn');
          break;
        }

        if (!mud.inventory.includes(item)) {
          mud.inventory.push(item);
          pushLog(`Taken: ${item}`);
        } else {
          pushLog(`You already carry ${item}.`, 'warn');
        }
        break;
      }
      case 'inventory':
        pushLog(`Inventory: ${mud.inventory.join(', ') || 'empty'}`);
        break;
      case 'use': {
        const item = command.args[0];
        if (!item || !mud.inventory.includes(item)) {
          pushLog('You do not have that item.', 'warn');
          break;
        }

        mud.flags[`used_${item}`] = true;
        pushLog(`Used: ${item}`);
        break;
      }
      case 'flags':
        pushLog(`Flags: ${Object.keys(mud.flags).sort().join(', ') || 'none'}`);
        break;
      case 'complete':
        if (room?.id !== 'vault') {
          pushLog('Completion is only available in the Echo Vault.', 'warn');
          break;
        }

        mud.completed = true;
        mud.lastOutcome = {
          sceneId: 'mud',
          endingId: 'mud_complete',
          ts: Date.now(),
          visitedRooms: mud.visitedRooms.slice(),
          inventory: mud.inventory.slice(),
          flags: { ...mud.flags }
        };

        pushLog('MUD scaffold complete. Structured outcome recorded.', 'good');
        api.setSaveStatus?.('MUD completion recorded for host progression hooks.');
        break;
      default:
        pushLog('Unknown command. Type help for commands.', 'warn');
    }

    api.saveNow();
    render();
  }

  function ensureDom() {
    if (refs) return;

    root.innerHTML = `
      <div class="panel" style="height:100%;">
        <div class="panel-header">
          <h2>MUD Scaffold</h2>
          <div class="small" data-mud-room-title>Room</div>
        </div>
        <div class="panel-body" style="display:grid;grid-template-rows:1fr auto auto;gap:10px;">
          <div class="log-box" data-mud-log style="min-height:240px;"></div>
          <div class="small" data-mud-inventory>Inventory: empty</div>
          <form data-mud-form style="display:flex;gap:8px;">
            <input data-mud-input class="input" placeholder="Type command (help)" style="flex:1;" />
            <button class="action-btn" type="submit">Run</button>
          </form>
        </div>
      </div>
    `;

    refs = {
      form: root.querySelector('[data-mud-form]'),
      input: root.querySelector('[data-mud-input]'),
      log: root.querySelector('[data-mud-log]'),
      inventory: root.querySelector('[data-mud-inventory]'),
      roomTitle: root.querySelector('[data-mud-room-title]')
    };

    refs.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const command = parseMudCommand(refs.input.value);
      refs.input.value = '';
      executeCommand(command);
    });
  }

  function render() {
    if (!refs) return;

    const mud = slice();
    const room = currentRoom();

    refs.roomTitle.textContent = room ? `Room: ${room.title}` : 'Room: none';
    refs.inventory.textContent = `Inventory: ${mud.inventory.join(', ') || 'empty'}`;
    refs.log.innerHTML = mud.history
      .slice(-20)
      .map((entry) => `<div class="${entry.type === 'warn' ? 'warn' : entry.type === 'good' ? 'good' : ''}">${entry.text}</div>`)
      .join('');
    refs.log.scrollTop = refs.log.scrollHeight;
  }

  return {
    id: 'mud',
    root,
    async enter() {
      root.dataset.sceneStatus = 'active';
      root.dataset.sceneKind = 'dom';
      ensureDom();
      await loadWorld();

      const mud = slice();
      if (!mud.currentRoomId && world.startRoomId) {
        const start = world.getRoom(world.startRoomId);
        if (start) {
          visitRoom(start);
          api.saveNow();
        }
      }

      pushLog('Type help to list commands.');
      render();
      refs.input.focus();
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
      api.saveNow();
    },
    update() {
      // Purpose: reserved per-frame hook for timed MUD events in later milestones.
    },
    render,
    onStateLoaded() {
      slice();
    }
  };
}

function ensureRoot() {
  let root = document.getElementById('mudSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'mudSceneRoot';
  root.className = 'scene-root scene-root-dom';
  root.dataset.sceneId = 'mud';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}
