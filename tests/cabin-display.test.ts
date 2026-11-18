import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { boxCorners, cabinDisplayBounds, cabinDisplayFov, CabinDisplayState, frameCabinDisplay, RANGE_TERMINAL } from '../src/cabin-display.ts';
import { createCabinShell } from '../src/cabin-shell.ts';
import { firingRecoil } from '../src/fire-effects.ts';

// Dimensions of the real procedural case, side handles, glass and power light.
function terminal() {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const box = (size: number[], position: number[]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0],size[1],size[2]),material);
    mesh.position.fromArray(position); group.add(mesh);
  };
  box([1.93,1.35,.24],[0,0,0]);
  for (const x of [-1.07,1.07]) box([.12,1,.14],[x,0,.04]);
  box([.054,.054,.025],[.79,-.56,.148]);
  group.position.fromArray(RANGE_TERMINAL.position);
  group.rotation.set(...RANGE_TERMINAL.rotation); group.scale.setScalar(RANGE_TERMINAL.scale);
  group.updateMatrix();
  return group;
}
const display = terminal(), bounds = cabinDisplayBounds(display);
const glass = new THREE.Box3(new THREE.Vector3(-1.49 / 2,.035 - .894 / 2,.16),new THREE.Vector3(1.49 / 2,.035 + .894 / 2,.16));
const viewports = [[320,568],[390,844],[430,932],[568,320],[844,390],[932,430],[1280,900],[1920,1080]];
function cameraFrame(width: number, height: number, focused: boolean) {
  const fov = cabinDisplayFov(width,height), fit = frameCabinDisplay(bounds,display.matrix,width,height,fov,focused);
  const camera = new THREE.PerspectiveCamera(fov,width / height,.1,350);
  camera.position.copy(fit.position); camera.up.copy(fit.up); camera.lookAt(fit.center);
  camera.setViewOffset(width,height,fit.offsetX,fit.offsetY,width,height); camera.updateMatrixWorld();
  return { camera, fit };
}
function projection(local: THREE.Box3, camera: THREE.PerspectiveCamera, matrix = display.matrix) {
  const points = boxCorners(local).map(point => point.applyMatrix4(matrix).project(camera));
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  return { minX,maxX,minY,maxY,width:(maxX - minX) / 2,height:(maxY - minY) / 2 };
}

test('complete portrait glass and landscape/desktop case fit the clear region', () => {
  for (const [width,height] of viewports) for (const focused of [false,true]) {
    const {camera,fit} = cameraFrame(width,height,focused), region = fit.region;
    const projected = projection(width < height && width <= 760 ? glass : bounds,camera), label = `${width}x${height}, ${focused ? 'focus' : 'seat'}`;
    assert.ok(projected.minX >= 2 * (region.x - region.width / 2) - 1 - 1e-6,label);
    assert.ok(projected.maxX <= 2 * (region.x + region.width / 2) - 1 + 1e-6,label);
    assert.ok(projected.minY >= 1 - 2 * (region.y + region.height / 2) - 1e-6,label);
    assert.ok(projected.maxY <= 1 - 2 * (region.y - region.height / 2) + 1e-6,label);
    assert.ok(Math.abs(camera.position.x) < 2.16 && camera.position.y > .19 && camera.position.y < 2.19 &&
      camera.position.z > -1.16 && camera.position.z < 3.66,`${label}: observer stays within opaque armor`);
    const shell = createCabinShell(new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial()).shell;
    shell.updateMatrixWorld(true);
    for (const point of boxCorners(glass)) {
      const target = point.applyMatrix4(display.matrix), direction = target.clone().sub(camera.position);
      const hits = new THREE.Raycaster(camera.position,direction.clone().normalize(),.01,direction.length()).intersectObject(shell,true);
      assert.equal(hits.length,0,`${label}: armor does not obscure glass`);
    }
  }
  assert.ok(Math.max(...boxCorners(bounds).map(point => point.applyMatrix4(display.matrix).y)) < 2.19,'terminal clears the closed roof');
});

