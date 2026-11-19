import type { Phase } from './simulation.ts';

export type MusicScene = 'home' | 'practice' | 'movement' | 'contact' | 'warning' | 'severe' | 'resolution';
export type MusicSituation = { phase: Phase; moving: boolean; faultSeverity: number; alert: boolean; training?: boolean; contact?: boolean; health?: string; terminal?: boolean };
export type MusicFrame = { time: number; scene: MusicScene; audible: boolean; ducked: boolean; priorityAlert?: boolean };

/** Original small tonal palette: no recorded music, borrowed melody or military signal. */
export const MUSIC_PROFILES: Record<MusicScene, { notes: readonly number[]; motif: readonly number[]; beatsPerMinute: number; bed: number; drum: number }> = {
  home: { notes: [130.81, 174.61, 196], motif: [-1,-1,0,-1,-1,1,-1,-1,-1,2,-1,-1,1,-1,-1,-1], beatsPerMinute: 86, bed: .094, drum: .024 },
  practice: { notes: [110, 164.81, 220], motif: [0, -1, 1, 0, 2, -1, 1, -1], beatsPerMinute: 48, bed: .08, drum: .019 },
  movement: { notes: [110, 130.81, 164.81], motif: [0, -1, 2, 1, 0, 1, 2, -1], beatsPerMinute: 64, bed: .087, drum: .024 },
  contact: { notes: [98, 116.54, 146.83], motif: [0,-1,0,1,0,-1,2,-1,0,1,-1,0,2,-1,1,-1], beatsPerMinute: 108, bed: .108, drum: .029 },
  warning: { notes: [103.83, 130.81, 155.56], motif: [0, -1, 1, -1, 2, 1, 0, -1], beatsPerMinute: 68, bed: .083, drum: .022 },
  severe: { notes: [98, 103.83, 146.83], motif: [0, -1, 1, 0, 1, -1, 2, -1], beatsPerMinute: 88, bed: .086, drum: .025 },
  resolution: { notes: [110, 138.59, 164.81], motif: [2, -1, -1, 1, 0, -1, -1, -1], beatsPerMinute: 48, bed: .072, drum: 0 },
};

export function musicScene(situation: MusicSituation): MusicScene {
  if (situation.terminal || ['secured', 'service', 'debrief'].includes(situation.phase)) return 'resolution';
  // Contact owns the score; individual warnings still duck it in the audio mixer.
  if (situation.contact) return 'contact';
  if (situation.health === 'critical' || situation.health === 'broken' || (!situation.health && situation.alert && situation.faultSeverity >= .9)) return 'severe';
  if (situation.health === 'warning' || (!situation.health && situation.alert)) return 'warning';
  if (situation.moving && !situation.training) return 'movement';
  return 'practice';
}

/** No note timers or future queue: each frame describes only the current sim instant. */
export function musicLevels(frame: MusicFrame): { bed: number; melody: number; melodyFrequency: number; drum: number; frequency: number } {
  if (!frame.audible || !Number.isFinite(frame.time) || frame.time < 0) return { bed: 0, melody: 0, melodyFrequency: 440, drum: 0, frequency: 180 };
  const profile = MUSIC_PROFILES[frame.scene], time = frame.time;
  const beat = time * profile.beatsPerMinute / 60;
  const age = (beat - Math.floor(beat)) * 60 / profile.beatsPerMinute;
  // Original phrases with rests, plus scene-specific rhythmic envelopes.
  const accent = Math.floor(beat) % 4 === 0 ? 1 : .55;
  const home = frame.scene === 'home', combat = frame.scene === 'contact';
  // Weighted downbeats, firmer backbeats and a quiet pickup into the next bar.
  const pulseAt = (elapsed: number) => elapsed < 0 ? 0 : Math.min(1, elapsed / .012) * Math.exp(-elapsed * 19);
  const homeBeat = Math.floor(beat) % 4;
  const pulse = home ? pulseAt(age) * [.88, .61, .47, .69][homeBeat]! +
    (homeBeat === 3 ? .25 * pulseAt(age - .56 * 60 / profile.beatsPerMinute) : 0)
    : combat ? pulseAt(age) * (homeBeat % 2 ? .5 : 1) + .47 * pulseAt(age - .5 * 60 / profile.beatsPerMinute)
    : Math.min(1, age / .018) * Math.exp(-age * 13) * accent;
  const note = profile.motif[Math.floor(beat) % profile.motif.length]!;
  const envelope = Math.min(1, age / (home ? .21 : combat ? .035 : .07)) * Math.min(1, (60 / profile.beatsPerMinute - age) / (home ? .3 : .2)) * Math.exp(-age * (combat ? 1.8 : .45));
  // Dialogue stays in front without making the entire opening score vanish.
  // Brief instrument/breakdown cues retain the deeper, immediate reduction.
  const duck = frame.priorityAlert ? .12 : frame.ducked ? .35 : 1;
  const texture = home ? .72 : combat ? .87 + .13 * Math.cos(beat * Math.PI) : .9 + .1 * Math.sin(time * .19);
  return { bed: profile.bed * texture * duck,
    melody: note < 0 ? 0 : profile.bed * (home ? .31 : combat ? .78 : .76) * envelope * duck,
    melodyFrequency: profile.notes[Math.max(0, note)]! * (home ? 3 : 4),
    drum: profile.drum * pulse * duck, frequency: combat ? 98 + 86 * Math.exp(-age * 21) : home ? 186 : 180 + 60 * Math.exp(-age * 16) };
}

