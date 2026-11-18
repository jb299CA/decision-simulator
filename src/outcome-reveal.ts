import type { MissionDebrief } from './mission-contract.ts';

/** Brief presentation time after breakdown; never changes mission time or results. */
export class OutcomeReveal {
  private report: MissionDebrief | null = null;
  private elapsed = 0;
  get ready(): boolean { return !!this.report && (this.report.outcome !== 'breakdown' || this.elapsed >= 3); }
  update(report: MissionDebrief | null, delta: number, active: boolean): void {
    if (report !== this.report) { this.report = report; this.elapsed = 0; }
    if (report?.outcome === 'breakdown' && active && Number.isFinite(delta) && delta > 0) this.elapsed = Math.min(3, this.elapsed + Math.min(delta, .1));
  }
  reset(): void { this.report = null; this.elapsed = 0; }
}
