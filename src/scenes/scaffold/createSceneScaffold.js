import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Builds lightweight scene scaffolds for future content scenes.
 * Purpose: keep scaffold creation consistent across DOM/Canvas/Phaser kinds.
 */
export function createSceneScaffold({ id, title, kind }) {
  const root = ensureRoot(id, kind);

  if (kind === 'phaser') {
    return createPhaserSceneAdapter({
      id,
      root,
      createBridge: (mount) => createPhaserBridge(mount, title)
    });
  }

  return {
    id,
    root,
    enter() {
      // Purpose: deterministic scaffold layout for non-Phaser scenes.
      root.dataset.sceneStatus = 'active';
      root.dataset.sceneKind = kind;
      root.innerHTML = renderScaffoldHtml(title, kind);
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
    },
    update() {
      // Purpose: placeholder update loop hook for later implementation.
    },
    render() {
      // Purpose: placeholder render hook for later implementation.
    },
    onStateLoaded() {
      root.dataset.sceneId = id;
    }
  };
}

function ensureRoot(id, kind) {
  const rootId = toRootId(id);
  let root = document.getElementById(rootId);

  if (root) {
    return root;
  }

  root = document.createElement('div');
  root.id = rootId;
  root.className = kind === 'dom' ? 'scene-root scene-root-dom' : 'scene-root scene-root-canvas';
  root.dataset.sceneId = id;
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function toRootId(sceneId) {
  return `${sceneId.replace(/_([a-z])/g, (_, c) => c.toUpperCase())}SceneRoot`;
}

function renderScaffoldHtml(title, kind) {
  return `
    <div style="
      display:grid;
      place-items:center;
      width:100%;
      height:100%;
      min-height:420px;
      border-radius:var(--radius-lg, 12px);
      background:linear-gradient(180deg, var(--primary-muted, #1E293B), var(--surface-inverse, #020617));
      color:var(--on-inverse, #E2E8F0);
      text-align:center;
      padding:var(--space-lg, 24px);
    ">
      <div>
        <div style="font-size:1.35rem;font-weight:800;">${title} (Scaffold)</div>
        <div style="margin-top:var(--space-sm, 8px);color:var(--muted, #94A3B8);">Kind: ${kind}. Scene scaffold is wired and ready for milestone-specific systems.</div>
      </div>
    </div>
  `;
}

function createPhaserBridge(mount, title) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: mount,
    width: Math.max(1, mount.clientWidth),
    height: Math.max(1, mount.clientHeight),
    transparent: true,
    scene: {
      create() {
        // Purpose: visible scaffold marker for future Phaser scene development.
        this.add.rectangle(0, 0, 2200, 2200, 0x0F172A, 0.9).setOrigin(0, 0);
        this.add.text(28, 28, `${title} (Scaffold)`, {
          color: '#E2E8F0',
          fontSize: '28px',
          fontFamily: 'Inter, system-ui, sans-serif'
        });
        this.add.text(28, 72, 'Phaser scene scaffold is mounted through the host adapter.', {
          color: '#94A3B8',
          fontSize: '16px',
          fontFamily: 'Inter, system-ui, sans-serif'
        });
      }
    }
  });

  return {
    destroy(removeCanvas = true) {
      game.destroy(removeCanvas);
    },
    resize(width, height) {
      game.scale.resize(width, height);
    },
    pause() {
      game.scene.pause();
    },
    resume() {
      game.scene.resume();
    },
    step() {
      // Purpose: adapter compatibility for scene-manager update loop.
    }
  };
}
