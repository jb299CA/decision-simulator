import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingRange, RANGE_BOUNDS, terrainAt } from '../src/range.ts';
import { MISSION_START, roadCenterAt } from '../src/world-config.ts';
import { mphToMps } from '../src/driving-dynamics.ts';

const idle = { throttle: 0, steer: 0, aim: 0, fire: false };
function run(range: DrivingRange, seconds: number, input = idle): void {
  for (let i = 0; i < Math.round(seconds * 20); i++) range.tick(.05, input);
}

test('terrain follows the winding road with smooth shoulders and bounded fictional handling', () => {
  for (const z of [80, -60, -140, -340, -570, -760, -920]) {
    const center = roadCenterAt(z);
    assert.equal(terrainAt(center, z).kind, 'road');
    assert.equal(terrainAt(center, z).height, 0);
    assert.equal(terrainAt(center + 8, z).height, 0);
    assert.ok(Math.abs(terrainAt(center + 8.001, z).height) < 1e-7);
  }
  assert.equal(terrainAt(8, 0).kind, 'grass');
  assert.equal(terrainAt(130, -60).kind, 'rock');
  assert.equal(terrainAt(-130, -360).kind, 'wash');
  assert.equal(terrainAt(-130, 0).kind, 'grass');
  assert.ok(terrainAt(130, 0).speedFactor < terrainAt(0, 0).speedFactor);
  assert.ok(terrainAt(-130, -360).grip < terrainAt(0, 0).grip);
  assert.ok(Object.values(terrainAt(NaN, Infinity)).every(value => typeof value !== 'number' || Number.isFinite(value)));
  for (let x = RANGE_BOUNDS.minX; x <= RANGE_BOUNDS.maxX; x += 10) {
    for (let z = RANGE_BOUNDS.minZ; z <= RANGE_BOUNDS.maxZ; z += 10) assert.ok(Math.abs(terrainAt(x, z).height) <= .9);
  }
});

test('deterministic driving accelerates, brakes, reverses and steers with documented forward direction', () => {
  const a = new DrivingRange(), b = new DrivingRange();
  run(a, 2, { ...idle, throttle: 1 }); run(b, 2, { ...idle, throttle: 1 });
  assert.deepEqual(a.position, b.position);
  assert.ok(a.position.z < MISSION_START.z); assert.equal(a.position.x, 0); assert.ok(a.speed > 4 && a.speed < 5);
  run(a, 2, { ...idle, brake: true }); assert.equal(a.speed, 0);
  const stopped = { ...a.position };
  run(a, 1, { ...idle, steer: 1 }); assert.deepEqual(a.position, stopped); assert.equal(a.heading, 0);
  run(a, 1, { ...idle, throttle: 1, steer: 1 });
  assert.ok(a.heading > 0); assert.ok(a.position.x < stopped.x);
  const reverse = new DrivingRange(); run(reverse, 2, { ...idle, throttle: -1 });
  assert.ok(reverse.speed < 0); assert.ok(reverse.position.z > MISSION_START.z);
  const rough = new DrivingRange(); rough.position = { x: 145, z: 35 };
  run(rough, 3, { ...idle, throttle: 1 });
  assert.ok(rough.speed <= mphToMps(18) + 1e-6);
});

test('world bounds and nonfinite inputs cannot move the vehicle outside the game area', () => {
  const range = new DrivingRange();
  range.position = { x: 0, z: RANGE_BOUNDS.minZ + .01 }; range.speed = 18;
  range.tick(.1, { ...idle, throttle: 1 });
  assert.equal(range.position.z, RANGE_BOUNDS.minZ); assert.equal(range.speed, 0);
  range.position.x = NaN; range.heading = Infinity; range.speed = NaN;
  range.tick(.1, { throttle: NaN, steer: Infinity, aim: NaN, fire: false });
  assert.ok([range.time, range.position.x, range.position.z, range.heading, range.speed, range.aimYaw].every(Number.isFinite));
  const snapshot = JSON.stringify(range);
  range.tick(NaN, idle); range.tick(-1, idle); range.tick(0, idle);
  assert.equal(JSON.stringify(range), snapshot);
  const oldTime = range.time; range.tick(60, idle);
  assert.ok(Math.abs(range.time - oldTime - .1) < 1e-9, 'background backlog is discarded');
});

