import type { MissionDebrief } from './mission-contract.ts';
export const RECOVERY_REVEAL_SECONDS = 5;

/** Brief presentation time after breakdown; never changes mission time or results. */
export class OutcomeReveal {
  private report: MissionDebrief | null = null;
  private elapsed = 0;
  private get duration(): number { return this.report?.outcome === 'breakdown' ? 3 : this.report?.outcome === 'recovery' ? RECOVERY_REVEAL_SECONDS : 0; }
  get ready(): boolean { return !!this.report && this.elapsed >= this.duration; }
  get recoveryElapsed(): number | null { return this.report?.outcome === 'recovery' && !this.ready ? this.elapsed : null; }
  update(report: MissionDebrief | null, delta: number, active: boolean): void {
    if (report !== this.report) { this.report = report; this.elapsed = 0; }
    if (this.duration > 0 && active && Number.isFinite(delta) && delta > 0) this.elapsed = Math.min(this.duration, this.elapsed + Math.min(delta, .1));
  }
  reset(): void { this.report = null; this.elapsed = 0; }
}
