import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Creates a playable platformer Phaser scene with movement, jump/gravity,
 * hazards, checkpoints, and stage completion tracking.
 */
export function createPlatformerScene(api) {
  const root = ensureRoot();
  let content = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.platformer || typeof state.scenes.platformer !== 'object') {
      state.scenes.platformer = {};
    }

    const pf = state.scenes.platformer;
    pf.currentLevelId = typeof pf.currentLevelId === 'string' ? pf.currentLevelId : null;
    pf.checkpoint = pf.checkpoint && typeof pf.checkpoint === 'object' ? pf.checkpoint : null;
    pf.deaths = Number.isInteger(pf.deaths) ? pf.deaths : 0;
    pf.completions = pf.completions && typeof pf.completions === 'object' ? pf.completions : {};
    pf.bestTimeMs = pf.bestTimeMs && typeof pf.bestTimeMs === 'object' ? pf.bestTimeMs : {};
    pf.message = typeof pf.message === 'string' ? pf.message : 'Reach the goal. Jump with W / Up / Space.';
    pf.lastOutcome = pf.lastOutcome && typeof pf.lastOutcome === 'object' ? pf.lastOutcome : null;
    return pf;
  }

  async function loadContent() {
    if (content) return;

    try {
      content = await api.assetService.loadJson('/data/platformer-levels.json');
    } catch (error) {
      console.warn(error);
      content = fallbackContent();
    }
  }

  function getLevel(pf) {
    const match = content.levels.find((level) => level.id === pf.currentLevelId);
    return match || content.levels.find((level) => level.id === content.startLevelId) || content.levels[0];
  }

  async function createBridge(mount) {
    await loadContent();

    const pf = slice();
    if (!pf.currentLevelId) {
      pf.currentLevelId = content.startLevelId;
      pf.checkpoint = null;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount,
      width: Math.max(1, mount.clientWidth),
      height: Math.max(1, mount.clientHeight),
      backgroundColor: '#0F172A',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 980 },
          debug: false
        }
      },
      scene: createRuntimeScene({ api, slice, getLevel, content })
    });

    return {
      destroy(removeCanvas = true) {
        game.destroy(removeCanvas);
      },
      resize(width, height) {
        game.scale.resize(width, height);
      },
      pause() {
        game.scene.pause('PlatformerRuntime');
      },
      resume() {
        game.scene.resume('PlatformerRuntime');
      },
      step() {
        // Purpose: Phaser owns stepping; adapter exposes step compatibility.
      }
    };
  }

  return createPhaserSceneAdapter({
    id: 'platformer',
    root,
    createBridge
  });
}

