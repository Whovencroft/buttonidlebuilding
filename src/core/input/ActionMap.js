/**
 * Canonical action vocabulary used by the host input architecture.
 */
export const ACTIONS = {
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
  PAUSE: 'pause',
  MOVE_LEFT: 'move_left',
  MOVE_RIGHT: 'move_right',
  MOVE_UP: 'move_up',
  MOVE_DOWN: 'move_down',
  INTERACT: 'interact',
  MENU: 'menu',
  PRIMARY: 'primary',
  SECONDARY: 'secondary'
};

/**
 * Default keyboard action map used for current scenes.
 */
export const DEFAULT_KEYBOARD_ACTION_MAP = {
  ArrowLeft: ACTIONS.MOVE_LEFT,
  KeyA: ACTIONS.MOVE_LEFT,
  ArrowRight: ACTIONS.MOVE_RIGHT,
  KeyD: ACTIONS.MOVE_RIGHT,
  ArrowUp: ACTIONS.MOVE_UP,
  KeyW: ACTIONS.MOVE_UP,
  ArrowDown: ACTIONS.MOVE_DOWN,
  KeyS: ACTIONS.MOVE_DOWN,
  Enter: ACTIONS.CONFIRM,
  Space: ACTIONS.PRIMARY,
  Escape: ACTIONS.CANCEL,
  KeyR: ACTIONS.SECONDARY
};
