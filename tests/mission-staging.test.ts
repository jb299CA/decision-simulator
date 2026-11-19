import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionStaging, MISSION_STAGING_SECONDS, MISSION_STAGING_CAPTION } from '../src/mission-staging.ts';
import { DrivingRange } from '../src/range.ts';

test('arrival holds the world, health and deadline for four visible seconds before one release', () => {
  const staging = new MissionStaging(), range = new DrivingRange(() => .2);
  staging.begin();
  const time = range.time, faultCount = range.health.faults.length;
  let releases = 0;
  for (let i = 0; i < 39; i++) { if (staging.update(.1, true)) releases++; }
  assert.equal(staging.active, true);
  assert.equal(range.time, time); assert.equal(range.health.faults.length, faultCount);
  assert.equal(range.mission.departureCrossed, false);
  if (staging.update(.1, true)) releases++;
  assert.equal(staging.active, false); assert.equal(staging.elapsed, MISSION_STAGING_SECONDS);
  for (let i = 0; i < 20; i++) if (staging.update(.1, true)) releases++;
  assert.equal(releases, 1);
  assert.match(MISSION_STAGING_CAPTION, /Engines.*Stryker.*gunfire.*radio/);
});

test('manual pause, inspection and hidden intervals hold arrival; long frames cannot skip it', () => {
  const staging = new MissionStaging(); staging.begin(); staging.update(.1, true);
  const elapsed = staging.elapsed;
  for (const delta of [30, Infinity, NaN, -1, .15]) assert.equal(staging.update(delta, false), false);
  assert.equal(staging.elapsed, elapsed);
  staging.update(600, true);
  assert.ok(staging.elapsed < .26, 'visible catchup is capped to one frame');
  staging.cancel(); assert.equal(staging.active, false);
  staging.begin(); assert.equal(staging.elapsed, 0, 'a restarted briefing gets a fresh arrival');
});
