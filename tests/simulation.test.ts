import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from '../src/simulation.ts';

function inspect(): Simulation {
  const sim = new Simulation();
  assert.equal(sim.begin(), true);
  assert.equal(sim.board(), true);
  for (let i = 0; i < 4; i++) assert.equal(sim.advance(), true);
  assert.equal(sim.phase, 'insight');
  return sim;
}

function run(sim: Simulation, seconds: number, step = .1): void {
  for (let i = 0; i < Math.round(seconds / step); i++) sim.tick(step);
}

test('protective sequence halts, secures and isolates with repair still required', () => {
  const sim = inspect();
  assert.equal(sim.halt(), false, 'no halt decision without sustained evidence');
  run(sim, 18);
  assert.equal(sim.alert, true);
  assert.equal(sim.halt(), true);
  assert.equal(sim.speed, 0);
  assert.equal(sim.moving, false);
  assert.equal(sim.engine, true, 'engine remains at idle until the secure action');
  const distanceTime = sim.drivingTime;
  const severity = sim.faultSeverity;
  run(sim, 5);
  assert.equal(sim.speed, 0);
  assert.equal(sim.drivingTime, distanceTime);
  assert.equal(sim.faultSeverity, severity);
  assert.equal(sim.isolate(), false, 'cannot isolate an unsecured vehicle');
  assert.equal(sim.advance(), false, 'halted phase cannot skip secure');
  assert.equal(sim.secure(), true);
  assert.equal(sim.engine, false);
  assert.equal(sim.alert, false, 'engine-off evidence does not sustain charging alert');
  assert.equal(sim.isolate(), false, 'service inspection remains a separate action');
  assert.equal(sim.advance(), true);
  assert.equal(sim.isolate(), true);
  assert.equal(sim.phase, 'debrief');
  assert.equal(sim.secured, true);
  assert.equal(sim.isolated, true);
  assert.equal(sim.engine, false);
  assert.equal(sim.speed, 0);
  assert.match(sim.timeline.at(-1)!.detail, /repair required/);
  assert.equal(sim.advance(), false);
  assert.equal(sim.board(), false);
  assert.equal(sim.begin(), false);
  const finalState = JSON.stringify(sim);
  run(sim, 2);
  assert.equal(JSON.stringify(sim), finalState, 'debrief cannot resume normal operation');
});

test('pause freezes every mutation and blocks begin, board and safety actions', () => {
  const sim = new Simulation();
  sim.paused = true;
  assert.equal(sim.begin(), false);
  sim.paused = false;
  sim.begin();
  sim.paused = true;
  assert.equal(sim.board(), false);
  sim.paused = false;
  sim.board();
  for (let i = 0; i < 4; i++) sim.advance();
  run(sim, 18);
  sim.paused = true;
  const pausedState = JSON.stringify(sim);
  run(sim, 6);
  assert.equal(sim.advance(), false);
  assert.equal(sim.halt(), false);
  assert.equal(sim.secure(), false);
  assert.equal(sim.isolate(), false);
  assert.equal(JSON.stringify(sim), pausedState);
  sim.paused = false;
  assert.equal(sim.halt(), true);
  sim.paused = true;
  assert.equal(sim.secure(), false);
  sim.paused = false;
  sim.secure();
  sim.paused = true;
  assert.equal(sim.advance(), false);
  sim.paused = false;
  sim.advance();
  sim.paused = true;
  assert.equal(sim.isolate(), false);
});

test('sustained plateau retains a fresh alert through a five-minute inspection', () => {
  const sim = inspect();
  run(sim, 20);
  assert.equal(sim.alert, true);
  for (let minute = 0; minute < 5; minute++) {
    run(sim, 60);
    assert.equal(sim.alert, true, `plateau still evident after minute ${minute + 1}`);
    assert.ok(sim.observations.length <= 100, 'evidence buffer remains bounded');
    assert.ok(sim.observations[0]!.time < 1, 'initial baseline survives buffer rotation');
  }
  assert.equal(sim.halt(), true);
});

