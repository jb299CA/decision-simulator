import test from 'node:test';
import assert from 'node:assert/strict';
import { PageLifecycle } from '../src/page-lifecycle.ts';

test('cached visits preserve resources and the existing user Pause choice', () => {
  for (const paused of [false, true]) {
    const state = { disposed: false, paused, held: true, restores: 0 };
    const lifecycle = new PageLifecycle({
      suspend() { state.held = false; },
      dispose() { state.disposed = true; },
      restore() { state.held = false; state.restores++; },
    });
    lifecycle.hide(true);
    assert.deepEqual(state, { disposed: false, paused, held: false, restores: 0 });
    lifecycle.show(true);
    assert.deepEqual(state, { disposed: false, paused, held: false, restores: 1 });
    lifecycle.show(true);
    assert.equal(state.restores, 1, 'duplicate show cannot restart audio or the run');
    lifecycle.hide(true); lifecycle.show(true);
    assert.equal(state.restores, 2, 'resources survive repeated cached visits');
    assert.equal(state.paused, paused);
  }
});

test('normal exit disposes once; initial load and disposed restoration do no work', () => {
  const events: string[] = [];
  const lifecycle = new PageLifecycle({
    suspend() { events.push('suspend'); },
    dispose() { events.push('dispose'); },
    restore() { events.push('restore'); },
  });
  lifecycle.show(false);
  assert.deepEqual(events, []);
  lifecycle.hide(false); lifecycle.hide(false); lifecycle.show(true);
  assert.deepEqual(events, ['suspend', 'dispose']);
});
