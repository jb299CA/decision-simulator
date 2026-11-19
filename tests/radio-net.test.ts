import assert from 'node:assert/strict';
import test from 'node:test';
import { callsignForPair, chooseRadioPair, chooseRadioCast, GUIDED_CALLSIGN, RadioNet } from '../src/radio-net.ts';
import { radioScript } from '../src/radio-script.ts';

const key = (pair: ReturnType<typeof chooseRadioPair>): string => `${pair.order.company}/${pair.relay.platoon}`;

test('every company/platoon pair is reachable and relays always match their HQ recipient', () => {
  const reached = new Set<string>();
  for (let i = 0; i < 9; i++) {
    const pair = chooseRadioPair(() => (i + .5) / 9);
    assert.equal(pair.order.company, pair.relay.company);
    assert.ok([1, 2, 3].includes(pair.relay.platoon));
    assert.ok(pair.relay.text.includes(['one-six', 'two-six', 'three-six'][pair.relay.platoon - 1]!));
    reached.add(key(pair));
    assert.match(callsignForPair(pair), /^(Aztec|Brave|Crazy Horse) [123]-6$/);
  }
  assert.equal(reached.size, 9);
  assert.equal(new Set(radioScript.radioOrders.map(cue => cue.company)).size, 3);
});

test('selection avoids the previous pair, including deterministic and edge random values', () => {
  const initial = chooseRadioPair(() => 0);
  for (const sample of [-100, 0, .5, 1, 100, NaN, Infinity, -Infinity]) {
    const pair = chooseRadioPair(() => sample, initial);
    assert.ok(pair.order && pair.relay);
    assert.notEqual(key(pair), key(initial));
    assert.equal(pair.order.company, pair.relay.company);
  }
  assert.ok(chooseRadioPair(() => { throw new Error('bad test random'); }).order);
});

test('opening is the fixed player relay and later traffic alternates fresh coherent HQ/relay pairs', () => {
  let draws = 0;
  const net = new RadioNet(() => { draws++; return .51; }, undefined, 'michael-hq');
  const opening = net.opening, initial = key(net.pair);
  assert.equal(draws, 1);
  assert.equal(opening, net.pair.relay);
  let previous = opening.id;
  for (let i = 0; i < 30; i++) {
    const order = net.next;
    assert.ok(!('platoon' in order));
    for (let frame = 0; frame < 100; frame++) {
      assert.equal(net.opening, opening);
      assert.equal(net.next, order);
      assert.equal(key(net.pair), initial, 'initial identity remains fixed');
    }
    assert.equal(draws, i + 2, 'one selection per upcoming pair');
    assert.equal(net.takeNext(), order);
    const relay = net.next;
    assert.ok('platoon' in relay);
    assert.equal(relay.company, order.company);
    assert.notEqual(relay.id, previous, 'opening and later relays cannot immediately repeat');
    previous = relay.id;
    assert.equal(net.takeNext(), relay);
    assert.equal(draws, i + 2, 'consuming cues never draws again until a new pair is needed');
  }
});

test('a new run chooses another initial player identity before background traffic', () => {
  const first = new RadioNet(() => 0, undefined, 'michael-hq'), second = new RadioNet(() => 0, first.pair, 'michael-hq');
  assert.notEqual(key(first.pair), key(second.pair));
  assert.equal(second.opening.company, second.pair.order.company);
  assert.equal(second.opening, second.pair.relay);
});

test('cast selection is safe at its boundaries', () => {
  for (const sample of [0,.099999,.10,.2,.9,1,NaN,Infinity,-1]) {
    assert.equal(chooseRadioCast(() => sample), sample >= 0 && sample < .10 ? 'sarah-hq' : 'michael-hq');
  }
  assert.equal(chooseRadioCast(() => { throw Error('bad source'); }), 'michael-hq');
});

test('one cast keeps each callsign on one actor across scenes, repeats and radio handoffs', () => {
  for (const cast of ['sarah-hq', 'michael-hq'] as const) {
    let draw = 0;
    const net = new RadioNet(() => ((draw++ * 7) % 13) / 13, undefined, cast);
    const heard = new Map<string, string>();
    const remember = (cue: typeof net.opening) => {
      for (const {speaker,voice} of cue.segments) {
        assert.equal(heard.get(speaker) ?? voice, voice, speaker + ' changed voice');
        heard.set(speaker,voice);
      }
    };
    remember(net.guidedOpening); remember(net.opening);
    for (let i = 0; i < 80; i++) {
      const upcoming = net.next;
      assert.equal(net.next,upcoming);
      remember(upcoming);
      assert.equal(net.takeNext(),upcoming);
    }
    assert.equal(heard.get('TOMAHAWK 3'),cast === 'sarah-hq' ? 'af_sarah' : 'am_michael');
    const guidedCommander = heard.get(GUIDED_CALLSIGN.toUpperCase());
    assert.equal(guidedCommander, radioScript.phase.cabin.voice);
    for (const cue of Object.values(radioScript.phase)) {
      if (cue.speaker.startsWith('COMMANDER')) assert.equal(cue.voice, guidedCommander);
      if (cue.speaker.startsWith('DRIVER')) assert.equal(cue.voice, 'am_eric');
    }
    for (const cue of radioScript.ambient) {
      if (cue.speaker.startsWith(GUIDED_CALLSIGN.toUpperCase() + ' ')) assert.equal(cue.voice, guidedCommander);
      else assert.equal(cue.voice, 'am_eric');
    }
    for (const order of radioScript.radioOrders) {
      assert.equal(heard.get(order.segments[1].speaker), 'am_fenrir');
    }
  }
});

test('voice variants preserve exact captions, matching company/platoon and male acknowledgement', () => {
  for (const alternate of radioScript.radioFemale) {
    const base = [...radioScript.radioOrders, ...radioScript.radioRelays].find(cue => cue.id === alternate.baseId)!;
    assert.ok(base);
    assert.equal(alternate.text, base.text);
    assert.equal(alternate.speaker, base.speaker);
    assert.equal(alternate.company, base.company);
    if ('platoon' in base) assert.equal('platoon' in alternate && alternate.platoon, base.platoon);
    assert.equal(alternate.segments[0].voice, 'af_sarah');
    assert.ok(alternate.segments[1].voice.startsWith('am_'));
    assert.equal(alternate.segments[1].text, base.segments[1].text);
  }
  assert.equal(radioScript.radioFemale.length, 12);
});
