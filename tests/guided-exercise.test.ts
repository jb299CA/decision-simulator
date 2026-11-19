import assert from 'node:assert/strict';
import test from 'node:test';
import { GuidedExercise, GUIDED_STEPS } from '../src/guided-exercise.ts';
import { Simulation } from '../src/simulation.ts';

function run(sim: Simulation, seconds: number): void {
  for (let index = 0; index < seconds * 10; index++) sim.tick(.1);
}

test('the visible guided actions complete the actual protective sequence', () => {
  const sim = new Simulation();
  const guide = new GuidedExercise();
  sim.begin();
  assert.match(guide.describe(sim).detail, /No driving controls/);
  assert.equal(guide.activate(sim), true);
  assert.equal(sim.phase, 'cabin');
  assert.equal(guide.displayOpen, false, 'boarding leaves the scene visible');
  const beforeInspect = JSON.stringify(sim);
  assert.equal(guide.activate(sim), false);
  assert.equal(guide.displayOpen, true);
  assert.equal(JSON.stringify(sim), beforeInspect, 'opening MFoCS is not evidence review or advancement');
  for (const expected of ['feed', 'manifold', 'turbine', 'insight']) {
    assert.equal(guide.activate(sim), true);
    assert.equal(sim.phase, expected);
    assert.equal(guide.displayOpen, true, 'display choice survives data-path phases');
  }
  assert.equal(guide.describe(sim).disabled, true);
  assert.match(guide.describe(sim).reason, /Waiting for sustained fresh readings/);
  assert.equal(guide.activate(sim), false, 'clicking cannot manufacture warning evidence');
  run(sim, 18);
  assert.equal(guide.describe(sim).disabled, false);
  assert.equal(guide.activate(sim), true);
  assert.equal(sim.phase, 'halted');
  assert.equal(sim.speed, 0);
  assert.equal(sim.engine, true);
  guide.toggleDisplay();
  assert.equal(guide.activate(sim), true, 'secure action remains outside the collapsed display');
  assert.equal(sim.phase, 'secured');
  assert.equal(sim.engine, false);
  assert.equal(guide.activate(sim), true);
  assert.equal(sim.phase, 'service');
  assert.match(guide.describe(sim).detail, /Repair is still required/);
  assert.equal(guide.activate(sim), true);
  assert.equal(sim.phase, 'debrief');
  assert.equal(sim.secured, true);
  assert.equal(sim.isolated, true);
  assert.equal(sim.engine, false);
  assert.match(sim.timeline.at(-1)!.detail, /repair required/);
  assert.equal(guide.activate(sim), false);
  assert.deepEqual(guide.describe(sim).progress.filter(step => step.state === 'complete').map(step => step.phase), GUIDED_STEPS.slice(0, -1).map(step => step.phase));
});

test('hiding and reopening MFoCS preserves observations, decisions and phase', () => {
  const sim = new Simulation(); const guide = new GuidedExercise();
  sim.begin(); guide.activate(sim); guide.activate(sim); guide.activate(sim);
  run(sim, 4);
  const inspectedState = JSON.stringify(sim);
  guide.toggleDisplay();
  assert.equal(guide.displayOpen, false);
  assert.equal(guide.describe(sim).needsDisplay, true);
  assert.equal(guide.activate(sim), false, 'next visible action reopens the current inspection instead of skipping it');
  assert.equal(guide.displayOpen, true);
  assert.equal(JSON.stringify(sim), inspectedState);
  assert.equal(guide.activate(sim), true);
  assert.equal(sim.phase, 'manifold');
});

test('paused guided actions explain the hold and never mutate the exercise', () => {
  const sim = new Simulation(); const guide = new GuidedExercise();
  sim.begin(); guide.activate(sim);
  sim.paused = true;
  const before = JSON.stringify(sim);
  assert.match(guide.describe(sim).reason, /paused.*Resume/);
  assert.equal(guide.describe(sim).disabled, true);
  assert.equal(guide.activate(sim), false);
  assert.equal(guide.displayOpen, false, 'a progression click cannot open the inspection while paused');
  guide.toggleDisplay();
  assert.equal(JSON.stringify(sim), before, 'explicit view choices can change without changing paused simulation');
  sim.paused = false;
  assert.equal(guide.activate(sim), true);
  assert.equal(sim.phase, 'feed');
});

test('waiting explanation returns if fresh supporting evidence is lost', () => {
  const sim = new Simulation(); const guide = new GuidedExercise();
  sim.begin(); guide.activate(sim); guide.activate(sim);
  for (let i = 0; i < 4; i++) guide.activate(sim);
  run(sim, 18);
  assert.equal(guide.describe(sim).disabled, false);
  sim.latest.fresh = false;
  assert.equal(guide.describe(sim).disabled, true);
  assert.match(guide.describe(sim).reason, /fresh readings/);
  const before = JSON.stringify(sim);
  assert.equal(guide.activate(sim), false);
  assert.equal(JSON.stringify(sim), before);
  run(sim, 3);
  assert.equal(guide.activate(sim), true);
  assert.equal(sim.phase, 'halted');
});

test('restart restores the complete approach and first-inspection flow', () => {
  const sim = new Simulation(); const guide = new GuidedExercise();
  sim.begin(); guide.activate(sim); guide.activate(sim); guide.activate(sim);
  run(sim, 5);
  sim.restart(); guide.reset();
  assert.deepEqual(sim, new Simulation());
  assert.equal(guide.displayOpen, false);
  assert.equal(guide.activate(sim), false, 'home requires explicit exercise start');
  sim.begin();
  assert.equal(guide.describe(sim).step, 0);
  assert.ok(guide.describe(sim).progress.slice(1).every(step => step.state === 'upcoming'));
  guide.activate(sim);
  assert.equal(guide.describe(sim).needsDisplay, true);
});
