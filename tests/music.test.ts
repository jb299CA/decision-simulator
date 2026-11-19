import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MUSIC_PROFILES, musicLevels, musicScene, percussionTexture, ProceduralMusic, RenderedScore, SCORE_ASSETS, SCORE_MIX, type MusicFrame } from '../src/music.ts';

class Parameter {
  value = 0;
  events: { value: number; time: number }[] = [];
  cancelled = false;
  setTargetAtTime(value: number, time: number): void { this.value = value; this.events.push({ value, time }); }
  setValueAtTime(value: number, time: number): void { this.value = value; this.events.push({ value, time }); }
  cancelScheduledValues(): void { this.cancelled = true; }
}
class Node {
  gain = new Parameter(); frequency = new Parameter();
  type = ''; started = false; stopped = false; disconnected = false; startArguments: unknown[][] = [];
  setPeriodicWave(): void { this.type = 'custom'; }
  connections: Node[] = [];
  connect(node: Node): Node { this.connections.push(node); return node; }
  start(...args: unknown[]): void { this.started = true; this.startArguments.push(args); }
  stop(): void { this.stopped = true; }
  disconnect(): void { this.disconnected = true; }
}
class Context {
  currentTime = 7;
  tones: Node[] = []; gains: Node[] = [];
  noise: Node[] = []; sampleRate = 16000;
  createBuffer(_channels:number, length:number): object { const data=new Float32Array(length); return { getChannelData:()=>data }; }
  createBufferSource(): Node { const n=new Node(); this.noise.push(n); return n; }
  createOscillator(): Node { const node = new Node(); this.tones.push(node); return node; }
  waves = 0;
  createPeriodicWave(): object { this.waves++; return {}; }
  createGain(): Node { const node = new Node(); this.gains.push(node); return node; }
}
const frame: MusicFrame = { time: .25, scene: 'practice', audible: true, ducked: false };
const setup = () => {
  const context = new Context(), destination = new Node();
  const score = new ProceduralMusic(context as unknown as AudioContext, destination as unknown as AudioNode);
  return { context, score };
};

test('guided and range scenarios vary score with health priority and restrained resolution', () => {
  const calm = { phase: 'cabin' as const, moving: false, faultSeverity: 0, alert: false };
  assert.equal(musicScene(calm), 'practice');
  assert.equal(musicScene({ ...calm, moving: true }), 'movement');
  assert.equal(musicScene({ ...calm, moving: true, training: true }), 'practice');
  assert.equal(musicScene({ ...calm, contact: true }), 'contact');
  assert.equal(musicScene({ ...calm, contact: true, health: 'warning' }), 'contact');
  assert.equal(musicScene({ ...calm, contact: true, health: 'critical' }), 'contact');
  assert.equal(musicScene({ ...calm, alert: true, faultSeverity: .6 }), 'warning');
  assert.equal(musicScene({ ...calm, alert: true, faultSeverity: .95 }), 'severe');
  for (const phase of ['secured', 'service', 'debrief'] as const) assert.equal(musicScene({ ...calm, phase, alert: true }), 'resolution');
  assert.equal(musicScene({ ...calm, health: 'broken', terminal: true }), 'resolution');
  assert.equal(MUSIC_PROFILES.resolution.drum, 0);
  assert.ok(MUSIC_PROFILES.contact.beatsPerMinute > MUSIC_PROFILES.practice.beatsPerMinute);
  assert.notDeepEqual(MUSIC_PROFILES.warning.notes, MUSIC_PROFILES.movement.notes);
  assert.ok(MUSIC_PROFILES.home.bed > MUSIC_PROFILES.practice.bed, 'title music remains distinct and clearly audible');
  for (const profile of Object.values(MUSIC_PROFILES)) assert.ok(profile.bed <= .12 && profile.drum < .03, 'music uses a bounded mix');
});