/** Drum skin and snare-wire textures are mixed independently of the pitched score. */
export function percussionTexture(frame: MusicFrame): number {
  if (!frame.audible || !Number.isFinite(frame.time) || frame.time < 0 || (frame.scene !== 'home' && frame.scene !== 'contact')) return 0;
  const period=60/MUSIC_PROFILES[frame.scene].beatsPerMinute;
  const beat=Math.floor(frame.time/period), fraction=frame.time/period-beat, slot=beat%4;
  const hit=(at:number, weight:number, fall:number)=>{
    const age=(fraction-at)*period;
    return age<0 ? 0 : weight*Math.min(1,age/.008)*Math.exp(-age*fall);
  };
  const texture=frame.scene==='home' ?
    hit(0,[.46,1,.39,.8][slot]!,24)+hit(.5,slot===1||slot===3?.31:.15,29)+(slot===3?hit(.75,.37,31):0)
    : hit(0,slot%2?.68:1,18)+hit(.5,.55,25)+(slot===3?hit(.75,.43,29):0);
  return texture*(frame.scene==='home'?.057:.046)*(frame.priorityAlert?.12:frame.ducked?.35:1);
}
/** Low-midrange synthesized score. All sound sources are stopped at every interruption. */
export class ProceduralMusic {
  private tones: { oscillator: OscillatorNode; level: GainNode }[] = [];
  private drum?: { oscillator: OscillatorNode; level: GainNode };
  private disposed = false;
  private timbre?: 'home' | 'combat' | 'normal';
  private noise?: { source: AudioBufferSourceNode; level: GainNode };
  private frame?: MusicFrame;
  private readonly context: AudioContext;
  private readonly destination: AudioNode;

  constructor(context: AudioContext, destination: AudioNode) { this.context = context; this.destination = destination; }

  private value(parameter: AudioParam, value: number, smoothing = .1): void {
    if (typeof parameter.setTargetAtTime === 'function') parameter.setTargetAtTime(value, this.context.currentTime, smoothing);
    else parameter.value = value;
  }

  private tone(type: OscillatorType, frequency: number): { oscillator: OscillatorNode; level: GainNode } {
    const oscillator = this.context.createOscillator(), level = this.context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency; level.gain.value = 0;
    oscillator.connect(level).connect(this.destination);
    oscillator.start();
    return { oscillator, level };
  }

