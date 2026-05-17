import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Creates a playable tower-defense scene with pathing, waves,
 * tower placement/upgrades, projectile attacks, and completion flow.
 */
export function createTowerDefenseScene(api) {
  const root = ensureRoot();
  let content = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.tower_defense || typeof state.scenes.tower_defense !== 'object') {
      state.scenes.tower_defense = {};
    }

    const td = state.scenes.tower_defense;
    td.levelId = typeof td.levelId === 'string' ? td.levelId : null;
    td.coins = Number.isInteger(td.coins) ? td.coins : 0;
    td.lives = Number.isInteger(td.lives) ? td.lives : 20;
    td.waveIndex = Number.isInteger(td.waveIndex) ? td.waveIndex : 0;
    td.kills = Number.isInteger(td.kills) ? td.kills : 0;
    td.towers = Array.isArray(td.towers) ? td.towers : [];
    td.completed = !!td.completed;
    td.message = typeof td.message === 'string' ? td.message : 'Click open tiles to place towers. Click towers to upgrade.';
    td.lastOutcome = td.lastOutcome && typeof td.lastOutcome === 'object' ? td.lastOutcome : null;
    return td;
  }

  async function loadContent() {
    if (content) return;

    try {
      content = await api.assetService.loadJson('/data/tower-defense-levels.json');
    } catch (error) {
      console.warn(error);
      content = fallbackContent();
    }
  }

  function getLevel(td) {
    const match = content.levels.find((level) => level.id === td.levelId);
    return match || content.levels.find((level) => level.id === content.startLevelId) || content.levels[0];
  }

  async function createBridge(mount) {
    await loadContent();

    const td = slice();
    if (!td.levelId) {
      td.levelId = content.startLevelId;
      td.coins = content.startCoins;
      td.lives = content.startLives;
      td.waveIndex = 0;
      td.kills = 0;
      td.towers = [];
      td.completed = false;
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
          gravity: { y: 0 },
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
        game.scene.pause('TowerDefenseRuntime');
      },
      resume() {
        game.scene.resume('TowerDefenseRuntime');
      },
      step() {
        // Purpose: Phaser runtime handles stepping internally.
      }
    };
  }

  return createPhaserSceneAdapter({
    id: 'tower_defense',
    root,
    createBridge
  });
}

