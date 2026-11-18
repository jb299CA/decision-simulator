import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPoint, mapWorldPoint, mapHeading, MAP_VIEW, contactVisibility } from '../src/mission-map.ts';
import { WORLD_BOUNDS, DEPARTURE_Z, DISMOUNT_POINT, MISSION_START } from '../src/world-config.ts';

test('the entire expanded world maps north-up into stable padded corners', () => {
  assert.deepEqual(mapPoint(WORLD_BOUNDS.minX, WORLD_BOUNDS.minZ), { x: 12, y: 12 });
  assert.deepEqual(mapPoint(WORLD_BOUNDS.maxX, WORLD_BOUNDS.maxZ), { x: MAP_VIEW.width - 12, y: MAP_VIEW.height - 12 });
  assert.deepEqual(mapPoint(-9999, -9999), mapPoint(WORLD_BOUNDS.minX, WORLD_BOUNDS.minZ));
  assert.deepEqual(mapPoint(9999, 9999), mapPoint(WORLD_BOUNDS.maxX, WORLD_BOUNDS.maxZ));
  assert.ok(Number.isFinite(mapPoint(NaN, Infinity).x));
  assert.ok(Number.isFinite(mapPoint(NaN, Infinity).y));
});

test('departure line separates the visible staging area and distant objective', () => {
  const start = mapPoint(MISSION_START.x, MISSION_START.z);
  const line = mapPoint(0, DEPARTURE_Z);
  const objective = mapPoint(DISMOUNT_POINT.x, DISMOUNT_POINT.z);
  assert.ok(start.y > line.y && line.y > objective.y);
  assert.ok(objective.x > start.x);
  assert.ok(objective.y >= MAP_VIEW.inset && start.y <= MAP_VIEW.height - MAP_VIEW.inset);
});

test('heading stays consistent across cameras and wraparound', () => {
  assert.equal(Math.abs(mapHeading(0)), 0);
  assert.equal(mapHeading(Math.PI / 2), -90);
  assert.equal(mapHeading(-Math.PI / 2), 90);
  assert.ok(Math.abs(mapHeading(2 * Math.PI)) < 1e-10);
  assert.equal(Math.abs(mapHeading(NaN)), 0);
});

test('contacts stay hidden before departure and all remaining contacts are findable after it', () => {
  for (const detected of [true, false]) for (const neutralized of [true, false]) {
    assert.equal(contactVisibility({ detected, neutralized }, false), 'hidden');
  }
  assert.equal(contactVisibility({ detected: false, neutralized: false }, true), 'estimated');
  assert.equal(contactVisibility({ detected: true, neutralized: false }, true), 'detected');
  assert.equal(contactVisibility({ detected: true, neutralized: true }, true), 'neutralized');
});

test('waypoint projection roundtrips world positions and clamps schematic margins', () => {
  for (const point of [MISSION_START, DISMOUNT_POINT, { x: WORLD_BOUNDS.minX, z: WORLD_BOUNDS.minZ }, { x: WORLD_BOUNDS.maxX, z: WORLD_BOUNDS.maxZ }]) {
    const projected = mapPoint(point.x, point.z);
    const result = mapWorldPoint(projected.x, projected.y);
    assert.ok(Math.abs(result.x - point.x) < 1e-9);
    assert.ok(Math.abs(result.z - point.z) < 1e-9);
  }
  assert.deepEqual(mapWorldPoint(-999, -999), { x: WORLD_BOUNDS.minX, z: WORLD_BOUNDS.minZ });
  assert.deepEqual(mapWorldPoint(999, 999), { x: WORLD_BOUNDS.maxX, z: WORLD_BOUNDS.maxZ });
  assert.ok(Object.values(mapWorldPoint(NaN, Infinity)).every(Number.isFinite));
});
