import type { Phase } from './simulation.ts';

export type MusicScene = 'practice' | 'movement' | 'contact' | 'warning' | 'severe' | 'resolution';
export type MusicSituation = { phase: Phase; moving: boolean; faultSeverity: number; alert: boolean; training?: boolean; contact?: boolean; health?: string; terminal?: boolean };
export type MusicFrame = { time: number; scene: MusicScene; audible: boolean; ducked: boolean };

/** Original small tonal palette: no recorded music, borrowed melody or military signal. */
export const MUSIC_PROFILES: Record<MusicScene, { notes: readonly number[]; beatsPerMinute: number; bed: number; drum: number }> = {
  practice: { notes: [110, 164.81, 220], beatsPerMinute: 48, bed: .03, drum: .007 },
  movement: { notes: [110, 130.81, 164.81], beatsPerMinute: 64, bed: .034, drum: .014 },
  contact: { notes: [110, 116.54, 164.81], beatsPerMinute: 84, bed: .037, drum: .02 },
  warning: { notes: [103.83, 130.81, 155.56], beatsPerMinute: 68, bed: .031, drum: .012 },
  severe: { notes: [98, 103.83, 146.83], beatsPerMinute: 88, bed: .034, drum: .018 },
  resolution: { notes: [110, 138.59, 164.81], beatsPerMinute: 48, bed: .026, drum: 0 },
};

export function musicScene(situation: MusicSituation): MusicScene {
  if (situation.terminal || ['secured', 'service', 'debrief'].includes(situation.phase)) return 'resolution';
  if (situation.health === 'critical' || situation.health === 'broken' || (!situation.health && situation.alert && situation.faultSeverity >= .9)) return 'severe';
  if (situation.health === 'warning' || (!situation.health && situation.alert)) return 'warning';
  if (situation.contact) return 'contact';
  if (situation.moving && !situation.training) return 'movement';
  return 'practice';
}

/** No note timers or future queue: each frame describes only the current sim instant. */
export function musicLevels(frame: MusicFrame): { bed: number; drum: number; frequency: number } {
  if (!frame.audible || !Number.isFinite(frame.time) || frame.time < 0) return { bed: 0, drum: 0, frequency: 52 };
  const profile = MUSIC_PROFILES[frame.scene], time = frame.time;
  const beat = time * profile.beatsPerMinute / 60;
  const age = (beat - Math.floor(beat)) * 60 / profile.beatsPerMinute;
  // Soft, short low-tom envelope. Alternating accents suggest a restrained march.
  const accent = Math.floor(beat) % 4 === 0 ? 1 : .55;
  const pulse = Math.min(1, age / .018) * Math.exp(-age * 13) * accent;
  const duck = frame.ducked ? .12 : 1;
  return { bed: profile.bed * (.9 + .1 * Math.sin(time * .19)) * duck, drum: profile.drum * pulse * duck, frequency: 50 + 18 * Math.exp(-age * 16) };
}

/** Quiet synthesized score. All sound sources are stopped at every interruption. */
export class ProceduralMusic {
  private tones: { oscillator: OscillatorNode; level: GainNode }[] = [];
  private drum?: { oscillator: OscillatorNode; level: GainNode };
  private disposed = false;
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

  update(frame: MusicFrame): void {
    if (this.disposed) return;
    this.frame = { ...frame };
    if (!frame.audible || !Number.isFinite(frame.time) || frame.time < 0) { this.stop(); return; }
    if (!this.tones.length) {
      const notes = MUSIC_PROFILES[frame.scene].notes;
      this.tones = [this.tone('sine', notes[0]!), this.tone('sine', notes[1]!), this.tone('triangle', notes[2]!)];
      this.drum = this.tone('sine', 52);
    }
    const profile = MUSIC_PROFILES[frame.scene], levels = musicLevels(frame);
    this.tones.forEach((tone, index) => {
      // Slow octave color changes are derived from simulation time as well.
      const octave = index === 2 && Math.floor(frame.time / 16) % 2 ? .5 : 1;
      this.value(tone.oscillator.frequency, profile.notes[index]! * octave, .55);
      this.value(tone.level.gain, levels.bed * [1, .65, .22][index]!, frame.ducked ? .025 : .25);
    });
    if (this.drum) {
      this.value(this.drum.oscillator.frequency, levels.frequency, .02);
      this.value(this.drum.level.gain, levels.drum, frame.ducked ? .015 : .025);
    }
  }

  /** An alert or newly decoded radio line can duck immediately between frames. */
  duck(): void { if (this.frame?.audible) this.update({ ...this.frame, ducked: true }); }

  stop(): void {
    for (const tone of [...this.tones, ...(this.drum ? [this.drum] : [])]) {
      // Cancel smoothing at the current audio instant; nothing survives a pause.
      if (typeof tone.level.gain.cancelScheduledValues === 'function') tone.level.gain.cancelScheduledValues(this.context.currentTime);
      tone.level.gain.value = 0;
      try { tone.oscillator.stop(); } catch { /* Already ended. */ }
      tone.oscillator.disconnect(); tone.level.disconnect();
    }
    this.tones = []; this.drum = undefined; this.frame = undefined;
  }

  dispose(): void { this.stop(); this.disposed = true; }
}
