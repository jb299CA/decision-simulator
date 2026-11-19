import assert from 'node:assert/strict';
import test from 'node:test';
import { captionForPhase, SimulationAudio } from '../src/audio.ts';
import { radioScript } from '../src/radio-script.ts';
import { Simulation } from '../src/simulation.ts';
import { DrivingRange } from '../src/range.ts';

class MockParameter {
  value = 0;
  events: { value: number; time: number; seconds: number }[] = [];
  cancelled = false;
  setTargetAtTime(value: number, time: number, seconds: number): void { this.value = value; this.events.push({ value, time, seconds }); }
  setValueAtTime(value: number, time: number): void { this.value = value; this.events.push({ value, time, seconds: 0 }); }
  cancelScheduledValues(): void { this.cancelled = true; }
}
class MockNode {
  gain = new MockParameter();
  frequency = new MockParameter();
  playbackRate = new MockParameter();
  Q = { value: 0 };
  type = '';
  loop = false;
  buffer?: { id?: string; length?: number; getChannelData?: () => Float32Array };
  stopped = false;
  started = false;
  startTime?: number;
  disconnected = false;
  onended: (() => void) | null = null;
  connections: MockNode[] = [];
  connect(node: MockNode): MockNode { this.connections.push(node); return node; }
  disconnect(): void { this.disconnected = true; }
  start(when?: number): void {
    if (this.buffer?.id && MockContext.failVoiceStart) throw new Error('voice source unavailable');
    if (this.loop && this.connections[0]?.connections[0]?.frequency.value === 185 && MockContext.failStaticStart) throw new Error('static source unavailable');
    this.started = true; this.startTime = when;
  }
  stop(): void { this.stopped = true; this.onended?.(); }
  finish(): void { this.onended?.(); }
}

class MockContext {
  static latest: MockContext;
  static decodeGate?: Promise<void>;
  static failDecode = false;
  static resumeGate?: Promise<void>;
  static suspendGate?: Promise<void>;
  static gestureRequired = false;
  static inGesture = false;
  static resumeFailures = 0;
  static created = 0;
  static sampleRate = 1000;
  static failVoiceStart = false;
  static failStaticStart = false;
  state = 'suspended';
  currentTime = 7;
  resumeCalls = 0;
  gestureResumes = 0;
  sampleRate = MockContext.sampleRate;
  destination = new MockNode();
  gains: MockNode[] = [];
  sources: MockNode[] = [];
  oscillators: MockNode[] = [];
  filters: MockNode[] = [];
  constructor() { MockContext.latest = this; MockContext.created++; }
  createGain(): MockNode { const node = new MockNode(); this.gains.push(node); return node; }
  createOscillator(): MockNode { const node = new MockNode(); this.sources.push(node); this.oscillators.push(node); return node; }
  createBufferSource(): MockNode { const node = new MockNode(); this.sources.push(node); return node; }
  createBiquadFilter(): MockNode { const node = new MockNode(); this.filters.push(node); return node; }
  createBuffer(_channels: number, length: number): { length: number; getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  async decodeAudioData(bytes: ArrayBuffer): Promise<{ id: string; duration?: number }> {
    await MockContext.decodeGate;
    if (MockContext.failDecode) throw new Error('unsupported recording');
    const id = new TextDecoder().decode(bytes);
    return id.endsWith('-r1') ? { id, duration: 17 } : { id };
  }
  async resume(): Promise<void> {
    this.resumeCalls++;
    if (MockContext.inGesture) this.gestureResumes++;
    if (MockContext.gestureRequired && !MockContext.inGesture) throw new Error('device requires another tap');
    if (MockContext.resumeFailures > 0) { MockContext.resumeFailures--; throw new Error('device requires another tap'); }
    if (MockContext.resumeGate) await MockContext.resumeGate;
    if (this.state !== 'closed') this.state = 'running';
  }
  async suspend(): Promise<void> { if (MockContext.suspendGate) await MockContext.suspendGate; if (this.state !== 'closed') this.state = 'suspended'; }
  async close(): Promise<void> { this.state = 'closed'; }
  get voices(): MockNode[] { return this.sources.filter(source => source.started && source.buffer?.id); }
}

function browser(t: { after: (fn: () => void) => void }, gates = new Map<string, Promise<void>>()): string[] {
  const beforeWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const beforeFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const files: string[] = [];
  const originalRandom = Math.random; Math.random = () => 0;
  t.after(() => { Math.random = originalRandom; });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: MockContext } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (file: string) => {
    files.push(file);
    await gates.get(file);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(file.split('/').at(-1)!.split('?')[0]!.replace(/\.(wav|mp3)$/, '')).buffer };
  } });
  MockContext.decodeGate = undefined; MockContext.failDecode = false; MockContext.resumeGate = undefined; MockContext.suspendGate = undefined;
  MockContext.gestureRequired = false; MockContext.inGesture = false; MockContext.resumeFailures = 0;
  MockContext.created = 0;
  MockContext.sampleRate = 1000;
  MockContext.failVoiceStart = false; MockContext.failStaticStart = false;
  t.after(() => {
    if (beforeWindow) Object.defineProperty(globalThis, 'window', beforeWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (beforeFetch) Object.defineProperty(globalThis, 'fetch', beforeFetch); else Reflect.deleteProperty(globalThis, 'fetch');
    MockContext.decodeGate = undefined; MockContext.failDecode = false; MockContext.resumeGate = undefined; MockContext.suspendGate = undefined;
    MockContext.gestureRequired = false; MockContext.inGesture = false; MockContext.resumeFailures = 0;
    MockContext.sampleRate = 1000;
    MockContext.failVoiceStart = false; MockContext.failStaticStart = false;
  });
  return files;
}
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const update = async (audio: SimulationAudio, sim: Simulation): Promise<void> => { audio.update(sim); await settle(); };
const openingOrder = radioScript.radioOrders[1];
const femaleHqOpening = radioScript.radioFemale.find(cue => cue.baseId === openingOrder.id)!;
const playerOpening = radioScript.radioRelays[0];
const firstAmbient = radioScript.ambient[0];
const secondAmbient = radioScript.ambient[1];
const exact = (cue: { speaker: string; text: string }): string => `${cue.speaker}: ${cue.text}`;
const pttEdges = (context: MockContext): MockNode[] => context.sources.filter(source =>
  source.started && !source.loop && !source.buffer?.id && source.buffer?.length !== undefined && source.buffer.length <= context.sampleRate * .12);
const radioStaticSources = (context: MockContext): MockNode[] => context.sources.filter(source =>
  source.loop && source.connections[0]?.connections[0]?.type === 'highpass' && source.connections[0]?.connections[0]?.frequency.value === 185);

function audioSession(t: { after: (fn: () => void) => void }, initial = 'auto', throws = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let type = initial;
  const writes: { type: string; contexts: number }[] = [];
  const session = {
    get type() { return type; },
    set type(value: string) {
      writes.push({ type: value, contexts: MockContext.created });
      if (throws) throw new Error('experimental setter unavailable');
      type = value;
    },
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { audioSession: session } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else Reflect.deleteProperty(globalThis, 'navigator'); });
  return { session, writes };
}

// These assertions bind captions to the same source as the bundled recordings.
test('every recorded phase has its exact speaker and dialogue caption', () => {
  for (const [phase, cue] of Object.entries(radioScript.phase)) {
    assert.equal(captionForPhase(phase as keyof typeof radioScript.phase), exact(cue));
  }
  assert.match(captionForPhase('secured'), /Engine off/);
  assert.match(captionForPhase('debrief'), /repair and verification/i);
});

test('unsupported audio keeps exact captions and simulation usable', async () => {
  const audio = new SimulationAudio(() => 0, () => 1);
  await audio.start();
  assert.equal(audio.soundState, 'unsupported');
  const sim = new Simulation(); sim.begin(); await update(audio, sim);
  assert.equal(audio.caption, exact(openingOrder));
  audio.setPaused(true); audio.setMuted(true); audio.restart(); audio.dispose();
});

test('a start tap unlocks audio synchronously after the paused home frame', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  audio.setPaused(true); // The home screen's transport state.
  MockContext.gestureRequired = true; MockContext.inGesture = true;
  const starting = audio.start();
  const context = MockContext.latest;
  assert.equal(context.gestureResumes, 1, 'resume is invoked before start returns to the click handler');
  assert.equal(context.gains[0]!.gain.value, 0, 'activation cannot sound the paused home screen');
  // The handler changes the exercise state before yielding or rendering again.
  audio.setPaused(false);
  MockContext.inGesture = false;
  await starting;
  assert.equal(audio.soundState, 'running');
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  assert.ok(context.gains[0]!.gain.value > 0);
});

test('saved mute survives starting and restarting; Sound on can perform first activation', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  audio.setMuted(true);
  await audio.start(); audio.restart(); await audio.start();
  assert.equal(audio.soundState, 'muted');
  assert.equal(MockContext.created, 0, 'saved mute creates no audio output');
  audio.setMuted(false);
  MockContext.gestureRequired = true; MockContext.inGesture = true;
  const starting = audio.start();
  MockContext.inGesture = false;
  await starting;
  assert.equal(audio.soundState, 'running');
  assert.equal(MockContext.latest.gestureResumes, 1);
});

test('actual device state exposes interruption and denied resume for an explicit Sound retry', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  assert.equal(audio.soundState, 'unstarted');
  MockContext.resumeFailures = 1;
  await audio.start();
  assert.equal(audio.soundState, 'blocked', 'denial does not claim Sound on or change the user preference');
  MockContext.gestureRequired = true; MockContext.inGesture = true;
  const retry = audio.start();
  MockContext.inGesture = false; await retry;
  assert.equal(audio.soundState, 'running');
  const context = MockContext.latest;
  for (const state of ['interrupted', 'suspended']) {
    context.state = state;
    assert.equal(audio.soundState, 'blocked');
    MockContext.inGesture = true;
    audio.setMuted(false); // Retrying Sound on must work even if already enabled.
    MockContext.inGesture = false; await settle();
    assert.equal(audio.soundState, 'running');
  }
  audio.setPaused(true);
  assert.equal(audio.soundState, 'paused');
  assert.equal(context.state, 'suspended');
  MockContext.inGesture = true; audio.setPaused(false); const resumed = audio.start();
  MockContext.inGesture = false; await resumed;
  assert.equal(audio.soundState, 'running');
});

test('activation resolving after pause or mute cannot leave audio running', async t => {
  browser(t);
  for (const interruption of ['pause', 'mute'] as const) {
    let release!: () => void;
    MockContext.resumeGate = new Promise<void>(resolve => { release = resolve; });
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
    const starting = audio.start(), context = MockContext.latest;
    if (interruption === 'pause') audio.setPaused(true); else audio.setMuted(true);
    release(); await starting; await settle();
    assert.equal(context.state, 'suspended');
    assert.equal(context.gains[0]!.gain.value, 0);
    assert.equal(audio.soundState, interruption === 'pause' ? 'paused' : 'muted');
    audio.dispose();
  }
});

test('a delayed Sound-on transport resume cannot override a later pause', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  await audio.start();
  audio.setMuted(true);
  let release!: () => void;
  MockContext.resumeGate = new Promise<void>(resolve => { release = resolve; });
  audio.setMuted(false);
  audio.setPaused(true);
  release(); await settle();
  assert.equal(MockContext.latest.state, 'suspended');
  assert.equal(MockContext.latest.gains[0]!.gain.value, 0);
  assert.equal(audio.soundState, 'paused');
});

test('an older focus-loss suspension cannot leave a later Play tap silent', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); sim.time = .25; await update(audio, sim);
  let release!: () => void;
  MockContext.suspendGate = new Promise<void>(resolve => { release = resolve; });
  audio.setPaused(true);
  const voiceCount = MockContext.latest.voices.length, sourceCount = MockContext.latest.sources.length;
  audio.setPaused(false); await audio.start();
  release(); await settle();
  assert.equal(audio.soundState, 'running', 'late suspend resolution is reconciled with current active transport');
  assert.equal(MockContext.latest.sources.length, sourceCount, 'transport repair never queues catchup notes or speech');
  await update(audio, sim);
  assert.equal(MockContext.latest.voices.length, voiceCount, 'interrupted speech stays consumed');
});

test('a new mute still wins while a stale suspension is being repaired', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  let releaseSuspend!: () => void, releaseResume!: () => void;
  MockContext.suspendGate = new Promise<void>(resolve => { releaseSuspend = resolve; });
  audio.setPaused(true); audio.setPaused(false); await settle();
  MockContext.resumeGate = new Promise<void>(resolve => { releaseResume = resolve; });
  releaseSuspend(); await settle(); // The old suspend now starts its corrective resume.
  audio.setMuted(true); releaseResume(); await settle();
  assert.equal(audio.soundState, 'muted'); assert.equal(MockContext.latest.state, 'suspended');
  assert.equal(MockContext.latest.gains[0]!.gain.value, 0);
});

