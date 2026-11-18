import type { Phase } from './simulation.ts';

export type MusicScene = 'practice' | 'movement' | 'contact' | 'warning' | 'severe' | 'resolution';
export type MusicSituation = { phase: Phase; moving: boolean; faultSeverity: number; alert: boolean; training?: boolean; contact?: boolean; health?: string; terminal?: boolean };
export type MusicFrame = { time: number; scene: MusicScene; audible: boolean; ducked: boolean; priorityAlert?: boolean };

/** Original small tonal palette: no recorded music, borrowed melody or military signal. */
export const MUSIC_PROFILES: Record<MusicScene, { notes: readonly number[]; motif: readonly number[]; beatsPerMinute: number; bed: number; drum: number }> = {
  practice: { notes: [110, 164.81, 220], motif: [0, -1, 1, 0, 2, -1, 1, -1], beatsPerMinute: 48, bed: .04, drum: .009 },
  movement: { notes: [110, 130.81, 164.81], motif: [0, -1, 2, 1, 0, 1, 2, -1], beatsPerMinute: 64, bed: .043, drum: .014 },
  contact: { notes: [110, 116.54, 164.81], motif: [0, 0, -1, 1, 2, -1, 1, -1], beatsPerMinute: 84, bed: .044, drum: .016 },
  warning: { notes: [103.83, 130.81, 155.56], motif: [0, -1, 1, -1, 2, 1, 0, -1], beatsPerMinute: 68, bed: .04, drum: .011 },
  severe: { notes: [98, 103.83, 146.83], motif: [0, -1, 1, 0, 1, -1, 2, -1], beatsPerMinute: 88, bed: .043, drum: .015 },
  resolution: { notes: [110, 138.59, 164.81], motif: [2, -1, -1, 1, 0, -1, -1, -1], beatsPerMinute: 48, bed: .034, drum: 0 },
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
export function musicLevels(frame: MusicFrame): { bed: number; melody: number; melodyFrequency: number; drum: number; frequency: number } {
  if (!frame.audible || !Number.isFinite(frame.time) || frame.time < 0) return { bed: 0, melody: 0, melodyFrequency: 440, drum: 0, frequency: 180 };
  const profile = MUSIC_PROFILES[frame.scene], time = frame.time;
  const beat = time * profile.beatsPerMinute / 60;
  const age = (beat - Math.floor(beat)) * 60 / profile.beatsPerMinute;
  // A soft triangle tom and sparse horn-like phrase carry the score above the
  // bass region on small speakers. All phrases are original, with breathing rests.
  const accent = Math.floor(beat) % 4 === 0 ? 1 : .55;
  const pulse = Math.min(1, age / .018) * Math.exp(-age * 13) * accent;
  const note = profile.motif[Math.floor(beat) % profile.motif.length]!;
  const envelope = Math.min(1, age / .07) * Math.min(1, (60 / profile.beatsPerMinute - age) / .2) * Math.exp(-age * .45);
  // Dialogue stays in front without making the entire opening score vanish.
  // Brief instrument/breakdown cues retain the deeper, immediate reduction.
  const duck = frame.priorityAlert ? .12 : frame.ducked ? .35 : 1;
  return { bed: profile.bed * (.9 + .1 * Math.sin(time * .19)) * duck,
    melody: note < 0 ? 0 : profile.bed * .8 * envelope * duck,
    melodyFrequency: profile.notes[Math.max(0, note)]! * 4,
    drum: profile.drum * pulse * duck, frequency: 180 + 60 * Math.exp(-age * 16) };
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
      this.tones = [this.tone('sine', notes[0]!), this.tone('triangle', notes[1]! * 2), this.tone('triangle', notes[0]! * 4)];
      this.drum = this.tone('triangle', 180);
    }
    const profile = MUSIC_PROFILES[frame.scene], levels = musicLevels(frame);
    this.tones.forEach((tone, index) => {
      const frequency = index === 2 ? levels.melodyFrequency : profile.notes[index]! * (index ? 2 : 1);
      this.value(tone.oscillator.frequency, frequency, index === 2 ? .035 : .55);
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
    this.tones = []; this.drum = undefined; this.frame = undefined;
  }

  dispose(): void { this.stop(); this.disposed = true; }
}
