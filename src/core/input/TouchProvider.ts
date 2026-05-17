import type { InputAction, InputProvider } from './InputService';

export interface TouchProviderOptions {
  target?: HTMLElement | Window;
}

/**
 * This provider is intentionally simple.
 * It gives the migration a touch-safe input layer before a full mobile HUD exists.
 *
 * Intended use:
 * - tap anywhere to emit confirm / primary
 * - optional directional state can be driven by a later on-screen control overlay
 */
export class TouchProvider implements InputProvider {
  private readonly heldActions = new Set<InputAction>();
  private readonly pressedActions = new Set<InputAction>();
  private attached = false;
  private readonly target: HTMLElement | Window;

  public constructor({ target = window }: TouchProviderOptions = {}) {
    this.target = target;
  }

  private readonly onTouchStart = (): void => {
    this.press('confirm');
    this.press('primary');
  };

  private readonly onTouchEnd = (): void => {
    this.release('confirm');
    this.release('primary');
  };

  private readonly onTouchCancel = (): void => {
    this.heldActions.clear();
  };

  public attach(): void {
    if (this.attached) {
      return;
    }

    this.attached = true;
    this.target.addEventListener('touchstart', this.onTouchStart as EventListener, { passive: true });
    this.target.addEventListener('touchend', this.onTouchEnd as EventListener, { passive: true });
    this.target.addEventListener('touchcancel', this.onTouchCancel as EventListener, { passive: true });
  }

  public detach(): void {
    if (!this.attached) {
      return;
    }

    this.attached = false;
    this.target.removeEventListener('touchstart', this.onTouchStart as EventListener);
    this.target.removeEventListener('touchend', this.onTouchEnd as EventListener);
    this.target.removeEventListener('touchcancel', this.onTouchCancel as EventListener);
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

  public setDirectionalState(direction: Partial<Record<'move_left' | 'move_right' | 'move_up' | 'move_down', boolean>>): void {
    const supported: Array<'move_left' | 'move_right' | 'move_up' | 'move_down'> = [
      'move_left',
      'move_right',
      'move_up',
      'move_down'
    ];

    for (const action of supported) {
      const active = !!direction[action];
      if (active) {
        this.press(action);
      } else {
        this.release(action);
      }
    }
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
