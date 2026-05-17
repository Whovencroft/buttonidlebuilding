/**
 * Reads and validates the known host roots used by the current runtime.
 */
export function getSceneHostRoots() {
  const sceneHost = document.getElementById('sceneHost');
  const buttonIdleSceneRoot = document.getElementById('buttonIdleSceneRoot');
  const marbleSceneRoot = document.getElementById('marbleSceneRoot');

  if (!(sceneHost instanceof HTMLElement)) {
    throw new Error('Expected #sceneHost to exist.');
  }

  if (!(buttonIdleSceneRoot instanceof HTMLElement)) {
    throw new Error('Expected #buttonIdleSceneRoot to exist.');
  }

  if (!(marbleSceneRoot instanceof HTMLElement)) {
    throw new Error('Expected #marbleSceneRoot to exist.');
  }

  return {
    sceneHost,
    buttonIdleSceneRoot,
    marbleSceneRoot
  };
}