test('score envelopes use simulation time, stay finite and duck underneath priority cues', () => {
  const full = musicLevels(frame), ducked = musicLevels({ ...frame, ducked: true });
  assert.ok(full.bed > 0 && full.drum > 0);
  assert.ok(ducked.bed < full.bed * .4 && ducked.drum < full.drum * .4);
  assert.ok(ducked.melody > full.melody * .3, 'a long crew call leaves a faint identifiable phrase');
  assert.deepEqual(musicLevels(frame), full, 'same sim instant gives same envelope');
  for (const time of [NaN, Infinity, -1]) assert.deepEqual(musicLevels({ ...frame, time }), { bed: 0, melody: 0, melodyFrequency: 440, drum: 0, frequency: 180 });
  assert.equal(musicLevels({ ...frame, audible: false }).bed, 0);
  assert.equal(musicLevels({ ...frame, scene: 'resolution' }).drum, 0);
  for (const [scene, profile] of Object.entries(MUSIC_PROFILES)) {
    assert.ok(profile.bed * 1.89 + profile.drum < .26, 'even coincident score peaks stay below .26 before the unchanged master');
    const normal = musicLevels({ ...frame, scene: scene as MusicFrame['scene'] });
    const priority = musicLevels({ ...frame, scene: scene as MusicFrame['scene'], ducked: true });
    assert.ok(Math.abs(priority.bed / normal.bed - .35) < 1e-9, 'all scenes give foreground speech a 9 dB reduction');
    const alert = musicLevels({ ...frame, scene: scene as MusicFrame['scene'], priorityAlert: true });
    assert.ok(alert.bed < normal.bed * .13 && alert.melody <= normal.melody * .13, 'instrument and breakdown cues receive deeper immediate headroom');
  }
});

test('synthesis creates only current continuous tones without future note starts or catchup bursts', () => {
  const { context, score } = setup();
  score.update({ ...frame, audible: false }); assert.equal(context.tones.length, 0);
  score.update(frame); assert.equal(context.tones.length, 4);
  score.update({ ...frame, time: 6000, scene: 'contact' });
  assert.equal(context.tones.length, 4, 'a large sim-time jump changes current tones without adding skipped beats');
  assert.ok(context.tones.every(tone => tone.startArguments.length === 1 && tone.startArguments[0]!.length === 0));
  assert.ok([...context.tones.flatMap(tone => tone.frequency.events), ...context.gains.flatMap(node => node.gain.events)].every(event => event.time === context.currentTime), 'all parameter changes begin now');
  const gains = context.gains.map(node => node.gain.value);
  context.currentTime = 500; score.update({ ...frame, time: 6000, scene: 'contact' });
  assert.deepEqual(context.gains.map(node => node.gain.value), gains, 'wall-clock alone cannot advance rhythm');
  const beforeDuck = context.gains[0]!.gain.value; score.duck();
  assert.ok(context.gains[0]!.gain.value < beforeDuck * .4);
  score.dispose();
});

test('the score has a sparse midrange phrase and soft audible-band percussion rather than only a bass bed', () => {
  for (const scene of Object.keys(MUSIC_PROFILES) as MusicFrame['scene'][]) {
    const { context, score } = setup();
    const pitches = new Set<number>(); let rests = 0, midrangeEnergy = 0, pulses = 0;
    for (let time = .1; time < 20; time += .1) {
      score.update({ ...frame, scene, time });
      const melody = context.tones[2]!, gain = context.gains[2]!.gain.value;
      if (gain > .002) {
        assert.ok(melody.frequency.value >= 300 && melody.frequency.value <= 1000);
        pitches.add(melody.frequency.value); midrangeEnergy += gain ** 2;
      } else rests++;
      if (context.gains[3]!.gain.value > .001) {
        pulses++; assert.ok(context.tones[3]!.frequency.value >= (scene === 'contact' ? 98 : 180));
      }
    }
    assert.ok(pitches.size >= 3 && rests > 15, `${scene}: a shaped phrase has distinct notes and rests`);
    assert.ok(midrangeEnergy > (scene === 'home' ? .004 : .015), `${scene}: actual synthesis retains quiet midrange musical energy`);
    assert.equal(context.tones.length, 4, 'a full phrase reuses a bounded set of sources');
    assert.equal(pulses > 0, scene !== 'resolution');
    score.dispose();
  }
});

test('every interruption stops and disconnects all active sources; resume has no queued notes', () => {
  for (const interruption of ['silence', 'stop', 'dispose'] as const) {
    const { context, score } = setup(); score.update(frame);
    const original = [...context.tones];
    if (interruption === 'silence') score.update({ ...frame, audible: false });
    if (interruption === 'stop') score.stop();
    if (interruption === 'dispose') score.dispose();
    assert.ok(original.every(tone => tone.stopped && tone.disconnected));
    assert.ok(context.gains.every(node => node.disconnected && node.gain.value === 0 && node.gain.cancelled));
    score.duck(); assert.equal(context.tones.length, 4, 'an interrupted score cannot be resurrected by a late cue');
    score.update({ ...frame, time: 30 });
    assert.equal(context.tones.length, interruption === 'dispose' ? 4 : 8, 'resume creates only current tones');
    score.dispose();
  }
});

