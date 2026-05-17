import type { SaveMigration } from '../SaveService';
import { normalizeSaveSchema } from '../SaveSchema';

export const v1Migration: SaveMigration = {
  version: 1,
  migrate(data: unknown): unknown {
    const normalized = normalizeSaveSchema(data);
    normalized.meta.saveVersion = 1;
    return normalized;
  }
};
