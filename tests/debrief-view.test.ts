import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseTime, missionDebriefMarkup } from '../src/debrief-view.ts';
import type { MissionDebrief } from '../src/mission-contract.ts';

function report(outcome: MissionDebrief['outcome']): MissionDebrief {
  return { outcome, endedAt: 135, distanceTravelled: 808, contactsCleared: 2, contactsTotal: 4, summary: 'Crew outcome <script>alert(1)</script>', vehicleStatus: 'major-repair', findings: [{ id: 'charging', label: 'Charging output', severity: 'severe', maintenance: 'major', consequence: 'Electrical damage <not markup>', repair: 'Replace damaged charging components.', firstWarningAt: 65, severeAt: 95, diagnosed: false }], decisions: [{ action: 'continue', time: 70, faultId: 'charging' }, { action: 'reduce-pace', time: 110 }] };
}

test('all terminal outcomes render their frozen run result', () => {
  const titles = { complete: 'Dismount point reached.', failed: 'Vehicle lost to contact damage.', recovery: 'Recovery requested.', breakdown: 'Vehicle breakdown.' };
  for (const outcome of ['complete', 'failed', 'recovery', 'breakdown'] as const) {
    const data = report(outcome);
    const before = JSON.stringify(data);
    const html = missionDebriefMarkup(data);
    assert.ok(html.includes(titles[outcome]));
    assert.ok(html.includes('02:15')); assert.ok(html.includes('808')); assert.ok(html.includes('2 / 4'));
    assert.equal(JSON.stringify(data), before);
    assert.equal(html.includes('The mission was completed, but'), outcome === 'complete');
  }
});

test('debrief escapes state text, preserves repair findings and orders warnings with decisions', () => {
  const html = missionDebriefMarkup(report('breakdown'));
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Replace damaged charging components.'));
  assert.ok(html.indexOf('<time>01:05') < html.indexOf('<time>01:10'));
  assert.ok(html.indexOf('<time>01:10') < html.indexOf('<time>01:35'));
  assert.ok(html.includes('no repair performed') === false);
  assert.ok(!html.includes('$')); assert.ok(!html.includes('hours'));
});

test('wrong-location unload has a distinct immutable failure record from contact damage', () => {
  const wrongDrop = report('failed');
  wrongDrop.failureReason = 'dismount-outside-zone';
  const frozen = Object.freeze(wrongDrop);
  const html = missionDebriefMarkup(frozen);
  assert.ok(html.includes('Squad unloaded outside the dismount zone.'));
  assert.ok(!html.includes('Vehicle lost to contact damage.'));
  assert.equal(frozen.failureReason, 'dismount-outside-zone');
  const combat = report('failed');
  combat.failureReason = 'combat-damage';
  assert.ok(missionDebriefMarkup(combat).includes('Vehicle lost to contact damage.'));
});

test('movement timeout reports the deadline without inventing combat loss or losing repair findings', () => {
  const late = report('failed');
  late.failureReason = 'movement-timeout';
  late.movementClock = Object.freeze({ status: 'expired', limitSeconds: 180, remainingSeconds: 0, elapsedSeconds: 180, startedAt: 24, arrivalAt: null });
  const html = missionDebriefMarkup(Object.freeze(late));
  assert.ok(html.includes('Movement deadline missed.'));
  assert.ok(html.includes('03:00 expired'));
  assert.ok(html.includes('Replace damaged charging components.'));
  assert.ok(!html.includes('Vehicle lost to contact damage.'));
  const onTime = report('complete');
  onTime.movementClock = { ...late.movementClock, status: 'arrived', remainingSeconds: 60, elapsedSeconds: 120, arrivalAt: 144 };
  assert.ok(missionDebriefMarkup(onTime).includes('Reached in 02:00 / 03:00 allowed.'));
});

test('inspection and recovery are decisions, not a fabricated repair', () => {
  const data = report('recovery');
  data.decisions = [{ action: 'diagnose', time: 67, faultId: 'charging' }, { action: 'recovery', time: 68 }];
  const html = missionDebriefMarkup(data);
  assert.ok(html.includes('Inspected fault; no repair performed'));
  assert.ok(html.includes('Called in-game recovery; vehicle stopped'));
  assert.ok(html.includes('No real diagnosis, repair estimate or outbound recovery message'));
  assert.equal(exerciseTime(0), '00:00'); assert.equal(exerciseTime(-10), '00:00');
});

test('optional stops render only actual frozen visited labels and escape their text', () => {
  const data = report('complete');
  assert.ok(!missionDebriefMarkup(data).includes('OPTIONAL STOPS VISITED'));
  data.optionalVisitedLabels = ['West overlook', 'Relay <unsafe>'];
  const before = JSON.stringify(data);
  const html = missionDebriefMarkup(data);
  assert.ok(html.includes('OPTIONAL STOPS VISITED'));
  assert.ok(html.includes('West overlook &middot; Relay &lt;unsafe&gt;'));
  assert.ok(!html.includes('Relay <unsafe>'));
  assert.equal(JSON.stringify(data), before);
});
