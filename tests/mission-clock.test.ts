import assert from 'node:assert/strict';
import test from 'node:test';
import { MissionMovementClock, MOVEMENT_LIMIT_SECONDS } from '../src/mission-clock.ts';
import { DrivingRange } from '../src/range.ts';
import { DEPARTURE_Z, DISMOUNT_POINT } from '../src/world-config.ts';
import { DISMOUNT } from '../src/dismount.ts';

const idle = { throttle: 0, steer: 0, aim: 0, fire: false };
function run(range: DrivingRange, seconds: number): void {
  for (let step = 0; step < Math.round(seconds * 40); step++) range.tick(.025, idle);
}
function crossDeparture(range: DrivingRange): void {
  range.position = { x: 300, z: DEPARTURE_Z + .1 }; range.speed = 18;
  range.tick(.025, { ...idle, throttle: 1 });
  range.speed = 0;
  assert.equal(range.mission.departureCrossed, true);
}
function clearContacts(range: DrivingRange): void {
  // Clock unit fixtures isolate arrival eligibility from combat's separately tested hits.
  for (const contact of range.mission.contacts) { contact.neutralized = true; contact.health = 0; }
}

test('movement clock gives unlimited pre-LD practice and starts only once', () => {
  const clock = new MissionMovementClock();
  assert.equal(clock.update(900, false, false).status, 'waiting');
  assert.equal(clock.snapshot.remainingSeconds, MOVEMENT_LIMIT_SECONDS);
  assert.equal(clock.update(905, true, false).startedAt, 905);
  assert.equal(clock.update(915, false, false).remainingSeconds, 170);
  assert.equal(clock.update(925, true, false).remainingSeconds, 160);
  assert.equal(clock.snapshot.startedAt, 905);
  assert.equal(clock.update(910, true, false).remainingSeconds, 160, 'stale simulation timestamps cannot restore time');
});

test('180 seconds is the exact losing boundary, while an earlier arrival settles the movement task', () => {
  const clock = new MissionMovementClock(); clock.update(12, true, false);
  assert.equal(clock.update(191.999, true, false).status, 'running');
  assert.ok(clock.snapshot.remainingSeconds > 0);
  assert.equal(clock.update(192, true, true).status, 'expired');
  assert.equal(clock.snapshot.remainingSeconds, 0); assert.equal(clock.snapshot.arrivalAt, null);
  const expired = clock.snapshot; clock.update(195, true, true); assert.equal(clock.snapshot, expired);
  clock.reset(); clock.update(12, true, false);
  assert.equal(clock.update(191.9, true, true).status, 'arrived');
  const arrived = clock.snapshot;
  clock.update(500, true, false); assert.equal(clock.snapshot, arrived);
  assert.equal(clock.snapshot.arrivalAt, 191.9); assert.ok(Object.isFrozen(arrived));
  clock.reset(); assert.equal(clock.snapshot.status, 'waiting'); assert.equal(clock.snapshot.startedAt, null);
});

test('simulation pause, stale-frame cap and backtracking preserve the single LD clock', () => {
  const range = new DrivingRange(); run(range, 200);
  assert.equal(range.movementClock.status, 'waiting'); assert.equal(range.time > 199, true);
  crossDeparture(range); const start = range.movementClock.startedAt;
  assert.equal(start, range.time); assert.equal(range.movementClock.remainingSeconds, 180);
  range.position.z = DEPARTURE_Z + 20; run(range, 1);
  assert.equal(range.movementClock.startedAt, start);
  assert.ok(Math.abs(range.movementClock.remainingSeconds - 179) < 1e-8);
  range.paused = true; const snapshot = JSON.stringify(range);
  range.tick(1000, { ...idle, throttle: 1, fire: true }); assert.equal(JSON.stringify(range), snapshot);
  range.paused = false; const before = range.movementClock.remainingSeconds;
  range.tick(1000, idle); assert.ok(Math.abs(before - range.movementClock.remainingSeconds - .1) < 1e-8);
  range.tick(NaN, idle); range.tick(-1, idle);
  assert.equal(range.movementClock.startedAt, start);
  range.restart(); assert.equal(range.movementClock.status, 'waiting'); assert.equal(range.movementClock.remainingSeconds, 180);
  assert.equal(range.movementClock.startedAt, null); assert.equal(range.movementClock.arrivalAt, null);
});

