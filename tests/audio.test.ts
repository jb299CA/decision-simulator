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
  disconnected = false;
  onended: (() => void) | null = null;
  connections: MockNode[] = [];
  connect(node: MockNode): MockNode { this.connections.push(node); return node; }
  disconnect(): void { this.disconnected = true; }
  start(): void { this.started = true; }
  stop(): void { this.stopped = true; this.onended?.(); }
  finish(): void { this.onended?.(); }
}

class MockContext {
  static latest: MockContext;
  static decodeGate?: Promise<void>;
  static failDecode = false;
  static resumeGate?: Promise<void>;
  static gestureRequired = false;
  static inGesture = false;
  static resumeFailures = 0;
  static created = 0;
  static sampleRate = 1000;
  state = 'suspended';
  currentTime = 7;
  resumeCalls = 0;
  gestureResumes = 0;
  sampleRate = MockContext.sampleRate;
  destination = new MockNode();
  gains: MockNode[] = [];
  sources: MockNode[] = [];
  oscillators: MockNode[] = [];
  constructor() { MockContext.latest = this; MockContext.created++; }
  createGain(): MockNode { const node = new MockNode(); this.gains.push(node); return node; }
  createOscillator(): MockNode { const node = new MockNode(); this.sources.push(node); this.oscillators.push(node); return node; }
  createBufferSource(): MockNode { const node = new MockNode(); this.sources.push(node); return node; }
  createBiquadFilter(): MockNode { return new MockNode(); }
  createBuffer(_channels: number, length: number): { length: number; getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  async decodeAudioData(bytes: ArrayBuffer): Promise<{ id: string }> {
    await MockContext.decodeGate;
    if (MockContext.failDecode) throw new Error('unsupported recording');
    return { id: new TextDecoder().decode(bytes) };
  }
  async resume(): Promise<void> {
    this.resumeCalls++;
    if (MockContext.inGesture) this.gestureResumes++;
    if (MockContext.gestureRequired && !MockContext.inGesture) throw new Error('device requires another tap');
    if (MockContext.resumeFailures > 0) { MockContext.resumeFailures--; throw new Error('device requires another tap'); }
    if (MockContext.resumeGate) await MockContext.resumeGate;
    if (this.state !== 'closed') this.state = 'running';
  }
  async suspend(): Promise<void> { this.state = 'suspended'; }
  async close(): Promise<void> { this.state = 'closed'; }
  get voices(): MockNode[] { return this.sources.filter(source => source.started && source.buffer?.id); }
}

function browser(t: { after: (fn: () => void) => void }, gates = new Map<string, Promise<void>>()): string[] {
  const beforeWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const beforeFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const files: string[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: MockContext } });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (file: string) => {
    files.push(file);
    await gates.get(file);
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(file.split('/').at(-1)!.replace(/\.(wav|mp3)$/, '')).buffer };
  } });
  MockContext.decodeGate = undefined; MockContext.failDecode = false; MockContext.resumeGate = undefined;
  MockContext.gestureRequired = false; MockContext.inGesture = false; MockContext.resumeFailures = 0;
  MockContext.created = 0;
  MockContext.sampleRate = 1000;
  t.after(() => {
    if (beforeWindow) Object.defineProperty(globalThis, 'window', beforeWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (beforeFetch) Object.defineProperty(globalThis, 'fetch', beforeFetch); else Reflect.deleteProperty(globalThis, 'fetch');
    MockContext.decodeGate = undefined; MockContext.failDecode = false; MockContext.resumeGate = undefined;
    MockContext.gestureRequired = false; MockContext.inGesture = false; MockContext.resumeFailures = 0;
    MockContext.sampleRate = 1000;
  });
  return files;
}
const settle = async (): Promise<void> => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const update = async (audio: SimulationAudio, sim: Simulation): Promise<void> => { audio.update(sim); await settle(); };
const exact = (cue: { speaker: string; text: string }): string => `${cue.speaker}: ${cue.text}`;

// These assertions bind captions to the same source as the bundled recordings.
test('every recorded phase has its exact speaker and dialogue caption', () => {
  for (const [phase, cue] of Object.entries(radioScript.phase)) {
    assert.equal(captionForPhase(phase as keyof typeof radioScript.phase), exact(cue));
  }
  assert.match(captionForPhase('secured'), /Engine off/);
  assert.match(captionForPhase('debrief'), /repair and verification/);
});

