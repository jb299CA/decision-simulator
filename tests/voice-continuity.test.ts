import assert from 'node:assert/strict';
import test from 'node:test';
import { radioScript } from '../src/radio-script.ts';

type VoiceLine = { speaker: string; voice: string; segments?: readonly { speaker: string; voice: string }[] };
const character = (speaker: string) => speaker.split(/\s+(?:\u00b7|\u2014|\?)\s+/)[0]!;
const primary = [...Object.values(radioScript.phase), ...radioScript.ambient, ...radioScript.radioOrders, ...radioScript.radioRelays, radioScript.recovery, ...Object.values(radioScript.crew)];

function castFor(cues: readonly VoiceLine[]): Map<string, string> {
  const cast = new Map<string, string>();
  for (const cue of cues) for (const line of cue.segments ?? [cue]) {
    const name = character(line.speaker), previous = cast.get(name);
    if (previous) assert.equal(line.voice, previous, `Performer changed for ${name}`);
    else cast.set(name, line.voice);
  }
  return cast;
}

test('each character keeps the same performer across all campaign and guided cues', () => {
  const cast = castFor(primary);
  for (const name of ['TOMAHAWK 3', 'BRAVE 6', 'COMMANDER', 'DRIVER', 'RECOVERY']) assert.ok(cast.has(name));
  assert.equal(cast.get('TOMAHAWK 3'), 'am_michael');
  assert.equal(cast.get('COMMANDER'), 'am_fenrir');
  assert.equal(cast.get('DRIVER'), 'am_eric');
  assert.equal(cast.get('RECOVERY'), 'am_eric');
  assert.equal(cast.get('BRAVE 6'), cast.get('COMMANDER'), 'guided radio and intercom use the same commander');
  assert.notEqual(cast.get('COMMANDER'), cast.get('DRIVER'), 'crew leads stay distinguishable');
});

test('the optional alternate headquarters cast changes only headquarters, never responding characters', () => {
  const alternateOrders = radioScript.radioFemale.filter(cue => radioScript.radioOrders.some(order => order.id === cue.baseId));
  assert.equal(alternateOrders.length, radioScript.radioOrders.length);
  const cast = castFor([...alternateOrders, ...radioScript.radioRelays, ...radioScript.ambient]);
  const normal = castFor(primary);
  assert.notEqual(cast.get('TOMAHAWK 3'), normal.get('TOMAHAWK 3'));
  for (const [name, voice] of cast) if (name !== 'TOMAHAWK 3') assert.equal(voice, normal.get(name), name);
});

