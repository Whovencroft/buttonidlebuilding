export type SceneContext = Record<string, unknown>;

export type SceneDefinition = {
  id: string;
  root?: HTMLElement;
  rootId?: string;
  rootSelector?: string;
  enter?: (context: SceneContext & { reenter?: boolean; from?: string | null; to?: string }) => void;
  exit?: (context: SceneContext & { from?: string; to?: string }) => void;
  update?: (dt: number, context: SceneContext) => void;
  render?: (context: SceneContext) => void;
  onStateLoaded?: (context: SceneContext) => void;
};

type SceneChangePayload = {
  previousSceneId: string | null;
  currentSceneId: string;
  currentScene: SceneDefinition;
};

type SceneManagerOptions = {
  host: HTMLElement;
  onSceneChanged?: (payload: SceneChangePayload) => void;
};

export class SceneManager {
  private readonly host: HTMLElement;
  private readonly scenes = new Map<string, Required<SceneDefinition>>();
  private readonly onSceneChanged?: (payload: SceneChangePayload) => void;
  private activeSceneId: string | null = null;

  public constructor({ host, onSceneChanged }: SceneManagerOptions) {
    this.host = host;
    this.onSceneChanged = onSceneChanged;
  }

  public registerScene(sceneDefinition: SceneDefinition): Required<SceneDefinition> {
    if (!sceneDefinition.id.trim()) {
      throw new Error('Scene definitions must include a non-empty id.');
    }

    const scene = this.normalizeScene(sceneDefinition);
    this.scenes.set(scene.id, scene);
    return scene;
  }

  public setActiveScene(nextSceneId: string, context: SceneContext = {}): Required<SceneDefinition> {
    const nextScene = this.getSceneOrThrow(nextSceneId);

    if (this.activeSceneId === nextSceneId) {
      nextScene.enter({ ...context, reenter: true, from: this.activeSceneId, to: nextSceneId });
      return nextScene;
    }

    const previousScene = this.activeSceneId ? this.scenes.get(this.activeSceneId) ?? null : null;
    if (previousScene) {
      previousScene.exit({ ...context, from: previousScene.id, to: nextSceneId });
      this.hideScene(previousScene);
    }

    this.activeSceneId = nextSceneId;
    this.showScene(nextScene);
    nextScene.enter({ ...context, from: previousScene?.id ?? null, to: nextSceneId });

    this.onSceneChanged?.({
      previousSceneId: previousScene?.id ?? null,
      currentSceneId: nextSceneId,
      currentScene: nextScene
    });

    return nextScene;
  }

  public update(dt: number, context: SceneContext = {}): void {
    const activeScene = this.getActiveScene();
    activeScene?.update(dt, context);
  }

  public render(context: SceneContext = {}): void {
    const activeScene = this.getActiveScene();
    activeScene?.render(context);
  }

  public notifyStateLoaded(context: SceneContext = {}): void {
    for (const scene of this.scenes.values()) {
      scene.onStateLoaded(context);
    }
  }

  public getActiveSceneId(): string | null {
    return this.activeSceneId;
  }

  private getActiveScene(): Required<SceneDefinition> | null {
    if (!this.activeSceneId) return null;
    return this.scenes.get(this.activeSceneId) ?? null;
  }

  private getSceneOrThrow(sceneId: string): Required<SceneDefinition> {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      throw new Error(`Cannot activate unknown scene "${sceneId}".`);
    }

    return scene;
  }

  private normalizeScene(scene: SceneDefinition): Required<SceneDefinition> {
    return {
      enter: () => undefined,
      exit: () => undefined,
      update: () => undefined,
      render: () => undefined,
      onStateLoaded: () => undefined,
      root: scene.root ?? this.resolveSceneRoot(scene),
      rootId: scene.rootId ?? '',
      rootSelector: scene.rootSelector ?? '',
      ...scene
    };
  }

  private resolveSceneRoot(scene: SceneDefinition): HTMLElement {
    if (scene.root instanceof HTMLElement) {
      return scene.root;
    }

    if (scene.rootId) {
      const byId = document.getElementById(scene.rootId);
      if (byId instanceof HTMLElement) {
        return byId;
      }
    }

    if (scene.rootSelector) {
      const bySelector = document.querySelector(scene.rootSelector);
      if (bySelector instanceof HTMLElement) {
        return bySelector;
      }
    }

    const byDataAttribute = this.host.querySelector(`[data-scene-id="${scene.id}"]`);
    if (byDataAttribute instanceof HTMLElement) {
      return byDataAttribute;
    }

    throw new Error(`Unable to resolve a root element for scene "${scene.id}".`);
  }

  private showScene(scene: Required<SceneDefinition>): void {
    scene.root.classList.add('active');
    scene.root.setAttribute('aria-hidden', 'false');
  }

  private hideScene(scene: Required<SceneDefinition>): void {
    scene.root.classList.remove('active');
    scene.root.setAttribute('aria-hidden', 'true');
  }
}
