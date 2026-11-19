import test from 'node:test';
import assert from 'node:assert/strict';
import { RangeInspection, RangeKeyboard, drivingInput } from '../src/input.ts';
import { DrivingRange } from '../src/range.ts';

test('map inspection freezes the run and discards queued driving and fire before resuming', () => {
  const range = new DrivingRange();
  const keyboard = new RangeKeyboard();
  const map = new RangeInspection();
  keyboard.down('KeyW');
  range.tick(.1, drivingInput(keyboard, new Set()));
  const time = range.time;
  const position = { ...range.position };
  keyboard.down('KeyF'); keyboard.up('KeyF');
  map.begin(range.paused, keyboard);
  range.paused = true;
  range.tick(3, drivingInput(keyboard, new Set()));
  assert.equal(range.time, time);
  assert.deepEqual(range.position, position);
  assert.equal(range.shotsFired, 0);
  range.paused = map.end(keyboard);
  assert.equal(range.paused, false);
  assert.equal(drivingInput(keyboard, new Set()).fire, false);
  assert.equal(drivingInput(keyboard, new Set()).throttle, 0);
  range.tick(.1, drivingInput(keyboard, new Set()));
  assert.ok(range.time > time);
  assert.equal(range.shotsFired, 0);
});

test('map dismissal restores preexisting manual Pause and a restarted run stays playable', () => {
  const keyboard = new RangeKeyboard();
  const map = new RangeInspection();
  const range = new DrivingRange();
  for (const manuallyPaused of [false, true]) {
    range.paused = manuallyPaused;
    map.begin(range.paused, keyboard); range.paused = true;
    range.tick(10, drivingInput(keyboard, new Set()));
    assert.equal(range.time, 0, 'inspection remains paused throughout the visit');
    range.paused = map.end(keyboard);
    assert.equal(range.paused, manuallyPaused);
  }
  range.restart();
  map.begin(range.paused, keyboard);
  assert.equal(map.end(keyboard), false);
});
