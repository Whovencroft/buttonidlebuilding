(() => {
  function createInput() {
    const held = new Set();
    const pressedThisFrame = new Set();
    let attached = false;

    function onKeyDown(event) {
      if (!held.has(event.code)) {
        pressedThisFrame.add(event.code);
      }
      held.add(event.code);
    }

    function onKeyUp(event) {
      held.delete(event.code);
    }

    function onBlur() {
      held.clear();
      pressedThisFrame.clear();
    }

    function attach() {
      if (attached) return;
      attached = true;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
    }

    function detach() {
      if (!attached) return;
      attached = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    }

    function getAxis() {
      let x = 0;
      let y = 0;

      if (held.has('ArrowLeft') || held.has('KeyA')) x -= 1;
      if (held.has('ArrowRight') || held.has('KeyD')) x += 1;
      if (held.has('ArrowUp') || held.has('KeyW')) y -= 1;
      if (held.has('ArrowDown') || held.has('KeyS')) y += 1;

      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }

      return { x, y };
    }

    function consumePressed(code) {
      const had = pressedThisFrame.has(code);
      pressedThisFrame.delete(code);
      return had;
    }

    function endFrame() {
      pressedThisFrame.clear();
    }

    return {
      attach,
      detach,
      getAxis,
      consumePressed,
      endFrame
    };
  }

  window.MarbleInput = {
    createInput
  };
})();