import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackFocus } from '../src/playback-focus.ts';
import { PageLifecycle } from '../src/page-lifecycle.ts';
import { DrivingRange } from '../src/range.ts';
import { drivingInput, RangeInspection, RangeKeyboard } from '../src/input.ts';

function exercise() {
  const range = new DrivingRange();
  const keyboard = new RangeKeyboard();
  const state = { active: true, hidden: false, blocked: false, audioPaused: false, activations: 0, now: 0, previous: 0 };
  const focus = new PlaybackFocus({
    state: () => ({ ...state, paused: range.paused }),
    pause() { keyboard.clear(); range.paused = true; state.audioPaused = true; state.previous = state.now; },
    resume() { keyboard.clear(); range.paused = false; state.audioPaused = false; state.previous = state.now; },
    activateSound() { state.activations++; },
  });
  const frame = (now: number) => {
    state.now = now;
    const delta = (now - state.previous) / 1000;
    state.previous = now;
    if (!state.hidden) range.tick(delta, drivingInput(keyboard, new Set()));
  };
  return { range, keyboard, state, focus, frame };
}

test('away pause clears driving/fire and resumes only from a new play gesture', () => {
  const { range, keyboard, state, focus, frame } = exercise();
  keyboard.down('KeyW'); keyboard.down('KeyF'); frame(50);
  const time = range.time;
  focus.suspend(); state.hidden = true; focus.suspend(); frame(30_000);
  assert.equal(range.time, time);
  assert.equal(range.paused, true);
  assert.equal(state.audioPaused, true);
  assert.deepEqual(drivingInput(keyboard, new Set()), { throttle: 0, steer: 0, aim: 0, fire: false, brake: false });
  assert.equal(focus.pausedWhileAway, true, 'duplicate notifications retain away ownership');
  assert.equal(focus.resumeFromGesture(), false, 'hidden input cannot resume');
  state.hidden = false; frame(40_000);
  assert.equal(range.time, time, 'returning visibility does not advance the exercise');
  assert.equal(state.activations, 0);
  assert.equal(focus.resumeFromGesture(), true);
  assert.equal(state.audioPaused, false);
  assert.equal(state.activations, 1, 'audio activation belongs to the fresh gesture');
  assert.equal(drivingInput(keyboard, new Set()).fire, false, 'resume never fires or replays a held trigger');
  frame(40_050);
  assert.ok(range.time > time && range.time < time + .1, 'away wall time is excluded');
  assert.equal(focus.resumeFromGesture(), false, 'one gesture cannot restart audio repeatedly');
});

test('manual pause, inspections, evidence and terminal screens retain pause ownership', () => {
  const { range, keyboard, state, focus } = exercise();
  range.paused = true;
  focus.takePauseOwnership(); focus.suspend();
  assert.equal(focus.resumeFromGesture(), false);
  range.paused = false;
  const inspection = new RangeInspection();
  inspection.begin(range.paused, keyboard); range.paused = true;
  state.blocked = true; inspection.interrupt(); focus.suspend();
  assert.equal(focus.resumeFromGesture(), false);
  range.paused = inspection.end(keyboard); state.blocked = false;
  assert.equal(focus.resumeFromGesture(), false, 'closing an interrupted inspection leaves explicit Resume in control');
  range.paused = false; focus.suspend();
  state.blocked = true;
  assert.equal(focus.resumeFromGesture(), false, 'opening any dialog blocks return gestures');
  focus.takePauseOwnership(); state.blocked = false;
  assert.equal(focus.resumeFromGesture(), false, 'closing that dialog cannot revive old away ownership');
  assert.equal(state.activations, 0);
});

test('fresh movement resumes and keeps the same held W input driving; fire and repeats do not wake play', () => {
  const { range, keyboard, state, focus, frame } = exercise();
  keyboard.down('KeyW'); keyboard.down('KeyF');
  focus.suspend();
  assert.equal(focus.resumeFromMovement('KeyW', true), false, 'old held key repeats cannot wake play');
  assert.equal(focus.resumeFromMovement('KeyF'), false, 'fire cannot be a return gesture');
  assert.equal(focus.resumeFromMovement('KeyQ'), false, 'aim cannot be a return gesture');
  assert.equal(keyboard.keys.size, 0, 'old throttle and trigger stay cleared');
  assert.equal(focus.resumeFromMovement('KeyW'), true);
  // main.ts continues routing this same fresh event through RangeKeyboard.
  keyboard.down('KeyW');
  assert.equal(drivingInput(keyboard, new Set()).throttle, 1);
  frame(50); frame(100); frame(150);
  assert.ok(range.speed > 0, 'one fresh W press immediately accelerates and stays held');
  assert.equal(drivingInput(keyboard, new Set()).fire, false);
  keyboard.up('KeyW');
  assert.equal(drivingInput(keyboard, new Set()).throttle, 0, 'release coasts normally');
  range.paused = true; focus.takePauseOwnership(); focus.suspend();
  assert.equal(focus.resumeFromMovement('ArrowUp'), false, 'movement preserves manual pause');
  range.paused = false; focus.suspend(); state.blocked = true;
  assert.equal(focus.resumeFromMovement('Space'), false, 'dialogs retain pause ownership');
});

test('cached page restoration preserves away resume, resources and paused time', () => {
  const { range, state, focus } = exercise();
  let disposed = 0;
  const lifecycle = new PageLifecycle({ suspend: () => focus.suspend(), restorePaused: () => focus.suspend(), dispose: () => disposed++ });
  lifecycle.hide(true); lifecycle.show(true);
  assert.equal(range.paused, true);
  assert.equal(state.activations, 0);
  assert.equal(disposed, 0);
  assert.equal(focus.resumeFromGesture(), true);
  lifecycle.hide(true); lifecycle.show(true);
  assert.equal(focus.resumeFromGesture(), true, 'repeat visits keep the same usable exercise');
  state.active = false; focus.suspend();
  assert.equal(focus.pausedWhileAway, false, 'menu cannot carry a resume token to a new mission');
});
