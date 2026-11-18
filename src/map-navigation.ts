import { MAP_VIEW } from './mission-map.ts';

export type MapViewport = { x: number; y: number; width: number; height: number };
export type ClientRect = { left: number; top: number; width: number; height: number };
export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 4;
export const MAP_DRAG_THRESHOLD = 7;
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Keep every viewport inside the complete schematic, even at extreme pan input. */
export function clampMapViewport(view: MapViewport): MapViewport {
  const width = clamp(finite(view.width, MAP_VIEW.width), MAP_VIEW.width / MAX_MAP_ZOOM, MAP_VIEW.width);
  const height = width * MAP_VIEW.height / MAP_VIEW.width;
  return { x: clamp(finite(view.x), 0, MAP_VIEW.width - width), y: clamp(finite(view.y), 0, MAP_VIEW.height - height), width, height };
}

/** SVG uses xMidYMid meet: exclude letterboxing rather than setting an off-map point. */
export function clientMapPoint(clientX: number, clientY: number, rect: ClientRect, view: MapViewport): { x: number; y: number } | null {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / view.width, rect.height / view.height);
  const x = (clientX - rect.left - (rect.width - view.width * scale) / 2) / scale;
  const y = (clientY - rect.top - (rect.height - view.height * scale) / 2) / scale;
  if (x < 0 || y < 0 || x > view.width || y > view.height) return null;
  return { x: view.x + x, y: view.y + y };
}

/** One pointer owns pan. Release/cancel never turns a drag into a waypoint tap. */
export class MapNavigation {
  view: MapViewport = { x: 0, y: 0, width: MAP_VIEW.width, height: MAP_VIEW.height };
  private drag: { id: number; startX: number; startY: number; scale: number; origin: MapViewport; moved: boolean } | null = null;
  private readonly pointers = new Set<number>();
  private blocked = false;
  get zoom(): number { return MAP_VIEW.width / this.view.width; }
  get pointerIds(): readonly number[] { return [...this.pointers]; }
  fit(): void { this.cancel(); this.view = { x: 0, y: 0, width: MAP_VIEW.width, height: MAP_VIEW.height }; }
  center(x: number, y: number): void { this.view = clampMapViewport({ ...this.view, x: finite(x) - this.view.width / 2, y: finite(y) - this.view.height / 2 }); }
  setZoom(zoom: number): void {
    this.cancel();
    const width = MAP_VIEW.width / clamp(finite(zoom, 1), MIN_MAP_ZOOM, MAX_MAP_ZOOM);
    const height = width * MAP_VIEW.height / MAP_VIEW.width;
    this.view = clampMapViewport({ x: this.view.x + (this.view.width - width) / 2, y: this.view.y + (this.view.height - height) / 2, width, height });
  }
  pan(x: number, y: number): void { this.view = clampMapViewport({ ...this.view, x: this.view.x + finite(x), y: this.view.y + finite(y) }); }
  begin(id: number, x: number, y: number, rect: ClientRect): boolean {
    if (![id, x, y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return false;
    this.pointers.add(id);
    if (this.pointers.size > 1 || this.blocked) { this.blocked = true; this.drag = null; return false; }
    this.drag = { id, startX: x, startY: y, scale: Math.min(rect.width / this.view.width, rect.height / this.view.height), origin: { ...this.view }, moved: false };
    return true;
  }
  move(id: number, x: number, y: number): boolean {
    const drag = this.drag;
    if (!drag || drag.id !== id || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const dx = x - drag.startX, dy = y - drag.startY;
    if (Math.hypot(dx, dy) > MAP_DRAG_THRESHOLD) drag.moved = true;
    if (drag.moved) this.view = clampMapViewport({ ...drag.origin, x: drag.origin.x - dx / drag.scale, y: drag.origin.y - dy / drag.scale });
    return true;
  }
  end(id: number, x: number, y: number): boolean {
    if (!this.pointers.has(id)) return false;
    if (this.drag?.id === id) this.move(id, x, y);
    const tapped = !this.blocked && this.drag?.id === id && !this.drag.moved;
    this.cancelPointer(id);
    return tapped;
  }
  cancelPointer(id: number): void {
    if (!this.pointers.delete(id)) return;
    this.drag = null;
    this.blocked = this.pointers.size > 0;
  }
  cancel(): void { this.drag = null; this.pointers.clear(); this.blocked = false; }
}
