/**
 * KeyboardProvider captures key state and maps keys to semantic actions.
 */
export class KeyboardProvider {
  #actionMap;
  #heldCodes = new Set();
  #pressedCodes = new Set();
  #heldActions = new Set();
  #pressedActions = new Set();
  #attached = false;

  constructor(actionMap = {}) {
    this.#actionMap = actionMap;
  }

  attach() {
    if (this.#attached) return;
    this.#attached = true;
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('blur', this.#onBlur);
  }

  detach() {
    if (!this.#attached) return;
    this.#attached = false;
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('blur', this.#onBlur);
    this.#clear();
  }

  isCodeHeld(code) {
    return this.#heldCodes.has(code);
  }

  consumePressedCode(code) {
    const had = this.#pressedCodes.has(code);
    this.#pressedCodes.delete(code);
    return had;
  }

  isActionHeld(action) {
    return this.#heldActions.has(action);
  }

  consumePressedAction(action) {
    const had = this.#pressedActions.has(action);
    this.#pressedActions.delete(action);
    return had;
  }

  endFrame() {
    this.#pressedCodes.clear();
    this.#pressedActions.clear();
  }

  #onKeyDown = (event) => {
    if (!this.#heldCodes.has(event.code)) {
      this.#pressedCodes.add(event.code);
    }

    this.#heldCodes.add(event.code);

    const action = this.#actionMap[event.code];
    if (!action) return;

    if (!this.#heldActions.has(action)) {
      this.#pressedActions.add(action);
    }

    this.#heldActions.add(action);
  };

  #onKeyUp = (event) => {
    this.#heldCodes.delete(event.code);

    const action = this.#actionMap[event.code];
    if (!action) return;

    const stillHeld = Array.from(this.#heldCodes).some((code) => this.#actionMap[code] === action);
    if (!stillHeld) {
      this.#heldActions.delete(action);
    }
  };

  #onBlur = () => {
    this.#clear();
  };

  #clear() {
    this.#heldCodes.clear();
    this.#pressedCodes.clear();
    this.#heldActions.clear();
    this.#pressedActions.clear();
  }
}
