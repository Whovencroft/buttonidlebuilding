export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function readSafeAreaInsets(root: HTMLElement = document.documentElement): SafeAreaInsets {
  const styles = getComputedStyle(root);

  return {
    top: readInset(styles.getPropertyValue('--safe-area-top')),
    right: readInset(styles.getPropertyValue('--safe-area-right')),
    bottom: readInset(styles.getPropertyValue('--safe-area-bottom')),
    left: readInset(styles.getPropertyValue('--safe-area-left'))
  };
}

export function applySafeAreaVars(root: HTMLElement = document.documentElement): SafeAreaInsets {
  const insets = readSafeAreaInsets(root);

  root.style.setProperty('--resolved-safe-area-top', `${insets.top}px`);
  root.style.setProperty('--resolved-safe-area-right', `${insets.right}px`);
  root.style.setProperty('--resolved-safe-area-bottom', `${insets.bottom}px`);
  root.style.setProperty('--resolved-safe-area-left', `${insets.left}px`);

  return insets;
}

function readInset(rawValue: string): number {
  const parsed = Number.parseFloat(rawValue.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