  private setTimbre(timbre: 'home' | 'combat' | 'normal'): void {
    if (timbre === this.timbre) return;
    this.timbre = timbre;
    const lead = this.tones[2]?.oscillator, drum = this.drum?.oscillator;
    if (!lead || !drum) return;
    lead.type = 'sine'; drum.type = timbre === 'combat' ? 'sine' : 'triangle';
    if (typeof this.context.createPeriodicWave === 'function' && typeof lead.setPeriodicWave === 'function') {
      const harmonics = timbre === 'home' ? [0,1,.14,.24,.055,.025] : timbre === 'combat' ? [0,1,.48,.22,.14,.068] : [0,1,.09,.16,.035];
      lead.setPeriodicWave(this.context.createPeriodicWave(new Float32Array(harmonics.length),new Float32Array(harmonics)));
    }
    if (timbre === 'normal') { this.stopNoise(); return; }
    if (this.noise || typeof this.context.createBuffer !== 'function' || typeof this.context.createBufferSource !== 'function') return;
    const rate = this.context.sampleRate;
    if (!Number.isFinite(rate) || rate < 8000) return;
    const buffer = this.context.createBuffer(1,Math.round(rate*.32),rate), pcm=buffer.getChannelData(0);
    let seed=76123, low=0, mid=0;
    for(let i=0;i<pcm.length;i++) {
      seed=Math.imul(seed,1664525)+1013904223|0;
      const white=(seed>>>0)/2147483648-1;
      low+=(white-low)*.08; mid+=(white-mid)*.32;
      pcm[i]=(mid-low)*1.3+(white-mid)*.28;
    }
    const source=this.context.createBufferSource(), level=this.context.createGain();
    source.buffer=buffer; source.loop=true; level.gain.value=0;
    source.connect(level).connect(this.destination); source.start(); this.noise={source,level};
  }

  private stopNoise(): void {
    if (!this.noise) return;
    const {source,level}=this.noise; this.noise=undefined;
    this.value(level.gain,0,.008);
    try { source.stop(); } catch { /* Already ended. */ }
    source.disconnect(); level.disconnect();
  }
  update(frame: MusicFrame): void {
    if (this.disposed) return;
    this.frame = { ...frame };
    if (!frame.audible || !Number.isFinite(frame.time) || frame.time < 0) { this.stop(); return; }
    if (!this.tones.length) {
      const notes = MUSIC_PROFILES[frame.scene].notes;
      this.tones = [this.tone('sine', notes[0]!), this.tone('triangle', notes[1]! * 2), this.tone('triangle', notes[0]! * 4)];
      this.drum = this.tone('triangle', 180);
    }
    this.setTimbre(frame.scene === 'home' ? 'home' : frame.scene === 'contact' ? 'combat' : 'normal');
    if (this.noise) this.value(this.noise.level.gain,percussionTexture(frame),.008);
    const profile = MUSIC_PROFILES[frame.scene], levels = musicLevels(frame);
    this.tones.forEach((tone, index) => {
      const frequency = index === 2 ? levels.melodyFrequency : profile.notes[index]! * (index ? 2 : 1);
      this.value(tone.oscillator.frequency, frequency, index === 2 ? (frame.scene === 'contact' ? .011 : .025) : .55);
      this.value(tone.level.gain, index === 2 ? levels.melody : levels.bed * [.42, .45][index]!, frame.ducked || frame.priorityAlert ? .025 : index === 2 ? .025 : .25);
    });
    if (this.drum) {
      this.value(this.drum.oscillator.frequency, levels.frequency, .02);
      this.value(this.drum.level.gain, levels.drum, frame.ducked ? .015 : .025);
    }
  }

  /** An alert or newly decoded radio line can duck immediately between frames. */
  duck(priorityAlert = false): void { if (this.frame?.audible) this.update({ ...this.frame, ducked: true, priorityAlert: priorityAlert || this.frame.priorityAlert }); }

  stop(): void {
    for (const tone of [...this.tones, ...(this.drum ? [this.drum] : [])]) {
      // Cancel smoothing at the current audio instant; nothing survives a pause.
      if (typeof tone.level.gain.cancelScheduledValues === 'function') tone.level.gain.cancelScheduledValues(this.context.currentTime);
      if (typeof tone.level.gain.setValueAtTime === 'function') tone.level.gain.setValueAtTime(0, this.context.currentTime);
      else tone.level.gain.value = 0;
      try { tone.oscillator.stop(); } catch { /* Already ended. */ }
      tone.oscillator.disconnect(); tone.level.disconnect();
    }
    this.stopNoise(); this.tones = []; this.drum = undefined; this.frame = undefined; this.timbre = undefined;
  }

  dispose(): void { this.stop(); this.disposed = true; }
}

