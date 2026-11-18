import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { bumperCallsign, RearBumperMarking, REAR_BUMPER } from '../src/bumper-marking.ts';
import { cloneInspectionModel, disposeInspectionModel } from '../src/inspection-model.ts';
import { createRearRamp, REAR_RAMP } from '../src/dismount-squad.ts';

function canvasFactory() {
  const canvases: { width: number; height: number; words: string[]; getContext: () => unknown }[] = [];
  const create = () => {
    const words: string[] = [];
    const context = { fillRect() {}, fillText(text: string) { words.push(text); } };
    const canvas = { width: 0, height: 0, words, getContext: () => context };
    canvases.push(canvas);
    return canvas as unknown as HTMLCanvasElement;
  };
  return { create, canvases };
}

test('bumper preserves all nine fictional identities with the platoon number prominent', () => {
  for (const company of ['BRAVE', 'AZTEC', 'CRAZY HORSE']) for (const platoon of [1, 2, 3]) {
    const callsign = `${company} ${platoon}-6`;
    assert.deepEqual(bumperCallsign(callsign), { company, number: `${platoon}-6`, key: callsign });
  }
  assert.equal(bumperCallsign('  Crazy   Horse 2-6 ').key, 'CRAZY HORSE 2-6');
  for (const invalid of ['', 'Vehicle', 'Unassigned', 'BRAVE 6', 'BRAVE 4-6', 'AZTEC 2-7', 'OTHER 1-6', 'BRAVE 1-6<script>']) {
    assert.deepEqual(bumperCallsign(invalid), { company: 'EXERCISE', number: '', key: 'EXERCISE' });
  }
});

test('rear bumper is fixed below the entire ramp sweep and text faces the rear without mirroring', () => {
  const factory = canvasFactory(), bumper = new RearBumperMarking(factory.create);
  const vehicle = new THREE.Group(), ramp = createRearRamp(new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial());
  vehicle.add(bumper.root, ramp.root);
  assert.equal(bumper.root.parent, vehicle);
  assert.ok(REAR_BUMPER.y + REAR_BUMPER.height / 2 < REAR_RAMP.hingeY);
  assert.ok(REAR_BUMPER.faceZ < REAR_RAMP.hingeZ - .045);
  for (let sample = 0; sample <= 40; sample++) {
    ramp.pivot.rotation.x = REAR_RAMP.openAngle * sample / 40;
    vehicle.updateMatrixWorld(true);
    const backing = bumper.root.children[0] as THREE.Mesh;
    const rampPanel = ramp.pivot.children[0] as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(backing);
    const bumperCorners = [bounds.min.y, bounds.max.y].flatMap(y => [bounds.min.z, bounds.max.z].map(z => new THREE.Vector2(y, z)));
    const rampCorners = [-REAR_RAMP.length / 2, REAR_RAMP.length / 2].flatMap(y => [-.045, .045].map(z => {
      const point = new THREE.Vector3(0, y, z).applyMatrix4(rampPanel.matrixWorld);
      return new THREE.Vector2(point.y, point.z);
    }));
    const angle = ramp.pivot.rotation.x;
    const axes = [new THREE.Vector2(1, 0), new THREE.Vector2(0, 1), new THREE.Vector2(Math.cos(angle), Math.sin(angle)), new THREE.Vector2(-Math.sin(angle), Math.cos(angle))];
    const separated = axes.some(axis => {
      const bumperProjection = bumperCorners.map(p => p.dot(axis)), rampProjection = rampCorners.map(p => p.dot(axis));
      return Math.max(...bumperProjection) < Math.min(...rampProjection) || Math.max(...rampProjection) < Math.min(...bumperProjection);
    });
    assert.ok(separated, `fixed bumper clears ramp at sweep sample ${sample}`);
    assert.ok(bounds.min.y > 0);
  }
  const paint = bumper.root.getObjectByName('rear-bumper-callsign')!;
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(paint.matrixWorld);
  assert.ok(normal.z < -.999);
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  camera.position.set(0, REAR_BUMPER.y, -10); camera.lookAt(0, REAR_BUMPER.y, 0); camera.updateMatrixWorld(true);
  const left = paint.localToWorld(new THREE.Vector3(-1, 0, 0)).project(camera);
  const right = paint.localToWorld(new THREE.Vector3(1, 0, 0)).project(camera);
  assert.ok(left.x < right.x, 'texture left and right retain screen order when seen from the rear');
  bumper.disposeTextures();
});

test('canvas uploads occur only for a new identity and the cache is bounded', () => {
  const factory = canvasFactory(), bumper = new RearBumperMarking(factory.create);
  assert.equal(factory.canvases.length, 1);
  assert.equal(bumper.update('BRAVE 1-6'), true);
  const brave = bumper.material.map;
  const version = brave!.version;
  for (let frame = 0; frame < 60; frame++) assert.equal(bumper.update('BRAVE 1-6'), false);
  assert.equal(brave!.version, version);
  assert.equal(factory.canvases.length, 2);
  bumper.update('CRAZY HORSE 3-6');
  assert.deepEqual(factory.canvases[2].words, ['CRAZY HORSE', '3-6']);
  bumper.update('BRAVE 1-6'); assert.equal(bumper.material.map, brave);
  for (const company of ['BRAVE', 'AZTEC', 'CRAZY HORSE']) for (const platoon of [1, 2, 3]) bumper.update(`${company} ${platoon}-6`);
  for (let index = 0; index < 100; index++) bumper.update(`invalid ${index}`);
  assert.equal(factory.canvases.length, 10);
  const disposals = factory.canvases.map(() => 0);
  // Visit the same ten owned maps and verify only the owner disposes each once.
  let index = 0;
  for (const key of ['EXERCISE', ...['BRAVE', 'AZTEC', 'CRAZY HORSE'].flatMap(company => [1, 2, 3].map(n => `${company} ${n}-6`))]) {
    bumper.update(key);
    const mapIndex = index++;
    bumper.material.map!.addEventListener('dispose', () => disposals[mapIndex]++);
  }
  bumper.disposeTextures(); bumper.disposeTextures();
  assert.deepEqual(disposals, Array(10).fill(1));
  assert.equal(bumper.update('BRAVE 1-6'), false);
});

test('inspection retains its captured callsign and never disposes borrowed paint textures', () => {
  const factory = canvasFactory(), bumper = new RearBumperMarking(factory.create);
  bumper.update('AZTEC 2-6');
  const vehicle = new THREE.Group(); vehicle.add(bumper.root);
  const inspection = cloneInspectionModel(vehicle);
  const captured = inspection.getObjectByName('rear-bumper-callsign') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  const paint = captured.material.map!;
  const originalWords = [...factory.canvases[1].words];
  let disposed = 0; paint.addEventListener('dispose', () => disposed++);
  assert.notEqual(captured.material, bumper.material);
  bumper.update('CRAZY HORSE 3-6');
  assert.notEqual(bumper.material.map, paint);
  assert.equal(captured.material.map, paint);
  assert.deepEqual(factory.canvases[1].words, originalWords);
  disposeInspectionModel(inspection);
  assert.equal(disposed, 0);
  bumper.disposeTextures();
  assert.equal(disposed, 1);
});
