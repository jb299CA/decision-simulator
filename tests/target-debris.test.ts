import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { debrisPose, destructionAge, DEBRIS_PIECES, DEBRIS_TARGET_CAPACITY, TargetDebris, type DestructibleTarget } from '../src/target-debris.ts';

const board: DestructibleTarget = { id: 'practice-2', x: -12, z: 20, radius: 1.6, kind: 'training', destroyedAt: 3, destroyedBy: 'shot' };
const ground = (x: number, z: number) => .2 + x * .01 - z * .005;
const pose = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0 });
const snapshot = (debris: TargetDebris) => debris.group.children.map(object => {
  const mesh = object as THREE.InstancedMesh;
  return { count: mesh.count, matrices: Array.from(mesh.instanceMatrix.array).slice(0, mesh.count * 16) };
});

test('destruction timestamps include the event and reject invalid or future events', () => {
  assert.equal(destructionAge(0, 0), 0);
  assert.equal(destructionAge(3, 3), 0);
  assert.equal(destructionAge(3, null), -1);
  assert.equal(destructionAge(2.9, 3), -1);
  assert.equal(destructionAge(NaN, 3), -1);
  assert.equal(destructionAge(4, Infinity), -1);
  assert.equal(destructionAge(400, 3), 397);
});

test('shot and vehicle destruction both produce twelve persistent fragments', () => {
  for (const destroyedBy of ['shot', 'vehicle'] as const) {
    const debris = new TargetDebris();
    debris.update([{ ...board, destroyedBy }], 3, ground);
    assert.deepEqual(snapshot(debris).map(mesh => mesh.count), [8, 4]);
    debris.update([{ ...board, destroyedBy }], 1000, ground);
    assert.deepEqual(snapshot(debris).map(mesh => mesh.count), [8, 4]);
  }
  assert.notDeepEqual(debrisPose(board, 0, .4, ground, pose()), debrisPose({ ...board, destroyedBy: 'vehicle' }, 0, .4, ground, pose()));
});

test('fragments freeze at the same simulation time, settle on sampled ground and never respawn', () => {
  const debris = new TargetDebris();
  debris.update([board], 3.35, ground);
  const paused = snapshot(debris);
  for (let frame = 0; frame < 40; frame++) { debris.update([board], 3.35, ground); assert.deepEqual(snapshot(debris), paused); }
  debris.update([board], 10, ground); const settled = snapshot(debris);
  debris.update([board], 1000, ground); assert.deepEqual(snapshot(debris), settled);
  for (let piece = 0; piece < DEBRIS_PIECES; piece++) {
    const p = debrisPose(board, piece, 1000, ground, pose());
    assert.ok(p.y > ground(p.x, p.z));
    assert.ok(p.y < ground(p.x, p.z) + .2);
    assert.equal(p.rx, piece < 10 ? Math.PI / 2 : 0);
    const verticalHalf = piece < 10 ? p.sz / 2 : p.sy / 2;
    assert.ok(p.y - verticalHalf >= ground(p.x, p.z), `piece ${piece} penetrates ground`);
    assert.deepEqual(p, debrisPose(board, piece, 10000, ground, pose()));
  }
});

test('restart, intact boards and future timestamps clear pooled debris without ghosts', () => {
  const debris = new TargetDebris();
  debris.update([board], 3.1, ground); debris.reset(); assert.deepEqual(snapshot(debris).map(mesh => mesh.count), [0, 0]);
  debris.update([board], 0, ground); assert.deepEqual(snapshot(debris).map(mesh => mesh.count), [0, 0]);
  debris.update([{ ...board, destroyedAt: null, destroyedBy: null }], 10, ground); assert.deepEqual(snapshot(debris).map(mesh => mesh.count), [0, 0]);
  debris.update([{ ...board, kind: 'enemy' }], 10, ground); assert.deepEqual(snapshot(debris).map(mesh => mesh.count), [0, 0]);
  debris.update([], 10, ground); assert.deepEqual(snapshot(debris).map(mesh => mesh.count), [0, 0]);
});

test('fixed pool bounds excess boards and reduced motion starts with grounded pieces', () => {
  const debris = new TargetDebris();
  const boards = Array.from({ length: 100 }, (_, i) => ({ ...board, id: `board-${i}` }));
  debris.update(boards, 3.1, ground);
  assert.deepEqual(snapshot(debris).map(mesh => mesh.count), [DEBRIS_TARGET_CAPACITY * 8, DEBRIS_TARGET_CAPACITY * 4]);
  debris.update([board], 3, ground, true); const reduced = snapshot(debris);
  debris.update([board], 20, ground, true); assert.deepEqual(snapshot(debris), reduced);
});
