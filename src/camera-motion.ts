import type { Phase } from './simulation';

export type CrewView = 'commander' | 'inside';
type MotionInput = { phase: Phase; view: CrewView; delta: number; paused: boolean; reducedMotion: boolean; moving: boolean; speed: number };
const region = (phase: Phase) => ['title', 'exterior'].includes(phase) ? 'outside' : ['secured', 'service', 'debrief'].includes(phase) ? 'exercise' : 'crew';
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Presentation time is independent of telemetry, but shares pause/visibility gating. */
export class CameraMotion {
  private requested = '';
  private clock = 0;
  private age = 0;
  private elapsed = 1;
  private cut = false;
  private fromPhase: Phase = 'title';
  private fromView: CrewView = 'commander';
  private phase: Phase = 'title';
  private view: CrewView = 'commander';
  private snapshot = { key: '', phase: 'title' as Phase, view: 'commander' as CrewView, cut: false, progress: 1, fade: 0, offset: [0, 0, 0] as [number, number, number], pitch: 0, roll: 0 };

  update(input: MotionInput) {
    // Return the identical pose, including an unfinished fade, during pause or a hidden-tab delta.
    if (this.requested && (input.paused || input.delta <= 0)) return this.snapshot;
    const dt = input.paused ? 0 : Math.max(0, Math.min(Number.isFinite(input.delta) ? input.delta : 0, .1));
    const key = `${input.phase}:${input.view}`;
    if (key !== this.requested) {
      this.fromPhase = this.snapshot.phase; this.fromView = this.snapshot.view;
      this.cut = region(this.fromPhase) !== region(input.phase) || this.fromView !== input.view || ['secured', 'service', 'debrief'].includes(input.phase);
      this.phase = input.phase; this.view = input.view;
      this.requested = key; this.elapsed = this.snapshot.key ? 0 : 1; this.age = 0;
      if (input.phase === 'title') this.clock = 0;
    } else {
      this.elapsed += dt; this.age += dt;
    }
    this.clock += dt;
    const progress = input.reducedMotion ? 1 : Math.min(1, this.elapsed / (this.cut ? .8 : .75));
    const switched = !this.cut || progress >= .42;
    const phase = switched ? this.phase : this.fromPhase;
    const view = switched ? this.view : this.fromView;
    const fade = this.cut && progress < 1 ? (progress < .42 ? smooth(progress / .42) : 1 - smooth((progress - .42) / .58)) : 0;
    const amplitude = !input.reducedMotion && region(phase) === 'crew' && input.moving ? Math.max(0, Math.min(1, input.speed)) : 0;
    const t = this.clock;
    // Bounded, deterministic local vibration; never integrated into the base camera pose.
    const settle = !input.reducedMotion && phase === 'halted' ? Math.exp(-this.age * 3.8) : 0;
    this.snapshot = {
      key, phase, view, cut: this.cut, progress: smooth(progress), fade,
      offset: [(Math.sin(t * 5.7) * .013 + Math.sin(t * 17.3) * .003) * amplitude,
        (Math.sin(t * 8.2) * .019 + Math.sin(t * 23.1) * .004) * amplitude + Math.sin(this.age * 13) * .018 * settle,
        Math.sin(t * 6.3) * .008 * amplitude] as [number, number, number],
      pitch: (Math.sin(t * 8.8) * .0028 + Math.sin(t * 19.7) * .0007) * amplitude + Math.sin(this.age * 11) * .0035 * settle,
      roll: Math.sin(t * 5.2) * .0038 * amplitude + Math.sin(this.age * 9) * .003 * settle,
    };
    if (input.reducedMotion) { this.snapshot.offset = [0, 0, 0]; this.snapshot.pitch = 0; this.snapshot.roll = 0; }
    return this.snapshot;
  }
}
