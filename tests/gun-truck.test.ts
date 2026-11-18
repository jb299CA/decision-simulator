import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createGunTruck, setGunTruckDamage } from '../src/gun-truck.ts';

test('gun truck has exactly four road wheels, glazed cab, hood, open bed and exposed gun', () => {
  const truck = createGunTruck();
  assert.equal(truck.children.filter(child => child.name === 'wheel').length, 4);
  for (const name of ['windshield', 'rear-window', 'cab-roof', 'hood', 'bed-floor', 'tailgate', 'gun-pedestal', 'contact-weapon']) assert.ok(truck.getObjectByName(name), name);
  assert.equal(truck.children.filter(child => child.name === 'side-window').length, 2);
  assert.equal(truck.children.filter(child => child.name === 'bed-side').length, 2);
  const bounds = new THREE.Box3().setFromObject(truck), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.z > size.x * 1.7); assert.ok(size.y < size.z * .7);
  assert.ok(!truck.getObjectByName('turret'));
});

test('defeat chars the truck while preserving recognizable cab, bed, gun and four-wheel geometry', () => {
  const truck = createGunTruck(); const geometry: THREE.BufferGeometry[] = [], materials: THREE.MeshStandardMaterial[] = [];
  truck.traverse(child => { if (child instanceof THREE.Mesh) { geometry.push(child.geometry); materials.push(child.material as THREE.MeshStandardMaterial); }});
  const liveColors = materials.map(material => material.color.getHex());
  setGunTruckDamage(truck, false, .8); assert.ok(materials.every(material => material.emissiveIntensity > 0));
  setGunTruckDamage(truck, true); assert.ok(materials.every(material => material.emissiveIntensity === 0));
  assert.ok(materials.every(material => [0x1b211f, 0x30312a].includes(material.color.getHex())));
  const after: THREE.BufferGeometry[] = []; truck.traverse(child => { if (child instanceof THREE.Mesh) after.push(child.geometry); }); assert.deepEqual(after, geometry);
  setGunTruckDamage(truck, false); assert.deepEqual(materials.map(material => material.color.getHex()), liveColors);
});
