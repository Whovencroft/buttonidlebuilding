import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Creates a playable top-down racing scene with steering,
 * track collision, lap/timer logic, and completion tracking.
 */
export function createRacingScene(api) {
  const root = ensureRoot();
  let content = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.racing || typeof state.scenes.racing !== 'object') {
      state.scenes.racing = {};
    }

    const race = state.scenes.racing;
    race.currentTrackId = typeof race.currentTrackId === 'string' ? race.currentTrackId : null;
    race.bestTimes = race.bestTimes && typeof race.bestTimes === 'object' ? race.bestTimes : {};
    race.completedTracks = Array.isArray(race.completedTracks) ? race.completedTracks : [];
    race.currentLap = Number.isInteger(race.currentLap) ? race.currentLap : 1;
    race.checkpointIndex = Number.isInteger(race.checkpointIndex) ? race.checkpointIndex : 0;
    race.message = typeof race.message === 'string' ? race.message : 'Complete laps by driving through checkpoints in order.';
    race.lastOutcome = race.lastOutcome && typeof race.lastOutcome === 'object' ? race.lastOutcome : null;
    return race;
  }

  async function loadContent() {
    if (content) return;

    try {
      content = await api.assetService.loadJson('/data/racing-tracks.json');
    } catch (error) {
      console.warn(error);
      content = fallbackContent();
    }
  }

  function getTrack(race) {
    const exact = content.tracks.find((track) => track.id === race.currentTrackId);
    return exact || content.tracks.find((track) => track.id === content.startTrackId) || content.tracks[0];
  }

  async function createBridge(mount) {
    await loadContent();

    const race = slice();
    if (!race.currentTrackId) {
      race.currentTrackId = content.startTrackId;
      race.currentLap = 1;
      race.checkpointIndex = 0;
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
          gravity: { y: 0 },
          debug: false
        }
      },
      scene: createRuntimeScene({ api, slice, getTrack, content })
    });

    return {
      destroy(removeCanvas = true) {
        game.destroy(removeCanvas);
      },
      resize(width, height) {
        game.scale.resize(width, height);
      },
      pause() {
        game.scene.pause('RacingRuntime');
      },
      resume() {
        game.scene.resume('RacingRuntime');
      },
      step() {
        // Purpose: Phaser loop is self-driven; step kept for adapter compatibility.
      }
    };
  }

  return createPhaserSceneAdapter({
    id: 'racing',
    root,
    createBridge
  });
}

