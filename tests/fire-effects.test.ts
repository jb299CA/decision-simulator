import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { casingPosition, firingRecoil, FIRING_RECOIL_DURATION, FIRE_EFFECT_LIFETIME, MUZZLE_SMOKE_LIFETIME, RangeFireEffects, shotAge } from '../src/fire-effects.ts';
import { RANGE_VIEWS } from '../src/mission-contract.ts';

const shot = { id: 1, origin: { x: .48, y: 3, z: 19 }, end: { x: .48, y: 2.4, z: -30 }, hitTargetId: 'target-1', createdAt: 2 };

test('firing recoil kicks Hatch and Inside, leaving the exterior cameras steady', () => {
  assert.equal(firingRecoil('hatch', false, 2, 2), .037);
  assert.equal(firingRecoil('inside', false, 2, 2), .025);
  for (const view of RANGE_VIEWS) {
    if (view !== 'hatch' && view !== 'inside') assert.equal(firingRecoil(view, false, 2.02, 2), 0);
    assert.equal(firingRecoil(view, true, 2.02, 2), 0);
  }
});

test('recoil freezes with simulation time, remains bounded through bursts and clears invalid shots', () => {
  for (const view of ['hatch','inside'] as const) {
    const paused = firingRecoil(view,false,2.035,2), peak = firingRecoil(view,false,2,2);
    for (let frame = 0; frame < 100; frame++) assert.equal(firingRecoil(view,false,2.035,2),paused);
    for (let shot = 0; shot < 50; shot++) for (let step = 0; step < 140; step++) {
      const at = shot * .14;
      assert.ok(Math.abs(firingRecoil(view,false,at + step / 1000,at)) <= peak);
    }
    assert.equal(firingRecoil(view,false,FIRING_RECOIL_DURATION,0),0);
    assert.equal(firingRecoil(view,false,2.2,2),0);
    for (const [time,createdAt] of [[0,2],[0,-Infinity],[NaN,0],[0,NaN],[0,-.01],[-.01,0]]) {
      assert.equal(firingRecoil(view,false,time,createdAt),0);
    }
  }
});

test('effect timestamps accept zero age and reject future, invalid and expired shots', () => {
  assert.equal(shotAge(0, 0), 0);
  assert.equal(shotAge(0, .1), -1);
  assert.equal(shotAge(0, -Infinity), -1);
  assert.equal(shotAge(NaN, 0), -1);
  assert.equal(shotAge(FIRE_EFFECT_LIFETIME, 0), -1);
  assert.ok(shotAge(FIRE_EFFECT_LIFETIME - .001, 0) > 0);
});

test('case trajectory uses the shot direction and freezes at the same simulation time', () => {
  const start = casingPosition(shot, 0, { x: 0, y: 0, z: 0 });
  assert.ok(start.x > shot.origin.x); assert.ok(start.z > shot.origin.z);
  const position = casingPosition(shot, .3, { x: 0, y: 0, z: 0 });
  assert.ok(position.x > start.x); assert.ok(position.y > start.y);
  for (let frame = 0; frame < 100; frame++) assert.deepEqual(casingPosition(shot, .3, { x: 0, y: 0, z: 0 }), position);
  assert.ok(casingPosition(shot, 1.5, { x: 0, y: 0, z: 0 }).y >= .35);
});

function snapshot(effects: RangeFireEffects) {
  return effects.group.children.map(object => object instanceof THREE.InstancedMesh
    ? { count: object.count, matrices: Array.from(object.instanceMatrix.array).slice(0, object.count * 16) }
    : object instanceof THREE.LineSegments
      ? { count: object.geometry.drawRange.count, positions: Array.from(object.geometry.getAttribute('position').array).slice(0, object.geometry.drawRange.count * 3) }
      : null);
}

test('pooled effects freeze on pause, expire, and clear on reset without shot ghosts', () => {
  const effects = new RangeFireEffects();
  effects.update([shot], 2.09, false);
  const paused = snapshot(effects);
  for (let frame = 0; frame < 20; frame++) {
    effects.update([shot], 2.09, false); assert.deepEqual(snapshot(effects), paused);
  }
  effects.update([shot], 4, false);
  assert.ok(snapshot(effects).every(value => value?.count === 0));
  effects.update([shot], 2.09, false); effects.reset();
  assert.ok(snapshot(effects).every(value => value?.count === 0));
  effects.update([shot], 0, false);
  assert.ok(snapshot(effects).every(value => value?.count === 0));
  effects.update([], 0, false);
  assert.ok(snapshot(effects).every(value => value?.count === 0));
});

test('effect pool bounds simultaneous particles and reduced motion suppresses moving debris', () => {
  const effects = new RangeFireEffects();
  const shots = Array.from({ length: 40 }, (_, id) => ({ ...shot, id }));
  effects.update(shots, 2.09, false);
  const counts = snapshot(effects).map(value => value!.count);
  assert.deepEqual(counts, [16, 16, 64, 32, 192]);
  effects.update(shots, 2.09, true);
  assert.deepEqual(snapshot(effects).map(value => value!.count), [0, 0, 0, 32, 0]);
});

test('misses keep muzzle smoke, brass and tracer without inventing a floating impact', () => {
  const effects = new RangeFireEffects();
  effects.update([{ ...shot, hitTargetId: undefined }], 2.09, false);
  assert.deepEqual(snapshot(effects).map(value => value!.count), [1, 1, 0, 2, 0]);
  effects.update([shot], 2.09, false);
  assert.deepEqual(snapshot(effects).map(value => value!.count), [1, 1, 4, 2, 12]);
});

test('muzzle puff is sparse, faint and short enough to clear between automatic shots', () => {
  const effects = new RangeFireEffects();
  const smoke = effects.group.getObjectByName('local-muzzle-smoke') as THREE.InstancedMesh;
  assert.equal(smoke.userData.gunnerSightHidden,true);
  assert.ok((smoke.material as THREE.Material).opacity <= .07);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  for (let age = 0; age < MUZZLE_SMOKE_LIFETIME; age += .005) {
    effects.update([shot],shot.createdAt + age,false);
    assert.equal(smoke.count,1);
    smoke.getMatrixAt(0,matrix); matrix.decompose(position,rotation,scale);
    assert.ok(scale.x > 0 && scale.x <= .036,'puff radius stays below four centimeters in game units');
    assert.ok(position.distanceTo(new THREE.Vector3(shot.origin.x,shot.origin.y,shot.origin.z)) < .3);
  }
  effects.update([shot],shot.createdAt + MUZZLE_SMOKE_LIFETIME + .001,false);
  assert.equal(smoke.count,0);
  // At the actual .14-second cadence, no older muzzle puffs can accumulate.
  const burst = Array.from({length:16},(_,id) => ({...shot,id,createdAt:2 + id * .14}));
  for (let step = 0; step < 230; step++) {
    effects.update(burst,2 + step * .01,false); assert.ok(smoke.count <= 1);
  }
});
