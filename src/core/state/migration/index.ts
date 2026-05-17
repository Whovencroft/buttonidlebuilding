import type { SaveMigration } from '../SaveService';
import { v1Migration } from './v1';

export const SAVE_MIGRATIONS: SaveMigration[] = [
  v1Migration
];

export { v1Migration };
