import { DEFAULT_KEYBOARD_ACTION_MAP } from './ActionMap.js';
import { KeyboardProvider } from './KeyboardProvider.js';
import { PointerProvider } from './PointerProvider.js';
import { TouchProvider } from './TouchProvider.js';
import { GamepadProvider } from './GamepadProvider.js';

/**
 * InputService centralizes input providers so scenes consume actions/state
 * without owning raw browser event listeners directly.
 */
export class InputService {
  #keyboard;
  #pointer;
  #touch;
  #gamepad;
  #virtualActions = new Set();
  #virtualPressed = new Set();

  constructor({ keyboardMap = DEFAULT_KEYBOARD_ACTION_MAP } = {}) {
    this.#keyboard = new KeyboardProvider(keyboardMap);
    this.#pointer = new PointerProvider();
    this.#touch = new TouchProvider();
    this.#gamepad = new GamepadProvider();
  }

  attach() {
    this.#keyboard.attach();
    this.#pointer.attach();
    this.#touch.attach();
    this.#gamepad.attach();
  }

  detach() {
    this.#keyboard.detach();
    this.#pointer.detach();
    this.#touch.detach();
    this.#gamepad.detach();
  }

  endFrame() {
    this.#keyboard.endFrame();
    this.#pointer.endFrame();
    this.#touch.endFrame();
    this.#gamepad.endFrame();
    this.#virtualPressed.clear();
  }

  getMoveAxis() {
    let x = 0;
    let y = 0;

    if (this.#keyboard.isActionHeld('move_left') || this.#virtualActions.has('move_left')) x -= 1;
    if (this.#keyboard.isActionHeld('move_right') || this.#virtualActions.has('move_right')) x += 1;
    if (this.#keyboard.isActionHeld('move_up') || this.#virtualActions.has('move_up')) y -= 1;
    if (this.#keyboard.isActionHeld('move_down') || this.#virtualActions.has('move_down')) y += 1;

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }

    return { x, y };
  }

  consumePressedCode(code) {
    return this.#keyboard.consumePressedCode(code);
  }

  consumePressedAction(action) {
    const fromVirtual = this.#virtualPressed.has(action);
    this.#virtualPressed.delete(action);
    return this.#keyboard.consumePressedAction(action) || fromVirtual;
  }

  isActionHeld(action) {
    return this.#keyboard.isActionHeld(action) || this.#virtualActions.has(action);
  }

  setVirtualAction(action, active) {
    if (active) {
      if (!this.#virtualActions.has(action)) {
        this.#virtualPressed.add(action);
      }
      this.#virtualActions.add(action);
      return;
    }

    this.#virtualActions.delete(action);
  }

  clearVirtualActions() {
    this.#virtualActions.clear();
    this.#virtualPressed.clear();
  }
}
