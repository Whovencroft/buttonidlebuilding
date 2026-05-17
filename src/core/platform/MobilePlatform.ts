import { WebPlatform } from './WebPlatform';

/**
 * This scaffold intentionally avoids importing Capacitor packages directly.
 * The repository can add the real plugin bridge later without rewriting callers.
 */
export class MobilePlatform extends WebPlatform {
  public readonly kind: 'android' | 'ios';

  public constructor(kind: 'android' | 'ios') {
    super();
    this.kind = kind;
  }

  public override isMobile(): boolean {
    return true;
  }

  public override async vibrate(pattern: number | number[] = 20): Promise<void> {
    await super.vibrate(pattern);
  }
}
