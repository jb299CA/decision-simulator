import type { Phase, Simulation } from './simulation';
import { radioScript } from './radio-script.ts';
import type { PowertrainState } from './powertrain.ts';
import { ProceduralMusic, RenderedScore, loadScoreAsset, musicScene } from './music.ts';
import { callsignForPair, chooseRadioCast, GUIDED_CALLSIGN, RadioNet, type RadioCast, type RadioNetCue } from './radio-net.ts';

export type VehicleAudioContext = { powertrain?: PowertrainState; inside?: boolean; training?: boolean; contact?: boolean; health?: string; terminal?: boolean; breakdown?: boolean; faultInspection?: boolean; transportPaused?: boolean; departureCrossed?: boolean; practiceCompleted?: boolean; recoveryReveal?: boolean };
export type SoundState = 'unstarted' | 'unsupported' | 'muted' | 'paused' | 'running' | 'blocked';

type Cue = typeof radioScript.phase[keyof typeof radioScript.phase] | typeof radioScript.ambient[number] | typeof radioScript.recovery | RadioNetCue;
type LoadJob = { cue: Cue; priority: 'current' | 'prefetch'; resolve: (buffer?: AudioBuffer) => void };
const line = (cue: Cue): string => `${cue.speaker}: ${cue.text}`;
export const recoveryCaption = (): string => line(radioScript.recovery);
// Quiet upper firing harmonics remain audible on small speakers without raising
// the master ceiling or pretending these are measured vehicle frequencies.
const dieselRatios = [1, 2, 3, 4, 5, 6, 10, 14, 19];
type PlaybackSession = { type: string };

/** Original fictional dialogue; the same text accompanies every recorded line. */
export function captionForPhase(phase: Phase): string {
  return phase === 'title' ? 'Illustrative exercise · Synthetic telemetry and fictional crew dialogue.' : line(radioScript.phase[phase]);
}

function ambience(phase: Phase, engine: boolean, moving: boolean, vehicle?: VehicleAudioContext): string {
  if (phase === 'title') return captionForPhase(phase);
  if (['secured', 'service', 'debrief'].includes(phase)) return '[Engine off · vehicle remains out of service · repair and verification required]';
  if (!engine) return '[Engine off · vehicle stationary]';
  if (vehicle?.powertrain) {
    const revving = vehicle.powertrain.throttle > .12;
    const whine = vehicle.powertrain.whine > .25 ? ' · synthesized powertrain whine' : '';
    return `[Diesel engine ${revving ? 'revving under load' : 'idling'}${whine} · ${moving ? 'tires rolling' : 'vehicle stationary'}${vehicle.inside ? ' · muffled cabin vibration' : ' · exterior engine sound'}]`;
  }
  if (phase === 'exterior') return '[Diesel engine idling · wind across the training area]';
  if (phase === 'halted') return '[Vehicle halted · diesel engine idling · wheels stopped]';
  if (!moving) return '[Diesel engine idling · vehicle stationary · cabin vibration]';
  return '[Diesel engine under load · tires rolling · cabin vibration]';
}