test('MPH HUD limits follow surface, signed direction, crew mitigation and terminal state', () => {
  const range = new DrivingRange();
  assert.equal(range.speedLimitMph, 60); assert.equal(range.speedMph, 0);
  range.position = { x: 40, z: 40 }; assert.equal(range.speedLimitMph, 45);
  assert.equal(range.speedLimitReason, 'Dry grassland');
  range.position = { x: 150, z: 40 }; assert.equal(range.speedLimitMph, 18);
  range.position = { x: -150, z: -400 }; assert.equal(range.speedLimitMph, 25);
  range.speed = -mphToMps(10); assert.equal(range.speedMph, -10);
  assert.equal(range.speedLimitMph, 10); assert.equal(range.speedLimitReason, 'Reverse');
  range.health.phase = 'critical'; assert.equal(range.speedLimitMph, 6);
  assert.equal(range.speedLimitReason, 'Vehicle fault');
  range.takeHealthDecision('reduce-pace'); assert.equal(range.speedLimitMph, 5.5);
  assert.equal(range.speedLimitReason, 'Crew reduced pace');
  range.mission.status = 'failed'; assert.equal(range.speedLimitMph, 0);
  assert.equal(range.speedLimitReason, 'Exercise ended');
  range.restart(); assert.equal(range.speedLimitMph, 60); assert.equal(range.steeringAngle, 0);
});

test('surface and health reductions decelerate gradually while pause preserves applied steering', () => {
  const range = new DrivingRange(); range.position = { x: 150, z: 40 }; range.speed = mphToMps(60);
  range.tick(.025, { ...idle, throttle: 1, steer: 1 });
  assert.ok(range.speedMph > 59 && range.speedMph < 60);
  assert.equal(range.speedLimitMph, 18);
  range.position = { x: 0, z: 40 }; range.health.phase = 'critical'; range.speed = mphToMps(60);
  range.tick(.025, { ...idle, throttle: 1, steer: 1 });
  assert.ok(range.speedMph > 59, 'fault onset does not snap the current speed');
  range.paused = true; const angle = range.steeringAngle;
  range.tick(.1, { ...idle, steer: -1 }); assert.equal(range.steeringAngle, angle);
});

test('arcade shots permanently break boards, respect cooldown, expire and bound effect history', () => {
  const range = new DrivingRange();
  range.tick(.025, { ...idle, fire: true });
  assert.equal(range.shotsFired, 1); assert.equal(range.hits, 1);
  assert.equal(range.shots[0]!.hitTargetId, 'practice-1');
  const first = range.targets[0]!;
  assert.equal(first.hitUntil, Infinity); assert.equal(first.destroyedAt, range.time); assert.equal(first.destroyedBy, 'shot');
  range.tick(.025, { ...idle, fire: true }); assert.equal(range.shotsFired, 1);
  run(range, .5, { ...idle, fire: true });
  assert.ok(range.shotsFired <= 4, 'held trigger follows simulation cooldown');
  const timestamp = first.destroyedAt;
  run(range, 9, { ...idle, fire: true });
  assert.equal(first.destroyedAt, timestamp, 'broken boards never respawn or receive new timestamps');
  assert.equal(first.hitUntil, Infinity);
  assert.ok(range.hits <= 6, 'training fire cannot damage dormant enemy contacts');
  run(range, 1.65); assert.equal(range.shots.length, 0);
  run(range, 10, { ...idle, fire: true });
  assert.ok(range.shots.length <= 16);
  assert.ok(range.shots.every(shot => range.time - shot.createdAt < 1.6));
  const miss = new DrivingRange(); miss.setAimAssist(false); miss.aimYaw = Math.PI;
  miss.tick(.05, { ...idle, fire: true }); assert.equal(miss.hits, 0); assert.equal(miss.shots[0]!.hitTargetId, undefined);
});

test('aim is a relative rate; pause freezes every range field and resume has no catchup', () => {
  const range = new DrivingRange(); run(range, 1, { ...idle, aim: 1 });
  assert.ok(Math.abs(range.aimYaw - 1.35) < 1e-8);
  range.tick(.05, { ...idle, fire: true });
  range.paused = true; const snapshot = JSON.stringify(range);
  range.tick(100, { throttle: 1, steer: 1, aim: 1, fire: true });
  assert.equal(JSON.stringify(range), snapshot);
  const before = range.time; range.paused = false; range.tick(.05, idle);
  assert.ok(Math.abs(range.time - before - .05) < 1e-9);
});

