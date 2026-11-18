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

test('map dismissal preserves preexisting pause and focus loss, with a fresh inspection after restart', () => {
  const keyboard = new RangeKeyboard();
  const map = new RangeInspection();
  for (const reason of ['manual pause', 'blur', 'hidden']) {
    map.begin(reason === 'manual pause', keyboard);
    if (reason === 'blur') map.interrupt();
    assert.equal(map.end(keyboard, reason === 'hidden'), true, reason);
  }
  const range = new DrivingRange();
  range.restart();
  map.begin(range.paused, keyboard);
  assert.equal(map.end(keyboard), false);
});
