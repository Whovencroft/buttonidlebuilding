import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Creates a playable retro RPG Phaser scene with map traversal,
 * collisions, NPC interactions, event triggers, and save integration.
 */
export function createRetroRpgScene(api) {
  const root = ensureRoot();
  let content = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.retro_rpg || typeof state.scenes.retro_rpg !== 'object') {
      state.scenes.retro_rpg = {};
    }

    const rpg = state.scenes.retro_rpg;
    rpg.currentMapId = typeof rpg.currentMapId === 'string' ? rpg.currentMapId : null;
    rpg.player = rpg.player && typeof rpg.player === 'object' ? rpg.player : { x: 2, y: 2 };
    rpg.flags = rpg.flags && typeof rpg.flags === 'object' ? rpg.flags : {};
    rpg.completedEvents = rpg.completedEvents && typeof rpg.completedEvents === 'object' ? rpg.completedEvents : {};
    rpg.dialogueSeen = rpg.dialogueSeen && typeof rpg.dialogueSeen === 'object' ? rpg.dialogueSeen : {};
    rpg.message = typeof rpg.message === 'string' ? rpg.message : 'Explore and press E near NPCs.';
    rpg.lastOutcome = rpg.lastOutcome && typeof rpg.lastOutcome === 'object' ? rpg.lastOutcome : null;
    return rpg;
  }

  async function loadContent() {
    if (content) return;

    try {
      content = await api.assetService.loadJson('/data/retro-rpg-maps.json');
    } catch (error) {
      console.warn(error);
      content = fallbackContent();
    }
  }

  function currentMap(rpg) {
    const map = content.maps.find((entry) => entry.id === rpg.currentMapId);
    return map || content.maps.find((entry) => entry.id === content.startMapId) || content.maps[0];
  }

  function ensureStartState(rpg) {
    if (!rpg.currentMapId) {
      rpg.currentMapId = content.startMapId;
      rpg.player = { ...(content.startPlayer || { x: 2, y: 2 }) };
    }
  }

  async function createBridge(mount) {
    await loadContent();
    const rpg = slice();
    ensureStartState(rpg);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount,
      width: Math.max(1, mount.clientWidth),
      height: Math.max(1, mount.clientHeight),
      backgroundColor: '#0F172A',
      physics: {
        default: 'arcade',
        arcade: {
          debug: false
        }
      },
      scene: createRuntimeScene({ api, slice, currentMap, content })
    });

    return {
      destroy(removeCanvas = true) {
        game.destroy(removeCanvas);
      },
      resize(width, height) {
        game.scale.resize(width, height);
      },
      pause() {
        game.scene.pause('RetroRpgRuntime');
      },
      resume() {
        game.scene.resume('RetroRpgRuntime');
      },
      step() {
        // Purpose: adapter compatibility; Phaser drives its own update loop.
      }
    };
  }

  return createPhaserSceneAdapter({
    id: 'retro_rpg',
    root,
    createBridge
  });
}

