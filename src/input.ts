import { RANGE_VIEWS } from './mission-contract.ts';

export const DRIVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyF', 'Space']);

export function rangeViewForKey(code: string) {
  const index = /^Digit[1-4]$/.test(code) ? Number(code.slice(-1)) - 1 : -1;
  return RANGE_VIEWS[index];
}

/** Native/virtual keyboards can supply key while omitting a physical code. */
export function gameKeyCode(event: { code?: string; key?: string }): string {
  if (event.code && (DRIVE_CODES.has(event.code) || ['KeyM', 'KeyP', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Escape'].includes(event.code))) return event.code;
  const key = event.key ?? '';
  if (/^[wasdqefmpr]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[1-4]$/.test(key)) return `Digit${key}`;
  if (key === 'Escape') return key;
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(key)) return key;
  return event.code ?? '';
}

export type KeyboardTarget = { tagName?: string; type?: string; editable?: boolean };

/** Buttons and the spring-loaded aim slider remain part of the game controls. */
export function permitsGameKeys(target: KeyboardTarget, modifiers: { ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }, inspectionOpen = false): boolean {
  if (inspectionOpen || modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey || target.editable) return false;
  const tag = target.tagName?.toLowerCase();
  return tag !== 'textarea' && tag !== 'select' && (tag !== 'input' || target.type === 'range');
}

/** Deliberate inspection pauses time and restores the preceding manual state. */
export class RangeInspection {
  open = false;
  private previouslyPaused = false;
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
  return {
    throttle: held.has('reverse') || pressed('KeyS', 'ArrowDown') ? -1 : cruise || held.has('accelerate') || held.has('forward') || pressed('Space', 'KeyW', 'ArrowUp') ? 1 : 0,
    steer: (held.has('left') || pressed('KeyA', 'ArrowLeft') ? 1 : 0) - (held.has('right') || pressed('KeyD', 'ArrowRight') ? 1 : 0),
    aim: aim || (pressed('KeyQ') ? 1 : 0) - (pressed('KeyE') ? 1 : 0),
    fire: keyboard.consumeFire(held.has('fire')),
    brake: false,
  };
}