test('unsupported audio keeps exact captions and simulation usable', async () => {
  const audio = new SimulationAudio();
  await audio.start();
  assert.equal(audio.soundState, 'unsupported');
  const sim = new Simulation(); sim.begin(); await update(audio, sim);
  assert.equal(audio.caption, captionForPhase('exterior'));
  audio.setPaused(true); audio.setMuted(true); audio.restart(); audio.dispose();
});

test('a start tap unlocks audio synchronously after the paused home frame', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
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
    const audio = new SimulationAudio(); t.after(() => audio.dispose());
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
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

test('local recordings load progressively; title is silent; phase priority and frozen debrief lifecycle work', async t => {
  const files = browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
  await audio.start();
  const context = MockContext.latest;
  assert.equal(files.length, 1, 'startup warms only the exterior recording');
  assert.equal(files[0], radioScript.phase.exterior.file);
  assert.ok(files.every(file => file.startsWith('/audio/') && /\.(wav|mp3)$/.test(file)));
  const sim = new Simulation(); await update(audio, sim);
  assert.equal(context.voices.length, 0);
  assert.equal(context.gains[0]!.gain.value, 0, 'no title ambience');
  sim.begin(); await update(audio, sim);
  const exterior = context.voices.at(-1)!;
  assert.equal(exterior.buffer?.id, 'crew_ready');
  assert.equal(audio.caption, captionForPhase('exterior'));
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
  assert.doesNotMatch(audio.caption, /RAVEN 6/);
});

test('current cue plays while an unrelated startup fetch is still pending', async t => {
  let release!: () => void;
  const unrelated = new Promise<void>(resolve => { release = resolve; });
  const files = browser(t, new Map([[radioScript.phase.exterior.file, unrelated]]));
  const audio = new SimulationAudio(); t.after(() => { release(); audio.dispose(); });
  await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board();
  await update(audio, sim);
  assert.deepEqual(files, [radioScript.phase.exterior.file, radioScript.phase.cabin.file]);
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), ['moving'],
    'the cabin line never waits for the exterior download');
  release(); await settle();
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), ['moving'],
    'late exterior completion only fills the cache');
});

test('fetch/decode concurrency is bounded and latest phase wins queued priority over prefetch', async t => {
  const releases = new Map<string, () => void>();
  const gates = new Map<string, Promise<void>>();
  for (const cue of Object.values(radioScript.phase)) {
    gates.set(cue.file, new Promise<void>(resolve => { releases.set(cue.file, resolve); }));
  }
  const files = browser(t, gates);
  const audio = new SimulationAudio();
  t.after(() => { audio.dispose(); for (const release of releases.values()) release(); });
  await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  sim.advance(); await update(audio, sim);
  sim.advance(); await update(audio, sim);
  assert.equal(files.length, 2, 'only one speculative job plus one demanded job runs');
  releases.get(radioScript.phase.cabin.file)!(); await settle();
  assert.deepEqual(files, [radioScript.phase.exterior.file, radioScript.phase.cabin.file, radioScript.phase.manifold.file],
    'new current phase gets the free slot before speculative turbine or skipped feed');
  assert.equal(MockContext.latest.voices.length, 0, 'a completed obsolete phase cannot speak');
  releases.get(radioScript.phase.manifold.file)!(); await settle();
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), ['manifold']);
  assert.equal(files.length, 3, 'a stalled speculative exterior leaves no second speculative job running');
  releases.get(radioScript.phase.exterior.file)!(); await settle();
  assert.equal(files.at(-1), radioScript.phase.turbine.file, 'next relevant chapter warms once capacity is free');
  await update(audio, sim); await audio.start(); await update(audio, sim);
  assert.equal(files.filter(file => file === radioScript.phase.manifold.file).length, 1, 'per-cue demand is cached');
  assert.equal(files.filter(file => file === radioScript.phase.turbine.file).length, 1, 'prefetch promises are shared');
});

