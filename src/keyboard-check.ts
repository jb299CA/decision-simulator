import { gameKeyCode } from './input.ts';
import type { GameKeyEvent } from './input.ts';

export const CHECK_KEYS = [
  ['ArrowUp', '\u2191', 'Up'], ['ArrowDown', '\u2193', 'Down'], ['ArrowLeft', '\u2190', 'Left'], ['ArrowRight', '\u2192', 'Right'],
  ['KeyW', 'W', 'W'], ['KeyA', 'A', 'A'], ['KeyS', 'S', 'S'], ['KeyD', 'D', 'D'],
] as const;
const CHECK_CODES = new Set<string>(CHECK_KEYS.map(([code]) => code));
type CheckEvent = GameKeyEvent & { type: string };
type LatestKey = { type: string; key: string; code: string; normalized: string; repeat: boolean; modifiers: string; capture: boolean; bubble: boolean };

/** Opt-in, memory-only navigation-key delivery check. Never records free text. */
export class KeyboardCheck {
  active = false;
  readonly received = new Set<string>();
  readonly held = new Set<string>();
  latest: LatestKey | null = null;
  private lastEvent: object | null = null;

  start(): void { this.reset(); this.active = true; }
  stop(): void { this.active = false; this.held.clear(); }
  reset(): void { this.stop(); this.received.clear(); this.latest = null; this.lastEvent = null; }

  observe(event: CheckEvent, phase: 'capture' | 'bubble'): boolean {
    const normalized = gameKeyCode(event);
    const recognized = CHECK_CODES.has(normalized);
    const unidentified = (!event.key || event.key === 'Unidentified') && (!event.code || event.code === 'Unidentified');
    if (!this.active || (!recognized && !unidentified)) return false;
    if (this.lastEvent !== event) {
      // A navigation code may accompany a non-navigation character on another
      // layout. Show a placeholder instead of retaining arbitrary typed text.
      const key = /^(Arrow(Up|Down|Left|Right)|Up|Down|Left|Right|[wasdWASD]|Unidentified)$/.test(event.key ?? '') ? event.key! : event.key ? '(other)' : '(missing)';
      const code = /^(Arrow(Up|Down|Left|Right)|Key[WASD]|Unidentified)$/.test(event.code ?? '') ? event.code! : event.code ? '(other)' : '(missing)';
      this.latest = { type: event.type, key, code, normalized: recognized ? normalized : '(unrecognized)', repeat: !!event.repeat,
        modifiers: [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.metaKey && 'Meta'].filter(Boolean).join('+') || 'none', capture: false, bubble: false };
      this.lastEvent = event;
      if (recognized) {
        if (event.type === 'keydown') { this.received.add(normalized); this.held.add(normalized); }
        else this.held.delete(normalized);
      }
    }
    this.latest![phase] = true;
    return true;
  }

  get status(): string {
    const arrows = [...this.received].filter(code => code.startsWith('Arrow')).length;
    const letters = CHECK_KEYS.filter(([code]) => code.startsWith('Key') && this.received.has(code)).map(([, label]) => label).join(', ');
    const result = arrows ? `${arrows} of 4 arrow keys received${letters ? `; ${letters} received` : ''}.` : letters ? `${letters} received; no recognized arrow keys received yet.` : 'No recognized navigation keys received yet.';
    return `${this.active ? 'Check active. ' : 'Check stopped. '}${result}`;
  }

  get details(): string {
    const key = this.latest;
    return key ? `${key.type} | key=${key.key} | code=${key.code} | normalized=${key.normalized} | repeat=${key.repeat ? 'yes' : 'no'} | modifiers=${key.modifiers} | capture=${key.capture ? 'yes' : 'no'} | bubble=${key.bubble ? 'yes' : 'no'}` : 'Latest navigation event: none';
  }
}

export function keyboardCheckMarkup(): string {
  return `<details class="keyboard-check" id="keyboard-check"><summary>Keyboard check</summary><p>Optional local check while the exercise is paused. Start the check, then press all four arrow keys and W. Tell us which indicators light up. Green means a key press reached the check; releases alone do not light an indicator. Only navigation keys are shown; nothing is saved or sent.</p><button data-action="keyboard-check-start">Start keyboard check</button><div id="keyboard-check-area" class="keyboard-check-area" tabindex="-1" role="group" aria-label="Keyboard test area. Press the arrow keys and W A S D. Tab leaves the check; Escape closes mission instructions."><strong>KEY TEST AREA</strong><span class="keyboard-check-focus-hint">Start the check to focus this area.</span><div class="keyboard-check-keys" aria-label="Navigation keys received">${CHECK_KEYS.map(([code, label, name]) => `<span data-check-key="${code}" aria-label="${name}: not received">${label}</span>`).join('')}</div><p id="keyboard-check-status" role="status" aria-live="polite">Check stopped. No recognized navigation keys received yet.</p><code id="keyboard-check-event">Latest navigation event: none</code></div><p>Tab stops the check and moves to the next control. Escape closes mission instructions. Browser shortcuts keep working.</p></details>`;
}
