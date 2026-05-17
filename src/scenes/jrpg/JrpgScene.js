import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Creates a playable JRPG scene with node traversal,
 * turn-based combat, and party/inventory progression.
 */
export function createJrpgScene(api) {
  const root = ensureRoot();
  let content = null;

  function slice() {
    const state = api.getState();
    if (!state.scenes.jrpg || typeof state.scenes.jrpg !== 'object') {
      state.scenes.jrpg = {};
    }

    const jrpg = state.scenes.jrpg;
    jrpg.routeId = typeof jrpg.routeId === 'string' ? jrpg.routeId : null;
    jrpg.nodeId = typeof jrpg.nodeId === 'string' ? jrpg.nodeId : null;
    jrpg.party = Array.isArray(jrpg.party) ? jrpg.party : [];
    jrpg.inventory = jrpg.inventory && typeof jrpg.inventory === 'object'
      ? {
        potions: Number.isInteger(jrpg.inventory.potions) ? jrpg.inventory.potions : 2,
        ethers: Number.isInteger(jrpg.inventory.ethers) ? jrpg.inventory.ethers : 1
      }
      : { potions: 2, ethers: 1 };
    jrpg.equipment = jrpg.equipment && typeof jrpg.equipment === 'object' ? jrpg.equipment : {};
    jrpg.clearedNodes = Array.isArray(jrpg.clearedNodes) ? jrpg.clearedNodes : [];
    jrpg.wins = Number.isInteger(jrpg.wins) ? jrpg.wins : 0;
    jrpg.losses = Number.isInteger(jrpg.losses) ? jrpg.losses : 0;
    jrpg.completed = !!jrpg.completed;
    jrpg.message = typeof jrpg.message === 'string' ? jrpg.message : 'Use Left/Right to choose a node. Enter to engage.';
    jrpg.lastOutcome = jrpg.lastOutcome && typeof jrpg.lastOutcome === 'object' ? jrpg.lastOutcome : null;
    return jrpg;
  }

  async function loadContent() {
    if (content) return;

    try {
      content = await api.assetService.loadJson('/data/jrpg-content.json');
    } catch (error) {
      console.warn(error);
      content = fallbackContent();
    }
  }

  async function createBridge(mount) {
    await loadContent();

    const jrpg = slice();
    if (!jrpg.routeId) {
      jrpg.routeId = content.startRouteId;
      jrpg.nodeId = content.startNodeId;
      jrpg.party = (content.starterParty || []).map((member) => createPartyMember(member));
      jrpg.inventory = { ...(content.starterInventory || { potions: 2, ethers: 1 }) };
      jrpg.equipment = { ...(content.starterEquipment || {}) };
      jrpg.clearedNodes = [];
      jrpg.completed = false;
      jrpg.lastOutcome = null;
      jrpg.message = 'Use Left/Right to choose a node. Enter to engage.';
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
      scene: createRuntimeScene({ api, slice, content })
    });

    return {
      destroy(removeCanvas = true) {
        game.destroy(removeCanvas);
      },
      resize(width, height) {
        game.scale.resize(width, height);
      },
      pause() {
        game.scene.pause('JrpgRuntime');
      },
      resume() {
        game.scene.resume('JrpgRuntime');
      },
      step() {
        // Purpose: Phaser owns runtime stepping.
      }
    };
  }

  return createPhaserSceneAdapter({
    id: 'jrpg',
    root,
    createBridge
  });
}