test('audio adapter is stable, follows movement and never advances the guided fault', () => {
  const range = new DrivingRange(), audio = range.audioState;
  assert.equal(audio.phase, 'cabin'); assert.equal(audio.engine, true); assert.equal(audio.moving, false);
  run(range, 1, { ...idle, throttle: 1 });
  assert.equal(range.audioState, audio); assert.equal(audio.time, range.time); assert.ok(audio.moving);
  assert.ok(audio.speed > 0 && audio.speed <= 1); assert.equal(audio.faultSeverity, 0); assert.deepEqual(audio.observations, []);
  range.paused = true; assert.equal(range.audioState.paused, true);
  range.restart(); assert.equal(range.audioState, audio); assert.equal(audio.moving, false);
  assert.deepEqual(range.position, MISSION_START); assert.equal(range.paused, false);
  assert.equal(range.time, 0); assert.equal(range.shotsFired, 0); assert.equal(range.hits, 0);
  assert.equal(range.shots.length, 0); assert.ok(range.targets.every(target => target.hitUntil === 0));
});

test('range engine revs and whine respond to throttle while stationary; pause freezes the drivetrain', () => {
  const range = new DrivingRange(); run(range, 1, { ...idle, throttle: 1, brake: true });
  assert.equal(range.speed, 0); assert.ok(range.powertrain.rpm > 1500); assert.ok(range.powertrain.whine > .35);
  range.paused = true; const state = { ...range.powertrain };
  range.tick(.1, idle); assert.deepEqual(range.powertrain, state);
  range.paused = false; run(range, 2);
  assert.ok(range.powertrain.rpm < state.rpm - 500); assert.ok(range.powertrain.whine < state.whine);
});

const orbit = { ...idle, throttle: 1, steer: 1 };

test('moving time deterministically raises health alerts; idle, engine revs and pause do not', () => {
  const a = new DrivingRange(), b = new DrivingRange();
  run(a, 10, { ...idle, throttle: 1, brake: true });
  assert.equal(a.health.phase, 'nominal'); assert.equal(a.health.movingSeconds, 0);
  a.restart();
  run(a, 5.95, orbit); run(b, 5.95, orbit);
  assert.equal(a.health.phase, 'nominal');
  run(a, .1, orbit); run(b, .1, orbit);
  assert.equal(a.health.phase, 'warning'); assert.equal(a.health.alertSerial, 1);
  assert.deepEqual(a.health, b.health);
  a.paused = true; const frozen = JSON.stringify(a.health), time = a.time;
  run(a, 20, orbit);
  assert.equal(JSON.stringify(a.health), frozen); assert.equal(a.time, time);
  a.paused = false; run(a, .1, orbit);
  assert.ok(a.health.movingSeconds < 6.2, 'resume adds only current simulated movement');
});

test('diagnosis is inspection, continue retains the fault, and ignored warning also escalates', () => {
  const range = new DrivingRange();
  assert.equal(range.takeHealthDecision('continue'), false);
  assert.equal(range.takeHealthDecision('recovery'), false);
  assert.equal(range.takeHealthDecision('diagnose'), true);
  assert.equal(range.health.phase, 'nominal');
  run(range, 6.1, orbit);
  assert.equal(range.health.diagnosed, false, 'new warning requires inspection of new evidence');
  range.paused = true;
  const moving = range.health.movingSeconds, time = range.time;
  assert.equal(range.takeHealthDecision('diagnose'), true);
  assert.match(range.health.message, /not a proven diagnosis/);
  assert.equal(range.health.phase, 'warning');
  assert.equal(range.takeHealthDecision('continue'), true);
  assert.equal(range.health.continued, true); assert.equal(range.health.phase, 'warning');
  assert.equal(range.health.movingSeconds, moving); assert.equal(range.time, time);
  range.paused = false; run(range, 24.1, orbit);
  assert.equal(range.health.phase, 'critical'); assert.equal(range.health.alertSerial, 3);
  assert.ok(range.health.continuedSeconds >= 24);
  assert.equal(range.health.paceLimited, false, 'acknowledgement alone does not mitigate exposure');
  range.takeHealthDecision('reduce-pace');
  run(range, 4, orbit);
  assert.ok(Math.abs(range.speed) <= mphToMps(range.speedLimitMph) + 1e-6);
  const ignored = new DrivingRange(); run(ignored, 30.2, orbit);
  assert.equal(ignored.health.phase, 'critical'); assert.equal(ignored.health.continued, false);
});

