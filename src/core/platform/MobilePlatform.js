import { WebPlatform } from './WebPlatform.js';

/**
 * MobilePlatform extends web lifecycle semantics and augments them with
 * Capacitor native app lifecycle listeners when available.
 */
export class MobilePlatform extends WebPlatform {
  kind = 'mobile_web';
  #nativeDetach = null;

  isMobile() {
    return true;
  }

  bindLifecycle({ onPause, onResume }) {
    super.bindLifecycle({ onPause, onResume });

    // Purpose: bridge host pause/resume to Capacitor native app events.
    if (!window.Capacitor?.isNativePlatform?.()) {
      this.#nativeDetach = null;
      return;
    }

    const AppPlugin = window.Capacitor?.Plugins?.App;
    if (!AppPlugin?.addListener) {
      this.#nativeDetach = null;
      return;
    }

    const subscriptions = [];

    const add = (eventName, handler) => {
      const listener = AppPlugin.addListener(eventName, handler);
      subscriptions.push(listener);
    };

    add('appStateChange', ({ isActive }) => {
      if (isActive) {
        onResume?.();
      } else {
        onPause?.();
      }
    });

    add('pause', () => onPause?.());
    add('resume', () => onResume?.());

    this.#nativeDetach = () => {
      subscriptions.forEach((sub) => sub?.remove?.());
    };
  }

  unbindLifecycle() {
    this.#nativeDetach?.();
    this.#nativeDetach = null;
    super.unbindLifecycle();
  }
}