function createRuntimeScene({ api, slice, content }) {
  let route = null;
  let selectedIndex = 0;
  let inBattle = false;
  let battle = null;
  let hud;
  let status;
  let nodes = [];
  let enemies = [];
  let cursors;
  let keys;

  return {
    key: 'JrpgRuntime',
    create() {
      cursors = this.input.keyboard.createCursorKeys();
      keys = this.input.keyboard.addKeys('A,S,D,F,I,ENTER');

      // Purpose: battle/travel status stays visible through one compact HUD.
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

      loadRoute.call(this);
    },
    update() {
      const jrpg = slice();

      if (!inBattle) {
        updateTraversal(jrpg);
      } else {
        updateBattle(jrpg);
      }

      const partyHp = jrpg.party.map((member) => `${member.name}:${member.hp}/${member.maxHp}`).join(' | ');
      hud.setText(`Node ${selectedIndex + 1}/${route.nodes.length}  Potions:${jrpg.inventory.potions}  Wins:${jrpg.wins}  ${partyHp}`);
      status.setText(jrpg.message);
    }
  };

  function loadRoute() {
    const jrpg = slice();
    route = content.routes.find((entry) => entry.id === jrpg.routeId)
      || content.routes.find((entry) => entry.id === content.startRouteId)
      || content.routes[0];

    clearRuntimeObjects();
    drawRoute.call(this, route, jrpg);

    const nodeIndex = Math.max(0, route.nodes.findIndex((node) => node.id === jrpg.nodeId));
    selectedIndex = nodeIndex >= 0 ? nodeIndex : 0;
    jrpg.nodeId = route.nodes[selectedIndex]?.id || route.nodes[0]?.id || null;
    jrpg.message = 'Use Left/Right to choose a node. Enter to engage.';
    api.saveNow();
  }

  function updateTraversal(jrpg) {
    if (Phaser.Input.Keyboard.JustDown(cursors.left)) {
      selectedIndex = Math.max(0, selectedIndex - 1);
      jrpg.nodeId = route.nodes[selectedIndex].id;
      jrpg.message = `Selected ${route.nodes[selectedIndex].name}.`;
    }

    if (Phaser.Input.Keyboard.JustDown(cursors.right)) {
      selectedIndex = Math.min(route.nodes.length - 1, selectedIndex + 1);
      jrpg.nodeId = route.nodes[selectedIndex].id;
      jrpg.message = `Selected ${route.nodes[selectedIndex].name}.`;
    }

    if (Phaser.Input.Keyboard.JustDown(keys.ENTER)) {
      beginNodeEncounter(jrpg);
    }

    renderNodeSelection(jrpg);
  }

  function beginNodeEncounter(jrpg) {
    const node = route.nodes[selectedIndex];
    if (!node) return;

    if (jrpg.clearedNodes.includes(node.id)) {
      jrpg.message = 'Node already cleared.';
      return;
    }

    const enemyTemplate = content.enemies.find((enemy) => enemy.id === node.enemyId);
    if (!enemyTemplate) {
      jrpg.message = 'No enemy configured for this node.';
      return;
    }

    battle = {
      node,
      turn: 1,
      defending: false,
      enemy: {
        id: enemyTemplate.id,
        name: enemyTemplate.name,
        hp: enemyTemplate.maxHp,
        maxHp: enemyTemplate.maxHp,
        attack: enemyTemplate.attack,
        defense: enemyTemplate.defense,
        skillPower: enemyTemplate.skillPower
      }
    };

    inBattle = true;
    jrpg.message = `Battle started vs ${battle.enemy.name}. [A]ttack [S]kill [I]tem [D]efend`;
    api.saveNow();
  }

  function updateBattle(jrpg) {
    if (!battle) {
      inBattle = false;
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(keys.A)) {
      playerAttack(jrpg, false);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(keys.S)) {
      playerAttack(jrpg, true);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(keys.I)) {
      usePotion(jrpg);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(keys.D)) {
      battle.defending = true;
      jrpg.message = 'Party braces for impact.';
      enemyTurn(jrpg);
    }
  }

  function playerAttack(jrpg, useSkill) {
    const alive = jrpg.party.filter((member) => member.hp > 0);
    if (alive.length === 0) {
      handleDefeat(jrpg);
      return;
    }

    let totalDamage = 0;
    for (const member of alive) {
      const weapon = content.equipment.weapons[jrpg.equipment[member.id] || member.weaponId] || { attackBonus: 0 };
      const base = member.attack + weapon.attackBonus;
      const skillBonus = useSkill ? member.skillPower : 0;
      const damage = Math.max(1, Math.round(base + skillBonus - battle.enemy.defense));
      totalDamage += damage;
    }

    battle.enemy.hp = Math.max(0, battle.enemy.hp - totalDamage);
    jrpg.message = `${useSkill ? 'Skill chain' : 'Attack'} dealt ${totalDamage} to ${battle.enemy.name}.`;

    if (battle.enemy.hp <= 0) {
      handleVictory(jrpg);
      return;
    }

    enemyTurn(jrpg);
  }

  function usePotion(jrpg) {
    if ((jrpg.inventory.potions || 0) <= 0) {
      jrpg.message = 'No potions left.';
      return;
    }

    const target = jrpg.party.find((member) => member.hp > 0 && member.hp < member.maxHp);
    if (!target) {
      jrpg.message = 'Potion not needed right now.';
      return;
    }

    jrpg.inventory.potions -= 1;
    target.hp = Math.min(target.maxHp, target.hp + 20);
    jrpg.message = `${target.name} recovered HP.`;

    enemyTurn(jrpg);
  }

  function enemyTurn(jrpg) {
    const alive = jrpg.party.filter((member) => member.hp > 0);
    if (alive.length === 0) {
      handleDefeat(jrpg);
      return;
    }

    const target = alive[Math.floor(Math.random() * alive.length)];
    const armor = content.equipment.armors[jrpg.equipment[`${target.id}:armor`] || target.armorId] || { defenseBonus: 0 };
    const guardBonus = battle.defending ? 4 : 0;
    const damage = Math.max(1, Math.round(battle.enemy.attack - target.defense - armor.defenseBonus - guardBonus));

    target.hp = Math.max(0, target.hp - damage);
    battle.defending = false;
    battle.turn += 1;

    jrpg.message = `${battle.enemy.name} hit ${target.name} for ${damage}.`;

    if (jrpg.party.every((member) => member.hp <= 0)) {
      handleDefeat(jrpg);
      return;
    }

    api.saveNow();
  }

  function handleVictory(jrpg) {
    jrpg.wins += 1;
    jrpg.clearedNodes.push(battle.node.id);
    restorePartyAfterBattle(jrpg.party);

    if (battle.node.reward?.equipment && content.equipment.weapons[battle.node.reward.equipment]) {
      jrpg.equipment.hero = battle.node.reward.equipment;
    }

    if (battle.node.reward?.potions) {
      jrpg.inventory.potions += battle.node.reward.potions;
    }

    inBattle = false;
    battle = null;

    if (jrpg.clearedNodes.length >= route.nodes.length) {
      jrpg.completed = true;
      jrpg.lastOutcome = {
        sceneId: 'jrpg',
        endingId: 'jrpg_complete',
        ts: Date.now(),
        routeId: route.id,
        wins: jrpg.wins,
        losses: jrpg.losses,
        party: jrpg.party.map((member) => ({ id: member.id, hp: member.hp, maxHp: member.maxHp }))
      };
      jrpg.message = 'Route complete. JRPG chapter cleared.';
      api.setSaveStatus?.('JRPG completion recorded for progression hooks.');
      api.saveNow();
      return;
    }

    jrpg.message = 'Node cleared. Choose your next destination.';
    api.saveNow();
  }

  function handleDefeat(jrpg) {
    jrpg.losses += 1;
    restorePartyAfterBattle(jrpg.party);

    inBattle = false;
    battle = null;

    jrpg.message = 'Party retreated and recovered at camp.';
    api.saveNow();
  }

  function clearRuntimeObjects() {
    nodes.forEach((obj) => obj.destroy());
    enemies.forEach((obj) => obj.destroy());
    nodes = [];
    enemies = [];
  }

  function drawRoute(routeData, jrpg) {
    const spacing = 110;
    const startX = 100;
    const y = 260;

    routeData.nodes.forEach((node, index) => {
      const x = startX + (index * spacing);
      const cleared = jrpg.clearedNodes.includes(node.id);
      const color = cleared ? 0x22c55e : 0x334155;

      const marker = this.add.circle(x, y, 24, color, 0.9);
      const label = this.add.text(x - 40, y + 30, node.name, {
        fontSize: '12px',
        color: '#E2E8F0',
        fontFamily: 'monospace'
      });

      marker.setData('nodeId', node.id);
      nodes.push(marker, label);

      if (node.enemyId) {
        const enemyTemplate = content.enemies.find((enemy) => enemy.id === node.enemyId);
        const enemySprite = this.add.rectangle(x, y - 52, 26, 26, 0xef4444, 0.85);
        const enemyText = this.add.text(x - 36, y - 85, enemyTemplate?.name || 'Enemy', {
          fontSize: '11px',
          color: '#FCA5A5',
          fontFamily: 'monospace'
        });
        enemies.push(enemySprite, enemyText);
      }
    });
  }

  function renderNodeSelection(jrpg) {
    const selectedNodeId = route.nodes[selectedIndex]?.id;

    for (const obj of nodes) {
      if (typeof obj.getData === 'function' && obj.getData('nodeId')) {
        const isSelected = obj.getData('nodeId') === selectedNodeId;
        obj.setStrokeStyle(isSelected ? 4 : 0, 0x60a5fa);
      }
    }

    if (jrpg.completed) {
      jrpg.message = 'Route complete. JRPG chapter cleared.';
    }
  }
}