test('explicit activation chooses media playback before context construction and restores its owned category on cleanup', async t => {
  browser(t); const { session, writes } = audioSession(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  MockContext.inGesture = true; MockContext.gestureRequired = true;
  const start = audio.start(); MockContext.inGesture = false; await start;
  assert.deepEqual(writes[0], { type: 'playback', contexts: 0 });
  assert.equal(session.type, 'playback'); assert.equal(audio.soundState, 'running');
  const context = MockContext.latest; context.state = 'interrupted';
  MockContext.inGesture = true; const resume = audio.start(); MockContext.inGesture = false; await resume;
  assert.equal(writes.at(-1)!.type, 'playback'); assert.equal(context.gestureResumes, 2);
  audio.dispose(); assert.equal(session.type, 'auto');
});

test('saved mute makes no audio-session changes until the user explicitly enables sound', async t => {
  browser(t); const { session, writes } = audioSession(t, 'ambient');
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  audio.setMuted(true); await audio.start(true); audio.restart();
  assert.equal(writes.length, 0); assert.equal(MockContext.created, 0); assert.equal(session.type, 'ambient');
  audio.setMuted(false); await audio.start(); assert.equal(session.type, 'playback');
});

test('an unavailable audio-session setter leaves ordinary Web Audio activation and cleanup usable', async t => {
  browser(t); const { session } = audioSession(t, 'auto', true);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  await audio.start(true); assert.equal(audio.soundState, 'running'); assert.equal(session.type, 'auto');
  const sim = new Simulation(); sim.begin(); await update(audio, sim);
  assert.equal(MockContext.latest.gains[0]!.gain.value, .48);
  audio.dispose(); assert.equal(MockContext.latest.state, 'closed');
});

test('Retry sound refreshes a running but possibly silent output once across a task and never invents a test cue', async t => {
  browser(t); const { session, writes } = audioSession(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const count = MockContext.latest.sources.length, offset = writes.length;
  const retry = audio.start(true);
  assert.equal(session.type, 'ambient', 'retry deliberately leaves the stale playback category');
  assert.deepEqual(writes.slice(offset).map(write => write.type), ['playback', 'ambient']);
  await retry;
  assert.deepEqual(writes.slice(offset).map(write => write.type), ['playback', 'ambient', 'playback']);
  assert.equal(audio.soundState, 'running', 'context state is only a browser state, not proof of audible output');
  assert.equal(MockContext.latest.sources.length, count, 'retry never queues speech or a test tone');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(writes.length, offset + 3, 'no looping category changes');
});

for (const interruption of ['pause', 'mute', 'restart', 'dispose'] as const) {
  test(`an output retry interrupted by ${interruption} cannot change category or resume later`, async t => {
    browser(t); const { writes } = audioSession(t);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
    let release!: () => void;
    MockContext.resumeGate = new Promise<void>(resolve => { release = resolve; });
    const retry = audio.start(true), context = MockContext.latest;
    if (interruption === 'pause') audio.setPaused(true);
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') { audio.restart(); audio.setPaused(true); }
    if (interruption === 'dispose') audio.dispose();
    const changes = writes.length, sources = context.sources.length;
    release(); await retry; await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(writes.length, changes, 'cancelled timer cannot reassert playback');
    assert.equal(context.state, interruption === 'dispose' ? 'closed' : 'suspended');
    assert.equal(context.sources.length, sources); assert.equal(context.gains[0]!.gain.value, 0);
  });
}

test('a newer output gesture supersedes a pending retry without stale category changes', async t => {
  browser(t); const { session, writes } = audioSession(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const first = audio.start(true); const second = audio.start();
  await Promise.all([first, second]);
  const changes = writes.length; await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(writes.length, changes); assert.equal(session.type, 'playback'); assert.equal(audio.soundState, 'running');
  session.type = 'play-and-record'; audio.dispose();
  assert.equal(session.type, 'play-and-record', 'cleanup does not overwrite a different audio-session owner');
});

test('Home retry can select playback while transport stays paused and the next Start tap activates it', async t => {
  browser(t); const { session } = audioSession(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); audio.setPaused(true);
  await audio.start(true);
  assert.equal(session.type, 'playback'); assert.equal(MockContext.latest.state, 'suspended');
  assert.equal(MockContext.latest.gains[0]!.gain.value, 0); assert.equal(MockContext.latest.voices.length, 0);
  audio.setPaused(false); await audio.start(); assert.equal(audio.soundState, 'running');
});

test('local recordings load progressively; title is silent; phase priority and frozen debrief lifecycle work', async t => {
  const files = browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  await audio.start();
  const context = MockContext.latest;
  assert.equal(files.length, 1, 'startup warms only the exterior recording');
  assert.equal(files[0], openingOrder.file);
  assert.ok(files.every(file => file.startsWith('/audio/') && /\.(wav|mp3)(\?|$)/.test(file)));
  const sim = new Simulation(); await update(audio, sim);
  assert.equal(context.voices.length, 0);
  assert.equal(context.gains[0]!.gain.value, 0, 'no title ambience');
  sim.begin(); await update(audio, sim);
  const exterior = context.voices.at(-1)!;
  assert.equal(exterior.buffer?.id, openingOrder.id);
  assert.equal(audio.caption, exact(openingOrder));
  assert.ok(context.gains[1]!.gain.value > 0, 'diesel idles outside');
  assert.equal(context.gains[2]!.gain.value, 0, 'parked wheels silent');
  sim.board(); sim.tick(.1); await update(audio, sim);
  assert.ok(exterior.stopped, 'new phase preempts preceding dialogue');
  assert.equal(context.voices.at(-1)!.buffer?.id, 'moving');
  assert.ok(context.gains[2]!.gain.value > 0, 'rolling tires follow movement');
  assert.ok(context.gains[3]!.gain.value > 0, 'cabin vibration follows engine');
  sim.phase = 'halted'; sim.speed = 0; await update(audio, sim);
  assert.equal(context.gains[2]!.gain.value, 0, 'halt silences rolling immediately');
  assert.ok(context.gains[1]!.gain.value > 0, 'halt keeps diesel idling');
  sim.secure(); await update(audio, sim);
  assert.equal(context.gains[1]!.gain.value, 0, 'secure silences diesel');
  assert.equal(context.gains[3]!.gain.value, 0, 'secure silences cabin rattle');
  sim.advance(); await update(audio, sim); sim.isolate(); await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, 'debrief');
  assert.equal(audio.caption, captionForPhase('debrief'));
  const frozenTime = sim.time;
  context.voices.at(-1)!.finish();
  assert.equal(sim.time, frozenTime);
  assert.match(audio.caption, /Engine off/);
  assert.doesNotMatch(audio.caption, /BRAVE/i, 'completed dialogue gives way to current engine-off ambience');
});

test('current cue plays while an unrelated startup fetch is still pending', async t => {
  let release!: () => void;
  const unrelated = new Promise<void>(resolve => { release = resolve; });
  const files = browser(t, new Map([[openingOrder.file, unrelated]]));
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => { release(); audio.dispose(); });
  await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board();
  await update(audio, sim);
  assert.deepEqual(files, [openingOrder.file, radioScript.phase.cabin.file]);
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), ['moving'],
    'the cabin line never waits for the exterior download');
  release(); await settle();
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), ['moving'],
    'late exterior completion only fills the cache');
});

test('Start mission plays its net order once per run while guided boarding keeps crew intercom', async t => {
  let release!: () => void;
  const opening = radioScript.radioRelays[0];
  const orderDownload = new Promise<void>(resolve => { release = resolve; });
  const files = browser(t, new Map([[opening.file, orderDownload]]));
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => { release(); audio.dispose(); }); await audio.start();
  const context = MockContext.latest, range = new DrivingRange();
  const firstIdentity = audio.missionCallsign;
  assert.equal(firstIdentity, 'Aztec 1-6', 'identity exists before the first update without another random draw');
  audio.update(range.audioState, { inside: false, powertrain: range.powertrain }); await settle();
  assert.equal(audio.caption, exact(opening), 'initial driving caption is the chosen mission order');
  assert.equal(context.voices.length, 0, 'range waits for its current net order');
  assert.ok(!files.includes(radioScript.phase.cabin.file) && !files.includes(radioScript.phase.feed.file),
    'driving mode does not fetch skipped guided crew chapters');
  release(); await settle();
  assert.deepEqual(context.voices.map(source => source.buffer?.id), [opening.id]);
  context.voices.at(-1)!.finish();
  for (const inside of [true, false, true]) {
    audio.update(range.audioState, { inside, powertrain: range.powertrain }); await settle();
  }
  audio.setPaused(true); audio.setPaused(false); await settle();
  audio.update(range.audioState, { inside: true, powertrain: range.powertrain }); await settle();
  assert.equal(context.voices.length, 1, 'camera changes and pause cannot repeat the order');
  assert.equal(audio.missionCallsign, firstIdentity);
  audio.restart();
  assert.equal(audio.missionCallsign, 'Aztec 2-6', 'restart selects the next initial pair synchronously');
  audio.update(new DrivingRange().audioState, { inside: false, training: true }); await settle();
  assert.equal(context.voices.length, 2, 'new driving run plays its mission order again');
  assert.ok(radioScript.radioRelays.some(cue => cue.id === context.voices.at(-1)!.buffer?.id));
  audio.restart();
  const guided = new Simulation(); guided.begin(); audio.update(guided, { inside: false }); await settle();
  guided.board(); audio.update(guided, { inside: true }); await settle();
  assert.equal(context.voices.at(-1)!.buffer?.id, radioScript.phase.cabin.id);
  assert.equal(audio.caption, exact(radioScript.phase.cabin), 'guided boarding retains its separate intercom instruction');
});

test('driving net gives one player order, never loops test-fire or unrelated callsign orders', async t => {
  const files = browser(t);
  let draws = 0;
  const audio = new SimulationAudio(() => { draws++; return .5; }, () => 1); t.after(() => audio.dispose()); await audio.start();
  const identity = audio.missionCallsign;
  assert.equal(identity, 'Brave 2-6');
  const context = MockContext.latest, sim = new DrivingRange().audioState;
  sim.speed = 1; audio.update(sim, { training: true }); await settle();
  const opening = radioScript.radioRelays.find(cue => cue.id === context.voices.at(-1)!.buffer?.id)!;
  assert.equal(opening.platoon, 2); assert.equal(opening.company, 'brave');
  assert.equal(draws, 1, 'prefetch never selects an unrelated background order');
  context.voices.at(-1)!.finish();
  for (const crossed of [false, true]) {
    for (let i = 0; i < 12; i++) {
      sim.time += 40;
      audio.update(sim, { training: !crossed, departureCrossed: crossed, inside: i % 2 === 0 }); await settle();
    }
  }
  assert.equal(context.voices.length, 1, 'neither practice nor movement repeats the opening or another unit order');
  assert.equal(draws, 1); assert.equal(audio.missionCallsign, identity);
  assert.ok(!files.some(file => radioScript.radioOrders.some(cue => cue.file === file && cue !== openingOrder)), 'no unrelated HQ recordings are prefetched');
});

for (const completion of ['practice', 'departure'] as const) {
for (const state of ['playing', 'downloading', 'blocked'] as const) {
  test(`${completion} consumes a ${state} test-fire order and never resurrects it`, async t => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    browser(t, state === 'downloading' ? new Map([[playerOpening.file, gate]]) : undefined);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => { release(); audio.dispose(); });
    if (state === 'blocked') MockContext.gestureRequired = true;
    await audio.start();
    const context = MockContext.latest, sim = new DrivingRange().audioState;
    audio.update(sim, { training: true }); await settle();
    const opening = context.voices.at(-1);
    assert.match(audio.caption, /test.fire/i);
    sim.time = 1;
    audio.update(sim, { training: completion !== 'departure', departureCrossed: completion === 'departure', practiceCompleted: true }); await settle();
    if (opening) assert.equal(opening.stopped, true);
    assert.doesNotMatch(audio.caption, /test.fire|line of departure/i);
    release(); MockContext.gestureRequired = false; await audio.start(true); await settle();
    sim.time = 120; audio.update(sim, { training: false, departureCrossed: true }); await settle();
    assert.equal(context.voices.length, state === 'playing' ? 1 : 0, 'late decode and output retry cannot replay an obsolete order');
  });
}
}

test('female HQ casting preserves the company commander in the player opening relay', async t => {
  const files = browser(t);
  let draws = 0;
  const audio = new SimulationAudio(() => 0, () => { draws++; return .05; }); t.after(() => audio.dispose());
  const opening = playerOpening;
  assert.equal(audio.missionCallsign, 'Aztec 1-6');
  await audio.start();
  assert.equal(files[0], femaleHqOpening.file, 'startup prepares the guided exterior until the mode is known');
  const context = MockContext.latest, sim = new DrivingRange().audioState;
  audio.update(sim, { training: true }); await settle();
  assert.equal(context.voices.at(-1)!.buffer?.id, opening.id);
  assert.equal(audio.caption, exact(playerOpening), 'alternate audio retains the exact same company/player caption');
  assert.ok(files.includes(opening.file), 'range entry fetches the complete selected player take');
  const voiceDraws = draws;
  for (let frame = 0; frame < 90; frame++) audio.update(sim, { training: true, inside: frame % 2 === 0 });
  await settle();
  assert.equal(draws, voiceDraws, 'prefetch and camera changes cannot reroll the commander');
  assert.equal(files.filter(file => file === opening.file).length, 1);
  assert.ok(!files.some(file => file.includes('relay_aztec_1_6_female')), 'never recast the player’s company commander');
  assert.equal(context.voices.length, 1);
  assert.equal(audio.missionCallsign, 'Aztec 1-6');
  audio.restart();
  assert.equal(draws, 1, 'a restart retains the same actor roster');
});

