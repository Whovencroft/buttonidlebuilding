import type { InputAction } from './InputService';

export type InputActionMap = Record<InputAction, string[]>;

export const DEFAULT_KEYBOARD_ACTION_MAP: InputActionMap = {
  confirm: ['Enter', 'Space'],
  cancel: ['Escape'],
  pause: ['KeyP'],
  menu: ['Tab'],
  move_left: ['ArrowLeft', 'KeyA'],
  move_right: ['ArrowRight', 'KeyD'],
  move_up: ['ArrowUp', 'KeyW'],
  move_down: ['ArrowDown', 'KeyS'],
  primary: ['Space'],
  secondary: ['ShiftLeft', 'ShiftRight']
};

export const MARBLE_KEYBOARD_ACTION_MAP: InputActionMap = {
  ...DEFAULT_KEYBOARD_ACTION_MAP,
  primary: ['Space', 'Enter'],
  secondary: ['ShiftLeft', 'ShiftRight', 'KeyR']
};

export function cloneActionMap(map: InputActionMap): InputActionMap {
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [key, [...value]])
  ) as InputActionMap;
}