test('ambient net traffic uses simulation time, never overlaps, and ducks the vehicle', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest;
  const sim = new Simulation(); sim.begin(); sim.board(); sim.speed = 1; await update(audio, sim);
  context.voices.at(-1)!.finish(); await update(audio, sim);
  const normalEngine = context.gains[1]!.gain.value;
  sim.time = 13.9; await update(audio, sim);
  assert.equal(context.voices.length, 1, 'no ambient cue before cadence');
  sim.time = 14; await update(audio, sim);
  const ambient = context.voices.at(-1)!;
  assert.equal(ambient.buffer?.id, radioScript.ambient[0].id);
  assert.equal(audio.caption, exact(radioScript.ambient[0]));
  assert.ok(context.gains[1]!.gain.value < normalEngine, 'vehicle mix ducks under voice');
  sim.time = 50; await update(audio, sim);
  assert.equal(context.voices.length, 2, 'ongoing transmission prevents overlap');
  ambient.finish(); await update(audio, sim);
  assert.equal(context.voices.length, 2, 'leave a simulation-time gap after the transmission');
  sim.time = 51.5; await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, radioScript.ambient[1].id);
  sim.phase = 'halted'; sim.speed = 0; await update(audio, sim); context.voices.at(-1)!.finish();
  const count = context.voices.length;
  sim.time = 100; await update(audio, sim);
  assert.equal(context.voices.length, count, 'halted vehicles do not generate movement radio');
});

test('pause, mute, restart and dispose cancel voice without interrupted or skipped cue replay', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
  assert.equal(context.voices.at(-1)!.buffer?.id, 'crew_ready');
  audio.dispose();
  assert.equal(context.state, 'closed');
  assert.ok(context.sources.every(source => source.stopped || (source.buffer?.id && source !== context.voices.at(-1))));
  const count = context.voices.length; await update(audio, sim); await audio.start();
  assert.equal(context.voices.length, count, 'disposed audio cannot reactivate');
});

test('reasserting pause suspends a browser-restored context without resetting cues', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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

test('radio squelches release naturally and stay bounded across rapid phase changes', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(); sim.begin();
  const squelches = () => context.sources.filter(source => source.started && !source.loop && source.buffer?.length === 65);
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
  assert.equal(active.length, 2, 'rapid changes cannot create an unbounded transient graph');
  assert.equal(squelches().length, 3, 'finished chirp releases capacity, and only two replacements remain active');
  active.forEach(source => source.finish());
  sim.phase = 'feed'; await update(audio, sim);
  assert.equal(squelches().length, 4, 'natural completion releases capacity for future radio feedback');
  assert.ok(context.oscillators.every(source => !source.stopped), 'radio cleanup preserves continuous vehicle sound');
});

for (const interruption of ['pause', 'mute', 'restart', 'dispose'] as const) {
  test(`radio squelches stop and disconnect on ${interruption} without stale replay`, async t => {
    browser(t);
    const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
    const context = MockContext.latest, engineLoops = context.oscillators.slice(), sim = new Simulation(); sim.begin(); await update(audio, sim);
    const squelches = () => context.sources.filter(source => source.started && !source.loop && source.buffer?.length === 65);
    const chirps = squelches();
    assert.equal(chirps.length, 1);
    if (interruption === 'pause') { sim.paused = true; audio.setPaused(true); }
    if (interruption === 'mute') audio.setMuted(true);
    if (interruption === 'restart') { audio.restart(); sim.restart(); }
    if (interruption === 'dispose') audio.dispose();
    assert.ok(chirps.every(source => source.stopped && source.disconnected));
    const count = squelches().length;
    sim.paused = false; audio.setPaused(false); audio.setMuted(false); await update(audio, sim);
    assert.equal(squelches().length, count, 'resuming cannot recreate the interrupted chirp');
    if (interruption !== 'dispose') assert.ok(engineLoops.every(source => !source.stopped), 'engine loops survive interruption');
  });
}