test('subtle home march has a snare cadence and restrained lead; contact doubles the drive', () => {
  const home={...frame,scene:'home' as const};
  const contact={...frame,scene:'contact' as const};
  const homeBeat=60/MUSIC_PROFILES.home.beatsPerMinute;
  const combatBeat=60/MUSIC_PROFILES.contact.beatsPerMinute;
  const homeSnare=percussionTexture({...home,time:homeBeat+.017});
  assert.ok(homeSnare > .025 && homeSnare > percussionTexture({...home,time:.017}));
  assert.ok(percussionTexture({...home,time:3.75*homeBeat+.015}) > .01);
  assert.equal(musicLevels({...home,time:homeBeat+.2}).melody,0);
  assert.ok(musicLevels({...home,time:2*homeBeat+.21}).melody < .03);
  assert.ok(percussionTexture({...contact,time:.5*combatBeat+.02}) > .01);
  assert.ok(musicLevels({...contact,time:.16}).frequency < 145);
  assert.equal(percussionTexture({...frame,time:.015}),0);
  assert.ok(percussionTexture({...contact,time:.015,ducked:true}) < percussionTexture({...contact,time:.015})*.36);
});

test('textured drums reuse one source and stop on mute or scene change', () => {
  const {context,score}=setup();
  score.update({...frame,scene:'home',time:.013});
  const noise=context.noise[0]!; assert.ok(noise.started);
  score.update({...frame,scene:'home',time:1.5}); assert.equal(context.waves,1);
  score.update({...frame,scene:'contact',time:.02});
  assert.equal(context.noise.length,1); assert.equal(context.tones[3]!.type,'sine');
  score.update(frame); assert.ok(noise.stopped && noise.disconnected);
  score.update({...frame,scene:'contact',time:1.5}); assert.equal(context.noise.length,2);
  score.update({...frame,audible:false}); assert.ok(context.noise[1]!.stopped && context.noise[1]!.disconnected);
  score.dispose();
});

const settleScore = () => new Promise<void>(resolve => setImmediate(resolve));
const rendered = (load: (url: string) => Promise<ArrayBuffer>, now = () => Date.now()) => {
  const context = Object.assign(new Context(), { state: 'running', decodeAudioData: async (data: ArrayBuffer) => ({ duration: data.byteLength }) });
  const score = new RenderedScore(context as unknown as AudioContext, new Node() as unknown as AudioNode, load, now);
  return { context, score };
};

test('current score downloads first, starts as soon as decoded, and keeps the active cue through a pending transition', async () => {
  const releases = new Map<string, (data: ArrayBuffer) => void>();
  const { context, score } = rendered(url => new Promise(resolve => releases.set(url, resolve)));
  const lanes = () => context.noise.filter(node => node.startArguments.some(args => args.length === 2));
  const home = { ...frame, scene: 'home' as const, time: 2.2 };
  score.update(home);
  assert.equal(score.preparing, true);
  assert.equal(context.tones.length, 4, 'pending downloads already have an audible original music bridge');
  assert.ok(context.gains.some(node => node.gain.value > 0));
  await settleScore();
  assert.deepEqual([...releases.keys()], [SCORE_ASSETS.assembly], 'the first cue does not compete with two speculative WAVs');
  score.update({ ...home, time: 3.2 });
  releases.get(SCORE_ASSETS.assembly)!(new ArrayBuffer(22));
  await settleScore();
  assert.equal(score.preparing, false);
  assert.deepEqual(lanes()[0]!.startArguments, [[0, 0]], 'decode immediately starts the cue at its opening rather than skipping ahead');
  const homeGain = lanes()[0]!.connections[0]!;
  assert.equal(homeGain.gain.value, SCORE_MIX.home.gain);
  const events = homeGain.gain.events.length;
  for (let i=0;i<60;i++) score.update({ ...home, time: 3.21+i*.02 });
  assert.equal(homeGain.gain.events.length, events, 'identical frames never pile up gain automation');
  score.duck();
  assert.equal(homeGain.gain.value, SCORE_MIX.home.gain * .30);

  score.update({ ...home, scene: 'contact', time: 200 });
  assert.equal(lanes()[0]!.stopped, false, 'no audible hole while the next cue is decoding');
  await settleScore();
  assert.ok(releases.has(SCORE_ASSETS.contact), 'current contact is promoted even while the transit prefetch is pending');
  releases.get(SCORE_ASSETS.transit)!(new ArrayBuffer(17));
  await settleScore();
  assert.equal(lanes().length, 1, 'late completion of a stale scene never starts it');
  score.update({ ...home, scene: 'contact', time: 201 });
  releases.get(SCORE_ASSETS.contact)!(new ArrayBuffer(17));
  await settleScore();
  const contact = lanes()[1]!, contactGain = contact.connections[0]!;
  assert.deepEqual(contact.startArguments, [[0, 0]]);
  assert.equal(homeGain.gain.value, 0, 'old lane fades only after the replacement has started');
  score.duck(true);
  assert.ok(contactGain.gain.value <= .06);
  score.update({ ...home, scene: 'contact', time: 203.5 });
  score.stop();
  assert.ok(context.noise.every(node => node.stopped && node.disconnected));
  score.update({ ...home, scene: 'contact', time: 203.5 });
  assert.deepEqual(lanes()[2]!.startArguments, [[0, 2.5]], 'manual pause resumes its previous position');
  score.dispose();
  score.update(home);
  assert.equal(lanes().length, 3, 'disposal never starts a late lane');
});

