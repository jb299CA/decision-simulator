import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { hatchCameraFrame, isPhoneDrivingViewport } from '../src/crew-camera.ts';
import { createMountedGun } from '../src/mounted-gun.ts';

test('phone framing survives landscape rotation without classifying a desktop as a phone', () => {
  for (const [width,height] of [[390,844],[844,390],[430,932],[932,430],[667,375]]) assert.equal(isPhoneDrivingViewport(width,height),true);
  assert.equal(isPhoneDrivingViewport(1920,1080),false);
});

test('Hatch keeps the gun below the horizon and leaves forward terrain visible on phones', () => {
  const gun = createMountedGun(); gun.position.x = .48; gun.updateMatrixWorld();
  for (const [width,height] of [[320,568],[390,844],[430,932],[844,390],[932,430],[1920,1080]]) {
    const frame = hatchCameraFrame(width,height), aspect = width / height;
    const camera = new THREE.PerspectiveCamera(frame.fov,aspect,.1,350);
    camera.position.fromArray(frame.eye); camera.lookAt(new THREE.Vector3().fromArray(frame.lookAt)); camera.updateMatrixWorld();
    const bounds = new THREE.Box2();
    gun.traverse(mesh => {
      if (!(mesh instanceof THREE.Mesh)) return;
      const vertices = mesh.geometry.getAttribute('position');
      for (let i = 0; i < vertices.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
        if (point.y < 2.74) continue; // Support and roof are deliberately below the gun.
        point.project(camera); bounds.expandByPoint(new THREE.Vector2(point.x,point.y));
      }
    });
    assert.ok(bounds.max.y < -.12,`${width}×${height}: gun must sit below the horizon`);
    assert.ok(bounds.min.y > -.85,`${width}×${height}: gun stays in the lower frame`);
    assert.ok(bounds.getSize(new THREE.Vector2()).x < .55,`${width}×${height}: gun uses less than 28% of screen width`);
    const forwardTarget = new THREE.Vector3(0,2.4,-25).project(camera);
    assert.ok(Math.abs(forwardTarget.x) < .15 && Math.abs(forwardTarget.y) < .2,'forward route and targets stay near center');
    const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(frame.fov / 2)) * aspect) * 180 / Math.PI;
    assert.ok(horizontalFov >= 59.9,'portrait retains at least 60 degrees of horizontal environment');
  }
});
