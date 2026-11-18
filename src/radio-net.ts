import { radioScript } from './radio-script.ts';

type Order = typeof radioScript.radioOrders[number];
type Relay = typeof radioScript.radioRelays[number];
export type RadioPair = { order: Order; relay: Relay };
export type RadioNetCue = Order | Relay | typeof radioScript.radioFemale[number];

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

/** The player's company order opens the run; later traffic is fresh HQ/relay pairs. */
export class RadioNet {
  private readonly initial: RadioPair;
  private readonly openingCue: RadioNetCue;
  private selected: RadioPair;
  private nextCue?: RadioNetCue;
  private relayNext = false;
  private pairReady = false;
  private readonly random: () => number;
  private readonly voiceRandom: () => number;

  constructor(random: () => number = Math.random, previous?: RadioPair, voiceRandom: () => number = random) {
    this.random = random;
    this.voiceRandom = voiceRandom;
    this.selected = chooseRadioPair(random, previous);
    this.initial = this.selected;
    this.openingCue = this.chooseVoice(this.initial.relay);
  }

  /** The first pair owns the player's callsign for the entire run. */
  get pair(): RadioPair { return this.initial; }
  get opening(): RadioNetCue { return this.openingCue; }
  get next(): RadioNetCue {
    // Prefetch may ask every frame: select once and retain the complete pair.
    if (!this.pairReady) {
      this.selected = chooseRadioPair(this.random, this.selected);
      this.pairReady = true;
    }
    return this.nextCue ??= this.chooseVoice(this.relayNext ? this.selected.relay : this.selected.order);
  }

  takeNext(): RadioNetCue {
    const cue = this.next;
    if (this.relayNext) this.pairReady = false;
    this.relayNext = !this.relayNext;
    this.nextCue = undefined;
    return cue;
  }

  private chooseVoice(cue: Order | Relay): RadioNetCue {
    let sample = 1;
    try { sample = this.voiceRandom(); } catch { /* Keep the primary male take. */ }
    return Number.isFinite(sample) && sample >= 0 && sample < .2
      ? radioScript.radioFemale.find(alternate => alternate.baseId === cue.id) ?? cue
      : cue;
  }
}
