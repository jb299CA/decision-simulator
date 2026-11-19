import test from 'node:test';
import assert from 'node:assert/strict';
import { drivingInput, gameKeyCode, permitsGameKeys, rangeViewForKey, RangeInspection, RangeKeyboard } from '../src/input.ts';
import { DrivingRange } from '../src/range.ts';

test('game keyboard routes through camera buttons and aim slider in every view', () => {
  for (const view of ['hatch', 'inside', 'chase', 'top']) {
    for (const target of [{ tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'range' }, { tagName: 'MAIN' }]) {
      assert.equal(permitsGameKeys(target, {}), true, `${view}: ${target.tagName}`);
      const input = new RangeKeyboard();
      input.down('KeyW'); input.down('KeyA'); input.down('KeyF');
      const controls = drivingInput(input, new Set());
      assert.deepEqual(controls, { throttle: 1, steer: 1, aim: 0, fire: true, brake: false });
      const range = new DrivingRange(); range.tick(.1, controls);
      assert.ok(range.speed > 0 && range.heading > 0); assert.equal(range.shotsFired, 1);
      input.up('KeyW'); input.up('KeyA'); input.up('KeyF');
      assert.equal(input.keys.size, 0); assert.equal(input.consumeFire(), false);
    }
  }
});

test('text editing, select menus and browser modifier shortcuts retain keyboard ownership', () => {
  for (const target of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT', type: 'email' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { editable: true }]) assert.equal(permitsGameKeys(target, {}), false);
  for (const modifiers of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) assert.equal(permitsGameKeys({ tagName: 'BUTTON' }, modifiers), false);
});

test('ramp command recognizes physical and virtual R while respecting game focus gates', () => {
  for (const event of [{ code: 'KeyR', key: 'r' }, { key: 'r' }, { code: 'Unidentified', key: 'R' }]) {
    assert.equal(gameKeyCode(event), 'KeyR');
  }
  assert.equal(permitsGameKeys({ tagName: 'BUTTON' }, {}), true);
  assert.equal(permitsGameKeys({ tagName: 'INPUT', type: 'text' }, {}), false);
  assert.equal(permitsGameKeys({ tagName: 'BUTTON' }, {}, true), false);
  assert.equal(permitsGameKeys({ tagName: 'BUTTON' }, { ctrlKey: true }), false);
});

test('committed ramp unload cannot reuse held drive or a queued fire tap', () => {
  const input = new RangeKeyboard();
  const range = new DrivingRange();
  input.down('KeyW'); input.down('KeyF'); input.up('KeyF');
  assert.equal(range.dropRamp(), true, 'outside-zone command commits the unload');
  input.clear();
  const shots = range.shotsFired;
  const position = { ...range.position };
  range.tick(.1, drivingInput(input, new Set()));
  assert.deepEqual(range.position, position);
  assert.equal(range.shotsFired, shots);
  assert.equal(range.dismounting, true);
  assert.equal(range.debrief, null, 'debrief must wait for the squad animation');
});

test('a quick fire tap survives release until one tick and a hold remains continuous', () => {
  const input = new RangeKeyboard(); input.down('KeyF'); input.up('KeyF');
  assert.equal(input.consumeFire(), true); assert.equal(input.consumeFire(), false);
  input.down('KeyF'); assert.equal(input.consumeFire(), true); assert.equal(input.consumeFire(), true);
  input.up('KeyF'); assert.equal(input.consumeFire(), false);
  input.pulseFire(); assert.equal(input.consumeFire(), true); assert.equal(input.consumeFire(), false);
});

test('pause, blur, cancellation and restart can discard all held and pending input', () => {
  const input = new RangeKeyboard(); input.down('KeyW'); input.down('KeyB'); input.down('KeyF'); input.up('KeyF');
  input.clear(); assert.equal(drivingInput(input, new Set()).brake, false); assert.equal(input.keys.size, 0); assert.equal(input.consumeFire(true), true); assert.equal(input.consumeFire(), false);
});

test('quick tap reaches a simulation tick once, while pointer drive and aim combine with keys', () => {
  const input = new RangeKeyboard(); const range = new DrivingRange();
  input.down('KeyF'); input.up('KeyF'); input.down('KeyW');
  range.tick(.1, drivingInput(input, new Set(['left']), -.5));
  assert.equal(range.shotsFired, 1); assert.ok(range.speed > 0 && range.heading > 0 && range.aimYaw < 0);
  range.tick(.1, drivingInput(input, new Set())); assert.equal(range.shotsFired, 1);
  input.clear(); assert.deepEqual(drivingInput(input, new Set()), { throttle: 0, steer: 0, aim: 0, fire: false, brake: false });
});

test('virtual/native keyboards without physical code retain F tap, steering and view shortcuts', () => {
  for (const event of [{ key: 'f' }, { key: 'F', code: 'Unidentified' }, { key: 'f', code: 'f' }, { key: 'f', code: 'KeyF' }]) {
    const input = new RangeKeyboard(); const range = new DrivingRange();
    input.down(gameKeyCode(event)); input.up(gameKeyCode(event));
    range.tick(.1, drivingInput(input, new Set())); assert.equal(range.shotsFired, 1);
    range.tick(.1, drivingInput(input, new Set())); assert.equal(range.shotsFired, 1);
  }
  assert.equal(gameKeyCode({ key: 'w' }), 'KeyW'); assert.equal(gameKeyCode({ key: 'ArrowLeft' }), 'ArrowLeft');
  assert.equal(gameKeyCode({ key: '3' }), 'Digit3'); assert.equal(gameKeyCode({ key: ' ' }), 'Space');
});

test('all four direct camera keys route consistently for physical and virtual keyboards', () => {
  const views = ['hatch', 'inside', 'chase', 'top'];
  views.forEach((view, index) => {
    const key = String(index + 1);
    assert.equal(rangeViewForKey(gameKeyCode({ key })), view);
    assert.equal(rangeViewForKey(gameKeyCode({ code: `Digit${key}` })), view);
  });
  assert.equal(rangeViewForKey('Digit5'), undefined);
  assert.equal(rangeViewForKey(gameKeyCode({ key: '5' })), undefined);
  assert.equal(rangeViewForKey('Digit6'), undefined);
  assert.equal(rangeViewForKey('KeyF'), undefined);
});

test('MFoCS inspection owns focused buttons and cannot leak pending fire or drive on close', () => {
  const keyboard = new RangeKeyboard();
  const inspection = new RangeInspection();
  keyboard.down('KeyW'); keyboard.down('KeyB'); keyboard.down('KeyF'); keyboard.up('KeyF');
  inspection.begin(false, keyboard);
  assert.equal(inspection.open, true);
  assert.equal(permitsGameKeys({ tagName: 'BUTTON' }, {}, inspection.open), false);
  assert.deepEqual(drivingInput(keyboard, new Set()), { throttle: 0, steer: 0, aim: 0, fire: false, brake: false });
  // Even a queued request created before focus cleanup cannot survive closing inspection.
  keyboard.down('KeyF');
  assert.equal(inspection.end(keyboard), false);
  assert.equal(inspection.open, false);
  assert.equal(keyboard.consumeFire(), false);
  assert.equal(permitsGameKeys({ tagName: 'BUTTON' }, {}, inspection.open), true);
});

test('closing inspection restores the preceding manual pause and clears fresh held input', () => {
  const keyboard = new RangeKeyboard();
  const inspection = new RangeInspection();
  for (const manuallyPaused of [false, true, false]) {
    inspection.begin(manuallyPaused, keyboard);
    inspection.begin(!manuallyPaused, keyboard); // duplicate open cannot overwrite ownership
    keyboard.down('KeyW'); keyboard.down('KeyF');
    assert.equal(inspection.end(keyboard), manuallyPaused);
    assert.equal(inspection.open, false);
    assert.deepEqual(drivingInput(keyboard, new Set()), { throttle: 0, steer: 0, aim: 0, fire: false, brake: false });
  }
});


test('Space and accelerator button apply throttle only while held, with coasting on release', () => {
  const keyboard = new RangeKeyboard(); const held = new Set<string>();
  const range = new DrivingRange();
  for (const source of ['Space', 'accelerate']) {
    if (source === 'Space') keyboard.down(source); else held.add(source);
    const controls = drivingInput(keyboard, held);
    assert.equal(controls.throttle, 1); assert.equal(controls.brake, false);
    range.tick(.1, controls);
    assert.ok(range.speed > 0);
    const speedBeforeRelease = range.speed;
    if (source === 'Space') keyboard.up(source); else held.delete(source);
    const released = drivingInput(keyboard, held);
    assert.equal(released.throttle, 0); assert.equal(released.brake, false);
    range.tick(.1, released);
    assert.ok(range.speed > 0 && range.speed <= speedBeforeRelease, 'release coasts without an instant stop');
  }
});

test('reverse wins over held acceleration and cruise without blocking steering or fire', () => {
  const keyboard = new RangeKeyboard();
  keyboard.down('Space'); keyboard.down('KeyS'); keyboard.down('KeyA'); keyboard.down('KeyF');
  const controls = drivingInput(keyboard, new Set(['accelerate']), 0, true);
  assert.equal(controls.throttle, -1); assert.equal(controls.steer, 1); assert.equal(controls.fire, true);
  keyboard.up('KeyS');
  assert.equal(drivingInput(keyboard, new Set(['accelerate', 'reverse'])).throttle, -1);
  keyboard.clear();
  assert.equal(drivingInput(keyboard, new Set()).throttle, 0);
});


test('B brakes physical and fallback keyboards while preserving steering, aim and fire', () => {
  for (const event of [{ code: 'KeyB', key: 'b' }, { key: 'b' }, { code: 'Unidentified', key: 'B' }]) {
    assert.equal(gameKeyCode(event), 'KeyB');
    const keyboard = new RangeKeyboard();
    keyboard.down(gameKeyCode(event));
    for (const throttle of ['Space', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown']) keyboard.down(throttle);
    keyboard.down('KeyA'); keyboard.down('KeyF');
    const controls = drivingInput(keyboard, new Set(['accelerate', 'forward', 'reverse']), -.5, true);
    assert.deepEqual(controls, { throttle: 0, steer: 1, aim: -.5, fire: true, brake: true });
    keyboard.up(gameKeyCode(event));
    const released = drivingInput(keyboard, new Set());
    assert.equal(released.brake, false);
    assert.equal(released.throttle, -1, 'release restores actively held reverse');
    keyboard.down('KeyB'); keyboard.clear();
    assert.deepEqual(drivingInput(keyboard, new Set()), { throttle: 0, steer: 0, aim: 0, fire: false, brake: false });
  }
});

test('B stops actual forward and reverse motion without changing travel direction', () => {
  for (const direction of ['KeyW', 'KeyS']) {
    const keyboard = new RangeKeyboard(); const range = new DrivingRange();
    keyboard.down(direction);
    for (let frame = 0; frame < 20; frame++) range.tick(.1, drivingInput(keyboard, new Set()));
    const sign = direction === 'KeyW' ? 1 : -1;
    assert.ok(range.speed * sign > 0, 'vehicle is moving before braking');
    keyboard.down('KeyB');
    let previousSpeed = Math.abs(range.speed);
    for (let frame = 0; frame < 100; frame++) {
      range.tick(.1, drivingInput(keyboard, new Set(['accelerate']), 0, true));
      assert.ok(range.speed * sign >= 0, 'braking never reverses travel');
      assert.ok(Math.abs(range.speed) <= previousSpeed, 'braking steadily reduces speed');
      previousSpeed = Math.abs(range.speed);
    }
    assert.equal(range.speed, 0, 'brake holds stationary against the held throttle');
    keyboard.up(direction); keyboard.up('KeyB');
    range.tick(.1, drivingInput(keyboard, new Set()));
    assert.equal(range.speed, 0, 'release stays stopped with no throttle');
  }
});
