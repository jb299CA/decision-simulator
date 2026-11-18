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

test('net keeps its pair stable between transmissions and alternates coherent orders and relays', () => {
  let draws = 0;
  const net = new RadioNet(() => { draws++; return .51; });
  let order = net.opening;
  assert.equal(draws, 1);
  let previous = key(net.pair);
  for (let i = 0; i < 30; i++) {
    for (let frame = 0; frame < 100; frame++) {
      assert.equal(net.opening, order);
      assert.equal(net.next.company, order.company);
    }
    const relay = net.takeNext();
    assert.equal(relay.company, order.company);
    assert.ok('platoon' in relay);
    assert.notEqual(key(net.pair), previous);
    previous = key(net.pair);
    assert.equal(draws, i + 2, 'only consuming a relay chooses the next pair');
    order = net.takeNext();
    assert.ok(!('platoon' in order));
    assert.equal(order, net.opening);
    assert.equal(draws, i + 2, 'consuming the HQ order preserves its selected relay');
  }
});

test('a new run makes a fresh bounded choice without immediately reusing the previous pair', () => {
  const first = new RadioNet(() => 0), second = new RadioNet(() => 0, first.pair);
  assert.notEqual(key(first.pair), key(second.pair));
  assert.equal(second.next.company, second.opening.company);
});
