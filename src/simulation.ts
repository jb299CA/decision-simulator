export type Phase = 'title' | 'exterior' | 'cabin' | 'feed' | 'manifold' | 'turbine' | 'insight' | 'halted' | 'secured' | 'service' | 'debrief';
export type Observation = { time: number; voltage: number; load: number; fresh: boolean; engine: boolean };
export type TimelineEntry = { label: string; detail: string };
export class Simulation {
  phase: Phase = 'title';
  paused = false;
  time = 0;
  drivingTime = 0;
  speed = 0;
  engine = false;
  secured = false;
  isolated = false;
  faultSeverity = 0;
  observations: Observation[] = [];
  timeline: TimelineEntry[] = [];
  private sampleClock = 0;
  get latest(): Observation { return this.observations.at(-1) ?? { time: 0, voltage: 28.1, load: .58, fresh: true, engine: this.engine }; }
  get alert(): boolean {
    // Demonstration values only: an elevated plateau remains evidence after its
    // initial slope disappears. A retained old sample must never sustain an alert.
    const usable = (o: Observation) => o.fresh && o.engine &&
      Number.isFinite(o.time) && Number.isFinite(o.voltage) && Number.isFinite(o.load) &&
      o.load >= 0 && o.load <= 1 && o.time >= 0 && o.time <= this.time + 1e-6;
    const latest = this.observations.at(-1);
    if (!this.engine || !latest || !usable(latest) || this.time - latest.time > 1.2) return false;
    const baseline = this.observations.filter(o => usable(o) && o.time <= 3.6).slice(0, 5);
    const recent = this.observations.filter(o => usable(o) && this.time - o.time <= 3.6).slice(-5);
    if (baseline.length < 4 || recent.length < 4) return false;
    if (recent.some((o, i) => i > 0 && o.time <= recent[i - 1]!.time)) return false;
    const baselineVoltage = baseline.reduce((sum, o) => sum + o.voltage, 0) / baseline.length;
    const baselineLoad = baseline.reduce((sum, o) => sum + o.load, 0) / baseline.length;
    // Only compare this vignette's voltage rise under a similar normalized load.
    // The broad synthetic tolerance includes the generated +/- .07 variation;
    // a substantially different operating context requires more investigation.
    if (recent.some(o => Math.abs(o.load - baselineLoad) > .18)) return false;
    return recent.filter(o => o.voltage > 29.2 && o.voltage - baselineVoltage > .75).length >= 3;
  }
  get moving(): boolean { return this.engine && ['cabin', 'feed', 'manifold', 'turbine', 'insight'].includes(this.phase); }
  begin() { if (this.phase !== 'title' || this.paused) return false; this.phase = 'exterior'; this.engine = true; return true; }
  board() { if (this.phase !== 'exterior' || this.paused) return false; this.phase = 'cabin'; return true; }
  advance(): boolean {
    const next: Partial<Record<Phase, Phase>> = { cabin: 'feed', feed: 'manifold', manifold: 'turbine', turbine: 'insight', secured: 'service' };
    const phase = next[this.phase];
    if (!phase || this.paused) return false;
    if (phase === 'service' && (!this.secured || this.engine || this.speed !== 0)) return false;
    this.phase = phase;
    if (phase === 'feed') this.timeline.push({ label: 'Evidence', detail: 'Existing vehicle feed inspected through the MFoCS environment.' });
    if (phase === 'insight') this.timeline.push({ label: 'Insight', detail: 'Charging trend evaluated with load, engine state and fresh observations.' });
    return true;
  }
  tick(delta: number) {
    if (!Number.isFinite(delta) || this.paused || this.phase === 'title' || this.phase === 'debrief') return;
    const dt = Math.max(0, Math.min(delta, .15));
    this.time += dt;
    this.speed = this.moving ? Math.min(1, this.speed + dt * .3) : Math.max(0, this.speed - dt * .8);
    if (this.moving) this.drivingTime += dt;
    // Latent fault is separate from observation processing. Synthetic units are illustrative.
    if (this.moving) this.faultSeverity = Math.min(1, this.drivingTime / 14);
    this.sampleClock += dt;
    if (this.sampleClock + 1e-9 >= .6) {
      this.sampleClock = Math.max(0, this.sampleClock - .6);
      const sampleTime = this.time - this.sampleClock;
      const sampleSeverity = this.moving ? Math.min(1, (this.drivingTime - this.sampleClock) / 14) : this.faultSeverity;
      const ripple = Math.sin(sampleTime * 1.7) * .055;
      const voltage = this.engine ? 28.1 + sampleSeverity * 2.25 + ripple + Math.sin(sampleTime * .4) * .03 : 24.5;
      this.observations.push({ time: sampleTime, voltage, load: .58 + Math.sin(sampleTime * .31) * .07, fresh: true, engine: this.engine });
      // Preserve the initial baseline while bounding the live evidence buffer.
      if (this.observations.length > 100) this.observations.splice(5, 1);
    }
  }
  halt(): boolean {
    if (this.phase !== 'insight' || !this.alert || this.paused) return false;
    this.phase = 'halted'; this.speed = 0;
    this.timeline.push({ label: 'Decision', detail: 'Crew halted the vehicle in response to the charging-system anomaly.' });
    return true;
  }
  secure(): boolean {
    if (this.phase !== 'halted' || this.speed !== 0 || this.paused) return false;
    this.engine = false; this.secured = true; this.phase = 'secured';
    return true;
  }
  isolate(): boolean {
    if (this.phase !== 'service' || !this.secured || this.engine || this.speed !== 0 || this.paused) return false;
    this.isolated = true; this.phase = 'debrief';
    this.timeline.push({ label: 'Result', detail: 'Suspected source isolated. Damaging exposure ended in this scenario; repair required.' });
    return true;
  }
  restart() { Object.assign(this, new Simulation()); }
}