test('paused recovery stops engine immediately, blocks commands, freezes health and restarts cleanly', () => {
  const range = new DrivingRange(); run(range, 6.1, orbit);
  range.paused = true;
  assert.equal(range.takeHealthDecision('recovery'), true);
  assert.equal(range.mission.status, 'recovery'); assert.equal(range.missionEnded, true);
  assert.equal(range.speed, 0); assert.equal(range.audioState.engine, false);
  assert.equal(range.powertrain.rpm, 0); assert.equal(range.powertrain.whine, 0);
  assert.equal(range.debrief?.outcome, 'recovery');
  assert.match(range.health.message, /repair still required/);
  assert.match(range.health.message, /No real request was sent/);
  const health = JSON.stringify(range.health), position = { ...range.position }, aim = range.aimYaw, shots = range.shotsFired;
  assert.equal(range.takeHealthDecision('diagnose'), false);
  assert.equal(range.takeHealthDecision('continue'), false);
  assert.equal(range.takeHealthDecision('recovery'), false);
  range.paused = false; run(range, 20, { ...orbit, aim: 1, fire: true });
  assert.equal(JSON.stringify(range.health), health); assert.deepEqual(range.position, position);
  assert.equal(range.aimYaw, aim); assert.equal(range.shotsFired, shots);
  range.restart();
  assert.equal(range.health.phase, 'nominal'); assert.equal(range.health.alertSerial, 0);
  assert.equal(range.health.baseline, .42); assert.equal(range.health.signal, .42);
  assert.equal(range.health.movingSeconds, 0); assert.equal(range.health.continuedSeconds, 0);
  assert.equal(range.health.continued, false); assert.equal(range.health.diagnosed, false);
  assert.deepEqual(range.health.decisions, []); assert.deepEqual(range.health.observations, [{ time: 0, value: .42 }]);
  assert.equal(range.missionEnded, false); assert.equal(range.audioState.engine, true);
  assert.equal(range.debrief, null); assert.equal(range.distanceTravelled, 0);
});

test('completed or failed exercises cannot inspect or trigger new health alerts', () => {
  const range = new DrivingRange(); range.mission.status = 'complete';
  assert.equal(range.takeHealthDecision('diagnose'), false);
  const health = JSON.stringify(range.health); run(range, 20, orbit);
  assert.equal(JSON.stringify(range.health), health);
  range.mission.status = 'failed';
  assert.equal(range.takeHealthDecision('diagnose'), false);
});

test('ignored faults break down, stop firing and freeze a detached debrief through restart', () => {
  const range = new DrivingRange(); run(range, 100, { ...orbit, fire: true });
  assert.equal(range.mission.status, 'breakdown'); assert.equal(range.health.phase, 'broken');
  assert.equal(range.health.breakdownCause, 'cooling'); assert.equal(range.speed, 0);
  assert.equal(range.audioState.engine, false); assert.equal(range.powertrain.rpm, 0);
  assert.equal(range.debrief?.outcome, 'breakdown'); assert.equal(range.debrief?.vehicleStatus, 'immobilized');
  const debrief = range.debrief!, saved = JSON.stringify(debrief), time = range.time;
  const shots = range.shotsFired, distance = range.distanceTravelled, health = JSON.stringify(range.health);
  run(range, 20, { ...orbit, fire: true, aim: 1 });
  assert.equal(range.time, time); assert.equal(range.shotsFired, shots); assert.equal(range.distanceTravelled, distance);
  assert.equal(JSON.stringify(range.health), health); assert.equal(JSON.stringify(range.debrief), saved);
  assert.equal(range.takeHealthDecision('reduce-pace'), false);
  assert.equal(Object.isFrozen(debrief), true); assert.equal(Object.isFrozen(debrief.findings[0]), true);
  range.restart(); run(range, 6.1, orbit);
  assert.equal(range.debrief, null); assert.equal(JSON.stringify(debrief), saved);
});

test('combat failure receives a debrief independently of the mechanical fault path', () => {
  const range = new DrivingRange(), contact = range.mission.contacts[0]!;
  range.position = { x: contact.x, z: contact.z + 20 }; range.mission.integrity = 2;
  range.tick(.025, idle);
  assert.equal(range.mission.status, 'failed'); assert.equal(range.debrief?.outcome, 'failed');
  assert.equal(range.audioState.engine, false); assert.equal(range.powertrain.rpm, 0);
  assert.equal(range.debrief?.contactsTotal, range.mission.contacts.length);
});