test('guided health exercise keeps its HQ opening and generic net traffic without range timing orders', async t => {
  const files = browser(t);
  let voiceDraws = 0;
  const audio = new SimulationAudio(() => 0, () => { voiceDraws++; return .05; }); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin();
  audio.update(sim, { inside: false }); await settle();
  assert.equal(context.voices.at(-1)!.buffer?.id, femaleHqOpening.id);
  assert.equal(audio.caption, exact(femaleHqOpening));
  assert.doesNotMatch(audio.caption, /line of departure|three.minute|180|test.fire/i);
  sim.board(); audio.update(sim, { inside: true }); await settle();
  assert.equal(context.voices.at(-1)!.buffer?.id, radioScript.phase.cabin.id);
  assert.equal(audio.caption, exact(radioScript.phase.cabin));
  context.voices.at(-1)!.finish();
  for (let call = 0; call < 8; call++) {
    sim.time += 40; audio.update(sim, { inside: true }); await settle();
    const expected = radioScript.ambient[call % radioScript.ambient.length]!;
    assert.equal(context.voices.at(-1)!.buffer?.id, expected.id);
    assert.equal(audio.caption, exact(expected));
    assert.doesNotMatch(audio.caption, /line of departure|three.minute|180|test.fire/i);
    context.voices.at(-1)!.finish();
  }
  assert.equal(voiceDraws, 1, 'guided traffic never selects additional timed range variants');
  assert.ok(!files.some(file => [...radioScript.radioRelays, ...radioScript.radioFemale.filter(cue => 'platoon' in cue)].some(cue => cue.file === file)),
    'guided loading never fetches a timed player order');
  assert.equal(audio.missionCallsign, 'Brave 6');
});

for (const interruption of ['pause', 'mute', 'restart', 'dispose'] as const) {
  test(`a selected driving order decoded after ${interruption} cannot play stale speech or PTT`, async t => {
    const order = radioScript.radioRelays[0];
    let release!: () => void;
    const download = new Promise<void>(resolve => { release = resolve; });
    browser(t, new Map([[order.file, download]]));
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => { release(); audio.dispose(); }); await audio.start();
    const sim = new DrivingRange().audioState;
    audio.update(sim, { training: true }); await settle();
    assert.equal(audio.caption, exact(order));
    if (interruption === 'pause') audio.setPaused(true);
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') audio.restart();
    if (interruption === 'dispose') audio.dispose();
    release(); await settle();
    assert.equal(MockContext.latest.voices.length, 0);
    assert.equal(pttEdges(MockContext.latest).length, 0);
    audio.setPaused(false); audio.setMuted(false); await settle();
    assert.equal(MockContext.latest.voices.length, 0, 'transport recovery cannot replay the consumed order');
  });
}

test('fetch/decode concurrency is bounded and latest phase wins queued priority over prefetch', async t => {
  const releases = new Map<string, () => void>();
  const gates = new Map<string, Promise<void>>();
  for (const cue of [openingOrder, ...Object.values(radioScript.phase).filter(cue => cue !== radioScript.phase.exterior)]) {
    gates.set(cue.file, new Promise<void>(resolve => { releases.set(cue.file, resolve); }));
  }
  const files = browser(t, gates);
  const audio = new SimulationAudio(() => 0, () => 1);
  t.after(() => { audio.dispose(); for (const release of releases.values()) release(); });
  await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  sim.advance(); await update(audio, sim);
  sim.advance(); await update(audio, sim);
  assert.equal(files.length, 2, 'only one speculative job plus one demanded job runs');
  releases.get(radioScript.phase.cabin.file)!(); await settle();
  assert.deepEqual(files, [openingOrder.file, radioScript.phase.cabin.file, radioScript.phase.manifold.file],
    'new current phase gets the free slot before speculative turbine or skipped feed');
  assert.equal(MockContext.latest.voices.length, 0, 'a completed obsolete phase cannot speak');
  releases.get(radioScript.phase.manifold.file)!(); await settle();
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), ['manifold']);
  assert.equal(files.length, 3, 'a stalled speculative exterior leaves no second speculative job running');
  releases.get(openingOrder.file)!(); await settle();
  assert.equal(files.at(-1), radioScript.phase.turbine.file, 'next relevant chapter warms once capacity is free');
  await update(audio, sim); await audio.start(); await update(audio, sim);
  assert.equal(files.filter(file => file === radioScript.phase.manifold.file).length, 1, 'per-cue demand is cached');
  assert.equal(files.filter(file => file === radioScript.phase.turbine.file).length, 1, 'prefetch promises are shared');
});

test('ambient net traffic uses simulation time, never overlaps, and ducks the vehicle', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest;
  const sim = new Simulation(); sim.begin(); sim.board(); sim.speed = 1; await update(audio, sim);
  context.voices.at(-1)!.finish(); await update(audio, sim);
  const normalEngine = context.gains[1]!.gain.value;
  sim.time = 13.9; await update(audio, sim);
  assert.equal(context.voices.length, 1, 'no ambient cue before cadence');
  sim.time = 14; await update(audio, sim);
  const ambient = context.voices.at(-1)!;
  assert.equal(ambient.buffer?.id, firstAmbient.id);
  assert.equal(audio.caption, exact(firstAmbient));
  assert.ok(context.gains[1]!.gain.value < normalEngine, 'vehicle mix ducks under voice');
  sim.time = 50; await update(audio, sim);
  assert.equal(context.voices.length, 2, 'ongoing transmission prevents overlap');
  ambient.finish(); await update(audio, sim);
  assert.equal(context.voices.length, 2, 'leave a simulation-time gap after the transmission');
  sim.time = 51.5; await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, secondAmbient.id);
  sim.phase = 'halted'; sim.speed = 0; await update(audio, sim); context.voices.at(-1)!.finish();
  const count = context.voices.length;
  sim.time = 100; await update(audio, sim);
  assert.equal(context.voices.length, count, 'halted vehicles do not generate movement radio');
});

test('pause, mute, restart and dispose cancel voice without interrupted or skipped cue replay', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin(); await update(audio, sim);
  const first = context.voices.at(-1)!;
  sim.paused = true; await update(audio, sim);
  assert.equal(context.state, 'suspended'); assert.ok(first.stopped);
  assert.equal(context.gains[0]!.gain.value, 0);
  sim.paused = false; await update(audio, sim);
  assert.equal(context.state, 'running'); assert.equal(context.voices.length, 1);
  audio.setMuted(true); sim.board(); await update(audio, sim);
  audio.setPaused(true); audio.setPaused(false);
  assert.equal(context.state, 'suspended');
  audio.setMuted(false); await update(audio, sim);
  assert.equal(context.voices.length, 1, 'muted phase is consumed');
  sim.advance(); await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, 'feed');
  audio.restart(); sim.restart(); await update(audio, sim);
  assert.equal(context.voices.at(-1)!.stopped, true);
  assert.equal(context.gains[0]!.gain.value, 0);
  sim.begin(); await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, openingOrder.id);
  audio.dispose();
  assert.equal(context.state, 'closed');
  assert.ok(context.sources.every(source => source.stopped || (source.buffer?.id && source !== context.voices.at(-1))));
  const count = context.voices.length; await update(audio, sim); await audio.start();
  assert.equal(context.voices.length, count, 'disposed audio cannot reactivate');
});

test('reasserting pause suspends a browser-restored context without resetting cues', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin(); await update(audio, sim);
  sim.paused = true; audio.setPaused(true);
  const sources = context.sources.slice(), caption = audio.caption;
  const stopped = sources.map(source => source.stopped);
  context.state = 'running'; // A persisted page restored a context that was already paused.
  audio.setPaused(true);
  assert.equal(context.state, 'suspended');
  assert.equal(audio.caption, caption);
  assert.equal(audio.musicEnabled, true);
  assert.deepEqual(context.sources, sources, 'reassertion creates no voice, music or feedback nodes');
  assert.deepEqual(sources.map(source => source.stopped), stopped, 'reassertion does not repeat cue cleanup');
  sim.paused = false; audio.setPaused(false); await update(audio, sim);
  assert.equal(context.state, 'running');
  assert.equal(context.voices.length, 1, 'resume does not replay the consumed radio cue');
});

test('intercom stays clear; radio has a narrower speech path, bounded static and short PTT edges', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin(); await update(audio, sim);
  const radio = context.voices.at(-1)!, high = radio.connections[0]!, low = high.connections[0]!, radioLevel = low.connections[0]!;
  assert.equal(high.type, 'highpass'); assert.equal(low.type, 'lowpass');
  assert.ok(high.frequency.value >= 160 && high.frequency.value < 400);
  assert.ok(low.frequency.value >= 3000 && low.frequency.value <= 4000, 'speech remains intelligible while sounding like a net');
  assert.ok(radioLevel.gain.value <= 1, 'offline-conditioned speech does not need output gain above unity');
  const onset = pttEdges(context)[0]!;
  assert.ok(onset && onset.startTime === undefined, 'PTT begins immediately');
  assert.ok(onset.buffer!.length! / context.sampleRate >= .08 && onset.buffer!.length! / context.sampleRate <= .12, 'audible soft squelch lasts 80?120 milliseconds');
  assert.equal(onset.connections[0], high, 'squelch shares the filtered radio path');
  assert.ok(radio.startTime! >= context.currentTime + onset.buffer!.length! / context.sampleRate,
    'PTT finishes before scheduled speech, preserving the first syllable');
  const samples = onset.buffer!.getChannelData!();
  assert.ok(samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0) < .05, 'PTT is restrained beneath speech');
  assert.equal(samples[0], 0); assert.ok(Math.abs(samples.at(-1)!) < .00001);
  onset.finish(); radio.finish();
  const tail = pttEdges(context).at(-1)!; assert.notEqual(tail, onset); assert.ok(tail.started);
  const loops = context.sources.filter(source => source.loop && !source.disconnected).length;
  sim.board(); await update(audio, sim);
  assert.ok(tail.stopped && tail.disconnected, 'next crew line cancels an obsolete radio tail');
  const intercom = context.voices.at(-1)!, intercomHigh = intercom.connections[0]!, intercomLow = intercomHigh.connections[0]!;
  assert.notEqual(intercomHigh, high, 'crew intercom has its own signal path');
  assert.ok(intercomHigh.frequency.value < high.frequency.value && intercomLow.frequency.value > low.frequency.value,
    'intercom keeps a wider, clearer voice band');
  assert.equal(intercomLow.connections[0]!.gain.value, radioLevel.gain.value, 'channel distinction does not rely on a louder intercom');
  assert.equal(intercom.startTime, context.currentTime, 'intercom needs no radio-key delay');
  assert.equal(pttEdges(context).length, 2, 'intercom has no onset PTT');
  intercom.finish(); assert.equal(pttEdges(context).length, 2, 'intercom has no tail PTT');
  assert.equal(context.sources.filter(source => source.loop && !source.disconnected).length, loops, 'intercom creates no radio static loop');
  const vehicleBuses = context.gains.slice(1, 7);
  const feedsVehicle = (node: MockNode): boolean => vehicleBuses.includes(node) || node.connections.some(feedsVehicle);
  assert.ok(context.sources.filter(source => source.loop && !source.disconnected).every(feedsVehicle), 'after the radio ends only vehicle noise remains active');
  assert.equal(context.gains[0]!.gain.value, .48, 'master ceiling stays unchanged');
});

test('radio PTT releases naturally and obsolete edges cannot accumulate across rapid channel changes', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin();
  const squelches = () => pttEdges(context);
  await update(audio, sim);
  const first = squelches()[0]!;
  assert.ok(first, 'radio onset has one short synthesized chirp');
  first.finish();
  assert.equal(first.disconnected, true, 'natural completion releases the connection');
  for (let i = 0; i < 30; i++) {
    sim.phase = i % 2 ? 'exterior' : 'cabin';
    await update(audio, sim);
  }
  const active = squelches().filter(source => !source.disconnected);
  assert.equal(active.length, 1, 'only the current radio onset remains after rapid channel changes');
  assert.ok(squelches().filter(source => source !== first && !active.includes(source)).every(source => source.stopped && source.disconnected),
    'preempted onset nodes are stopped and disconnected');
  active.forEach(source => source.finish());
  const count = squelches().length;
  sim.phase = 'feed'; await update(audio, sim);
  assert.equal(squelches().length, count, 'intercom adds no radio feedback');
  sim.phase = 'exterior'; await update(audio, sim);
  assert.equal(squelches().length, count + 1, 'natural completion releases capacity for future radio feedback');
  assert.ok(context.oscillators.every(source => !source.stopped), 'radio cleanup preserves continuous vehicle sound');
});

