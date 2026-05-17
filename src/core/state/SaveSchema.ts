import { APP_SAVE_VERSION, cloneAppState, createDefaultAppState, type AppState } from './AppState';

export const SAVE_KEY = 'buttonLearnsToPressItselfSave';

export interface SaveSchema {
  meta: AppState['meta'];
  app: AppState['app'];
  scenes: AppState['scenes'];
}

export function createDefaultSaveSchema(): SaveSchema {
  return cloneAppState(createDefaultAppState());
}

export function isSaveSchemaCandidate(input: unknown): input is Partial<SaveSchema> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

export function normalizeSaveSchema(input: unknown): SaveSchema {
  const fallback = createDefaultSaveSchema();

  if (!isSaveSchemaCandidate(input)) {
    return fallback;
  }

  const candidate = input as Partial<SaveSchema>;
  const normalized = cloneAppState(fallback);

  if (candidate.meta && typeof candidate.meta === 'object') {
    normalized.meta = {
      ...normalized.meta,
      ...candidate.meta,
      saveVersion: APP_SAVE_VERSION
    };
  }

  if (candidate.app && typeof candidate.app === 'object') {
    normalized.app = {
      ...normalized.app,
      ...candidate.app
    };
  }

  if (candidate.scenes && typeof candidate.scenes === 'object') {
    normalized.scenes.button_idle = {
      ...normalized.scenes.button_idle,
      ...(candidate.scenes.button_idle ?? {})
    };

    normalized.scenes.marble = {
      ...normalized.scenes.marble,
      ...(candidate.scenes.marble ?? {})
    };
  }

  return normalized;
}
