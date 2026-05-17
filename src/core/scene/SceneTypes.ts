import type { SceneContext, SceneDefinition } from './SceneManager';

export type SceneKind = 'dom' | 'canvas' | 'phaser';

export interface SceneResult {
  completed?: boolean;
  failed?: boolean;
  nextSceneId?: string;
  endingId?: string;
  reward?: Record<string, unknown>;
  savePatch?: Record<string, unknown>;
}

export interface HostedSceneContext extends SceneContext {
  state?: unknown;
  payload?: unknown;
  result?: SceneResult;
}

export interface HostedSceneDefinition extends SceneDefinition {
  kind?: SceneKind;
  preload?: (context: HostedSceneContext) => void | Promise<void>;
  pause?: (context: HostedSceneContext) => void;
  resume?: (context: HostedSceneContext) => void;
  onResize?: (context: HostedSceneContext) => void;
}

export const SCENE_KINDS: readonly SceneKind[] = ['dom', 'canvas', 'phaser'];

export function isSceneKind(value: unknown): value is SceneKind {
  return typeof value === 'string' && (SCENE_KINDS as readonly string[]).includes(value);
}
