export interface PlaybackFocusEffects {
  clearInputs(): void;
  resetFrame(): void;
  syncAudio(): void;
}

/** Browser attention changes release held controls, never own gameplay Pause.
 * Visibility also resets the frame boundary and reconciles allowed audio. */
export class PlaybackFocus {
  private readonly effects: PlaybackFocusEffects;
  constructor(effects: PlaybackFocusEffects) { this.effects = effects; }

  blur(): void { this.effects.clearInputs(); }

  visibilityChanged(): void {
    this.effects.clearInputs();
    this.effects.resetFrame();
    this.effects.syncAudio();
  }
}
