import { WebPlatform } from './WebPlatform.js';
import { MobilePlatform } from './MobilePlatform.js';

/**
 * PlatformService selects and binds the active platform adapter.
 */
export class PlatformService {
  #platform;

  constructor() {
    const touchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    // Purpose: prefer mobile adapter for Capacitor-native contexts and touch-heavy devices.
    const capacitorNative = !!window.Capacitor?.isNativePlatform?.();
    this.#platform = (touchCapable || capacitorNative) ? new MobilePlatform() : new WebPlatform();
  }

  getKind() {
    return this.#platform.kind;
  }

  isMobile() {
    return this.#platform.isMobile();
  }

  bindLifecycle(handlers) {
    this.#platform.bindLifecycle(handlers);
  }

  unbindLifecycle() {
    this.#platform.unbindLifecycle();
  }
}
