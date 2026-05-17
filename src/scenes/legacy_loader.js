const loadedScripts = new Map();

/**
 * Loads a legacy browser script exactly once so module wrappers can reuse
 * existing runtime behavior during the scene migration milestone.
 */
export function loadLegacyScriptOnce(scriptPath) {
  if (loadedScripts.has(scriptPath)) {
    return loadedScripts.get(scriptPath);
  }

  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptPath;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${scriptPath}`));
    document.body.appendChild(script);
  });

  loadedScripts.set(scriptPath, pending);
  return pending;
}
