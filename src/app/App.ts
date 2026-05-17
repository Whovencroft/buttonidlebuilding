import { SceneManager, type SceneDefinition } from '../core/scene/SceneManager';

type AppState = {
  app: {
    activeScene: string;
  };
  scenes: Record<string, unknown>;
};

const DEFAULT_STATE: AppState = {
  app: {
    activeScene: 'button_idle'
  },
  scenes: {
    button_idle: {},
    marble: {
      unlocked: false,
      currentLevelId: 'training_run'
    }
  }
};

export class App {
  private readonly state: AppState;
  private sceneManager: SceneManager | null = null;
  private frameHandle: number | null = null;
  private lastFrameTime = performance.now();

  public constructor(initialState: AppState = DEFAULT_STATE) {
    this.state = structuredClone(initialState);
  }

  public init(): void {
    const host = document.getElementById('sceneHost');
    if (!(host instanceof HTMLElement)) {
      throw new Error('Expected #sceneHost to exist before App.init().');
    }

    this.sceneManager = new SceneManager({
      host,
      onSceneChanged: ({ currentSceneId }) => {
        this.state.app.activeScene = currentSceneId;
        document.documentElement.dataset.activeScene = currentSceneId;
      }
    });

    this.registerCurrentDomRoots();
    this.sceneManager.notifyStateLoaded({ state: this.state });
    this.sceneManager.setActiveScene(this.state.app.activeScene, {
      state: this.state,
      force: true
    });
    this.sceneManager.render({ state: this.state });

    this.lastFrameTime = performance.now();
    this.frameHandle = window.requestAnimationFrame(this.onFrame);
  }

  public destroy(): void {
    if (this.frameHandle !== null) {
      window.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.sceneManager) return;

    let dt = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    if (!Number.isFinite(dt) || dt <= 0) {
      dt = 1 / 60;
    }

    dt = Math.min(dt, 1);
    this.sceneManager.update(dt, { state: this.state });
    this.frameHandle = window.requestAnimationFrame(this.onFrame);
  };

  private registerCurrentDomRoots(): void {
    if (!this.sceneManager) return;

    const currentRoots: Array<{ id: string; rootId: string }> = [
      { id: 'button_idle', rootId: 'buttonIdleSceneRoot' },
      { id: 'marble', rootId: 'marbleSceneRoot' }
    ];

    for (const entry of currentRoots) {
      const sceneRoot = document.getElementById(entry.rootId);
      if (!(sceneRoot instanceof HTMLElement)) {
        continue;
      }

      const scene: SceneDefinition = {
        id: entry.id,
        root: sceneRoot,
        enter: ({ reenter }) => {
          if (!reenter) {
            sceneRoot.dataset.sceneStatus = 'active';
          }
        },
        exit: () => {
          sceneRoot.dataset.sceneStatus = 'inactive';
        },
        update: () => {
          // Real scene-specific update logic will be migrated into scene modules.
        },
        render: () => {
          // Real scene-specific rendering will stay inside each scene implementation.
        },
        onStateLoaded: () => {
          sceneRoot.dataset.sceneId = entry.id;
        }
      };

      this.sceneManager.registerScene(scene);
    }
  }
}
