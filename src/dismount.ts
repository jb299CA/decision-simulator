import type { DismountState } from './mission-contract.ts';
export type { DismountState } from './mission-contract.ts';

/** Original arcade animation timing, unrelated to real equipment procedures. */
export const DISMOUNT = {
  troopCount: 9,
  rampOpenSeconds: 1.1,
  troopStaggerSeconds: .23,
  troopRunSeconds: 2.4,
  durationSeconds: 5.6,
} as const;

const unit = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const rampOpenProgress = (elapsed: number): number => unit(elapsed / DISMOUNT.rampOpenSeconds);
export const troopRunProgress = (elapsed: number, index: number): number =>
  unit((elapsed - (DISMOUNT.rampOpenSeconds + index * DISMOUNT.troopStaggerSeconds)) / DISMOUNT.troopRunSeconds);

export function stowedDismount(): DismountState {
  return { phase: 'stowed', elapsed: 0, position: { x: 0, z: 0 }, heading: 0, validDrop: null };
}
