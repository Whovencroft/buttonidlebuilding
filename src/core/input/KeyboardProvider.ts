import { DEFAULT_KEYBOARD_ACTION_MAP, type InputActionMap } from './ActionMap';
import type { InputAction, InputProvider } from './InputService';

export class KeyboardProvider implements InputProvider {
  private readonly heldKeys = new Set<string>();
  private readonly pressedKeys = new Set<string>();
  private attached = false;

  public constructor(
    private readonly bindings: InputActionMap = DEFAULT_KEYBOARD_ACTION_MAP
  ) {}

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.heldKeys.has(event.code)) {
      this.pressedKeys.add(event.code);
    }

    this.heldKeys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.heldKeys.clear();
    this.pressedKeys.clear();
  };

  public attach(): void {
    if (this.attached) {
      return;
    }

    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  public detach(): void {
    if (!this.attached) {
      return;
    }

    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.onBlur();
  }

  public isHeld(action: InputAction): boolean {
    return this.getBinding(action).some((code) => this.heldKeys.has(code));
  }

  public wasPressed(action: InputAction): boolean {
    return this.getBinding(action).some((code) => this.pressedKeys.has(code));
  }

  public endFrame(): void {
    this.pressedKeys.clear();
  }

  private getBinding(action: InputAction): string[] {
    return this.bindings[action] ?? [];
  }
}
