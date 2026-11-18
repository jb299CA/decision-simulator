export interface PlaybackFocusState {
  active: boolean;
  paused: boolean;
  hidden: boolean;
  blocked: boolean;
}

export interface PlaybackFocusEffects {
  state(): PlaybackFocusState;
  pause(): void;
  resume(): void;
  activateSound(): void;
}

/** Only an away pause may be released by a fresh play gesture. Returning focus
 * alone never resumes time or sound. */
export class PlaybackFocus {
  private away = false;
  private readonly effects: PlaybackFocusEffects;
  constructor(effects: PlaybackFocusEffects) { this.effects = effects; }
  get pausedWhileAway(): boolean { return this.away; }
  takePauseOwnership(): void { this.away = false; }

  suspend(): void {
    const state = this.effects.state();
    if (!state.active) { this.away = false; return; }
    if (state.blocked) this.away = false;
    else if (!state.paused) this.away = true;
    // Duplicate blur/hidden/pagehide events retain the original ownership.
    this.effects.pause();
  }

  resumeFromGesture(): boolean {
    const state = this.effects.state();
    if (!this.away || !state.active || !state.paused || state.hidden || state.blocked) return false;
    this.away = false;
    this.effects.resume();
    // Remains in the fresh input gesture for mobile Web Audio activation.
    this.effects.activateSound();
    return true;
  }

  /** A newly pressed movement control may also drive after resuming. Weapon
   * and aim keys never wake the exercise, and stale key repeats cannot wake it. */
  resumeFromMovement(code: string, repeat = false): boolean {
    if (repeat || !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space'].includes(code)) return false;
    return this.resumeFromGesture();
  }
}
