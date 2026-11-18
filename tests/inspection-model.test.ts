import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { cloneInspectionModel, disposeInspectionModel, sensorAnchor, projectSensor, SENSOR_COLORS } from '../src/inspection-model.ts';

test('inspection clone resets driving pose and wheel motion with independent resources', () => {
  const source = new THREE.Group(); source.position.set(100, 2, -400); source.rotation.set(.1, 2, -.1);
  const texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(2, 1, 6), hull = new THREE.Mesh(geometry, material); source.add(hull);
  const wheel = new THREE.Group(); wheel.name = 'inspection-wheel'; wheel.rotation.x = 2;
  wheel.position.set(1, -.5, 2); wheel.add(new THREE.Mesh(new THREE.SphereGeometry(.4), material)); source.add(wheel);
  const station = new THREE.Group(); station.name = 'inspection-station'; station.visible = false; source.add(station);
  let geometryDisposed = false, materialDisposed = false, textureDisposed = false;
  geometry.addEventListener('dispose', () => geometryDisposed = true); material.addEventListener('dispose', () => materialDisposed = true); texture.addEventListener('dispose', () => textureDisposed = true);
  const model = cloneInspectionModel(source), clone = model.children[0] as THREE.Group, clonedHull = clone.children[0] as THREE.Mesh;
  assert.notEqual(clonedHull.geometry, geometry); assert.notEqual(clonedHull.material, material);
  assert.equal((clonedHull.material as THREE.MeshStandardMaterial).map, texture);
  assert.equal(clone.quaternion.w, 1); assert.equal(clone.children[1].rotation.x, 0); assert.equal(clone.children[2].visible, true);
  assert.equal(source.position.z, -400); assert.equal(wheel.rotation.x, 2); assert.equal(station.visible, false);
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
  assert.ok(center.length() < 1e-6); assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).z - 6) < 1e-6);
  let disposed = 0; clonedHull.geometry.addEventListener('dispose', () => disposed++);
  disposeInspectionModel(model);
  assert.equal(disposed, 1); assert.equal(geometryDisposed, false); assert.equal(materialDisposed, false); assert.equal(textureDisposed, false);
});

test('semantic sensors stay within normalized bounds and project into the viewport', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-1.5, -2, -3), new THREE.Vector3(1.5, 2, 3));
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 100); camera.position.set(8, 5, 9); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  for (const id of ['charging', 'cooling', 'wheel-end'] as const) {
    const anchor = sensorAnchor(bounds, id); assert.equal(bounds.containsPoint(anchor), true);
    assert.ok(anchor.z > 1, 'sensor maps to front half of original vehicle');
    const projection = projectSensor(anchor, camera, 300, 300); assert.equal(projection.visible, true);
    assert.ok(projection.x >= 0 && projection.x <= 300); assert.ok(projection.y >= 0 && projection.y <= 300);
  }
  assert.equal(projectSensor(new THREE.Vector3(0, 0, 1000), camera, 300, 300).visible, false);
  assert.notEqual(SENSOR_COLORS.normal, SENSOR_COLORS.moderate); assert.notEqual(SENSOR_COLORS.moderate, SENSOR_COLORS.severe);
});