test('radio static is quiet, shares one buffer and follows actual calls without frame allocations or intercom hiss', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  audio.setMusicEnabled(false); await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin(); await update(audio, sim);
  const voice = context.voices.at(-1)!, first = radioStaticSources(context)[0]!, gain = first.connections[0]!;
  assert.ok(first.started && first.loop);
  assert.equal(first.startTime, voice.startTime, 'static begins with scheduled speech after the PTT lead-in');
  assert.equal(gain.gain.value, .018, 'static remains well below unity conditioned speech');
  assert.equal(gain.connections[0], voice.connections[0], 'static uses the same band-limited radio path');
  const nodes = context.sources.length, oscillators = context.oscillators.length;
  for (let frame = 0; frame < 120; frame++) audio.update(sim, { inside: frame % 2 === 0 });
  assert.equal(context.sources.length, nodes, 'render frames allocate no additional sound sources');
  assert.equal(context.oscillators.length, oscillators, 'static creates no oscillator');
  voice.finish();
  assert.ok(first.stopped && first.disconnected && gain.disconnected);
  assert.equal(gain.gain.value, 0);
  sim.board(); await update(audio, sim);
  assert.equal(radioStaticSources(context).filter(source => !source.disconnected).length, 0, 'intercom remains clean');
  sim.phase = 'exterior'; await update(audio, sim);
  const second = radioStaticSources(context).at(-1)!;
  assert.notEqual(second, first);
  assert.equal(second.buffer, first.buffer, 'later calls reuse the single noise buffer');
  assert.equal(radioStaticSources(context).filter(source => !source.disconnected).length, 1);
});

for (const interruption of ['pause', 'mute', 'restart', 'phase', 'terminal', 'dispose'] as const) {
  test(`radio static and scheduled speech stop immediately on ${interruption}`, async t => {
    browser(t);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
    const sim = new DrivingRange().audioState, context = MockContext.latest;
    audio.update(sim, { training: true }); await settle();
    const speech = context.voices.at(-1)!, noise = radioStaticSources(context)[0]!, gain = noise.connections[0]!;
    assert.ok(speech.startTime! > context.currentTime, 'exercise can cancel the scheduled first syllable');
    if (interruption === 'pause') audio.setPaused(true);
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') audio.restart();
    if (interruption === 'phase') { sim.phase = 'feed'; audio.update(sim, { training: true }); await settle(); }
    if (interruption === 'terminal') { audio.update(sim, { training: true, terminal: true }); await settle(); }
    if (interruption === 'dispose') audio.dispose();
    assert.ok(noise.stopped && noise.disconnected && gain.disconnected);
    assert.equal(gain.gain.value, 0);
    assert.ok(speech.stopped && speech.disconnected);
    assert.equal(radioStaticSources(context).filter(source => !source.disconnected).length, 0);
    const count = radioStaticSources(context).length;
    speech.finish(); audio.setPaused(false); audio.setMuted(false); await settle();
    assert.equal(radioStaticSources(context).length, count, 'late callbacks and transport recovery cannot resurrect static');
  });
}

test('pending decode and failed voice starts never leave static or a keyed radio tail', async t => {
  let release!: () => void;
  const download = new Promise<void>(resolve => { release = resolve; });
  browser(t, new Map([[openingOrder.file, download]]));
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => { release(); audio.dispose(); }); await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin(); await update(audio, sim);
  assert.equal(radioStaticSources(context).length, 0, 'a pending recording has no static source');
  assert.equal(pttEdges(context).length, 0);
  MockContext.failVoiceStart = true;
  release(); await settle();
  assert.equal(radioStaticSources(context).length, 0, 'failed speech never starts static');
  assert.ok(pttEdges(context).every(source => source.stopped && source.disconnected));
  MockContext.failVoiceStart = false; MockContext.failStaticStart = true;
  sim.board(); await update(audio, sim); sim.phase = 'exterior'; await update(audio, sim);
  const failed = radioStaticSources(context).at(-1)!;
  assert.ok(failed.stopped && failed.disconnected && failed.connections[0]!.disconnected);
  assert.equal(failed.connections[0]!.gain.value, 0);
  assert.ok(context.voices.at(-1)!.started, 'optional static failure preserves the dialogue');
});

for (const interruption of ['pause', 'mute', 'restart', 'dispose'] as const) {
  test(`radio squelches stop and disconnect on ${interruption} without stale replay`, async t => {
    browser(t);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
    const context = MockContext.latest, engineLoops = context.oscillators.slice(), sim = new Simulation(); sim.begin(); await update(audio, sim);
    const squelches = () => pttEdges(context);
    const chirps = squelches();
    assert.equal(chirps.length, 1);
    const speech = context.voices.at(-1)!;
    assert.ok(speech.startTime! > context.currentTime, 'interruption is before the scheduled first syllable');
    if (interruption === 'pause') { sim.paused = true; audio.setPaused(true); }
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') { audio.restart(); sim.restart(); }
    if (interruption === 'dispose') audio.dispose();
    assert.ok(chirps.every(source => source.stopped && source.disconnected));
    assert.ok(speech.stopped && speech.disconnected, 'scheduled speech is cancelled as well as PTT');
    const count = squelches().length;
    sim.paused = false; audio.setPaused(false); audio.setMuted(false); await update(audio, sim);
    assert.equal(squelches().length, count, 'resuming cannot recreate the interrupted chirp');
    if (interruption !== 'dispose') assert.ok(engineLoops.every(source => !source.stopped), 'engine loops survive interruption');
  });
}

for (const interruption of ['pause', 'mute', 'restart', 'dispose'] as const) {
  test(`completed radio tail is cancelled on ${interruption} without another ending cue`, async t => {
    browser(t);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
    const context = MockContext.latest, sim = new Simulation(); sim.begin(); await update(audio, sim);
    pttEdges(context)[0]!.finish(); context.voices.at(-1)!.finish();
    const tail = pttEdges(context).at(-1)!;
    if (interruption === 'pause') audio.setPaused(true);
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') audio.restart();
    if (interruption === 'dispose') audio.dispose();
    assert.ok(tail.stopped && tail.disconnected);
    const count = context.sources.length;
    tail.finish();
    assert.equal(context.sources.length, count, 'late tail completion cannot queue more audio');
  });
}

for (const interruption of ['pause', 'mute', 'restart', 'dispose'] as const) {
  test(`decode completing after ${interruption} cannot play a stale phase`, async t => {
    browser(t);
    let release!: () => void;
    MockContext.decodeGate = new Promise<void>(resolve => { release = resolve; });
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
    const starting = audio.start();
    const sim = new Simulation(); sim.begin(); await update(audio, sim);
    if (interruption === 'pause') audio.setPaused(true);
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') { audio.restart(); sim.restart(); }
    if (interruption === 'dispose') audio.dispose();
    release(); await starting; await settle();
    assert.equal(MockContext.latest.voices.length, 0);
    audio.setPaused(false); audio.setMuted(false); await update(audio, sim);
    assert.equal(MockContext.latest.voices.length, 0, 'resume never replays invalidated pending speech');
  });
}

test('phase entered during progressive loading plays latest cue once, while failed decoding keeps captions', async t => {
  browser(t);
  let release!: () => void;
  MockContext.decodeGate = new Promise<void>(resolve => { release = resolve; });
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  const starting = audio.start();
  const sim = new Simulation(); sim.begin(); await update(audio, sim); sim.board(); await update(audio, sim);
  release(); await starting; await settle();
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), ['moving']);
  audio.dispose();
  MockContext.decodeGate = undefined; MockContext.failDecode = true;
  const fallback = new SimulationAudio(() => 0, () => 1); t.after(() => fallback.dispose()); await fallback.start();
  await update(fallback, sim);
  assert.equal(MockContext.latest.voices.length, 0);
  assert.equal(fallback.caption, captionForPhase('cabin'));
  sim.time = 22; await update(fallback, sim);
  assert.equal(fallback.caption, exact(firstAmbient), 'missing audio still captions ambient cue');
});


test('moving chapter transitions preserve radio cadence and defer due traffic behind priority dialogue', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest;
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  context.voices.at(-1)!.finish();
  for (const [time, phase] of [[4, 'feed'], [8, 'manifold'], [12, 'turbine']] as const) {
    sim.time = time; sim.phase = phase; await update(audio, sim);
    assert.equal(context.voices.at(-1)!.buffer?.id, radioScript.phase[phase].id);
    context.voices.at(-1)!.finish();
  }
  sim.time = 14; await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, firstAmbient.id,
    'first background cue still arrives fourteen seconds after boarding');
  context.voices.at(-1)!.finish();
  sim.time = 44; sim.phase = 'insight'; await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, 'insight', 'phase dialogue wins over due ambient traffic');
  const count = context.voices.length;
  sim.time = 45; await update(audio, sim);
  assert.equal(context.voices.length, count, 'no ambient overlap during long priority dialogue');
  context.voices.at(-1)!.finish(); await update(audio, sim);
  assert.equal(context.voices.length, count, 'do not start ambient on the exact end of priority dialogue');
  sim.time = 46; await update(audio, sim);
  assert.equal(context.voices.length, count, 'gap is measured in simulation seconds');
  sim.time = 46.5; await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, secondAmbient.id);
  context.voices.at(-1)!.finish();
  sim.time = 48; await update(audio, sim);
  assert.equal(context.voices.length, count + 1, 'only one ambient cue is emitted after deferral, without backlog');
});

test('range report is immediate, bounded, reusable and dropped while muted or paused', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  audio.fireRangeShot();
  await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  const before = context.sources.length;
  audio.fireRangeShot();
  const first = context.sources.at(-1)!;
  assert.equal(context.sources.length, before + 1); assert.ok(first.started);
  assert.ok(first.buffer); assert.equal(first.buffer?.id, undefined, 'report is synthesized locally');
  first.finish(); assert.equal(first.disconnected, true);
  for (let i = 0; i < 20; i++) audio.fireRangeShot();
  assert.equal(context.sources.length, before + 5, 'at most four simultaneous short reports');
  const active = context.sources.slice(-4);
  audio.setPaused(true);
  assert.ok(active.every(source => source.stopped && source.disconnected));
  const pausedCount = context.sources.length;
  audio.fireRangeShot(); audio.setPaused(false); await settle();
  assert.equal(context.sources.length, pausedCount, 'paused shot is never queued for resume');
  audio.setMuted(true); audio.fireRangeShot(); audio.setMuted(false); await settle();
  assert.equal(context.sources.length, pausedCount, 'muted shot is never queued');
  audio.fireRangeShot(); const restarted = context.sources.at(-1)!; audio.restart();
  assert.ok(restarted.stopped && restarted.disconnected);
  audio.fireRangeShot(); const disposed = context.sources.at(-1)!; audio.dispose();
  assert.ok(disposed.stopped && disposed.disconnected);
  const disposedCount = context.sources.length; audio.fireRangeShot();
  assert.equal(context.sources.length, disposedCount);
});

test('health cue is bounded, preserves radio captions and cancels without replay', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  const context = MockContext.latest, caption = audio.caption, count = context.sources.length;
  audio.healthAlert(); const cue = context.sources.at(-1)!;
  audio.healthAlert(); assert.equal(context.sources.length, count + 1);
  assert.ok(cue.started); assert.equal(audio.caption, caption);
  audio.setPaused(true); assert.ok(cue.stopped && cue.disconnected);
  audio.healthAlert(); audio.setPaused(false); await settle();
  assert.equal(context.sources.length, count + 1, 'no paused alert replay');
  audio.setMuted(true); audio.healthAlert(); audio.setMuted(false); await settle();
  assert.equal(context.sources.length, count + 1, 'no muted alert replay');
  audio.healthAlert(); const next = context.sources.at(-1)!; next.finish();
  assert.ok(next.disconnected); audio.healthAlert();
  const restarted = context.sources.at(-1)!; audio.restart(); assert.ok(restarted.stopped);
  audio.healthAlert(); const disposed = context.sources.at(-1)!; audio.dispose(); assert.ok(disposed.stopped);
});

