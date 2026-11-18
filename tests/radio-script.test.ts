import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { radioScript } from '../src/radio-script.ts';

const originalCues = [...Object.values(radioScript.phase), ...radioScript.ambient];
const cues = [...originalCues, ...radioScript.radioOrders, ...radioScript.radioRelays];
const root = new URL('../', import.meta.url);

test('Brave radio calls stand alone while crew intercom stays plain', () => {
  assert.equal(originalCues.length, 14, 'existing phase/ambient IDs remain compatible');
  assert.equal(new Set(cues.map(cue => cue.id)).size, cues.length);
  assert.equal(radioScript.phase.cabin.text, 'Crew checks complete. Driver, move when ready.');
  for (const cue of cues) {
    assert.doesNotMatch(cue.text, /\b(?:Raven|Bravo|eleven)\b/i);
    assert.doesNotMatch(cue.text, /Brave one one/i, 'crew identity changes with the selected unit');
    assert.doesNotMatch(cue.text, /over\s+and\s+out|roger[,.\s]+wilco|wilco[,.\s]+roger|radio check/i);
    assert.doesNotMatch(cue.speaker, /\u00c2|\ufffd/);
    if (cue.channel === 'radio') {
      if ('segments' in cue) {
        assert.equal(cue.segments.map(segment => segment.text).join(' '), cue.text, 'caption preserves both transmissions');
        const [order, acknowledgement] = cue.segments;
        assert.match(order.text, /\. Over\.$/);
        assert.match(acknowledgement.text, /\. Wilco\. Out\.$/);
        assert.notEqual(order.voice, acknowledgement.voice, 'order and acknowledgement have distinct voices');
        for (const segment of cue.segments) {
          assert.match(segment.text, /^.+, this is .+\./, 'called station precedes sender');
          assert.doesNotMatch(segment.spokenText, /\bthree\b/, 'formal digit three is voiced TREE');
        }
      } else {
        assert.match(cue.text, /^(?:All Brave stations|Brave one one|Brave six), this is Brave (?:six|one one|one two)\./);
      }
      assert.match(cue.text, /\. Out\.$/, `${cue.id} closes its own transmission`);
      assert.match(cue.speaker, /RADIO$/);
    } else {
      assert.match(cue.speaker, /INTERCOM$/);
      assert.doesNotMatch(cue.text, /\b(?:this is|roger|wilco|over|out)\b/i, 'intercom needs no net-call ceremony');
    }
  }
  for (const cue of radioScript.ambient) {
    assert.doesNotMatch(cue.text, /route (?:ahead )?is clear|no contacts|mission complete|rear element is together/i);
    assert.doesNotMatch(cue.text, /\b(?:roger|copy|wilco)\b/i, 'ambient scheduling cannot assume an earlier reply');
  }
  assert.match(radioScript.phase.insight.text, /only suspected/);
  assert.match(radioScript.phase.service.text, /confirm the fault before repair/);
  assert.match(radioScript.phase.debrief.text, /repair and verification are still required/i);
});

test('HQ orders and company relays cover every requested matching call sign', () => {
  assert.equal(radioScript.radioOrders.length, 3);
  assert.equal(radioScript.radioRelays.length, 9);
  const companies = { aztec: 'Aztec', brave: 'Brave', 'crazy-horse': 'Crazy Horse' };
  const numbers = { 1: 'one', 2: 'two', 3: 'three' };
  for (const [company, name] of Object.entries(companies)) {
    const orders = radioScript.radioOrders.filter(cue => cue.company === company);
    assert.equal(orders.length, 1);
    assert.ok(orders[0].segments[0].text.startsWith(`${name} six, this is Tomahawk three.`));
    assert.equal(orders[0].segments[1].text, `Tomahawk three, this is ${name} six. Wilco. Out.`);
    for (const platoon of [1, 2, 3] as const) {
      const relays = radioScript.radioRelays.filter(cue => cue.company === company && cue.platoon === platoon);
      assert.equal(relays.length, 1);
      assert.ok(relays[0].segments[0].text.startsWith(`${name} ${numbers[platoon]}-six, this is ${name} six.`));
      assert.equal(relays[0].segments[1].text, `${name} six, this is ${name} ${numbers[platoon]}-six. Wilco. Out.`);
    }
  }
});

test('every caption resolves to a compact, versioned public MP3 asset', () => {
  const payloadTexts = new Map<string, string>();
  for (const cue of cues) {
    const publicUrl = new URL(cue.file, 'https://example.invalid');
    assert.equal(publicUrl.pathname, `/audio/${cue.id}.mp3`);
    assert.match(publicUrl.searchParams.get('v') ?? '', /^(?:brave11-r42b?|net-orders-r42b)$/);
    const mp3 = readFileSync(new URL(`public${publicUrl.pathname}`, root));
    assert.ok(mp3.length > 1000 && mp3.length < 150000, 'nonempty mobile-sized speech asset');
    assert.equal(mp3[0], 0xff, 'MP3 starts with a frame sync');
    assert.equal(mp3[1] & 0xe0, 0xe0);
    const payload = mp3.toString('base64');
    if (payloadTexts.has(payload)) assert.equal(payloadTexts.get(payload), cue.text, 'different captions must not share an unrelated speech clip');
    payloadTexts.set(payload, cue.text);
  }
});
