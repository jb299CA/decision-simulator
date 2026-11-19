import assert from 'node:assert/strict';
import test from 'node:test';
import { callsignForPair, chooseRadioPair, RadioNet } from '../src/radio-net.ts';
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
  const net = new RadioNet(() => { draws++; return .51; }, undefined, () => 1);
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
  const first = new RadioNet(() => 0, undefined, () => 1), second = new RadioNet(() => 0, first.pair, () => 1);
  assert.notEqual(key(first.pair), key(second.pair));
  assert.equal(second.opening.company, second.pair.order.company);
  assert.equal(second.opening, second.pair.relay);
});

test('female commander take is selected at the twenty percent boundary once per complete transmission', () => {
  for (const sample of [0, .199999, .2, .9, 1, NaN, Infinity, -1]) {
    let voices = 0, pairs = 0;
    const net = new RadioNet(() => { pairs++; return .5; }, undefined, () => { voices++; return sample; });
    const female = Number.isFinite(sample) && sample >= 0 && sample < .2;
    const identity = callsignForPair(net.pair);
    const opening = net.opening;
    assert.equal(opening.id.endsWith('_female'), female);
    assert.equal(voices, 1);
    for (let frame = 0; frame < 30; frame++) assert.equal(net.opening, opening);
    for (let call = 0; call < 12; call++) {
      const next = net.next;
      const count = voices;
      assert.equal(next.id.endsWith('_female'), female);
      for (let frame = 0; frame < 30; frame++) assert.equal(net.next, next);
      assert.equal(voices, count, 'frames and prefetch reuse the selected complete take');
      assert.equal(net.takeNext(), next);
      assert.equal(callsignForPair(net.pair), identity, 'voice choice never changes player identity');
    }
    assert.equal(voices, 13, 'one voice draw for each actual transmission');
    assert.equal(pairs, 7, 'voice draws do not consume the separately injected pair source');
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
