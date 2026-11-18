import { radioScript } from './radio-script.ts';

type Order = typeof radioScript.radioOrders[number];
type Relay = typeof radioScript.radioRelays[number];
export type RadioPair = { order: Order; relay: Relay };
export type RadioNetCue = Order | Relay;

export function callsignForPair(pair: RadioPair): string {
  const company = { aztec: 'Aztec', brave: 'Brave', 'crazy-horse': 'Crazy Horse' }[pair.order.company];
  return `${company} ${pair.relay.platoon}-6`;
}

const samePair = (a: RadioPair, b: RadioPair): boolean =>
  a.order.company === b.order.company && a.relay.platoon === b.relay.platoon;

/** One selection per pair, never per render frame. Inputs are fictional units. */
export function chooseRadioPair(random: () => number, previous?: RadioPair): RadioPair {
  const pairs = radioScript.radioOrders.flatMap(order =>
    radioScript.radioRelays.filter(relay => relay.company === order.company).map(relay => ({ order, relay })));
  const choices = previous ? pairs.filter(pair => !samePair(pair, previous)) : pairs;
  let sample = 0;
  try { sample = random(); } catch { /* A broken injected source still yields a valid pair. */ }
  const unit = Number.isFinite(sample) ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0;
  return choices[Math.floor(unit * choices.length)]!;
}

/** Opening HQ order, matching company relay, then a new order/relay pair. */
export class RadioNet {
  private selected: RadioPair;
  private relayNext = true;
  private readonly random: () => number;

  constructor(random: () => number = Math.random, previous?: RadioPair) {
    this.random = random;
    this.selected = chooseRadioPair(random, previous);
  }

  get pair(): RadioPair { return this.selected; }
  get opening(): RadioNetCue { return this.selected.order; }
  get next(): RadioNetCue { return this.relayNext ? this.selected.relay : this.selected.order; }

  takeNext(): RadioNetCue {
    const cue = this.next;
    if (this.relayNext) this.selected = chooseRadioPair(this.random, this.selected);
    this.relayNext = !this.relayNext;
    return cue;
  }
}
