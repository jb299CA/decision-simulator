import type { FaultSeverity, VehicleFault } from './mission-contract.ts';

export interface SystemHealthScore {
  score: number;
  level: FaultSeverity;
  activeFaults: number;
  label: string;
  available: boolean;
}

const severityRank: Record<FaultSeverity, number> = { normal: 0, moderate: 1, severe: 2, failed: 3 };
const penalty: Record<FaultSeverity, number> = { normal: 0, moderate: 25, severe: 60, failed: 100 };
const ceiling: Record<FaultSeverity, number> = { normal: 100, moderate: 79, severe: 49, failed: 0 };
const labels: Record<FaultSeverity, string> = { normal: 'Normal', moderate: 'Warning', severe: 'Severe', failed: 'Failed' };

/**
 * Presentation-only score for fictional systems condition, never combat armor,
 * equipment readiness, a diagnosis, or an operating threshold. Average component
 * scores subtract the larger of a severity penalty or 70 × bounded damage;
 * the worst severity then caps the total so a serious fault cannot average away.
 * Crew decisions are deliberately absent: inspection and pace reduction do not repair wear.
 */
export function systemHealthScore(faults: readonly Pick<VehicleFault, 'severity' | 'damage'>[]): SystemHealthScore {
  if (faults.length === 0) return { score: 0, level: 'normal', activeFaults: 0, label: 'No data', available: false };
  let total = 0;
  let level: FaultSeverity = 'normal';
  let activeFaults = 0;
  for (const fault of faults) {
    // Unexpected inputs fail conservatively rather than displaying false health.
    const severity: FaultSeverity = Object.hasOwn(severityRank, fault.severity) ? fault.severity : 'failed';
    const damage = Number.isFinite(fault.damage) ? Math.max(0, Math.min(1, fault.damage)) : 1;
    total += 100 - Math.max(penalty[severity], damage * 70);
    if (severityRank[severity] > severityRank[level]) level = severity;
    if (severity !== 'normal') activeFaults++;
  }
  return { score: Math.min(ceiling[level], Math.round(total / faults.length)), level, activeFaults, label: labels[level], available: true };
}
