import assert from 'node:assert/strict';
import test from 'node:test';
import type { FaultSeverity } from '../src/mission-contract.ts';
import { systemHealthScore } from '../src/health-score.ts';
import { VehicleHealth } from '../src/vehicle-health.ts';

test('healthy systems start at 100 and missing data is visibly unavailable', () => {
  assert.deepEqual(systemHealthScore(new VehicleHealth().state.faults), { score: 100, level: 'normal', activeFaults: 0, label: 'Normal', available: true });
  assert.deepEqual(systemHealthScore([]), { score: 0, level: 'normal', activeFaults: 0, label: 'No data', available: false });
});

test('worst severity cannot be averaged away by healthy systems', () => {
  const healthy = Array.from({ length: 100 }, () => ({ severity: 'normal' as const, damage: 0 }));
  for (const [severity, cap] of [['moderate', 79], ['severe', 49], ['failed', 0]] as const) {
    const result = systemHealthScore([...healthy, { severity, damage: 0 }]);
    assert.equal(result.score, cap); assert.equal(result.level, severity); assert.equal(result.activeFaults, 1);
  }
});

test('score is bounded for malformed damage and unknown severity', () => {
  for (const damage of [-99, 0, .5, 1, 99, NaN, Infinity, -Infinity]) {
    const result = systemHealthScore([{ severity: 'normal', damage }]);
    assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100);
    if (!Number.isFinite(damage)) assert.equal(result.score, 30);
  }
  assert.equal(systemHealthScore([{ severity: 'unexpected' as FaultSeverity, damage: 0 }]).score, 0);
});

test('fault ordering and calls do not mutate inputs or change the result', () => {
  const faults = Object.freeze([Object.freeze({ severity: 'moderate' as const, damage: .9 }), Object.freeze({ severity: 'normal' as const, damage: .2 })]);
  assert.deepEqual(systemHealthScore(faults), systemHealthScore([...faults].reverse()));
  assert.deepEqual(faults, [{ severity: 'moderate', damage: .9 }, { severity: 'normal', damage: .2 }]);
});

test('movement exposure never increases health; inspection, continue and pace do not heal it', () => {
  const health = new VehicleHealth(); let previous = 100;
  for (let second = 1; second <= 96; second++) {
    health.tick(1, true, second);
    const score = systemHealthScore(health.state.faults).score;
    assert.ok(score <= previous); previous = score;
    if (second === 6) {
      const before = systemHealthScore(health.state.faults);
      health.decide('diagnose', second, 'charging'); health.decide('continue', second); health.decide('reduce-pace', second);
      assert.deepEqual(systemHealthScore(health.state.faults), before);
    }
  }
});

test('failed cooling produces zero and recovery preserves existing score', () => {
  const health = new VehicleHealth(); health.tick(30, true, 30);
  const score = systemHealthScore(health.state.faults); health.decide('recovery', 30);
  assert.deepEqual(systemHealthScore(health.state.faults), score);
  const failed = new VehicleHealth(); failed.tick(95, true, 95);
  assert.equal(systemHealthScore(failed.state.faults).score, 0);
  assert.equal(systemHealthScore(failed.state.faults).label, 'Failed');
});
