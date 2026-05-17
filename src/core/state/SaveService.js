import { createDefaultAppState } from './AppState.js';
import { normalizeHostedState } from './SaveSchema.js';
import { migrateSaveData } from './migration/index.js';

/**
 * SaveService owns persistence for the host and keeps localStorage access out
 * of scene modules and scene-local logic.
 */
export class SaveService {
  #saveKey;
  #config;

  constructor({ saveKey, config }) {
    this.#saveKey = saveKey;
    this.#config = config;
  }


  createFreshState() {
    return createDefaultAppState(this.#config);
  }

  load() {
    const defaults = createDefaultAppState(this.#config);

    try {
      const raw = localStorage.getItem(this.#saveKey);
      if (!raw) {
        return defaults;
      }

      const parsed = JSON.parse(raw);
      const migrated = migrateSaveData(parsed);
      return normalizeHostedState(this.#deepMerge(defaults, migrated));
    } catch (error) {
      console.error(error);
      return defaults;
    }
  }

  save(state) {
    const normalized = normalizeHostedState(state);
    localStorage.setItem(this.#saveKey, JSON.stringify(normalized));
    return normalized;
  }

  encode(state) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(normalizeHostedState(state)))));
  }

  decode(encoded) {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    const migrated = migrateSaveData(parsed);
    return normalizeHostedState(this.#deepMerge(createDefaultAppState(this.#config), migrated));
  }

  #deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        if (!targetValue || typeof targetValue !== 'object' || Array.isArray(targetValue)) {
          target[key] = {};
        }

        this.#deepMerge(target[key], sourceValue);
      } else {
        target[key] = sourceValue;
      }
    }

    return target;
  }
}
