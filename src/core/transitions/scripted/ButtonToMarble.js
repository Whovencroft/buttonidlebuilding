import { runGenericEndingTransition } from './GenericEndingTransition.js';

/**
 * Scripted transition for button_idle ending into marble scene.
 */
export async function runButtonToMarbleTransition(context) {
  const {
    appRoot,
    durationMs = 350,
    onSwitchToMarble,
    onBeforeStart,
    onAfterComplete
  } = context;

  if (typeof onBeforeStart === 'function') {
    await onBeforeStart();
  }

  await runGenericEndingTransition({
    appRoot,
    durationMs,
    onMidpoint: onSwitchToMarble,
    onComplete: onAfterComplete
  });
}