export const SCORE_ASSETS = {
  assembly: '/music/assembly-r1.wav',
  transit: '/music/transit-r1.wav',
  contact: '/music/contact-r1.wav',
} as const;
type ScoreCue = keyof typeof SCORE_ASSETS;
type ScoreLoader = (url: string, signal: AbortSignal, retry: boolean) => Promise<ArrayBuffer>;
type ScoreLane = { source: AudioBufferSourceNode; gain: GainNode; cue: ScoreCue; level: number; target?: number };
// Bundled WAVs already have restrained RMS levels (-20 to -23 dBFS). Avoid
// attenuating quiet transit another 18 dB before the .48 master: it disappears
// beneath vehicle sound, especially on phone speakers. Radio/alerts still duck.
export const SCORE_MIX: Record<MusicScene, { cue: ScoreCue; gain: number }> = {
  home: { cue: 'assembly', gain: .68 },
  practice: { cue: 'transit', gain: .34 },
  movement: { cue: 'transit', gain: .38 },
  contact: { cue: 'contact', gain: .48 },
  warning: { cue: 'transit', gain: .30 },
  severe: { cue: 'transit', gain: .28 },
  resolution: { cue: 'transit', gain: .22 },
};

/** Original rendered cues replace the pitched approximation on real browsers.
 * The score uses the same radio-duck, pause and mute contract as the rest of the mixer.
 */
export class RenderedScore {
  private readonly buffers = new Map<ScoreCue, AudioBuffer>();
  private readonly pending = new Map<ScoreCue, () => void>();
  private readonly failures = new Map<ScoreCue, { attempts: number; retryAt: number }>();
  private readonly fallback: ProceduralMusic;
  private lane?: ScoreLane;
  private retiring?: ScoreLane;
  private frame?: MusicFrame;
  private timing?: { cue: ScoreCue; began: number; last: number };
  private startRetryAt = 0;
  private disposed = false;
  private readonly context: AudioContext;
  private readonly destination: AudioNode;
  private readonly load: ScoreLoader;
  private readonly now: () => number;
  constructor(context: AudioContext, destination: AudioNode, load: ScoreLoader, now = () => Date.now()) {
    this.context = context; this.destination = destination; this.load = load; this.now = now;
    this.fallback = new ProceduralMusic(context, destination);
  }
  get preparing(): boolean {
    return !!this.frame && !this.lane && !this.failures.has(SCORE_MIX[this.frame.scene].cue);
  }
  /** An intentional user retry can recover a track after its automatic budget. */
  retry(): void { this.failures.clear(); this.startRetryAt = 0; }

