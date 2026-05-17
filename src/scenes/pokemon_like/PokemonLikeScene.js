import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Creates a playable Pokémon-like RPG scene with overworld traversal,
 * encounter triggers, minimal battle flow, and party/roster persistence.
 */
export function createPokemonLikeScene(api) {
  const root = ensureRoot();
  let content = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.pokemon_like || typeof state.scenes.pokemon_like !== 'object') {
      state.scenes.pokemon_like = {};
    }

    const pl = state.scenes.pokemon_like;
    pl.mapId = typeof pl.mapId === 'string' ? pl.mapId : null;
    pl.player = pl.player && typeof pl.player === 'object' ? pl.player : { x: 3, y: 3 };
    pl.party = Array.isArray(pl.party) ? pl.party : [];
    pl.roster = Array.isArray(pl.roster) ? pl.roster : [];
    pl.inventory = pl.inventory && typeof pl.inventory === 'object' ? pl.inventory : { captureOrbs: 5, potions: 2 };
    pl.encounters = Number.isInteger(pl.encounters) ? pl.encounters : 0;
    pl.wins = Number.isInteger(pl.wins) ? pl.wins : 0;
    pl.captures = Number.isInteger(pl.captures) ? pl.captures : 0;
    pl.flags = pl.flags && typeof pl.flags === 'object' ? pl.flags : {};
    pl.message = typeof pl.message === 'string' ? pl.message : 'Explore tall grass to trigger encounters.';
    pl.lastOutcome = pl.lastOutcome && typeof pl.lastOutcome === 'object' ? pl.lastOutcome : null;
    return pl;
  }

  async function loadContent() {
    if (content) return;

    try {
      content = await api.assetService.loadJson('/data/pokemon-like-content.json');
    } catch (error) {
      console.warn(error);
      content = fallbackContent();
    }
  }

  function getMap(pl) {
    const map = content.maps.find((entry) => entry.id === pl.mapId);
    return map || content.maps.find((entry) => entry.id === content.startMapId) || content.maps[0];
  }

  async function createBridge(mount) {
    await loadContent();

    const pl = slice();
    if (!pl.mapId) {
      pl.mapId = content.startMapId;
      pl.player = { ...(content.startPlayer || { x: 3, y: 3 }) };
    }
    if (pl.party.length === 0 && Array.isArray(content.starterParty)) {
      pl.party = content.starterParty.map((id) => createCreatureInstance(id, content));
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
      scene: createRuntimeScene({ api, slice, getMap, content })
    });

    return {
      destroy(removeCanvas = true) {
        game.destroy(removeCanvas);
      },
      resize(width, height) {
        game.scale.resize(width, height);
      },
      pause() {
        game.scene.pause('PokemonLikeRuntime');
      },
      resume() {
        game.scene.resume('PokemonLikeRuntime');
      },
      step() {
        // Purpose: Phaser scene updates itself; step exists for adapter parity.
      }
    };
  }

  return createPhaserSceneAdapter({
    id: 'pokemon_like',
    root,
    createBridge
  });
}

