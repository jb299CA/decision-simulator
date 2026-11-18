import type { VehicleFault } from './mission-contract.ts';
import { systemHealthScore } from './health-score.ts';

/** Plot only recorded samples. Relative values are exercise data, not operating limits. */
export function faultInstrumentData(fault: Pick<VehicleFault, 'reading' | 'baseline' | 'observations'>) {
  const samples = fault.observations.filter(point => Number.isFinite(point.time) && point.time >= 0 && Number.isFinite(point.value))
    .map(point => ({ ...point })).sort((a, b) => a.time - b.time);
  const baseline = Number.isFinite(fault.baseline) ? fault.baseline : null;
  const current = Number.isFinite(fault.reading) ? fault.reading : null;
  const allValues = [...samples.map(point => point.value), ...(baseline === null ? [] : [baseline]), ...(current === null ? [] : [current])];
  const minimum = allValues.length ? Math.min(...allValues) : 0;
  const maximum = allValues.length ? Math.max(...allValues) : 100;
  const padding = Math.max(5, (maximum - minimum) * .12);
  const low = Math.floor((minimum - padding) / 5) * 5;
  const high = Math.ceil((maximum + padding) / 5) * 5;
  const first = samples[0]?.time ?? 0;
  const last = samples.at(-1) ?? null;
  const duration = Math.max(1, (last?.time ?? first) - first);
  const x = (time: number) => 48 + (time - first) / duration * 432;
  const y = (value: number) => 132 - (value - low) / (high - low) * 108;
  return { samples, baseline, current, delta: current === null || baseline === null ? null : current - baseline,
    first, last, low, high, x, y, ticks: [low, (low + high) / 2, high],
    points: samples.map(point => `${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ') };
}

export function systemsHealthMarkup(faults: readonly VehicleFault[]): string {
  const health = systemHealthScore(faults);
  const label = health.level === 'failed' ? 'Failed' : health.label;
  const description = 'Simulated systems condition, 0 to 100. Based on exercise fault severity and accumulated damage. Separate from hull integrity. Inspection does not repair damage.';
  const valueText = health.available ? `${health.score} of 100. ${label}. ${health.activeFaults} active faults. Simulated systems condition, separate from hull integrity.` : 'Systems condition unavailable. No data.';
  return `<div class="systems-health" data-severity="${health.level}" title="${description}"><span class="systems-health-title">SYSTEMS<br>HEALTH <small>SIM</small></span><div class="systems-health-meter" role="meter" aria-label="Simulated systems health" aria-valuemin="0" aria-valuemax="100"${health.available ? ` aria-valuenow="${health.score}"` : ''} aria-valuetext="${valueText}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="systems-health-track" cx="50" cy="50" r="42"/><circle class="systems-health-value" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="${health.available ? health.score : 0} 100"/></svg><span aria-hidden="true"><b>${health.available ? health.score : '&mdash;'}</b><small>/ 100</small></span></div><span class="systems-health-state">${label}</span><small class="systems-health-count">${health.activeFaults} active</small></div>`;
}
