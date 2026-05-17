import type { SceneDefinition } from '../../core/scene/SceneManager';

/**
 * This is not a real Phaser scene yet.
 * It is a host-facing placeholder that proves where the first Phaser-backed
 * test scene will live and how it will register with the scene manager.
 */
export function createPhaserTestScene(root: HTMLElement): SceneDefinition {
  let mounted = false;

  return {
    id: 'phaser_test',
    root,
    enter() {
      root.dataset.sceneKind = 'phaser';
      root.dataset.sceneId = 'phaser_test';
      root.dataset.sceneStatus = 'active';

      if (!mounted) {
        root.innerHTML = `
          <div style="
            display:grid;
            place-items:center;
            width:100%;
            height:100%;
            min-height:420px;
            background:linear-gradient(180deg, var(--primary-muted, #1E293B), var(--surface-inverse, #020617));
            color:var(--on-inverse, #E2E8F0);
            font-family:Inter, system-ui, sans-serif;
          ">
            <div style="
              width:min(520px, 92vw);
              padding:24px;
              border:1px solid rgba(255,255,255,0.08);
              border-radius:18px;
              background:rgba(22,27,34,0.92);
              box-shadow:0 16px 40px rgba(0,0,0,0.28);
            ">
              <div style="font-size:1.2rem;font-weight:800;margin-bottom:10px;">Phaser Test Scene</div>
              <div style="color:var(--muted, #94A3B8);line-height:1.5;">
                This placeholder marks the mount point for the future Phaser adapter validation scene.
                Replace this with a real Phaser bridge once Phaser is added to the repo.
              </div>
            </div>
          </div>
        `;
        mounted = true;
      }
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
    },
    update() {
      // Placeholder. Real Phaser-backed scenes will delegate per-frame work to the bridge instance.
    },
    render() {
      // Placeholder.
    },
    onStateLoaded() {
      root.dataset.sceneId = 'phaser_test';
    }
  };
}
