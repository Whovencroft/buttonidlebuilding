import { parseSafeAreaInset, type PlatformService, type SafeAreaInsets } from './PlatformService';

export class WebPlatform implements PlatformService {
  public readonly kind = 'web' as const;
  private readonly pauseCallbacks = new Set<() => void>();
  private readonly resumeCallbacks = new Set<() => void>();
  private attached = false;

  public constructor() {
    this.attachLifecycle();
  }

  public isMobile(): boolean {
    return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
  }

  public onPause(callback: () => void): () => void {
    this.pauseCallbacks.add(callback);
    return () => {
      this.pauseCallbacks.delete(callback);
    };
  }

  public onResume(callback: () => void): () => void {
    this.resumeCallbacks.add(callback);
    return () => {
      this.resumeCallbacks.delete(callback);
    };
  }

  public getSafeAreaInsets(): SafeAreaInsets {
    const styles = getComputedStyle(document.documentElement);

    return {
      top: parseSafeAreaInset(styles.getPropertyValue('env(safe-area-inset-top)')),
      right: parseSafeAreaInset(styles.getPropertyValue('env(safe-area-inset-right)')),
      bottom: parseSafeAreaInset(styles.getPropertyValue('env(safe-area-inset-bottom)')),
      left: parseSafeAreaInset(styles.getPropertyValue('env(safe-area-inset-left)'))
    };
  }

  public async vibrate(pattern: number | number[] = 18): Promise<void> {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  }

  private attachLifecycle(): void {
    if (this.attached) {
      return;
    }

    this.attached = true;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        for (const callback of this.pauseCallbacks) {
          callback();
        }
      } else {
        for (const callback of this.resumeCallbacks) {
          callback();
        }
      }
    });

    window.addEventListener('pagehide', () => {
      for (const callback of this.pauseCallbacks) {
        callback();
      }
    });

    window.addEventListener('pageshow', () => {
      for (const callback of this.resumeCallbacks) {
        callback();
      }
    });
  }
}
