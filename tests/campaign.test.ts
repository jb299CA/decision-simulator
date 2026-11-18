import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingRange, RANGE_BOUNDS, terrainAt, type RangeContact } from '../src/range.ts';
import { WORLD_BOUNDS, MISSION_START, DEPARTURE_Z, DISMOUNT_POINT, MISSION_ROUTE, PRACTICE_TARGETS, ENEMY_CONTACTS } from '../src/world-config.ts';

const idle = { throttle: 0, steer: 0, aim: 0, fire: false };
function run(range: DrivingRange, seconds: number, input = idle): void {
  for (let i = 0; i < Math.round(seconds * 40); i++) range.tick(.025, input);
}
function fireRounds(range: DrivingRange, count: number): void {
  for (let i = 0; i < count; i++) {
    range.tick(.025, { ...idle, fire: true });
    run(range, .15);
  }
}
function aimAt(range: DrivingRange, contact: RangeContact): void {
  range.heading = 0;
  range.aimYaw = Math.atan2(-(contact.x - range.position.x - .48), -(contact.z - range.position.z));
}
function clearContacts(range: DrivingRange): void {
  for (const contact of range.mission.contacts) {
    range.position = { x: contact.x - .48, z: contact.z + 20 };
    range.heading = 0; range.aimYaw = 0; range.speed = 0;
    fireRounds(range, contact.maxHealth);
    assert.equal(contact.neutralized, true, `${contact.id} must be cleared through landed rounds`);
  }
}
function isolateContact(range: DrivingRange, id: string): RangeContact {
  for (const contact of range.mission.contacts) {
    if (contact.id !== id) { contact.neutralized = true; contact.health = 0; contact.neutralizedAt = 0; }
  }
  return range.mission.contacts.find(contact => contact.id === id)!;
}

test('expanded world and winding mission route are shared configuration with staged encounter state', () => {
  const range = new DrivingRange();
  assert.equal(RANGE_BOUNDS, WORLD_BOUNDS);
  assert.equal(RANGE_BOUNDS.maxX - RANGE_BOUNDS.minX, 1040);
  assert.equal(RANGE_BOUNDS.maxZ - RANGE_BOUNDS.minZ, 1440);
  assert.deepEqual(range.position, MISSION_START);
  assert.deepEqual(range.mission.objective, DISMOUNT_POINT);
  assert.deepEqual(range.mission.waypoints, MISSION_ROUTE.map(({ x, z }) => ({ x, z })));
  const routeLength = MISSION_ROUTE.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - MISSION_ROUTE[index]!.x, point.z - MISSION_ROUTE[index]!.z), 0);
  const previousRouteLength = 32 + Math.hypot(18, 26) + Math.hypot(12, 50);
  assert.ok(routeLength > previousRouteLength * 8);
  assert.equal(range.mission.currentWaypoint, 1);
  assert.equal(range.mission.phase, 'training'); assert.equal(range.mission.departureCrossed, false);
  assert.equal(range.mission.remainingContacts, 6);
  assert.equal(range.targets.filter(target => target.kind === 'training').length, PRACTICE_TARGETS.length);
  assert.equal(range.mission.contacts.filter(contact => contact.kind === 'troop').length, 4);
  const trucks = range.mission.contacts.filter(contact => contact.kind === 'vehicle');
  assert.deepEqual(trucks.map(({ id, x, z, radius, maxHealth }) => ({ id, x, z, radius, maxHealth })), [
    { id: 'vehicle-1', x: -44, z: -355, radius: 2, maxHealth: 4 },
    { id: 'vehicle-2', x: 62, z: -700, radius: 2, maxHealth: 4 },
  ]);
  assert.ok(range.mission.contacts.every(contact => contact.health === contact.maxHealth && contact.neutralizedAt === null));
});

test('enemy detection, damage and landed rounds are gated before the actual departure crossing', () => {
  const range = new DrivingRange(), contact = range.mission.contacts[0]!;
  range.position = { x: 0, z: DEPARTURE_Z + .1 }; aimAt(range, contact);
  fireRounds(range, 8);
  assert.equal(range.mission.departureCrossed, false);
  assert.equal(range.mission.phase, 'training'); assert.equal(range.mission.integrity, 100);
  assert.equal(range.hits, 0); assert.ok(range.mission.contacts.every(contact => !contact.detected && contact.health === contact.maxHealth));
  assert.ok(range.targets.filter(target => target.kind === 'enemy').every(target => target.destroyedAt === null && target.hitUntil === 0));
  range.speed = 18;
  range.tick(.025, { ...idle, throttle: 1 });
  assert.ok(range.position.z < DEPARTURE_Z);
  assert.equal(range.mission.departureCrossed, true); assert.equal(range.mission.phase, 'combat');
  assert.equal(contact.detected, true); assert.equal(range.mission.integrity, 100, 'detection at 90 units cannot apply return fire');
  aimAt(range, contact); fireRounds(range, 1);
  assert.equal(contact.health, 1); assert.equal(range.hits, 1);
  range.position = { x: 0, z: 80 }; range.speed = 0; range.tick(.025, idle);
  assert.equal(range.mission.departureCrossed, true, 'backtracking does not restore training immunity');
  assert.equal(range.mission.phase, 'combat');
});