function createRuntimeScene({ api, slice, currentMap, content }) {
  const tileSize = 32;
  let cursors;
  let keys;
  let player;
  let walls;
  let npcs;
  let triggerZones;
  let activeMap = null;
  let statusText;
  let mapLabel;
  let interactCooldown = 0;
  let spawnSet = false;

  return {
    key: 'RetroRpgRuntime',
    create() {
      this.cameras.main.setBackgroundColor('#020617');

      // Purpose: HUD text communicates map/message state without leaving scene context.
      mapLabel = this.add.text(10, 10, '', {
        fontSize: '14px',
        color: '#E2E8F0',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(10);

      statusText = this.add.text(10, 30, '', {
        fontSize: '13px',
        color: '#CBD5E1',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(10);

      player = this.add.rectangle(0, 0, tileSize * 0.7, tileSize * 0.7, 0x60a5fa);
      this.physics.add.existing(player);
      player.body.setCollideWorldBounds(true);

      cursors = this.input.keyboard.createCursorKeys();
      keys = this.input.keyboard.addKeys('W,A,S,D,E,SPACE');

      walls = this.physics.add.staticGroup();
      npcs = this.physics.add.staticGroup();
      triggerZones = this.physics.add.staticGroup();

      // Purpose: overlap checks dispatch interactions and event triggers.
      this.physics.add.collider(player, walls);
      this.physics.add.overlap(player, triggerZones, (_player, triggerObj) => {
        const trigger = triggerObj.getData('trigger');
        if (trigger) {
          handleTrigger(trigger);
        }
      });

      this.cameras.main.startFollow(player, true, 0.15, 0.15);
      this.cameras.main.setZoom(1.2);
      loadActiveMap.call(this);
    },
    update(_time, dtMs) {
      const dt = dtMs / 1000;
      interactCooldown = Math.max(0, interactCooldown - dt);

      const speed = 130;
      const vx = axisValue(cursors.left.isDown || keys.A.isDown, cursors.right.isDown || keys.D.isDown) * speed;
      const vy = axisValue(cursors.up.isDown || keys.W.isDown, cursors.down.isDown || keys.S.isDown) * speed;
      player.body.setVelocity(vx, vy);

      if (vx !== 0 && vy !== 0) {
        player.body.velocity.normalize().scale(speed);
      }

      const rpg = slice();
      rpg.player.x = player.x / tileSize;
      rpg.player.y = player.y / tileSize;

      mapLabel.setText(`Map: ${activeMap?.name || 'Unknown'}`);
      statusText.setText(rpg.message || 'Explore and press E near NPCs.');

      const interactPressed = Phaser.Input.Keyboard.JustDown(keys.E) || Phaser.Input.Keyboard.JustDown(keys.SPACE);
      if (interactPressed && interactCooldown <= 0) {
        interactCooldown = 0.2;
        tryNpcInteraction.call(this);
      }
    }
  };

  function loadActiveMap() {
    const rpg = slice();
    activeMap = currentMap(rpg);

    if (!spawnSet) {
      spawnSet = true;
      player.setPosition(rpg.player.x * tileSize, rpg.player.y * tileSize);
    }

    this.physics.world.setBounds(0, 0, activeMap.width * tileSize, activeMap.height * tileSize);

    walls.clear(true, true);
    npcs.clear(true, true);
    triggerZones.clear(true, true);

    drawTiles.call(this, activeMap, tileSize);
    buildWalls(activeMap, walls, tileSize);
    buildNpcs(activeMap, npcs, tileSize);
    buildTriggers(activeMap, triggerZones, tileSize);

    api.saveNow();
  }

  function tryNpcInteraction() {
    const rpg = slice();
    const nearbyNpc = findNearbyNpc(player, npcs, tileSize * 1.1);
    if (!nearbyNpc) {
      rpg.message = 'No one nearby to talk to.';
      return;
    }

    const npc = nearbyNpc.getData('npc');
    const talkCount = Number(rpg.dialogueSeen[npc.id] || 0);
    const lines = Array.isArray(npc.lines) ? npc.lines : ['...'];
    const line = lines[Math.min(talkCount, lines.length - 1)];

    rpg.dialogueSeen[npc.id] = talkCount + 1;
    rpg.message = line;

    if (npc.setFlag) {
      rpg.flags[npc.setFlag] = true;
    }

    api.saveNow();
  }

  function handleTrigger(trigger) {
    const rpg = slice();

    if (trigger.id && rpg.completedEvents[trigger.id]) {
      return;
    }

    if (trigger.requiresFlag && !rpg.flags[trigger.requiresFlag]) {
      return;
    }

    if (trigger.type === 'flag') {
      if (trigger.setFlag) {
        rpg.flags[trigger.setFlag] = true;
      }
      rpg.message = trigger.message || 'A mechanism shifts somewhere in the map.';
      if (trigger.id) {
        rpg.completedEvents[trigger.id] = true;
      }
    }

    if (trigger.type === 'warp' && typeof trigger.targetMapId === 'string') {
      const target = content.maps.find((map) => map.id === trigger.targetMapId);
      if (target) {
        rpg.currentMapId = target.id;
        rpg.player = { ...(trigger.targetPlayer || target.spawn || { x: 2, y: 2 }) };
        player.setPosition(rpg.player.x * tileSize, rpg.player.y * tileSize);
        activeMap = target;
        drawTiles.call(this, activeMap, tileSize);
        buildWalls(activeMap, walls, tileSize);
        buildNpcs(activeMap, npcs, tileSize);
        buildTriggers(activeMap, triggerZones, tileSize);
        rpg.message = trigger.message || `Moved to ${target.name}.`;
      }
    }

    if (trigger.type === 'complete') {
      rpg.lastOutcome = {
        sceneId: 'retro_rpg',
        endingId: 'retro_rpg_complete',
        ts: Date.now(),
        mapId: activeMap?.id || null,
        completedEvents: Object.keys(rpg.completedEvents).length,
        flags: Object.keys(rpg.flags).sort()
      };
      rpg.message = trigger.message || 'Quest complete.';
      api.setSaveStatus?.('Retro RPG completion recorded for progression hooks.');
      if (trigger.id) {
        rpg.completedEvents[trigger.id] = true;
      }
    }

    api.saveNow();
  }
}

function drawTiles(map, tileSize) {
  this.children.list
    .filter((obj) => obj.getData?.('tileLayer') === true)
    .forEach((obj) => obj.destroy());

  const blocked = new Set(Array.isArray(map.blocked) ? map.blocked : []);
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const idx = `${x},${y}`;
      const isBlocked = blocked.has(idx);
      const color = isBlocked ? 0x1f2937 : 0x334155;
      const tile = this.add.rectangle(
        x * tileSize + tileSize / 2,
        y * tileSize + tileSize / 2,
        tileSize - 1,
        tileSize - 1,
        color
      );
      tile.setOrigin(0.5);
      tile.setData('tileLayer', true);
    }
  }
}

function buildWalls(map, walls, tileSize) {
  walls.clear(true, true);
  const blocked = Array.isArray(map.blocked) ? map.blocked : [];

  for (const coord of blocked) {
    const [x, y] = coord.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const wall = walls.create(x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, null);
    wall.setSize(tileSize - 2, tileSize - 2);
    wall.setVisible(false);
    wall.refreshBody();
  }
}

function buildNpcs(map, npcs, tileSize) {
  npcs.clear(true, true);
  const list = Array.isArray(map.npcs) ? map.npcs : [];

  for (const npc of list) {
    const sprite = npcs.create(npc.x * tileSize + tileSize / 2, npc.y * tileSize + tileSize / 2, null);
    sprite.setSize(tileSize * 0.72, tileSize * 0.72);
    sprite.setVisible(false);
    sprite.setData('npc', npc);
    sprite.refreshBody();
  }
}

function buildTriggers(map, triggerZones, tileSize) {
  triggerZones.clear(true, true);
  const list = Array.isArray(map.triggers) ? map.triggers : [];

  for (const trigger of list) {
    const zone = triggerZones.create(trigger.x * tileSize + tileSize / 2, trigger.y * tileSize + tileSize / 2, null);
    zone.setSize(tileSize * 0.8, tileSize * 0.8);
    zone.setVisible(false);
    zone.setData('trigger', trigger);
    zone.refreshBody();
  }
}

function findNearbyNpc(player, npcs, maxDistance) {
  const list = npcs.getChildren();
  for (const npc of list) {
    const dist = Phaser.Math.Distance.Between(player.x, player.y, npc.x, npc.y);
    if (dist <= maxDistance) {
      return npc;
    }
  }

  return null;
}

function axisValue(negativePressed, positivePressed) {
  if (negativePressed && !positivePressed) return -1;
  if (positivePressed && !negativePressed) return 1;
  return 0;
}

function ensureRoot() {
  let root = document.getElementById('retroRpgSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'retroRpgSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'retro_rpg';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function fallbackContent() {
  return {
    startMapId: 'town_square',
    startPlayer: { x: 2, y: 2 },
    maps: [
      {
        id: 'town_square',
        name: 'Town Square',
        width: 10,
        height: 8,
        blocked: [],
        npcs: [],
        triggers: []
      }
    ]
  };
}
