/** Shared presentation/state contracts for this fictional browser exercise. */
export const RANGE_VIEWS = ['hatch', 'inside', 'chase', 'top'] as const;
export type RangeView = typeof RANGE_VIEWS[number];
/** Fictional display choice; thermal is an illustrative game rendering, not sensor data. */
export type GunnerDisplayMode = 'day' | 'thermal' | 'mfocs';
export type HealthDecision = 'continue' | 'diagnose' | 'reduce-pace' | 'recovery';
export type HealthPhase = 'nominal' | 'warning' | 'critical' | 'broken' | 'recovery';
export type HealthObservation = { time: number; value: number };
export type FaultId = 'charging' | 'cooling' | 'wheel-end';
export type FaultSeverity = 'normal' | 'moderate' | 'severe' | 'failed';
export type MaintenanceLevel = 'none' | 'inspection' | 'repair' | 'major';
export type CrewDecision = { action: HealthDecision; time: number; faultId?: FaultId };
export type VehicleFault = {
  id: FaultId;
  label: string;
  component: string;
  severity: FaultSeverity;
  diagnosed: boolean;
  firstWarningAt: number | null;
  severeAt: number | null;
  exposure: number;
  damage: number;
  baseline: number;
  reading: number;
  observations: HealthObservation[];
  consequence: string;
  maintenance: MaintenanceLevel;
  repair: string;
};
export type VehicleHealthState = {
  phase: HealthPhase;
  diagnosed: boolean;
  continued: boolean;
  alertSerial: number;
  movingSeconds: number;
  continuedSeconds: number;
  baseline: number;
  signal: number;
  observations: HealthObservation[];
  message: string;
  decisions: CrewDecision[];
  faults: VehicleFault[];
  paceLimited: boolean;
  breakdownCause: FaultId | null;
};

export type MissionDebrief = {
  outcome: 'complete' | 'failed' | 'recovery' | 'breakdown';
  endedAt: number;
  distanceTravelled: number;
  optionalVisitedLabels: readonly string[];
  contactsCleared: number;
  contactsTotal: number;
  summary: string;
  vehicleStatus: 'requires-inspection' | 'repair-required' | 'major-repair' | 'immobilized';
  findings: {
    id: FaultId;
    label: string;
    severity: FaultSeverity;
    maintenance: MaintenanceLevel;
    consequence: string;
    repair: string;
    firstWarningAt: number | null;
    severeAt: number | null;
    diagnosed: boolean;
  }[];
  decisions: CrewDecision[];
};
