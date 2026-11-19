/** A presentation clock only: accepting orders is the sole gate into the driving run. */
export const BRIEFING_CHARACTERS_PER_SECOND = 32;

export function missionBriefingText(callsign: string): string {
  return `ORDERS FOR ${callsign.toUpperCase()}

Deliver the squad to the marked dismount point.

Practice boards are optional. Check controls, then cross the yellow departure line when ready.

From departure: three minutes to clear all contacts and stop in the marked dismount zone. Then Drop ramp to unload nine troops. Outside zone = mission failure.

Watch vehicle health. Open MFoCS for faults: inspect, reduce pace or call recovery.`;
}

export class MissionBriefing {
  text = '';
  private elapsed = 0;
  private active = false;
  private revealed = false;
  get visibleText(): string { return this.text.slice(0, Math.floor(this.elapsed * BRIEFING_CHARACTERS_PER_SECOND)); }
  get ready(): boolean { return this.active && (this.revealed || this.visibleText.length >= this.text.length); }
  begin(callsign: string, reducedMotion = false): void {
    this.text = missionBriefingText(callsign);
    this.elapsed = 0; this.active = true; this.revealed = reducedMotion;
    if (reducedMotion) this.skip();
  }
  update(delta: number, active: boolean): boolean {
    if (!this.active || this.ready || !active || !Number.isFinite(delta) || delta <= 0) return false;
    const before = this.visibleText.length;
    // Hidden-page or cached-frame backlog cannot fast-forward the introduction.
    this.elapsed += Math.min(delta, .15);
    return this.visibleText.length > before;
  }
  skip(): void { if (this.active) { this.revealed = true; this.elapsed = this.text.length / BRIEFING_CHARACTERS_PER_SECOND; } }
  accept(): boolean { if (!this.ready) return false; this.active = false; return true; }
  cancel(): void { this.active = false; this.elapsed = 0; this.revealed = false; this.text = ''; }
}

/** Training remains optional; once the player uses it, stop asking for test fire. */
export function practicePrompt(shotsFired: number, brokenBoards: number): string {
  return shotsFired > 0 || brokenBoards > 0
    ? 'Ready when you are. Cross the yellow departure line to begin the three-minute mission.'
    : 'Practice boards are optional. Check the controls, then cross the yellow departure line when ready.';
}
