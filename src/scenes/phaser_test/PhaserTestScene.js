import Phaser from 'phaser';
import { createPhaserSceneAdapter } from '../../core/scene/adapters/PhaserSceneAdapter.js';

/**
 * Creates a minimal Phaser-backed scene to validate host integration behavior.
 * Purpose: prove mount/update/render/resize/unmount flows before larger Phaser scenes.
 */
export function createPhaserTestScene() {
  return createPhaserSceneAdapter({
    id: 'phaser_test',
    root: getOrCreateRoot(),
    createBridge: (mount) => createBridge(mount)
  });
}

function getOrCreateRoot() {
  let root = document.getElementById('phaserTestSceneRoot');
  if (root) {
    return root;
  }

  root = document.createElement('div');
  root.id = 'phaserTestSceneRoot';
  root.className = 'scene-root scene-root-canvas';
  root.dataset.sceneId = 'phaser_test';
  root.setAttribute('aria-hidden', 'true');
  document.getElementById('sceneHost')?.appendChild(root);
  return root;
}

function createBridge(mount) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: mount,
    width: Math.max(1, mount.clientWidth),
    height: Math.max(1, mount.clientHeight),
    transparent: true,
    scene: {
      create() {
        // Purpose: quick visual marker confirms shell overlays still layer above Phaser canvas.
        this.add.rectangle(0, 0, 2000, 2000, 0x0f172a, 0.85).setOrigin(0, 0);
        this.add.text(28, 28, 'Phaser Test Scene', {
          color: '#E2E8F0',
          fontSize: '28px',
          fontFamily: 'Inter, system-ui, sans-serif'
        });
        this.add.text(28, 72, 'Host + SceneManager + Phaser adapter path active.', {
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
      // Purpose: adapter calls this per-frame to validate update wiring.
    }
  };
}
