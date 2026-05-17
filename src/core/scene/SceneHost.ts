export interface CurrentSceneRoots {
  host: HTMLElement;
  buttonIdleSceneRoot: HTMLElement;
  marbleSceneRoot: HTMLElement;
}

export function requireElementById<T extends HTMLElement>(id: string, ctor: { new (): T } | typeof HTMLElement = HTMLElement): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Expected #${id} to exist and match the required element type.`);
  }

  return element as T;
}

export function getCurrentSceneRoots(): CurrentSceneRoots {
  return {
    host: requireElementById('sceneHost'),
    buttonIdleSceneRoot: requireElementById('buttonIdleSceneRoot'),
    marbleSceneRoot: requireElementById('marbleSceneRoot')
  };
}

export function setSceneRootActive(root: HTMLElement, active: boolean): void {
  root.classList.toggle('active', active);
  root.setAttribute('aria-hidden', active ? 'false' : 'true');
}

export function markSceneRoot(root: HTMLElement, sceneId: string, sceneKind?: string): void {
  root.dataset.sceneId = sceneId;
  if (sceneKind) {
    root.dataset.sceneKind = sceneKind;
  }
}
