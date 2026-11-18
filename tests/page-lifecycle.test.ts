import test from 'node:test';
import assert from 'node:assert/strict';
import { PageLifecycle } from '../src/page-lifecycle.ts';

test('back/forward cache preserves resources and returns paused with cleared input', () => {
  const state = { disposed: false, paused: false, held: true, restores: 0 };
  const lifecycle = new PageLifecycle({
    suspend() { state.paused = true; state.held = false; },
    dispose() { state.disposed = true; },
    restorePaused() { state.paused = true; state.held = false; state.restores++; },
  });
  lifecycle.hide(true);
  assert.deepEqual(state, { disposed: false, paused: true, held: false, restores: 0 });
  lifecycle.show(true);
  assert.deepEqual(state, { disposed: false, paused: true, held: false, restores: 1 });
  lifecycle.show(true);
  assert.equal(state.restores, 1, 'duplicate show cannot restart audio or the run');
  lifecycle.hide(true); lifecycle.show(true);
  assert.equal(state.restores, 2, 'resources survive repeated cached visits');
});

test('normal exit disposes once; initial load and disposed restoration do no work', () => {
  const events: string[] = [];
  const lifecycle = new PageLifecycle({
    suspend() { events.push('suspend'); },
    dispose() { events.push('dispose'); },
    restorePaused() { events.push('restore paused'); },
  });
  lifecycle.show(false);
  assert.deepEqual(events, []);
  lifecycle.hide(false); lifecycle.hide(false); lifecycle.show(true);
  assert.deepEqual(events, ['suspend', 'dispose']);
});
