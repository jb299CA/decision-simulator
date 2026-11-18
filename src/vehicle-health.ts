import type { FaultId, HealthDecision, VehicleFault, VehicleHealthState } from './mission-contract.ts';

const bounded = (value: number): number => Math.max(0, Math.min(1, value));
const profiles = [
  { id: 'charging', label: 'Charging output high', component: 'Charging system', moderate: 6, severe: 30, major: 60, fatal: Infinity, rise: 80 },
  { id: 'cooling', label: 'Coolant temperature rising', component: 'Cooling system', moderate: 20, severe: 50, major: 80, fatal: 95, rise: 85 },
  { id: 'wheel-end', label: 'Wheel-end vibration increasing', component: 'Wheel end', moderate: 35, severe: 55, major: 65, fatal: Infinity, rise: 120 },
] as const;

function freshFaults(): VehicleFault[] {
  return profiles.map(profile => ({
    id: profile.id, label: profile.label, component: profile.component, severity: 'normal', diagnosed: false,
    firstWarningAt: null, severeAt: null, exposure: 0, damage: 0, baseline: 100, reading: 100,
    observations: [{ time: 0, value: 100 }], consequence: 'No abnormal trend recorded.', maintenance: 'none',
    repair: 'Routine post-exercise inspection.',
  }));
}

/** Relative readings and exposure are fictional game abstractions, never equipment limits. */
export class VehicleHealth {
  readonly state: VehicleHealthState = {
    phase: 'nominal', diagnosed: false, continued: false, alertSerial: 0,
    movingSeconds: 0, continuedSeconds: 0, baseline: .42, signal: .42,
    observations: [{ time: 0, value: .42 }], decisions: [], faults: freshFaults(), paceLimited: false, breakdownCause: null,
    message: 'Synthetic vehicle readings start at 100% of their own baseline. No equipment operating limits are shown.',
  };
  private sampleSeconds = 0;