test('freshness, engine state and finite observations are required', () => {
  for (const corrupt of [
    (sim: Simulation) => { sim.time += 2; },
    (sim: Simulation) => { sim.latest.fresh = false; },
    (sim: Simulation) => { sim.latest.engine = false; },
    (sim: Simulation) => { sim.latest.voltage = Number.NaN; },
    (sim: Simulation) => { sim.latest.load = Number.POSITIVE_INFINITY; },
    (sim: Simulation) => { sim.latest.load = 1.1; },
    (sim: Simulation) => { sim.latest.load = -.1; },
    (sim: Simulation) => { sim.latest.time = sim.time + 1; },
    (sim: Simulation) => { sim.engine = false; },
    (sim: Simulation) => { sim.observations.slice(-5).forEach(o => { o.fresh = false; }); },
  ]) {
    const sim = inspect();
    run(sim, 20);
    assert.equal(sim.alert, true);
    corrupt(sim);
    assert.equal(sim.alert, false);
    assert.equal(sim.halt(), false);
  }
});

test('high voltage under markedly changed load cannot establish the matching-context insight', () => {
  const sim = inspect();
  run(sim, 20);
  assert.equal(sim.alert, true);
  const voltages = sim.observations.slice(-5).map(o => o.voltage);
  sim.observations.slice(-5).forEach(o => { o.load = .95; });
  assert.deepEqual(sim.observations.slice(-5).map(o => o.voltage), voltages);
  assert.equal(sim.alert, false, 'a changed load context needs additional investigation');
  assert.equal(sim.halt(), false);
});

test('isolated spike or high values without a baseline do not establish a trend', () => {
  const sim = inspect();
  run(sim, 4);
  sim.latest.voltage = 31;
  assert.equal(sim.alert, false);
  const noBaseline = inspect();
  noBaseline.time = 20;
  noBaseline.observations = [17, 17.6, 18.2, 18.8, 19.4].map(time => ({ time, voltage: 31, load: .6, engine: true, fresh: true }));
  assert.equal(noBaseline.alert, false);
});

test('ticks reject nonfinite input, bound large gaps and sample deterministically', () => {
  const sim = inspect();
  const initial = JSON.stringify(sim);
  for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -4]) sim.tick(delta);
  assert.equal(JSON.stringify(sim), initial);
  sim.tick(1000);
  assert.equal(sim.time, .15, 'a stalled frame cannot fast-forward the scenario');
  const a = inspect();
  const b = inspect();
  run(a, 18, .15);
  run(b, 18, .05);
  assert.equal(a.observations.length, b.observations.length);
  for (let i = 0; i < a.observations.length; i++) {
    assert.ok(Math.abs(a.observations[i]!.time - b.observations[i]!.time) < 1e-9);
    assert.ok(Math.abs(a.observations[i]!.voltage - b.observations[i]!.voltage) < 1e-9);
  }
  assert.equal(a.alert, b.alert);
});

test('restart clears clocks, evidence, decisions, pause and fault state', () => {
  const sim = inspect();
  run(sim, 18);
  sim.halt(); sim.secure(); sim.advance(); sim.isolate();
  sim.paused = true;
  sim.restart();
  assert.deepEqual(sim, new Simulation());
  sim.begin(); sim.board();
  run(sim, .6);
  assert.equal(sim.observations.length, 1);
  assert.ok(Math.abs(sim.latest.time - .6) < 1e-9);
  assert.equal(sim.alert, false);
});

test('unsafe transitions are rejected even if prerequisites are inconsistent', () => {
  const sim = inspect();
  assert.equal(sim.secure(), false);
  assert.equal(sim.isolate(), false);
  run(sim, 18);
  sim.halt();
  sim.speed = .2;
  assert.equal(sim.secure(), false);
  sim.speed = 0;
  sim.secure();
  sim.engine = true;
  assert.equal(sim.advance(), false);
  sim.engine = false;
  sim.advance();
  sim.engine = true;
  assert.equal(sim.isolate(), false);
  sim.engine = false;
  sim.secured = false;
  assert.equal(sim.isolate(), false);
});
