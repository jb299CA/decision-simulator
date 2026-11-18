import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { fitGuidedModel } from '../src/guided-camera.ts';

const vehicle = new THREE.Box3(new THREE.Vector3(-1.8, 0, -3.3), new THREE.Vector3(1.8, 4.25, 3.3));
function corners(bounds: THREE.Box3) {
  return [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y].flatMap(y => [bounds.min.z, bounds.max.z].map(z => new THREE.Vector3(x, y, z))));
}

test('complete guided vehicle fits the clear phone stage in both orientations', () => {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [932, 430]]) {
    const portrait = width < height;
    const fit = fitGuidedModel(vehicle, new THREE.Vector3(-10, 5, 12), 55, width / height, portrait ? [.82, .50] : [.57, .65]);
    const camera = new THREE.PerspectiveCamera(55, width / height, .1, 350);
    camera.position.copy(fit.position); camera.lookAt(fit.center);
    camera.setViewOffset(width, height, portrait ? 0 : width * .175, portrait ? height * .1125 : -height * .02, width, height);
    camera.updateMatrixWorld();
    const center = fit.center.clone().project(camera);
    assert.ok(Math.abs((center.x + 1) / 2 - (portrait ? .5 : .325)) < 1e-6);
    assert.ok(Math.abs((1 - center.y) / 2 - (portrait ? .3875 : .52)) < 1e-6);
    for (const corner of corners(vehicle)) {
      corner.project(camera);
      const x = (corner.x + 1) / 2, y = (1 - corner.y) / 2;
      assert.ok(x >= .03 && x <= (portrait ? .97 : .62), `${width}x${height}: vehicle fits horizontally`);
      assert.ok(y >= (portrait ? .13 : .19) - 1e-6 && y <= (portrait ? .64 : .85) + 1e-6, `${width}x${height}: antenna and wheels clear the briefing`);
    }
  }
});

test('inspection bounds fit changing host sizes and orbit directions with centered sensors', () => {
  const bounds = vehicle.clone().translate(vehicle.getCenter(new THREE.Vector3()).negate());
  for (const [width, height] of [[260, 230], [380, 250], [700, 340], [932, 230]]) for (const direction of [new THREE.Vector3(7, 4.8, 8), new THREE.Vector3(-8, 4, 3), new THREE.Vector3(1, 5, -8)]) {
    const fit = fitGuidedModel(bounds, direction, 38, width / height);
    const camera = new THREE.PerspectiveCamera(38, width / height, .1, 100);
    camera.position.copy(fit.position); camera.lookAt(fit.center); camera.updateMatrixWorld();
    assert.ok(fit.center.clone().project(camera).length() < 1.01);
    for (const corner of corners(bounds)) {
      corner.project(camera);
      assert.ok(Math.abs(corner.x) <= .820001 && Math.abs(corner.y) <= .820001);
    }
  }
});
