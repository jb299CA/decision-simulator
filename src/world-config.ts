/** Fictional game coordinates and encounter layout, not real terrain or tactics. */
export const WORLD_BOUNDS = { minX: -520, maxX: 520, minZ: -1160, maxZ: 280 } as const;
export const MISSION_START = { x: 0, z: 80 } as const;
export const DEPARTURE_Z = -140;
export const DISMOUNT_POINT = { x: 140, z: -920, radius: 12 } as const;
export const MISSION_ROUTE = [
  MISSION_START, { x: 0, z: -90 }, { x: 0, z: DEPARTURE_Z },
  { x: -65, z: -340 }, { x: 75, z: -570 }, { x: 55, z: -760 }, DISMOUNT_POINT,
] as const;
export const PRACTICE_TARGETS = [
  { id: 'practice-1', x: 0, z: 40, radius: 1.6 },
  { id: 'practice-2', x: -12, z: 20, radius: 1.6 },
  { id: 'practice-3', x: 12, z: -5, radius: 1.6 },
  { id: 'practice-4', x: 0, z: -40, radius: 1.6 },
  { id: 'practice-5', x: -14, z: -70, radius: 1.6 },
  { id: 'practice-6', x: 15, z: -100, radius: 1.6 },
] as const;
export type ContactKind = 'troop' | 'vehicle';
// Vehicle contacts are fictional soft-skin trucks with mounted guns, not armored vehicles.
// Radius and health are arcade tuning, not real equipment or weapon performance.
export const ENEMY_CONTACTS = [
  { id: 'troop-1', kind: 'troop', x: -12, z: -230, radius: .85, maxHealth: 2 },
  { id: 'troop-2', kind: 'troop', x: -33, z: -290, radius: .85, maxHealth: 2 },
  { id: 'vehicle-1', kind: 'vehicle', x: -44, z: -355, radius: 2, maxHealth: 4 },
  { id: 'troop-3', kind: 'troop', x: 63, z: -535, radius: .85, maxHealth: 2 },
  { id: 'vehicle-2', kind: 'vehicle', x: 62, z: -700, radius: 2, maxHealth: 4 },
  { id: 'troop-4', kind: 'troop', x: 113, z: -865, radius: .85, maxHealth: 2 },
] as const;

/** The broad hardpack route follows the mission waypoints. */
export function roadCenterAt(z: number): number {
  if (!Number.isFinite(z) || z >= MISSION_ROUTE[0].z) return MISSION_ROUTE[0].x;
  for (let i = 1; i < MISSION_ROUTE.length; i++) {
    const a = MISSION_ROUTE[i - 1], b = MISSION_ROUTE[i];
    if (z >= b.z) return a.x + (b.x - a.x) * ((a.z - z) / (a.z - b.z));
  }
  return DISMOUNT_POINT.x;
}

export type WorldPoint = { readonly x: number; readonly z: number };
export type SideRoad = { readonly id: string; readonly label: string; readonly halfWidth: number; readonly points: readonly WorldPoint[] };

/** Optional detours, not additions to the required route or encounter sequence. */
export const SIDE_ROADS: readonly SideRoad[] = [
  {
    id: 'west-loop', label: 'West overlook loop', halfWidth: 8,
    points: [{ x: 0, z: 120 }, { x: -70, z: 180 }, { x: -390, z: 220 },
      { x: -440, z: -80 }, { x: -260, z: -120 }, { x: -70, z: 100 }, { x: 0, z: 120 }],
  },
  {
    id: 'east-loop', label: 'Relay and quarry loop', halfWidth: 8,
    points: [{ x: roadCenterAt(-465), z: -465 }, { x: 190, z: -415 },
      { x: 410, z: -460 }, { x: 440, z: -730 }, { x: 300, z: -1010 },
      { x: roadCenterAt(-840), z: -840 }],
  },
];

export type PointOfInterest = WorldPoint & { readonly id: string; readonly label: string; readonly description: string; readonly radius: number };
/** Visits are optional records only: these sites never repair or resupply the vehicle. */
export const POINTS_OF_INTEREST: readonly PointOfInterest[] = [
  { id: 'west-overlook', label: 'West overlook', description: 'Stop at the ridge lookout and view the expanded range.', x: -390, z: 220, radius: 18 },
  { id: 'signal-relay', label: 'Signal relay', description: 'Visit the fictional relay site beside the eastern loop.', x: 410, z: -460, radius: 18 },
  { id: 'quarry-stop', label: 'Quarry stop', description: 'Explore the dry quarry turnout beyond the eastern ridge.', x: 300, z: -1010, radius: 18 },
];

/** Shared by terrain physics and scenery; preserves the original main-road profile. */
export function roadDistanceAt(x: number, z: number): number {
  x = Number.isFinite(x) ? x : 0; z = Number.isFinite(z) ? z : 0;
  let distance = Math.abs(x - roadCenterAt(z));
  for (const road of SIDE_ROADS) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]!, b = road.points[i]!;
      const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared)) : 0;
      distance = Math.min(distance, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
    }
  }
  return distance;
}
