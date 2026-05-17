import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Creates a playable metroidvania scene with room transitions,
 * traversal ability gating, and checkpoint persistence.
 */
export function createMetroidvaniaScene(api) {
  const root = ensureRoot();
  let content = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.metroidvania || typeof state.scenes.metroidvania !== 'object') {
      state.scenes.metroidvania = {};
    }

    const mv = state.scenes.metroidvania;
    mv.currentRoomId = typeof mv.currentRoomId === 'string' ? mv.currentRoomId : null;
    mv.spawn = mv.spawn && typeof mv.spawn === 'object'
      ? {
        roomId: typeof mv.spawn.roomId === 'string' ? mv.spawn.roomId : null,
        x: Number.isFinite(mv.spawn.x) ? mv.spawn.x : null,
        y: Number.isFinite(mv.spawn.y) ? mv.spawn.y : null
      }
      : null;
    mv.checkpoint = mv.checkpoint && typeof mv.checkpoint === 'object'
      ? {
        id: typeof mv.checkpoint.id === 'string' ? mv.checkpoint.id : null,
        roomId: typeof mv.checkpoint.roomId === 'string' ? mv.checkpoint.roomId : null,
        x: Number.isFinite(mv.checkpoint.x) ? mv.checkpoint.x : null,
        y: Number.isFinite(mv.checkpoint.y) ? mv.checkpoint.y : null
      }
      : null;
    mv.abilities = mv.abilities && typeof mv.abilities === 'object'
      ? {
        doubleJump: !!mv.abilities.doubleJump,
        dash: !!mv.abilities.dash
      }
      : { doubleJump: false, dash: false };
    mv.regionFlags = mv.regionFlags && typeof mv.regionFlags === 'object' ? mv.regionFlags : {};
    mv.visitedRooms = Array.isArray(mv.visitedRooms) ? mv.visitedRooms : [];
    mv.collectedAbilities = Array.isArray(mv.collectedAbilities) ? mv.collectedAbilities : [];
    mv.deaths = Number.isInteger(mv.deaths) ? mv.deaths : 0;
    mv.completed = !!mv.completed;
    mv.message = typeof mv.message === 'string' ? mv.message : 'Explore and find traversal abilities.';
    mv.lastOutcome = mv.lastOutcome && typeof mv.lastOutcome === 'object' ? mv.lastOutcome : null;
    return mv;
  }

  async function loadContent() {
    if (content) return;

    try {
      content = await api.assetService.loadJson('/data/metroidvania-rooms.json');
    } catch (error) {
      console.warn(error);
      content = fallbackContent();
    }
  }

  function getRoom(id) {
    return content.rooms.find((room) => room.id === id) || null;
  }

  async function createBridge(mount) {
    await loadContent();

    const mv = slice();
    if (!mv.currentRoomId) {
      mv.currentRoomId = content.startRoomId;
      mv.spawn = {
        roomId: content.startRoomId,
        x: content.startSpawn.x,
        y: content.startSpawn.y
      };
      mv.checkpoint = null;
      mv.message = 'Explore and find traversal abilities.';
      mv.completed = false;
      mv.lastOutcome = null;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount,
      width: Math.max(1, mount.clientWidth),
      height: Math.max(1, mount.clientHeight),
      backgroundColor: '#020617',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 900 },
          debug: false
        }
      },
      scene: createRuntimeScene({ api, slice, content, getRoom })
    });

    return {
      destroy(removeCanvas = true) {
        game.destroy(removeCanvas);
      },
      resize(width, height) {
        game.scale.resize(width, height);
      },
      pause() {
        game.scene.pause('MetroidvaniaRuntime');
      },
      resume() {
        game.scene.resume('MetroidvaniaRuntime');
      },
      step() {
        // Purpose: Phaser runtime owns frame stepping.
      }
    };
  }

  return createPhaserSceneAdapter({
    id: 'metroidvania',
    root,
    createBridge
  });
}

