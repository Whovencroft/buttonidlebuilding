/**
 * Applies safe-area CSS variables for shell padding on mobile web contexts.
 */
export class SafeArea {
  apply() {
    const root = document.documentElement;
    root.style.setProperty('--safe-top', 'env(safe-area-inset-top, 0px)');
    root.style.setProperty('--safe-right', 'env(safe-area-inset-right, 0px)');
    root.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');
    root.style.setProperty('--safe-left', 'env(safe-area-inset-left, 0px)');
  }
}
