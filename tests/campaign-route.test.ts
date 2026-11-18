import test from 'node:test';
import assert from 'node:assert/strict';
import { DrivingRange } from '../src/range.ts';
import { MISSION_ROUTE } from '../src/world-config.ts';

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

function driveMission(response: 'ignore' | 'early' | 'late', extraPractice = false): DrivingRange {
  const range = new DrivingRange(), dt = .025;
  if (extraPractice) {
    // Actual forward/reverse practice adds moving exposure before the same route.
    // Do not manufacture damage, elapsed time or a departure crossing.
    for (const throttle of [1, -1]) {
      for (let step = 0; step < 5 / dt; step++) range.tick(dt, { throttle, steer: 0, aim: 0, fire: false });
    }
    for (let step = 0; step < 1 / dt; step++) range.tick(dt, { throttle: 0, steer: 0, aim: 0, fire: false, brake: true });
    assert.equal(range.mission.departureCrossed, false);
    assert.ok(range.health.movingSeconds > 9);
    assert.equal(range.health.phase, 'warning');
  }
  let waypoint = 1;
  for (let step = 0; step < 24000 && !range.missionEnded; step++) {
    const exposure = range.health.faults[0]!.exposure;
    if (!range.health.paceLimited && (response === 'early' && exposure >= 6 || response === 'late' && exposure >= 65)) {
      range.paused = true;
      const time = range.time;
      range.takeHealthDecision('diagnose', 'charging');
      range.takeHealthDecision('reduce-pace');
      range.takeHealthDecision('continue');
      assert.equal(range.time, time, 'crew inspection decisions do not advance the exercise');
      range.paused = false;
    }
    const enemy = range.mission.departureCrossed
      ? range.mission.contacts.filter(c => !c.neutralized && c.detected && Math.hypot(c.x - range.position.x, c.z - range.position.z) < 125)
        .sort((a, b) => Math.hypot(a.x - range.position.x, a.z - range.position.z) - Math.hypot(b.x - range.position.x, b.z - range.position.z))[0]
      : undefined;
    if (enemy) {
      const ox = range.position.x + Math.cos(range.heading) * .48;
      const oz = range.position.z - Math.sin(range.heading) * .48;
      const aimError = wrap(Math.atan2(-(enemy.x - ox), -(enemy.z - oz)) - range.heading - range.aimYaw);
      range.tick(dt, { throttle: 0, steer: 0, aim: clamp(aimError / (1.35 * dt)), fire: Math.abs(aimError) < .006, brake: true });
      continue;
    }
    let target = MISSION_ROUTE[waypoint]!;
    if (waypoint < MISSION_ROUTE.length - 1 && Math.hypot(target.x - range.position.x, target.z - range.position.z) < 12) target = MISSION_ROUTE[++waypoint]!;
    const dx = target.x - range.position.x, dz = target.z - range.position.z;
    const headingError = wrap(Math.atan2(-dx, -dz) - range.heading);
    const inObjective = waypoint === MISSION_ROUTE.length - 1 && Math.hypot(dx, dz) < range.mission.objective.radius * .6;
    range.tick(dt, { throttle: inObjective ? 0 : Math.abs(headingError) > .6 ? .4 : .9, steer: clamp(headingError * 2), aim: 0, fire: false, brake: inObjective });
  }
  return range;
}

test('shorter gun truck encounters allow ignored faults to deliver with major unrepaired damage', () => {
  const range = driveMission('ignore');
  // Softer truck targets shorten combat pauses; this driver now reaches the objective
  // before overheating immobilizes it. Persistent health damage must still be reported.
  assert.equal(range.mission.status, 'complete', `ended ${range.mission.status} at ${range.time.toFixed(1)}s with exposure ${range.health.faults[0]!.exposure}`);
  assert.equal(range.debrief?.outcome, 'complete'); assert.equal(range.debrief?.vehicleStatus, 'major-repair');
  assert.equal(range.health.continued, false); assert.equal(range.health.paceLimited, false);
  assert.equal(range.health.breakdownCause, null); assert.equal(range.mission.remainingContacts, 0);
  assert.deepEqual(range.debrief?.decisions, []);
  assert.equal(range.debrief?.findings.find(finding => finding.id === 'charging')?.maintenance, 'major');
  assert.equal(range.debrief?.findings.find(finding => finding.id === 'wheel-end')?.maintenance, 'major');
  assert.ok(range.debrief?.findings.some(finding => finding.firstWarningAt !== null && finding.severeAt !== null));
  assert.match(range.debrief!.summary, /major repair required after deferred action/);
  assert.equal(range.speed, 0); assert.equal(range.audioState.engine, false);
  const frozen = JSON.stringify(range.debrief), time = range.time;
  range.tick(.1, { throttle: 1, steer: 1, aim: 1, fire: true });
  assert.equal(range.time, time); assert.equal(JSON.stringify(range.debrief), frozen);
});