function createRuntimeScene({ api, slice, getLevel, content }) {
  const tile = 32;
  let player;
  let cursors;
  let keys;
  let platforms;
  let hazards;
  let checkpoints;
  let goalZone;
  let levelStartMs = 0;
  let currentLevel = null;
  let levelText;
  let statusText;

  return {
    key: 'PlatformerRuntime',
    create() {
      this.cameras.main.setBackgroundColor('#0F172A');
      cursors = this.input.keyboard.createCursorKeys();
      keys = this.input.keyboard.addKeys('A,D,W,SPACE,R');

      // Purpose: HUD gives direct feedback for level and platformer state.
      levelText = this.add.text(10, 10, '', {
        fontSize: '14px',
        color: '#F8FAFC',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(20);

      statusText = this.add.text(10, 30, '', {
        fontSize: '13px',
        color: '#CBD5E1',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(20);

      player = this.add.rectangle(0, 0, tile * 0.7, tile * 0.9, 0x38bdf8);
      this.physics.add.existing(player);
      player.body.setBounce(0);
      player.body.setCollideWorldBounds(true);
      player.body.setDragX(900);
      player.body.setMaxVelocity(240, 900);

      platforms = this.physics.add.staticGroup();
      hazards = this.physics.add.staticGroup();
      checkpoints = this.physics.add.staticGroup();
      goalZone = this.physics.add.staticGroup();

      this.physics.add.collider(player, platforms);
      this.physics.add.overlap(player, hazards, () => handleDeath.call(this));
      this.physics.add.overlap(player, checkpoints, (_p, marker) => handleCheckpoint(marker));
      this.physics.add.overlap(player, goalZone, () => handleCompletion());

      loadCurrentLevel.call(this);
      this.cameras.main.startFollow(player, true, 0.1, 0.08);
      this.cameras.main.setZoom(1.1);
    },
    update() {
      if (!player || !currentLevel) return;

      const pf = slice();

      const moveLeft = cursors.left.isDown || keys.A.isDown;
      const moveRight = cursors.right.isDown || keys.D.isDown;
      const jumpPressed = Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(keys.W) || Phaser.Input.Keyboard.JustDown(keys.SPACE);
      const restartPressed = Phaser.Input.Keyboard.JustDown(keys.R);

      if (restartPressed) {
        respawnPlayer.call(this);
        pf.message = 'Restarted from checkpoint.';
        api.saveNow();
      }

      if (moveLeft && !moveRight) {
        player.body.setAccelerationX(-600);
      } else if (moveRight && !moveLeft) {
        player.body.setAccelerationX(600);
      } else {
        player.body.setAccelerationX(0);
      }

      if (jumpPressed && player.body.blocked.down) {
        player.body.setVelocityY(-420);
      }

      levelText.setText(`Level: ${currentLevel.name}`);
      statusText.setText(`${pf.message} Deaths: ${pf.deaths}`);
    }
  };

  function loadCurrentLevel() {
    const pf = slice();
    currentLevel = getLevel(pf);
    pf.currentLevelId = currentLevel.id;

    clearLevelGraphics(this);
    spawnLevelElements(this, currentLevel, { platforms, hazards, checkpoints, goalZone, tile });

    const spawn = pf.checkpoint && pf.checkpoint.levelId === currentLevel.id
      ? pf.checkpoint
      : currentLevel.spawn;

    player.setPosition(spawn.x * tile, spawn.y * tile);
    player.body.setVelocity(0, 0);
    player.body.setAcceleration(0, 0);

    this.physics.world.setBounds(0, 0, currentLevel.width * tile, currentLevel.height * tile);
    levelStartMs = Date.now();
    api.saveNow();
  }

  function handleCheckpoint(marker) {
    const pf = slice();
    const checkpoint = marker.getData('checkpoint');

    if (!checkpoint) return;

    pf.checkpoint = {
      levelId: currentLevel.id,
      x: checkpoint.x,
      y: checkpoint.y
    };
    pf.message = `Checkpoint reached: ${checkpoint.id}`;

    // Purpose: checkpoint updates are persisted immediately to respect player progress.
    api.saveNow();
  }

  function handleDeath() {
    const pf = slice();
    pf.deaths += 1;
    pf.message = 'You hit a hazard and respawned.';

    respawnPlayer.call(this);
    api.saveNow();
  }

  function respawnPlayer() {
    const pf = slice();
    const spawn = pf.checkpoint && pf.checkpoint.levelId === currentLevel.id
      ? pf.checkpoint
      : currentLevel.spawn;

    player.setPosition(spawn.x * tile, spawn.y * tile);
    player.body.setVelocity(0, 0);
    player.body.setAcceleration(0, 0);
  }

  function handleCompletion() {
    const pf = slice();
    const elapsedMs = Math.max(1, Date.now() - levelStartMs);

    pf.completions[currentLevel.id] = (pf.completions[currentLevel.id] || 0) + 1;
    const prevBest = pf.bestTimeMs[currentLevel.id];
    if (!prevBest || elapsedMs < prevBest) {
      pf.bestTimeMs[currentLevel.id] = elapsedMs;
    }

    pf.lastOutcome = {
      sceneId: 'platformer',
      endingId: 'platformer_complete',
      ts: Date.now(),
      levelId: currentLevel.id,
      deaths: pf.deaths,
      elapsedMs,
      bestTimeMs: pf.bestTimeMs[currentLevel.id]
    };

    pf.message = `Level complete in ${(elapsedMs / 1000).toFixed(2)}s.`;
    api.setSaveStatus?.('Platformer completion recorded for progression hooks.');

    const nextLevelId = currentLevel.nextLevelId;
    if (nextLevelId) {
      const nextLevel = content.levels.find((level) => level.id === nextLevelId);
      if (nextLevel) {
        pf.currentLevelId = nextLevel.id;
        pf.checkpoint = null;
        currentLevel = nextLevel;
        clearLevelGraphics(this);
        spawnLevelElements(this, currentLevel, { platforms, hazards, checkpoints, goalZone, tile });
        respawnPlayer.call(this);
        levelStartMs = Date.now();
      }
    }

    api.saveNow();
  }
}

function clearLevelGraphics(scene) {
  scene.children.list
    .filter((obj) => obj.getData?.('platformerTile') === true)
    .forEach((obj) => obj.destroy());
}

function spawnLevelElements(scene, level, groups) {
  const { platforms, hazards, checkpoints, goalZone, tile } = groups;

  platforms.clear(true, true);
  hazards.clear(true, true);
  checkpoints.clear(true, true);
  goalZone.clear(true, true);

  drawTiles(scene, level, tile);

  for (const coord of level.platforms || []) {
    const [x, y] = parseCoord(coord);
    if (x === null) continue;
    const wall = platforms.create(x * tile + (tile / 2), y * tile + (tile / 2), null);
    wall.setSize(tile, tile);
    wall.setVisible(false);
    wall.refreshBody();
  }

  for (const hazard of level.hazards || []) {
    const marker = hazards.create(hazard.x * tile + (tile / 2), hazard.y * tile + (tile / 2), null);
    marker.setSize(tile * 0.9, tile * 0.9);
    marker.setVisible(false);
    marker.refreshBody();
  }

  for (const checkpoint of level.checkpoints || []) {
    const marker = checkpoints.create(checkpoint.x * tile + (tile / 2), checkpoint.y * tile + (tile / 2), null);
    marker.setSize(tile * 0.65, tile * 0.9);
    marker.setVisible(false);
    marker.setData('checkpoint', checkpoint);
    marker.refreshBody();
  }

  if (level.goal) {
    const marker = goalZone.create(level.goal.x * tile + (tile / 2), level.goal.y * tile + (tile / 2), null);
    marker.setSize(tile * 0.8, tile * 1.2);
    marker.setVisible(false);
    marker.refreshBody();
  }
}

function drawTiles(scene, level, tile) {
  const platformSet = new Set(level.platforms || []);
  const hazardSet = new Set((level.hazards || []).map((h) => `${h.x},${h.y}`));
  const checkpointSet = new Set((level.checkpoints || []).map((cp) => `${cp.x},${cp.y}`));
  const goalId = level.goal ? `${level.goal.x},${level.goal.y}` : null;

  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const id = `${x},${y}`;
      let color = 0x1f2937;
      if (platformSet.has(id)) color = 0x475569;
      if (hazardSet.has(id)) color = 0xef4444;
      if (checkpointSet.has(id)) color = 0xf59e0b;
      if (goalId === id) color = 0x22c55e;

      const rect = scene.add.rectangle(
        x * tile + (tile / 2),
        y * tile + (tile / 2),
        tile - 1,
        tile - 1,
        color
      );
      rect.setData('platformerTile', true);
    }
  }
}

function parseCoord(coord) {
  const [x, y] = String(coord || '').split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return [null, null];
  }

  return [x, y];
}

function ensureRoot() {
  let root = document.getElementById('platformerSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'platformerSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'platformer';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function fallbackContent() {
  return {
    startLevelId: 'training_platforms',
    levels: [
      {
        id: 'training_platforms',
        name: 'Training Platforms',
        width: 16,
        height: 10,
        spawn: { x: 2, y: 6 },
        platforms: [],
        hazards: [],
        checkpoints: [],
        goal: { x: 14, y: 6 },
        nextLevelId: null
      }
    ]
  };
}
