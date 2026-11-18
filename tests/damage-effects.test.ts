import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AftermathClock, VehicleDamageEffects, DAMAGE_VEHICLE_CAPACITY, SMOKE_PUFFS, FLAMES_PER_VEHICLE } from '../src/damage-effects.ts';

const own = { broken: false, x: 2, y: .3, z: 4, heading: 0 };
const truck = { id: 'vehicle-1', kind: 'vehicle' as const, x: 10, z: -20, neutralizedAt: 3 };
const ground = () => .25;
const meshes = (effect: VehicleDamageEffects) => effect.group.children as THREE.InstancedMesh[];
const snapshot = (effect: VehicleDamageEffects) => meshes(effect).map(mesh => ({ count: mesh.count, matrix: Array.from(mesh.instanceMatrix.array).slice(0, mesh.count * 16) }));
const counts = (effect: VehicleDamageEffects) => meshes(effect).map(mesh => mesh.count);

test('presentation clock follows simulation and advances only unpaused terminal aftermath', () => {
  const clock = new AftermathClock();
  assert.equal(clock.update(3, .05, false, false), 3);
  assert.equal(clock.update(3, .05, true, false), 3);
  assert.equal(clock.update(3, .05, true, false), 3.05);
  assert.equal(clock.update(3, .1, true, true), 3.05);
  assert.equal(clock.update(3, 0, true, false), 3.05);
  assert.equal(clock.update(3, NaN, true, false), 3.05);
  assert.equal(clock.update(3, -1, true, false), 3.05);
  assert.equal(clock.update(3, 10, true, false), 3.15);
  assert.equal(clock.update(3.1, .1, false, false), 3.1);
});

test('restart, backward time and range re-entry discard aftermath offset', () => {
  const clock = new AftermathClock();
  clock.update(10, .1, true, false); clock.update(10, .1, true, false);
  assert.equal(clock.update(0, .1, false, false), 0);
  clock.update(5, .1, true, false); clock.update(5, .1, true, false);
  assert.equal(clock.update(4, .1, true, false), 4);
  assert.equal(clock.update(4, .1, true, false, true), 4);
  clock.reset(); assert.equal(clock.update(0, 0, false, false), 0);
});

test('broken Stryker has immediate gray engine smoke and never fire', () => {
  const effect = new VehicleDamageEffects();
  effect.update(own, [], 0, ground); assert.deepEqual(counts(effect), [0, 0, 0, 0]);
  effect.update({ ...own, broken: true }, [], 0, ground);
  assert.deepEqual(counts(effect), [SMOKE_PUFFS, 0, 0, 0]);
  const position = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(meshes(effect)[0].instanceMatrix.array));
  assert.ok(position.y > own.y + 2); assert.ok(position.z < own.z);
  const first = snapshot(effect); effect.update({ ...own, broken: true }, [], 1, ground); assert.notDeepEqual(snapshot(effect), first);
  effect.update(own, [], 1, ground); assert.deepEqual(counts(effect), [0, 0, 0, 0]);
  effect.dispose();
});

test('only neutralized vehicles produce fire and dark smoke, visible at event age zero', () => {
  const effect = new VehicleDamageEffects();
  effect.update(own, [truck], 2.99, ground); assert.deepEqual(counts(effect), [0, 0, 0, 0]);
  effect.update(own, [truck], 3, ground); assert.deepEqual(counts(effect), [0, SMOKE_PUFFS, FLAMES_PER_VEHICLE, FLAMES_PER_VEHICLE]);
  effect.update(own, [{ ...truck, kind: 'troop' }, { ...truck, neutralizedAt: null }], 10, ground); assert.deepEqual(counts(effect), [0, 0, 0, 0]);
  effect.update(own, [{ ...truck, neutralizedAt: NaN }], 10, ground); assert.deepEqual(counts(effect), [0, 0, 0, 0]);
  effect.dispose();
});

test('same presentation time freezes all effects; reduced motion stays stationary without flicker', () => {
  const effect = new VehicleDamageEffects(); const broken = { ...own, broken: true };
  effect.update(broken, [truck], 4, ground); const paused = snapshot(effect);
  for (let i = 0; i < 20; i++) { effect.update(broken, [truck], 4, ground); assert.deepEqual(snapshot(effect), paused); }
  effect.update(broken, [truck], 5, ground); assert.notDeepEqual(snapshot(effect), paused);
  effect.update(broken, [truck], 5, ground, true); const staticState = snapshot(effect);
  effect.update(broken, [truck], 100, ground, true); assert.deepEqual(snapshot(effect), staticState);
  effect.reset(); assert.deepEqual(counts(effect), [0, 0, 0, 0]);
  effect.update(own, [], 0, ground); assert.deepEqual(counts(effect), [0, 0, 0, 0]); effect.dispose();
});

test('fixed pools keep resources stable over long runs and dispose exactly once', () => {
  const effect = new VehicleDamageEffects(); const resources = meshes(effect).map(mesh => [mesh, mesh.geometry, mesh.material]);
  const contacts = Array.from({ length: 50 }, (_, i) => ({ ...truck, id: `vehicle-${i}`, x: i * 6 }));
  for (let i = 0; i < 200; i++) effect.update({ ...own, broken: true }, contacts, 3 + i / 10, ground);
  assert.deepEqual(counts(effect), [SMOKE_PUFFS, SMOKE_PUFFS * DAMAGE_VEHICLE_CAPACITY, FLAMES_PER_VEHICLE * DAMAGE_VEHICLE_CAPACITY, FLAMES_PER_VEHICLE * DAMAGE_VEHICLE_CAPACITY]);
  assert.deepEqual(meshes(effect).map(mesh => [mesh, mesh.geometry, mesh.material]), resources);
  let disposed = 0;
  for (const [mesh, geometry, material] of resources) for (const resource of [mesh, geometry, material]) resource.addEventListener('dispose', () => disposed++);
  const scene = new THREE.Group(); scene.add(effect.group); effect.dispose(); effect.dispose();
  assert.equal(disposed, 12); assert.equal(effect.group.parent, null); assert.deepEqual(counts(effect), [0, 0, 0, 0]);
  effect.update({ ...own, broken: true }, contacts, 30, ground); assert.deepEqual(counts(effect), [0, 0, 0, 0]);
});
