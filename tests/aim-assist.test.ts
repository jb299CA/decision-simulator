import assert from 'node:assert/strict';
import test from 'node:test';
import { AIM_ASSIST, DrivingRange, type RangeTarget } from '../src/range.ts';

const idle = { throttle: 0, steer: 0, aim: 0, fire: false };
const board = (id: string, x: number, z: number, radius = 1): RangeTarget => ({ id, x, z, radius, kind: 'training', hitUntil: 0, destroyedAt: null, destroyedBy: null });
function isolated(...targets: RangeTarget[]): DrivingRange {
  const range = new DrivingRange(); range.position = { x: 0, z: 0 }; range.targets = targets; return range;
}
function run(range: DrivingRange, seconds: number, input = idle): void {
  for (let i = 0; i < Math.round(seconds * 40); i++) range.tick(.025, input);
}
function barrelError(range: DrivingRange, target: RangeTarget): number {
  const angle = range.heading + range.aimYaw, dx = -Math.sin(angle), dz = -Math.cos(angle);
  const ox = range.position.x + Math.cos(range.heading) * .48 + dx;
  const oz = range.position.z - Math.sin(range.heading) * .48 + dz;
  return Math.abs((target.x - ox) * dz - (target.z - oz) * dx);
}

test('default assist acquires a nearby off-center board without firing and tracks through steering', () => {
  const target = board('practice-1', -16, -36, .15), range = isolated(target);
  range.tick(.025, idle);
  assert.equal(range.aimLock?.targetId, target.id); assert.equal(range.aimLock?.label, 'Board 1');
  assert.equal(range.shotsFired, 0); assert.ok(barrelError(range, target) < 1e-8);
  const initialAim = range.aimYaw;
  run(range, 1, { ...idle, throttle: 1, steer: .6 });
  assert.equal(range.aimLock?.targetId, target.id); assert.notEqual(range.aimYaw, initialAim);
  assert.ok(barrelError(range, target) < 1e-8);
  range.tick(.025, { ...idle, fire: true });
  const shot = range.shots.at(-1)!;
  assert.equal(shot.hitTargetId, target.id); assert.equal(target.destroyedBy, 'shot');
  assert.ok(Math.hypot(shot.end.x - target.x, shot.end.z - target.z) < 1e-8, 'tracer endpoint follows barrel ray to actual target center');
});

test('offset muzzle aims accurately at a close small target', () => {
  const target = board('close', -2, -6, .03), range = isolated(target);
  range.tick(.025, { ...idle, fire: true });
  assert.equal(range.shots[0]!.hitTargetId, target.id); assert.equal(range.hits, 1);
});

test('sticky selection retains its target across better candidates and bounded hysteresis', () => {
  const target = board('first', -20, -60), range = isolated(target);
  range.tick(.025, idle); assert.equal(range.aimLock?.targetId, 'first');
  range.targets.push(board('closer', 1, -20));
  range.tick(.025, idle); assert.equal(range.aimLock?.targetId, 'first');
  range.targets.pop();
  target.x = -125 * Math.sin(65 * Math.PI / 180); target.z = -125 * Math.cos(65 * Math.PI / 180);
  range.tick(.025, idle); assert.equal(range.aimLock?.targetId, 'first');
  range.setAimAssist(false); range.setAimAssist(true); range.tick(.025, idle);
  assert.equal(range.aimLock, null, 'same position is outside acquisition bounds');
});

test('behind, distant, pre-departure, nonfinite and destroyed targets cannot lock', () => {
  const range = isolated(board('behind', 0, 20), board('far', 0, -160), board('wide', -50, -2), board('bad', NaN, -20));
  range.targets.push({ ...board('troop-1', 0, -25), kind: 'enemy' });
  range.tick(.025, idle); assert.equal(range.aimLock, null);
  const enemy = range.targets.at(-1)!;
  range.mission.departureCrossed = true; range.tick(.025, idle); assert.equal(range.aimLock?.targetId, enemy.id);
  range.mission.contacts[0]!.neutralized = true; range.tick(.025, idle); assert.equal(range.aimLock, null);
  enemy.kind = 'training'; enemy.destroyedAt = range.time; range.tick(.025, idle); assert.equal(range.aimLock, null);
});