test('instrument alerts use distinct short midrange pulse patterns with quiet edges and exact silence gaps', async t => {
  browser(t); MockContext.sampleRate = 48000;
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest;
  for (const [severity, count, pulse, gap, duration] of [
    ['warning', 2, .12, .08, .345], ['critical', 3, .105, .065, .47],
  ] as const) {
    audio.healthAlert(severity);
    const cue = context.sources.at(-1)!, samples = cue.buffer!.getChannelData!();
    const slice = (start: number, end: number): Float32Array => samples.slice(Math.ceil(start * context.sampleRate), Math.floor(end * context.sampleRate));
    assert.ok(Math.abs(samples.length / context.sampleRate - duration) < 1 / context.sampleRate);
    const peak = samples.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
    assert.ok(samples.every(Number.isFinite) && peak > .25 && peak <= .4);
    assert.ok(peak * .48 < .2, 'unchanged master ceiling leaves substantial transient headroom');
    for (let index = 0; index < count; index++) {
      const start = index * (pulse + gap);
      const body = slice(start + .01, start + pulse - .02);
      assert.ok(rms(body) > .19, 'every scheduled pulse has a sustained audible body');
      assert.ok(rms(slice(start, start + .0005)) < rms(body) * .03, '5ms onset rises from silence');
      assert.ok(rms(slice(start + pulse - .0005, start + pulse)) < rms(body) * .01, '14ms release tapers before the gap');
      assert.ok(slice(start + pulse + .0001, start + pulse + gap - .0001).every(sample => sample === 0), 'gaps and final padding contain literal silence');
    }
    assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0);
    assert.ok(spectralDensity(samples, context.sampleRate, 800, 3800) > spectralDensity(samples, context.sampleRate, 6000, 12000) * 100,
      'phone-band tone dominates high-frequency hiss');
    cue.finish(); assert.ok(cue.disconnected);
  }
});

test('severity changes cannot overlap or queue an active annunciator', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, before = context.sources.length;
  audio.healthAlert(); const warning = context.sources.at(-1)!;
  audio.healthAlert('critical');
  assert.equal(context.sources.length, before + 1, 'short current cue finishes without an overlapping replacement');
  warning.finish(); assert.equal(context.sources.length, before + 1, 'suppressed severity change is not queued');
  audio.healthAlert('critical'); const critical = context.sources.at(-1)!;
  assert.ok(critical.buffer!.length! > warning.buffer!.length!);
  audio.setPaused(true); assert.ok(critical.stopped && critical.disconnected);
  audio.healthAlert('critical'); audio.setPaused(false); await settle();
  assert.equal(context.sources.length, before + 2, 'critical alert also remains consumed across pause');
});

for (const state of ['running', 'paused', 'muted', 'range'] as const) {
  test(`guided telemetry alert edge is handled once while ${state}`, async t => {
    browser(t);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
    const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
    const context = MockContext.latest;
    const alerts = (): MockNode[] => context.sources.filter(source => source.buffer?.length !== undefined && source.buffer.length >= 345 && source.buffer.length <= 346);
    // Advance the real synthetic telemetry model to its first charging alert.
    for (let frame = 0; frame < 200 && !sim.alert; frame++) sim.tick(.15);
    assert.equal(sim.alert, true);
    if (state === 'paused') sim.paused = true;
    if (state === 'muted') audio.setMuted(true);
    const vehicle = state === 'range' ? { training: false } : { inside: true };
    audio.update(sim, vehicle);
    assert.equal(alerts().length, state === 'running' ? 1 : 0);
    alerts()[0]?.finish();
    sim.paused = false; audio.setMuted(false); await settle();
    audio.update(sim, vehicle); audio.update(sim, vehicle);
    assert.equal(alerts().length, state === 'running' ? 1 : 0, 'persistent or interrupted warning cannot replay');
    if (state === 'running') {
      audio.restart(); sim.restart(); sim.begin(); sim.board(); audio.update(sim);
      for (let frame = 0; frame < 200 && !sim.alert; frame++) sim.tick(.15);
      audio.update(sim); assert.equal(alerts().length, 2, 'restart arms a new genuine warning edge');
    }
  });
}

test('range ambience captions follow actual motion while recorded dialogue remains exact', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const range = new DrivingRange(); await update(audio, range.audioState);
  assert.equal(audio.caption, captionForPhase('cabin'), 'recorded phase dialogue retains its exact caption');
  MockContext.latest.voices.at(-1)!.finish();
  assert.match(audio.caption, /engine idling.*vehicle stationary/i);
  assert.doesNotMatch(audio.caption, /under load|tires rolling/);
  range.tick(.1, { throttle: 1, steer: 0, aim: 0, fire: false }); await update(audio, range.audioState);
  assert.match(audio.caption, /under load.*tires rolling/i);
  range.speed = 0; await update(audio, range.audioState);
  assert.match(audio.caption, /engine idling.*vehicle stationary/i);
  const stopped = range.audioState; stopped.engine = false; await update(audio, stopped);
  assert.match(audio.caption, /Engine off.*vehicle stationary/);
});

test('range powertrain drives distinct whine and revs at rest, muffles cabin, and silences completed mission', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const range = new DrivingRange(), context = MockContext.latest;
  audio.update(range.audioState, { powertrain: range.powertrain, inside: false }); await settle();
  context.voices.at(-1)!.finish();
  assert.equal(audio.radioActive, false);
  const idleFrequency = context.sources[0]!.frequency.value;
  for (let i = 0; i < 40; i++) range.tick(.025, { throttle: 1, steer: 0, aim: 0, fire: false, brake: true });
  audio.update(range.audioState, { powertrain: range.powertrain, inside: false });
  assert.equal(range.speed, 0);
  assert.ok(context.sources[0]!.frequency.value > idleFrequency * 1.7);
  assert.ok(context.gains[5]!.gain.value > .03, 'separate smooth whine layer is audible under throttle');
  assert.ok(context.gains[6]!.gain.value > .03, 'filtered load airflow accompanies the whine');
  assert.match(audio.caption, /revving under load.*whine.*vehicle stationary.*exterior/);
  const exteriorEngine = context.gains[1]!.gain.value, exteriorWhine = context.gains[5]!.gain.value;
  audio.update(range.audioState, { powertrain: range.powertrain, inside: true });
  assert.ok(context.gains[1]!.gain.value < exteriorEngine); assert.ok(context.gains[5]!.gain.value < exteriorWhine);
  assert.match(audio.caption, /muffled cabin vibration/);
  // Audio shutdown observes a completed campaign; combat gating is tested in range tests.
  range.position = { x: range.mission.objective.x, z: range.mission.objective.z }; range.speed = 0;
  range.mission.departureCrossed = true;
  for (const contact of range.mission.contacts) { contact.neutralized = true; contact.health = 0; }
  assert.equal(range.dropRamp(), true);
  for (let i = 0; i < 230; i++) range.tick(.025, { throttle: 0, steer: 0, aim: 0, fire: false });
  audio.update(range.audioState, { powertrain: range.powertrain, inside: true });
  assert.equal(range.mission.status, 'complete');
  assert.equal(context.gains[1]!.gain.value, 0); assert.equal(context.gains[5]!.gain.value, 0); assert.equal(context.gains[6]!.gain.value, 0);
  assert.match(audio.caption, /Engine off.*vehicle stationary/);
});


test('independent music control preserves engine, radio and reports; transport clears every score source', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(), base = context.oscillators.length;
  assert.equal(audio.musicEnabled, true);
  await update(audio, sim); assert.equal(context.oscillators.length, base, 'no score on title after audio activation');
  sim.begin(); sim.board(); sim.time = .25; await update(audio, sim);
  const first = context.oscillators.slice(base), voice = context.voices.at(-1)!;
  assert.equal(first.length, 4); assert.ok(context.gains[1]!.gain.value > 0);
  const caption = audio.caption;
  audio.setMusicEnabled(false);
  assert.ok(first.every(node => node.stopped && node.disconnected));
  assert.equal(voice.stopped, false); assert.equal(audio.caption, caption);
  assert.ok(context.gains[0]!.gain.value > 0 && context.gains[1]!.gain.value > 0, 'music off preserves master and engine audibility');
  const count = context.sources.length; audio.fireRangeShot();
  assert.equal(context.sources.length, count + 1, 'music off preserves weapon feedback');
  await update(audio, sim); assert.equal(context.oscillators.length, base + 4);
  audio.setMusicEnabled(true); await update(audio, sim);
  const resumed = context.oscillators.slice(-4);
  audio.setPaused(true); assert.ok(resumed.every(node => node.stopped));
  const pausedCount = context.oscillators.length;
  audio.setMusicEnabled(false); audio.setMusicEnabled(true);
  assert.equal(context.oscillators.length, pausedCount, 'turning music on while paused starts no score sources');
  assert.equal(context.gains[0]!.gain.value, 0);
  audio.setPaused(false);
  assert.equal(context.oscillators.length, pausedCount, 'no score queue runs on resume');
  await update(audio, sim); assert.equal(context.oscillators.length, pausedCount + 4);
  const unpaused = context.oscillators.slice(-4);
  audio.setMuted(true); assert.ok(unpaused.every(node => node.stopped));
  const mutedCount = context.oscillators.length; audio.setMuted(false);
  assert.equal(context.oscillators.length, mutedCount);
  await update(audio, sim); const unmuted = context.oscillators.slice(-4);
  audio.restart(); sim.restart(); assert.ok(unmuted.every(node => node.stopped));
  const restartedCount = context.oscillators.length; await update(audio, sim);
  assert.equal(context.oscillators.length, restartedCount, 'restart title stays silent');
  sim.begin(); await update(audio, sim); const final = context.oscillators.slice(-4);
  audio.dispose(); assert.ok(final.every(node => node.stopped));
  const disposedCount = context.oscillators.length; await update(audio, sim); await audio.start();
  assert.equal(context.oscillators.length, disposedCount);
});

test('radio and health cues duck music immediately without replacing important captions', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(), baseGains = context.gains.length;
  sim.begin(); sim.board(); sim.time = .25; await update(audio, sim);
  const musicGain = context.gains[baseGains]!;
  const speakingLevel = musicGain.gain.value;
  context.voices.at(-1)!.finish(); await update(audio, sim);
  const normalLevel = musicGain.gain.value;
  assert.ok(normalLevel > speakingLevel * 2.5 && normalLevel < speakingLevel * 3, 'radio gets foreground headroom while leaving a faint score');
  const caption = audio.caption; audio.healthAlert();
  assert.ok(musicGain.gain.value < normalLevel * .2, 'health cue ducks in the calling frame');
  assert.equal(audio.caption, caption);
  context.sources.at(-1)!.finish(); await update(audio, sim);
  assert.equal(musicGain.gain.value, normalLevel);
});

test('a caption waiting for its recording does not silently suppress the music', async t => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  browser(t, new Map([[radioScript.phase.cabin.file, pending]]));
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start(); await settle();
  const context = MockContext.latest, baseGains = context.gains.length;
  const sim = new Simulation(); sim.begin(); sim.board(); sim.time = .25; await update(audio, sim);
  const caption = audio.caption, fullLevel = context.gains[baseGains]!.gain.value;
  assert.equal(context.voices.length, 0); assert.ok(fullLevel > .01);
  release(); await settle();
  assert.equal(context.voices.length, 1); assert.equal(audio.caption, caption);
  assert.ok(context.gains[baseGains]!.gain.value < fullLevel * .4, 'actual speech receives headroom immediately when decoded');
});

test('music preference survives restart and cannot override an explicit master mute', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); sim.time = .25; await update(audio, sim);
  audio.setMusicEnabled(false); audio.restart(); sim.restart();
  assert.equal(audio.musicEnabled, false);
  audio.setMuted(true); audio.setMusicEnabled(true); await audio.start();
  const context = MockContext.latest, count = context.oscillators.length;
  sim.begin(); sim.board(); sim.time = .25; await update(audio, sim);
  assert.equal(audio.soundState, 'muted'); assert.equal(audio.musicEnabled, true);
  assert.equal(context.oscillators.length, count, 'music on while muted starts no source');
  assert.equal(context.gains[0]!.gain.value, 0);
  audio.setMuted(false); await audio.start(); await update(audio, sim);
  const score = context.oscillators.slice(count);
  assert.equal(score.length, 4); assert.ok(score.some(node => node.frequency.value >= 300 && node.connections[0]!.gain.value > 0));
  assert.equal(context.gains[0]!.gain.value, .48, 'restoring music never raises the master ceiling');
});

const breakdownCues = (context: MockContext): MockNode[] => context.sources.filter(source => source.buffer?.length === 2700);

test('breakdown emits one original mechanical shutdown and captions the frozen terminal state', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); sim.time = .25;
  audio.update(sim, { breakdown: false }); await settle();
  const context = MockContext.latest, radio = context.voices.at(-1)!;
  sim.engine = false;
  audio.update(sim, { breakdown: true, health: 'broken' });
  const [cue] = breakdownCues(context);
  assert.ok(cue?.started); assert.equal(cue.buffer?.id, undefined, 'local procedural sound has no recording');
  const samples = cue.buffer!.getChannelData!();
  assert.ok(samples.every(Number.isFinite)); assert.ok(Math.max(...samples.map(Math.abs)) < 1);
  assert.ok(samples.slice(1400, 2200).some(sample => Math.abs(sample) > .001), 'pressure hiss continues after the engine sputter');
  assert.ok(radio.stopped, 'engine shutdown cancels obsolete recorded dialogue');
  assert.match(audio.caption, /Engine sputters and stops.*metal clunk.*pressure hiss.*immobilized/);
  for (let i = 0; i < 10; i++) audio.update(sim, { breakdown: true, health: 'broken' });
  assert.equal(breakdownCues(context).length, 1, 'frozen terminal frames cannot retrigger the cue');
  cue.finish();
  assert.ok(cue.disconnected);
  assert.match(audio.caption, /Engine stopped.*immobilized.*recovery and repair required/);
  audio.update(sim, { breakdown: true });
  assert.equal(breakdownCues(context).length, 1, 'natural completion does not replay the sound');
  audio.restart(); sim.restart(); sim.begin(); sim.board(); sim.engine = false;
  audio.update(sim, { breakdown: true });
  assert.equal(breakdownCues(context).length, 2, 'restart arms the next run');
});