export class SimulationAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engineGain?: GainNode;
  private rollingGain?: GainNode;
  private cabinGain?: GainNode;
  private windGain?: GainNode;
  private whineGain?: GainNode;
  private loadGain?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private loadFilter?: BiquadFilterNode;
  private whineTones: OscillatorNode[] = [];
  private radioInput?: BiquadFilterNode;
  private intercomInput?: BiquadFilterNode;
  private harmonics: OscillatorNode[] = [];
  private firingTone?: OscillatorNode;
  private vehicleLevels = new Map<GainNode, number>();
  private sources: AudioScheduledSourceNode[] = [];
  private voice?: AudioBufferSourceNode;
  private buffers = new Map<string, AudioBuffer>();
  private loads = new Map<string, Promise<AudioBuffer | undefined>>();
  private loadQueue: LoadJob[] = [];
  private activeLoads = 0;
  private activePrefetch = 0;
  private voiceBackoff = new Map<string, number>();
  private deferredVoice?: { cue: Cue; generation: number; needsRetry: boolean };
  private squelchBuffer?: AudioBuffer;
  private squelches = new Set<AudioBufferSourceNode>();
  private radioStaticBuffer?: AudioBuffer;
  private radioStatic?: { source: AudioBufferSourceNode; gain: GainNode };
  private rangeShotBuffer?: AudioBuffer;
  private reportPeak = 1;
  private playbackSession?: PlaybackSession;
  private previousSessionType?: string;
  private activationEpoch = 0;
  private sessionRetry?: { timer: ReturnType<typeof setTimeout>; finish: () => void };
  private healthAlertBuffers?: Record<'warning' | 'critical', AudioBuffer>;
  private healthAlertSource?: AudioBufferSourceNode;
  private breakdownBuffer?: AudioBuffer;
  private breakdownSource?: AudioBufferSourceNode;
  private wasBroken = false;
  private wasGuidedAlert = false;
  private rangeShots = new Set<AudioBufferSourceNode>();
  private shotLevels = new Map<AudioBufferSourceNode, { node: GainNode; level: number }>();
  private shotIndex = 0;
  private pending?: { cue: Cue; generation: number };
  private generation = 0;
  private muted = false;
  private paused = false;
  private inspectionAmbience = false;
  private inspectionInside?: boolean;
  private inspectionAudioTime = 0;
  private soundscapeTime = 0;
  private distantBuffers?: readonly AudioBuffer[];
  private distantSource?: { source: AudioBufferSourceNode; gain: GainNode };
  private nextDistant?: number;
  private distantIndex = 0;
  private distantUntil = 0;
  private started = false;
  private disposed = false;
  private lastPhase: Phase = 'title';
  private lastTime = 0;
  private nextAmbient = Infinity;
  private wasMoving = false;
  private lastEngine = false;
  private ambientNotBefore = 0;
  private ambientIndex = 0;
  private radioNet: RadioNet;
  private drivingMode = false;
  private recoveryAcknowledged = false;
  private readonly random: () => number;
  private readonly radioCast: RadioCast;
  private missionIdentity: string;
  private guidedMode = false;
  private speakingCaption?: string;
  private captionUntil = 0;
  private vehicleContext?: VehicleAudioContext;
  private music?: ProceduralMusic | RenderedScore;
  private musicOn = true;
  private homeMusic = false;
  private homeMusicTime = 0;
  private briefingBuffer?: AudioBuffer;
  private briefingSource?: AudioBufferSourceNode;
  private briefingNotBefore = 0;
  private rangeOpeningObsolete = false;

  constructor(random: () => number = Math.random, voiceRandom?: () => number) {
    this.random = random;
    this.radioCast = chooseRadioCast(voiceRandom ?? Math.random);
    this.radioNet = new RadioNet(random, undefined, this.radioCast);
    this.missionIdentity = callsignForPair(this.radioNet.pair);
  }

  /** Fixed to this run's first chain, independent of later background traffic. */
  get missionCallsign(): string { return this.guidedMode ? GUIDED_CALLSIGN : this.missionIdentity; }

  get musicEnabled(): boolean { return this.musicOn; }
  get musicPreparing(): boolean { return this.music instanceof RenderedScore && this.music.preparing; }
  /** An enabled home control must unlock playback before it can toggle off. */
  get musicNeedsActivation(): boolean { return this.musicOn && !this.muted && this.soundState !== 'running'; }
  setMusicEnabled(enabled: boolean): void {
    this.musicOn = !!enabled;
    if (!this.musicOn) this.music?.stop(); else if (this.music instanceof RenderedScore) this.music.retry();
  }

  get caption(): string {
    if (this.vehicleContext?.breakdown) return this.breakdownSource
      ? '[Engine sputters and stops · metal clunk · pressure hiss · vehicle immobilized]'
      : '[Engine stopped · vehicle immobilized · recovery and repair required]';
    return this.speakingCaption ?? ambience(this.lastPhase, this.lastEngine, this.wasMoving, this.vehicleContext);
  }

  get radioActive(): boolean { return this.speakingCaption !== undefined; }
  get distantCaption(): string | undefined { return this.soundscapeTime < this.distantUntil ? this.distantIndex % 2 ? "[Distant explosions]" : "[Distant gunfire]" : undefined; }

  /** Report the device state, rather than treating an enabled preference as playback. */
  get soundState(): SoundState {
    if (this.muted) return 'muted';
    if (!this.started) return 'unstarted';
    if (!this.context || this.disposed || this.context.state === 'closed') return 'unsupported';
    if (this.paused && !this.inspectionAmbience) return 'paused';
    // Safari also reports "interrupted"; every non-running state needs a tap.
    return this.context.state === 'running' ? 'running' : 'blocked';
  }

  /** User-gesture activation. Recordings are bundled files, never a speech service. */
  async start(retryOutput = false): Promise<void> {
    if (this.disposed) return;
    this.started = true;
    if (this.muted) return;
    this.cancelSessionRetry();
    const epoch = ++this.activationEpoch;
    try {
      // iOS Web Audio's default ambient category can obey the hardware Silent
      // switch even while AudioContext reports running. Ask for media playback
      // before constructing/resuming the context; no microphone is involved.
      this.selectPlaybackSession();
      if (!this.context && typeof window !== 'undefined') {
        const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Audio) this.createSound(new Audio());
      }
      const context = this.context;
      if (!context) return;
      if (retryOutput && this.music instanceof RenderedScore) this.music.retry();
      // Invoke resume in the tap's synchronous call stack, even if the previous
      // home/inspection frame is paused. The master stays silent until a frame
      // observes allowed playback. Never wait for a recording before unlocking.
      const activation = context.resume();
      // A deliberate retry also refreshes a stale WebKit playback category.
      // One task boundary, never a background loop or a silent media element.
      const recovery = retryOutput ? this.refreshPlaybackSession(epoch) : Promise.resolve();
      // Only warm the first relevant recording. Activation never waits for downloads.
      this.prefetch();
      await Promise.all([activation, recovery]);
      if (this.disposed || context !== this.context) return;
      if (epoch === this.activationEpoch && retryOutput && this.transportAudible) await context.resume();
      // A delayed mobile resume must not undo a pause or mute made meanwhile.
      if (!this.transportAudible) this.syncContext();
      else if (epoch === this.activationEpoch) this.resumeCurrentVoice(retryOutput);
    } catch { /* Captions remain available when device activation fails. */ }
  }

  private get transportAudible(): boolean { return this.started && !this.disposed && !this.muted && (!this.paused || this.inspectionAmbience); }
  private get audible(): boolean { return this.transportAudible && !this.paused; }

  private selectPlaybackSession(): void {
    try {
      const session = typeof navigator === 'undefined' ? undefined
        : (navigator as Navigator & { audioSession?: PlaybackSession }).audioSession;
      if (!session) return;
      if (!this.playbackSession) { this.previousSessionType = session.type; this.playbackSession = session; }
      session.type = 'playback';
    } catch { /* Experimental/unsupported setters must not block ordinary audio. */ }
  }

  private refreshPlaybackSession(epoch: number): Promise<void> {
    const session = this.playbackSession;
    if (!session) return Promise.resolve();
    try { session.type = 'ambient'; } catch { return Promise.resolve(); }
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.sessionRetry = undefined;
        if (epoch === this.activationEpoch && !this.disposed && !this.muted) this.selectPlaybackSession();
        else this.restorePlaybackSession();
        resolve();
      }, 0);
      this.sessionRetry = { timer, finish: resolve };
    });
  }

  private cancelSessionRetry(): void {
    const retry = this.sessionRetry;
    if (!retry) return;
    clearTimeout(retry.timer); this.sessionRetry = undefined;
    this.restorePlaybackSession(); retry.finish();
  }

  private restorePlaybackSession(): void {
    try {
      const session = this.playbackSession;
      // Do not overwrite a different category selected by another page feature.
      if (session && (session.type === 'playback' || session.type === 'ambient') && this.previousSessionType !== undefined) session.type = this.previousSessionType;
    } catch { /* Cleanup is best effort on experimental implementations. */ }
  }

  /** A single speculative job leaves capacity for a newly relevant cue. */
  private load(cue: Cue, priority: LoadJob['priority']): Promise<AudioBuffer | undefined> {
    const cached = this.buffers.get(cue.id);
    if (cached) return Promise.resolve(cached);
    if (priority === 'prefetch' && (this.voiceBackoff.get(cue.id) ?? 0) > Date.now()) return Promise.resolve(undefined);
    const existing = this.loads.get(cue.id);
    if (existing) {
      const queued = this.loadQueue.find(job => job.cue.id === cue.id);
      if (queued && priority === 'current') queued.priority = 'current';
      this.pumpLoads();
      return existing;
    }
    const promise = new Promise<AudioBuffer | undefined>(resolve => {
      this.loadQueue.push({ cue, priority, resolve });
    });
    this.loads.set(cue.id, promise);
    this.pumpLoads();
    return promise;
  }

  private pumpLoads(): void {
    const context = this.context;
    if (!context || this.disposed) return;
    while (this.activeLoads < 2) {
      const index = this.loadQueue.findIndex(job => job.priority === 'current');
      const next = index >= 0 ? index : this.activePrefetch === 0 ? 0 : -1;
      if (next < 0 || !this.loadQueue[next]) break;
      const job = this.loadQueue.splice(next, 1)[0]!;
      this.activeLoads++;
      if (job.priority === 'prefetch') this.activePrefetch++;
      void this.decode(job.cue, context).then(buffer => {
        // Cache successful buffers, not failed promises. Back off speculative
        // prefetches without making a recovered recording unreachable.
        this.loads.delete(job.cue.id);
        if (buffer) this.voiceBackoff.delete(job.cue.id);
        else if (!this.disposed) this.voiceBackoff.set(job.cue.id, Date.now() + 15_000);
        job.resolve(buffer);
      }).finally(() => {
        this.activeLoads--;
        if (job.priority === 'prefetch') this.activePrefetch--;
        this.pumpLoads();
      });
    }
  }

  private async decode(cue: Cue, context: AudioContext): Promise<AudioBuffer | undefined> {
    try {
      const response = await fetch(cue.file);
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      if (this.disposed || context !== this.context) return;
      const buffer = await context.decodeAudioData(bytes);
      // Interrupted downloads may still populate the cache, but never trigger stale speech.
      if (!this.disposed && context === this.context) {
        this.buffers.set(cue.id, buffer);
        return buffer;
      }
    } catch { /* Exact captions cover missing or undecodable local recordings. */ }
  }

  private clearQueuedLoads(): void {
    for (const job of this.loadQueue) {
      this.loads.delete(job.cue.id);
      job.resolve();
    }
    this.loadQueue = [];
  }

  private prefetch(): void {
    if (!this.context || this.disposed || this.paused || this.muted) return;
    const phases = Object.keys(radioScript.phase) as Exclude<Phase, 'title'>[];
    const nextPhase = this.lastPhase === 'title' ? 'exterior' : phases[phases.indexOf(this.lastPhase) + 1];
    // Driving owns one opening relay, fetched on entry; it must never prefetch
    // or replay the HQ/test-fire order pool as ambient traffic. In the guided
    // exercise, warm movement traffic only as it approaches.
    const cue = this.drivingMode ? undefined
      : this.wasMoving && this.nextAmbient - this.lastTime <= 6 ? this.guidedTraffic
      : nextPhase === 'exterior' ? this.radioNet.guidedOpening : nextPhase ? radioScript.phase[nextPhase] : undefined;
    if (cue) void this.load(cue, 'prefetch');
  }

  private createSound(context: AudioContext): void {
    this.context = context;
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this.master = master;
    this.briefingBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .024), context.sampleRate);
    const click = this.briefingBuffer.getChannelData(0);
    for (let i = 0; i < click.length; i++) {
      const time = i / context.sampleRate;
      click[i] = .045 * Math.sin(2 * Math.PI * 1150 * time) * Math.min(1, time / .002) * Math.exp(-time * 220);
    }
    this.music = typeof AudioBufferSourceNode === 'function' && typeof fetch === 'function'
      ? new RenderedScore(context, master, loadScoreAsset) : new ProceduralMusic(context, master);
    const group = (): GainNode => { const node = context.createGain(); node.gain.value = 0; node.connect(master); return node; };
    this.engineGain = group(); this.rollingGain = group(); this.cabinGain = group(); this.windGain = group();
    this.whineGain = group(); this.loadGain = group();
    const filter = (type: BiquadFilterType, frequency: number, q = .7): BiquadFilterNode => {
      const node = context.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = q; return node;
    };
    const oscillator = (frequency: number, volume: number, destination: AudioNode | AudioParam, type: OscillatorType = 'sine'): OscillatorNode => {
      const osc = context.createOscillator(); osc.type = type; osc.frequency.value = frequency;
      const level = context.createGain(); level.gain.value = volume;
      osc.connect(level);
      if ('setValueAtTime' in destination) level.connect(destination as AudioParam);
      else level.connect(destination as AudioNode);
      osc.start(); this.sources.push(osc); return osc;
    };
    // A low crankshaft tone plus uneven firing harmonics creates a weighty diesel.
    // No sawtooth drone or external vehicle recording is used.
    const engineFilter = filter('lowpass', 610);
    this.engineFilter = engineFilter;
    engineFilter.connect(this.engineGain);
    for (const [i, volume] of [.8, .42, .23, .14, .07, .04, .1, .075, .045].entries()) {
      this.harmonics.push(oscillator(24 * dieselRatios[i]!, volume, engineFilter));
    }
    const pulse = context.createGain(); pulse.gain.value = .63;
    pulse.connect(engineFilter);
    this.firingTone = oscillator(12, .27, pulse.gain);
    let seed = 1729;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return seed / 2147483648; };
    const noise = (seconds: number, texture: 'noise' | 'gravel' | 'rattle'): AudioBuffer => {
      const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
      const data = buffer.getChannelData(0);
      let low = 0, hit = 0;
      for (let i = 0; i < data.length; i++) {
        const n = random(); low = low * .97 + n * .03;
        if (texture === 'rattle') {
          if (random() > .998) hit = Math.abs(n);
          hit *= .993;
          data[i] = hit * (Math.sin(i * 2 * Math.PI * 713 / context.sampleRate) + .45 * Math.sin(i * 2 * Math.PI * 1193 / context.sampleRate));
        } else if (texture === 'gravel') {
          data[i] = (n * .45 + low * 3) * (.55 + .22 * Math.sin(i / context.sampleRate * 31) + .16 * Math.sin(i / context.sampleRate * 53));
        } else data[i] = n;
      }
      return buffer;
    };
    const white = noise(3, 'noise');
    // Share this one buffer with the vehicle noise; each live radio call owns
    // just one short-lived source and gain, never a per-frame oscillator.
    this.radioStaticBuffer = white;
    // An original smooth rising mechanical whine and filtered airflow carry
    // throttle/load independently of road speed. No real vehicle recording.
    const whineFilter = filter('lowpass', 3100); whineFilter.connect(this.whineGain);
    this.whineTones = [oscillator(640, .5, whineFilter), oscillator(960, .1, whineFilter)];
    // Original synthesized arcade report: a short crack over a weightier,
    // irregular low/mid body. The body outlasts the crack instead of sustaining
    // bright white noise. These are designed game sounds, not weapon recordings.
    // One reusable buffer avoids a new oscillator graph for every trigger press.
    const reportDuration = .25;
    this.rangeShotBuffer = context.createBuffer(1, Math.floor(context.sampleRate * reportDuration), context.sampleRate);
    const report = this.rangeShotBuffer.getChannelData(0);
    const bodyFollow = 1 - Math.exp(-2 * Math.PI * 700 / context.sampleRate);
    let bodyNoise = 0, bodyTexture = 0;
    for (let i = 0; i < report.length; i++) {
      const t = i / context.sampleRate, n = random();
      bodyNoise += bodyFollow * (n - bodyNoise);
      bodyTexture += bodyFollow * (bodyNoise - bodyTexture);
      const attack = Math.min(1, t / .0008);
      const tail = Math.min(1, (reportDuration - t) / .035);
      const body = .53 * Math.sin(2 * Math.PI * (88 * t - 67 * t * t)) * Math.exp(-t * 15)
        + .18 * Math.sin(2 * Math.PI * (172 * t - 75 * t * t)) * Math.exp(-t * 23)
        + .85 * bodyTexture * Math.exp(-t * 21);
      const crack = .30 * (n - bodyNoise) * Math.exp(-t * 220);
      // Gentle saturation bounds even coincident reports without a hard clip.
      report[i] = attack * tail * .78 * Math.tanh((body + crack) / .78);
    }
    this.reportPeak = report.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
    // Original equipment-style annunciator, not a recording or reproduction of
    // MFoCS. Fixed midrange pulses cut through a phone speaker without a siren.
    // Raised-cosine edges remove clicks; literal silent gaps keep the pattern
    // distinct, and the normalized partials bound the source peak below .4.
    const instrumentCue = (pulses: number, pitch: number, pulse: number, gap: number): AudioBuffer => {
      const duration = pulses * pulse + (pulses - 1) * gap + .025;
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / context.sampleRate, index = Math.floor(t / (pulse + gap));
        const local = t - index * (pulse + gap);
        if (index >= pulses || local >= pulse) continue;
        const attack = Math.min(1, local / .005), release = Math.min(1, (pulse - local) / .014);
        const envelope = (.5 - .5 * Math.cos(Math.PI * attack)) * (.5 - .5 * Math.cos(Math.PI * release));
        const phase = 2 * Math.PI * pitch * local;
        data[i] = .4 * envelope * (.72 * Math.sin(phase) + .2 * Math.sin(2 * phase) + .08 * Math.sin(3 * phase));
      }
      return buffer;
    };
    this.healthAlertBuffers = {
      warning: instrumentCue(2, 980, .12, .08),
      critical: instrumentCue(3, 1240, .105, .065),
    };
    // Original mechanical shutdown, not an explosion or a real equipment recording.
    // Failing combustion falls away before a short metal clunk and pressure hiss.
    this.breakdownBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 2.7), context.sampleRate);
    const breakdown = this.breakdownBuffer.getChannelData(0);
    let filteredNoise = 0;
    for (let i = 0; i < breakdown.length; i++) {
      const t = i / context.sampleRate, n = random();
      filteredNoise = filteredNoise * .92 + n * .08;
      const sputterEnvelope = Math.max(0, 1 - t / 1.15);
      const unevenPulse = Math.max(0, Math.sin(2 * Math.PI * (9 * t - 2.4 * t * t))) ** 3;
      const sputter = t < 1.15 ? sputterEnvelope * unevenPulse *
        (.22 * Math.sin(2 * Math.PI * (68 * t - 20 * t * t)) + filteredNoise * .5) : 0;
      const clunkTime = t - .78;
      const clunk = clunkTime >= 0 && clunkTime < .5 ? Math.exp(-clunkTime * 17) *
        (.2 * Math.sin(2 * Math.PI * 143 * clunkTime) + .11 * Math.sin(2 * Math.PI * 397 * clunkTime)) : 0;
      const hissTime = t - .95;
      const hiss = hissTime > 0 ? (n - filteredNoise) * .085 * Math.min(1, hissTime * 12) * Math.max(0, 1 - hissTime / 1.65) ** 1.5 : 0;
      breakdown[i] = sputter + clunk + hiss;
    }
    // Short PTT edges bracket the quieter, band-limited static beneath radio.
    this.squelchBuffer = context.createBuffer(1, Math.floor(context.sampleRate * .035), context.sampleRate);
    const squelch = this.squelchBuffer.getChannelData(0);
    for (let i = 0; i < squelch.length; i++) squelch[i] = random() * Math.sin(Math.PI * i / Math.max(1, squelch.length - 1)) * .035;
    const loop = (buffer: AudioBuffer, destination: AudioNode): void => {
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      source.connect(destination); source.start(); this.sources.push(source);
    };
    const combustion = filter('bandpass', 160, .65); combustion.connect(pulse); loop(white, combustion);
    this.loadFilter = filter('bandpass', 520, .5); this.loadFilter.connect(this.loadGain); loop(white, this.loadFilter);
    const gravel = filter('lowpass', 1200); gravel.connect(this.rollingGain); loop(noise(5, 'gravel'), gravel);
    const rattles = filter('highpass', 330); rattles.connect(this.cabinGain); loop(noise(5, 'rattle'), rattles);
    oscillator(31, .24, this.cabinGain);
    const wind = filter('lowpass', 420); wind.connect(this.windGain); loop(white, wind);
    // Recorded speech is conditioned offline. Keep unity gain and output
    // headroom here; clarity comes from channel tone and foreground ducking.
    const radioHigh = filter('highpass', 185), radioLow = filter('lowpass', 3750);
    const radioLevel = context.createGain(); radioLevel.gain.value = 1;
    radioHigh.connect(radioLow).connect(radioLevel).connect(master);
    this.radioInput = radioHigh;
    const intercomHigh = filter('highpass', 115), intercomLow = filter('lowpass', 5200);
    const intercomLevel = context.createGain(); intercomLevel.gain.value = 1;
    intercomHigh.connect(intercomLow).connect(intercomLevel).connect(master);
    this.intercomInput = intercomHigh;
    this.distantBuffers = [true,false].map(boom => {
      // Original abstract, distant game sound: diffuse pops and rumble, not recorded weapons.
      const buffer = context.createBuffer(1,Math.ceil(context.sampleRate * 1.4),context.sampleRate);
      const data = buffer.getChannelData(0);
      let smoothNoise = 0;
      const beats = boom ? [.025,.56] : [.02,.19,.31,.59];
      for (let i=0;i<data.length;i++) {
        const time=i/context.sampleRate;
        smoothNoise += .21*(random()-smoothNoise);
        let shape=0;
        for(const beat of beats) {
          const age=time-beat;
          if(age>=0) shape+=Math.min(1,age/.026)*Math.exp(-age*(boom?7:22));
        }
        data[i] = Math.min(1,(1.4-time)/.15)*shape*(smoothNoise*.58+(boom?Math.sin(time*2*Math.PI*115)*.3:0));
      }
      return buffer;
    });
  }

  /** Home has its own bounded frame clock, never a simulation tick or cue queue. */
  updateHome(delta: number, paused = false): void {
    if (this.disposed) return;
    if (!this.homeMusic) {
      this.music?.stop();
      this.cancelVoice(); this.cancelRangeShots(); this.cancelDistant(); this.clearQueuedLoads();
      this.nextDistant = undefined; this.distantIndex = 0; this.inspectionAudioTime = 0; this.soundscapeTime = 0;
      this.lastPhase = 'title'; this.lastTime = 0;
      this.lastEngine = false; this.wasMoving = false; this.vehicleContext = undefined;
      this.wasBroken = false; this.wasGuidedAlert = false; this.nextAmbient = Infinity;
      this.drivingMode = false; this.ambientIndex = 0; this.ambientNotBefore = 0; this.captionUntil = 0;
      this.vehicleLevels.clear();
      for (const node of [this.engineGain, this.rollingGain, this.cabinGain, this.windGain, this.whineGain, this.loadGain]) if (node) this.zero(node.gain);
      this.homeMusic = true; this.homeMusicTime = 0;
    }
    this.setPaused(paused);
    const playing = this.audible && this.musicOn && this.context?.state === 'running';
    if (playing && Number.isFinite(delta)) this.homeMusicTime += Math.max(0, Math.min(delta, .15));
    if (this.master) this.master.gain.value = this.audible && this.context?.state === 'running' ? .48 : 0;
    this.music?.update({ time: this.homeMusicTime, scene: 'home', audible: playing, ducked: false });
  }

  /** One quiet terminal click per newly revealed text segment; never queue catchup. */
  briefingTick(): void {
    const context = this.context;
    if (!this.homeMusic || !this.audible || !context || context.state !== 'running' || !this.master || !this.briefingBuffer ||
      (typeof document !== 'undefined' && document.hidden) || context.currentTime < this.briefingNotBefore) return;
    this.cancelBriefingTick();
    this.briefingNotBefore = context.currentTime + .125;
    const source = context.createBufferSource(); source.buffer = this.briefingBuffer;
    source.connect(this.master); this.briefingSource = source;
    source.onended = () => {
      if (this.briefingSource === source) this.briefingSource = undefined;
      source.disconnect();
    };
    try { source.start(); } catch { this.cancelBriefingTick(); }
  }

  private cancelBriefingTick(): void {
    const source = this.briefingSource; this.briefingSource = undefined;
    if (!source) return;
    source.onended = null;
    try { source.stop(); } catch { /* Already ended. */ }
    source.disconnect();
  }

  update(sim: Simulation, vehicle?: VehicleAudioContext, frameDelta = 0): void {
    if (this.disposed) return;
    if (this.homeMusic) {
      this.music?.stop(); this.cancelBriefingTick(); this.homeMusic = false; this.homeMusicTime = 0;
    }
    if (sim.time < this.lastTime) this.restart();
    this.lastTime = sim.time;
    this.setPaused(sim.paused || !!vehicle?.transportPaused, !!vehicle?.faultInspection);
    // The score and background atmosphere get a clock during inspections.
    // Voice/cues and simulation still use the frozen exercise clock.
    if (this.inspectionAmbience && this.transportAudible && this.context?.state === 'running' && Number.isFinite(frameDelta)) {
      this.inspectionAudioTime += Math.max(0, Math.min(frameDelta, .15));
    }
    this.soundscapeTime = sim.time + this.inspectionAudioTime;
    if (sim.phase === 'exterior') this.guidedMode = true;
    const changed = this.lastPhase !== sim.phase;
    const engineStopped = this.lastEngine && !sim.engine;
    this.lastPhase = sim.phase;
    this.lastEngine = sim.engine;
    this.vehicleContext = vehicle;
    const guidedAlert = sim.alert;
    const announceGuidedAlert = guidedAlert && !this.wasGuidedAlert && vehicle?.powertrain === undefined && vehicle?.training === undefined;
    // Consume the observed edge even when audio is unavailable or the range
    // owns its own health events; never replay old warnings on transport resume.
    this.wasGuidedAlert = guidedAlert;
    const breakdown = !!vehicle?.breakdown;
    if (breakdown && !this.wasBroken) {
      this.playBreakdown();
    }
    // Consume transitions during interruptions too: resume never queues a failure.
    this.wasBroken = breakdown;
    // Boarding starts one movement cadence; opening another chapter must not
    // continually postpone background net traffic.
    if (sim.moving && !this.wasMoving) this.nextAmbient = sim.time + 14;
    if (!sim.moving) this.nextAmbient = Infinity;
    this.wasMoving = sim.moving;
    if (changed) {
      this.cancelVoice();
      this.clearQueuedLoads();
      if (sim.phase !== 'title' && !breakdown && !vehicle?.terminal) {
        // Guided mode also supplies camera context. Its lack of a simulated
        // powertrain/training state distinguishes it from driving mode.
        const rangeEntry = sim.phase === 'cabin' && (vehicle?.powertrain !== undefined || vehicle?.training !== undefined);
        if (rangeEntry) this.drivingMode = true;
        if (!rangeEntry || (!vehicle?.departureCrossed && !vehicle?.practiceCompleted && vehicle?.training !== false)) {
          this.queue(rangeEntry ? this.radioNet.opening : sim.phase === 'exterior' ? this.radioNet.guidedOpening : radioScript.phase[sim.phase]);
        }
      }
    }
    // The single player relay contains pre-departure instructions. Consume it
    // after practice or at LD, even during download or before an audio tap.
    if (this.drivingMode && !this.rangeOpeningObsolete && (vehicle?.practiceCompleted || vehicle?.departureCrossed || vehicle?.training === false)) {
      this.rangeOpeningObsolete = true;
      this.cancelVoice(); this.clearQueuedLoads();
    }
    // Range completion shares the cabin phase; consume any obsolete movement
    // cue so its exact caption cannot describe an engine that has just stopped.
    if (vehicle?.terminal && vehicle.recoveryReveal) {
      if (!this.recoveryAcknowledged) {
        this.recoveryAcknowledged = true;
        this.cancelVoice(); this.clearQueuedLoads();
        this.queue(radioScript.recovery);
      }
    } else if (breakdown || vehicle?.terminal || (vehicle && engineStopped && !changed)) {
      this.cancelVoice(); this.clearQueuedLoads();
    }
    if (!this.voice && this.speakingCaption && sim.time >= this.captionUntil && !this.pending) {
      this.speakingCaption = undefined;
      this.deferredVoice = undefined;
    }
    this.resumeCurrentVoice(false);
    if (!this.drivingMode && this.audible && !vehicle?.terminal && sim.moving && !changed && sim.time >= this.nextAmbient && sim.time >= this.ambientNotBefore && !this.voice && !this.pending && !this.speakingCaption) {
      this.queue(this.guidedTraffic);
      this.ambientIndex++;
      this.nextAmbient = sim.time + this.ambientDelay();
    }
    if (!vehicle?.terminal) this.prefetch();
    const powertrain = vehicle?.powertrain;
    const inside = (this.inspectionAmbience ? this.inspectionInside : undefined) ?? vehicle?.inside ?? sim.phase !== 'exterior';
    const rpm = powertrain?.rpm ?? 720 + sim.speed * 330;
    const load = powertrain?.load ?? sim.speed;
    const whine = powertrain?.whine ?? Math.max(0, sim.speed * .45);
    if (this.master) this.master.gain.value = this.transportAudible && sim.phase !== 'title' ? .48 : 0;
    const level = (node: GainNode | undefined, value: number): void => { if (node) this.vehicleLevels.set(node, value); };
    level(this.engineGain, sim.engine ? (.21 + load * .16) * (vehicle ? inside ? .83 : 1.15 : 1) : 0);
    level(this.rollingGain, sim.moving ? (.04 + sim.speed * .32) : 0);
    level(this.cabinGain, sim.engine && inside ? (.12 + (powertrain?.roughness ?? sim.speed) * sim.speed * .14) : 0);
    level(this.windGain, sim.phase === 'exterior' ? .12 : (sim.moving ? .012 : 0));
    if (this.engineFilter) this.smooth(this.engineFilter.frequency, (inside ? 570 : 1500) + load * (inside ? 140 : 500), .09);
    level(this.whineGain, sim.engine ? whine * .105 * (inside ? .72 : 1) : 0);
    level(this.loadGain, sim.engine ? load * .14 * (inside ? .55 : 1) : 0);
    this.mixPriority();
    if (this.loadFilter) this.smooth(this.loadFilter.frequency, 380 + load * 620, .09);
    // Retain the pronounced rising mechanical character while RPM also gives
    // revs/virtual shifts an immediate pitch response beneath the slower spool.
    this.whineTones.forEach((osc, i) => { this.smooth(osc.frequency, (640 + whine * 1300 + rpm * .25) * (i ? 1.5 : 1), .085); });
    this.harmonics.forEach((osc, i) => {
      const fundamental = rpm / 30 + Math.sin(sim.time * 7.1) * (.18 + load * .22);
      this.smooth(osc.frequency, fundamental * dieselRatios[i]!, .045);
    });
    if (this.firingTone) this.smooth(this.firingTone.frequency, rpm / 60, .045);
    if (announceGuidedAlert) this.healthAlert();
    this.music?.update({ time: this.soundscapeTime, scene: musicScene({ phase: sim.phase, moving: sim.moving, faultSeverity: sim.faultSeverity, alert: sim.alert, ...vehicle }),
      audible: this.transportAudible && this.musicOn && this.context?.state === 'running' && sim.phase !== 'title', ducked: !!this.voice,
      priorityAlert: !!(this.healthAlertSource || this.breakdownSource) });
    this.updateDistant(this.soundscapeTime, !!vehicle?.departureCrossed && !vehicle.terminal && !vehicle.breakdown);
  }

  private updateDistant(time: number, allowed: boolean): void {
    if (!allowed) { this.cancelDistant(); this.nextDistant = undefined; return; }
    if (this.nextDistant === undefined) this.nextDistant = time + 3;
    const context = this.context;
    if (!this.transportAudible || !context || context.state !== "running" || !this.master || !this.distantBuffers || time < this.nextDistant) return;
    if (this.voice || this.pending || this.healthAlertSource || this.breakdownSource || this.rangeShots.size || this.distantSource) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = this.distantBuffers[this.distantIndex % 2]!;
    gain.gain.value = .135;
    source.connect(gain).connect(this.master);
    this.distantSource = { source, gain };
    source.onended = () => { if (this.distantSource?.source === source) { this.distantSource = undefined; source.disconnect(); gain.disconnect(); } };
    try {
      source.start(); this.distantIndex++; this.distantUntil = time + 1.6;
    } catch { this.cancelDistant(); }
    this.nextDistant = time + [12,15,18][this.distantIndex % 3]!;
  }

  private cancelDistant(): void {
    this.distantUntil = 0;
    const active = this.distantSource;
    this.distantSource = undefined;
    if (!active) return;
    active.source.onended = null;
    try { active.source.stop(); } catch { /* Already ended. */ }
    active.source.disconnect(); active.gain.disconnect();
  }

  private ambientDelay(): number { return 18 + (this.ambientIndex * 7 + 3) % 11; }

  private get guidedTraffic(): Cue { return radioScript.ambient[this.ambientIndex % radioScript.ambient.length]!; }

  private smooth(parameter: AudioParam, value: number, seconds: number): void {
    if (this.context && typeof parameter.setTargetAtTime === 'function') parameter.setTargetAtTime(value, this.context.currentTime, seconds);
    else parameter.value = value;
  }

  private zero(parameter: AudioParam): void {
    if (this.context && typeof parameter.cancelScheduledValues === 'function') parameter.cancelScheduledValues(this.context.currentTime);
    // A past setTarget event may still be running. A scheduled zero overrides
    // that curve as well as clearing future events; a value assignment alone
    // can be ignored while AudioParam automation is active.
    if (this.context && typeof parameter.setValueAtTime === 'function') parameter.setValueAtTime(0, this.context.currentTime);
    else parameter.value = 0;
  }

  /** A newly decoded line or alert gets headroom in the calling frame. Releases
   * are slower than attacks, avoiding a pumping engine between radio words. */
  private mixPriority(newReport?: AudioBufferSourceNode): void {
    const duck = this.breakdownSource ? .3 : this.voice ? .38 : this.healthAlertSource ? .55 : 1;
    if (this.distantSource) this.smooth(this.distantSource.gain.gain, this.voice || this.healthAlertSource || this.breakdownSource || this.rangeShots.size ? .024 : .135, .025);
    for (const [node, base] of this.vehicleLevels) {
      const target = base * duck;
      if (target === 0 || !this.transportAudible) this.zero(node.gain);
      else this.smooth(node.gain, target, target < node.gain.value ? .025 : .16);
    }
    const reportDuck = this.breakdownSource ? .28 : this.healthAlertSource ? .4 : this.voice ? .55 : 1;
    const reportSum = [...this.shotLevels.values()].reduce((sum, shot) => sum + shot.level, 0);
    // Real held fire has at most two overlapping reports and keeps the full
    // +4.3 dB lift. Only unusually coincident 3/4-shot requests share this budget.
    const overlap = Math.min(1, .64 / Math.max(.0001, reportSum * this.reportPeak * .48));
    for (const [source, { node, level }] of this.shotLevels) {
      const target = level * reportDuck * overlap;
      // A newly coincident report must not overshoot while gain smoothing catches
      // up. Priority reductions remain fast; natural tail releases stay smooth.
      if (source === newReport || (overlap < 1 && target < node.gain.value)) {
        node.gain.cancelScheduledValues(this.context!.currentTime);
        node.gain.setValueAtTime(target, this.context!.currentTime);
      } else this.smooth(node.gain, target, .015);
    }
  }

  /** Immediate game feedback only; paused or muted shots are discarded. */
  fireRangeShot(): void {
    const context = this.context;
    if (this.homeMusic || !this.audible || !context || context.state !== 'running' || !this.master || !this.rangeShotBuffer || this.rangeShots.size >= 4) return;
    const source = context.createBufferSource(); source.buffer = this.rangeShotBuffer;
    const variant = this.shotIndex++ % 3, level = [.72, .75, .69][variant]!;
    source.playbackRate.value = [.97, 1.025, 1][variant]!;
    const node = context.createGain(); node.gain.value = 0;
    source.connect(node).connect(this.master); this.rangeShots.add(source); this.shotLevels.set(source, { node, level });
    this.mixPriority(source);
    const release = (): void => { this.rangeShots.delete(source); this.shotLevels.delete(source); source.disconnect(); node.disconnect(); this.mixPriority(); };
    source.onended = release;
    try { source.start(); } catch { release(); }
  }

  /** One immediate instrument cue; mute/pause never leaves a queued alert. */
  healthAlert(severity: 'warning' | 'critical' = 'warning'): void {
    const context = this.context;
    if (this.homeMusic || !this.audible || !context || context.state !== 'running' || !this.master || !this.healthAlertBuffers || this.healthAlertSource) return;
    // Do not stack or queue annunciators. Even the longer pattern is under .5s;
    // a new state must never create an alarm backlog after pause or inspection.
    const source = context.createBufferSource(); source.buffer = this.healthAlertBuffers[severity];
    source.connect(this.master); this.healthAlertSource = source;
    this.mixPriority();
    this.music?.duck(true);
    source.onended = () => { if (this.healthAlertSource === source) this.healthAlertSource = undefined; source.disconnect(); this.mixPriority(); };
    try { source.start(); } catch { this.healthAlertSource = undefined; source.disconnect(); this.mixPriority(); }
  }

  private playBreakdown(): void {
    const context = this.context;
    if (!this.audible || !context || context.state !== 'running' || !this.master || !this.breakdownBuffer || this.breakdownSource) return;
    const source = context.createBufferSource(); source.buffer = this.breakdownBuffer;
    source.connect(this.master); this.breakdownSource = source;
    this.mixPriority();
    this.music?.duck(true);
    source.onended = () => { if (this.breakdownSource === source) this.breakdownSource = undefined; source.disconnect(); this.mixPriority(); };
    try { source.start(); } catch { this.breakdownSource = undefined; source.disconnect(); this.mixPriority(); }
  }

  private cancelRangeShots(): void {
    const breakdown = this.breakdownSource;
    this.breakdownSource = undefined;
    if (breakdown) { breakdown.onended = null; try { breakdown.stop(); } catch { /* Already ended. */ } breakdown.disconnect(); }
    const alert = this.healthAlertSource;
    this.healthAlertSource = undefined;
    if (alert) { alert.onended = null; try { alert.stop(); } catch { /* Already ended. */ } alert.disconnect(); }
    for (const source of this.rangeShots) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
      const level = this.shotLevels.get(source); if (level) { this.zero(level.node.gain); level.node.disconnect(); }
    }
    this.rangeShots.clear();
    this.shotLevels.clear();
  }

  private queue(cue: Cue): void {
    // Captions also cover unsupported devices and missing/undecodable assets.
    this.speakingCaption = line(cue);
    this.captionUntil = this.lastTime + Math.max(5, cue.text.length / 13);
    if (!this.muted && !this.paused && this.context?.state !== 'running') {
      this.deferredVoice = { cue, generation: this.generation, needsRetry: false };
      return;
    }
    if (!this.audible) return;
    if (this.buffers.has(cue.id)) this.play(cue);
    else if (this.context) {
      const pending = { cue, generation: this.generation };
      this.pending = pending;
      void this.load(cue, 'current').then(buffer => {
        if (this.pending !== pending || pending.generation !== this.generation || !this.audible) return;
        this.pending = undefined;
        if (buffer) this.play(cue);
        else if (this.lastTime < this.captionUntil) this.deferredVoice = { cue, generation: this.generation, needsRetry: true };
      });
    }
  }

  private resumeCurrentVoice(retry: boolean): void {
    const held = this.deferredVoice;
    if (!held || !this.audible || this.context?.state !== "running") return;
    if (held.generation !== this.generation || this.lastTime >= this.captionUntil) {
      this.deferredVoice = undefined;
      return;
    }
    if (held.needsRetry && !retry) return;
    this.deferredVoice = undefined;
    this.queue(held.cue);
  }

  private play(cue: Cue): void {
    const context = this.context, buffer = this.buffers.get(cue.id);
    const radio = cue.channel === 'radio';
    const input = radio ? this.radioInput : this.intercomInput;
    if (!this.audible || !context || !buffer || !input || this.lastPhase === 'title') return;
    if (context.state !== 'running') {
      this.deferredVoice = { cue, generation: this.generation, needsRetry: false };
      return;
    }
    this.cancelVoice();
    this.speakingCaption = line(cue);
    this.captionUntil = Infinity;
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(input);
    this.voice = source;
    this.mixPriority();
    this.music?.duck();
    if (radio) this.squelch();
    const generation = this.generation;
    source.onended = () => {
      if (this.voice !== source || generation !== this.generation) return;
      this.voice = undefined; this.speakingCaption = undefined;
      this.cancelRadioStatic();
      source.disconnect(); this.mixPriority();
      this.ambientNotBefore = this.lastTime + 1.4;
      if (radio) this.squelch();
    };
    // Let PTT finish before the first syllable. The scheduled source is owned
    // immediately, so pause/phase changes can cancel it before it ever sounds.
    try {
      const startsAt = context.currentTime + (radio ? .05 : 0);
      source.start(startsAt);
      if (radio) this.startRadioStatic(startsAt);
    } catch {
      this.voice = undefined; source.onended = null; source.disconnect(); this.cancelSquelches();
      this.cancelRadioStatic();
      this.mixPriority(); this.captionUntil = this.lastTime + 8;
      this.deferredVoice = { cue, generation: this.generation, needsRetry: true };
    }
  }

  private startRadioStatic(startsAt: number): void {
    const context = this.context;
    if (!this.audible || !context || !this.radioInput || !this.radioStaticBuffer || !this.voice) return;
    this.cancelRadioStatic();
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = this.radioStaticBuffer; source.loop = true;
    // Roughly thirty decibels beneath conditioned speech before the shared
    // radio filters. Intercom never connects to this noise path.
    gain.gain.value = .018;
    source.connect(gain).connect(this.radioInput);
    this.radioStatic = { source, gain };
    source.onended = () => {
      if (this.radioStatic?.source === source) this.radioStatic = undefined;
      source.disconnect(); gain.disconnect();
    };
    try { source.start(startsAt); } catch { this.cancelRadioStatic(); }
  }

  private cancelRadioStatic(): void {
    const current = this.radioStatic;
    this.radioStatic = undefined;
    if (!current) return;
    this.zero(current.gain.gain);
    current.source.onended = null;
    try { current.source.stop(); } catch { /* Already ended or failed to start. */ }
    current.source.disconnect(); current.gain.disconnect();
  }

  private squelch(): void {
    if (!this.audible || !this.context || !this.master || !this.squelchBuffer || this.squelches.size >= 2) return;
    const source = this.context.createBufferSource(); source.buffer = this.squelchBuffer;
    source.connect(this.master); this.squelches.add(source);
    source.onended = () => { this.squelches.delete(source); source.disconnect(); };
    try { source.start(); } catch { this.squelches.delete(source); source.disconnect(); }
  }

  private cancelSquelches(): void {
    for (const source of this.squelches) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
    }
    this.squelches.clear();
  }

  private cancelVoice(): void {
    this.generation++;
    this.pending = undefined;
    this.deferredVoice = undefined;
    const source = this.voice;
    this.voice = undefined;
    if (source) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    this.cancelRadioStatic();
    this.cancelSquelches();
    this.speakingCaption = undefined;
    this.mixPriority();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) {
      // An explicit Sound-on retry can recover a browser-interrupted context.
      this.syncContext();
      return;
    }
    this.muted = muted;
    if (muted) this.silence();
    else this.nextAmbient = this.wasMoving ? this.lastTime + this.ambientDelay() : Infinity;
    this.syncContext();
  }

  setPaused(paused: boolean, inspectionAmbience = false): void {
    inspectionAmbience = paused && inspectionAmbience;
    if (this.paused === paused && this.inspectionAmbience === inspectionAmbience) {
      // A cached page may restore its context independently of the exercise.
      if (paused && !inspectionAmbience && this.context?.state === 'running') this.syncContext();
      return;
    }
    if (inspectionAmbience && !this.inspectionAmbience) this.inspectionInside ??= this.vehicleContext?.inside;
    if (!paused) this.inspectionInside = undefined;
    this.paused = paused;
    this.inspectionAmbience = inspectionAmbience;
    if (paused && inspectionAmbience) {
      // Freeze dialogue progression but leave the current score, vehicle mix
      // and already playing effects connected through the modal.
      this.cancelVoice();
      this.clearQueuedLoads();
    } else if (paused) this.silence();
    this.syncContext();
  }

  private silence(): void {
    this.activationEpoch++;
    this.cancelSessionRetry();
    this.music?.stop();
    this.cancelBriefingTick();
    this.cancelDistant();
    this.cancelVoice();
    this.cancelRangeShots();
    this.cancelSquelches();
    this.clearQueuedLoads();
    for (const node of this.vehicleLevels.keys()) this.zero(node.gain);
    this.nextAmbient = this.wasMoving ? this.lastTime + this.ambientDelay() : Infinity;
    if (this.master) this.master.gain.value = 0;
  }

  private syncContext(): void {
    const context = this.context;
    if (!context || context.state === 'closed') return;
    try {
      const requestedAudible = this.transportAudible;
      const change = requestedAudible ? context.resume() : context.suspend();
      void change.then(() => {
        // A route change can resolve an earlier resume after the user muted or
        // paused. Honor the latest transport state in every resume path.
        if (context === this.context && !this.transportAudible && context.state === 'running') {
          this.syncContext();
        } else if (context === this.context && requestedAudible !== this.transportAudible && this.transportAudible && context.state === 'suspended') {
          // An older focus-loss suspend can finish after the user's Play tap.
          // Reconcile the latest request without timers or replaying cues. Its
          // completion is checked too, in case another pause arrives meanwhile.
          this.syncContext();
        }
      }).catch(() => { /* The Sound control can retry from a user tap. */ });
    } catch { /* Some devices throw synchronously while an audio route changes. */ }
  }

  restart(guided = false): void {
    this.silence();
    if (this.music instanceof RenderedScore) this.music.reset();
    this.inspectionInside = undefined;
    this.guidedMode = guided;
    this.radioNet = new RadioNet(this.random, this.radioNet.pair, this.radioCast);
    this.missionIdentity = callsignForPair(this.radioNet.pair);
    this.drivingMode = false; this.recoveryAcknowledged = false; this.rangeOpeningObsolete = false;
    this.briefingNotBefore = 0;
    this.lastPhase = 'title'; this.lastTime = 0; this.paused = false; this.inspectionAmbience = false;
    this.nextDistant = undefined; this.distantIndex = 0;
    this.inspectionAudioTime = 0; this.soundscapeTime = 0;
    this.homeMusic = false; this.homeMusicTime = 0;
    this.ambientIndex = 0; this.nextAmbient = Infinity;
    this.wasMoving = false; this.lastEngine = false; this.ambientNotBefore = 0;
    this.vehicleContext = undefined;
    this.wasBroken = false;
    this.wasGuidedAlert = false;
    this.shotIndex = 0;
    this.vehicleLevels.clear();
    for (const node of [this.engineGain, this.rollingGain, this.cabinGain, this.windGain, this.whineGain, this.loadGain]) if (node) this.zero(node.gain);
    this.syncContext();
  }

  dispose(): void {
    if (this.disposed) return;
    this.silence(); this.disposed = true; this.started = false;
    this.restorePlaybackSession(); this.playbackSession = undefined;
    this.music?.dispose(); this.music = undefined;
    for (const source of this.sources) { try { source.stop(); } catch { /* Already stopped. */ } }
    this.sources = []; this.harmonics = []; this.whineTones = []; this.buffers.clear(); this.loads.clear(); this.voiceBackoff.clear();
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined; this.master = undefined;
    this.rangeShotBuffer = undefined;
    this.radioStaticBuffer = undefined;
    this.healthAlertBuffers = undefined;
    this.breakdownBuffer = undefined; this.distantBuffers = undefined;
  }
}
