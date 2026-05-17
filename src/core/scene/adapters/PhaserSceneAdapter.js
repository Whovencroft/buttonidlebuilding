/**
 * Creates a scene-manager-compatible wrapper around a Phaser bridge instance.
 * Purpose: keep Phaser lifecycle details isolated from host scene orchestration.
 */
export function createPhaserSceneAdapter({ id, root, createBridge }) {
  const mount = ensureMount(root);
  let bridge = null;

  return {
    id,
    root,
    async enter() {
      root.dataset.sceneKind = 'phaser';
      root.dataset.sceneStatus = 'active';

      if (!bridge) {
        bridge = await Promise.resolve(createBridge(mount));
      }

      resizeBridge(bridge, mount);
      bridge.resume?.();
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
      if (bridge) {
        bridge.pause?.();
        bridge.destroy?.(true);
        bridge = null;
      }

      // Purpose: unmount old Phaser canvas before the next scene activation.
      mount.replaceChildren();
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

function ensureMount(root) {
  const existing = root.querySelector('[data-phaser-mount="true"]');
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

function resizeBridge(bridge, mount) {
  const width = Math.max(1, Math.floor(mount.clientWidth));
  const height = Math.max(1, Math.floor(mount.clientHeight));
  bridge.resize?.(width, height);
}
