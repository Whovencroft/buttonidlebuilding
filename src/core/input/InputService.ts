export type InputAction =
  | 'confirm'
  | 'cancel'
  | 'pause'
  | 'menu'
  | 'move_left'
  | 'move_right'
  | 'move_up'
  | 'move_down'
  | 'primary'
  | 'secondary';

export interface InputSnapshot {
  moveX: number;
  moveY: number;
  held: Partial<Record<InputAction, boolean>>;
  pressed: Partial<Record<InputAction, boolean>>;
}

export interface InputProvider {
  attach(): void;
  detach(): void;
  isHeld(action: InputAction): boolean;
  wasPressed(action: InputAction): boolean;
  endFrame(): void;
}

export class KeyboardInputProvider implements InputProvider {
  private readonly heldKeys = new Set<string>();
  private readonly pressedKeys = new Set<string>();
  private attached = false;
  private readonly bindings: Record<InputAction, string[]> = {
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

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;
    if (!this.heldKeys.has(code)) {
      this.pressedKeys.add(code);
    }
    this.heldKeys.add(code);
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

export class InputService {
  private readonly providers: InputProvider[];

  public constructor(providers: InputProvider[] = [new KeyboardInputProvider()]) {
    this.providers = providers;
  }

  public attach(): void {
    for (const provider of this.providers) {
      provider.attach();
    }
  }

  public detach(): void {
    for (const provider of this.providers) {
      provider.detach();
    }
  }

  public snapshot(): InputSnapshot {
    const held = this.collectHeldState();
    const pressed = this.collectPressedState();

    const moveX = (held.move_right ? 1 : 0) - (held.move_left ? 1 : 0);
    const moveY = (held.move_down ? 1 : 0) - (held.move_up ? 1 : 0);

    return {
      moveX,
      moveY,
      held,
      pressed
    };
  }

  public endFrame(): void {
    for (const provider of this.providers) {
      provider.endFrame();
    }
  }

  private collectHeldState(): Partial<Record<InputAction, boolean>> {
    const actions: InputAction[] = [
      'confirm',
      'cancel',
      'pause',
      'menu',
      'move_left',
      'move_right',
      'move_up',
      'move_down',
      'primary',
      'secondary'
    ];

    const held: Partial<Record<InputAction, boolean>> = {};
    for (const action of actions) {
      held[action] = this.providers.some((provider) => provider.isHeld(action));
    }

    return held;
  }

  private collectPressedState(): Partial<Record<InputAction, boolean>> {
    const actions: InputAction[] = [
      'confirm',
      'cancel',
      'pause',
      'menu',
      'move_left',
      'move_right',
      'move_up',
      'move_down',
      'primary',
      'secondary'
    ];

    const pressed: Partial<Record<InputAction, boolean>> = {};
    for (const action of actions) {
      pressed[action] = this.providers.some((provider) => provider.wasPressed(action));
    }

    return pressed;
  }
}
