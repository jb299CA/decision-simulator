import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DISMOUNT } from '../src/dismount.ts';
import type { DismountState } from '../src/dismount.ts';
import { closedRampClone, createRearRamp, dismountCameraFrame, DismountSquad, REAR_RAMP, sampleTroopPose, updateRearRamp, vehicleLocalToWorld } from '../src/dismount-squad.ts';

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

test('nine exits stagger after ramp opening, spread apart, clear the ramp and face outward', () => {
  assert.equal(DISMOUNT.troopCount,9);
  for (let i = 0; i < DISMOUNT.troopCount; i++) {
    const start = DISMOUNT.rampOpenSeconds + i * DISMOUNT.troopStaggerSeconds;
    assert.equal(sampleTroopPose(start-.001,i).visible,false);
    const first = sampleTroopPose(start,i); assert.equal(first.visible,true); assert.equal(first.progress,0);
    const finish = sampleTroopPose(DISMOUNT.durationSeconds,i);
    assert.equal(finish.progress,1); assert.equal(finish.moving,false); assert.equal(finish.y,0);
    assert.ok(finish.z < -4.2, 'settled figures clear the rear doorway and ramp');
    const length = Math.hypot(finish.x,finish.z);
    assert.ok((Math.sin(finish.yaw)*finish.x + Math.cos(finish.yaw)*finish.z)/length > .99, 'each figure faces away from the vehicle');
    for (let j=0;j<i;j++) {
      const other = sampleTroopPose(DISMOUNT.durationSeconds,j);
      assert.ok(Math.hypot(finish.x-other.x,finish.z-other.z)>2.4, 'distinct destinations leave visible space between figures');
    }
  }
  assert.ok(sampleTroopPose(2,0).progress > sampleTroopPose(2,1).progress);
});

test('rear observer camera contains the full fan, ramp and vehicle at phone and desktop sizes', () => {
  const points:THREE.Vector3[] = [];
  for (let t=0;t<=DISMOUNT.durationSeconds;t+=.05) for (let i=0;i<DISMOUNT.troopCount;i++) {
    const pose=sampleTroopPose(t,i); if (!pose.visible) continue;
    // Camera coordinates reverse vehicle local z. Include body/rifle height and width.
    for (const dx of [-.48,.48]) for (const dy of [0,1.85]) for (const dz of [-.7,.7])
      points.push(new THREE.Vector3(pose.x+dx,pose.y+dy,-pose.z+dz));
  }
  for (const x of [-1.55,1.55]) for (const y of [0,3.4]) for (const z of [-3.4,4.6]) points.push(new THREE.Vector3(x,y,z));
  for (const [width,height,fov] of [[1440,900,48],[390,844,55],[844,390,55],[344,932,55]]) {
    const camera=new THREE.PerspectiveCamera(fov,width/height,.1,200), frame=dismountCameraFrame(width/height,fov);
    camera.position.fromArray(frame.eye); camera.lookAt(new THREE.Vector3().fromArray(frame.lookAt)); camera.updateMatrixWorld(true);
    for (const point of points) {
      const projected=point.clone().project(camera);
      assert.ok(Math.abs(projected.x)<.9 && Math.abs(projected.y)<.85 && projected.z<1, `${width}x${height}: ${point.toArray()} -> ${projected.toArray()}`);
    }
  }
});

test('cosmetic rifles point forward with both hands on the grips while moving and after settling', () => {
  const squad=new DismountSquad();
  for (const elapsed of [2.7,DISMOUNT.durationSeconds]) {
    squad.update(state(elapsed),()=>0,false); squad.group.updateMatrixWorld(true);
    for (const soldier of squad.group.children.filter(s=>s.visible)) {
      const rifle=soldier.getObjectByName('cosmetic-rifle')!;
      const support=soldier.getObjectByName('support-hand')!, trigger=soldier.getObjectByName('trigger-hand')!;
      for (const [hand,point] of [[support,new THREE.Vector3(-.045,-.04,.35)],[trigger,new THREE.Vector3(.045,-.075,0)]] as const)
        assert.ok(hand.getWorldPosition(new THREE.Vector3()).distanceTo(rifle.localToWorld(point))<1e-10);
      const barrel=rifle.getObjectByName('rifle-barrel')!, stock=rifle.getObjectByName('rifle-stock')!;
      const forward=barrel.getWorldPosition(new THREE.Vector3()).sub(stock.getWorldPosition(new THREE.Vector3())).normalize();
      const facing=new THREE.Vector3(0,0,1).applyQuaternion(soldier.quaternion);
      assert.ok(forward.dot(facing)>.9, 'muzzle projects forward rather than across the torso');
      assert.ok(barrel.position.z>stock.position.z+.5, 'stock, receiver, handguard and barrel have a readable longitudinal silhouette');
      assert.ok(rifle.getObjectByName('rifle-magazine') && rifle.getObjectByName('rifle-trigger-grip'));
      if(elapsed===DISMOUNT.durationSeconds) assert.ok(Math.abs(forward.y)<.02, 'settled rifles are raised level');
      else assert.ok(forward.y<-.2, 'moving rifles use a lowered carry');
    }
  }
  squad.dispose();
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
  const snapshot = () => { const matrices:number[][]=[]; squad.group.traverse(child=>matrices.push(child.matrixWorld.elements.slice())); return matrices; };
  const matrices = snapshot();
  const geometries = new Set(), materials = new Set(); let meshes = 0;
  squad.group.traverse(object => { if (object instanceof THREE.Mesh) { meshes++; geometries.add(object.geometry); materials.add(object.material); } });
  for (let i=0;i<100;i++) squad.update(running,ground,false);
  squad.group.updateMatrixWorld(true);
  assert.deepEqual(snapshot(),matrices);
  assert.equal(geometries.size,2); assert.equal(materials.size,8); assert.ok(meshes<400);
  assert.ok(squad.group.children.every(soldier => soldier.getObjectByName('cloth-covered-helmet') && soldier.getObjectByName('protective-eyewear')));
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
  const resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();
  squad.group.traverse(object=>{if(object instanceof THREE.Mesh){resources.add(object.geometry); const material=object.material as THREE.MeshStandardMaterial; resources.add(material); if(material.map) resources.add(material.map);}});
  let disposals=0; resources.forEach(resource=>resource.addEventListener('dispose',()=>disposals++));
  squad.dispose(); squad.dispose(); assert.equal(disposals,11);
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
