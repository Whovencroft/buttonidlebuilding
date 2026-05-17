/**
 * Generic ending transition helper that applies host transition classes and
 * runs midpoint/completion callbacks at deterministic timing points.
 */
export async function runGenericEndingTransition({ appRoot, durationMs = 350, onMidpoint, onComplete }) {
  if (appRoot instanceof HTMLElement) {
    appRoot.classList.add('app-scene-transitioning');
  }

  const midpointDelay = Math.max(0, Math.floor(durationMs * 0.5));

  await new Promise((resolve) => {
    window.setTimeout(async () => {
      if (typeof onMidpoint === 'function') {
        await onMidpoint();
      }

      window.setTimeout(async () => {
        if (appRoot instanceof HTMLElement) {
          appRoot.classList.remove('app-scene-transitioning');
        }

        if (typeof onComplete === 'function') {
          await onComplete();
        }

        resolve();
      }, durationMs - midpointDelay);
    }, midpointDelay);
  });
}