function createRuntimeScene({ api, slice, getLevel, content }) {
  const tile = 32;
  let level;
  let pathPoints = [];
  let enemies = [];
  let towers = [];
  let projectiles = [];
  let spawnState = null;
  let hud;
  let status;
  let spawnTimer = 0;

  return {
    key: 'TowerDefenseRuntime',
    create() {
      hud = this.add.text(10, 10, '', {
        fontSize: '14px',
        color: '#F8FAFC',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(20);

      status = this.add.text(10, 30, '', {
        fontSize: '13px',
        color: '#CBD5E1',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(20);

      setupLevel.call(this);

      this.input.on('pointerdown', (pointer) => {
        handlePlacementOrUpgrade.call(this, pointer.worldX, pointer.worldY);
      });
    },
    update(_time, dtMs) {
      const dt = Math.min(0.05, dtMs / 1000);
      const td = slice();

      if (td.completed || td.lives <= 0) {
        hud.setText(`Coins:${td.coins} Lives:${td.lives} Waves:${td.waveIndex}/${level.waves.length}`);
        status.setText(td.message);
        return;
      }

      updateWaveSpawning(td, dt);
      updateEnemies.call(this, td, dt);
      updateTowers.call(this, td, dt);
      updateProjectiles.call(this, td, dt);
      checkWaveCompletion(td);

      hud.setText(`Coins:${td.coins} Lives:${td.lives} Wave:${Math.min(level.waves.length, td.waveIndex + 1)}/${level.waves.length}`);
      status.setText(td.message);
    }
  };

  function setupLevel() {
    const td = slice();
    level = getLevel(td);
    td.levelId = level.id;

    clearSceneTiles(this);
    drawGrid(this, level, tile);

    pathPoints = (level.path || []).map((p) => ({ x: p.x * tile + (tile / 2), y: p.y * tile + (tile / 2) }));

    towers = td.towers.map((towerData) => ({
      ...towerData,
      cooldown: 0,
      sprite: createTowerSprite(this, towerData.x, towerData.y, tile, towerData.level)
    }));

    enemies = [];
    projectiles = [];
    spawnTimer = 0;
    spawnState = {
      waveIndex: td.waveIndex,
      spawnedInWave: 0,
      active: true
    };

    td.message = 'Click open tiles to place towers. Click towers to upgrade.';
    api.saveNow();
  }

  function handlePlacementOrUpgrade(worldX, worldY) {
    const td = slice();
    if (td.completed || td.lives <= 0) return;

    const tx = Math.floor(worldX / tile);
    const ty = Math.floor(worldY / tile);

    const existingTower = towers.find((tower) => tower.x === tx && tower.y === ty);
    if (existingTower) {
      const upgradeCost = 30 * existingTower.level;
      if (td.coins < upgradeCost) {
        td.message = `Need ${upgradeCost} coins to upgrade.`;
        return;
      }

      td.coins -= upgradeCost;
      existingTower.level += 1;
      existingTower.range = 100 + (existingTower.level * 18);
      existingTower.damage = 4 + (existingTower.level * 2);
      existingTower.fireRate = Math.max(0.2, existingTower.fireRate * 0.9);
      existingTower.sprite.setFillStyle(0x22c55e + (existingTower.level * 0x080808));
      td.message = `Tower upgraded to level ${existingTower.level}.`;
      syncTowerSave(td);
      api.saveNow();
      return;
    }

    if (!isBuildable(level, tx, ty)) {
      td.message = 'Cannot build on path or blocked tile.';
      return;
    }

    const cost = 40;
    if (td.coins < cost) {
      td.message = 'Not enough coins to place a tower.';
      return;
    }

    td.coins -= cost;
    const tower = {
      x: tx,
      y: ty,
      level: 1,
      range: 100,
      damage: 4,
      fireRate: 0.8,
      cooldown: 0,
      sprite: createTowerSprite(this, tx, ty, tile, 1)
    };

    towers.push(tower);
    td.message = 'Tower placed.';
    syncTowerSave(td);
    api.saveNow();
  }

  function updateWaveSpawning(td, dt) {
    if (!spawnState?.active) return;

    const wave = level.waves[spawnState.waveIndex];
    if (!wave) {
      spawnState.active = false;
      return;
    }

    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    if (spawnState.spawnedInWave >= wave.count) {
      spawnState.active = false;
      return;
    }

    spawnTimer = wave.interval;
    spawnState.spawnedInWave += 1;

    const base = level.enemyTypes[wave.enemyType] || { hp: 10, speed: 60, reward: 5 };
    const sprite = this.add.circle(pathPoints[0].x, pathPoints[0].y, 10, 0xef4444);

    enemies.push({
      hp: base.hp,
      speed: base.speed,
      reward: base.reward,
      pathIndex: 1,
      sprite
    });
  }

  function updateEnemies(td, dt) {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      const target = pathPoints[enemy.pathIndex];

      if (!target) {
        enemy.sprite.destroy();
        enemies.splice(i, 1);
        td.lives -= 1;
        td.message = 'An enemy leaked through!';
        if (td.lives <= 0) {
          td.message = 'Defeat. Base integrity lost.';
          finalizeFailure(td);
        }
        api.saveNow();
        continue;
      }

      const dx = target.x - enemy.sprite.x;
      const dy = target.y - enemy.sprite.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 4) {
        enemy.pathIndex += 1;
        continue;
      }

      const step = enemy.speed * dt;
      enemy.sprite.x += (dx / dist) * Math.min(step, dist);
      enemy.sprite.y += (dy / dist) * Math.min(step, dist);
    }
  }

  function updateTowers(td, dt) {
    for (const tower of towers) {
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;

      const towerX = tower.x * tile + (tile / 2);
      const towerY = tower.y * tile + (tile / 2);
      const target = enemies.find((enemy) => Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, towerX, towerY) <= tower.range);
      if (!target) continue;

      tower.cooldown = tower.fireRate;
      const projectile = this.add.circle(towerX, towerY, 4, 0xfbbf24);
      projectiles.push({ projectile, target, damage: tower.damage, speed: 260 });
    }
  }

  function updateProjectiles(td, dt) {
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const shot = projectiles[i];
      if (!shot.target || !shot.target.sprite?.active) {
        shot.projectile.destroy();
        projectiles.splice(i, 1);
        continue;
      }

      const dx = shot.target.sprite.x - shot.projectile.x;
      const dy = shot.target.sprite.y - shot.projectile.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 8) {
        shot.target.hp -= shot.damage;
        shot.projectile.destroy();
        projectiles.splice(i, 1);

        if (shot.target.hp <= 0) {
          const enemyIndex = enemies.indexOf(shot.target);
          if (enemyIndex >= 0) {
            enemies[enemyIndex].sprite.destroy();
            enemies.splice(enemyIndex, 1);
          }

          td.kills += 1;
          td.coins += shot.target.reward;
          td.message = `Enemy destroyed. +${shot.target.reward} coins.`;
        }

        continue;
      }

      const step = shot.speed * dt;
      shot.projectile.x += (dx / dist) * Math.min(step, dist);
      shot.projectile.y += (dy / dist) * Math.min(step, dist);
    }
  }

  function checkWaveCompletion(td) {
    if (spawnState?.active) return;
    if (enemies.length > 0) return;

    td.waveIndex += 1;
    if (td.waveIndex >= level.waves.length) {
      td.completed = true;
      td.message = 'Defense complete! All waves cleared.';
      finalizeSuccess(td);
      api.saveNow();
      return;
    }

    spawnState = {
      waveIndex: td.waveIndex,
      spawnedInWave: 0,
      active: true
    };
    td.message = `Wave ${td.waveIndex + 1} started.`;
    api.saveNow();
  }

  function syncTowerSave(td) {
    td.towers = towers.map((tower) => ({ x: tower.x, y: tower.y, level: tower.level }));
  }

  function finalizeSuccess(td) {
    td.lastOutcome = {
      sceneId: 'tower_defense',
      endingId: 'tower_defense_complete',
      ts: Date.now(),
      wavesCleared: level.waves.length,
      livesRemaining: td.lives,
      kills: td.kills,
      towerCount: towers.length
    };

    api.setSaveStatus?.('Tower defense completion recorded for progression hooks.');
  }

  function finalizeFailure(td) {
    td.lastOutcome = {
      sceneId: 'tower_defense',
      endingId: 'tower_defense_failed',
      ts: Date.now(),
      waveIndex: td.waveIndex,
      kills: td.kills,
      towerCount: towers.length
    };

    api.setSaveStatus?.('Tower defense failure recorded.');
  }
}

