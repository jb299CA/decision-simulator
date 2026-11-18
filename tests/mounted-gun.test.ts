import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createMountedGun } from '../src/mounted-gun.ts';

test('mounted gun stays slender, keeps the fixed muzzle and batches added details', () => {
  const gun = createMountedGun(), bounds = new THREE.Box3().setFromObject(gun);
  const upperBounds = new THREE.Box3();
  gun.traverse(mesh => { if (mesh instanceof THREE.Mesh) {
    const vertices = mesh.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices,i);
      if (point.y >= 2.74) upperBounds.expandByPoint(point);
    }
  }});
  const size = upperBounds.getSize(new THREE.Vector3());
  assert.deepEqual(gun.userData.muzzle,[0,3,-1]);
  assert.ok(Math.abs(bounds.min.z + 1) < .005,'barrel terminates at the established shot origin');
  assert.ok(size.z > size.x * 2.3,'long barrel and narrow receiver remain the dominant silhouette');
  assert.ok(bounds.max.y < 3.23 && bounds.min.y > 2.2,'prop stays on the existing mount');
  const meshes = gun.children.filter((child):child is THREE.Mesh => child instanceof THREE.Mesh);
  assert.equal(meshes.length,6,'all static pieces merge into six material draws');
  const triangles = meshes.reduce((count,mesh) => count + mesh.geometry.getAttribute('position').count / 3,0);
  assert.ok(triangles < 1800,`bounded mobile geometry: ${triangles} triangles`);
  assert.equal(new Set(meshes.map(mesh => mesh.material)).size,6);
  assert.ok(meshes.every(mesh => mesh.castShadow && mesh.receiveShadow));
});

test('model muzzle rotates to the same local forward ray used by the optic and shot effects', () => {
  const gun = createMountedGun();
  for (const heading of [0,.5,Math.PI]) for (const aimYaw of [-.7,0,.6]) {
    gun.position.set(12 + Math.cos(heading) * .48,.3,-40 - Math.sin(heading) * .48);
    gun.rotation.y = heading + aimYaw; gun.updateMatrixWorld();
    const actual = gun.localToWorld(new THREE.Vector3(0,3,-1)), angle = heading + aimYaw;
    const expected = new THREE.Vector3(12 + Math.cos(heading) * .48 - Math.sin(angle),3.3,-40 - Math.sin(heading) * .48 - Math.cos(angle));
    assert.ok(actual.distanceTo(expected) < 1e-10);
  }
});