for (const interruption of ['pause', 'mute', 'restart', 'dispose'] as const) {
  test(`breakdown source stops and disconnects on ${interruption} without stale replay`, async t => {
    browser(t);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
    const sim = new Simulation(); sim.begin(); sim.board(); sim.engine = false;
    audio.update(sim, { breakdown: true });
    const context = MockContext.latest, cue = breakdownCues(context)[0]!;
    if (interruption === 'pause') audio.setPaused(true);
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') audio.restart();
    if (interruption === 'dispose') audio.dispose();
    assert.ok(cue.stopped && cue.disconnected);
    if (interruption !== 'restart') {
      audio.setPaused(false); audio.setMuted(false); await settle();
      audio.update(sim, { breakdown: true });
      assert.equal(breakdownCues(context).length, 1, 'interrupted breakdown is consumed');
    }
  });
}

for (const interruption of ['pause', 'mute', 'unactivated'] as const) {
  test(`breakdown entered while ${interruption} is captioned and never queued`, async t => {
    browser(t);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
    if (interruption !== 'unactivated') await audio.start();
    const sim = new Simulation(); sim.begin(); sim.board(); sim.engine = false;
    if (interruption === 'pause') sim.paused = true;
    if (interruption === 'mute') audio.setMuted(true);
    audio.update(sim, { breakdown: true });
    assert.match(audio.caption, /Engine stopped.*immobilized.*repair required/);
    sim.paused = false; audio.setMuted(false); await audio.start();
    audio.update(sim, { breakdown: true });
    assert.equal(breakdownCues(MockContext.latest).length, 0);
  });
}

test('late device activation cannot replay a consumed breakdown', async t => {
  browser(t);
  let release!: () => void;
  MockContext.resumeGate = new Promise<void>(resolve => { release = resolve; });
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  const starting = audio.start(), sim = new Simulation(); sim.begin(); sim.board(); sim.engine = false;
  audio.update(sim, { breakdown: true });
  assert.equal(breakdownCues(MockContext.latest).length, 0);
  release(); await starting; await settle();
  audio.update(sim, { breakdown: true });
  assert.equal(breakdownCues(MockContext.latest).length, 0);
});

test('breakdown source ducks music for its lifetime and releases ducking after natural completion', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); sim.time = .25;
  const context = MockContext.latest, baseGains = context.gains.length;
  audio.update(sim, { health: 'broken', terminal: true }); await settle();
  assert.equal(context.voices.length, 0, 'a terminal state never starts an obsolete crew call');
  audio.update(sim, { health: 'broken', terminal: true });
  const musicGain = context.gains[baseGains]!, normal = musicGain.gain.value;
  sim.engine = false;
  audio.update(sim, { breakdown: true, health: 'broken', terminal: true });
  assert.ok(musicGain.gain.value < normal * .2);
  breakdownCues(context)[0]!.finish();
  audio.update(sim, { breakdown: true, health: 'broken', terminal: true });
  assert.equal(musicGain.gain.value, normal, 'frozen simulation time does not hold the sound duck forever');
});

test('diesel retains phone-band harmonics and pronounced mechanical whine responds to revs, load and shifts', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board();
  const powertrain = { rpm: 720, load: .08, throttle: 0, gear: 1, whine: 0, roughness: .08 };
  audio.update(sim, { powertrain, inside: false }); await settle();
  const context = MockContext.latest; context.voices.at(-1)!.finish();
  const diesel = context.oscillators.slice(0, 9);
  assert.ok(diesel.some(tone => tone.frequency.value < 40), 'low engine weight remains');
  const phoneBand = diesel.filter(tone => tone.frequency.value >= 200);
  const energy = phoneBand.reduce((sum, tone) => sum + tone.connections[0]!.gain.value ** 2, 0);
  assert.ok(energy > .015 && energy < .025, 'useful but restrained small-speaker midrange at idle');
  const whine = context.oscillators[10]!, whineGain = context.gains[5]!;
  const idlePitch = whine.frequency.value;
  powertrain.rpm = 2000; powertrain.load = .8; powertrain.throttle = 1; powertrain.whine = .8;
  audio.update(sim, { powertrain, inside: false });
  const revPitch = whine.frequency.value, revLevel = whineGain.gain.value;
  assert.ok(revPitch > 2050 && revPitch < 2300 && revPitch > idlePitch * 2.4, 'restores the prominent rising mechanical pitch');
  assert.ok(revLevel > .075 && revLevel < .095, 'restores audible original whine strength without master gain');
  const enginePitch = diesel[0]!.frequency.value;
  powertrain.rpm = 1550; powertrain.gear = 2;
  audio.update(sim, { powertrain, inside: false });
  assert.ok(whine.frequency.value < revPitch - 90, 'RPM dip changes pitch even before the slower spool falls');
  assert.ok(diesel[0]!.frequency.value < enginePitch * .8, 'virtual shifts remain audible in the diesel harmonics');
  assert.ok(whine.frequency.events.at(-1)!.seconds > .02 && whine.frequency.events.at(-1)!.seconds < .15, 'pitch follows smoothly without sluggish gear response');
  powertrain.throttle = 0; powertrain.load = .1; powertrain.whine = .2;
  audio.update(sim, { powertrain, inside: false });
  assert.ok(whineGain.gain.value < revLevel * .3, 'coasting loses the loaded whine');
  assert.ok(context.gains[6]!.gain.value < .025, 'airflow recedes with load');
  assert.equal(context.gains[0]!.gain.value, .48, 'master ceiling is unchanged');
});

test('radio and health reduce vehicle and shot masking immediately with smoothed release and hard pause silence', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  const context = MockContext.latest, engine = context.gains[1]!.gain;
  const speaking = engine.value;
  context.voices.at(-1)!.finish();
  const normal = engine.value;
  assert.ok(Math.abs(speaking / normal - .38) < 1e-9);
  assert.equal(engine.events.at(-1)!.seconds, .16, 'radio release is gradual');
  audio.fireRangeShot(); const shot = context.sources.at(-1)!, shotGain = shot.connections[0]!;
  const report = shotGain.gain.value;
  audio.healthAlert(); const health = context.sources.at(-1)!;
  assert.ok(Math.abs(engine.value / normal - .55) < 1e-9, 'instrument warning receives immediate vehicle headroom');
  assert.equal(engine.events.at(-1)!.seconds, .025);
  assert.ok(Math.abs(shotGain.gain.value / report - .4) < 1e-9, 'existing reports yield to the instrument warning');
  assert.equal(shotGain.gain.events.at(-1)!.seconds, .015);
  health.finish(); assert.equal(engine.value, normal); assert.equal(shotGain.gain.value, report);
  audio.setPaused(true);
  assert.ok(shot.stopped && shotGain.disconnected && shotGain.gain.cancelled);
  assert.equal(shotGain.gain.value, 0); assert.equal(engine.value, 0); assert.ok(engine.cancelled);
  assert.deepEqual(engine.events.at(-1), { value: 0, time: context.currentTime, seconds: 0 }, 'hard silence overrides any previously running parameter curve');
  const count = context.sources.length; audio.setPaused(false); await settle();
  assert.equal(context.sources.length, count, 'resume cannot replay the faded transients');
  assert.equal(engine.value, 0, 'transport resume alone cannot resurrect the previous vehicle mix');
});

test('real firing gets a 4.3 dB report lift with its full buffered attack and unchanged master gain', async t => {
  browser(t); MockContext.sampleRate = 48000;
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  const context = MockContext.latest; context.voices.at(-1)!.finish();
  const before = context.sources.length;
  audio.fireRangeShot(); audio.fireRangeShot();
  const shots = context.sources.slice(before);
  const oldLevels = [.44, .46];
  shots.forEach((shot, index) => {
    const gain = shot.connections[0]!.gain;
    const lift = 20 * Math.log10(gain.value / oldLevels[index]!);
    assert.ok(lift > 4.2 && lift < 4.4, 'two normally overlapping voices preserve the requested source lift');
    assert.deepEqual(gain.events[0], { value: gain.value, time: context.currentTime, seconds: 0 },
      'gain is established before source start; the buffer alone shapes the 0.8ms attack');
  });
  assert.equal(context.gains[0]!.gain.value, .48);
  audio.healthAlert();
  shots.forEach(shot => assert.ok(Math.abs(shot.connections[0]!.gain.value / [.72, .75][shots.indexOf(shot)]! - .4) < 1e-9,
    'instrument warning retains its existing priority duck with louder reports'));
});

test('weapon reports vary subtly, taper to silence and retain bounded worst-case overlap at full sample rate', async t => {
  browser(t); MockContext.sampleRate = 48000;
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  const context = MockContext.latest; context.voices.at(-1)!.finish();
  const before = context.sources.length;
  for (let i = 0; i < 30; i++) audio.fireRangeShot();
  const shots = context.sources.slice(before);
  assert.equal(shots.length, 4);
  assert.deepEqual(shots.map(shot => shot.playbackRate.value), [.97, 1.025, 1, .97]);
  const samples = shots[0]!.buffer!.getChannelData!();
  const peak = samples.reduce((maximum, sample) => Math.max(maximum, Math.abs(sample)), 0);
  assert.ok(samples.every(Number.isFinite) && peak < .85);
  assert.equal(samples[0], 0); assert.ok(Math.abs(samples.at(-1)!) < .00001, 'attack and tail cannot cut at a nonzero sample');
  const summedGain = shots.reduce((sum, shot) => sum + shot.connections[0]!.gain.value, 0);
  assert.ok(peak * summedGain * .48 <= .640001, 'four coincident reports leave .36 of output headroom beneath the unchanged master ceiling');
  const levels = shots.map(shot => shot.connections[0]!);
  shots.forEach(shot => shot.finish()); assert.ok(levels.every(level => level.disconnected));
  audio.restart(); audio.fireRangeShot();
  assert.equal(context.sources.at(-1)!.playbackRate.value, .97, 'restart resets deterministic variation');
});

// Uniformly spaced DFT probes compare bands per Hz, independent of their widths.
// The buffer has tapered endpoints, so spectral leakage is small without hiding
// the initial crack behind a window function.
function spectralDensity(samples: Float32Array, sampleRate: number, from: number, to: number, window = false): number {
  let power = 0, count = 0;
  for (let frequency = from; frequency <= to; frequency += 40) {
    const step = 2 * Math.PI * frequency / sampleRate;
    const coefficient = 2 * Math.cos(step);
    let previous = 0, previous2 = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]! * (window ? .5 - .5 * Math.cos(2 * Math.PI * i / (samples.length - 1)) : 1);
      const next = sample + coefficient * previous - previous2;
      previous2 = previous; previous = next;
    }
    power += previous * previous + previous2 * previous2 - coefficient * previous * previous2;
    count++;
  }
  return power / count / samples.length;
}

const rms = (samples: Float32Array): number => Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);

test('arcade report has dominant low/mid body, a brief crack and a weighty continuous decay', async t => {
  browser(t); MockContext.sampleRate = 48000;
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  audio.fireRangeShot();
  const samples = MockContext.latest.sources.at(-1)!.buffer!.getChannelData!();
  const sampleRate = MockContext.latest.sampleRate;
  const slice = (start: number, end: number): Float32Array => samples.slice(Math.floor(start * sampleRate), Math.floor(end * sampleRate));
  const body = spectralDensity(samples, sampleRate, 40, 1000);
  const hiss = spectralDensity(samples, sampleRate, 2520, 12000);
  assert.ok(body > hiss * 80, 'per-Hz low/mid energy dominates sustained tinny hiss');
  const crack = slice(0, .012), decay = slice(.04, .12), tail = slice(.20, .25);
  assert.ok(spectralDensity(crack, sampleRate, 2520, 12000, true) > spectralDensity(decay, sampleRate, 2520, 12000, true) * 50,
    'high-frequency crack is concentrated in the opening milliseconds');
  assert.ok(rms(decay) > rms(crack) * .15 && rms(decay) < rms(crack) * .8, 'substantial body continues after the crack');
  assert.ok(rms(tail) < rms(decay) * .25, 'late decay is at least 12 dB below the useful body before the endpoint taper');
  assert.ok(rms(slice(0, .0002)) < rms(slice(.001, .004)) * .5, 'onset rises from silence before the main crack');
  assert.equal(samples[0], 0); assert.ok(Math.abs(samples.at(-1)!) < .00001);
});

