import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingRange } from '../src/range.ts';
import { DISMOUNT, rampOpenProgress, troopRunProgress } from '../src/dismount.ts';
import { DISMOUNT_POINT } from '../src/world-config.ts';

const idle = { throttle: 0, steer: 0, aim: 0, fire: false };
const held = { throttle: 1, steer: 1, aim: 1, fire: true };
function run(range: DrivingRange, seconds: number, input = idle): void {
  for (let i = 0; i < Math.round(seconds * 40); i++) range.tick(.025, input);
}
function ready(offset = 0): DrivingRange {
  const range = new DrivingRange();
  range.position = { x: DISMOUNT_POINT.x + offset, z: DISMOUNT_POINT.z };
  range.mission.departureCrossed = true;
  for (const contact of range.mission.contacts) { contact.neutralized = true; contact.health = 0; }
  return range;
}

test('unload timings open ramp before nine staggered exits and finish all troops within the sequence', () => {
  assert.equal(DISMOUNT.troopCount, 9);
  assert.equal(rampOpenProgress(0), 0); assert.equal(rampOpenProgress(DISMOUNT.rampOpenSeconds), 1);
  for (let index = 0; index < DISMOUNT.troopCount; index++) {
    const start = DISMOUNT.rampOpenSeconds + index * DISMOUNT.troopStaggerSeconds;
    assert.equal(troopRunProgress(start, index), 0);
    assert.ok(troopRunProgress(start + .1, index) > 0);
    assert.equal(troopRunProgress(DISMOUNT.durationSeconds, index), 1);
  }
});

test('exact objective boundary succeeds; a drop just outside commits a distinct failure after the exit', () => {
  for (const [offset, valid] of [[DISMOUNT_POINT.radius - .001, true], [DISMOUNT_POINT.radius, true], [DISMOUNT_POINT.radius + .001, false]] as const) {
    const range = ready(offset);
    assert.equal(range.dropRamp(), true); assert.equal(range.dismount.validDrop, valid);
    assert.equal(range.mission.status, 'dismounting'); assert.equal(range.missionEnded, false);
    assert.equal(range.debrief, null, 'the animation precedes the final debrief');
    if (!valid) { assert.equal(range.mission.failureReason, 'dismount-outside-zone'); assert.match(range.mission.notice, /Mission failed.*outside/); }
    run(range, DISMOUNT.durationSeconds);
    assert.equal(range.mission.status, valid ? 'complete' : 'failed');
    assert.equal(range.dismount.phase, 'complete'); assert.equal(range.dismount.elapsed, DISMOUNT.durationSeconds);
    assert.equal(range.debrief?.failureReason, valid ? null : 'dismount-outside-zone');
    if (!valid) { assert.match(range.debrief!.summary, /wrong location/); assert.doesNotMatch(range.debrief!.summary, /Enemy contact damage/); }
  }
});

test('completed debrief retains the assigned radio callsign after the next run changes identity', () => {
  const range = ready();
  range.callsign = 'Crazy Horse 2-6';
  assert.equal(range.dropRamp(), true);
  run(range, DISMOUNT.durationSeconds);
  const report = range.debrief!;
  range.restart();
  range.callsign = 'Aztec 1-6';
  assert.equal(report.callsign, 'Crazy Horse 2-6');
  assert.equal(range.debrief, null);
});

test('outside drop accepts training, uncleared contacts and motion, then immobilizes the vehicle', () => {
  const range = new DrivingRange(); range.speed = 12;
  assert.equal(range.mission.departureCrossed, false); assert.ok(range.mission.remainingContacts > 0);
  assert.equal(range.dropRamp(), true); assert.equal(range.speed, 0);
  assert.equal(range.audioState.engine, false); assert.equal(range.powertrain.rpm, 0);
  assert.equal(range.dismount.validDrop, false);
  run(range, DISMOUNT.durationSeconds, held);
  assert.equal(range.debrief?.outcome, 'failed'); assert.equal(range.debrief?.failureReason, 'dismount-outside-zone');
});

