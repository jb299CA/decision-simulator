import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingRange } from '../src/range.ts';
import { executeRampCommand, rampCommandAvailability } from '../src/ramp-command.ts';
import type { RampCommandContext } from '../src/ramp-command.ts';
import { DISMOUNT } from '../src/dismount.ts';

const playing: RampCommandContext = { inRange: true, staging: false, hidden: false, inspection: null };
function ready(): DrivingRange {
  const range = new DrivingRange();
  range.position = { x: range.mission.objective.x, z: range.mission.objective.z };
  range.mission.departureCrossed = true;
  for (const contact of range.mission.contacts) { contact.neutralized = true; contact.health = 0; }
  return range;
}

test('UI command boundary reports staging, pause, hidden and inspection holds without queuing a drop', () => {
  const cases: [Partial<RampCommandContext>, boolean, RegExp][] = [
    [{ staging: true }, false, /Staging.*unlocks/],
    [{}, true, /Resume/],
    [{ hidden: true }, false, /Return to the mission/],
    [{ inspection: 'mission map' }, false, /Close the mission map/],
    [{ inspection: 'vehicle inspection' }, false, /Close the vehicle inspection/],
    [{ inspection: 'mission instructions' }, false, /Close the mission instructions/],
    [{ inspection: 'dialog' }, false, /Close the dialog/],
    [{ inRange: false }, false, /Start the driving mission/],
  ];
  for (const [context, paused, reason] of cases) {
    const range = ready(); range.paused = paused;
    const before = JSON.stringify(range);
    const held = { ...playing, ...context };
    assert.match(rampCommandAvailability(range, held).reason, reason);
    const result = executeRampCommand(range, held);
    assert.equal(result.accepted, false); assert.match(result.reason, reason);
    assert.equal(JSON.stringify(range), before, 'held command must not alter or queue the simulation');
    range.paused = false; range.tick(.1, { throttle: 0, steer: 0, aim: 0, fire: false });
    assert.equal(range.dismount.phase, 'stowed');
    assert.equal(executeRampCommand(range, playing).accepted, true, 'a new deliberate command succeeds once released');
  }
});

test('in-zone rejected commands return the current reason instead of a stale mission notice', () => {
  for (const blocked of ['departure', 'contacts', 'coasting'] as const) {
    const range = ready();
    range.mission.notice = 'Old radio instruction';
    if (blocked === 'departure') range.mission.departureCrossed = false;
    if (blocked === 'contacts') range.mission.contacts[0]!.neutralized = false;
    if (blocked === 'coasting') range.speed = .8;
    const result = executeRampCommand(range, playing);
    assert.equal(result.accepted, false);
    assert.match(result.reason, blocked === 'departure' ? /line of departure/ : blocked === 'contacts' ? /Clear every/ : /Stop inside/);
    assert.notEqual(result.reason, 'Old radio instruction');
    assert.equal(range.dismount.phase, 'stowed'); assert.equal(range.mission.failureReason, null);
  }
});

test('accepted click or keyboard command commits one visible unload and blocks repeated activation', () => {
  // Both handlers enter executeRampCommand; the boundary is independent of input device.
  for (const inside of [true, false]) {
    const range = inside ? ready() : new DrivingRange();
    const first = executeRampCommand(range, playing);
    assert.equal(first.accepted, true); assert.match(first.reason, /opening|unloading/);
    assert.equal(range.dismount.phase, 'opening'); assert.equal(range.dismount.validDrop, inside);
    assert.equal(executeRampCommand(range, playing).accepted, false);
    range.tick(.1, { throttle: 1, steer: 1, aim: 1, fire: true });
    assert.equal(range.dismount.elapsed, .1); assert.equal(range.speed, 0); assert.equal(range.shotsFired, 0);
    for (let i = 0; i < DISMOUNT.durationSeconds * 40; i++) range.tick(.025, { throttle: 0, steer: 0, aim: 0, fire: false });
    assert.equal(range.debrief?.outcome, inside ? 'complete' : 'failed');
    assert.equal(executeRampCommand(range, playing).accepted, false);
  }
});