function createRuntimeScene({ api, slice, getMap, content }) {
  const tile = 32;
  let player;
  let walls;
  let grass;
  let cursors;
  let keys;
  let map = null;
  let moveCooldown = 0;
  let inBattle = false;
  let encounter = null;
  let hud;
  let status;

  return {
    key: 'PokemonLikeRuntime',
    create() {
      cursors = this.input.keyboard.createCursorKeys();
      keys = this.input.keyboard.addKeys('W,A,S,D,F,C,R');

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

      player = this.add.rectangle(0, 0, tile * 0.7, tile * 0.7, 0x60a5fa);
      this.physics.add.existing(player);
      player.body.setCollideWorldBounds(true);

      walls = this.physics.add.staticGroup();
      grass = this.physics.add.staticGroup();
      this.physics.add.collider(player, walls);

      loadMap.call(this);
      this.cameras.main.startFollow(player, true, 0.2, 0.2);
      this.cameras.main.setZoom(1.2);
    },
    update(_time, dtMs) {
      const dt = dtMs / 1000;
      moveCooldown = Math.max(0, moveCooldown - dt);
      const pl = slice();

      if (inBattle) {
        updateBattle(pl);
      } else {
        updateOverworld(pl);
      }

      hud.setText(`Party: ${pl.party.length} Captures: ${pl.captures} Encounters: ${pl.encounters}`);
      status.setText(pl.message);
    }
  };

  function loadMap() {
    const pl = slice();
    map = getMap(pl);

    drawMap(this, map, tile);
    buildStaticTiles(map.walls || [], walls, tile);
    buildStaticTiles(map.grass || [], grass, tile);

    player.setPosition(pl.player.x * tile, pl.player.y * tile);
    this.physics.world.setBounds(0, 0, map.width * tile, map.height * tile);
    pl.message = 'Explore tall grass to trigger encounters.';
    api.saveNow();
  }

  function updateOverworld(pl) {
    const vx = axis(cursors.left.isDown || keys.A.isDown, cursors.right.isDown || keys.D.isDown);
    const vy = axis(cursors.up.isDown || keys.W.isDown, cursors.down.isDown || keys.S.isDown);

    player.body.setVelocity(vx * 120, vy * 120);
    if (vx !== 0 && vy !== 0) {
      player.body.velocity.normalize().scale(120);
    }

    pl.player.x = player.x / tile;
    pl.player.y = player.y / tile;

    if (moveCooldown <= 0 && isInGrass(map, player.x, player.y, tile)) {
      moveCooldown = 0.5;
      if (Math.random() < map.encounterChance) {
        beginEncounter(pl);
      }
    }
  }

  function beginEncounter(pl) {
    const pool = map.encounterPool || [];
    if (pool.length === 0) return;

    const selectedId = pool[Math.floor(Math.random() * pool.length)];
    encounter = createCreatureInstance(selectedId, content);
    inBattle = true;
    pl.encounters += 1;
    pl.message = `Encounter! Wild ${encounter.name}. [F]ight [C]apture [R]un`;
    api.saveNow();
  }

  function updateBattle(pl) {
    player.body.setVelocity(0, 0);

    if (Phaser.Input.Keyboard.JustDown(keys.R)) {
      inBattle = false;
      encounter = null;
      pl.message = 'You ran from the encounter.';
      api.saveNow();
      return;
    }

    if (!encounter) return;

    if (Phaser.Input.Keyboard.JustDown(keys.F)) {
      const damage = randomInt(3, 7);
      encounter.hp = Math.max(0, encounter.hp - damage);
      pl.message = `You hit ${encounter.name} for ${damage}.`;

      if (encounter.hp <= 0) {
        pl.wins += 1;
        inBattle = false;
        encounter = null;
        pl.message = 'Battle won!';
        checkCompletion(pl);
        api.saveNow();
        return;
      }

      enemyCounterAttack(pl);
      api.saveNow();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(keys.C)) {
      if ((pl.inventory.captureOrbs || 0) <= 0) {
        pl.message = 'No capture orbs left.';
        return;
      }

      pl.inventory.captureOrbs -= 1;
      const hpRatio = encounter.hp / encounter.maxHp;
      const chance = 0.2 + ((1 - hpRatio) * 0.55);

      if (Math.random() < chance) {
        captureCreature(pl, encounter);
        inBattle = false;
        encounter = null;
        checkCompletion(pl);
      } else {
        pl.message = `${encounter.name} escaped the orb.`;
        enemyCounterAttack(pl);
      }

      api.saveNow();
    }
  }

  function enemyCounterAttack(pl) {
    const damage = randomInt(1, 4);
    if (pl.party.length === 0) {
      pl.message = 'No party creature available.';
      return;
    }

    const lead = pl.party[0];
    lead.hp = Math.max(1, lead.hp - damage);
    pl.message = `${encounter.name} counters for ${damage}. ${lead.name} HP ${lead.hp}/${lead.maxHp}.`;
  }

  function captureCreature(pl, creature) {
    const captured = { ...creature, hp: creature.maxHp };

    if (pl.party.length < 3) {
      pl.party.push(captured);
      pl.message = `${creature.name} captured and added to party.`;
    } else {
      pl.roster.push(captured);
      pl.message = `${creature.name} captured and sent to roster.`;
    }

    pl.captures += 1;
  }

  function checkCompletion(pl) {
    if (pl.captures >= 2 && !pl.flags.completed) {
      pl.flags.completed = true;
      pl.lastOutcome = {
        sceneId: 'pokemon_like',
        endingId: 'pokemon_like_complete',
        ts: Date.now(),
        captures: pl.captures,
        wins: pl.wins,
        partySize: pl.party.length,
        rosterSize: pl.roster.length
      };
      pl.message = 'Route complete! Captured enough creatures.';
      api.setSaveStatus?.('Pokémon-like completion recorded for progression hooks.');
    }
  }
}

function drawMap(scene, map, tile) {
  scene.children.list
    .filter((obj) => obj.getData?.('pokemonTile') === true)
    .forEach((obj) => obj.destroy());

  const wallSet = new Set(map.walls || []);
  const grassSet = new Set(map.grass || []);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const id = `${x},${y}`;
      let color = 0x1f2937;
      if (wallSet.has(id)) color = 0x475569;
      if (grassSet.has(id)) color = 0x22c55e;

      const tileRect = scene.add.rectangle(x * tile + (tile / 2), y * tile + (tile / 2), tile - 1, tile - 1, color);
      tileRect.setData('pokemonTile', true);
    }
  }
}

function buildStaticTiles(coords, group, tile) {
  group.clear(true, true);
  for (const coord of coords) {
    const [x, y] = parseCoord(coord);
    if (x === null) continue;

    const marker = group.create(x * tile + (tile / 2), y * tile + (tile / 2), null);
    marker.setSize(tile, tile);
    marker.setVisible(false);
    marker.refreshBody();
  }
}

function parseCoord(coord) {
  const [x, y] = String(coord || '').split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return [null, null];
  }

  return [x, y];
}

function isInGrass(map, worldX, worldY, tile) {
  const tx = Math.floor(worldX / tile);
  const ty = Math.floor(worldY / tile);
  return (map.grass || []).includes(`${tx},${ty}`);
}

function axis(neg, pos) {
  if (neg && !pos) return -1;
  if (pos && !neg) return 1;
  return 0;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createCreatureInstance(creatureId, content) {
  const base = content.creatures.find((c) => c.id === creatureId) || { id: creatureId, name: creatureId, maxHp: 10, attack: 4 };
  return {
    id: base.id,
    name: base.name,
    maxHp: base.maxHp,
    hp: base.maxHp,
    attack: base.attack
  };
}

function ensureRoot() {
  let root = document.getElementById('pokemonLikeSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'pokemonLikeSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'pokemon_like';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function fallbackContent() {
  return {
    startMapId: 'starter_route',
    startPlayer: { x: 3, y: 3 },
    starterParty: ['sproutlet'],
    creatures: [{ id: 'sproutlet', name: 'Sproutlet', maxHp: 18, attack: 5 }],
    maps: [
      {
        id: 'starter_route',
        width: 14,
        height: 10,
        walls: [],
        grass: [],
        encounterChance: 0.2,
        encounterPool: ['sproutlet']
      }
    ]
  };
}
