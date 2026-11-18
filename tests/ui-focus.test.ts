import test from 'node:test';
import assert from 'node:assert/strict';
import { GameFocusOwnership, nextTrappedFocus } from '../src/ui-focus.ts';
import { drivingInput, RangeKeyboard } from '../src/input.ts';

test('Tab-focused actions retain native Space; pointer-clicked actions retain throttle', () => {
  const focus = new GameFocusOwnership();
  const keyboard = new RangeKeyboard();
  const pressSpace = (actionControl: boolean) => {
    if (!focus.nativeSpace(actionControl)) keyboard.down('Space');
    return drivingInput(keyboard, new Set()).throttle;
  };
  assert.equal(pressSpace(true), 1, 'pointer/default focus retains arcade acceleration');
  keyboard.up('Space');
  assert.equal(drivingInput(keyboard, new Set()).throttle, 0, 'release coasts');
  focus.navigateWithKeyboard();
  assert.equal(pressSpace(true), 0, 'Tab then Space does not accelerate behind an action');
  assert.equal(focus.nativeSpace(false), false, 'the scene still accepts Space after Tab');
  keyboard.down('KeyW'); keyboard.down('KeyF');
  assert.equal(drivingInput(keyboard, new Set()).throttle, 1);
  assert.equal(drivingInput(keyboard, new Set()).fire, true, 'WASD/F ownership stays independent');
  keyboard.clear();
  focus.usePointer();
  assert.equal(pressSpace(true), 1, 'clicking a camera restores Space driving');
});

test('drawer Tab order wraps in both directions and recovers outside focus', () => {
  assert.equal(nextTrappedFocus(0, 4), 1);
  assert.equal(nextTrappedFocus(3, 4), 0);
  assert.equal(nextTrappedFocus(0, 4, true), 3);
  assert.equal(nextTrappedFocus(-1, 4), 0);
  assert.equal(nextTrappedFocus(-1, 4, true), 3);
  assert.equal(nextTrappedFocus(0, 1), 0);
  assert.equal(nextTrappedFocus(-1, 0), null);
});
