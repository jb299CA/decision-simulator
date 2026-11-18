import assert from 'node:assert/strict';
import test from 'node:test';
import { CameraMotion } from '../src/camera-motion.ts';
import type { Phase } from '../src/simulation.ts';

const input = (phase: Phase = 'cabin') => ({phase, view: 'commander' as const, delta: .05, paused: false, reducedMotion: false, moving: true, speed: 1});

test('boarding cuts below a dark fade instead of moving through the hull', () => {
  const camera = new CameraMotion();
  camera.update(input('exterior'));
  const start = camera.update(input('cabin'));
  assert.equal(start.phase, 'exterior'); assert.equal(start.cut, true);
  let pose = start;
  for (let i = 0; i < 7; i++) pose = camera.update(input('cabin'));
  assert.equal(pose.phase, 'cabin'); assert.ok(pose.fade > .9);
  for (let i = 0; i < 12; i++) pose = camera.update(input('cabin'));
  assert.equal(pose.fade, 0);
});

test('pause and hidden-tab delta freeze the exact pose and unfinished fade', () => {
  const camera = new CameraMotion(); camera.update(input('exterior')); camera.update(input('cabin'));
  const pose = camera.update(input('cabin'));
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(camera.update({...input('cabin'), paused: true}), pose);
    assert.deepEqual(camera.update({...input('cabin'), delta: 0}), pose);
  }
});

test('vibration stays bounded, deterministic and disappears under reduced motion', () => {
  const camera = new CameraMotion(), twin = new CameraMotion();
  for (let i = 0; i < 10000; i++) {
    const pose = camera.update(input());
    assert.deepEqual(pose, twin.update(input()));
    assert.ok(Math.abs(pose.offset[0]) <= .016 && Math.abs(pose.offset[1]) <= .023 && Math.abs(pose.offset[2]) <= .008);
    assert.ok(Math.abs(pose.pitch) <= .0035 && Math.abs(pose.roll) <= .0038);
  }
  const reduced = camera.update({...input(), reducedMotion: true});
  assert.deepEqual(reduced.offset, [0,0,0]); assert.equal(reduced.pitch, 0); assert.equal(reduced.roll, 0);
});

test('reduced motion cuts immediately and debrief fade completes without telemetry time', () => {
  const camera = new CameraMotion(); camera.update(input('exterior'));
  const reduced = camera.update({...input('cabin'), reducedMotion: true});
  assert.equal(reduced.phase, 'cabin'); assert.equal(reduced.fade, 0); assert.equal(reduced.progress, 1);
  camera.update({...input('service'), moving: false});
  let pose = camera.update({...input('debrief'), moving: false});
  for (let i = 0; i < 20; i++) pose = camera.update({...input('debrief'), moving: false});
  assert.equal(pose.phase, 'debrief'); assert.equal(pose.fade, 0);
});

test('inside and hatch views use the same protected cut and halt vibration settles', () => {
  const camera = new CameraMotion(); camera.update(input());
  let pose = camera.update({...input(), view: 'inside'});
  assert.equal(pose.cut, true); assert.equal(pose.view, 'commander');
  for (let i = 0; i < 20; i++) pose = camera.update({...input(), view: 'inside'});
  assert.equal(pose.view, 'inside');
  for (let i = 0; i < 60; i++) pose = camera.update({...input('halted'), moving: false});
  assert.ok(Math.abs(pose.offset[1]) < .000001); assert.ok(Math.abs(pose.pitch) < .000001);
});
