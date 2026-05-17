import type { SceneDefinition } from '../SceneManager';

export interface PhaserBridgeInstance {
  destroy(removeCanvas?: boolean): void;
  resize?(width: number, height: number): void;
  pause?(): void;
  resume?(): void;
  step?(dt: number): void;
}

export interface PhaserSceneAdapterOptions {
  id: string;
  root: HTMLElement;
  createBridge: (host: HTMLElement) => Promise<PhaserBridgeInstance> | PhaserBridgeInstance;
}

/**
 * This adapter does not import Phaser directly.
 * It creates a stable seam for a later Phaser-backed scene once the dependency
 * is added to package.json and the first Phaser test scene is introduced.
 */
export function createPhaserSceneAdapter({
  id,
  root,
  createBridge
}: PhaserSceneAdapterOptions): SceneDefinition {
  const mount = ensureMount(root);
  let bridge: PhaserBridgeInstance | null = null;
  let bridgePromise: Promise<PhaserBridgeInstance> | null = null;

  return {
    id,
    root,
    async enter() {
      root.dataset.sceneKind = 'phaser';
      root.dataset.sceneStatus = 'active';

      if (bridge) {
        bridge.resume?.();
        resizeBridge(bridge, mount);
        return;
      }

      if (!bridgePromise) {
        bridgePromise = Promise.resolve(createBridge(mount)).then((instance) => {
          bridge = instance;
          resizeBridge(instance, mount);
          return instance;
        });
      }

      await bridgePromise;
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
      bridge?.pause?.();
    },
    update(dt) {
      bridge?.step?.(dt);
    },
    render() {
      if (bridge) {
        resizeBridge(bridge, mount);
      }
    },
    onStateLoaded() {
      root.dataset.sceneId = id;
    }
  };
}

function ensureMount(root: HTMLElement): HTMLElement {
  const existing = root.querySelector<HTMLElement>('[data-phaser-mount="true"]');
  if (existing) {
    return existing;
  }

  const mount = document.createElement('div');
  mount.dataset.phaserMount = 'true';
  mount.style.width = '100%';
  mount.style.height = '100%';
  mount.style.minHeight = '100%';
  root.appendChild(mount);
  return mount;
}

function resizeBridge(bridge: PhaserBridgeInstance, mount: HTMLElement): void {
  const width = Math.max(1, Math.floor(mount.clientWidth));
  const height = Math.max(1, Math.floor(mount.clientHeight));
  bridge.resize?.(width, height);
}
