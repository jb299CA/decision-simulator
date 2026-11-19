import { RANGE_VIEWS } from './mission-contract.ts';

export const DRIVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyF', 'KeyB', 'Space']);

export function rangeViewForKey(code: string) {
  const index = /^Digit[1-4]$/.test(code) ? Number(code.slice(-1)) - 1 : -1;
  return RANGE_VIEWS[index];
}

export type GameKeyEvent = {
  code?: string;
  key?: string;
  keyCode?: number;
  repeat?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

const ARROW_KEYS: Record<string, string> = { ArrowUp: 'ArrowUp', ArrowLeft: 'ArrowLeft', ArrowDown: 'ArrowDown', ArrowRight: 'ArrowRight', Up: 'ArrowUp', Left: 'ArrowLeft', Down: 'ArrowDown', Right: 'ArrowRight' };
const LEGACY_ARROW_CODES: Record<number, string> = { 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' };

/** Prefer physical codes, then semantic keys; older events may omit both. */
export function gameKeyCode(event: GameKeyEvent): string {
  if (event.code && (DRIVE_CODES.has(event.code) || ['KeyM', 'KeyP', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Escape'].includes(event.code))) return event.code;
  const key = event.key ?? '';
  if (/^[wasdqefbmpr]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[1-4]$/.test(key)) return `Digit${key}`;
  if (key === 'Escape') return key;
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (Object.prototype.hasOwnProperty.call(ARROW_KEYS, key)) return ARROW_KEYS[key]!;
  if ((!event.code || event.code === 'Unidentified') && (!key || key === 'Unidentified')) return LEGACY_ARROW_CODES[event.keyCode ?? 0] ?? event.code ?? '';
  return event.code ?? '';
}

export type KeyboardTarget = { tagName?: string; type?: string; editable?: boolean };

/** Buttons and the spring-loaded aim slider remain part of the game controls. */
export function permitsGameKeys(target: KeyboardTarget, modifiers: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }, inspectionOpen = false): boolean {
  if (inspectionOpen || modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey || target.editable) return false;
  const tag = target.tagName?.toLowerCase();
  return tag !== 'textarea' && tag !== 'select' && (tag !== 'input' || target.type === 'range');
}

/** The document handler delegates only driving events here after modal shortcuts.
 * Repeats preserve a current hold, but cannot reacquire input cleared by a pause,
 * staging, focus loss or inspection. A fresh key press is required in that case. */
export function routeDrivingKeyDown(event: GameKeyEvent & { preventDefault(): void }, keyboard: RangeKeyboard, context: {
  inRange: boolean;
  playable: boolean;
  target: KeyboardTarget;
  blocked?: boolean;
  nativeSpace?: boolean;
}): { consumed: boolean; cancelCruise: boolean } {
  const unhandled = { consumed: false, cancelCruise: false };
  if (!context.inRange) return unhandled;
  if (!permitsGameKeys(context.target, event, context.blocked)) {
    keyboard.clear();
    return unhandled;
  }
  const code = gameKeyCode(event);
  if (!DRIVE_CODES.has(code)) return unhandled;
  if (code === 'Space' && context.nativeSpace) { keyboard.up(code); return unhandled; }
  event.preventDefault();
  if (event.repeat || !context.playable) return { consumed: true, cancelCruise: false };
  keyboard.down(code);
  return { consumed: true, cancelCruise: ['Space', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyB'].includes(code) };
}

/** Deliberate inspection pauses time and restores the preceding manual state. */
export class RangeInspection {
  open = false;
  private previouslyPaused = false;
  get audioContinues(): boolean { return this.open && !this.previouslyPaused; }
  begin(paused: boolean, keyboard: RangeKeyboard): void {
    if (this.open) return;
    this.open = true; this.previouslyPaused = paused;
    keyboard.clear();
  }
  end(keyboard: RangeKeyboard): boolean {
    keyboard.clear();
    const paused = this.previouslyPaused;
    this.open = false;
    return paused;
  }
}

/** A press/release between animation frames still delivers one fire request. */
export class RangeKeyboard {
  readonly keys = new Set<string>();
  private pendingFire = false;

  down(code: string): void {
    if (code === 'KeyF' && !this.keys.has(code)) this.pendingFire = true;
    this.keys.add(code);
  }
  up(code: string): void { this.keys.delete(code); }
  pulseFire(): void { this.pendingFire = true; }
  consumeFire(pointerHeld = false): boolean {
    const fire = this.pendingFire || this.keys.has('KeyF') || pointerHeld;
    this.pendingFire = false;
    return fire;
  }
  clear(): void { this.keys.clear(); this.pendingFire = false; }
}

export function drivingInput(keyboard: RangeKeyboard, held: ReadonlySet<string>, aim = 0, cruise = false) {
  const pressed = (...codes: string[]) => codes.some(code => keyboard.keys.has(code));
  const brake = pressed('KeyB');
  return {
    throttle: brake ? 0 : held.has('reverse') || pressed('KeyS', 'ArrowDown') ? -1 : cruise || held.has('accelerate') || held.has('forward') || pressed('Space', 'KeyW', 'ArrowUp') ? 1 : 0,
    steer: (held.has('left') || pressed('KeyA', 'ArrowLeft') ? 1 : 0) - (held.has('right') || pressed('KeyD', 'ArrowRight') ? 1 : 0),
    aim: aim || (pressed('KeyQ') ? 1 : 0) - (pressed('KeyE') ? 1 : 0),
    fire: keyboard.consumeFire(held.has('fire')),
    brake,
  };
}
