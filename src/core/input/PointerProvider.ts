import type { InputAction, InputProvider } from './InputService';

export interface PointerProviderOptions {
  target?: EventTarget;
}

export class PointerProvider implements InputProvider {
  private readonly heldActions = new Set<InputAction>();
  private readonly pressedActions = new Set<InputAction>();
  private attached = false;
  private readonly target: EventTarget;

  public constructor({ target = window }: PointerProviderOptions = {}) {
    this.target = target;
  }

  private readonly onPointerDown = (event: Event): void => {
    if (!(event instanceof PointerEvent)) {
      return;
    }

    if (event.button === 0) {
      this.press('primary');
      this.press('confirm');
    } else if (event.button === 2) {
      this.press('secondary');
    }
  };

  private readonly onPointerUp = (event: Event): void => {
    if (!(event instanceof PointerEvent)) {
      return;
    }

    if (event.button === 0) {
      this.release('primary');
      this.release('confirm');
    } else if (event.button === 2) {
      this.release('secondary');
    }
  };

  private readonly onPointerCancel = (): void => {
    this.heldActions.clear();
  };

  public attach(): void {
    if (this.attached) {
      return;
    }

    this.attached = true;
    this.target.addEventListener('pointerdown', this.onPointerDown as EventListener);
    this.target.addEventListener('pointerup', this.onPointerUp as EventListener);
    this.target.addEventListener('pointercancel', this.onPointerCancel);
  }

  public detach(): void {
    if (!this.attached) {
      return;
    }

    this.attached = false;
    this.target.removeEventListener('pointerdown', this.onPointerDown as EventListener);
    this.target.removeEventListener('pointerup', this.onPointerUp as EventListener);
    this.target.removeEventListener('pointercancel', this.onPointerCancel);
    this.heldActions.clear();
    this.pressedActions.clear();
  }

  public isHeld(action: InputAction): boolean {
    return this.heldActions.has(action);
  }

  public wasPressed(action: InputAction): boolean {
    return this.pressedActions.has(action);
  }

  public endFrame(): void {
    this.pressedActions.clear();
  }

  private press(action: InputAction): void {
    if (!this.heldActions.has(action)) {
      this.pressedActions.add(action);
    }

    this.heldActions.add(action);
  }

  private release(action: InputAction): void {
    this.heldActions.delete(action);
  }
}