  private request(cue: ScoreCue, speculative = false): void {
    if (this.disposed || this.buffers.has(cue) || this.pending.has(cue)) return;
    const previous = this.failures.get(cue);
    if (previous && (speculative || previous.attempts >= 3 || this.now() < previous.retryAt)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Score load timed out')); }, 9_000);
    });
    this.pending.set(cue, () => { clearTimeout(timer); controller.abort(); });
    const loading = Promise.resolve().then(() => this.load(SCORE_ASSETS[cue], controller.signal, !!previous))
      .then(data => {
        if (controller.signal.aborted) throw new Error('Score load canceled');
        return this.context.decodeAudioData(data);
      }).then(buffer => {
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Invalid score buffer');
        return buffer;
      });
    void Promise.race([loading, deadline]).then(buffer => {
      if (this.disposed) return;
      this.buffers.set(cue, buffer);
      this.failures.delete(cue);
    }).catch(() => {
      if (!this.disposed) {
        const attempts = (previous?.attempts ?? 0) + 1;
        this.failures.set(cue, { attempts, retryAt: this.now() + (attempts === 1 ? 1_000 : 3_000) });
      }
    }).finally(() => {
      clearTimeout(timer);
      this.pending.delete(cue);
      // A decoder completion may supply the latest scene, never a stale one.
      // Audio frames halted by pause/mute clear this.frame synchronously.
      if (this.frame && this.context.state === 'running') this.update(this.frame);
    });
  }
  private warm(cue: ScoreCue): void {
    if (this.pending.size || !this.buffers.has(cue)) return;
    // Let the audible cue download first. Then warm only one likely successor
    // at a time, so music does not flood a phone connection used by radio too.
    for (const next of (cue === 'assembly' ? ['transit', 'contact'] : cue === 'transit' ? ['contact'] : ['transit']) as ScoreCue[]) {
      if (!this.buffers.has(next) && !this.failures.has(next)) { this.request(next, true); break; }
    }
  }
  private gain(lane: ScoreLane, value: number, seconds = .13): void {
    // Sending a fresh identical target every animation frame can accumulate
    // automation events and keep moving a gain ramp's start on some engines.
    if (value === lane.target) return;
    lane.target = value;
    lane.gain.gain.setTargetAtTime(value, this.context.currentTime, seconds);
  }
  private end(lane?: ScoreLane): void {
    if (!lane) return;
    const now = this.context.currentTime;
    lane.source.onended = null;
    lane.gain.gain.cancelScheduledValues(now);
    lane.gain.gain.setValueAtTime(0, now);
    try { lane.source.stop(); } catch { /* Already ended. */ }
    lane.source.disconnect();
    lane.gain.disconnect();
    if (this.retiring === lane) this.retiring = undefined;
  }
  private begin(cue: ScoreCue, buffer: AudioBuffer, position: number, level: number): ScoreLane | undefined {
    if (this.now() < this.startRetryAt) return;
    const source = this.context.createBufferSource(), output = this.context.createGain();
    const lane = { source, gain: output, cue, level };
    output.gain.value = 0;
    source.buffer = buffer;
    source.loop = true;
    source.connect(output).connect(this.destination);
    source.onended = () => {
      if (this.lane === lane) this.lane = undefined;
      this.end(lane);
    };
    try { source.start(0, position); return lane; }
    catch {
      this.end(lane);
      this.startRetryAt = this.now() + 500;
      return undefined;
    }
  }
  update(frame: MusicFrame): void {
    if (this.disposed) return;
    if (!frame.audible || !Number.isFinite(frame.time) || frame.time < 0) { this.stop(); return; }
    this.frame = { ...frame };
    const { cue, gain } = SCORE_MIX[frame.scene];
    if (this.timing && frame.time < this.timing.last) { this.reset(); this.frame = { ...frame }; }
    const duck = frame.priorityAlert ? .12 : frame.ducked ? .30 : 1;
    const buffer = this.buffers.get(cue);
    if (!buffer) {
      this.request(cue);
      // Do not punch a hole between cues while the next one downloads. A
      // temporary error must not silence an already playing, valid score.
      // Start the bounded original synth immediately on first download too;
      // slow mobile fetch/decode must not leave an enabled score silent for 9s.
      if (this.lane) this.gain(this.lane, this.lane.level * duck, duck < 1 ? .025 : .13);
      else this.fallback.update(frame);
      return;
    }
    if (this.lane?.cue !== cue) {
      const began = this.timing?.cue === cue ? this.timing.began : frame.time;
      const position = Math.max(0, frame.time - began) % buffer.duration;
      const next = this.begin(cue, buffer, position, gain);
      if (!next) {
        if (this.lane) this.gain(this.lane, this.lane.level * duck, duck < 1 ? .025 : .13);
        else this.fallback.update(frame);
        return;
      }
      this.fallback.stop();
      this.end(this.retiring);
      if (this.lane) {
        const old = this.retiring = this.lane;
        this.gain(old, 0, .075);
        try { old.source.stop(this.context.currentTime + .42); } catch { this.end(old); }
      }
      this.lane = next;
      this.timing = { cue, began, last: frame.time };
    }
    this.timing!.last = frame.time;
    this.lane.level = gain;
    this.gain(this.lane, gain * duck, duck < 1 ? .025 : .13);
    this.warm(cue);
  }
  duck(priorityAlert = false): void {
    if (this.frame?.audible) this.update({ ...this.frame, ducked: true, priorityAlert: !!this.frame.priorityAlert || priorityAlert });
  }
  stop(): void {
    this.end(this.lane); this.lane = undefined;
    this.end(this.retiring);
    this.fallback.stop();
    this.frame = undefined;
    // Preserve cue offset across focus loss and user pauses.
  }
  reset(): void {
    this.stop();
    this.timing = undefined;
  }
  dispose(): void {
    this.reset(); this.disposed = true; this.fallback.dispose();
    for (const cancel of this.pending.values()) cancel();
    this.pending.clear(); this.buffers.clear(); this.failures.clear();
  }
}

export function loadScoreAsset(url: string, signal?: AbortSignal, retry = false): Promise<ArrayBuffer> {
  return fetch(url, { signal, cache: retry ? 'reload' : 'default' }).then(response => {
    if (!response.ok) throw new Error('Score asset unavailable');
    return response.arrayBuffer();
  });
}