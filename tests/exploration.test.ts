import assert from 'node:assert/strict';
import test from 'node:test';
import { Exploration, VISIT_STOP_SECONDS, VISIT_MAX_SPEED } from '../src/exploration.ts';
import { DrivingRange, terrainAt } from '../src/range.ts';
import { POINTS_OF_INTEREST, SIDE_ROADS, WORLD_BOUNDS, roadDistanceAt, MISSION_ROUTE } from '../src/world-config.ts';

const idle = { throttle: 0, steer: 0, aim: 0, fire: false };
function run(range: DrivingRange, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 40); i++) range.tick(.025, idle);
}

test('expanded area offers two optional hardpack detours and three reachable sites without replacing the mission', () => {
  const oldArea = 640 * 1120;
  assert.ok((WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) > oldArea * 2);
  assert.equal(SIDE_ROADS.length, 2); assert.equal(POINTS_OF_INTEREST.length, 3);
  for (const road of SIDE_ROADS) {
    assert.equal(road.halfWidth, 8);
    for (const point of road.points) {
      assert.equal(roadDistanceAt(point.x, point.z), 0);
      assert.equal(terrainAt(point.x, point.z).kind, 'road');
      assert.ok(point.x >= WORLD_BOUNDS.minX && point.x <= WORLD_BOUNDS.maxX);
      assert.ok(point.z >= WORLD_BOUNDS.minZ && point.z <= WORLD_BOUNDS.maxZ);
    }
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]!, b = road.points[i]!;
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      assert.ok(roadDistanceAt(x, z) < 1e-10);
      assert.equal(terrainAt(x, z).kind, 'road');
    }
  }
  for (const point of POINTS_OF_INTEREST) assert.equal(terrainAt(point.x, point.z).kind, 'road');
  assert.equal(MISSION_ROUTE.length, 7);
  assert.equal(Number.isFinite(roadDistanceAt(NaN, Infinity)), true);
});

test('navigation accepts POIs and bounded map points during pause without moving or changing the objective', () => {
  const range = new DrivingRange(), objective = { ...range.mission.objective }, position = { ...range.position };
  const point = POINTS_OF_INTEREST[0]!;
  range.paused = true;
  assert.equal(range.selectNavigationTarget(point.id), true);
  assert.deepEqual(range.navigationTarget, { id: point.id, label: point.label, x: point.x, z: point.z });
  assert.equal(range.exploration.selectedId, point.id);
  const target = range.navigationTarget;
  assert.equal(range.selectNavigationTarget('unknown'), false);
  assert.equal(range.selectNavigationPoint(NaN, 0), false);
  assert.equal(range.selectNavigationPoint(0, Infinity), false);
  assert.equal(range.navigationTarget, target);
  assert.equal(Object.isFrozen(target), true);
  assert.equal(range.selectNavigationPoint(-9999, 9999), true);
  assert.deepEqual(range.navigationTarget, { label: 'Map waypoint', x: WORLD_BOUNDS.minX, z: WORLD_BOUNDS.maxZ });
  assert.equal(range.exploration.selectedId, null);
  assert.deepEqual(range.position, position); assert.deepEqual(range.mission.objective, objective); assert.equal(range.time, 0);
  range.clearNavigationTarget(); assert.equal(range.navigationTarget, null);
});

test('optional visit needs a continuous stop, resets when leaving or moving, and records each site once', () => {
  const exploration = new Exploration(), point = POINTS_OF_INTEREST[0]!;
  exploration.tick(.75, point, 0);
  assert.equal(exploration.state.stopProgress, .5); assert.deepEqual(exploration.state.visitedIds, []);
  exploration.tick(.1, point, VISIT_MAX_SPEED);
  assert.equal(exploration.state.stopProgress, 0);
  exploration.tick(.75, point, 0);
  exploration.tick(.1, { x: point.x + point.radius + 1, z: point.z }, 0);
  assert.equal(exploration.state.nearbyId, null); assert.equal(exploration.state.stopProgress, 0);
  exploration.tick(VISIT_STOP_SECONDS - .01, point, 0);
  assert.deepEqual(exploration.state.visitedIds, []);
  exploration.tick(.01, point, 0);
  assert.deepEqual(exploration.state.visitedIds, [point.id]); assert.equal(exploration.state.stopProgress, 1);
  exploration.tick(10, point, 0);
  assert.deepEqual(exploration.visitedLabels(), [point.label]);
  assert.equal(Object.isFrozen(exploration.state.visitedIds), true);
});

test('pause freezes partial visits and restart clears navigation and visits without healing or changing mission tasks', () => {
  const range = new DrivingRange(), point = POINTS_OF_INTEREST[0]!;
  range.position = { x: point.x, z: point.z };
  range.selectNavigationTarget(point.id);
  run(range, .75); const stopped = range.exploration, time = range.time;
  range.paused = true; run(range, 10);
  assert.deepEqual(range.exploration, stopped); assert.equal(range.time, time);
  range.paused = false; run(range, .75);
  assert.deepEqual(range.exploration.visitedIds, [point.id]);
  assert.equal(range.health.movingSeconds, 0); assert.equal(range.mission.integrity, 100);
  assert.equal(range.mission.remainingContacts, 6); assert.equal(range.mission.departureCrossed, false);
  range.restart();
  assert.equal(range.navigationTarget, null); assert.deepEqual(range.exploration.visitedIds, []);
  assert.equal(range.exploration.stopProgress, 0); assert.equal(range.exploration.nearbyId, null);
});

test('a visit does not repair faults; terminal debrief keeps detached immutable visit labels through restart', () => {
  const range = new DrivingRange(), point = POINTS_OF_INTEREST[0]!;
  const fault = range.health.faults[0]!;
  fault.damage = 10; fault.exposure = 7; fault.maintenance = 'repair';
  range.position = { x: point.x, z: point.z }; run(range, 1.5);
  assert.equal(fault.damage, 10); assert.equal(fault.exposure, 7); assert.equal(fault.maintenance, 'repair');
  range.mission.status = 'failed'; range.tick(.025, idle);
  const debrief = range.debrief!;
  assert.deepEqual(debrief.optionalVisitedLabels, [point.label]);
  assert.equal(Object.isFrozen(debrief.optionalVisitedLabels), true);
  const state = range.exploration;
  assert.equal(range.selectNavigationTarget(POINTS_OF_INTEREST[1]!.id), false);
  assert.equal(range.selectNavigationPoint(0, 0), false);
  range.position = { x: POINTS_OF_INTEREST[1]!.x, z: POINTS_OF_INTEREST[1]!.z }; run(range, 5);
  assert.deepEqual(range.exploration, state);
  range.restart();
  assert.deepEqual(debrief.optionalVisitedLabels, [point.label]); assert.deepEqual(range.exploration.visitedIds, []);
});
