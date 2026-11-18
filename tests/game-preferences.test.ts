import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME_PREFERENCES_STORAGE_KEY, loadGamePreferences, saveGamePreferences, type GamePreferencesStorage } from '../src/game-preferences.ts';

const defaults = { muted: false, musicEnabled: true, reducedMotion: null };
function memory(initial: string | null = null): GamePreferencesStorage {
  const values = new Map<string, string>();
  if (initial !== null) values.set(GAME_PREFERENCES_STORAGE_KEY, initial);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

test('missing storage returns fresh defaults and browserless calls are safe', () => {
  assert.deepEqual(loadGamePreferences(() => memory()), defaults);
  const first = loadGamePreferences(() => null);
  first.muted = true;
  assert.deepEqual(loadGamePreferences(() => undefined), defaults);
  assert.deepEqual(loadGamePreferences(), defaults);
  assert.equal(saveGamePreferences(defaults), false);
});

test('versioned preferences round-trip every explicit motion choice', () => {
  const storage = memory();
  for (const reducedMotion of [null, false, true]) {
    const expected = { muted: true, musicEnabled: false, reducedMotion };
    assert.equal(saveGamePreferences(expected, () => storage), true);
    assert.deepEqual(loadGamePreferences(() => storage), expected);
    assert.equal(JSON.parse(storage.getItem(GAME_PREFERENCES_STORAGE_KEY)!).version, 1);
  }
});

test('partial or mistyped fields fall back independently and unknown fields are ignored', () => {
  const storage = memory(JSON.stringify({ version: 1, muted: true, musicEnabled: 'false', reducedMotion: 1, missionComplete: true }));
  assert.deepEqual(loadGamePreferences(() => storage), { ...defaults, muted: true });
  assert.deepEqual(loadGamePreferences(() => memory('{"version":1,"reducedMotion":false}')), { ...defaults, reducedMotion: false });
});

test('corrupt, unsupported and unversioned records do not affect defaults', () => {
  for (const raw of ['{', 'null', 'false', '[]', '42', '{"muted":true}', '{"version":2,"muted":true}', '{"version":"1","muted":true}']) {
    assert.deepEqual(loadGamePreferences(() => memory(raw)), defaults, raw);
  }
});

test('denied storage getters, reads and quota failures never interrupt the game', () => {
  const denied = () => { throw new Error('Access denied'); };
  assert.deepEqual(loadGamePreferences(denied), defaults);
  assert.equal(saveGamePreferences(defaults, denied), false);
  const unavailable: GamePreferencesStorage = { getItem: denied, setItem: denied };
  assert.deepEqual(loadGamePreferences(() => unavailable), defaults);
  assert.equal(saveGamePreferences(defaults, () => unavailable), false);
  assert.equal(saveGamePreferences(defaults, () => null), false);
});
