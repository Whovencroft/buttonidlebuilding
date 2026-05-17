import type { AppState } from '../../core/state/AppState';
import type { SceneContext, SceneDefinition } from '../../core/scene/SceneManager';
import { createMarbleInput } from './MarbleInput';
import { getMarbleLevelById } from './MarbleLevels';
import { updateMarblePhysics } from './MarblePhysics';
import { createMarbleRenderer } from './MarbleRenderer';
import { createMarbleRuntime, restartMarbleRuntime, type MarbleRuntimeState } from './MarbleRuntime';

export interface MarbleSceneOptions {
  root: HTMLElement;
}

export function createMarbleScene({ root }: MarbleSceneOptions): SceneDefinition {
  const canvas = ensureCanvas(root);
  const renderer = createMarbleRenderer(canvas);
  const input = createMarbleInput();
  let runtime: MarbleRuntimeState | null = null;

  return {
    id: 'marble',
    root,
    enter(context) {
      const state = readState(context);
      const levelId = state?.scenes.marble.currentLevelId ?? 'training_run';
      runtime = createMarbleRuntime(levelId);

      root.dataset.sceneStatus = 'active';
      root.dataset.sceneKind = 'canvas';
      root.dataset.sceneUnlocked = String(state?.scenes.marble.unlocked ?? false);

      input.attach();
      renderer.resize();
      renderer.render(runtime);
    },
    exit() {
      root.dataset.sceneStatus = 'inactive';
      input.detach();
    },
    update(dt, context) {
      if (!runtime) {
        return;
      }

      const state = readState(context);
      const unlocked = state?.scenes.marble.unlocked ?? false;
      if (!unlocked) {
        return;
      }

      const snapshot = input.snapshot();
      updateMarblePhysics(runtime, snapshot, dt);

      if (runtime.status === 'complete' && state) {
        const levelId = runtime.level.id;
        state.scenes.marble.bestTimes[levelId] = Math.min(
          state.scenes.marble.bestTimes[levelId] ?? Number.POSITIVE_INFINITY,
          runtime.timerMs
        );

        if (!state.scenes.marble.clearedLevels.includes(levelId)) {
          state.scenes.marble.clearedLevels.push(levelId);
        }
      }

      input.endFrame();
    },
    render(context) {
      const state = readState(context);
      if (state) {
        root.dataset.activeScene = state.app.activeScene;
      }

      if (!runtime) {
        const levelId = state?.scenes.marble.currentLevelId ?? 'training_run';
        runtime = createMarbleRuntime(levelId);
      }

      renderer.render(runtime);
    },
    onStateLoaded(context) {
      const state = readState(context);
      const levelId = state?.scenes.marble.currentLevelId ?? 'training_run';
      const level = getMarbleLevelById(levelId);

      root.dataset.sceneUnlocked = String(state?.scenes.marble.unlocked ?? false);
      root.dataset.currentLevelId = level.id;
      root.dataset.currentLevelName = level.name;

      if (runtime && runtime.level.id !== level.id) {
        runtime.level = level;
        restartMarbleRuntime(runtime);
      }
    }
  };
}

function ensureCanvas(root: HTMLElement): HTMLCanvasElement {
  const existing = root.querySelector('canvas');
  if (existing instanceof HTMLCanvasElement) {
    return existing;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'marble-canvas';
  root.appendChild(canvas);
  return canvas;
}

function readState(context: SceneContext): AppState | null {
  const candidate = context.state;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  return candidate as AppState;
}