test('normal held-fire cadence never exhausts report voices and every natural tail disconnects', async t => {
  browser(t); MockContext.sampleRate = 48000;
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const range = new DrivingRange(), context = MockContext.latest;
  await update(audio, range.audioState); context.voices.at(-1)!.finish();
  const active = new Map<MockNode, number>(), completed: MockNode[] = [];
  let maximumLive = 0, reports = 0;
  for (let frame = 0; frame < 600; frame++) {
    const previous = range.shotsFired;
    range.tick(.01, { throttle: 0, steer: 0, aim: 0, fire: true });
    context.currentTime = range.time;
    // Web Audio ends a buffer at duration/playbackRate. Simulate that clock,
    // including the longest variation, instead of manually ending every shot.
    for (const [source, until] of active) if (until <= context.currentTime) {
      source.finish(); active.delete(source); completed.push(source);
    }
    if (range.shotsFired > previous) {
      const before = context.sources.length;
      audio.fireRangeShot();
      assert.equal(context.sources.length, before + 1, 'each real range trigger gets an audible report');
      const source = context.sources.at(-1)!;
      active.set(source, context.currentTime + source.buffer!.length! / context.sampleRate / source.playbackRate.value);
      reports++;
    }
    maximumLive = Math.max(maximumLive, active.size);
  }
  assert.ok(reports > 40 && reports === range.shotsFired, 'sustained game fire exercises repeated natural cleanup');
  assert.ok(maximumLive <= 2, 'normal cadence leaves spare capacity beneath the four-source hard cap');
  for (const source of active.keys()) { source.finish(); completed.push(source); }
  assert.ok(completed.every(source => source.disconnected && source.connections[0]!.disconnected), 'natural completion disconnects source and individual gain');
  const count = context.sources.length; audio.fireRangeShot();
  assert.equal(context.sources.length, count + 1, 'all voice slots are available after the final decay');
});


test('home theme advances on its own frame clock while simulation, radio and vehicle sound stay idle', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  const sim = new Simulation(), before = JSON.stringify(sim);
  assert.equal(audio.musicNeedsActivation, true, 'enabled home music offers activation before its first tap');
  audio.updateHome(.1);
  assert.equal(MockContext.created, 0, 'home frames do not create an autoplay context');
  await audio.start(); await settle();
  const context = MockContext.latest, base = context.oscillators.length;
  assert.equal(audio.musicNeedsActivation, false);
  audio.updateHome(.1);
  const score = context.oscillators.slice(base), initial = score.map(node => node.connections[0]!.gain.value);
  for (let i = 0; i < 40; i++) audio.updateHome(.1);
  assert.equal(context.oscillators.length, base + 4, 'one bounded score reuses the existing audio engine');
  assert.notDeepEqual(score.map(node => node.connections[0]!.gain.value), initial, 'theme rhythm progresses even though the simulation clock stays zero');
  const current = score.map(node => node.connections[0]!.gain.value);
  audio.updateHome(NaN); audio.updateHome(-100);
  assert.deepEqual(score.map(node => node.connections[0]!.gain.value), current, 'invalid or negative frame deltas cannot corrupt the home clock');
  assert.equal(JSON.stringify(sim), before);
  assert.equal(context.voices.length, 0); assert.equal(audio.radioActive, false);
  assert.equal(audio.caption, captionForPhase('title'));
  assert.ok(context.gains.slice(1, 7).every(node => node.gain.value === 0), 'engine, rolling, cabin, wind, whine and load stay silent');
  const sourceCount = context.sources.length;
  audio.fireRangeShot(); audio.healthAlert();
  assert.equal(context.sources.length, sourceCount, 'home cannot emit weapon or health feedback');
  assert.equal(context.gains[0]!.gain.value, .48, 'home uses the existing unchanged master ceiling');
});

test('home activation observes autoplay blocking and never silently disables the enabled preference', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
  MockContext.gestureRequired = true;
  await audio.start();
  const context = MockContext.latest, base = context.oscillators.length;
  audio.updateHome(.15);
  assert.equal(audio.soundState, 'blocked'); assert.equal(audio.musicNeedsActivation, true);
  assert.equal(audio.musicEnabled, true); assert.equal(context.oscillators.length, base);
  MockContext.inGesture = true;
  const activation = audio.start();
  MockContext.inGesture = false;
  await activation; audio.updateHome(.15);
  assert.equal(audio.soundState, 'running'); assert.equal(audio.musicNeedsActivation, false);
  assert.equal(context.oscillators.length, base + 4);
  audio.setPaused(true); assert.equal(audio.musicNeedsActivation, true, 'a home return can offer Play music after a focus interruption');
});

test('home music and master preferences survive restarts without implicit activation or source leaks', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
  audio.setMuted(true); audio.updateHome(.15); await audio.start();
  assert.equal(MockContext.created, 0);
  assert.equal(audio.musicNeedsActivation, false, 'general home taps cannot override Sound off');
  audio.setMusicEnabled(false); audio.restart(); audio.updateHome(.15);
  assert.equal(audio.musicEnabled, false);
  audio.setMuted(false); await audio.start();
  const context = MockContext.latest, base = context.oscillators.length;
  audio.updateHome(.15);
  assert.equal(context.oscillators.length, base, 'Sound on preserves explicit Music off');
  assert.equal(context.gains[0]!.gain.value, .48, 'master remains available for quiet briefing clicks while the score is off');
  assert.ok(context.gains.slice(1, 7).every(node => node.gain.value === 0), 'no vehicle sound runs behind Music off');
  audio.setMusicEnabled(true); audio.updateHome(.15);
  const score = context.oscillators.slice(base);
  assert.equal(score.length, 4);
  audio.setMusicEnabled(false); assert.ok(score.every(node => node.stopped && node.disconnected));
  audio.updateHome(600);
  assert.equal(context.oscillators.length, base + 4);
  audio.setMusicEnabled(true); audio.setMuted(true); audio.updateHome(600);
  assert.equal(context.oscillators.length, base + 4, 'Music on never overrides the master mute');
});

test('deliberate home transport pause freezes its clock and resumes only the current phrase without catchup', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest;
  audio.updateHome(.1);
  const first = context.oscillators.slice(-4), levels = first.map(node => node.connections[0]!.gain.value);
  audio.setPaused(true); await settle();
  assert.ok(first.every(node => node.stopped && node.disconnected));
  const base = context.oscillators.length;
  context.currentTime += 3600;
  audio.updateHome(3600, true); audio.updateHome(.15, true);
  assert.equal(audio.soundState, 'paused'); assert.equal(context.oscillators.length, base);
  assert.equal(context.gains[0]!.gain.value, 0);
  audio.setPaused(false); await audio.start(); audio.updateHome(0);
  assert.equal(context.oscillators.length, base + 4);
  assert.deepEqual(context.oscillators.slice(-4).map(node => node.connections[0]!.gain.value), levels, 'wall time and hidden deltas do not advance home rhythm');
  for (let i = 0; i < 4; i++) {
    audio.updateHome(.1); audio.setPaused(true); audio.updateHome(100, true);
    audio.setPaused(false); await audio.start(); audio.updateHome(0);
  }
  assert.equal(context.oscillators.filter(node => !node.stopped).length, base - 4 + 4, 'only original vehicle oscillators and one score remain live');
});

test('returning home cancels mission cues and pending decodes; starting an exercise replaces the theme clock', async t => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  browser(t, new Map([[radioScript.phase.cabin.file, pending]]));
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation();
  sim.begin(); sim.board(); sim.time = 25;
  audio.update(sim); await settle();
  assert.equal(audio.radioActive, true, 'guided caption waits for its recording');
  audio.updateHome(.1); release(); await settle();
  assert.equal(audio.radioActive, false); assert.equal(context.voices.length, 0);
  assert.equal(audio.caption, captionForPhase('title'));
  assert.ok(context.gains.slice(1, 7).every(node => node.gain.value === 0));
  const homeScore = context.oscillators.slice(-4);
  sim.restart(); sim.begin(); audio.update(sim); await settle();
  assert.ok(homeScore.every(node => node.stopped && node.disconnected));
  assert.equal(audio.caption, exact(openingOrder));
  assert.equal(context.voices.length, 1, 'exercise starts its normal phase cue exactly once');
  const missionVoice = context.voices[0]!;
  audio.restart(); audio.updateHome(.15); await settle();
  assert.ok(missionVoice.stopped && missionVoice.disconnected);
  assert.equal(audio.soundState, 'running'); assert.equal(audio.radioActive, false);
  assert.equal(audio.caption, captionForPhase('title'));
  assert.ok(context.oscillators.slice(-4).every(node => !node.stopped), 'unlocked return home starts a fresh theme without another audio engine');
  assert.equal(MockContext.created, 1);
});


test('fault inspection keeps the current score and vehicle perspective while simulation and new foreground cues stay paused', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const range = new DrivingRange(), mock = MockContext.latest;
  const vehicle = () => ({ training: true, inside: false, powertrain: range.powertrain });
  audio.update(range.audioState, vehicle()); await settle();
  const originalScore = mock.oscillators.slice(-4);
  assert.ok(originalScore.every(oscillator => oscillator.started && !oscillator.stopped));
  mock.voices.forEach(source => source.finish());
  audio.update(range.audioState, vehicle());
  const levels = mock.gains.slice(1, 7).map(node => node.gain.value);
  const engineCutoffs = mock.filters.map(node => node.frequency.value);
  const time = range.time;
  range.paused = true;
  audio.setPaused(true, true);
  audio.update(range.audioState, { ...vehicle(), inside: true, faultInspection: true }, .15); await settle();
  assert.equal(range.time, time);
  assert.equal(mock.state, 'running');
  assert.ok(originalScore.every(oscillator => !oscillator.stopped));
  assert.equal(mock.gains[0]!.gain.value, .48);
  assert.deepEqual(mock.gains.slice(1, 7).map(node => node.gain.value), levels);
  assert.deepEqual(mock.filters.map(node => node.frequency.value), engineCutoffs, 'the inspection camera never remixes active vehicle audio');
  const count = mock.sources.length;
  audio.fireRangeShot(); audio.healthAlert();
  assert.equal(mock.sources.length, count);
  // An inspection must not override a hard transport pause or Sound off.
  audio.setPaused(true); await settle();
  assert.equal(mock.state, 'suspended');
  assert.equal(mock.gains[0]!.gain.value, 0);
  audio.setMuted(true);
  audio.update(range.audioState, { ...vehicle(), inside: true, faultInspection: true }, .15); await settle();
  assert.equal(mock.state, 'suspended');
  assert.equal(mock.gains[1]!.gain.value, 0);
});

test('distant game effects only run beyond LD, alternate captions, pause cleanly and stop at a terminal result', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const range = new DrivingRange(), sim = range.audioState, mock = MockContext.latest;
  const active = { powertrain: range.powertrain, training: true, departureCrossed: true };
  audio.update(sim, { ...active, departureCrossed: false }); await settle();
  mock.voices.forEach(source => source.finish());
  range.speed = 0;
  const base = mock.sources.length;
  sim.time = 20; audio.update(sim, { ...active, departureCrossed: false });
  assert.equal(mock.sources.length, base);
  assert.equal(audio.distantCaption, undefined);
  audio.update(sim, active);
  sim.time = 22.99; audio.update(sim, active);
  assert.equal(mock.sources.length, base);
  sim.time = 23; audio.update(sim, active);
  assert.equal(audio.distantCaption, '[Distant explosions]');
  const first = mock.sources.at(-1)!;
  audio.setPaused(true);
  assert.equal(first.stopped, true);
  assert.equal(audio.distantCaption, undefined);
  audio.setPaused(false); await settle();
  sim.time = 38; audio.update(sim, active);
  assert.equal(audio.distantCaption, '[Distant gunfire]');
  const second = mock.sources.at(-1)!;
  audio.update(sim, { ...active, terminal: true });
  assert.equal(second.stopped, true);
  assert.equal(audio.distantCaption, undefined);
});

test('audio unlocked after gameplay started plays only the still-current opening transmission', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1);
  t.after(() => audio.dispose());
  MockContext.gestureRequired = true;
  await audio.start();
  const range = new DrivingRange();
  audio.update(range.audioState, {training:true});
  assert.equal(audio.soundState, 'blocked');
  assert.equal(audio.caption, exact(playerOpening));
  assert.equal(MockContext.latest.voices.length, 0);
  MockContext.inGesture = true;
  const start = audio.start();
  MockContext.inGesture = false;
  await start; await settle();
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), [playerOpening.id]);
  audio.update(range.audioState, {training:true}); await settle();
  assert.equal(MockContext.latest.voices.length, 1, 'live frames never repeat the recovered line');
});

test('a temporary decode failure does not poison a recording and explicit Retry sound recovers the current line once', async t => {
  const files = browser(t);
  const audio = new SimulationAudio(() => 0, () => 1);
  t.after(() => audio.dispose());
  await audio.start(); await settle();
  MockContext.failDecode = true;
  const range = new DrivingRange();
  const sim = range.audioState;
  audio.update(sim, {training:true}); await settle();
  assert.equal(audio.caption, exact(playerOpening));
  assert.equal(MockContext.latest.voices.length, 0);
  assert.equal(files.filter(file => file === playerOpening.file).length, 1);
  MockContext.failDecode = false;
  for (let i=0;i<10;i++) audio.update(sim, {training:true});
  await settle();
  assert.equal(files.filter(file => file === playerOpening.file).length, 1, 'failed audio does not fetch on every frame');
  await audio.start(true); await settle();
  assert.equal(files.filter(file => file === playerOpening.file).length, 2);
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), [playerOpening.id]);
  await audio.start(true); await settle();
  assert.equal(MockContext.latest.voices.length, 1, 'duplicate retries do not repeat a recovered recording');
});