function createRuntimeScene({ api, slice, getTrack, content }) {
  let track = null;
  let car;
  let walls;
  let cursors;
  let keys;
  let hud;
  let status;
  let raceStartMs = 0;
  let speed = 0;

  return {
    key: 'RacingRuntime',
    create() {
      cursors = this.input.keyboard.createCursorKeys();
      keys = this.input.keyboard.addKeys('W,A,S,D,R');

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

      car = this.add.rectangle(0, 0, 28, 16, 0x38bdf8);
      this.physics.add.existing(car);
      car.body.setCollideWorldBounds(true);
      car.body.setDrag(0, 0);
      car.body.setMaxVelocity(380, 380);

      walls = this.physics.add.staticGroup();
      this.physics.add.collider(car, walls, () => {
        // Purpose: wall collision creates an immediate penalty for off-track driving.
        speed *= 0.45;
        const race = slice();
        race.message = 'Collision! Slow down and recover your line.';
      });

      loadTrack.call(this);
      this.cameras.main.startFollow(car, true, 0.08, 0.08);
    },
    update(_time, deltaMs) {
      if (!track) return;
      const dt = Math.min(0.05, deltaMs / 1000);
      const race = slice();

      const accelerate = cursors.up.isDown || keys.W.isDown;
      const brake = cursors.down.isDown || keys.S.isDown;
      const left = cursors.left.isDown || keys.A.isDown;
      const right = cursors.right.isDown || keys.D.isDown;
      const restartPressed = Phaser.Input.Keyboard.JustDown(keys.R);

      if (restartPressed) {
        resetCarPosition();
        race.currentLap = 1;
        race.checkpointIndex = 0;
        raceStartMs = Date.now();
        race.message = 'Race restarted.';
        api.saveNow();
      }

      const acceleration = 240;
      const brakePower = 320;
      const maxSpeed = 260;
      const friction = 90;

      if (accelerate) speed += acceleration * dt;
      if (brake) speed -= brakePower * dt;
      if (!accelerate && !brake) {
        speed = approach(speed, 0, friction * dt);
      }

      speed = Phaser.Math.Clamp(speed, -80, maxSpeed);

      if (Math.abs(speed) > 8) {
        const steer = (left ? -1 : 0) + (right ? 1 : 0);
        car.rotation += steer * dt * 2.8 * (speed >= 0 ? 1 : -1);
      }

      const vx = Math.cos(car.rotation) * speed;
      const vy = Math.sin(car.rotation) * speed;
      car.body.setVelocity(vx, vy);

      updateCheckpointState(race, track, car.x, car.y);

      const elapsedMs = Math.max(1, Date.now() - raceStartMs);
      hud.setText(`Track: ${track.name} Lap ${race.currentLap}/${track.totalLaps} Time ${(elapsedMs / 1000).toFixed(2)}s`);
      status.setText(race.message);

      if (race.currentLap > track.totalLaps) {
        finalizeRace(race, track, elapsedMs);
        loadNextTrackOrReset(race);
        api.saveNow();
      }
    }
  };

  function loadTrack() {
    const race = slice();
    track = getTrack(race);

    drawTrack(this, track);
    buildWalls(track, walls);

    this.physics.world.setBounds(0, 0, track.width, track.height);

    race.currentTrackId = track.id;
    race.currentLap = Math.max(1, race.currentLap || 1);
    race.checkpointIndex = Phaser.Math.Clamp(race.checkpointIndex || 0, 0, track.checkpoints.length - 1);
    race.message = `Drive through checkpoints in order. Next: ${track.checkpoints[race.checkpointIndex]?.id}`;

    resetCarPosition();
    raceStartMs = Date.now();
    api.saveNow();
  }

  function resetCarPosition() {
    car.setPosition(track.spawn.x, track.spawn.y);
    car.rotation = track.spawn.angle;
    car.body.setVelocity(0, 0);
    speed = 0;
  }

  function finalizeRace(race, activeTrack, elapsedMs) {
    const existingBest = race.bestTimes[activeTrack.id];
    if (!existingBest || elapsedMs < existingBest) {
      race.bestTimes[activeTrack.id] = elapsedMs;
    }

    if (!race.completedTracks.includes(activeTrack.id)) {
      race.completedTracks.push(activeTrack.id);
    }

    race.lastOutcome = {
      sceneId: 'racing',
      endingId: 'racing_complete',
      ts: Date.now(),
      trackId: activeTrack.id,
      elapsedMs,
      bestTimeMs: race.bestTimes[activeTrack.id],
      completedTracks: race.completedTracks.slice()
    };

    race.message = `Race complete in ${(elapsedMs / 1000).toFixed(2)}s.`;
    api.setSaveStatus?.('Racing completion recorded for progression hooks.');
  }

  function loadNextTrackOrReset(race) {
    if (track.nextTrackId) {
      const next = content.tracks.find((entry) => entry.id === track.nextTrackId);
      if (next) {
        race.currentTrackId = next.id;
        race.currentLap = 1;
        race.checkpointIndex = 0;
        track = next;
        drawTrack(this, track);
        buildWalls(track, walls);
        resetCarPosition();
        raceStartMs = Date.now();
        race.message = `Loaded ${track.name}.`;
        return;
      }
    }

    race.currentLap = 1;
    race.checkpointIndex = 0;
    resetCarPosition();
    raceStartMs = Date.now();
  }
}

function drawTrack(scene, track) {
  scene.children.list
    .filter((obj) => obj.getData?.('racingTile') === true)
    .forEach((obj) => obj.destroy());

  for (const segment of track.road) {
    const rect = scene.add.rectangle(segment.x, segment.y, segment.w, segment.h, 0x334155);
    rect.setData('racingTile', true);
  }

  for (const checkpoint of track.checkpoints) {
    const marker = scene.add.circle(checkpoint.x, checkpoint.y, checkpoint.radius, 0xf59e0b, 0.35);
    marker.setStrokeStyle(2, 0xfbbf24);
    marker.setData('racingTile', true);
  }
}

function buildWalls(track, walls) {
  walls.clear(true, true);
  for (const wall of track.walls) {
    const sprite = walls.create(wall.x, wall.y, null);
    sprite.setSize(wall.w, wall.h);
    sprite.setVisible(false);
    sprite.refreshBody();
  }
}

function updateCheckpointState(race, track, x, y) {
  const next = track.checkpoints[race.checkpointIndex];
  if (!next) return;

  const dist = Phaser.Math.Distance.Between(x, y, next.x, next.y);
  if (dist > next.radius) return;

  race.checkpointIndex += 1;

  if (race.checkpointIndex >= track.checkpoints.length) {
    race.checkpointIndex = 0;
    race.currentLap += 1;
    race.message = `Lap ${race.currentLap - 1} complete.`;
  } else {
    race.message = `Checkpoint ${next.id} cleared. Next: ${track.checkpoints[race.checkpointIndex].id}`;
  }
}

function approach(current, target, step) {
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return target;
}

function ensureRoot() {
  let root = document.getElementById('racingSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'racingSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'racing';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function fallbackContent() {
  return {
    startTrackId: 'oval_test',
    tracks: [
      {
        id: 'oval_test',
        name: 'Oval Test',
        width: 1200,
        height: 800,
        spawn: { x: 220, y: 400, angle: 0 },
        road: [],
        walls: [],
        checkpoints: [{ id: 'start', x: 220, y: 400, radius: 40 }],
        totalLaps: 2,
        nextTrackId: null
      }
    ]
  };
}
