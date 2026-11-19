import type { Phase, Simulation } from './simulation.ts';

export const GUIDED_STEPS: readonly { phase: Phase; label: string }[] = [
  { phase: 'exterior', label: 'Meet the vehicle' },
  { phase: 'cabin', label: 'Inspect MFoCS' },
  { phase: 'feed', label: 'Compare charging readings' },
  { phase: 'manifold', label: 'Follow Manifold access' },
  { phase: 'turbine', label: 'Review Turbine preparation' },
  { phase: 'insight', label: 'Make the halt decision' },
  { phase: 'halted', label: 'Secure and shut down' },
  { phase: 'secured', label: 'Review service conditions' },
  { phase: 'service', label: 'Record abstract isolation' },
  { phase: 'debrief', label: 'Review the outcome' },
];

const OBJECTIVES: Partial<Record<Phase, { objective: string; detail: string; label: string }>> = {
  exterior: { objective: 'Follow a vehicle-health warning.', detail: 'You are the crew decision-maker. Enter the cabin, inspect the readings, follow the data path, then halt and secure the vehicle. No driving controls are needed.', label: 'Enter the cabin' },
  cabin: { objective: 'Inspect the charging system.', detail: 'Open MFoCS. Select Charging output or its sensor dot, and compare the live readings. The display can be hidden at any time.', label: 'Check charging output' },
  feed: { objective: 'Compare output, load and engine state.', detail: 'Compare charging output with the start of this run while the engine runs under similar load. A rising reading alone does not prove an alternator failure.', label: 'Follow the readings to Manifold' },
  manifold: { objective: 'See where the readings come from.', detail: 'Manifold uses existing vehicle / MFoCS access. It keeps charging output, electrical load, engine state and reading time together.', label: 'See how Turbine prepares the readings' },
  turbine: { objective: 'Review how the readings become evidence.', detail: 'Turbine pulls, translates and structures the readings for comparison over time. Analytics turns that comparison into a crew warning.', label: 'Review the charging warning' },
  insight: { objective: 'Decide when to halt the vehicle.', detail: 'Use the sustained charging warning to halt movement. Secure and shut down before any service step. Alternator suspected; not confirmed.', label: 'Halt the vehicle' },
  halted: { objective: 'Secure and shut down.', detail: 'Movement has stopped, but the engine is still running. Secure the vehicle and shut down before the service interaction.', label: 'Secure and shut down' },
  secured: { objective: 'Review the service conditions.', detail: 'Vehicle stationary. Engine off. Vehicle secured. The next step is an abstract exercise interaction with a qualified maintainer.', label: 'Open the service step' },
  service: { objective: 'Record safe isolation.', detail: 'Record that the suspected source was isolated under the applicable service procedure. No wiring procedure is shown. Repair is still required.', label: 'Record safe isolation' },
};

/** UI state stays separate from the exercise: hiding a display never advances it. */
export class GuidedExercise {
  displayOpen = false;
  reset(): void { this.displayOpen = false; }
  toggleDisplay(): void { this.displayOpen = !this.displayOpen; }
  describe(sim: Simulation) {
    const step = GUIDED_STEPS.findIndex(step => step.phase === sim.phase);
    const objective = OBJECTIVES[sim.phase];
    const inspection = ['cabin', 'feed', 'manifold', 'turbine', 'insight'].includes(sim.phase);
    const needsDisplay = inspection && !this.displayOpen;
    const waiting = sim.phase === 'insight' && !sim.alert;
    const reason = sim.paused ? 'Exercise paused. Select Resume to continue.'
      : needsDisplay ? 'Open MFoCS to inspect this step. Opening the display does not advance the exercise.'
      : waiting ? 'Waiting for sustained fresh readings under similar load. Leave the exercise running; the halt action becomes available when the warning is supported.'
      : sim.phase === 'cabin' ? 'Select the charging sensor, then continue when you have inspected it.'
      : sim.phase === 'secured' || sim.phase === 'service' ? 'Vehicle remains out of service. This exercise action does not repair it.'
      : 'Continue when you have reviewed this step. You control the pace.';
    return { step, objective: objective?.objective ?? 'Vehicle secured. Repair required.', detail: objective?.detail ?? 'Review your decision record.',
      label: needsDisplay ? 'Open MFoCS to inspect' : objective?.label ?? 'Review outcome',
      disabled: sim.paused || (!needsDisplay && waiting) || !objective,
      reason, needsDisplay,
      progress: GUIDED_STEPS.map((entry, index) => ({ ...entry, state: index < step ? 'complete' : index === step ? 'current' : 'upcoming' })),
    };
  }
  activate(sim: Simulation): boolean {
    const action = this.describe(sim);
    if (action.disabled) return false;
    if (action.needsDisplay) { this.displayOpen = true; return false; }
    if (sim.phase === 'exterior') return sim.board();
    if (sim.phase === 'insight') return sim.halt();
    if (sim.phase === 'halted') return sim.secure();
    if (sim.phase === 'service') return sim.isolate();
    return sim.advance();
  }
}
