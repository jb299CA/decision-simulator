import assert from 'node:assert/strict';
import test from 'node:test';
import { faultInstrumentData, systemsHealthMarkup } from '../src/fault-display.ts';
import { VehicleHealth } from '../src/vehicle-health.ts';

test('instrument chart preserves recorded values, sorts timestamps and includes baseline in scale', () => {
  const observations = [{ time: 12, value: 145 }, { time: 3, value: 98 }];
  const data = faultInstrumentData({ baseline: 100, reading: 150, observations });
  assert.equal(data.delta, 50);
  assert.deepEqual(data.last, { time: 12, value: 145 });
  assert.deepEqual(observations, [{ time: 12, value: 145 }, { time: 3, value: 98 }]);
  for (const value of [98, 100, 145, 150]) assert.ok(data.y(value) > 24 && data.y(value) < 132);
  assert.equal(data.x(3), 48); assert.equal(data.x(12), 480);
});

test('single and missing samples never fabricate a recorded history or divide by zero', () => {
  const single = faultInstrumentData({ baseline: 100, reading: 100, observations: [{ time: 2, value: 100 }] });
  assert.equal(single.points, '48.00,78.00');
  const none = faultInstrumentData({ baseline: NaN, reading: Infinity, observations: [{ time: NaN, value: 100 }, { time: -1, value: 100 }] });
  assert.equal(none.last, null); assert.equal(none.current, null); assert.equal(none.baseline, null); assert.equal(none.delta, null);
  assert.equal(none.points, '');
  assert.ok(Number.isFinite(none.y(0)));
});

test('systems instrument names its simulation scope and uses the shared score for visible and accessible values', () => {
  const health = new VehicleHealth();
  const normal = systemsHealthMarkup(health.state.faults);
  assert.match(normal, /role="meter"/); assert.match(normal, /aria-valuenow="100"/);
  assert.match(normal, /SYSTEMS/); assert.match(normal, /Separate from hull integrity/);
  assert.doesNotMatch(normal, /aria-live/);
  health.tick(6, true, 6);
  const warning = systemsHealthMarkup(health.state.faults);
  assert.match(warning, /data-severity="moderate"/);
  assert.match(warning, /aria-valuenow="79"/);
  const missing = systemsHealthMarkup([]);
  assert.match(missing, /No data/); assert.doesNotMatch(missing, /aria-valuenow=/);
});