for (const interruption of ['pause', 'mute', 'restart', 'dispose'] as const) {
  test(`decode completing after ${interruption} cannot play a stale phase`, async t => {
    browser(t);
    let release!: () => void;
    MockContext.decodeGate = new Promise<void>(resolve => { release = resolve; });
    const audio = new SimulationAudio(); t.after(() => audio.dispose());
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
  const starting = audio.start();
  const sim = new Simulation(); sim.begin(); await update(audio, sim); sim.board(); await update(audio, sim);
  release(); await starting; await settle();
  assert.deepEqual(MockContext.latest.voices.map(source => source.buffer?.id), ['moving']);
  audio.dispose();
  MockContext.decodeGate = undefined; MockContext.failDecode = true;
  const fallback = new SimulationAudio(); t.after(() => fallback.dispose()); await fallback.start();
  await update(fallback, sim);
  assert.equal(MockContext.latest.voices.length, 0);
  assert.equal(fallback.caption, captionForPhase('cabin'));
  sim.time = 22; await update(fallback, sim);
  assert.equal(fallback.caption, exact(radioScript.ambient[0]), 'missing audio still captions ambient cue');
});


test('moving chapter transitions preserve radio cadence and defer due traffic behind priority dialogue', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest;
  const sim = new Simulation(); sim.begin(); sim.board(); await update(audio, sim);
  context.voices.at(-1)!.finish();
  for (const [time, phase] of [[4, 'feed'], [8, 'manifold'], [12, 'turbine']] as const) {
    sim.time = time; sim.phase = phase; await update(audio, sim);
    assert.equal(context.voices.at(-1)!.buffer?.id, radioScript.phase[phase].id);
    context.voices.at(-1)!.finish();
  }
  sim.time = 14; await update(audio, sim);
  assert.equal(context.voices.at(-1)!.buffer?.id, radioScript.ambient[0].id,
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
  assert.equal(context.voices.at(-1)!.buffer?.id, radioScript.ambient[1].id);
  context.voices.at(-1)!.finish();
  sim.time = 48; await update(audio, sim);
  assert.equal(context.voices.length, count + 1, 'only one ambient cue is emitted after deferral, without backlog');
});

test('range report is immediate, bounded, reusable and dropped while muted or paused', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
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

test('range ambience captions follow actual motion while recorded dialogue remains exact', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
  for (let i = 0; i < 80; i++) range.tick(.025, { throttle: 0, steer: 0, aim: 0, fire: false });
  audio.update(range.audioState, { powertrain: range.powertrain, inside: true });
  assert.equal(range.mission.status, 'complete');
  assert.equal(context.gains[1]!.gain.value, 0); assert.equal(context.gains[5]!.gain.value, 0); assert.equal(context.gains[6]!.gain.value, 0);
  assert.match(audio.caption, /Engine off.*vehicle stationary/);
});


test('independent music control preserves engine, radio and reports; transport clears every score source', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
  const context = MockContext.latest, sim = new Simulation(), baseGains = context.gains.length;
  sim.begin(); sim.board(); sim.time = .25; await update(audio, sim);
  const musicGain = context.gains[baseGains]!;
  const speakingLevel = musicGain.gain.value;
  context.voices.at(-1)!.finish(); await update(audio, sim);
  const normalLevel = musicGain.gain.value;
  assert.ok(normalLevel > speakingLevel * 5, 'priority radio dominates the score');
  const caption = audio.caption; audio.healthAlert();
  assert.ok(musicGain.gain.value < normalLevel * .2, 'health cue ducks in the calling frame');
  assert.equal(audio.caption, caption);
  context.sources.at(-1)!.finish(); await update(audio, sim);
  assert.equal(musicGain.gain.value, normalLevel);
});

const breakdownCues = (context: MockContext): MockNode[] => context.sources.filter(source => source.buffer?.length === 2700);

test('breakdown emits one original mechanical shutdown and captions the frozen terminal state', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
    const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
    const audio = new SimulationAudio(); t.after(() => audio.dispose());
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose());
  const starting = audio.start(), sim = new Simulation(); sim.begin(); sim.board(); sim.engine = false;
  audio.update(sim, { breakdown: true });
  assert.equal(breakdownCues(MockContext.latest).length, 0);
  release(); await starting; await settle();
  audio.update(sim, { breakdown: true });
  assert.equal(breakdownCues(MockContext.latest).length, 0);
});

test('breakdown source ducks music for its lifetime and releases ducking after natural completion', async t => {
  browser(t);
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
  const sim = new Simulation(); sim.begin(); sim.board(); sim.time = .25;
  const context = MockContext.latest, baseGains = context.gains.length;
  audio.update(sim, { health: 'broken', terminal: true }); await settle();
  context.voices.at(-1)!.finish(); audio.update(sim, { health: 'broken', terminal: true });
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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

test('weapon reports vary subtly, taper to silence and retain bounded worst-case overlap at full sample rate', async t => {
  browser(t); MockContext.sampleRate = 48000;
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
  assert.ok(peak * summedGain * .48 < .72, 'four coincident reports leave headroom below the unchanged master ceiling');
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
  const audio = new SimulationAudio(); t.after(() => audio.dispose()); await audio.start();
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
