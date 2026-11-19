export interface PageLifecycleEffects {
  suspend(): void;
  dispose(): void;
  restore(): void;
}

/** A cached page keeps its resources and user-selected playback state. */
export class PageLifecycle {
  private cached = false;
  private disposed = false;
  private readonly effects: PageLifecycleEffects;

  constructor(effects: PageLifecycleEffects) { this.effects = effects; }

  hide(persisted: boolean): void {
    if (this.disposed) return;
    this.effects.suspend();
    this.cached = persisted;
    if (!persisted) {
      this.disposed = true;
      this.effects.dispose();
    }
  }

  show(persisted: boolean): void {
    if (!persisted || !this.cached || this.disposed) return;
    this.cached = false;
    this.effects.restore();
  }
}