test('timeout ends deterministically at 180 active seconds without inventing vehicle damage', () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const range = new DrivingRange(); crossDeparture(range);
    const start = range.movementClock.startedAt!, health = JSON.stringify(range.health), integrity = range.mission.integrity;
    run(range, 179.975); assert.equal(range.missionEnded, false); assert.equal(range.movementClock.status, 'running');
    range.tick(.025, idle);
    assert.equal(range.mission.status, 'failed'); assert.equal(range.mission.failureReason, 'movement-timeout');
    assert.ok(Math.abs(range.time - start - 180) < 1e-8);
    assert.equal(range.movementClock.status, 'expired'); assert.equal(range.movementClock.remainingSeconds, 0);
    assert.equal(range.mission.integrity, integrity);
    assert.equal(range.health.phase, 'nominal'); assert.equal(range.health.breakdownCause, null);
    // Idle observation history may grow; the fault exposure and damage stay unchanged.
    const original = JSON.parse(health) as typeof range.health;
    assert.deepEqual(range.health.faults.map(f => [f.exposure, f.damage]), original.faults.map(f => [f.exposure, f.damage]));
    assert.equal(range.speed, 0); assert.equal(range.audioState.engine, false); assert.equal(range.powertrain.rpm, 0);
    assert.equal(range.debrief?.failureReason, 'movement-timeout'); assert.equal(range.debrief?.movementClock?.status, 'expired');
    assert.match(range.debrief!.summary, /three-minute movement limit/);
    const result = range.debrief!, captured = JSON.stringify(result), endedAt = range.time;
    range.tick(1000, { ...idle, throttle: 1, fire: true }); assert.equal(range.time, endedAt); assert.equal(JSON.stringify(result), captured);
    assert.ok(Object.isFrozen(result.movementClock)); range.restart(); assert.equal(JSON.stringify(result), captured);
  }
});

test('valid first arrival requires cleared contacts, a stop and LD; explicit unloading gets its full duration', () => {
  const range = new DrivingRange(); crossDeparture(range); run(range, 179.9);
  range.position = { x: DISMOUNT_POINT.x, z: DISMOUNT_POINT.z };
  range.tick(.025, idle); assert.equal(range.movementClock.status, 'running', 'uncleared contacts cannot settle the clock');
  clearContacts(range); range.speed = 2;
  range.tick(.025, idle); assert.equal(range.movementClock.status, 'running', 'driving through the zone cannot settle the clock');
  range.speed = 0; range.tick(.025, idle);
  assert.equal(range.movementClock.status, 'arrived'); assert.equal(range.mission.status, 'arriving');
  assert.ok(range.movementClock.remainingSeconds > 0 && range.movementClock.remainingSeconds < .05);
  const arrival = range.movementClock;
  // The movement task records its first valid arrival, even if the player later repositions.
  range.position.x += 20; run(range, 1); assert.equal(range.movementClock, arrival); assert.equal(range.missionEnded, false);
  range.position = { x: DISMOUNT_POINT.x, z: DISMOUNT_POINT.z }; run(range, 1);
  assert.equal(range.mission.status, 'arriving'); assert.equal(range.dropRamp(), true);
  run(range, DISMOUNT.durationSeconds);
  assert.equal(range.mission.status, 'complete'); assert.equal(range.debrief?.movementClock, arrival);
  assert.equal(range.dismount.elapsed, DISMOUNT.durationSeconds); assert.equal(range.debrief?.failureReason, null);
});

test('combat, recovery and wrong-zone dismount outcomes retain priority over the movement deadline', () => {
  const combat = new DrivingRange(); crossDeparture(combat); run(combat, 179.975);
  const contact = combat.mission.contacts[0]!;
  combat.position = { x: contact.x, z: contact.z + 20 }; combat.mission.integrity = 2;
  combat.tick(.025, idle); assert.equal(combat.mission.failureReason, 'combat-damage');
  assert.equal(combat.debrief?.failureReason, 'combat-damage');
  const offZone = new DrivingRange(); crossDeparture(offZone); run(offZone, 179.975);
  assert.equal(offZone.dropRamp(), true); run(offZone, DISMOUNT.durationSeconds);
  assert.equal(offZone.mission.failureReason, 'dismount-outside-zone'); assert.equal(offZone.debrief?.outcome, 'failed');
  const recovery = new DrivingRange(); crossDeparture(recovery); run(recovery, 179.975);
  // Existing health decision contract accepts recovery when a fault is present.
  recovery.health.faults[0]!.severity = 'moderate'; recovery.health.phase = 'warning';
  assert.equal(recovery.takeHealthDecision('recovery'), true);
  recovery.tick(.1, idle); assert.equal(recovery.mission.status, 'recovery'); assert.equal(recovery.debrief?.outcome, 'recovery');
});