function createPartyMember(template) {
  return {
    id: template.id,
    name: template.name,
    hp: template.maxHp,
    maxHp: template.maxHp,
    attack: template.attack,
    defense: template.defense,
    skillPower: template.skillPower,
    weaponId: template.weaponId,
    armorId: template.armorId
  };
}

function restorePartyAfterBattle(party) {
  for (const member of party) {
    member.hp = member.maxHp;
  }
}

function ensureRoot() {
  let root = document.getElementById('jrpgSceneRoot');
  if (root) return root;

  root = document.createElement('div');
  root.id = 'jrpgSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'jrpg';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function fallbackContent() {
  return {
    startRouteId: 'frontier_road',
    startNodeId: 'gate',
    starterInventory: { potions: 2, ethers: 1 },
    starterEquipment: { hero: 'bronze_sword', 'hero:armor': 'leather_tunic' },
    starterParty: [
      {
        id: 'hero',
        name: 'Hero',
        maxHp: 64,
        attack: 11,
        defense: 6,
        skillPower: 5,
        weaponId: 'bronze_sword',
        armorId: 'leather_tunic'
      }
    ],
    equipment: {
      weapons: { bronze_sword: { attackBonus: 2 } },
      armors: { leather_tunic: { defenseBonus: 1 } }
    },
    enemies: [
      { id: 'slime', name: 'Slime', maxHp: 22, attack: 6, defense: 2, skillPower: 0 }
    ],
    routes: [
      {
        id: 'frontier_road',
        name: 'Frontier Road',
        nodes: [
          { id: 'gate', name: 'Gate', enemyId: 'slime', reward: { potions: 1 } }
        ]
      }
    ]
  };
}
