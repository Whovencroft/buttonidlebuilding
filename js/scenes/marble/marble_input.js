(() => {
  function createInput() {
    const held = new Set();
    const bufferedPresses = new Set();
    let attached = false;

    function onKeyDown(event) {
      if (!held.has(event.code)) {
        bufferedPresses.add(event.code);
      }
      held.add(event.code);
    }

    function onKeyUp(event) {
      held.delete(event.code);
    }

    function onBlur() {
      held.clear();
      bufferedPresses.clear();
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

      return {
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4))
      };
    }

    function consumeBufferedPress(code) {
      const had = bufferedPresses.has(code);
      bufferedPresses.delete(code);
      return had;
    }

    function isHeld(code) {
      return held.has(code);
    }

    function buildStepInput() {
      return {
        axis: getAxis(),
        jumpPressed: consumeBufferedPress('Space')
      };
    }

    function applyReplayFrame(frame) {
      return {
        axis: {
          x: Number(frame?.x ?? 0),
          y: Number(frame?.y ?? 0)
        },
        jumpPressed: !!frame?.j
      };
    }

    function endFrame() {}

    return {
      attach,
      detach,
      getAxis,
      isHeld,
      consumeBufferedPress,
      buildStepInput,
      applyReplayFrame,
      endFrame
    };
  }

  window.MarbleInput = {
    createInput
  };
})();
