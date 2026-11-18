import assert from 'node:assert/strict';
import test from 'node:test';
import { ArcadePowertrain } from '../src/powertrain.ts';

const input = { speed: 0, throttle: 0, acceleration: 0, roughness: .08, speedFactor: 1, brake: false, engine: true };
const settle = (model: ArcadePowertrain, value = input, seconds = 2): void => {
  for (let i = 0; i < seconds * 40; i++) model.tick(.025, value);
};

test('synthesized rpm and spool respond to effort at the same speed, not speed alone', () => {
  const coast = new ArcadePowertrain(), loaded = new ArcadePowertrain(), again = new ArcadePowertrain();
  settle(coast, { ...input, speed: 3 });
  const effort = { ...input, speed: 3, throttle: 1, acceleration: 5, roughness: .95, speedFactor: .57 };
  settle(loaded, effort); settle(again, effort);
  assert.deepEqual(loaded.state, again.state);
  assert.ok(loaded.state.rpm > coast.state.rpm + 700);
  assert.ok(loaded.state.whine > coast.state.whine + .3);
  assert.ok(loaded.state.load > coast.state.load + .4);
  assert.equal(loaded.state.roughness, .95);
});

test('virtual shift dips revs, recovers, and has hysteresis before a downshift', () => {
  const model = new ArcadePowertrain(); settle(model, { ...input, speed: 6.4, throttle: 1 });
  const before = model.state.rpm;
  model.tick(.1, { ...input, speed: 6.6, throttle: 1 });
  assert.equal(model.state.gear, 2); const dip = model.state.rpm; assert.ok(dip < before);
  settle(model, { ...input, speed: 6.6, throttle: 1 }, .5); assert.ok(model.state.rpm > dip);
  model.tick(.1, { ...input, speed: 5.7 }); assert.equal(model.state.gear, 2);
  model.tick(.1, { ...input, speed: 5.1 }); assert.equal(model.state.gear, 1);
  model.tick(.1, { ...input, speed: -2 }); assert.equal(model.state.gear, -1);
});

test('powertrain ignores invalid time, clamps malformed inputs, and engine off stops every active layer', () => {
  const model = new ArcadePowertrain(); const snapshot = { ...model.state };
  model.tick(NaN, input); model.tick(0, input); assert.deepEqual(model.state, snapshot);
  model.tick(.1, { ...input, throttle: Infinity, speed: NaN, acceleration: NaN, roughness: Infinity, speedFactor: NaN });
  assert.ok(Object.values(model.state).every(Number.isFinite));
  settle(model, { ...input, throttle: 1 }); model.tick(.1, { ...input, engine: false });
  assert.equal(model.state.rpm, 0); assert.equal(model.state.load, 0); assert.equal(model.state.throttle, 0); assert.equal(model.state.whine, 0);
  model.restart(); assert.deepEqual(model.state, snapshot);
});
