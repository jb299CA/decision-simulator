/** Pointer-clicked game buttons keep the driving keyboard. Tabbed actions keep
 * native Space activation, without relying on browser focus-visible heuristics. */
export class GameFocusOwnership {
  private keyboardNavigation = false;

  navigateWithKeyboard(): void { this.keyboardNavigation = true; }
  usePointer(): void { this.keyboardNavigation = false; }

  nativeSpace(actionControl: boolean): boolean {
    return actionControl && this.keyboardNavigation;
  }
}

/** Wrap a modal's Tab order, including focus that starts outside its controls. */
export function nextTrappedFocus(current: number, count: number, backward = false): number | null {
  if (count < 1) return null;
  if (current < 0 || current >= count) return backward ? count - 1 : 0;
  return (current + (backward ? -1 : 1) + count) % count;
}