test('a transient fetch failure retries with a bounded delay and a muted decode never resurrects playback', async () => {
  let time = 0, attempts = 0;
  let complete!: (data: ArrayBuffer) => void;
  const { context, score } = rendered(url => {
    if (url !== SCORE_ASSETS.assembly) return Promise.resolve(new ArrayBuffer(17));
    if (++attempts === 1) return Promise.reject(new Error('temporary network interruption'));
    return new Promise(resolve => { complete = resolve; });
  }, () => time);
  const home = { ...frame, scene: 'home' as const };
  score.update(home);
  await settleScore();
  assert.equal(attempts,1);
  assert.ok(context.tones.length > 0, 'a pending or failed first cue always has a temporary music bridge');
  score.update(home);
  await settleScore();
  assert.equal(attempts,1, 'frame updates do not flood the network during backoff');
  time = 1001;
  score.update(home);
  await settleScore();
  assert.equal(attempts,2);
  score.stop();
  complete(new ArrayBuffer(22));
  await settleScore();
  assert.ok(context.noise.every(source => source.stopped), 'muted playback stays quiet after the decoder completes');
  score.update({ ...home, time: 4 });
  assert.deepEqual(context.noise.at(-1)!.startArguments, [[0, 0]], 'music restarts from the cached original track without a fresh fetch');
  assert.equal(attempts,2);
  score.dispose();
});

test('bundled score mix remains audible above a very quiet bed without exceeding reserved headroom', () => {
  for (const scene of ['home', 'practice', 'movement', 'contact'] as const) {
    const mix = SCORE_MIX[scene], bytes = readFileSync(new URL(`../public${SCORE_ASSETS[mix.cue]}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    let data = 12;
    while (bytes.toString('ascii', data, data + 4) !== 'data') data += 8 + bytes.readUInt32LE(data + 4);
    const size = bytes.readUInt32LE(data + 4); data += 8;
    let energy = 0, peak = 0;
    for (let offset = data; offset < data + size; offset += 2) {
      const sample = bytes.readInt16LE(offset) / 32768;
      energy += sample * sample; peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(energy / (size / 2)) * mix.gain * .48;
    assert.ok(rms >= .012, `${scene}: music RMS exceeds -38.4 dBFS after the master`);
    assert.ok(rms < .03, `${scene}: music remains a restrained background score`);
    assert.ok(peak * mix.gain * .48 < .25, `${scene}: score peaks retain foreground headroom`);
  }
});


test('slow initial score uses current music immediately but pause cancels the bridge and late decode', async () => {
  let complete!: (data: ArrayBuffer) => void;
  const { context, score } = rendered(() => new Promise(resolve => { complete = resolve; }));
  score.update({ ...frame, scene: 'home' }); await settleScore();
  const bridge = [...context.tones], texture = [...context.noise];
  assert.equal(bridge.length, 4);
  assert.ok(context.gains.some(node => node.gain.value > 0));
  score.stop();
  assert.ok([...bridge, ...texture].every(source => source.stopped && source.disconnected));
  complete(new ArrayBuffer(22)); await settleScore();
  assert.equal(context.noise.length, texture.length, 'the completed download cannot start after pause');
  score.update({ ...frame, scene: 'home', time: 2 });
  const lane = context.noise.at(-1)!;
  assert.deepEqual(lane.startArguments, [[0, 0]], 'resume starts just the current cached cue');
  assert.equal(context.tones.length, bridge.length, 'cached playback does not restart the bridge');
  score.dispose();
});
