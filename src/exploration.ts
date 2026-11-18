import { POINTS_OF_INTEREST, WORLD_BOUNDS, type WorldPoint } from './world-config.ts';

export const VISIT_STOP_SECONDS = 1.5;
export const VISIT_MAX_SPEED = .8;
export type NavigationTarget = Readonly<WorldPoint & { label: string; id?: string }>;
export type ExplorationState = Readonly<{
  selectedId: string | null;
  visitedIds: readonly string[];
  nearbyId: string | null;
  /** Continuous stopped dwell at the current unvisited site, normalized to 0..1. */
  stopProgress: number;
}>;

/** Optional exploration has no effect on faults, contacts or mission completion. */
export class Exploration {
  private target: NavigationTarget | null = null;
  private visited = new Set<string>();
  private stoppedSeconds = 0;
  private nearbyId: string | null = null;

  get navigationTarget(): NavigationTarget | null { return this.target; }
  get state(): ExplorationState {
    return Object.freeze({ selectedId: this.target?.id ?? null, visitedIds: Object.freeze([...this.visited]),
      nearbyId: this.nearbyId, stopProgress: this.nearbyId && this.visited.has(this.nearbyId) ? 1 : this.stoppedSeconds / VISIT_STOP_SECONDS });
  }

  select(id: string): boolean {
    const point = POINTS_OF_INTEREST.find(point => point.id === id);
    if (!point) return false;
    this.target = Object.freeze({ id: point.id, label: point.label, x: point.x, z: point.z });
    return true;
  }

  selectPoint(x: number, z: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    this.target = Object.freeze({ label: 'Map waypoint', x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, x)),
      z: Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, z)) });
    return true;
  }

  clear(): void { this.target = null; }

  tick(dt: number, position: WorldPoint, speed: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const point = POINTS_OF_INTEREST.find(point => Math.hypot(point.x - position.x, point.z - position.z) <= point.radius);
    if ((point?.id ?? null) !== this.nearbyId) this.stoppedSeconds = 0;
    this.nearbyId = point?.id ?? null;
    if (!point || !Number.isFinite(speed) || Math.abs(speed) >= VISIT_MAX_SPEED) { this.stoppedSeconds = 0; return; }
    if (this.visited.has(point.id)) return;
    this.stoppedSeconds = Math.min(VISIT_STOP_SECONDS, this.stoppedSeconds + dt);
    if (this.stoppedSeconds >= VISIT_STOP_SECONDS - 1e-9) {
      this.stoppedSeconds = VISIT_STOP_SECONDS;
      this.visited.add(point.id);
    }
  }

  visitedLabels(): readonly string[] {
    return Object.freeze([...this.visited].map(id => POINTS_OF_INTEREST.find(point => point.id === id)!.label));
  }

  reset(): void { this.target = null; this.visited.clear(); this.stoppedSeconds = 0; this.nearbyId = null; }
}
