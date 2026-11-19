/** A visible arrival beat, separate from world time and browser audio activation. */
export const MISSION_STAGING_SECONDS = 4;
export const MISSION_STAGING_CAPTION = '[Engines idling / nearby Stryker powertrain / distant training gunfire] Stand by for radio.';
export class MissionStaging {
  private remaining = 0;
  get active(): boolean { return this.remaining > 0; }
  get elapsed(): number { return MISSION_STAGING_SECONDS - this.remaining; }
  begin(): void { this.remaining = MISSION_STAGING_SECONDS; }
  cancel(): void { this.remaining = 0; }
  /** Returns the single release edge. Hidden time and deliberate Pause do not count. */
  update(delta: number, running: boolean): boolean {
    if (!this.active || !running || !Number.isFinite(delta) || delta <= 0) return false;
    this.remaining = Math.max(0, this.remaining - Math.min(delta, .15));
    if (this.remaining < 1e-8) this.remaining = 0;
    return !this.active;
  }
}
