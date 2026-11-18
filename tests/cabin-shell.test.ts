import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCabinShell } from '../src/cabin-shell.ts';

test('seated compartment blocks sightlines in every direction with opaque armor', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x555e48 });
  const { shell } = createCabinShell(material, material);
  shell.updateMatrixWorld(true);
  const eye = new THREE.Vector3(-.88, 1.64, 3.32);
  const ray = new THREE.Raycaster();
  for (let elevation = -90; elevation <= 90; elevation += 10) {
    for (let azimuth = 0; azimuth < 360; azimuth += 5) {
      const pitch = THREE.MathUtils.degToRad(elevation), yaw = THREE.MathUtils.degToRad(azimuth);
      ray.set(eye, new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)));
      const hit = ray.intersectObject(shell, true)[0];
      assert.ok(hit && hit.distance < 7, `armor must close azimuth ${azimuth}, elevation ${elevation}`);
    }
  }
  for (const child of shell.children) {
    assert.equal((child as THREE.Mesh).material, material);
    assert.equal(material.transparent, false);
    assert.equal(material.opacity, 1);
  }
});

test('exposed hatch eye clears the compartment while seated terminal stays below armor', () => {
  const material = new THREE.MeshBasicMaterial();
  const { shell } = createCabinShell(material, material);
  shell.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(.13, 3.23, 2.15), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(shell, true).length, 0);
  // Same physical casing dimensions and seated transform used by the scene.
  const terminal = new THREE.Mesh(new THREE.BoxGeometry(1.93, 1.35, .24), material);
  terminal.position.set(.42, 1.68, 1.22); terminal.rotation.set(-.12, -.16, 0); terminal.scale.setScalar(.66);
  terminal.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(terminal);
  assert.ok(bounds.max.y < 2.19, 'entire terminal casing clears the closed roof underside');
  const eye = new THREE.Vector3(-.88, 1.64, 3.32);
  ray.set(eye, terminal.position.clone().sub(eye).normalize());
  assert.ok(ray.intersectObject(terminal)[0].distance < ray.intersectObject(shell, true)[0].distance, 'terminal is visible before the armored wall');
});
