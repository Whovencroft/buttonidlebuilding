import type { SceneDefinition } from '../core/scene/SceneManager';
import { createButtonIdleScene } from '../scenes/button_idle/ButtonIdleScene';
import { createMarbleScene } from '../scenes/marble/MarbleScene';

export interface CurrentSceneRoots {
  buttonIdleSceneRoot: HTMLElement;
  marbleSceneRoot: HTMLElement;
}

export function createCurrentSceneRegistry(roots: CurrentSceneRoots): SceneDefinition[] {
  return [
    createButtonIdleScene({ root: roots.buttonIdleSceneRoot }),
    createMarbleScene({ root: roots.marbleSceneRoot })
  ];
}