function createRuntimeScene({ api, slice, content, getRoom }) {
  const tile = 32;
  const colors = {
    solid: 0x1e293b,
    hazard: 0xef4444,
    door: 0x38bdf8,
    lockedDoor: 0xf59e0b,
    checkpoint: 0x22c55e,
    ability: 0xc084fc,
    flag: 0x14b8a6,
    goal: 0xfacc15
  };

  let player;
  let cursors;
  let keys;
  let room = null;
  let roomText;
  let stateText;
  let abilityText;
  let solids;
  let hazards;
  let doors;
  let checkpoints;
  let abilityPickups;
  let flagMarkers;
  let goalZone;
  let jumpCount = 0;
  let dashCooldown = 0;
  let invulnTimer = 0;

  return {
    key: 'MetroidvaniaRuntime',
    create() {
      // Purpose: HUD text keeps room and progression state visible.
      roomText = this.add.text(10, 10, '', {
        fontSize: '14px',
        color: '#E2E8F0',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(20);

      stateText = this.add.text(10, 30, '', {
        fontSize: '13px',
        color: '#94A3B8',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(20);

      abilityText = this.add.text(10, 50, '', {
        fontSize: '13px',
        color: '#CBD5E1',
        fontFamily: 'monospace'
      }).setScrollFactor(0).setDepth(20);

      cursors = this.input.keyboard.createCursorKeys();
      keys = this.input.keyboard.addKeys('A,D,W,SPACE,SHIFT');

      player = this.add.rectangle(0, 0, 20, 28, 0xf8fafc);
      this.physics.add.existing(player);
      player.body.setCollideWorldBounds(true);
      player.body.setSize(20, 28);
      player.body.setDragX(900);
      player.body.setMaxVelocity(260, 820);

      solids = this.physics.add.staticGroup();
      hazards = this.physics.add.staticGroup();
      doors = this.physics.add.staticGroup();
      checkpoints = this.physics.add.staticGroup();
      abilityPickups = this.physics.add.staticGroup();
      flagMarkers = this.physics.add.staticGroup();
      goalZone = this.physics.add.staticGroup();

      this.physics.add.collider(player, solids);
      this.physics.add.overlap(player, hazards, () => handleHazard.call(this));
      this.physics.add.overlap(player, doors, (_p, zone) => handleDoor(zone));
      this.physics.add.overlap(player, checkpoints, (_p, marker) => handleCheckpoint(marker));
      this.physics.add.overlap(player, abilityPickups, (_p, pickup) => handleAbilityPickup(pickup));
      this.physics.add.overlap(player, flagMarkers, (_p, marker) => handleFlag(marker));
      this.physics.add.overlap(player, goalZone, () => handleGoal());

      loadCurrentRoom.call(this, slice().currentRoomId, { useSpawn: true });
      this.cameras.main.startFollow(player, true, 0.12, 0.1);
      this.cameras.main.setZoom(1.1);
    },
    update(_time, dtMs) {
      if (!room || !player) return;

      const dt = Math.min(0.05, dtMs / 1000);
      const mv = slice();

      if (mv.completed) {
        roomText.setText(`Region: ${room.name}`);
        stateText.setText(mv.message);
        abilityText.setText(renderAbilityLine(mv));
        return;
      }

      invulnTimer = Math.max(0, invulnTimer - dt);
      dashCooldown = Math.max(0, dashCooldown - dt);

      const left = cursors.left.isDown || keys.A.isDown;
      const right = cursors.right.isDown || keys.D.isDown;
      const jumpPressed = Phaser.Input.Keyboard.JustDown(cursors.up)
        || Phaser.Input.Keyboard.JustDown(keys.W)
        || Phaser.Input.Keyboard.JustDown(keys.SPACE);
      const dashPressed = Phaser.Input.Keyboard.JustDown(keys.SHIFT);

      if (left && !right) {
        player.body.setAccelerationX(-760);
      } else if (right && !left) {
        player.body.setAccelerationX(760);
      } else {
        player.body.setAccelerationX(0);
      }

      if (player.body.blocked.down) {
        jumpCount = 0;
      }

      if (jumpPressed) {
        if (player.body.blocked.down) {
          player.body.setVelocityY(-420);
          jumpCount = 1;
        } else if (mv.abilities.doubleJump && jumpCount < 2) {
          player.body.setVelocityY(-390);
          jumpCount += 1;
          mv.message = 'Double jump activated.';
        }
      }

      if (dashPressed && mv.abilities.dash && dashCooldown <= 0) {
        const facing = player.body.velocity.x >= 0 ? 1 : -1;
        player.body.setVelocityX(420 * facing);
        dashCooldown = 0.7;
        mv.message = 'Dash burst!';
      }

      roomText.setText(`Region: ${room.name}`);
      stateText.setText(`${mv.message} Deaths:${mv.deaths}`);
      abilityText.setText(renderAbilityLine(mv));
    }
  };

  function loadCurrentRoom(roomId, options = {}) {
    const mv = slice();
    room = getRoom(roomId) || getRoom(content.startRoomId) || content.rooms[0];

    mv.currentRoomId = room.id;
    if (!mv.visitedRooms.includes(room.id)) {
      mv.visitedRooms.push(room.id);
    }

    clearDynamicTiles(this);
    drawRoomTiles(this, room, tile, colors, { solids, hazards, doors, checkpoints, abilityPickups, flagMarkers, goalZone }, mv);

    const spawn = resolveSpawn(mv, room, options.useSpawn ? options.targetSpawn : null, content);
    player.setPosition(spawn.x * tile, spawn.y * tile);
    player.body.setVelocity(0, 0);
    player.body.setAcceleration(0, 0);

    this.physics.world.setBounds(0, 0, room.width * tile, room.height * tile);
    mv.message = `Entered ${room.name}.`;
    api.saveNow();
  }

  function handleHazard() {
    if (invulnTimer > 0) return;

    const mv = slice();
    mv.deaths += 1;
    mv.message = 'Hazard hit. Returned to checkpoint.';
    invulnTimer = 0.6;

    const respawn = mv.checkpoint?.roomId ? mv.checkpoint : mv.spawn;
    if (respawn?.roomId && respawn.roomId !== room.id) {
      loadCurrentRoom.call(this, respawn.roomId, {
        useSpawn: true,
        targetSpawn: { x: respawn.x, y: respawn.y }
      });
      return;
    }

    if (respawn?.x != null && respawn?.y != null) {
      player.setPosition(respawn.x * tile, respawn.y * tile);
      player.body.setVelocity(0, 0);
      player.body.setAcceleration(0, 0);
      api.saveNow();
    }
  }

  function handleDoor(zone) {
    const mv = slice();
    const door = zone.getData('door');
    if (!door) return;

    if (door.requiresAbility && !mv.abilities[door.requiresAbility]) {
      mv.message = `Need ${door.requiresAbility} to pass.`;
      return;
    }

    if (door.requiresFlag && !mv.regionFlags[door.requiresFlag]) {
      mv.message = `Route is sealed until flag ${door.requiresFlag} is set.`;
      return;
    }

    if (door.setFlagOnEnter) {
      mv.regionFlags[door.setFlagOnEnter] = true;
    }

    loadCurrentRoom.call(this, door.targetRoomId, {
      useSpawn: true,
      targetSpawn: door.targetSpawn
    });
  }

  function handleCheckpoint(marker) {
    const mv = slice();
    const checkpoint = marker.getData('checkpoint');
    if (!checkpoint) return;

    mv.checkpoint = {
      id: checkpoint.id,
      roomId: room.id,
      x: checkpoint.x,
      y: checkpoint.y
    };
    mv.spawn = {
      roomId: room.id,
      x: checkpoint.x,
      y: checkpoint.y
    };
    mv.message = `Checkpoint saved: ${checkpoint.id}`;

    // Purpose: checkpoint state is persisted immediately to protect progress.
    api.saveNow();
  }

  function handleAbilityPickup(pickup) {
    const mv = slice();
    const ability = pickup.getData('ability');
    if (!ability || mv.collectedAbilities.includes(ability.id)) return;

    mv.abilities[ability.type] = true;
    mv.collectedAbilities.push(ability.id);
    mv.regionFlags[`ability:${ability.type}`] = true;
    mv.message = `Unlocked ability: ${ability.type}`;

    pickup.destroy();
    api.saveNow();
  }

  function handleFlag(marker) {
    const mv = slice();
    const flag = marker.getData('regionFlag');
    if (!flag || mv.regionFlags[flag.id]) return;

    mv.regionFlags[flag.id] = true;
    mv.message = `Region flag unlocked: ${flag.id}`;
    api.saveNow();
  }

  function handleGoal() {
    const mv = slice();
    if (mv.completed) return;

    mv.completed = true;
    mv.lastOutcome = {
      sceneId: 'metroidvania',
      endingId: room.goal?.endingId || 'metroidvania_complete',
      ts: Date.now(),
      roomId: room.id,
      deaths: mv.deaths,
      abilities: { ...mv.abilities },
      visitedRooms: mv.visitedRooms.length
    };
    mv.message = 'Core reached. Region stabilized.';

    api.setSaveStatus?.('Metroidvania completion recorded for progression hooks.');
    api.saveNow();
  }
}

function renderAbilityLine(mv) {
  return `Abilities: DJ=${mv.abilities.doubleJump ? 'Y' : 'N'} Dash=${mv.abilities.dash ? 'Y' : 'N'}`;
}

function drawRoomTiles(scene, room, tile, colors, groups, mv) {
  const solids = parseCoordSet(room.solids || []);
  const hazards = parseCoordSet(room.hazards || []);

  for (let y = 0; y < room.height; y += 1) {
    for (let x = 0; x < room.width; x += 1) {
      const id = `${x},${y}`;
      let color = 0x020617;
      if (solids.has(id)) color = colors.solid;
      if (hazards.has(id)) color = colors.hazard;

      const rect = scene.add.rectangle(x * tile + (tile / 2), y * tile + (tile / 2), tile - 1, tile - 1, color);
      rect.setData('metroidvaniaTile', true);
    }
  }

  placeSolidRects(groups.solids, solids, tile);
  placeSolidRects(groups.hazards, hazards, tile);

  for (const door of room.doors || []) {
    const locked = (door.requiresAbility && !mv.abilities[door.requiresAbility]) || (door.requiresFlag && !mv.regionFlags[door.requiresFlag]);
    const zone = scene.add.rectangle(
      door.x * tile + (tile * (door.width || 1) / 2),
      door.y * tile + (tile * (door.height || 1) / 2),
      tile * (door.width || 1),
      tile * (door.height || 1),
      locked ? colors.lockedDoor : colors.door,
      0.7
    );
    scene.physics.add.existing(zone, true);
    zone.setData('metroidvaniaTile', true);
    zone.setData('door', door);
    groups.doors.add(zone);
  }

  for (const marker of room.checkpoints || []) {
    const checkpoint = scene.add.rectangle(marker.x * tile + (tile / 2), marker.y * tile + (tile / 2), tile * 0.7, tile * 0.7, colors.checkpoint, 0.9);
    scene.physics.add.existing(checkpoint, true);
    checkpoint.setData('metroidvaniaTile', true);
    checkpoint.setData('checkpoint', marker);
    groups.checkpoints.add(checkpoint);
  }

  for (const ability of room.abilities || []) {
    if (mv.collectedAbilities.includes(ability.id)) continue;

    const pickup = scene.add.circle(ability.x * tile + (tile / 2), ability.y * tile + (tile / 2), tile * 0.24, colors.ability, 0.92);
    scene.physics.add.existing(pickup, true);
    pickup.setData('metroidvaniaTile', true);
    pickup.setData('ability', ability);
    groups.abilityPickups.add(pickup);
  }

  for (const flag of room.flags || []) {
    if (mv.regionFlags[flag.id]) continue;

    const marker = scene.add.rectangle(flag.x * tile + (tile / 2), flag.y * tile + (tile / 2), tile * 0.6, tile * 0.6, colors.flag, 0.9);
    scene.physics.add.existing(marker, true);
    marker.setData('metroidvaniaTile', true);
    marker.setData('regionFlag', flag);
    groups.flagMarkers.add(marker);
  }

  if (room.goal) {
    const goal = scene.add.rectangle(room.goal.x * tile + (tile / 2), room.goal.y * tile + (tile / 2), tile * 0.8, tile * 0.8, colors.goal, 0.95);
    scene.physics.add.existing(goal, true);
    goal.setData('metroidvaniaTile', true);
    groups.goalZone.add(goal);
  }
}

function placeSolidRects(group, coordSet, tile) {
  group.clear(true, true);

  for (const coord of coordSet) {
    const [x, y] = coord.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const body = group.create(x * tile + (tile / 2), y * tile + (tile / 2), null);
    body.setSize(tile, tile);
    body.setVisible(false);
    body.refreshBody();
  }
}

function parseCoordSet(coords) {
  return new Set((coords || []).map((coord) => String(coord)));
}

function clearDynamicTiles(scene) {
  scene.children.list
    .filter((obj) => obj.getData?.('metroidvaniaTile') === true)
    .forEach((obj) => obj.destroy());
}

function resolveSpawn(mv, room, targetSpawn, content) {
  if (targetSpawn && Number.isFinite(targetSpawn.x) && Number.isFinite(targetSpawn.y)) {
    mv.spawn = { roomId: room.id, x: targetSpawn.x, y: targetSpawn.y };
    return targetSpawn;
  }

  if (mv.spawn?.roomId === room.id && Number.isFinite(mv.spawn.x) && Number.isFinite(mv.spawn.y)) {
    return mv.spawn;
  }

  if (content.startSpawn && Number.isFinite(content.startSpawn.x) && Number.isFinite(content.startSpawn.y)) {
    mv.spawn = {
      roomId: room.id,
      x: content.startSpawn.x,
      y: content.startSpawn.y
    };
    return content.startSpawn;
  }

  return { x: 2, y: Math.max(2, room.height - 4) };
}

function ensureRoot() {
  let root = document.getElementById('metroidvaniaSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'metroidvaniaSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'metroidvania';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function fallbackContent() {
  return {
    startRoomId: 'atrium',
    startSpawn: { x: 2, y: 9 },
    rooms: [
      {
        id: 'atrium',
        name: 'Abandoned Atrium',
        width: 22,
        height: 12,
        solids: ['0,11', '1,11', '2,11', '3,11', '4,11', '5,11', '6,11', '7,11', '8,11', '9,11', '10,11', '11,11', '12,11', '13,11', '14,11', '15,11', '16,11', '17,11', '18,11', '19,11', '20,11', '21,11'],
        hazards: [],
        checkpoints: [{ id: 'cp_atrium', x: 2, y: 10 }],
        abilities: [],
        flags: [],
        doors: [],
        goal: null
      }
    ]
  };
}