test('practice boards crush on swept hull overlap, leave permanent debris, and never block driving', () => {
  const range = new DrivingRange(), target = range.targets[0]!;
  range.position = { x: target.x + 3.4, z: target.z + 10 }; range.speed = 18;
  run(range, 1, { ...idle, throttle: 1 });
  assert.equal(target.destroyedBy, 'vehicle'); assert.notEqual(target.destroyedAt, null);
  assert.equal(target.hitUntil, Infinity); assert.equal(range.shotsFired, 0); assert.equal(range.hits, 0);
  assert.ok(range.position.z < target.z); assert.ok(range.speed > 10);
  const destroyedAt = target.destroyedAt;
  range.position = { x: target.x, z: target.z + 8 }; range.speed = 18;
  run(range, 10, { ...idle, throttle: 1 });
  assert.equal(target.destroyedAt, destroyedAt); assert.equal(target.destroyedBy, 'vehicle');
  assert.equal(target.hitUntil, Infinity); assert.equal(range.hits, 0);
  const miss = new DrivingRange(), intact = miss.targets[0]!;
  miss.position = { x: intact.x + 3.6, z: intact.z + 10 }; miss.speed = 18;
  run(miss, 1, { ...idle, throttle: 1 });
  assert.equal(intact.destroyedAt, null, 'a near miss outside the hull plus board radius stays intact');
});

test('swept practice-board collision catches a maximum-speed grazing path between frame endpoints', () => {
  const range = new DrivingRange(), target = range.targets[0]!;
  range.position = { x: target.x + 3.499, z: target.z + .225 }; range.speed = 18;
  assert.ok(Math.hypot(range.position.x - target.x, range.position.z - target.z) > 3.5);
  range.tick(.025, { ...idle, throttle: 1 });
  assert.ok(Math.hypot(range.position.x - target.x, range.position.z - target.z) > 3.5);
  assert.equal(target.destroyedBy, 'vehicle'); assert.equal(range.hits, 0); assert.equal(range.shotsFired, 0);
});

test('troops and soft-skin gun trucks require their own multiple-hit counts and neutralization is permanent', () => {
  const range = new DrivingRange();
  for (const contact of range.mission.contacts) {
    range.position = { x: contact.x - .48, z: contact.z + 20 }; range.heading = 0; range.aimYaw = 0;
    const target = range.targets.find(target => target.id === contact.id)!;
    const hits = range.hits;
    fireRounds(range, 1);
    assert.equal(contact.health, contact.maxHealth - 1);
    assert.equal(contact.neutralized, false); assert.equal(contact.neutralizedAt, null); assert.equal(target.destroyedAt, null);
    const shot = range.shots.find(shot => shot.hitTargetId === contact.id)!;
    assert.equal(shot.end.y, terrainAt(contact.x, contact.z).height + (contact.kind === 'troop' ? 1.25 : 2.2));
    fireRounds(range, contact.maxHealth - 1);
    assert.equal(range.hits - hits, contact.maxHealth); assert.equal(contact.health, 0);
    assert.equal(contact.neutralized, true); assert.equal(contact.detected, true); assert.notEqual(contact.neutralizedAt, null);
    if (contact.kind === 'vehicle') assert.match(range.mission.notice, /enemy gun truck neutralized/);
    assert.equal(target.destroyedAt, contact.neutralizedAt); assert.equal(target.destroyedBy, 'shot'); assert.equal(target.hitUntil, Infinity);
  }
  assert.equal(range.hits, ENEMY_CONTACTS.reduce((sum, contact) => sum + contact.maxHealth, 0));
  assert.equal(range.mission.remainingContacts, 0); assert.equal(range.mission.phase, 'dismount');
  const timestamps = range.mission.contacts.map(contact => contact.neutralizedAt), integrity = range.mission.integrity, hits = range.hits;
  run(range, 10, { ...idle, fire: true });
  assert.deepEqual(range.mission.contacts.map(contact => contact.neutralizedAt), timestamps);
  assert.equal(range.hits, hits); assert.equal(range.mission.integrity, integrity, 'neutralized enemies never resume return fire');
});

test('return fire uses distinct troop and gun truck simulation cadences and pause freezes combat', () => {
  for (const [id, damage, cadence] of [['troop-1', 2, 3], ['vehicle-1', 4, 4.5]] as const) {
    const range = new DrivingRange(), contact = isolateContact(range, id);
    range.position = { x: contact.x, z: contact.z + 20 };
    range.tick(.025, idle);
    assert.equal(range.mission.integrity, 100 - damage);
    const attackTime = contact.lastAttackTime;
    run(range, cadence - .05); assert.equal(range.mission.integrity, 100 - damage);
    range.paused = true; const snapshot = JSON.stringify(range);
    range.tick(100, { ...idle, throttle: 1, fire: true }); assert.equal(JSON.stringify(range), snapshot);
    range.paused = false; run(range, .05);
    assert.equal(range.mission.integrity, 100 - damage * 2);
    assert.ok(contact.lastAttackTime - attackTime >= cadence - 1e-9);
  }
});

