import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryVehicle, recoveryArrival } from '../src/recovery-vehicle.ts';

test('unarmed visual rolls in, parks once, or appears without movement on reduced motion', () => {
  const truck = new RecoveryVehicle();
  assert.equal(truck.group.visible,false);
  truck.update(0,0,0,0,false,()=>3);
  assert.equal(truck.group.visible,true);
  assert.deepEqual(truck.group.position.toArray(),[4.6,3,-23]);
  assert.ok(recoveryArrival(1,false)>0 && recoveryArrival(1,false)<1);
  truck.update(0,0,0,9,false,()=>3);
  assert.deepEqual(truck.group.position.toArray(),[4.6,3,-1]);
  truck.update(0,0,0,0,true,()=>3);
  assert.deepEqual(truck.group.position.toArray(),[4.6,3,-1]);
  truck.update(0,0,0,null,false,()=>3);
  assert.equal(truck.group.visible,false); truck.dispose();
});
