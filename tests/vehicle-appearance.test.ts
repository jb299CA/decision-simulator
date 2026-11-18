import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { applyVehicleAppearance } from '../src/vehicle-appearance.ts';
import { cloneInspectionModel, disposeInspectionModel } from '../src/inspection-model.ts';

function vehicleFixture() {
  const vehicle = new THREE.Group();
  const armor = [new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial()];
  const rubber = [new THREE.MeshStandardMaterial()], metal = [new THREE.MeshStandardMaterial()];
  // A UV-less custom hull represents the hull after static compaction.
  const hullGeometry = new THREE.BoxGeometry(2.7,1.5,6.5).toNonIndexed(); hullGeometry.deleteAttribute('uv');
  const hull = new THREE.Mesh(hullGeometry,armor[0]); hull.position.y = 1.45; vehicle.add(hull);
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,2,6),metal[0]); aerial.position.set(-.95,3.2,-2.3); vehicle.add(aerial);
  for (const side of [-1,1]) for (const z of [-2.12,-.71,.71,2.12]) {
    const wheel = new THREE.Group(); wheel.name = 'inspection-wheel'; wheel.position.set(side*1.36,.63,z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(.61,.61,.43,16),rubber[0]); tire.rotation.z = Math.PI/2;
    wheel.add(tire); vehicle.add(wheel);
  }
  const signMaterial = new THREE.MeshStandardMaterial({color:0xefbe7a,map:new THREE.Texture()});
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(.7,.35),signMaterial); sign.position.set(-1.36,1.7,-2); vehicle.add(sign);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.1),new THREE.MeshStandardMaterial({color:0xffe0a0})); lamp.position.set(1,1.5,3.17); vehicle.add(lamp);
  return {vehicle,hull,sign,lamp,materials:{armor,rubber,metal}};
}

test('field finish is deterministic across driving world poses and repairs the UV-less hull', () => {
  const a = vehicleFixture(), b = vehicleFixture();
  b.vehicle.position.set(456,7,-987); b.vehicle.rotation.y = 1.73;
  const originalPositions = Array.from(a.hull.geometry.getAttribute('position').array);
  const stats = applyVehicleAppearance(a.vehicle,a.materials); applyVehicleAppearance(b.vehicle,b.materials);
  const uv = a.hull.geometry.getAttribute('uv'), colors = a.hull.geometry.getAttribute('color');
  assert.ok(uv.count > originalPositions.length/3,'broad panels gain samples for gradual dirt');
  assert.ok(new Set(Array.from(uv.array).map(v => v.toFixed(3))).size > 20);
  const other = b.hull.geometry.getAttribute('color');
  for (let i = 0; i < colors.array.length; i++) assert.ok(Math.abs(colors.array[i]-other.array[i]) < 1e-5);
  const position = a.hull.geometry.getAttribute('position'); let low = 0, lowCount = 0, high = 0, highCount = 0;
  for (let i = 0; i < colors.count; i++) {
    if (position.getY(i) < -.4) {low += colors.getX(i); lowCount++;}
    if (position.getY(i) > .4) {high += colors.getX(i); highCount++;}
  }
  assert.ok(low/lowCount > high/highCount,'pale dust lightens the lower hull');
  assert.equal(stats.addedTextures,0); assert.equal(stats.addedMaterials,0); assert.equal(stats.addedDraws,2);
});

test('field details stay inside vehicle bounds, preserve eight wheel groups, decals and opaque armor', () => {
  const {vehicle,sign,lamp,materials} = vehicleFixture();
  const beforeBounds = new THREE.Box3().setFromObject(vehicle), signGeometry = sign.geometry;
  const signUVs = Array.from(sign.geometry.getAttribute('uv').array), signMaterial = sign.material;
  const lampColor = lamp.material.color.getHex(), originalChildren = vehicle.children.length;
  applyVehicleAppearance(vehicle,materials);
  assert.deepEqual(new THREE.Box3().setFromObject(vehicle),beforeBounds);
  assert.equal(vehicle.children.filter(child => child.name === 'inspection-wheel').length,8);
  assert.equal(vehicle.children.length,originalChildren+2);
  assert.equal(sign.geometry,signGeometry); assert.equal(sign.material,signMaterial);
  assert.deepEqual(Array.from(sign.geometry.getAttribute('uv').array),signUVs);
  assert.equal(lamp.material.color.getHex(),lampColor);
  for (const material of materials.armor) {assert.equal(material.transparent,false); assert.equal(material.opacity,1); assert.ok(material.roughness >= .95);}
  const children = vehicle.children.length; applyVehicleAppearance(vehicle,materials); assert.equal(vehicle.children.length,children,'repeat setup is idempotent');
});

test('dusty geometry and added details survive independent inspection cloning and disposal', () => {
  const {vehicle,hull,materials} = vehicleFixture(); applyVehicleAppearance(vehicle,materials);
  let sourceDisposed = false; hull.geometry.addEventListener('dispose',() => sourceDisposed = true);
  const clone = cloneInspectionModel(vehicle); let treated = 0, detail = 0;
  clone.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.geometry.getAttribute('color')) treated++;
    if (object.name.startsWith('field-')) detail++;
  });
  assert.ok(treated >= 12); assert.equal(detail,2);
  disposeInspectionModel(clone); assert.equal(sourceDisposed,false);
});