  tick(dt: number, moving: boolean, time: number): void {
    const state = this.state;
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(time) || !moving || state.phase === 'recovery' || state.phase === 'broken') return;
    state.movingSeconds += dt;
    state.continuedSeconds = Math.max(0, state.movingSeconds - 6);
    for (const fault of state.faults) {
      const profile = profiles.find(profile => profile.id === fault.id)!;
      fault.exposure += dt * (state.paceLimited ? .12 : 1);
      fault.damage = bounded(fault.exposure / (Number.isFinite(profile.fatal) ? profile.fatal : profile.major));
      const next = fault.exposure >= profile.fatal - 1e-9 ? 'failed'
        : fault.exposure >= profile.severe - 1e-9 ? 'severe'
          : fault.exposure >= profile.moderate - 1e-9 ? 'moderate' : 'normal';
      if (next !== fault.severity) {
        fault.severity = next; fault.diagnosed = false; state.alertSerial++;
        if (fault.firstWarningAt === null) fault.firstWarningAt = time;
        if ((next === 'severe' || next === 'failed') && fault.severeAt === null) fault.severeAt = time;
        state.message = `${fault.label}: ${next} synthetic alert. Inspect the trend and choose a crew response.`;
      }
      fault.reading = 100 + Math.min(1.5, fault.exposure / 95) * profile.rise;
      fault.maintenance = next === 'failed' || fault.exposure >= profile.major - 1e-9 ? 'major'
        : next === 'severe' ? 'repair' : next === 'moderate' ? 'inspection' : 'none';
      const componentWear = fault.id === 'charging' ? 'Abnormal charging output can damage the charging system and battery.'
        : fault.id === 'cooling' ? 'Rising coolant temperature can lead to overheating and engine damage.'
          : 'Increasing wheel-end vibration can worsen bearing and wheel-end wear.';
      fault.consequence = next === 'failed' ? 'Vehicle stopped after overheating. Recovery required.'
        : next !== 'normal' ? `${componentWear} ${fault.maintenance === 'major' ? 'Delayed action left major repair needs.' : next === 'severe' ? 'Repair is required after the exercise.' : 'Early pace reduction can limit further damage.'}`
          : 'No abnormal trend recorded.';
      const inspection = fault.id === 'charging' ? 'Inspect charging output and battery condition; the alternator cause remains unconfirmed.'
        : fault.id === 'cooling' ? 'Inspect the cooling system and assess engine condition.'
          : 'Inspect wheel-end wear and bearing condition.';
      fault.repair = fault.maintenance === 'major' ? `Major ${profile.component.toLowerCase()} repair required. ${inspection}`
        : fault.maintenance === 'repair' ? `${profile.component} repair required before return to service. ${inspection}`
          : fault.maintenance === 'inspection' ? inspection : 'Routine post-exercise inspection.';
      if (next === 'failed') state.breakdownCause = fault.id;
    }
    state.phase = state.breakdownCause ? 'broken' : state.faults.some(fault => fault.severity === 'severe') ? 'critical'
      : state.faults.some(fault => fault.severity === 'moderate') ? 'warning' : 'nominal';
    state.diagnosed = state.faults.filter(fault => fault.severity !== 'normal').every(fault => fault.diagnosed)
      && state.faults.some(fault => fault.diagnosed);
    state.signal = bounded(state.baseline + Math.max(...state.faults.map(fault => (fault.reading - 100) / 200)));
    if (state.phase === 'broken') state.message = 'Vehicle stopped after overheating. Engine off. Recovery and an engine assessment are required.';
    this.sampleSeconds += dt;
    if (this.sampleSeconds >= .5 - 1e-9) {
      this.sampleSeconds = Math.max(0, this.sampleSeconds - .5);
      state.observations = [...state.observations, { time, value: state.signal }].slice(-48);
      for (const fault of state.faults) fault.observations = [...fault.observations, { time, value: fault.reading }].slice(-48);
    }
  }

  decide(action: HealthDecision, time: number, faultId?: FaultId): boolean {
    const state = this.state;
    if (state.phase === 'recovery' || state.phase === 'broken' || !Number.isFinite(time) || time < 0) return false;
    const fault = faultId ? state.faults.find(fault => fault.id === faultId)
      : [...state.faults].sort((a, b) => b.damage - a.damage)[0];
    if (!fault) return false;
    if (action === 'diagnose') {
      if (fault.diagnosed) return false;
      fault.diagnosed = true;
      state.diagnosed = state.faults.filter(fault => fault.severity !== 'normal').every(fault => fault.diagnosed);
      state.message = fault.id === 'charging'
        ? 'Charging evidence inspected. Alternator trouble is one possibility, not a proven diagnosis. Inspection does not repair the fault.'
        : `${fault.label}: relative trend inspected. This evidence suggests a concern, not a confirmed component diagnosis. Inspection does not repair the fault.`;
    } else if (action === 'continue') {
      if (state.phase === 'nominal' || state.continued) return false;
      state.continued = true;
      state.message = 'Crew acknowledged the unresolved faults and continued. Damage still accumulates with movement.';
    } else if (action === 'reduce-pace') {
      if (state.paceLimited) return false;
      state.paceLimited = true;
      state.message = 'Pace reduced. Existing damage remains; further damage builds more slowly.';
    } else if (action === 'recovery') {
      if (state.phase === 'nominal') return false;
      state.phase = 'recovery';
      state.message = 'In-game recovery requested. Vehicle stopped, engine off, repair still required. No real request was sent.';
    } else return false;
    state.decisions = [...state.decisions, { action, time, ...(action === 'diagnose' ? { faultId: fault.id } : faultId ? { faultId } : {}) }].slice(-32);
    return true;
  }

  restart(): void {
    Object.assign(this.state, new VehicleHealth().state);
    this.sampleSeconds = 0;
  }
}
