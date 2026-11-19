export interface StickPosition { x: number; y: number }
export interface StickInput { throttle: number; steer: number }

/** Radial deadzone retains fine control without moving at a resting thumb. */
export function normalizeStick(x: number, y: number, radius: number, deadzone = .14): StickPosition {
  if (![x, y, radius, deadzone].every(Number.isFinite) || radius <= 0) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  const dead = Math.max(0, Math.min(.95, deadzone));
  const magnitude = Math.min(1, length / radius);
  if (magnitude <= dead || length === 0) return { x: 0, y: 0 };
  const output = (magnitude - dead) / (1 - dead);
  return { x: x / length * output, y: y / length * output };
}

/** Exactly one pointer owns steering; another thumb may independently fire or aim. */
export class TouchStick {
  pointerId: number | null = null;
  position: StickPosition = { x: 0, y: 0 };
  private center: StickPosition = { x: 0, y: 0 };
  private radius = 1;

  begin(pointerId: number, centerX: number, centerY: number, radius: number, x: number, y: number): boolean {
    if (this.pointerId !== null || ![centerX, centerY, radius].every(Number.isFinite) || radius <= 0) return false;
    this.pointerId = pointerId;
    this.center = { x: centerX, y: centerY };
    this.radius = radius;
    this.move(pointerId, x, y);
    return true;
  }

  move(pointerId: number, x: number, y: number): boolean {
    if (pointerId !== this.pointerId) return false;
    this.position = normalizeStick(x - this.center.x, y - this.center.y, this.radius);
    return true;
  }

  release(pointerId: number): boolean {
    if (pointerId !== this.pointerId) return false;
    this.clear();
    return true;
  }

  clear(): void { this.pointerId = null; this.position = { x: 0, y: 0 }; }
  get input(): StickInput { return { throttle: -this.position.y || 0, steer: -this.position.x || 0 }; }
}

/** Brake wins over throttle; reverse and steering still compose independently. */
export function withTouchStick<T extends StickInput & { brake?: boolean }>(input: T, stick: TouchStick): T {
  const touch = stick.input;
  return { ...input, throttle: input.brake ? 0 : input.throttle < 0 ? input.throttle : touch.throttle < 0 ? touch.throttle : input.throttle || touch.throttle, steer: input.steer || touch.steer };
}
