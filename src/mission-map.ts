import { WORLD_BOUNDS } from './world-config.ts';

export const MAP_VIEW = { width: 160, height: 180, inset: 12 } as const;
export const PLAYER_MARKER_PATH = 'M0-6 4.5 5 0 3-4.5 5Z';

const finite = (value: number): number => Number.isFinite(value) ? value : 0;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, finite(value)));

/** North-up schematic projection, independent of the player's position or camera. */
export function mapPoint(x: number, z: number): { x: number; y: number } {
  const { minX, maxX, minZ, maxZ } = WORLD_BOUNDS;
  return {
    x: MAP_VIEW.inset + (clamp(x, minX, maxX) - minX) / (maxX - minX) * (MAP_VIEW.width - MAP_VIEW.inset * 2),
    y: MAP_VIEW.inset + (clamp(z, minZ, maxZ) - minZ) / (maxZ - minZ) * (MAP_VIEW.height - MAP_VIEW.inset * 2),
  };
}

/** Inverse of the schematic projection; margins resolve to the world edge. */
export function mapWorldPoint(x: number, y: number): { x: number; z: number } {
  return {
    x: WORLD_BOUNDS.minX + (clamp(x, MAP_VIEW.inset, MAP_VIEW.width - MAP_VIEW.inset) - MAP_VIEW.inset) / (MAP_VIEW.width - MAP_VIEW.inset * 2) * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX),
    z: WORLD_BOUNDS.minZ + (clamp(y, MAP_VIEW.inset, MAP_VIEW.height - MAP_VIEW.inset) - MAP_VIEW.inset) / (MAP_VIEW.height - MAP_VIEW.inset * 2) * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ),
  };
}

/** Game heading zero faces north; positive turns toward the map's west. */
export function mapHeading(heading: number): number {
  const angle = finite(heading);
  return -Math.atan2(Math.sin(angle), Math.cos(angle)) * 180 / Math.PI;
}

export function contactVisibility(contact: { detected: boolean; neutralized: boolean }, departureCrossed: boolean): 'hidden' | 'estimated' | 'detected' | 'neutralized' {
  if (!departureCrossed) return 'hidden';
  return contact.neutralized ? 'neutralized' : contact.detected ? 'detected' : 'estimated';
}

/** Direction of a fictional objective relative to the vehicle, not the active camera. */
export function objectivePointer(position: {x:number; z:number}, heading: number,
  objective: {x:number; z:number; radius:number}): { degrees:number; meters:number; inZone:boolean } | null {
  if (![position.x,position.z,heading,objective.x,objective.z,objective.radius].every(Number.isFinite)) return null;
  const dx=objective.x-position.x, dz=objective.z-position.z, distance=Math.hypot(dx,dz);
  const relative=Math.atan2(dx,-dz)+heading;
  return { degrees: distance === 0 ? 0 : Math.atan2(Math.sin(relative),Math.cos(relative))*180/Math.PI,
    meters:Math.round(distance), inZone:distance <= Math.max(0,objective.radius) };
}
