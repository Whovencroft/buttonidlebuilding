/**
 * Creates a marble input adapter backed by the host InputService.
 * This preserves marble scene expectations while routing through shared input.
 */
export function createMarbleInputAdapter(inputService) {
  if (!inputService) {
    throw new Error('Marble input adapter requires an InputService instance.');
  }

  let attached = false;

  return {
    attach() {
      attached = true;
    },
    detach() {
      attached = false;
    },
    getAxis() {
      if (!attached) return { x: 0, y: 0 };
      return inputService.getMoveAxis();
    },
    consumePressed(code) {
      if (!attached) return false;

      // Purpose: keep legacy keycode checks working while also honoring action-based input.
      if (code === 'Escape') {
        return inputService.consumePressedCode(code) || inputService.consumePressedAction('pause') || inputService.consumePressedAction('cancel');
      }

      if (code === 'KeyR') {
        return inputService.consumePressedCode(code) || inputService.consumePressedAction('secondary');
      }

      return inputService.consumePressedCode(code);
    },
    endFrame() {
      // No-op: InputService frame lifecycle is managed by the host app.
    }
  };
}
