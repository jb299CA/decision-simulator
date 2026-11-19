import test from 'node:test';
import assert from 'node:assert/strict';
import { OutcomeReveal, RECOVERY_REVEAL_SECONDS } from '../src/outcome-reveal.ts';
import type { MissionDebrief } from '../src/mission-contract.ts';

const report = (outcome: MissionDebrief['outcome']): MissionDebrief => ({ outcome, endedAt: 95, distanceTravelled: 900, contactsCleared: 5, contactsTotal: 6, summary: 'Stopped', vehicleStatus: 'immobilized', findings: [], decisions: [] });

test('breakdown reveal waits for active presentation time and leaves report untouched', () => {
  const reveal = new OutcomeReveal(), result = Object.freeze(report('breakdown')), before = JSON.stringify(result);
  for (let i = 0; i < 20; i++) reveal.update(result, .1, true);
  assert.equal(reveal.ready, false);
  for (let i = 0; i < 100; i++) reveal.update(result, .1, false);
  reveal.update(result, NaN, true); reveal.update(result, -1, true);
  assert.equal(reveal.ready, false, 'pause/hidden inspection cannot finish the reveal');
  for (let i = 0; i < 11; i++) reveal.update(result, .1, true);
  assert.equal(reveal.ready, true); assert.equal(JSON.stringify(result), before);
});

test('new run resets reveal and backlog cannot skip it; other outcomes are immediate', () => {
  const reveal = new OutcomeReveal(), first = report('breakdown');
  reveal.update(first, 1000, true); assert.equal(reveal.ready, false);
  for (let i = 0; i < 31; i++) reveal.update(first, .1, true);
  reveal.update(report('breakdown'), 0, true); assert.equal(reveal.ready, false);
  for (const outcome of ['complete', 'failed'] as const) { reveal.update(report(outcome), 0, false); assert.equal(reveal.ready, true); }
  reveal.reset(); assert.equal(reveal.ready, false);
});

test('recovery gets a frozen presentation window before the result opens', () => {
  const reveal = new OutcomeReveal(), result = Object.freeze(report('recovery'));
  reveal.update(result,0,false);
  assert.equal(reveal.recoveryElapsed,0);
  for (let i=0;i<20;i++) reveal.update(result,.1,true);
  const stopped = reveal.recoveryElapsed;
  for (let i=0;i<80;i++) reveal.update(result,100,false);
  assert.equal(reveal.recoveryElapsed,stopped);
  for (let i=0;i<RECOVERY_REVEAL_SECONDS*10;i++) reveal.update(result,.1,true);
  assert.equal(reveal.ready,true); assert.equal(reveal.recoveryElapsed,null);
  assert.equal(result.endedAt,95);
});
