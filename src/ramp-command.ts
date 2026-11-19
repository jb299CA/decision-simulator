import type { DrivingRange } from './range.ts';

/** Every ramp input uses the same boundary; UI holds must never queue an unload. */
export type RampCommandContext = {
  inRange: boolean;
  staging: boolean;
  hidden: boolean;
  inspection: 'vehicle inspection' | 'mission map' | 'mission instructions' | 'dialog' | null;
};
export type RampCommandResult = { accepted: boolean; reason: string };

export function rampCommandAvailability(range: DrivingRange, context: RampCommandContext): { available: boolean; reason: string } {
  if (!context.inRange) return { available: false, reason: 'Start the driving mission before dropping the ramp.' };
  if (context.hidden) return { available: false, reason: 'Return to the mission before dropping the ramp.' };
  if (context.inspection) return { available: false, reason: `Close the ${context.inspection} before dropping the ramp.` };
  if (range.paused) return range.dropRampAvailability;
  if (context.staging) return { available: false, reason: 'Staging: ramp command unlocks after the opening hold.' };
  return range.dropRampAvailability;
}

export function executeRampCommand(range: DrivingRange, context: RampCommandContext): RampCommandResult {
  const availability = rampCommandAvailability(range, context);
  if (!availability.available) return { accepted: false, reason: availability.reason };
  const accepted = range.dropRamp();
  return { accepted, reason: accepted ? range.mission.notice : range.dropRampAvailability.reason };
}
