import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStick, TouchStick, withTouchStick } from '../src/touch-stick.ts';
import { drivingInput, RangeKeyboard } from '../src/input.ts';
import { DrivingRange } from '../src/range.ts';

test('resting thumb is neutral and movement grows proportionally after the radial deadzone', () => {
  assert.deepEqual(normalizeStick(3, -4, 50), { x: 0, y: 0 });
  const half = normalizeStick(0, -28.5, 50);
  assert.ok(Math.abs(half.y + .5) < .00001);
  assert.deepEqual(normalizeStick(0, -100, 50), { x: 0, y: -1 });
  const diagonal = normalizeStick(100, 100, 50);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < .00001);
  assert.deepEqual(normalizeStick(NaN, 1, 50), { x: 0, y: 0 });
  assert.deepEqual(normalizeStick(1, 1, 0), { x: 0, y: 0 });
});

test('one pointer owns the stick through moves and unrelated releases', () => {
  const stick = new TouchStick();
  assert.equal(stick.begin(10, 100, 100, 50, 100, 50), true);
  assert.deepEqual(stick.input, { throttle: 1, steer: 0 });
  assert.equal(stick.begin(11, 100, 100, 50, 150, 100), false);
  assert.equal(stick.move(11, 100, 150), false);
  assert.equal(stick.release(11), false);
  assert.deepEqual(stick.input, { throttle: 1, steer: 0 });
  stick.move(10, 150, 150);
  assert.ok(stick.input.throttle < 0 && stick.input.steer < 0, 'down reverses and right steers right');
  assert.equal(stick.release(10), true);
  assert.deepEqual(stick.input, { throttle: 0, steer: 0 });
  assert.equal(stick.pointerId, null);
});

test('spring release and interruption discard movement and old pointer ownership', () => {
  for (const reason of ['pointerup', 'pointercancel', 'lost capture', 'pause', 'blur', 'hidden', 'inspection', 'restart', 'view change']) {
    const stick = new TouchStick();
    stick.begin(1, 50, 50, 40, 10, 10);
    if (['pointerup', 'pointercancel', 'lost capture'].includes(reason)) stick.release(1); else stick.clear();
    assert.deepEqual(stick.input, { throttle: 0, steer: 0 }, reason);
    assert.equal(stick.move(1, 0, 0), false, reason);
    assert.equal(stick.begin(2, 50, 50, 40, 50, 50), true, reason);
  }
});

test('steering and a separate fire thumb work together; releasing either leaves the other input alone', () => {
  const stick = new TouchStick(); const keyboard = new RangeKeyboard();
  stick.begin(1, 50, 50, 40, 30, 10);
  const controls = withTouchStick(drivingInput(keyboard, new Set(['fire']), -.4), stick);
  assert.ok(controls.throttle > 0 && controls.steer > 0);
  assert.equal(controls.fire, true); assert.equal(controls.aim, -.4);
  assert.equal(stick.release(2), false);
  assert.ok(withTouchStick(drivingInput(keyboard, new Set()), stick).throttle > 0);
  stick.release(1);
  assert.equal(withTouchStick(drivingInput(keyboard, new Set(['fire'])), stick).fire, true);
  keyboard.down('KeyS'); keyboard.down('KeyD');
  stick.begin(3, 50, 50, 40, 10, 10);
  const physical = withTouchStick(drivingInput(keyboard, new Set()), stick);
  assert.equal(physical.throttle, -1); assert.equal(physical.steer, -1);
});

test('proportional stick movement reaches the existing vehicle model with forward, reverse and steering signs intact', () => {
  const keyboard = new RangeKeyboard();
  const half = new TouchStick(); const full = new TouchStick();
  half.begin(1, 50, 50, 40, 50, 27.2);
  full.begin(2, 50, 50, 40, 50, 10);
  const slow = new DrivingRange(); const fast = new DrivingRange();
  // Heavy-vehicle acceleration is shared initially; allow the half-stick cap to settle.
  for (let frame = 0; frame < 80; frame++) {
    slow.tick(.1, withTouchStick(drivingInput(keyboard, new Set()), half));
    fast.tick(.1, withTouchStick(drivingInput(keyboard, new Set()), full));
  }
  assert.ok(slow.speed > 0 && slow.speed < fast.speed);
  const reverse = new TouchStick(); const backing = new DrivingRange();
  reverse.begin(3, 50, 50, 40, 30, 90);
  backing.tick(.1, withTouchStick(drivingInput(keyboard, new Set(['fire'])), reverse));
  assert.ok(backing.speed < 0, 'downward movement backs up');
  assert.ok(backing.heading < 0, 'left steering reverses its vehicle turning direction while backing');
  assert.equal(backing.shotsFired, 1, 'fire remains independent during reverse and steering');
});


test('accelerator and a horizontal stick compose, with independent pointer release and reverse priority', () => {
  const keyboard = new RangeKeyboard(); const stick = new TouchStick();
  const held = new Set(['accelerate', 'fire']);
  stick.begin(1, 50, 50, 40, 10, 50);
  let controls = withTouchStick(drivingInput(keyboard, held), stick);
  assert.equal(controls.throttle, 1); assert.equal(controls.steer, 1); assert.equal(controls.fire, true);
  assert.equal(stick.release(2), false, 'accelerator pointer release cannot release the stick');
  held.delete('accelerate');
  controls = withTouchStick(drivingInput(keyboard, held), stick);
  assert.equal(controls.throttle, 0); assert.equal(controls.steer, 1); assert.equal(controls.fire, true);
  held.add('accelerate'); stick.release(1);
  controls = withTouchStick(drivingInput(keyboard, held), stick);
  assert.equal(controls.throttle, 1); assert.equal(controls.steer, 0);
  stick.begin(3, 50, 50, 40, 50, 90);
  keyboard.down('Space');
  controls = withTouchStick(drivingInput(keyboard, held, 0, true), stick);
  assert.equal(controls.throttle, -1, 'backward stick wins over accelerator, Space and cruise');
  stick.clear(); keyboard.clear(); held.clear();
  controls = withTouchStick(drivingInput(keyboard, held), stick);
  assert.equal(controls.throttle, 0); assert.equal(controls.steer, 0); assert.equal(controls.fire, false);
});


test('B overrides forward and reverse thumb throttle while touch steering and fire remain independent', () => {
  const keyboard = new RangeKeyboard(); const stick = new TouchStick();
  keyboard.down('KeyB'); keyboard.down('Space');
  for (const y of [10, 90]) {
    stick.begin(1, 50, 50, 40, 30, y);
    const controls = withTouchStick(drivingInput(keyboard, new Set(['accelerate', 'fire']), .3, true), stick);
    assert.equal(controls.throttle, 0); assert.equal(controls.brake, true);
    assert.ok(controls.steer > 0); assert.equal(controls.fire, true); assert.equal(controls.aim, .3);
    stick.clear();
  }
  keyboard.up('Space'); keyboard.up('KeyB');
  stick.begin(2, 50, 50, 40, 50, 10);
  assert.equal(withTouchStick(drivingInput(keyboard, new Set()), stick).throttle, 1, 'release restores an actively held stick');
  keyboard.down('KeyB'); keyboard.clear(); stick.clear();
  assert.deepEqual(withTouchStick(drivingInput(keyboard, new Set()), stick), { throttle: 0, steer: 0, aim: 0, fire: false, brake: false });
});
