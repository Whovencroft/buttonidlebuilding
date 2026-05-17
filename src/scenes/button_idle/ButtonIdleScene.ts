import type { AppState } from '../../core/state/AppState';
import type { SceneContext, SceneDefinition } from '../../core/scene/SceneManager';

export interface ButtonIdleSceneOptions {
  root: HTMLElement;
}

export function createButtonIdleScene({ root }: ButtonIdleSceneOptions): SceneDefinition {
  let hasEntered = false;

  return {
    id: 'button_idle',
    root,
    enter(context) {
      hasEntered = true;
      root.dataset.sceneStatus = 'active';
      root.dataset.sceneKind = 'dom';

      const state = readState(context);
      if (state) {
        root.dataset.sceneUnlocked = String(state.scenes.button_idle.unlocked);
      }
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
    },
    update(_dt, context) {
      const state = readState(context);
      if (!state || !hasEntered) {
        return;
      }

      root.dataset.sceneComplete = String(state.scenes.button_idle.complete);
    },
    render(context) {
      const state = readState(context);
      if (!state) {
        return;
      }

      root.dataset.sceneId = 'button_idle';
      root.dataset.activeScene = state.app.activeScene;

      // Migration note:
      // The existing repo keeps real button-idle logic in js/scenes/button_idle_scene.js.
      // This scaffold preserves the scene contract while that code is split into:
      // - ButtonIdleLogic.ts
      // - ButtonIdleRenderer.ts
      // - ButtonIdleUI.ts
    },
    onStateLoaded(context) {
      const state = readState(context);
      if (!state) {
        return;
      }

      root.dataset.sceneUnlocked = String(state.scenes.button_idle.unlocked);
      root.dataset.sceneComplete = String(state.scenes.button_idle.complete);
    }
  };
}

function readState(context: SceneContext): AppState | null {
  const candidate = context.state;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  return candidate as AppState;
}
