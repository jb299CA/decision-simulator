import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DISMOUNT } from '../src/dismount.ts';
import type { DismountState } from '../src/dismount.ts';
import { closedRampClone, createRearRamp, DismountSquad, REAR_RAMP, sampleTroopPose, updateRearRamp, vehicleLocalToWorld } from '../src/dismount-squad.ts';

const state = (elapsed=0):DismountState => ({phase:'unloading',elapsed,position:{x:12,z:-18},heading:0,validDrop:true});

test('rear ramp rotates about its lower hinge and ends near ground behind the vehicle', () => {
  const ramp = createRearRamp(new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial());
  updateRearRamp(ramp.pivot,ramp.doorway,state(0),false);
  assert.equal(ramp.pivot.rotation.x,0);
  updateRearRamp(ramp.pivot,ramp.doorway,state(DISMOUNT.rampOpenSeconds),false);
  ramp.root.updateMatrixWorld(true);
  const hinge = ramp.pivot.localToWorld(new THREE.Vector3());
  const tip = ramp.pivot.localToWorld(new THREE.Vector3(0,REAR_RAMP.length,0));
  assert.equal(hinge.y,REAR_RAMP.hingeY); assert.equal(hinge.z,REAR_RAMP.hingeZ);
  assert.ok(tip.z < hinge.z - 1.2); assert.ok(tip.y > 0 && tip.y < .08);
  assert.equal(ramp.doorway.visible,true);
});

test('nine exits stagger after ramp opening and finish to the sides within Chase camera distance', () => {
  assert.equal(DISMOUNT.troopCount,9);
  for (let i = 0; i < DISMOUNT.troopCount; i++) {
    const start = DISMOUNT.rampOpenSeconds + i * DISMOUNT.troopStaggerSeconds;
    assert.equal(sampleTroopPose(start-.001,i).visible,false);
    const first = sampleTroopPose(start,i); assert.equal(first.visible,true); assert.equal(first.progress,0);
    const finish = sampleTroopPose(DISMOUNT.durationSeconds,i);
    assert.equal(finish.progress,1); assert.equal(finish.moving,false); assert.ok(Math.abs(finish.x)>=3.2);
    assert.ok(finish.z > -7 && finish.z < -4.5); assert.equal(finish.y,0);
  }
  assert.ok(sampleTroopPose(2,0).progress > sampleTroopPose(2,1).progress);
});

test('vehicle-local rear and side positions rotate with arbitrary driving headings', () => {
  const origin={x:10,z:20};
  const north = vehicleLocalToWorld(0,-5,origin,0); assert.ok(Math.abs(north.x-10)<1e-10); assert.equal(north.z,25);
  const west = vehicleLocalToWorld(0,-5,origin,Math.PI/2); assert.equal(west.x,15); assert.ok(Math.abs(west.z-20)<1e-10);
  const south = vehicleLocalToWorld(0,-5,origin,Math.PI); assert.ok(Math.abs(south.x-10)<1e-10); assert.equal(south.z,15);
});

test('squad follows frozen simulation elapsed, resets hidden, and keeps pooled resources bounded', () => {
  const squad = new DismountSquad(), running = state(2.7), ground = () => .3;
  squad.update(running,ground,false); squad.group.updateMatrixWorld(true);
  const matrices = squad.group.children.map(child => child.matrixWorld.elements.slice());
  const geometries = new Set(), materials = new Set(); let meshes = 0;
  squad.group.traverse(object => { if (object instanceof THREE.Mesh) { meshes++; geometries.add(object.geometry); materials.add(object.material); } });
  for (let i=0;i<100;i++) squad.update(running,ground,false);
  squad.group.updateMatrixWorld(true);
  assert.deepEqual(squad.group.children.map(child => child.matrixWorld.elements.slice()),matrices);
  assert.equal(geometries.size,2); assert.equal(materials.size,5); assert.ok(meshes<260);
  squad.reset(); assert.equal(squad.group.visible,false); assert.ok(squad.group.children.every(child=>!child.visible));
  squad.update({...running,phase:'stowed',elapsed:0},ground,false); assert.equal(squad.group.visible,false);
  squad.update({...state(DISMOUNT.durationSeconds),phase:'complete'},ground,false);
  assert.ok(squad.group.visible); assert.ok(squad.group.children.every(child=>child.visible));
  squad.dispose();
});

test('standing boots contact terrain, reduced motion has no limb cycling, and disposal is unique', () => {
  const squad = new DismountSquad(), end = {...state(DISMOUNT.durationSeconds),phase:'complete' as const};
  const ground=(x:number,z:number)=>.5 + x*.02 + z*.01;
  squad.update(end,ground,true); squad.group.updateMatrixWorld(true);
  for (const child of squad.group.children) {
    const bounds=new THREE.Box3().setFromObject(child);
    const surface=ground(child.position.x,child.position.z);
    assert.ok(Math.abs(bounds.min.y-surface)<.04,`${child.name}: boots should meet the ground`);
  }
  const running=state(2.2); squad.update(running,ground,true);
  const soldier=squad.group.children[0];
  const angles=soldier.children.map(child=>child.rotation.x);
  squad.update({...running,elapsed:2.3},ground,true);
  assert.deepEqual(soldier.children.map(child=>child.rotation.x),angles);
  const resources=new Set<THREE.BufferGeometry|THREE.Material>();
  squad.group.traverse(object=>{if(object instanceof THREE.Mesh){resources.add(object.geometry); resources.add(object.material as THREE.Material);}});
  let disposals=0; resources.forEach(resource=>resource.addEventListener('dispose',()=>disposals++));
  squad.dispose(); squad.dispose(); assert.equal(disposals,7);
});

test('inspection source closes an open ramp without mutating it or carrying squad actors', () => {
  const vehicle=new THREE.Group(), ramp=createRearRamp(new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial()); vehicle.add(ramp.root);
  const squad=new DismountSquad(), world=new THREE.Group(); world.add(vehicle,squad.group);
  updateRearRamp(ramp.pivot,ramp.doorway,state(2),false);
  const inspection=closedRampClone(vehicle);
  assert.equal(inspection.getObjectByName(ramp.pivot.name)!.rotation.x,0);
  assert.equal(inspection.getObjectByName(ramp.doorway.name)!.visible,false);
  assert.equal(inspection.getObjectByName('deployed-squad'),undefined);
  assert.equal(ramp.pivot.rotation.x,REAR_RAMP.openAngle); assert.equal(ramp.doorway.visible,true);
  updateRearRamp(ramp.pivot,ramp.doorway,{...state(0),phase:'stowed'},false);
  assert.equal(ramp.pivot.rotation.x,0); assert.equal(ramp.doorway.visible,false); squad.dispose();
});
