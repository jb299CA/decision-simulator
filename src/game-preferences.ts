/** Local presentation preferences only; no simulation or mission progress is stored. */
export interface GamePreferences {
  muted: boolean;
  musicEnabled: boolean;
  /** null follows the operating system until the player explicitly chooses. */
  reducedMotion: boolean | null;
}

export type GamePreferencesStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type GamePreferencesStorageGetter = () => GamePreferencesStorage | null | undefined;

export const GAME_PREFERENCES_STORAGE_KEY = 'decision-simulator.preferences';
const VERSION = 1;
const defaults = (): GamePreferences => ({ muted: false, musicEnabled: true, reducedMotion: null });

// Access is deliberately deferred: even the localStorage property getter can throw.
const browserStorage: GamePreferencesStorageGetter = () => typeof window === 'undefined' ? null : window.localStorage;

function normalize(value: Record<string, unknown>): GamePreferences {
  return {
    muted: typeof value.muted === 'boolean' ? value.muted : false,
    musicEnabled: typeof value.musicEnabled === 'boolean' ? value.musicEnabled : true,
    reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : null,
  };
}

export function loadGamePreferences(storageGetter: GamePreferencesStorageGetter = browserStorage): GamePreferences {
  try {
    const raw = storageGetter()?.getItem(GAME_PREFERENCES_STORAGE_KEY);
    if (!raw) return defaults();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults();
    const record = value as Record<string, unknown>;
    if (record.version !== VERSION) return defaults();
    return normalize(record);
  } catch {
    return defaults();
  }
}

export function saveGamePreferences(preferences: GamePreferences, storageGetter: GamePreferencesStorageGetter = browserStorage): boolean {
  try {
    const storage = storageGetter();
    if (!storage) return false;
    storage.setItem(GAME_PREFERENCES_STORAGE_KEY, JSON.stringify({ version: VERSION, ...normalize(preferences as unknown as Record<string, unknown>) }));
    return true;
  } catch {
    return false;
  }
}