test('additional practice then ignored warnings cause a cooling breakdown before full-route delivery', () => {
  const range = driveMission('ignore', true);
  assert.equal(range.mission.status, 'breakdown', `ended ${range.mission.status} at ${range.time.toFixed(1)}s`);
  assert.equal(range.mission.departureCrossed, true);
  assert.ok(range.mission.currentWaypoint >= MISSION_ROUTE.length - 2, 'the crew reached the final route segment after practice');
  assert.ok(range.mission.distance > range.mission.objective.radius, 'overheating stopped the vehicle before the dismount circle');
  assert.equal(range.mission.arrivalProgress, 0);
  assert.equal(range.health.phase, 'broken'); assert.equal(range.health.breakdownCause, 'cooling');
  assert.equal(range.health.paceLimited, false); assert.deepEqual(range.health.decisions, []);
  assert.equal(range.debrief?.outcome, 'breakdown'); assert.equal(range.debrief?.vehicleStatus, 'immobilized');
  const cooling = range.debrief?.findings.find(finding => finding.id === 'cooling');
  assert.equal(cooling?.maintenance, 'major');
  assert.ok(cooling && cooling.firstWarningAt !== null && cooling.severeAt !== null);
  assert.equal(range.speed, 0); assert.equal(range.audioState.engine, false);
  const time = range.time, frozen = JSON.stringify(range.debrief);
  range.tick(.1, { throttle: 1, steer: 1, aim: 1, fire: true });
  assert.equal(range.time, time); assert.equal(JSON.stringify(range.debrief), frozen);
});

test('early reduced pace can clear all encounters and deliver with only minor inspection findings', () => {
  const range = driveMission('early');
  assert.equal(range.mission.status, 'complete', `ended ${range.mission.status} at ${JSON.stringify(range.position)} after ${range.time.toFixed(1)}s`);
  assert.equal(range.mission.departureCrossed, true); assert.equal(range.mission.remainingContacts, 0);
  assert.ok(range.mission.contacts.every(c => c.neutralized && c.health === 0));
  assert.ok(range.targets.filter(t => t.kind === 'training' && t.destroyedBy === 'vehicle').length >= 2);
  assert.equal(range.debrief?.vehicleStatus, 'requires-inspection');
  assert.ok(range.debrief?.findings.every(finding => finding.maintenance === 'inspection' || finding.maintenance === 'none'));
  assert.equal(range.debrief?.contactsCleared, range.mission.contacts.length);
  assert.equal(range.debrief?.distanceTravelled, range.distanceTravelled);
  assert.ok(range.distanceTravelled > 1000); assert.ok(range.mission.integrity > 0);
  assert.equal(range.audioState.engine, false);
});

test('late mitigation can finish the full route while leaving major repairs in the debrief', () => {
  const range = driveMission('late');
  assert.equal(range.mission.status, 'complete', `ended ${range.mission.status} at ${JSON.stringify(range.position)} after ${range.time.toFixed(1)}s`);
  assert.equal(range.debrief?.vehicleStatus, 'major-repair');
  assert.equal(range.debrief?.findings.find(finding => finding.id === 'charging')?.maintenance, 'major');
  assert.equal(range.debrief?.findings.find(finding => finding.id === 'wheel-end')?.maintenance, 'major');
  assert.equal(range.health.breakdownCause, null); assert.equal(range.mission.remainingContacts, 0);
  assert.match(range.debrief!.summary, /Team delivered.*major repair/);
  assert.ok(range.debrief!.decisions.some(decision => decision.action === 'reduce-pace' && decision.time > 50));
  const result = range.debrief, frozen = JSON.stringify(result);
  range.tick(.1, { throttle: 1, steer: 1, aim: 1, fire: true });
  assert.equal(range.debrief, result); assert.equal(JSON.stringify(result), frozen);
});
