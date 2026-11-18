import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingRange } from '../src/range.ts';
import { POINTS_OF_INTEREST, SIDE_ROADS } from '../src/world-config.ts';

const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

test('a driver can follow the western detour, stop at its optional lookout and retain the required mission', () => {
  const range = new DrivingRange(), point = POINTS_OF_INTEREST[0]!;
  const road = SIDE_ROADS[0]!;
  // Approach the western loop through its lower connection, then follow the
  // authored road back toward the lookout. No teleporting or health overrides.
  const route = [road.points[5]!, road.points[4]!, road.points[3]!, point];
  let waypoint = 0;
  range.selectNavigationTarget(point.id);
  for (let step = 0; step < 16000 && !range.missionEnded && !range.exploration.visitedIds.includes(point.id); step++) {
    if (!range.health.paceLimited && range.health.movingSeconds >= 6) range.takeHealthDecision('reduce-pace');
    let target = route[waypoint]!;
    if (waypoint < route.length - 1 && Math.hypot(target.x - range.position.x, target.z - range.position.z) < 12) target = route[++waypoint]!;
    const dx = target.x - range.position.x, dz = target.z - range.position.z;
    const error = wrap(Math.atan2(-dx, -dz) - range.heading);
    const stop = waypoint === route.length - 1 && Math.hypot(dx, dz) < point.radius * .55;
    range.tick(.025, { throttle: stop ? 0 : Math.abs(error) > .6 ? .4 : .85, steer: stop ? 0 : clamp(error * 2), aim: 0, fire: false, brake: stop });
  }
  assert.deepEqual(range.exploration.visitedIds, [point.id], `stopped at ${JSON.stringify(range.position)} after ${range.time.toFixed(1)}s`);
  assert.equal(range.health.paceLimited, true); assert.equal(range.health.breakdownCause, null);
  assert.equal(range.mission.status, 'enroute'); assert.equal(range.mission.remainingContacts, 6);
  assert.equal(range.mission.departureCrossed, false); assert.equal(range.mission.integrity, 100);
  assert.ok(range.distanceTravelled > 750, 'the recorded drive covers the long western detour');
  assert.equal(range.navigationTarget?.id, point.id);
});