function drawGrid(scene, level, tile) {
  const pathSet = new Set((level.path || []).map((p) => `${p.x},${p.y}`));
  const blockedSet = new Set(level.blocked || []);

  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const id = `${x},${y}`;
      let color = 0x1f2937;
      if (pathSet.has(id)) color = 0x334155;
      if (blockedSet.has(id)) color = 0x0f172a;

      const rect = scene.add.rectangle(x * tile + (tile / 2), y * tile + (tile / 2), tile - 1, tile - 1, color);
      rect.setData('towerDefenseTile', true);
    }
  }
}

function createTowerSprite(scene, x, y, tile, level) {
  return scene.add.rectangle(
    x * tile + (tile / 2),
    y * tile + (tile / 2),
    tile * 0.68,
    tile * 0.68,
    0x22c55e + (level * 0x080808)
  );
}

function isBuildable(level, x, y) {
  const pathSet = new Set((level.path || []).map((p) => `${p.x},${p.y}`));
  const blockedSet = new Set(level.blocked || []);
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  if (pathSet.has(`${x},${y}`)) return false;
  if (blockedSet.has(`${x},${y}`)) return false;
  return true;
}

function buildStaticTiles(coords, group, tile) {
  group.clear(true, true);

  for (const coord of coords) {
    const [x, y] = String(coord).split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const wall = group.create(x * tile + (tile / 2), y * tile + (tile / 2), null);
    wall.setSize(tile, tile);
    wall.setVisible(false);
    wall.refreshBody();
  }
}

function clearSceneTiles(scene) {
  scene.children.list
    .filter((obj) => obj.getData?.('towerDefenseTile') === true)
    .forEach((obj) => obj.destroy());
}

function ensureRoot() {
  let root = document.getElementById('towerDefenseSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'towerDefenseSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'tower_defense';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function fallbackContent() {
  return {
    startLevelId: 'defense_lane',
    startCoins: 120,
    startLives: 20,
    levels: [
      {
        id: 'defense_lane',
        width: 20,
        height: 12,
        blocked: [],
        path: [{ x: 0, y: 6 }, { x: 19, y: 6 }],
        enemyTypes: { basic: { hp: 12, speed: 60, reward: 5 } },
        waves: [{ enemyType: 'basic', count: 5, interval: 1.0 }]
      }
    ]
  };
}