test('inside drop requires departure, cleared contacts and a stop, with no exit on rejected commands', () => {
  for (const blocked of ['departure', 'contacts', 'moving'] as const) {
    const range = ready();
    if (blocked === 'departure') range.mission.departureCrossed = false;
    if (blocked === 'contacts') range.mission.contacts[0]!.neutralized = false;
    if (blocked === 'moving') range.speed = -.8;
    assert.equal(range.dropRampAvailability.available, false);
    assert.equal(range.dropRamp(), false);
    assert.equal(range.dismount.phase, 'stowed'); assert.equal(range.mission.failureReason, null);
    assert.equal(range.debrief, null); assert.equal(range.missionEnded, false);
    assert.match(range.mission.notice, blocked === 'departure' ? /line of departure/ : blocked === 'contacts' ? /Clear every/ : /Stop inside/);
  }
  const justStopped = ready(); justStopped.speed = -.799;
  assert.equal(justStopped.dropRamp(), true);
});

test('explicit drop freezes driving, aim, combat and health while advancing only the exit and mission clocks', () => {
  const range = new DrivingRange();
  range.position = { ...range.mission.contacts[0]!, z: range.mission.contacts[0]!.z + 20 };
  range.tick(.025, held); assert.ok(range.shotsFired > 0);
  assert.equal(range.dropRamp(), true);
  const position = { ...range.position }, heading = range.heading, aim = range.aimYaw;
  const health = JSON.stringify(range.health), contacts = JSON.stringify(range.mission.contacts);
  const distance = range.distanceTravelled, shots = range.shotsFired, integrity = range.mission.integrity;
  const time = range.time;
  assert.equal(range.takeHealthDecision('recovery'), false);
  assert.equal(range.takeHealthDecision('reduce-pace'), false);
  range.centerAim(); range.setAimAssist(false);
  run(range, 1.25, held);
  assert.equal(range.dismount.phase, 'unloading'); assert.ok(Math.abs(range.time - time - 1.25) < 1e-8);
  assert.deepEqual(range.position, position); assert.deepEqual(range.dismount.position, position);
  assert.equal(range.heading, heading); assert.equal(range.aimYaw, aim); assert.equal(range.speed, 0);
  assert.equal(range.shotsFired, shots); assert.equal(range.distanceTravelled, distance);
  assert.equal(range.mission.integrity, integrity); assert.equal(JSON.stringify(range.mission.contacts), contacts);
  assert.equal(JSON.stringify(range.health), health);
});

test('pause, repeat, terminal and restart guards preserve exit state and immutable outcomes', () => {
  const range = ready(); range.paused = true;
  const paused = JSON.stringify(range); assert.equal(range.dropRamp(), false); assert.equal(JSON.stringify(range), paused);
  range.paused = false; assert.equal(range.dropRamp(), true); run(range, .5, held);
  const started = JSON.stringify(range.dismount); assert.equal(range.dropRamp(), false); assert.equal(JSON.stringify(range.dismount), started);
  range.paused = true; const frozen = JSON.stringify(range);
  range.tick(100, held); assert.equal(range.dropRamp(), false); assert.equal(JSON.stringify(range), frozen);
  range.paused = false; run(range, DISMOUNT.durationSeconds, held);
  const result = range.debrief!, saved = JSON.stringify(result), time = range.time;
  assert.equal(result.outcome, 'complete'); assert.equal(Object.isFrozen(result), true);
  assert.equal(range.dropRamp(), false); run(range, 10, held);
  assert.equal(range.time, time); assert.equal(JSON.stringify(range.debrief), saved);
  range.restart(); assert.equal(range.dismount.phase, 'stowed'); assert.equal(range.dismount.validDrop, null);
  assert.equal(range.dismount.elapsed, 0); assert.equal(range.mission.failureReason, null); assert.equal(range.debrief, null);
  assert.equal(JSON.stringify(result), saved);
  assert.equal(range.dropRamp(), true, 'restart permits a new explicit command');
});
