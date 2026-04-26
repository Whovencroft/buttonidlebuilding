/**
 * marble_input.js
 *
 * Unified input system for the marble scene.
 *
 * PRIMARY: Drag-to-move (mouse + touch)
 *   - Drag starts on the marble (or anywhere on canvas for convenience)
 *   - Drag direction is projected from screen space into isometric world space
 *   - Drag length scales the applied force (longer drag = more force)
 *   - Force is applied as a continuous axis while dragging, then released
 *   - On release, a one-shot impulse proportional to drag length is applied
 *
 * Keyboard: non-movement keys only.
 *   - Space: jump
 *   - R: restart  (consumed by marble_state.js)
 *   - Escape: return (consumed by marble_state.js)
 *   Arrow keys and WASD are intentionally NOT supported.
 *
 * Isometric world projection:
 *   The isometric camera is oriented at 45° yaw, ~35.26° pitch.
 *   Screen right (+screenX) maps to world NE (world +X, -Y diagonal).
 *   Screen down  (+screenY) maps to world SE (world +X, +Y diagonal).
 *
 *   World X = (screenDx + screenDy) / 2   (east)
 *   World Y = (screenDy - screenDx) / 2   (south)
 */
(() => {
  'use strict';

  // Maximum drag distance in pixels before force is capped
  const MAX_DRAG_PX = 120;
  // Maximum force magnitude (world units/s²) at full drag
  const MAX_FORCE   = 1.0;
  // Tap threshold: drags shorter than this are treated as taps (no force)
  const TAP_THRESHOLD_PX = 8;
  // Jump: tap the marble (short drag < TAP_THRESHOLD_PX) to jump
  const JUMP_ON_TAP = true;

  function createInput() {
    // ── Non-movement key state ────────────────────────────────────────────
    const held             = new Set();
    const bufferedPresses  = new Set();
    const TRACKED_KEYS     = new Set(['Space', 'KeyR', 'Escape']);
    let   attached         = false;

    // ── Drag state ──────────────────────────────────────────────────────────
    let dragActive   = false;
    let dragStartX   = 0;
    let dragStartY   = 0;
    let dragCurrentX = 0;
    let dragCurrentY = 0;
    let dragPointer  = null;   // pointerId for pointer events

    // Pending one-shot impulse from drag release
    let pendingImpulse   = null;  // { wx, wy, magnitude }
    let pendingJump      = false;

    // Canvas reference (set when attached)
    let canvas = null;

    // ── Keyboard handlers (non-movement keys only) ─────────────────────────
    function onKeyDown(e) {
      if (!TRACKED_KEYS.has(e.code)) return;
      if (!held.has(e.code)) bufferedPresses.add(e.code);
      held.add(e.code);
    }
    function onKeyUp(e)  {
      if (!TRACKED_KEYS.has(e.code)) return;
      held.delete(e.code);
    }
    function onBlur()    { held.clear(); bufferedPresses.clear(); }

    // ── Pointer handlers ────────────────────────────────────────────────────
    function onPointerDown(e) {
      if (dragActive) return;
      e.preventDefault();
      dragActive   = true;
      dragPointer  = e.pointerId;
      dragStartX   = e.clientX;
      dragStartY   = e.clientY;
      dragCurrentX = e.clientX;
      dragCurrentY = e.clientY;
      if (canvas) canvas.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!dragActive || e.pointerId !== dragPointer) return;
      e.preventDefault();
      dragCurrentX = e.clientX;
      dragCurrentY = e.clientY;
    }

    function onPointerUp(e) {
      if (!dragActive || e.pointerId !== dragPointer) return;
      e.preventDefault();

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const dist = Math.hypot(dx, dy);

      if (dist < TAP_THRESHOLD_PX && JUMP_ON_TAP) {
        pendingJump = true;
      } else if (dist >= TAP_THRESHOLD_PX) {
        // Convert screen drag to world-space impulse
        const { wx, wy } = screenToWorld(dx, dy);
        const magnitude  = Math.min(dist / MAX_DRAG_PX, 1.0) * MAX_FORCE;
        pendingImpulse   = { wx, wy, magnitude };
      }

      dragActive  = false;
      dragPointer = null;
    }

    function onPointerCancel(e) {
      if (e.pointerId === dragPointer) {
        dragActive  = false;
        dragPointer = null;
      }
    }

    // ── Isometric projection ────────────────────────────────────────────────
    function screenToWorld(screenDx, screenDy) {
      // Standard isometric screen→world transform (45° yaw, ~35.26° pitch)
      const wx = (screenDx + screenDy) * 0.5;
      const wy = (screenDy - screenDx) * 0.5;
      const len = Math.hypot(wx, wy);
      if (len < 0.0001) return { wx: 0, wy: 0 };
      return { wx: wx / len, wy: wy / len };
    }

    // ── Public API ──────────────────────────────────────────────────────────
    function attach(targetCanvas) {
      if (attached) return;
      attached = true;
      canvas   = targetCanvas || null;

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup',   onKeyUp);
      window.addEventListener('blur',    onBlur);

      const el = canvas || window;
      el.addEventListener('pointerdown',   onPointerDown,   { passive: false });
      el.addEventListener('pointermove',   onPointerMove,   { passive: false });
      el.addEventListener('pointerup',     onPointerUp,     { passive: false });
      el.addEventListener('pointercancel', onPointerCancel, { passive: false });
    }

    function detach() {
      if (!attached) return;
      attached = false;

      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      window.removeEventListener('blur',    onBlur);
      onBlur();

      const el = canvas || window;
      el.removeEventListener('pointerdown',   onPointerDown);
      el.removeEventListener('pointermove',   onPointerMove);
      el.removeEventListener('pointerup',     onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);

      dragActive     = false;
      dragPointer    = null;
      pendingImpulse = null;
      pendingJump    = false;
      canvas         = null;
    }

    /**
     * Returns the current continuous axis for the physics step.
     * Drag-only: returns the normalised world-space drag direction
     * with magnitude proportional to drag distance (0..1), flagged as
     * worldSpace=true so the physics engine skips the screen→world transform.
     * Returns zero axis when no drag is active.
     */
    function getAxis() {
      if (!dragActive) {
        return { x: 0, y: 0, worldSpace: true };
      }

      // Active drag: project to world space
      const screenDx = dragCurrentX - dragStartX;
      const screenDy = dragCurrentY - dragStartY;
      const dist     = Math.hypot(screenDx, screenDy);
      if (dist < TAP_THRESHOLD_PX) {
        return { x: 0, y: 0, worldSpace: true };
      }

      const { wx, wy } = screenToWorld(screenDx, screenDy);
      const scale      = Math.min(dist / MAX_DRAG_PX, 1.0);
      return {
        x:          Number((wx * scale).toFixed(4)),
        y:          Number((wy * scale).toFixed(4)),
        worldSpace: true,
      };
    }

    function consumeBufferedPress(code) {
      const had = bufferedPresses.has(code);
      bufferedPresses.delete(code);
      return had;
    }

    function isHeld(code) { return held.has(code); }

    /**
     * Called once per physics frame to build the step input object.
     * Consumes the pending impulse and jump flag.
     */
    function buildStepInput() {
      const axis        = getAxis();
      const jumpPressed = consumeBufferedPress('Space') || pendingJump;
      pendingJump       = false;

      // If there's a pending one-shot impulse from a completed drag,
      // blend it into the axis for this frame.
      if (pendingImpulse) {
        const imp = pendingImpulse;
        pendingImpulse = null;
        return {
          axis: {
            x:          Number((axis.x + imp.wx * imp.magnitude).toFixed(4)),
            y:          Number((axis.y + imp.wy * imp.magnitude).toFixed(4)),
            worldSpace: true,
          },
          jumpPressed,
        };
      }

      return { axis, jumpPressed };
    }

    function applyReplayFrame(frame) {
      return {
        axis: {
          x:          Number(frame?.x ?? 0),
          y:          Number(frame?.y ?? 0),
          worldSpace: false,
        },
        jumpPressed: !!frame?.j,
      };
    }

    /**
     * Returns drag state for the renderer to draw the drag arrow.
     * { active, screenDx, screenDy, worldDx, worldDy, magnitude }
     */
    function getDragState() {
      if (!dragActive) return { active: false };
      const screenDx = dragCurrentX - dragStartX;
      const screenDy = dragCurrentY - dragStartY;
      const dist     = Math.hypot(screenDx, screenDy);
      const { wx, wy } = screenToWorld(screenDx, screenDy);
      const magnitude  = Math.min(dist / MAX_DRAG_PX, 1.0);
      return {
        active:    true,
        screenDx,
        screenDy,
        worldDx:   wx * magnitude,
        worldDy:   wy * magnitude,
        magnitude,
      };
    }

    function endFrame() {
      // Nothing to do — buffered presses are consumed on read
    }

    return {
      attach,
      detach,
      getAxis,
      isHeld,
      consumeBufferedPress,
      buildStepInput,
      applyReplayFrame,
      getDragState,
      endFrame,
    };
  }

  window.MarbleInput = { createInput };
})();
