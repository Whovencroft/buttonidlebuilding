/**
 * WebPlatform provides host lifecycle hooks and mobile capability detection
 * for browser and mobile-web runtime contexts.
 */
export class WebPlatform {
  kind = 'web';
  #detach = null;

  isMobile() {
    return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
  }

  bindLifecycle({ onPause, onResume }) {
    const onVisibilityChange = () => {
      if (document.hidden) {
        onPause?.();
      } else {
        onResume?.();
      }
    };

    const onPageHide = () => onPause?.();
    const onPageShow = () => onResume?.();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);

    this.#detach = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }

  unbindLifecycle() {
    this.#detach?.();
    this.#detach = null;
  }
}