test('detection has a 130-unit radius and return fire a 70-unit radius', () => {
  const range = new DrivingRange(), contact = isolateContact(range, 'troop-4');
  range.position = { x: contact.x, z: contact.z + 130.1 }; range.tick(.025, idle);
  assert.equal(contact.detected, false); assert.equal(range.mission.integrity, 100);
  range.position.z = contact.z + 130; range.tick(.025, idle);
  assert.equal(contact.detected, true); assert.equal(range.mission.integrity, 100);
  range.position.z = contact.z + 70.1; range.tick(.025, idle); assert.equal(range.mission.integrity, 100);
  range.position.z = contact.z + 70; range.tick(.025, idle); assert.equal(range.mission.integrity, 98);
});

test('reaching dismount early cannot complete; clearing every contact enables a stopped two-second hold', () => {
  const range = new DrivingRange(); range.position = { x: DISMOUNT_POINT.x, z: DISMOUNT_POINT.z };
  run(range, 2.5);
  assert.equal(range.mission.status, 'enroute'); assert.equal(range.mission.arrivalProgress, 0);
  assert.equal(range.mission.remainingContacts, 6); assert.match(range.mission.notice, /6 fictional contacts remaining/);
  clearContacts(range);
  assert.equal(range.mission.remainingContacts, 0); assert.equal(range.mission.phase, 'dismount');
  range.position = { x: DISMOUNT_POINT.x, z: DISMOUNT_POINT.z }; range.speed = 0;
  run(range, 1);
  assert.equal(range.mission.status, 'arriving'); assert.ok(Math.abs(range.mission.arrivalProgress - .5) < 1e-8);
  range.speed = 2; range.tick(.1, idle);
  assert.equal(range.mission.status, 'enroute'); assert.equal(range.mission.arrivalProgress, 0);
  range.speed = 0; run(range, 2);
  assert.equal(range.mission.status, 'complete'); assert.equal(range.mission.arrivalProgress, 1);
  assert.equal(range.audioState.engine, false); assert.equal(range.powertrain.rpm, 0); assert.equal(range.powertrain.whine, 0);
  const position = { ...range.position }, aim = range.aimYaw, shots = range.shotsFired, integrity = range.mission.integrity;
  run(range, 1, { throttle: 1, steer: 1, aim: 1, fire: true });
  assert.deepEqual(range.position, position); assert.equal(range.speed, 0); assert.equal(range.aimYaw, aim);
  assert.equal(range.shotsFired, shots); assert.equal(range.mission.integrity, integrity);
});

test('integrity depletion fails with engine off and restart restores all mission, target and crew state', () => {
  const range = new DrivingRange(), contact = isolateContact(range, 'vehicle-1');
  range.position = { x: contact.x, z: contact.z + 20 }; range.mission.integrity = 4;
  range.tick(.025, { ...idle, throttle: 1 });
  assert.equal(range.mission.status, 'failed'); assert.equal(range.mission.integrity, 0);
  assert.equal(range.speed, 0); assert.equal(range.audioState.engine, false); assert.equal(range.powertrain.rpm, 0);
  const shots = range.shotsFired, health = JSON.stringify(range.health);
  run(range, 1, { ...idle, fire: true, throttle: 1 });
  assert.equal(range.shotsFired, shots); assert.equal(JSON.stringify(range.health), health);
  range.paused = true; range.restart();
  assert.deepEqual(range.position, MISSION_START); assert.equal(range.paused, false); assert.equal(range.time, 0);
  assert.equal(range.mission.status, 'enroute'); assert.equal(range.mission.phase, 'training');
  assert.equal(range.mission.departureCrossed, false); assert.equal(range.mission.remainingContacts, 6);
  assert.equal(range.mission.integrity, 100); assert.equal(range.mission.arrivalProgress, 0);
  assert.ok(range.mission.contacts.every(contact => !contact.detected && !contact.neutralized && contact.health === contact.maxHealth && contact.neutralizedAt === null && contact.lastAttackTime === -Infinity));
  assert.ok(range.targets.every(target => target.hitUntil === 0 && target.destroyedAt === null && target.destroyedBy === null));
  assert.equal(range.shotsFired, 0); assert.equal(range.hits, 0); assert.equal(range.lastShotTime, -Infinity); assert.deepEqual(range.shots, []);
  assert.equal(range.powertrain.rpm, 720); assert.equal(range.powertrain.gear, 1); assert.equal(range.health.phase, 'nominal');
});