test('a blocked opening cannot be replayed after entering and leaving fault inspection', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1);
  t.after(() => audio.dispose());
  MockContext.gestureRequired = true;
  await audio.start();
  const range = new DrivingRange();
  audio.update(range.audioState, {training:true});
  range.paused = true;
  audio.update(range.audioState, {training:true, faultInspection:true});
  range.paused = false;
  audio.update(range.audioState, {training:true});
  MockContext.inGesture = true;
  const start = audio.start();
  MockContext.inGesture = false;
  await start; await settle();
  assert.equal(MockContext.latest.voices.length, 0);
});

test('fault inspection preserves existing atmosphere and advances only its distant soundscape clock', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1);
  t.after(() => audio.dispose()); await audio.start();
  const range = new DrivingRange(), context = MockContext.latest;
  const base = { powertrain: range.powertrain, training: true, inside: true };
  audio.update(range.audioState, base); await settle();
  context.voices.forEach(source => source.finish());
  const voiceCount = context.voices.length;
  range.paused = true;
  const before = context.sources.length;
  for(let i=0;i<35;i++) audio.update(range.audioState,{...base,faultInspection:true},.15);
  assert.equal(context.sources.length,before, 'pre-LD inspection has no distant combat sounds');
  assert.equal(range.time,0);
  range.paused = false; audio.update(range.audioState,{...base,departureCrossed:true});
  range.time = 3.1; audio.update(range.audioState,{...base,departureCrossed:true});
  const rumble = context.sources.at(-1)!;
  assert.equal(audio.distantCaption,'[Distant explosions]');
  range.paused = true;
  audio.update(range.audioState,{...base,departureCrossed:true,faultInspection:true},.15);
  assert.equal(rumble.stopped,false,'the inspection layers retain a playing background effect');
  assert.equal(rumble.connections[0]!.gain.value,.135,'the same distant effect level is preserved in the inspection');
  rumble.finish();
  for(let i=0;i<105;i++) audio.update(range.audioState,{...base,departureCrossed:true,faultInspection:true},.15);
  assert.equal(range.time,3.1,'ambient sound never advances exercise time');
  assert.equal(context.voices.length,voiceCount,'paused dialogue and radio cadence do not advance');
  assert.equal(audio.distantCaption,'[Distant gunfire]','late background cues can play while the inspection is open');
  const background = context.sources.at(-1)!;
  audio.setPaused(true); await settle();
  assert.equal(background.stopped,true,'a normal pause is still completely quiet');
  assert.equal(audio.distantCaption,undefined);
  assert.equal(context.state,'suspended');
});

test('recovery acknowledgment plays once in the frozen terminal reveal and cannot restart after pausing', async t => {
  browser(t); const audio = new SimulationAudio(() => 0, () => 1);
  t.after(() => audio.dispose());
  await audio.start();
  const range = new DrivingRange();
  audio.update(range.audioState,{ training: true });
  await settle();
  const sim = new Simulation(); sim.phase = 'cabin'; sim.time = 5;
  const reveal = { terminal: true, recoveryReveal: true };
  audio.update(sim,reveal); await settle();
  const cues = () => MockContext.latest.voices.filter(node => node.buffer?.id === 'recovery_ack');
  assert.equal(cues().length,1); assert.match(audio.caption,/Help is on the way/);
  for (let i=0;i<20;i++) audio.update(sim,reveal);
  assert.equal(cues().length,1); assert.equal(cues()[0]!.stopped,false);
  sim.paused = true; audio.update(sim,reveal);
  assert.equal(cues()[0]!.stopped,true);
  sim.paused = false; audio.update(sim,reveal); await settle();
  assert.equal(cues().length,1);
});

test('rendered contact cue runs through map and fault inspections on the same buffer source, then hard pause is silent', async t => {
  browser(t);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioBufferSourceNode');
  Object.defineProperty(globalThis, 'AudioBufferSourceNode', {configurable: true, value: MockNode});
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'AudioBufferSourceNode', previous); else Reflect.deleteProperty(globalThis, 'AudioBufferSourceNode'); });
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  await audio.start();
  const range = new DrivingRange(), context = MockContext.latest;
  const base = { powertrain: range.powertrain, contact: true, inside: false, departureCrossed: true };
  range.time = 20;
  audio.update(range.audioState, base); await settle();
  const lanes = () => context.sources.filter(source => source.loop && source.buffer?.id === 'contact-r1');
  assert.equal(lanes().length, 1);
  const contact = lanes()[0]!;
  const firstTime = range.time;
  range.paused = true;
  for (let i=0;i<40;i++) audio.update(range.audioState, {...base, inside: i >= 20, faultInspection: true}, .15);
  assert.equal(range.time, firstTime);
  assert.equal(context.state, 'running');
  assert.equal(contact.stopped, false, 'opening map or MFoCS does not seek or restart the active cue');
  range.paused = false;
  range.time += .15;
  audio.update(range.audioState, base);
  assert.equal(lanes().length, 1, 'closing an inspection keeps the same playing position');
  audio.setPaused(true); await settle();
  assert.equal(contact.stopped, true);
  assert.equal(context.state, 'suspended');
});

test('briefing terminal clicks are quiet, rate limited, independent of Music, and canceled at transport boundaries', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose());
  audio.briefingTick(); assert.equal(MockContext.created, 0, 'typing never activates autoplay');
  await audio.start(); audio.setMusicEnabled(false); audio.updateHome(.1);
  const context = MockContext.latest, count = context.sources.length;
  audio.briefingTick(); const click = context.sources.at(-1)!;
  assert.equal(context.sources.length, count + 1);
  assert.ok(click.started && click.buffer?.length === Math.ceil(context.sampleRate * .024));
  assert.equal(click.connections[0], context.gains[0], 'terminal cue uses the existing master');
  assert.ok(Math.max(...click.buffer!.getChannelData!().map(Math.abs)) <= .045);
  for (let i = 0; i < 50; i++) audio.briefingTick();
  assert.equal(context.sources.length, count + 1, 'fast text reveals have no queued backlog');
  context.currentTime += .125; audio.briefingTick();
  assert.equal(click.stopped, true); const next = context.sources.at(-1)!;
  audio.setPaused(true); assert.equal(next.stopped, true);
  context.currentTime += 10; audio.briefingTick(); assert.equal(context.sources.length, count + 2);
  audio.setPaused(false); audio.updateHome(.1); audio.setMuted(true); audio.briefingTick();
  assert.equal(context.sources.length, count + 2, 'Sound off discards text cues');
  audio.setMuted(false); audio.updateHome(.1); audio.briefingTick();
  const beforeHidden = context.sources.length;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: true } });
  t.after(() => { if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document'); });
  context.currentTime += 10; audio.briefingTick(); assert.equal(context.sources.length, beforeHidden);
  audio.restart(); assert.equal(context.sources.at(-1)!.stopped, true);
});


test('mission arrival establishes engines and a single distant report before the one opening radio', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, range = new DrivingRange(() => .2);
  const callsign = audio.missionCallsign;
  const stage = { training: true, staging: true, stagingTime: 0, inside: false, powertrain: range.powertrain };
  audio.update(range.audioState, stage, .1); await settle();
  assert.equal(context.voices.length, 0); assert.equal(audio.radioActive, false);
  assert.ok(context.gains[1]!.gain.value > 0, 'idle engine is audible before radio');
  assert.ok(context.gains[5]!.gain.value > 0, 'nearby mechanical whine adds a vehicle sound field');
  audio.update(range.audioState, { ...stage, stagingTime: .7 }, .1);
  assert.equal(audio.distantCaption, '[Distant gunfire]');
  const sourceCount = context.sources.length;
  for (let i = 0; i < 20; i++) audio.update(range.audioState, { ...stage, stagingTime: 3.9 }, .1);
  assert.equal(context.sources.length, sourceCount, 'arrival report cannot repeat each frame');
  assert.equal(range.time, 0); assert.equal(range.mission.departureCrossed, false);
  audio.update(range.audioState, { ...stage, staging: false }, .1); await settle();
  assert.equal(context.voices.length, 1); assert.equal(audio.missionCallsign, callsign);
  for (let i = 0; i < 30; i++) audio.update(range.audioState, { ...stage, staging: false }, .1);
  await audio.start(true); await settle(); assert.equal(context.voices.length, 1, 'retry does not echo the opening');
});

for (const interruption of ['pause', 'mute', 'restart'] as const) {
  test(`arrival audio cancels cleanly on ${interruption} without delayed reports or old openings`, async t => {
    browser(t);
    const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
    const context = MockContext.latest, range = new DrivingRange(() => .2);
    const stage = { training: true, staging: true, stagingTime: .8 };
    audio.update(range.audioState, stage, .1); const report = context.sources.at(-1)!;
    if (interruption === 'pause') audio.setPaused(true);
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') audio.restart();
    assert.ok(report.stopped && report.disconnected);
    const count = context.sources.length;
    audio.updateBackground(120); await settle(); assert.equal(context.sources.length, count);
    if (interruption === 'restart') { audio.updateHome(.1); assert.equal(context.voices.length, 0); }
    else {
      audio.setPaused(false); audio.setMuted(false);
      audio.update(range.audioState, { ...stage, stagingTime: 3 }, .1); await settle();
      assert.equal(audio.distantCaption, undefined, 'interrupted report does not replay');
      audio.update(range.audioState, { ...stage, staging: false }, .1); await settle();
      assert.equal(context.voices.length, 1, 'radio still releases normally after the visible arrival');
    }
  });
}

test('blocked arrival audio never holds gameplay and activates only its current opening', async t => {
  browser(t); MockContext.resumeFailures = 20;
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const range = new DrivingRange(() => .2);
  audio.update(range.audioState, { training: true, staging: true, stagingTime: 3 }, .1);
  audio.update(range.audioState, { training: true, staging: false }, .1); await settle();
  assert.equal(audio.soundState, 'blocked'); assert.match(audio.caption, /test fire/i);
  MockContext.resumeFailures = 0; await audio.start(); await settle();
  assert.equal(MockContext.latest.voices.length, 1);
  assert.equal(audio.distantCaption, undefined, 'late activation does not resurrect the arrival gunfire');
});

test('hidden audio clock keeps native engines and radio playing while only the score advances', async t => {
  browser(t);
  const audio = new SimulationAudio(() => 0, () => 1); t.after(() => audio.dispose()); await audio.start();
  const range = new DrivingRange(() => .2), context = MockContext.latest;
  audio.update(range.audioState, { training: true, powertrain: range.powertrain }, .1); await settle();
  const voice = context.voices.at(-1)!, loops = context.sources.filter(source => source.loop);
  const time = range.time, count = context.sources.length;
  const beforeDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: true } });
  t.after(() => { if (beforeDocument) Object.defineProperty(globalThis, 'document', beforeDocument); else Reflect.deleteProperty(globalThis, 'document'); });
  const levels = context.oscillators.slice(-4).map(node => node.connections[0]!.gain.value);
  for (let i = 0; i < 30; i++) { context.currentTime += .1; audio.updateBackground(.1); }
  assert.equal(context.state, 'running'); assert.equal(voice.stopped, false);
  assert.ok(loops.every(source => !source.stopped));
  assert.equal(range.time, time); assert.equal(context.sources.length, count, 'background cannot queue dialogue, shots or extra synth voices');
  assert.notDeepEqual(context.oscillators.slice(-4).map(node => node.connections[0]!.gain.value), levels, 'fallback music changes over its audio clock');
  voice.finish(); audio.updateBackground(.1);
  assert.equal(context.voices.length, 1); assert.equal(audio.radioActive, false);
  for (const interruption of ['pause', 'mute'] as const) {
    if (interruption === 'pause') audio.setPaused(true); else audio.setMuted(true);
    const interruptedCount = context.sources.length; audio.updateBackground(300);
    assert.equal(context.state, 'suspended'); assert.equal(context.sources.length, interruptedCount);
  }
});

test('home background audio progresses independently and never creates a mission or radio cue', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start(); audio.updateHome(.1);
  const context = MockContext.latest, count = context.sources.length;
  const levels = context.oscillators.slice(-4).map(node => node.connections[0]!.gain.value);
  for (let i = 0; i < 15; i++) audio.updateBackground(.1);
  assert.notDeepEqual(context.oscillators.slice(-4).map(node => node.connections[0]!.gain.value), levels);
  assert.equal(context.sources.length, count); assert.equal(context.voices.length, 0); assert.equal(audio.caption, captionForPhase('title'));
  audio.setMusicEnabled(false); audio.updateBackground(10);
  assert.ok(context.oscillators.slice(-4).every(node => node.stopped));
});
