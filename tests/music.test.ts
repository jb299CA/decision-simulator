import assert from 'node:assert/strict';
import test from 'node:test';
import { MUSIC_PROFILES, musicLevels, musicScene, ProceduralMusic, type MusicFrame } from '../src/music.ts';

class Parameter {
  value = 0;
  events: { value: number; time: number }[] = [];
  cancelled = false;
  setTargetAtTime(value: number, time: number): void { this.value = value; this.events.push({ value, time }); }
  cancelScheduledValues(): void { this.cancelled = true; }
}
class Node {
  gain = new Parameter(); frequency = new Parameter();
  type = ''; started = false; stopped = false; disconnected = false; startArguments: unknown[][] = [];
  connect(node: Node): Node { return node; }
  start(...args: unknown[]): void { this.started = true; this.startArguments.push(args); }
  stop(): void { this.stopped = true; }
  disconnect(): void { this.disconnected = true; }
}
class Context {
  currentTime = 7;
  tones: Node[] = []; gains: Node[] = [];
  createOscillator(): Node { const node = new Node(); this.tones.push(node); return node; }
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
  assert.equal(musicScene({ ...calm, contact: true, health: 'warning' }), 'warning');
  assert.equal(musicScene({ ...calm, contact: true, health: 'critical' }), 'severe');
  assert.equal(musicScene({ ...calm, alert: true, faultSeverity: .6 }), 'warning');
  assert.equal(musicScene({ ...calm, alert: true, faultSeverity: .95 }), 'severe');
  for (const phase of ['secured', 'service', 'debrief'] as const) assert.equal(musicScene({ ...calm, phase, alert: true }), 'resolution');
  assert.equal(musicScene({ ...calm, health: 'broken', terminal: true }), 'resolution');
  assert.equal(MUSIC_PROFILES.resolution.drum, 0);
  assert.ok(MUSIC_PROFILES.contact.beatsPerMinute > MUSIC_PROFILES.practice.beatsPerMinute);
  assert.notDeepEqual(MUSIC_PROFILES.warning.notes, MUSIC_PROFILES.movement.notes);
  for (const profile of Object.values(MUSIC_PROFILES)) assert.ok(profile.bed < .05 && profile.drum < .03, 'subordinate to engine and dialogue');
});

test('score envelopes use simulation time, stay finite and duck underneath priority cues', () => {
  const full = musicLevels(frame), ducked = musicLevels({ ...frame, ducked: true });
  assert.ok(full.bed > 0 && full.drum > 0);
  assert.ok(ducked.bed < full.bed * .2 && ducked.drum < full.drum * .2);
  assert.deepEqual(musicLevels(frame), full, 'same sim instant gives same envelope');
  for (const time of [NaN, Infinity, -1]) assert.deepEqual(musicLevels({ ...frame, time }), { bed: 0, drum: 0, frequency: 52 });
  assert.equal(musicLevels({ ...frame, audible: false }).bed, 0);
  assert.equal(musicLevels({ ...frame, scene: 'resolution' }).drum, 0);
  for (const [scene, profile] of Object.entries(MUSIC_PROFILES)) {
    assert.ok(profile.bed * 1.87 + profile.drum < .09, 'combined score gain remains a quiet background layer');
    const normal = musicLevels({ ...frame, scene: scene as MusicFrame['scene'] });
    const priority = musicLevels({ ...frame, scene: scene as MusicFrame['scene'], ducked: true });
    assert.ok(Math.abs(priority.bed / normal.bed - .12) < 1e-9, 'all scenes yield 88 percent of bed gain to priority cues');
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
  assert.ok(context.gains[0]!.gain.value < beforeDuck * .2);
  score.dispose();
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
