export interface TouchOverlayBindings {
  onMoveChange?: (x: number, y: number) => void;
  onPrimaryPress?: () => void;
  onPrimaryRelease?: () => void;
  onPausePress?: () => void;
}

export interface TouchOverlayController {
  root: HTMLElement;
  show(): void;
  hide(): void;
  destroy(): void;
  setEnabled(enabled: boolean): void;
}

/**
 * A lightweight mobile touch layer for canvas and Phaser scenes.
 * It exposes a virtual stick plus two action buttons.
 */
export function createTouchOverlay(bindings: TouchOverlayBindings = {}): TouchOverlayController {
  const root = document.createElement('div');
  root.className = 'mobile-touch-overlay';
  root.hidden = true;

  root.innerHTML = `
    <div class="mobile-touch-overlay__left">
      <div class="mobile-touch-stick" data-stick="true">
        <div class="mobile-touch-stick__knob" data-stick-knob="true"></div>
      </div>
    </div>
    <div class="mobile-touch-overlay__right">
      <button type="button" class="mobile-touch-btn mobile-touch-btn--primary" data-action="primary">A</button>
      <button type="button" class="mobile-touch-btn mobile-touch-btn--pause" data-action="pause">II</button>
    </div>
  `;

  const stick = root.querySelector<HTMLElement>('[data-stick="true"]');
  const knob = root.querySelector<HTMLElement>('[data-stick-knob="true"]');
  const primaryButton = root.querySelector<HTMLButtonElement>('[data-action="primary"]');
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-action="pause"]');

  if (!stick || !knob || !primaryButton || !pauseButton) {
    throw new Error('TouchOverlay scaffold failed to initialize required elements.');
  }

  let enabled = true;
  let activePointerId: number | null = null;

  const resetStick = () => {
    knob.style.transform = 'translate(0px, 0px)';
    bindings.onMoveChange?.(0, 0);
  };

  const onStickPointerDown = (event: PointerEvent) => {
    if (!enabled) return;
    activePointerId = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateStick(event);
  };

  const onStickPointerMove = (event: PointerEvent) => {
    if (!enabled) return;
    if (activePointerId !== event.pointerId) return;
    updateStick(event);
  };

  const onStickPointerUp = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    resetStick();
  };

  const onPrimaryPointerDown = () => {
    if (!enabled) return;
    bindings.onPrimaryPress?.();
  };

  const onPrimaryPointerUp = () => {
    if (!enabled) return;
    bindings.onPrimaryRelease?.();
  };

  const onPausePointerDown = () => {
    if (!enabled) return;
    bindings.onPausePress?.();
  };

  function updateStick(event: PointerEvent): void {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const radius = Math.max(1, rect.width * 0.36);

    const length = Math.hypot(dx, dy);
    const clampedLength = Math.min(length, radius);
    const nx = length > 0 ? dx / length : 0;
    const ny = length > 0 ? dy / length : 0;

    const tx = nx * clampedLength;
    const ty = ny * clampedLength;

    knob.style.transform = `translate(${tx}px, ${ty}px)`;
    bindings.onMoveChange?.(tx / radius, ty / radius);
  }

  stick.addEventListener('pointerdown', onStickPointerDown);
  stick.addEventListener('pointermove', onStickPointerMove);
  stick.addEventListener('pointerup', onStickPointerUp);
  stick.addEventListener('pointercancel', onStickPointerUp);

  primaryButton.addEventListener('pointerdown', onPrimaryPointerDown);
  primaryButton.addEventListener('pointerup', onPrimaryPointerUp);
  primaryButton.addEventListener('pointercancel', onPrimaryPointerUp);

  pauseButton.addEventListener('pointerdown', onPausePointerDown);

  return {
    root,
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      resetStick();
    },
    destroy() {
      stick.removeEventListener('pointerdown', onStickPointerDown);
      stick.removeEventListener('pointermove', onStickPointerMove);
      stick.removeEventListener('pointerup', onStickPointerUp);
      stick.removeEventListener('pointercancel', onStickPointerUp);

      primaryButton.removeEventListener('pointerdown', onPrimaryPointerDown);
      primaryButton.removeEventListener('pointerup', onPrimaryPointerUp);
      primaryButton.removeEventListener('pointercancel', onPrimaryPointerUp);

      pauseButton.removeEventListener('pointerdown', onPausePointerDown);

      root.remove();
    },
    setEnabled(nextEnabled: boolean) {
      enabled = nextEnabled;
      if (!enabled) {
        resetStick();
      }
      root.dataset.enabled = enabled ? 'true' : 'false';
    }
  };
}
