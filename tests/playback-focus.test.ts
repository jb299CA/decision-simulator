import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackFocus } from '../src/playback-focus.ts';
import { PageLifecycle } from '../src/page-lifecycle.ts';
import { DrivingRange } from '../src/range.ts';
import { Simulation } from '../src/simulation.ts';
import { drivingInput, RangeInspection, RangeKeyboard } from '../src/input.ts';

function exercise() {
  const range = new DrivingRange();
  const keyboard = new RangeKeyboard();
  const pointers = new Set<string>();
  const state = { hidden: false, audioPaused: false, now: 0, previous: 0 };
  const focus = new PlaybackFocus({
    clearInputs() { keyboard.clear(); pointers.clear(); },
    resetFrame() { state.previous = state.now; },
    syncAudio() { state.audioPaused = state.hidden || range.paused; },
  });
  const frame = (now: number) => {
    state.now = now;
    const delta = Math.max(0, Math.min((now - state.previous) / 1000, .15));
    state.previous = now;
    if (!state.hidden) range.tick(delta, drivingInput(keyboard, pointers));
  };
  const visibility = (hidden: boolean, now: number) => {
    state.hidden = hidden; state.now = now; focus.visibilityChanged();
  };
  return { range, keyboard, pointers, state, focus, frame, visibility };
}

test('clicking away clears keyboard, queued fire and held pointers while a visible run continues', () => {
  const { range, keyboard, pointers, state, focus, frame } = exercise();
  keyboard.down('KeyW'); keyboard.down('KeyF'); pointers.add('fire'); frame(50);
  keyboard.up('KeyF'); keyboard.down('KeyF'); // a fresh queued trigger must also be cleared
  const time = range.time; const shots = range.shotsFired;
  focus.blur(); focus.blur();
  assert.equal(range.paused, false);
  assert.equal(state.audioPaused, false);
  assert.deepEqual(drivingInput(keyboard, pointers), { throttle: 0, steer: 0, aim: 0, fire: false, brake: false });
  frame(100); frame(150);
  assert.ok(range.time > time, 'visible but unfocused gameplay keeps advancing');
  assert.equal(range.shotsFired, shots, 'focus loss cannot leave a trigger firing');
  keyboard.down('KeyW'); frame(200);
  assert.ok(range.speed > 0, 'fresh input works directly without a return gesture');
});

test('hidden suspension preserves playback state and excludes away time on automatic return', () => {
  const { range, keyboard, pointers, state, focus, frame, visibility } = exercise();
  keyboard.down('KeyW'); pointers.add('fire'); frame(50);
  const time = range.time;
  visibility(true, 100); frame(30_000);
  assert.equal(range.time, time);
  assert.equal(range.paused, false, 'browser suspension never sets manual Pause');
  assert.equal(state.audioPaused, true);
  visibility(false, 40_000);
  assert.equal(state.audioPaused, false, 'already allowed audio is reconciled automatically');
  assert.equal(range.time, time);
  frame(40_050);
  assert.ok(range.time > time && range.time < time + .1, 'only the fresh frame interval advances');
  focus.blur();
  assert.equal(range.paused, false);
  assert.equal(drivingInput(keyboard, pointers).fire, false);
});

test('manual Pause survives blur, repeated visibility changes and cached restoration', () => {
  const { range, state, focus, frame, visibility } = exercise();
  frame(50); range.paused = true;
  const time = range.time;
  let disposals = 0;
  const lifecycle = new PageLifecycle({
    suspend: () => focus.visibilityChanged(),
    restore: () => focus.visibilityChanged(),
    dispose: () => disposals++,
  });
  focus.blur(); visibility(true, 100); lifecycle.hide(true);
  visibility(false, 50_000); lifecycle.show(true); frame(50_050);
  assert.equal(range.paused, true);
  assert.equal(range.time, time);
  assert.equal(state.audioPaused, true);
  assert.equal(disposals, 0);
  // A deliberate Resume is the only state change, outside the focus controller.
  range.paused = false; frame(50_100);
  assert.ok(range.time > time && range.time < time + .1);
});

test('inspection remains paused while open and restores the preceding manual state after attention changes', () => {
  for (const manualPause of [false, true]) {
    const { range, keyboard, state, focus, frame, visibility } = exercise();
    range.paused = manualPause;
    const inspection = new RangeInspection();
    inspection.begin(range.paused, keyboard); range.paused = true;
    focus.blur(); visibility(true, 100); frame(30_000);
    assert.equal(range.paused, true);
    visibility(false, 40_000); frame(40_050);
    assert.equal(range.paused, true, 'return cannot dismiss a deliberate inspection');
    range.paused = inspection.end(keyboard);
    focus.visibilityChanged();
    assert.equal(range.paused, manualPause);
    assert.equal(state.audioPaused, manualPause);
  }
});

test('guided manual Pause is also independent of browser attention', () => {
  const sim = new Simulation(); sim.begin();
  const keyboard = new RangeKeyboard();
  const focus = new PlaybackFocus({ clearInputs: () => keyboard.clear(), resetFrame() {}, syncAudio() {} });
  sim.tick(.1); const playingTime = sim.time;
  focus.blur(); sim.tick(.1);
  assert.ok(sim.time > playingTime);
  sim.paused = true; const pausedTime = sim.time;
  focus.blur(); focus.visibilityChanged(); sim.tick(.1);
  assert.equal(sim.paused, true);
  assert.equal(sim.time, pausedTime);
});
