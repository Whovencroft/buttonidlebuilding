import { bootstrap } from './app/bootstrap.js';

/**
 * Starts the app from the new source entry path once the DOM is ready.
 */
function start() {
  void bootstrap();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
