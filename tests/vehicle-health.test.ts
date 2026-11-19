import assert from 'node:assert/strict';
import test from 'node:test';
import { VehicleHealth } from '../src/vehicle-health.ts';

function advance(health: VehicleHealth, seconds: number, moving = true, start = 0): void {
  for (let i = 0; i < Math.round(seconds * 40); i++) health.tick(.025, moving, start + (i + 1) * .025);
}

test('three relative signals have bounded finite histories and movement-only exposure', () => {
  const health = new VehicleHealth();
  advance(health, 3); const frozen = JSON.stringify(health.state);
  advance(health, 30, false, 3);
  health.tick(NaN, true, 34); health.tick(-1, true, 34); health.tick(.1, true, NaN);
  assert.equal(JSON.stringify(health.state), frozen);
  advance(health, 1000, true, 33);
  assert.equal(health.state.phase, 'broken'); assert.equal(health.state.breakdownCause, 'cooling');
  assert.equal(health.state.alertSerial, 7);
  assert.ok(health.state.observations.length <= 48);
  for (const fault of health.state.faults) {
    assert.equal(fault.baseline, 100); assert.ok(fault.observations.length <= 48);
    assert.ok(fault.observations.every(sample => Number.isFinite(sample.time) && sample.value >= 100 && sample.value <= 280));
    assert.ok(fault.damage >= 0 && fault.damage <= 1);
    assert.notEqual(fault.firstWarningAt, null); assert.notEqual(fault.severeAt, null);
  }
  const broken = JSON.stringify(health.state); advance(health, 10);
  assert.equal(JSON.stringify(health.state), broken);
});

test('faults appear successively and diagnosis does not remove severity or wear', () => {
  const health = new VehicleHealth();
  advance(health, 6);
  assert.deepEqual(health.state.faults.map(fault => fault.severity), ['moderate', 'normal', 'normal']);
  const exposure = health.state.faults[0]!.exposure;
  assert.equal(health.decide('diagnose', 6, 'charging'), true);
  assert.equal(health.decide('diagnose', 6, 'charging'), false);
  assert.match(health.state.message, /not a proven diagnosis/);
  assert.equal(health.state.faults[0]!.exposure, exposure);
  advance(health, 14, true, 6);
  assert.deepEqual(health.state.faults.map(fault => fault.severity), ['moderate', 'moderate', 'normal']);
  advance(health, 10, true, 20);
  assert.equal(health.state.faults[0]!.severity, 'severe');
  assert.equal(health.state.faults[0]!.diagnosed, false, 'new severity requires inspection of new evidence');
  advance(health, 25, true, 30);
  assert.deepEqual(health.state.faults.map(fault => fault.severity), ['severe', 'severe', 'severe']);
  assert.equal(health.state.alertSerial, 6);
});

test('early reduced pace limits future damage, while late mitigation preserves major repair needs', () => {
  const early = new VehicleHealth(); advance(early, 6);
  assert.equal(early.decide('reduce-pace', 6), true);
  assert.equal(early.decide('reduce-pace', 6), false);
  advance(early, 150, true, 6);
  assert.ok(Math.abs(early.state.faults[0]!.exposure - 24) < 1e-7);
  assert.ok(early.state.faults.every(fault => fault.maintenance === 'none' || fault.maintenance === 'inspection'));
  const late = new VehicleHealth(); advance(late, 55);
  const before = late.state.faults.map(fault => fault.damage);
  late.decide('reduce-pace', 55); advance(late, 100, true, 55);
  assert.equal(late.state.phase, 'critical'); assert.equal(late.state.breakdownCause, null);
  assert.equal(late.state.faults[0]!.maintenance, 'major');
  assert.equal(late.state.faults[2]!.maintenance, 'major');
  assert.ok(late.state.faults.every((fault, index) => fault.damage >= before[index]!));
});

test('continue is acknowledgement only; recovery preserves evidence and decisions then freezes', () => {
  const health = new VehicleHealth(); advance(health, 6);
  assert.equal(health.decide('continue', 6), true);
  assert.equal(health.decide('continue', 6), false);
  advance(health, 24, true, 6);
  assert.equal(health.state.phase, 'critical'); assert.equal(health.state.paceLimited, false);
  assert.equal(health.decide('recovery', 30), true);
  assert.deepEqual(health.state.decisions, [{ action: 'continue', time: 6 }, { action: 'recovery', time: 30 }]);
  const state = JSON.stringify(health.state); advance(health, 20, true, 30);
  assert.equal(JSON.stringify(health.state), state);
  assert.equal(health.decide('diagnose', 50), false);
  const stable = health.state, staleFault = health.state.faults[0]!;
  health.restart();
  assert.equal(health.state, stable); assert.equal(health.state.phase, 'nominal');
  assert.equal(health.state.decisions.length, 0); assert.equal(health.state.paceLimited, false);
  assert.equal(staleFault.severity, 'severe'); assert.equal(health.state.faults[0]!.severity, 'normal');
});

test('arcade fault schedule varies onset by run, can omit a fault, and is fixed while driving', () => {
  const draws=[.95,0,0,.01,.95,.99,.4,.9,.99]; let count=0;
  const health=new VehicleHealth(()=>draws[count++]??0);
  const byId=(id:string)=>health.state.faults.find(fault=>fault.id===id)!;
  advance(health,60,false);
  advance(health,25,true,60);
  assert.ok(health.state.faults.every(fault=>fault.reading===100 && fault.firstWarningAt===null));
  advance(health,4,true,85);
  assert.ok(health.state.faults.every(fault=>fault.firstWarningAt===null));
  advance(health,1,true,89);
  assert.equal(byId('wheel-end').firstWarningAt,90);
  assert.equal(byId('cooling').firstWarningAt,null);
  advance(health,20,true,90);
  assert.equal(byId('cooling').firstWarningAt,110);
  advance(health,30,true,110);
  assert.equal(byId('charging').reading,100,'omitted sensor stays at baseline');
  assert.equal(byId('charging').firstWarningAt,null);
  assert.equal(count,4,'frames never reroll faults');
  health.restart();
  advance(health,48);
  assert.ok(health.state.faults.every(fault=>fault.firstWarningAt===null));
  advance(health,1,true,48);
  assert.equal(byId('cooling').firstWarningAt,49,'different primary fault and onset');
  advance(health,160,true,49);
  assert.ok(byId('cooling').severeAt! > byId('cooling').firstWarningAt!);
  assert.equal(health.state.phase,'broken');
  assert.equal(count,9);
});

test('arcade random input is defensive and restart cannot repeat the primary fault', () => {
  const health=new VehicleHealth(()=>NaN);
  advance(health,30);
  assert.equal(health.state.faults.find(fault=>fault.firstWarningAt!=null)?.id,'charging');
  health.restart(); advance(health,30);
  assert.equal(health.state.faults.find(fault=>fault.firstWarningAt!=null)?.id,'cooling');
});