test('lock releases at range, angle, crushing and mission end; restart clears lock and manual grace', () => {
  const target = board('practice-1', 0, -30), range = isolated(target);
  range.tick(.025, idle); assert.ok(range.aimLock);
  target.z = -AIM_ASSIST.retainDistance - 2; range.tick(.025, idle); assert.equal(range.aimLock, null);
  target.z = -30; range.tick(.025, idle); assert.ok(range.aimLock);
  range.heading = Math.PI; range.tick(.025, idle); assert.equal(range.aimLock, null);
  range.heading = 0; range.tick(.025, idle); assert.ok(range.aimLock);
  range.position = { x: target.x, z: target.z }; range.tick(.025, idle);
  assert.equal(target.destroyedBy, 'vehicle'); assert.equal(range.aimLock, null);
  range.position.z = 0; range.targets = [board('next', 0, -30)]; range.tick(.025, idle); assert.ok(range.aimLock);
  range.mission.status = 'complete'; range.tick(.025, idle); assert.equal(range.aimLock, null);
  range.restart(); assert.equal(range.aimLock, null); assert.equal(range.manualAimActive, false);
});

test('manual input overrides without auto hits, pause freezes grace, center and toggle remain explicit', () => {
  const range = isolated(board('practice-1', 0, -30)); range.tick(.025, idle); assert.ok(range.aimLock);
  run(range, .3, { ...idle, aim: 1 }); assert.equal(range.aimLock, null); assert.equal(range.manualAimActive, true);
  range.tick(.025, { ...idle, fire: true }); assert.equal(range.hits, 0, 'manual fire cannot receive a hidden lock hit');
  range.paused = true; const frozen = JSON.stringify(range); range.tick(20, { ...idle, aim: -1, fire: true });
  assert.equal(JSON.stringify(range), frozen);
  range.paused = false; range.tick(20, idle); assert.equal(range.aimLock, null); assert.equal(range.manualAimActive, true);
  run(range, AIM_ASSIST.manualGrace); assert.equal(range.aimLock?.targetId, 'practice-1');
  range.centerAim(); assert.equal(range.aimYaw, 0); assert.equal(range.aimLock, null); assert.equal(range.manualAimActive, true);
  range.setAimAssist(false); run(range, 2); assert.equal(range.aimLock, null);
  range.setAimAssist(true); range.tick(.025, idle); assert.ok(range.aimLock);
});

test('an intervening live target receives the lock and actual hit before a blocked target', () => {
  const range = isolated(board('far', .48, -80), board('near', .48, -20));
  range.tick(.025, idle); assert.equal(range.aimLock?.targetId, 'near');
  range.tick(.025, { ...idle, fire: true }); assert.equal(range.shots.at(-1)?.hitTargetId, 'near');
  range.tick(.025, idle); assert.equal(range.aimLock?.targetId, 'far');
});


test('gun truck lock uses the smaller soft-skin profile and clears after four landed rounds', () => {
  const range = new DrivingRange();
  const truck = range.mission.contacts.find(contact => contact.id === 'vehicle-1')!;
  for (const contact of range.mission.contacts) if (contact !== truck) { contact.neutralized = true; contact.health = 0; }
  range.position = { x: truck.x - .48, z: truck.z + 90 };
  range.tick(.025, idle);
  assert.equal(range.mission.departureCrossed, true);
  assert.equal(range.aimLock?.targetId, truck.id);
  assert.equal(range.aimLock?.label, 'Gun truck 1');
  assert.equal(truck.radius, 2); assert.equal(truck.maxHealth, 4);
  assert.match(range.mission.notice, /enemy gun truck contact marked/);
  for (let round = 1; round <= 4; round++) {
    range.tick(.025, { ...idle, fire: true });
    assert.equal(truck.health, 4 - round);
    assert.equal(truck.neutralized, round === 4);
    if (round < 4) {
      assert.equal(range.aimLock?.targetId, truck.id);
      run(range, .15);
    }
  }
  assert.equal(range.targets.find(target => target.id === truck.id)?.destroyedBy, 'shot');
  assert.equal(range.aimLock, null);
  assert.equal(range.hits, 4);
});
