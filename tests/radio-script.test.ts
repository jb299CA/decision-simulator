import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { radioScript } from '../src/radio-script.ts';

const originalCues = [...Object.values(radioScript.phase), ...radioScript.ambient];
const primaryPool = [...radioScript.radioOrders, ...radioScript.radioRelays];
const cues = [...originalCues, ...primaryPool, ...radioScript.radioFemale, ...Object.values(radioScript.crew)];
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
          assert.doesNotMatch(segment.spokenText, /Tomahawk tree/i, 'Tomahawk Three uses the user-requested ordinary pronunciation');
          assert.doesNotMatch(segment.spokenText, /\b(?:tree|fower|fife|niner|wun|ait)\b/i, 'all numbers use ordinary pronunciation');
        }
      } else {
        assert.match(cue.text, /^(?:All Brave stations|Brave one one|Brave six), this is Brave (?:six|one one|one two)\./);
      }
      assert.match(cue.text, /\. Out\.$/, `${cue.id} closes its own transmission`);
      assert.match(cue.speaker, /RADIO$/);
    } else {
      assert.match(cue.speaker, /(?:INTERCOM|ICS)$/);
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

test('all synthesis uses ordinary numbers and preserves digit-by-digit call signs', () => {
  for (const cue of cues) {
    const synthesis = 'segments' in cue ? cue.segments.map(segment => segment.spokenText).join(' ') : cue.text;
    for (const text of [cue.text, synthesis]) {
      assert.doesNotMatch(text, /\b(?:tree|fower|fife|niner|wun|ait|fife-er)\b/i, `${cue.id}: ordinary number pronunciation`);
    }
    if ('platoon' in cue) {
      const digit = { 1: 'one', 2: 'two', 3: 'three' }[cue.platoon];
      assert.ok(synthesis.includes(`${digit} six`), 'callsign digits stay separate');
      assert.match(synthesis, /three minutes from the ell dee/, 'deadline remains three minutes from the LD');
      assert.doesNotMatch(synthesis, /\b(?:sixteen|twenty-six|thirty-six)\b/i);
    }
  }
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
    assert.match(orders[0].segments[0].spokenText, /Tomahawk three/);
    assert.match(orders[0].segments[1].spokenText, /^Tomahawk three,/);
    assert.equal(orders[0].segments[1].text, `Tomahawk three, this is ${name} six. Wilco. Out.`);
    for (const platoon of [1, 2, 3] as const) {
      const relays = radioScript.radioRelays.filter(cue => cue.company === company && cue.platoon === platoon);
      assert.equal(relays.length, 1);
      assert.ok(relays[0].segments[0].text.startsWith(`${name} ${numbers[platoon]}-six, this is ${name} six.`));
      assert.equal(relays[0].segments[1].text, `${name} six, this is ${name} ${numbers[platoon]}-six. Wilco. Out.`);
      assert.match(relays[0].segments[0].text, /Cleared to test fire\. Then move to the line of departure\. Report when ready\. You have three minutes from the LD to reach the dismount point\. Over\.$/);
      assert.match(relays[0].segments[0].spokenText, /from the ell dee to reach/);
      assert.doesNotMatch(relays[0].segments[1].text, /ready/i, 'acknowledgement confirms receipt before practice is complete');
    }
  }
});

test('primary commanders and all replies are male with matching female commander alternates', () => {
  assert.equal(cues.length, 40);
  assert.equal(radioScript.radioFemale.length, 12);
  for (const cue of [...originalCues, ...primaryPool]) {
    assert.match(cue.voice, /^am_/);
    if ('segments' in cue) for (const segment of cue.segments) assert.match(segment.voice, /^am_/);
  }
  for (const base of primaryPool) {
    const variants = radioScript.radioFemale.filter(cue => cue.baseId === base.id);
    assert.equal(variants.length, 1);
    const variant = variants[0];
    assert.equal(variant.id, `${base.id}_female`);
    assert.equal(variant.text, base.text);
    assert.equal(variant.speaker, base.speaker);
    assert.equal(variant.company, base.company);
    assert.equal(variant.voice, 'af_sarah');
    assert.equal(variant.segments[0].voice, 'af_sarah');
    assert.notDeepEqual(
      readFileSync(new URL(`public/audio/${variant.id}.mp3`, root)),
      readFileSync(new URL(`public/audio/${base.id}.mp3`, root)),
      'female commander is a separately generated take',
    );
    assert.deepEqual(variant.segments[1], base.segments[1], 'male reply and matching called station stay intact');
    for (const [index, segment] of variant.segments.entries()) {
      assert.equal(segment.text, base.segments[index].text);
      assert.equal(segment.spokenText, base.segments[index].spokenText);
    }
  }
});

test('every caption resolves to a compact, versioned public MP3 asset', () => {
  const payloadTexts = new Map<string, string>();
  for (const cue of cues) {
    const publicUrl = new URL(cue.file, 'https://example.invalid');
    assert.equal(publicUrl.pathname, `/audio/${cue.id}.mp3`);
    assert.equal(publicUrl.searchParams.get('v'), 'natural-radio-r59');
    const mp3 = readFileSync(new URL(`public${publicUrl.pathname}`, root));
    assert.ok(mp3.length > 1000 && mp3.length < 180000, 'nonempty mobile-sized speech asset, including the complete opening order');
    assert.equal(mp3[0], 0xff, 'MP3 starts with a frame sync');
    assert.equal(mp3[1] & 0xe0, 0xe0);
    const payload = mp3.toString('base64');
    if (payloadTexts.has(payload)) assert.equal(payloadTexts.get(payload), cue.text, 'different captions must not share an unrelated speech clip');
    payloadTexts.set(payload, cue.text);
  }
});

test('recovery acknowledgment is a bundled, versioned fictional line', () => {
  const cue=radioScript.recovery;
  assert.equal(cue.text,'Recovery copies. Help is on the way.');
  assert.equal(cue.channel,'radio');
  assert.equal(cue.file,'/audio/recovery_ack.mp3?v=natural-radio-r59');
  const audio=readFileSync(new URL('public/audio/recovery_ack.mp3',root));
  assert.ok(audio.length>=1000 && audio.length<40000);
  assert.equal(audio[0],0xff); assert.equal(audio[1]&0xe0,0xe0);
});


test('ramp crew uses short plain ICS lines and the established driver and commander cast', () => {
  assert.equal(radioScript.crew.droppingRamp.text, 'Dropping ramp!');
  assert.equal(radioScript.crew.droppingRamp.voice, radioScript.phase.halted.voice);
  assert.equal(radioScript.crew.rampDown.text, 'Ramp down. Dismount!');
  assert.equal(radioScript.crew.rampDown.voice, radioScript.phase.cabin.voice);
  for (const cue of Object.values(radioScript.crew)) {
    assert.equal(cue.channel, 'intercom');
    assert.match(cue.speaker, /ICS$/);
    assert.doesNotMatch(cue.text, /over|out|this is|wilco/i);
  }
});
