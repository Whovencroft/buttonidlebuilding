/**
 * Creates a playable point-and-click scene with room graph traversal,
 * interactables, inventory, dialogue flags, puzzle combinations,
 * and scene-local save persistence.
 */
export function createPointClickScene(api) {
  const root = ensureRoot();
  let refs = null;
  let content = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.point_click || typeof state.scenes.point_click !== 'object') {
      state.scenes.point_click = {};
    }

    const pc = state.scenes.point_click;
    pc.currentRoomId = typeof pc.currentRoomId === 'string' ? pc.currentRoomId : null;
    pc.inventory = Array.isArray(pc.inventory) ? pc.inventory : [];
    pc.flags = pc.flags && typeof pc.flags === 'object' ? pc.flags : {};
    pc.solvedPuzzles = pc.solvedPuzzles && typeof pc.solvedPuzzles === 'object' ? pc.solvedPuzzles : {};
    pc.dialogueSeen = pc.dialogueSeen && typeof pc.dialogueSeen === 'object' ? pc.dialogueSeen : {};
    pc.visitedRooms = Array.isArray(pc.visitedRooms) ? pc.visitedRooms : [];
    pc.message = typeof pc.message === 'string' ? pc.message : 'Explore the room and click interactables.';
    pc.lastOutcome = pc.lastOutcome && typeof pc.lastOutcome === 'object' ? pc.lastOutcome : null;
    return pc;
  }

  async function loadContent() {
    if (content) return;

    try {
      content = await api.assetService.loadJson('/data/point-click-rooms.json');
    } catch (error) {
      console.warn(error);
      content = fallbackContent();
    }
  }

  function ensureDom() {
    if (refs) return;

    root.innerHTML = `
      <div class="panel" style="height:100%;">
        <div class="panel-header">
          <h2>Point & Click</h2>
          <div class="small" data-pc-room></div>
        </div>
        <div class="panel-body" style="display:grid;grid-template-columns:1.3fr 0.7fr;gap:12px;">
          <div style="display:grid;grid-template-rows:auto auto 1fr;gap:10px;min-height:0;">
            <div class="small" data-pc-description></div>
            <div class="small" data-pc-message></div>
            <div class="card-list" data-pc-interactables></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;" data-pc-exits></div>
          </div>
          <div style="display:grid;grid-template-rows:auto 1fr auto;gap:10px;min-height:0;">
            <div>
              <h3 style="margin:0 0 8px 0;font-size:0.95rem;">Inventory</h3>
              <div class="card-list" data-pc-inventory></div>
            </div>
            <div>
              <h3 style="margin:0 0 8px 0;font-size:0.95rem;">Notes</h3>
              <div class="small" data-pc-notes></div>
            </div>
            <button class="action-btn" data-pc-reset>Restart Scene</button>
          </div>
        </div>
      </div>
    `;

    refs = {
      room: root.querySelector('[data-pc-room]'),
      description: root.querySelector('[data-pc-description]'),
      message: root.querySelector('[data-pc-message]'),
      interactables: root.querySelector('[data-pc-interactables]'),
      exits: root.querySelector('[data-pc-exits]'),
      inventory: root.querySelector('[data-pc-inventory]'),
      notes: root.querySelector('[data-pc-notes]'),
      reset: root.querySelector('[data-pc-reset]')
    };

    // Purpose: one host-local reset action keeps this scene deterministic for testing.
    refs.reset.addEventListener('click', onReset);
  }

  function getRoom(roomId) {
    return content?.rooms?.find((room) => room.id === roomId) || null;
  }

  function getCurrentRoom(pc) {
    const room = getRoom(pc.currentRoomId);
    return room || getRoom(content?.startRoomId);
  }

  function onReset() {
    const pc = slice();
    resetSlice(pc);
    enterInitialRoom(pc);
    pc.message = 'Scene progress reset.';
    api.saveNow();
    render();
  }

  function enterInitialRoom(pc) {
    const startRoomId = content?.startRoomId;
    pc.currentRoomId = typeof startRoomId === 'string' ? startRoomId : null;
    pushVisitedRoom(pc, pc.currentRoomId);
  }

  function pushVisitedRoom(pc, roomId) {
    if (!roomId) return;
    if (!pc.visitedRooms.includes(roomId)) {
      pc.visitedRooms.push(roomId);
    }
  }

  function renderInteractables(pc, room) {
    refs.interactables.innerHTML = '';

    const interactables = Array.isArray(room.interactables) ? room.interactables : [];
    for (const interactable of interactables) {
      if (!isInteractableVisible(pc, interactable)) {
        continue;
      }

      const button = document.createElement('button');
      button.className = 'action-btn';
      button.textContent = interactable.label;

      // Purpose: interactable click is the primary point-and-click action dispatch path.
      button.addEventListener('click', () => {
        applyInteractable(pc, interactable);
        api.saveNow();
        render();
      });

      refs.interactables.appendChild(button);
    }

    if (refs.interactables.children.length === 0) {
      refs.interactables.innerHTML = '<div class="small">No available actions in this room.</div>';
    }
  }

  function renderExits(pc, room) {
    refs.exits.innerHTML = '';

    const exits = Array.isArray(room.exits) ? room.exits : [];
    for (const exit of exits) {
      if (!isExitVisible(pc, exit)) {
        continue;
      }

      const button = document.createElement('button');
      button.className = 'mini-btn';
      button.textContent = `Go to ${exit.label}`;

      // Purpose: room graph transitions update only this scene's local save slice.
      button.addEventListener('click', () => {
        pc.currentRoomId = exit.targetRoomId;
        pushVisitedRoom(pc, pc.currentRoomId);
        pc.message = `Moved to ${exit.label}.`;
        api.saveNow();
        render();
      });

      refs.exits.appendChild(button);
    }

    if (refs.exits.children.length === 0) {
      refs.exits.innerHTML = '<div class="small">No exits are currently available.</div>';
    }
  }

  function applyInteractable(pc, interactable) {
    switch (interactable.type) {
      case 'inspect':
        pc.message = interactable.message || 'You inspect the object.';
        if (interactable.setFlag) {
          pc.flags[interactable.setFlag] = true;
        }
        break;
      case 'pickup':
        handlePickup(pc, interactable);
        break;
      case 'talk':
        handleTalk(pc, interactable);
        break;
      case 'puzzle':
        handlePuzzle(pc, interactable);
        break;
      default:
        pc.message = 'Nothing happens.';
        break;
    }
  }

  function handlePickup(pc, interactable) {
    const itemId = interactable.itemId;

    if (!itemId) {
      pc.message = 'This item cannot be collected.';
      return;
    }

    if (pc.inventory.includes(itemId)) {
      pc.message = interactable.repeatMessage || 'You already picked that up.';
      return;
    }

    pc.inventory.push(itemId);
    pc.message = interactable.message || `Added ${itemId} to inventory.`;

    if (interactable.setFlag) {
      pc.flags[interactable.setFlag] = true;
    }
  }

  function handleTalk(pc, interactable) {
    const conversationId = interactable.id;
    const priorCount = Number(pc.dialogueSeen[conversationId] || 0);
    const lines = Array.isArray(interactable.lines) ? interactable.lines : [];
    const line = lines[Math.min(priorCount, Math.max(0, lines.length - 1))] || '...';

    pc.dialogueSeen[conversationId] = priorCount + 1;
    pc.message = line;

    if (interactable.setFlag) {
      pc.flags[interactable.setFlag] = true;
    }
  }

  function handlePuzzle(pc, interactable) {
    const puzzleId = interactable.puzzleId || interactable.id;

    if (pc.solvedPuzzles[puzzleId]) {
      pc.message = interactable.repeatMessage || 'Puzzle already solved.';
      return;
    }

    const requiredItems = Array.isArray(interactable.requiresItems) ? interactable.requiresItems : [];
    const hasAll = requiredItems.every((itemId) => pc.inventory.includes(itemId));

    if (!hasAll) {
      pc.message = interactable.failMessage || 'That puzzle needs other items first.';
      return;
    }

    pc.solvedPuzzles[puzzleId] = true;
    pc.message = interactable.successMessage || 'Puzzle solved.';

    if (interactable.consumeItems) {
      pc.inventory = pc.inventory.filter((itemId) => !requiredItems.includes(itemId));
    }

    if (interactable.setFlag) {
      pc.flags[interactable.setFlag] = true;
    }

    if (interactable.completesScene) {
      finalizeOutcome(pc);
    }
  }

  function isInteractableVisible(pc, interactable) {
    const requiresFlag = interactable.requiresFlag;
    const hideWhenSolved = !!interactable.hideWhenSolved;
    const puzzleId = interactable.puzzleId || interactable.id;

    if (requiresFlag && !pc.flags[requiresFlag]) {
      return false;
    }

    if (hideWhenSolved && pc.solvedPuzzles[puzzleId]) {
      return false;
    }

    return true;
  }

  function isExitVisible(pc, exit) {
    if (!exit.requiresFlag) return true;
    return !!pc.flags[exit.requiresFlag];
  }

  function finalizeOutcome(pc) {
    pc.lastOutcome = {
      sceneId: 'point_click',
      endingId: 'point_click_complete',
      ts: Date.now(),
      solvedPuzzles: Object.keys(pc.solvedPuzzles).length,
      visitedRooms: pc.visitedRooms.length,
      inventoryCount: pc.inventory.length
    };

    // Purpose: scene reports structured completion while host owns global progression.
    api.setSaveStatus?.('Point-and-click completion recorded for progression hooks.');
  }

  function render() {
    if (!refs || !content) return;

    const pc = slice();
    const room = getCurrentRoom(pc);
    if (!room) {
      refs.room.textContent = 'Room unavailable';
      refs.description.textContent = 'No room data loaded.';
      refs.message.textContent = 'Unable to render point-and-click scene.';
      refs.interactables.innerHTML = '';
      refs.exits.innerHTML = '';
      refs.inventory.innerHTML = '';
      refs.notes.textContent = '';
      return;
    }

    pc.currentRoomId = room.id;
    pushVisitedRoom(pc, room.id);

    refs.room.textContent = `Room: ${room.name}`;
    refs.description.textContent = room.description;
    refs.message.textContent = pc.message;

    renderInteractables(pc, room);
    renderExits(pc, room);

    refs.inventory.innerHTML = pc.inventory.length > 0
      ? pc.inventory.map((itemId) => `<div class="card"><div class="card-title">${itemId}</div></div>`).join('')
      : '<div class="small">Inventory empty.</div>';

    refs.notes.textContent = `Visited rooms: ${pc.visitedRooms.join(', ') || 'none'} | Solved puzzles: ${Object.keys(pc.solvedPuzzles).length}`;
  }

  return {
    id: 'point_click',
    root,
    async enter() {
      root.dataset.sceneStatus = 'active';
      root.dataset.sceneKind = 'dom';
      ensureDom();
      await loadContent();

      const pc = slice();
      if (!pc.currentRoomId) {
        resetSlice(pc);
        enterInitialRoom(pc);
      }

      render();
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
      api.saveNow();
    },
    update() {
      // Purpose: reserved for future timed interactions.
    },
    render,
    onStateLoaded() {
      slice();
    }
  };
}

function resetSlice(pc) {
  pc.currentRoomId = null;
  pc.inventory = [];
  pc.flags = {};
  pc.solvedPuzzles = {};
  pc.dialogueSeen = {};
  pc.visitedRooms = [];
  pc.message = 'Explore the room and click interactables.';
  pc.lastOutcome = null;
}

function ensureRoot() {
  let root = document.getElementById('pointClickSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'pointClickSceneRoot';
  root.className = 'scene-root scene-root-dom';
  root.dataset.sceneId = 'point_click';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function fallbackContent() {
  return {
    startRoomId: 'office',
    rooms: [
      {
        id: 'office',
        name: 'Office',
        description: 'A cramped office with a locked drawer.',
        exits: [],
        interactables: []
      }
    ]
  };
}
