import { APP_SAVE_VERSION, cloneAppState, createDefaultAppState, type AppState } from './AppState';

export interface SaveAdapter {
  loadRaw(): string | null;
  saveRaw(raw: string): void;
  clear(): void;
}

export interface SaveMigration {
  version: number;
  migrate(data: unknown): unknown;
}

export interface SaveServiceOptions {
  saveKey: string;
  adapter?: SaveAdapter;
  migrations?: SaveMigration[];
}

export class LocalStorageSaveAdapter implements SaveAdapter {
  public constructor(private readonly saveKey: string) {}

  public loadRaw(): string | null {
    return window.localStorage.getItem(this.saveKey);
  }

  public saveRaw(raw: string): void {
    window.localStorage.setItem(this.saveKey, raw);
  }

  public clear(): void {
    window.localStorage.removeItem(this.saveKey);
  }
}

export class SaveService {
  private readonly saveKey: string;
  private readonly adapter: SaveAdapter;
  private readonly migrations: SaveMigration[];

  public constructor({ saveKey, adapter, migrations = [] }: SaveServiceOptions) {
    this.saveKey = saveKey;
    this.adapter = adapter ?? new LocalStorageSaveAdapter(saveKey);
    this.migrations = [...migrations].sort((a, b) => a.version - b.version);
  }

  public load(): AppState {
    const raw = this.adapter.loadRaw();
    if (!raw) {
      return createDefaultAppState();
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      const migrated = this.applyMigrations(parsed);
      const normalized = this.normalize(migrated);
      normalized.meta.lastPlayedAt = Date.now();
      return normalized;
    } catch (error) {
      console.error(`Failed to load save from ${this.saveKey}. Falling back to defaults.`, error);
      return createDefaultAppState();
    }
  }

  public save(state: AppState): void {
    const snapshot = cloneAppState(state);
    snapshot.meta.saveVersion = APP_SAVE_VERSION;
    snapshot.meta.lastPlayedAt = Date.now();
    this.adapter.saveRaw(JSON.stringify(snapshot));
  }

  public clear(): void {
    this.adapter.clear();
  }

  public export(state: AppState): string {
    return window.btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  }

  public import(encoded: string): AppState {
    const decoded = decodeURIComponent(escape(window.atob(encoded)));
    const parsed = JSON.parse(decoded) as unknown;
    return this.normalize(this.applyMigrations(parsed));
  }

  private applyMigrations(input: unknown): unknown {
    let current = input;
    const inputVersion = this.readVersion(input);

    for (const migration of this.migrations) {
      if (migration.version <= inputVersion) {
        continue;
      }

      current = migration.migrate(current);
    }

    return current;
  }

  private readVersion(input: unknown): number {
    if (!input || typeof input !== 'object') {
      return 0;
    }

    const candidate = (input as Partial<AppState>).meta?.saveVersion;
    return typeof candidate === 'number' ? candidate : 0;
  }

  private normalize(input: unknown): AppState {
    const fallback = createDefaultAppState();

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return fallback;
    }

    const candidate = input as Partial<AppState>;
    const merged = cloneAppState(fallback);

    if (candidate.meta && typeof candidate.meta === 'object') {
      merged.meta = {
        ...merged.meta,
        ...candidate.meta,
        saveVersion: APP_SAVE_VERSION
      };
    }

    if (candidate.app && typeof candidate.app === 'object') {
      merged.app = {
        ...merged.app,
        ...candidate.app
      };
    }

    if (candidate.scenes && typeof candidate.scenes === 'object') {
      merged.scenes.button_idle = {
        ...merged.scenes.button_idle,
        ...(candidate.scenes.button_idle ?? {})
      };

      merged.scenes.marble = {
        ...merged.scenes.marble,
        ...(candidate.scenes.marble ?? {})
      };
    }

    return merged;
  }
}
