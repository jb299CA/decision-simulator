/** Fictional movement deadline, measured only by the exercise's simulation clock. */
export const MOVEMENT_LIMIT_SECONDS = 180;
export type MovementClockStatus = 'waiting' | 'running' | 'arrived' | 'expired';
export type MovementClockSnapshot = Readonly<{
  status: MovementClockStatus;
  limitSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  startedAt: number | null;
  arrivalAt: number | null;
}>;

export class MissionMovementClock {
  private state: MovementClockSnapshot = this.initial();
  private initial(): MovementClockSnapshot {
    return Object.freeze({ status: 'waiting', limitSeconds: MOVEMENT_LIMIT_SECONDS, remainingSeconds: MOVEMENT_LIMIT_SECONDS, elapsedSeconds: 0, startedAt: null, arrivalAt: null });
  }
  get snapshot(): MovementClockSnapshot { return this.state; }

  /** The first valid arrival settles the movement task; explicit unloading is separate. */
  update(time: number, departureCrossed: boolean, validArrival: boolean): MovementClockSnapshot {
    if (!Number.isFinite(time) || time < 0 || this.state.status === 'arrived' || this.state.status === 'expired') return this.state;
    const startedAt = this.state.startedAt ?? (departureCrossed ? time : null);
    if (startedAt === null) return this.state;
    const elapsedSeconds = Math.min(MOVEMENT_LIMIT_SECONDS, Math.max(this.state.elapsedSeconds, time - startedAt));
    // Absorb sub-nanosecond floating-point drift at the exact simulation boundary.
    const expired = elapsedSeconds >= MOVEMENT_LIMIT_SECONDS - 1e-9;
    this.state = Object.freeze({
      status: expired ? 'expired' : validArrival ? 'arrived' : 'running',
      limitSeconds: MOVEMENT_LIMIT_SECONDS,
      remainingSeconds: expired ? 0 : MOVEMENT_LIMIT_SECONDS - elapsedSeconds,
      elapsedSeconds: expired ? MOVEMENT_LIMIT_SECONDS : elapsedSeconds,
      startedAt, arrivalAt: !expired && validArrival ? time : null,
    });
    return this.state;
  }

  reset(): void { this.state = this.initial(); }
}