test('focus makes the same glass larger and front-on while retaining physical cabin context', () => {
  for (const [width,height] of viewports) {
    const seated = projection(glass,cameraFrame(width,height,false).camera);
    const focused = projection(glass,cameraFrame(width,height,true).camera);
    assert.ok(focused.width * focused.height > seated.width * seated.height * 1.08,`${width}x${height}: meaningful area increase`);
    assert.ok(Math.abs(focused.width * width / (focused.height * height) - 5 / 3) < 1e-6,'5:3 imagery is neither stretched nor cropped');
    assert.ok(focused.width < .95 && focused.height < .85,'physical bezel and cabin remain visible');
    if (width < height) {
      assert.ok(seated.width >= .82 && focused.width >= .90,`${width}x${height}: portrait glass remains prominent`);
      const caseProjection = projection(bounds,cameraFrame(width,height,true).camera);
      assert.ok(caseProjection.maxY < 1 && caseProjection.minY > -1,'top and bottom physical bezel remain in the cabin frame');
    }
  }
});

test('Inside shot recoil moves seated and focused glass without clipping across eight viewports', () => {
  const shell = createCabinShell(new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial()).shell;
  shell.updateMatrixWorld(true);
  for (const [width,height] of viewports) for (const focused of [false,true]) {
    const {camera,fit} = cameraFrame(width,height,focused);
    const before = projection(glass,camera), eye = camera.position.clone();
    // The same physical camera kick applies to Day, Thermal and MFoCS; the screen
    // texture does not participate in this transform, and focus only steadies road bob.
    camera.rotateX(firingRecoil('inside',false,2,2)); camera.updateMatrixWorld();
    const peak = projection(glass,camera), label = `${width}x${height}, ${focused ? 'focus' : 'seat'}`;
    assert.ok(Math.abs(peak.minY - before.minY) * height / 2 >= 4,`${label}: physical glass visibly kicks`);
    assert.ok(peak.minX > -.98 && peak.maxX < .98,`${label}: glass retains horizontal viewport clearance`);
    assert.ok(peak.minY >= 1 - 2 * (fit.region.y + fit.region.height / 2) &&
      peak.maxY <= 1 - 2 * (fit.region.y - fit.region.height / 2),`${label}: glass clears driving controls/captions`);
    assert.deepEqual(camera.position,eye,`${label}: kick cannot move the observer through armor`);
    for (const point of boxCorners(glass)) {
      const target = point.applyMatrix4(display.matrix), direction = target.clone().sub(camera.position);
      assert.equal(new THREE.Raycaster(camera.position,direction.clone().normalize(),.01,direction.length()).intersectObject(shell,true).length,0,
        `${label}: glass remains unobscured by cabin armor`);
    }
  }
});

test('range seated glass is more prominent than the former angled monitor on desktop', () => {
  for (const [width,height] of [[1280,900],[1920,1080]]) {
    const old = terminal(); old.position.set(.42,1.68,1.22); old.rotation.set(-.12,-.16,0); old.scale.setScalar(.66); old.updateMatrix();
    const camera = new THREE.PerspectiveCamera(48,width / height,.1,350);
    camera.position.set(-.88,1.64,3.32); camera.lookAt(.64,1.68,1.12); camera.updateMatrixWorld();
    const before = projection(glass,camera,old.matrix), after = projection(glass,cameraFrame(width,height,false).camera);
    assert.ok(after.width * after.height > before.width * before.height * 1.10,`${width}x${height}: default view is larger`);
  }
});

test('Day, Thermal and MFoCS retain focus, while view changes, restart and inspection reset it', () => {
  const state = new CabinDisplayState(); state.toggleFocus();
  for (const mode of ['thermal','mfocs','day'] as const) { state.select(mode); assert.equal(state.focused,true); assert.equal(state.mode,mode); }
  state.leaveInside(); assert.equal(state.focused,false); // Returning to Inside starts seated.
  state.toggleFocus(); state.select('thermal'); state.reset();
  assert.equal(state.focused,false); assert.equal(state.mode,'day'); // Restart/home.
  state.toggleFocus(); state.inspectHealth();
  assert.equal(state.focused,false); assert.equal(state.mode,'mfocs'); // Paused dialog has priority.
});
