export type PlatformKind = 'web' | 'android' | 'ios';

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlatformService {
  readonly kind: PlatformKind;
  isMobile(): boolean;
  onPause(callback: () => void): () => void;
  onResume(callback: () => void): () => void;
  getSafeAreaInsets(): SafeAreaInsets;
  vibrate(pattern?: number | number[]): Promise<void>;
}

export function isPlatformKind(value: unknown): value is PlatformKind {
  return value === 'web' || value === 'android' || value === 'ios';
}

export function parseSafeAreaInset(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}
