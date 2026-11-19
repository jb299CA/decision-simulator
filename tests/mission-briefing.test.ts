import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionBriefing, missionBriefingText, BRIEFING_CHARACTERS_PER_SECOND, practicePrompt } from '../src/mission-briefing.ts';

test('orders type deliberately, never accept early, and remain stable until acceptance', () => {
  const briefing = new MissionBriefing();
  briefing.begin('Viper 35');
  assert.equal(briefing.accept(), false);
  for (let i = 0; i < 50; i++) briefing.update(.1, true);
  assert.equal(briefing.ready, false);
  assert.ok(briefing.visibleText.length <= 5 * BRIEFING_CHARACTERS_PER_SECOND);
  assert.equal(briefing.text, missionBriefingText('Viper 35'));
  for (let i = 0; i < 100; i++) briefing.update(.1, true);
  assert.equal(briefing.ready, true, 'complete within fifteen active seconds');
  assert.equal(briefing.visibleText, briefing.text);
  assert.equal(briefing.accept(), true);
  assert.equal(briefing.accept(), false, 'acceptance can enter the run only once');
});

test('pause, hidden time and cached frame gaps cannot skip the briefing', () => {
  const briefing = new MissionBriefing(); briefing.begin('Nomad 19');
  briefing.update(2, false); briefing.update(NaN, true); briefing.update(-1, true);
  assert.equal(briefing.visibleText, '');
  briefing.update(600, true);
  assert.ok(briefing.visibleText.length <= 5, 'late frame advances at most a normal presentation frame');
  const before = briefing.visibleText;
  briefing.update(300, false); assert.equal(briefing.visibleText, before);
  briefing.cancel(); assert.equal(briefing.accept(), false); assert.equal(briefing.text, '');
  briefing.begin('Raven 21'); assert.equal(briefing.visibleText, ''); assert.match(briefing.text, /RAVEN 21/);
});

test('reduced motion and explicit skip reveal text but still require acceptance', () => {
  for (const reduced of [true, false]) {
    const briefing = new MissionBriefing(); briefing.begin('Viper 35', reduced);
    if (!reduced) briefing.skip();
    assert.equal(briefing.ready, true); assert.equal(briefing.visibleText, briefing.text);
    assert.match(briefing.text, /Practice boards are optional/);
    assert.match(briefing.text, /From departure: three minutes/);
    assert.match(briefing.text, /Then Drop ramp/);
    assert.equal(briefing.accept(), true);
  }
});

test('training guidance recognizes firing or crushed boards without imposing a practice gate', () => {
  assert.match(practicePrompt(0, 0), /optional/);
  assert.match(practicePrompt(1, 0), /Ready when you are/);
  assert.match(practicePrompt(0, 1), /Ready when you are/);
  assert.doesNotMatch(practicePrompt(40, 6), /test fire|fire at|Practice on/i);
});
