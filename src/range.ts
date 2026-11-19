import { Simulation } from './simulation.ts';
import { ArcadePowertrain, type PowertrainState } from './powertrain.ts';
import { VehicleHealth } from './vehicle-health.ts';
import { Exploration, type ExplorationState, type NavigationTarget } from './exploration.ts';
import { DrivingDynamics, DRIVE_LIMITS_MPH, mphToMps, mpsToMph } from './driving-dynamics.ts';
import { DISMOUNT, stowedDismount } from './dismount.ts';
import { MissionMovementClock, type MovementClockSnapshot } from './mission-clock.ts';
import type { FaultId, HealthDecision, MissionDebrief, MissionFailureReason, VehicleHealthState } from './mission-contract.ts';
import { WORLD_BOUNDS, MISSION_START, DEPARTURE_Z, DISMOUNT_POINT, MISSION_ROUTE, PRACTICE_TARGETS, ENEMY_CONTACTS, roadDistanceAt } from './world-config.ts';

export type { RangeView } from './mission-contract.ts';
export type RangeInput = { throttle: number; steer: number; aim: number; fire: boolean; brake?: boolean };
export type RangeTerrain = { kind: 'road' | 'grass' | 'rock' | 'wash'; label: string; grip: number; speedFactor: number; roughness: number; height: number };
export type RangeTarget = { id: string; x: number; z: number; radius: number; hitUntil: number; kind: 'training' | 'enemy'; destroyedAt: number | null; destroyedBy: 'shot' | 'vehicle' | null };
export type RangeShot = { id: number; origin: { x: number; y: number; z: number }; end: { x: number; y: number; z: number }; hitTargetId?: string; createdAt: number };
export type AimLock = { targetId: string; label: string };
export type RangeContact = { id: string; x: number; z: number; radius: number; kind: 'troop' | 'vehicle'; health: number; maxHealth: number; detected: boolean; neutralized: boolean; neutralizedAt: number | null; lastAttackTime: number };
export type RangeMission = {
  title: string;
  status: 'enroute' | 'arriving' | 'dismounting' | 'complete' | 'failed' | 'recovery' | 'breakdown';
  failureReason: MissionFailureReason | null;
  objective: { x: number; z: number; radius: number };
  waypoints: { x: number; z: number }[];
  currentWaypoint: number;
  distance: number;
  arrivalProgress: number;
  integrity: number;
  contacts: RangeContact[];
  departureCrossed: boolean;
  remainingContacts: number;
  phase: 'training' | 'combat' | 'dismount';
  notice: string;
};

export { WORLD_BOUNDS as RANGE_BOUNDS } from './world-config.ts';
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const finite = (value: number): number => Number.isFinite(value) ? value : 0;
const normalized = (value: number): number => clamp(finite(value), -1, 1);
const wrap = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));
/** Accessibility tuning in fictional game units, unrelated to real weapon performance. */
export const AIM_ASSIST = { acquireDistance: 120, retainDistance: 135, acquireAngle: 55 * Math.PI / 180, retainAngle: 75 * Math.PI / 180, manualGrace: 1.5, slewRate: 35 * Math.PI / 180 } as const;

/** Fictional game terrain coefficients, never vehicle specifications. */
export function terrainAt(x: number, z: number): RangeTerrain {
  x = finite(x); z = finite(z);
  const offset = roadDistanceAt(x, z);
  if (offset < 8) return { kind: 'road', label: 'Hardpack road', grip: 1, speedFactor: 1, roughness: .08, height: 0 };
  const wave = Math.sin(x * .19) * Math.cos(z * .15);
  // Ease height away from the road so its shoulder meets the surrounding ground.
  const blend = clamp((offset - 8) / 10, 0, 1);
  const shoulder = blend * blend * (3 - 2 * blend);
  if (x > 100) return { kind: 'rock', label: 'Rocky ground', grip: .62, speedFactor: DRIVE_LIMITS_MPH.rock / DRIVE_LIMITS_MPH.road, roughness: .95, height: shoulder === 0 ? 0 : shoulder * (.35 + wave * .55) };
  if (x < -100 && z < -280) return { kind: 'wash', label: 'Dry wash', grip: .48, speedFactor: DRIVE_LIMITS_MPH.wash / DRIVE_LIMITS_MPH.road, roughness: .72, height: shoulder === 0 ? 0 : shoulder * (-.3 + wave * .25) };
  return { kind: 'grass', label: 'Dry grassland', grip: .82, speedFactor: DRIVE_LIMITS_MPH.grass / DRIVE_LIMITS_MPH.road, roughness: .4, height: shoulder === 0 ? 0 : shoulder * wave * .25 };
}

// SimulationAudio consumes the existing Simulation API. Keep one stable adapter,
// without ticking the mission or manufacturing any diagnostic observations.
class RangeAudioState extends Simulation {
  override get moving(): boolean { return this.engine && this.speed > .001; }
}

/** Arcade sandbox: simulated metres and m/s, simplified motion and panel scoring. */
export class DrivingRange {
  time = 0;
  callsign = 'Unassigned';
  paused = false;
  position: { x: number; z: number } = { ...MISSION_START };
  /** Zero faces -z. Positive heading rotates the forward vector toward -x. */
  heading = 0;
  speed = 0;
  aimYaw = 0;
  aimLock: AimLock | null = null;
  aimAssistEnabled = true;
  private manualAimUntil = 0;
  private centeringAim = false;
  shotsFired = 0;
  hits = 0;
  lastShotTime = -Infinity;
  shots: RangeShot[] = [];
  distanceTravelled = 0;
  debrief: MissionDebrief | null = null;
  dismount = stowedDismount();
  mission: RangeMission = this.makeMission();
  targets: RangeTarget[] = this.makeTargets();
  private readonly soundState = new RangeAudioState();
  private readonly drivetrain = new ArcadePowertrain();
  private readonly vehicleHealth: VehicleHealth;
  private readonly dynamics = new DrivingDynamics();
  private readonly explorer = new Exploration();
  private readonly movementTimer = new MissionMovementClock();
  private lastThrottle = 0;

  constructor(faultRandom?: () => number) { this.vehicleHealth = new VehicleHealth(faultRandom); }

  get exploration(): ExplorationState { return this.explorer.state; }
  get movementClock(): MovementClockSnapshot { return this.movementTimer.snapshot; }
  get navigationTarget(): NavigationTarget | null { return this.explorer.navigationTarget; }
  selectNavigationTarget(id: string): boolean { return !this.missionEnded && this.explorer.select(id); }
  selectNavigationPoint(x: number, z: number): boolean { return !this.missionEnded && this.explorer.selectPoint(x, z); }
  clearNavigationTarget(): void { if (!this.missionEnded) this.explorer.clear(); }

  get terrain(): RangeTerrain { return terrainAt(this.position.x, this.position.z); }
  get powertrain(): PowertrainState { return this.drivetrain.state; }
  get health(): VehicleHealthState { return this.vehicleHealth.state; }
  get missionEnded(): boolean { return this.mission.status === 'complete' || this.mission.status === 'failed' || this.mission.status === 'recovery' || this.mission.status === 'breakdown'; }
  get dismounting(): boolean { return this.mission.status === 'dismounting'; }
  get manualAimActive(): boolean { return this.time < this.manualAimUntil; }
  /** Selection can precede alignment; a selected target never awards a hidden hit. */
  get aimLockReady(): boolean {
    const target = this.targets.find(candidate => candidate.id === this.aimLock?.targetId);
    if (this.missionEnded || this.dismounting || !target || !this.targetActive(target)) return false;
    const angle = this.heading + this.aimYaw, dx = -Math.sin(angle), dz = -Math.cos(angle);
    const pivot = this.weaponPivot(), tx = target.x - pivot.x - dx, tz = target.z - pivot.z - dz;
    const along = tx * dx + tz * dz;
    if (along <= 0 || along >= 140 || Math.abs(tx * dz - tz * dx) > target.radius) return false;
    return !this.targets.some(other => {
      if (other === target || !this.targetActive(other)) return false;
      const ox = other.x - pivot.x - dx, oz = other.z - pivot.z - dz;
      const otherAlong = ox * dx + oz * dz;
      return otherAlong > 0 && otherAlong < along && Math.abs(ox * dz - oz * dx) <= other.radius;
    });
  }
  get speedMph(): number { return mpsToMph(this.speed); }
  /** Effective road-wheel angle in radians after the game grip limit. */
  get steeringAngle(): number { return this.dynamics.appliedSteeringAngle; }
  private get healthSpeedFactor(): number { return this.health.paceLimited ? .55 : this.health.phase === 'critical' ? .6 : 1; }
  get speedLimitMph(): number {
    if (this.missionEnded || this.dismounting) return 0;
    const reverse = this.speed < -.01 || (Math.abs(this.speed) <= .01 && this.lastThrottle < 0);
    return (reverse ? Math.min(DRIVE_LIMITS_MPH.reverse, DRIVE_LIMITS_MPH[this.terrain.kind]) : DRIVE_LIMITS_MPH[this.terrain.kind]) * this.healthSpeedFactor;
  }
  get speedLimitReason(): string {
    if (this.missionEnded) return 'Exercise ended';
    if (this.dismounting) return 'Team unloading';
    if (this.health.paceLimited) return 'Crew reduced pace';
    if (this.health.phase === 'critical') return 'Vehicle fault';
    if (this.speed < -.01 || (Math.abs(this.speed) <= .01 && this.lastThrottle < 0)) return 'Reverse';
    return this.terrain.label;
  }

  get dropRampAvailability(): { available: boolean; reason: string } {
    if (this.paused) return { available: false, reason: 'Resume the exercise before dropping the ramp.' };
    if (this.missionEnded) return { available: false, reason: 'Exercise ended.' };
    if (this.dismount.phase !== 'stowed') return { available: false, reason: 'The team is already unloading.' };
    const distance = Math.hypot(this.position.x - this.mission.objective.x, this.position.z - this.mission.objective.z);
    if (!Number.isFinite(distance) || !Number.isFinite(this.speed)) return { available: false, reason: 'Vehicle position is unavailable.' };
    if (distance > this.mission.objective.radius) return { available: true, reason: 'Outside zone = mission failure.' };
    if (!this.mission.departureCrossed) return { available: false, reason: 'Cross the line of departure and clear the contacts before dropping the ramp.' };
    if (this.mission.contacts.some(contact => !contact.neutralized)) return { available: false, reason: 'Clear every fictional contact before dropping the ramp.' };
    if (Math.abs(this.speed) >= .8) return { available: false, reason: 'Stop inside the dismount zone before dropping the ramp.' };
    return { available: true, reason: 'Drop ramp to let the team out.' };
  }

  /** Explicit, one-way arcade command. An off-objective drop still shows the exit. */
  dropRamp(): boolean {
    if (this.paused || this.missionEnded || this.dismount.phase !== 'stowed') return false;
    const availability = this.dropRampAvailability;
    if (!availability.available) { this.mission.notice = availability.reason; return false; }
    const validDrop = Math.hypot(this.position.x - this.mission.objective.x, this.position.z - this.mission.objective.z) <= this.mission.objective.radius;
    if (validDrop) this.movementTimer.update(this.time, this.mission.departureCrossed, true);
    this.dismount = { phase: 'opening', elapsed: 0, position: { ...this.position }, heading: this.heading, validDrop };
    this.mission.status = 'dismounting'; this.mission.arrivalProgress = 0;
    this.mission.failureReason = validDrop ? null : 'dismount-outside-zone';
    this.mission.notice = validDrop ? 'Ramp opening. The dismount team is exiting.'
      : 'Mission failed: ramp dropped outside the dismount zone. The team is unloading at the wrong location.';
    this.speed = 0; this.lastThrottle = 0; this.aimLock = null;
    this.drivetrain.tick(.025, { speed: 0, throttle: 0, acceleration: 0, roughness: this.terrain.roughness, speedFactor: this.terrain.speedFactor, brake: true, engine: false });
    return true;
  }

  setAimAssist(enabled: boolean): void {
    if (this.dismounting || this.missionEnded) return;
    this.aimAssistEnabled = !!enabled;
    this.aimLock = null;
  }

  centerAim(): void {
    if (this.paused || this.missionEnded || this.dismounting) return;
    this.centeringAim = true; this.aimLock = null;
    this.manualAimUntil = this.time + AIM_ASSIST.manualGrace;
  }

  /** The existing muzzle is one unit forward of this offset turret pivot. */
  private weaponPivot(): { x: number; z: number } {
    return { x: this.position.x + Math.cos(this.heading) * .48, z: this.position.z - Math.sin(this.heading) * .48 };
  }

  private targetActive(target: RangeTarget): boolean {
    return Number.isFinite(target.x) && Number.isFinite(target.z) && Number.isFinite(target.radius) && target.radius > 0
      && target.destroyedAt === null && (target.kind !== 'enemy' || (this.mission.departureCrossed
        && this.mission.contacts.some(contact => contact.id === target.id && !contact.neutralized && contact.health > 0)));
  }

  /** Bounded shortest-arc movement also prevents overshoot at the wrap boundary. */
  private slewAimTo(yaw: number, dt: number): void {
    const maxStep = AIM_ASSIST.slewRate * dt;
    this.aimYaw = wrap(this.aimYaw + clamp(wrap(yaw - this.aimYaw), -maxStep, maxStep));
  }

  private updateAimAssist(aim: number, dt: number): void {
    if (aim !== 0) {
      this.centeringAim = false;
      this.manualAimUntil = this.time + AIM_ASSIST.manualGrace;
      this.aimLock = null;
      this.aimYaw = wrap(this.aimYaw + aim * AIM_ASSIST.slewRate * dt);
      return;
    }
    if (this.centeringAim) {
      this.slewAimTo(0, dt);
      this.centeringAim = Math.abs(this.aimYaw) > 1e-9;
      this.manualAimUntil = this.time + AIM_ASSIST.manualGrace;
      this.aimLock = null;
      return;
    }
    if (!this.aimAssistEnabled || this.manualAimActive) { this.aimLock = null; return; }
    const pivot = this.weaponPivot();
    const candidates = this.targets.filter(target => this.targetActive(target)).map(target => {
      const tx = target.x - pivot.x, tz = target.z - pivot.z;
      const distance = Math.hypot(tx, tz), angle = Math.atan2(-tx, -tz);
      return { target, distance, angle, offset: Math.abs(wrap(angle - this.heading)) };
    }).filter(candidate => {
      const retained = candidate.target.id === this.aimLock?.targetId;
      if (candidate.distance <= 1 || candidate.distance > (retained ? AIM_ASSIST.retainDistance : AIM_ASSIST.acquireDistance)
        || candidate.offset > (retained ? AIM_ASSIST.retainAngle : AIM_ASSIST.acquireAngle)) return false;
      // Select only a target reached by the same unobstructed horizontal ray as fire().
      const dx = -Math.sin(candidate.angle), dz = -Math.cos(candidate.angle);
      return !this.targets.some(other => {
        if (other === candidate.target || !this.targetActive(other)) return false;
        const tx = other.x - pivot.x - dx, tz = other.z - pivot.z - dz;
        const along = tx * dx + tz * dz;
        return along > 0 && along < candidate.distance - 1 && Math.abs(tx * dz - tz * dx) <= other.radius;
      });
    });
    const selected = candidates.find(candidate => candidate.target.id === this.aimLock?.targetId)
      ?? candidates.sort((a, b) => (a.offset + a.distance / 300) - (b.offset + b.distance / 300) || a.target.id.localeCompare(b.target.id))[0];
    if (!selected) { this.aimLock = null; return; }
    const contact = this.mission.contacts.find(contact => contact.id === selected.target.id);
    this.aimLock = { targetId: selected.target.id, label: selected.target.kind === 'training' ? `Board ${selected.target.id.replace('practice-', '')}` : `${contact?.kind === 'vehicle' ? 'Gun truck' : 'Contact'} ${selected.target.id.split('-').at(-1)}` };
    this.slewAimTo(wrap(selected.angle - this.heading), dt);
  }

  /** Crew commands remain available during an explicitly paused inspection. */
  takeHealthDecision(action: HealthDecision, faultId?: FaultId): boolean {
    if (this.missionEnded || this.dismounting || !this.vehicleHealth.decide(action, this.time, faultId)) return false;
    if (action === 'recovery') {
      this.mission.status = 'recovery'; this.mission.arrivalProgress = 0; this.speed = 0;
      this.mission.notice = this.health.message;
      this.finishMission();
    }
    return true;
  }

  get audioState(): Simulation {
    const state = this.soundState;
    state.phase = 'cabin'; state.engine = !this.missionEnded && !this.dismounting; state.paused = this.paused;
    state.time = this.time; state.speed = clamp(Math.abs(this.speed) / mphToMps(DRIVE_LIMITS_MPH.road), 0, 1);
    return state;
  }

  private makeMission(): RangeMission {
    return {
      title: 'Deliver the dismount team', status: 'enroute', failureReason: null,
      objective: { ...DISMOUNT_POINT },
      waypoints: MISSION_ROUTE.map(point => ({ x: point.x, z: point.z })),
      currentWaypoint: 1, distance: Math.hypot(DISMOUNT_POINT.x - MISSION_START.x, DISMOUNT_POINT.z - MISSION_START.z), arrivalProgress: 0, integrity: 100,
      contacts: ENEMY_CONTACTS.map(contact => ({ ...contact, health: contact.maxHealth, detected: false, neutralized: false, neutralizedAt: null, lastAttackTime: -Infinity })),
      departureCrossed: false, remainingContacts: ENEMY_CONTACTS.length, phase: 'training',
      notice: 'Practice fire before the line of departure. Crossing it starts three minutes to clear the fictional contacts and stop at the dismount point.',
    };
  }

  private makeTargets(): RangeTarget[] {
    return [...PRACTICE_TARGETS.map(target => ({ ...target, kind: 'training' as const, hitUntil: 0, destroyedAt: null, destroyedBy: null })),
      ...this.mission.contacts.map(contact => ({ id: contact.id, x: contact.x, z: contact.z, radius: contact.radius, hitUntil: 0, kind: 'enemy' as const, destroyedAt: null, destroyedBy: null }))];
  }

  tick(delta: number, input: RangeInput): void {
    if (this.paused || !Number.isFinite(delta) || delta <= 0) return;
    if (this.missionEnded) { this.finishMission(); return; }
    // Drop wall-clock backlog, including time spent in background tabs.
    const dt = Math.min(delta, .1);
    if (this.dismounting) {
      const elapsed = Math.min(dt, DISMOUNT.durationSeconds - this.dismount.elapsed);
      this.time += elapsed; this.dismount.elapsed += elapsed;
      this.mission.arrivalProgress = this.dismount.elapsed / DISMOUNT.durationSeconds;
      this.dismount.phase = this.dismount.elapsed >= DISMOUNT.rampOpenSeconds ? 'unloading' : 'opening';
      if (this.dismount.elapsed >= DISMOUNT.durationSeconds - 1e-9) {
        this.dismount.elapsed = DISMOUNT.durationSeconds; this.dismount.phase = 'complete';
        this.mission.arrivalProgress = 1;
        this.mission.status = this.dismount.validDrop ? 'complete' : 'failed';
        this.mission.notice = this.dismount.validDrop
          ? 'Mission complete: dismount team delivered. Engine off. This was a fictional arcade exercise.'
          : 'Mission failed: the team unloaded outside the marked dismount zone.';
        this.finishMission();
      }
      return;
    }
    const throttle = normalized(input.throttle), steer = normalized(input.steer), aim = normalized(input.aim);
    this.time = Math.max(0, finite(this.time));
    this.position.x = clamp(finite(this.position.x), WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
    this.position.z = clamp(finite(this.position.z), WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
    this.heading = wrap(finite(this.heading)); this.aimYaw = wrap(finite(this.aimYaw)); this.speed = clamp(finite(this.speed), -mphToMps(60), mphToMps(60));
    this.lastThrottle = throttle;
    const steps = Math.ceil(dt / .025), nominalStep = dt / steps;
    for (let i = 0; i < steps; i++) {
      const step = this.movementClock.status === 'running' ? Math.min(nominalStep, this.movementClock.remainingSeconds) : nominalStep;
      this.time += step;
      const terrain = this.terrain;
      const previousSpeed = this.speed;
      const limitMph = (throttle < 0 ? Math.min(DRIVE_LIMITS_MPH.reverse, DRIVE_LIMITS_MPH[terrain.kind]) : DRIVE_LIMITS_MPH[terrain.kind]) * this.healthSpeedFactor;
      const motion = this.dynamics.step(step, this.speed, { throttle, steer, brake: !!input.brake, limit: mphToMps(limitMph), grip: terrain.grip });
      this.speed = motion.speed;
      this.heading = wrap(this.heading + motion.yawRate * step);
      const nextX = this.position.x - Math.sin(this.heading) * this.speed * step;
      const nextZ = this.position.z - Math.cos(this.heading) * this.speed * step;
      const previousX = this.position.x, previousZ = this.position.z;
      this.position.x = clamp(nextX, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX);
      this.position.z = clamp(nextZ, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
      if (nextX !== this.position.x || nextZ !== this.position.z) this.speed = 0;
      const travelled = Math.hypot(this.position.x - previousX, this.position.z - previousZ);
      this.distanceTravelled += travelled;
      this.explorer.tick(step, this.position, this.speed);
      this.vehicleHealth.tick(step, travelled > .001 * step, this.time);
      if (this.health.phase === 'broken') {
        this.mission.status = 'breakdown'; this.mission.arrivalProgress = 0;
        this.mission.notice = this.health.message;
        this.finishMission();
        break;
      }
      if (!this.mission.departureCrossed && this.position.z <= DEPARTURE_Z) {
        this.mission.departureCrossed = true;
        this.movementTimer.update(this.time, true, false);
        this.mission.notice = 'Line of departure crossed. Three minutes to clear the fictional contacts and stop at the dismount point.';
      }
      this.crushPracticeTargets(previousX, previousZ);
      this.updateAimAssist(aim, step);
      if (input.fire && this.time - this.lastShotTime >= .14 - 1e-9) this.fire();
      this.updateMission();
      if (this.missionEnded) { this.finishMission(); break; }
      this.movementTimer.update(this.time, this.mission.departureCrossed, this.mission.status === 'arriving');
      if (this.movementClock.status === 'expired') {
        this.mission.status = 'failed'; this.mission.failureReason = 'movement-timeout'; this.mission.arrivalProgress = 0;
        this.mission.notice = 'Mission failed: three-minute movement limit expired before a cleared, stopped arrival at the dismount point.';
        this.finishMission();
        break;
      }
      this.drivetrain.tick(step, { speed: this.speed, throttle, acceleration: (this.speed - previousSpeed) / step, roughness: terrain.roughness, speedFactor: terrain.speedFactor, brake: !!input.brake, engine: !this.missionEnded });
    }
    // Keep brief effect history for tracers, casings and impacts, bounded during sustained fire.
    this.shots = this.shots.filter(shot => this.time - shot.createdAt < 1.6).slice(-16);
  }

  /** Capture a detached, immutable result once; later ticks and restart cannot rewrite it. */
  private finishMission(): void {
    this.speed = 0;
    this.aimLock = null;
    this.drivetrain.tick(.025, { speed: 0, throttle: 0, acceleration: 0, roughness: this.terrain.roughness, speedFactor: this.terrain.speedFactor, brake: true, engine: false });
    if (this.debrief || !this.missionEnded) return;
    const outcome = this.mission.status as MissionDebrief['outcome'];
    const major = this.health.faults.some(fault => fault.maintenance === 'major');
    const repair = this.health.faults.some(fault => fault.maintenance === 'repair');
    const findings = this.health.faults.map(({ id, label, severity, maintenance, consequence, repair, firstWarningAt, severeAt, diagnosed }) =>
      Object.freeze({ id, label, severity, maintenance, consequence, repair, firstWarningAt, severeAt, diagnosed }));
    const summary = outcome === 'breakdown' ? 'Vehicle stopped after overheating before delivery. Recovery and an engine assessment are required.'
      : outcome === 'failed' ? this.mission.failureReason === 'dismount-outside-zone'
        ? 'Mission failed: the ramp was dropped outside the marked dismount zone. The team exited at the wrong location. Vehicle faults and repair needs remain recorded.'
        : this.mission.failureReason === 'movement-timeout'
          ? 'Mission failed: the three-minute movement limit expired before the vehicle stopped at the cleared dismount point. Vehicle faults and repair needs remain recorded.'
          : 'Enemy contact damage ended the exercise before delivery. Vehicle faults and repair needs remain recorded.'
        : outcome === 'recovery' ? 'Crew requested in-game recovery. Vehicle held with engine off; recorded faults still require assessment.'
          : major ? 'Team delivered, with lasting vehicle damage and major repair required after deferred action.'
            : repair ? 'Team delivered, with unresolved faults requiring repair before return to service.'
              : 'Team delivered. Early pace reduction limited damage; recorded trends still require inspection.';
    this.debrief = Object.freeze({
      outcome, callsign: this.callsign, movementClock: this.movementClock, failureReason: this.mission.failureReason, endedAt: this.time, distanceTravelled: this.distanceTravelled,
      optionalVisitedLabels: this.explorer.visitedLabels(),
      contactsCleared: this.mission.contacts.filter(contact => contact.neutralized).length, contactsTotal: this.mission.contacts.length,
      summary, vehicleStatus: outcome === 'breakdown' ? 'immobilized' : major ? 'major-repair' : repair ? 'repair-required' : 'requires-inspection',
      findings: Object.freeze(findings) as unknown as MissionDebrief['findings'],
      decisions: Object.freeze(this.health.decisions.map(decision => Object.freeze({ ...decision }))) as unknown as MissionDebrief['decisions'],
    });
  }

  private updateMission(): void {
    const mission = this.mission;
    mission.remainingContacts = mission.contacts.filter(contact => !contact.neutralized).length;
    mission.phase = !mission.departureCrossed ? 'training' : mission.remainingContacts > 0 ? 'combat' : 'dismount';
    mission.distance = Math.hypot(this.position.x - mission.objective.x, this.position.z - mission.objective.z);
    const waypoint = mission.waypoints[mission.currentWaypoint]!;
    if (Math.hypot(this.position.x - waypoint.x, this.position.z - waypoint.z) < 11 && mission.currentWaypoint < mission.waypoints.length - 1) mission.currentWaypoint++;
    for (const contact of mission.departureCrossed ? mission.contacts : []) {
      if (contact.neutralized) continue;
      const distance = Math.hypot(this.position.x - contact.x, this.position.z - contact.z);
      if (!contact.detected && distance <= 130) {
        contact.detected = true;
        mission.notice = `Fictional enemy ${contact.kind === 'vehicle' ? 'gun truck' : 'troop'} contact marked on the map. Clear the contacts before the dismount team exits.`;
      }
      const cadence = contact.kind === 'troop' ? 3 : 4.5;
      if (distance <= 70 && this.time - contact.lastAttackTime >= cadence - 1e-9) {
        contact.lastAttackTime = this.time;
        mission.integrity = Math.max(0, mission.integrity - (contact.kind === 'troop' ? 2 : 4));
        mission.notice = 'Incoming arcade fire. Vehicle integrity reduced; clear the fictional contacts and continue to the dismount point.';
      }
    }
    if (mission.integrity <= 0) {
      mission.status = 'failed'; mission.arrivalProgress = 0;
      mission.failureReason = 'combat-damage';
      mission.notice = 'Exercise ended: vehicle integrity depleted. Restart to try the fictional delivery mission again.';
      return;
    }
    if (mission.distance <= mission.objective.radius && (!mission.departureCrossed || mission.remainingContacts > 0)) {
      mission.status = 'enroute'; mission.arrivalProgress = 0;
      mission.notice = `Dismount point reached with ${mission.remainingContacts} fictional contacts remaining. Clear every contact before the team exits.`;
    } else if (mission.departureCrossed && mission.remainingContacts === 0 && mission.distance <= mission.objective.radius && Math.abs(this.speed) < .8) {
      mission.status = 'arriving';
      mission.arrivalProgress = 0;
      mission.notice = 'Dismount point reached. Vehicle stopped. Select Drop ramp to let the team out.';
    } else {
      if (mission.status === 'arriving') mission.notice = 'Stop inside the dismount circle, then select Drop ramp.';
      mission.status = 'enroute'; mission.arrivalProgress = 0;
    }
  }

  private destroyTarget(target: RangeTarget, cause: 'shot' | 'vehicle'): void {
    if (target.destroyedAt !== null) return;
    target.destroyedAt = this.time; target.destroyedBy = cause; target.hitUntil = Infinity;
    if (this.aimLock?.targetId === target.id) this.aimLock = null;
  }

  /** Swept body overlap prevents skipping a board during fast movement. Debris never blocks motion. */
  private crushPracticeTargets(previousX: number, previousZ: number): void {
    const dx = this.position.x - previousX, dz = this.position.z - previousZ;
    const lengthSquared = dx * dx + dz * dz;
    for (const target of this.targets) {
      if (target.kind !== 'training' || target.destroyedAt !== null) continue;
      const along = lengthSquared > 0 ? clamp(((target.x - previousX) * dx + (target.z - previousZ) * dz) / lengthSquared, 0, 1) : 0;
      const distance = Math.hypot(target.x - previousX - along * dx, target.z - previousZ - along * dz);
      if (distance <= 1.9 + target.radius) this.destroyTarget(target, 'vehicle');
    }
  }

  private fire(): void {
    if (this.missionEnded || this.dismounting) return;
    const angle = this.heading + this.aimYaw, dx = -Math.sin(angle), dz = -Math.cos(angle);
    const pivot = this.weaponPivot();
    const origin = { x: pivot.x + dx, y: this.terrain.height + 3, z: pivot.z + dz };
    let distance = 140, hit: RangeTarget | undefined;
    for (const target of this.targets) {
      if (!this.targetActive(target)) continue;
      const tx = target.x - origin.x, tz = target.z - origin.z;
      const along = tx * dx + tz * dz;
      const across = Math.abs(tx * dz - tz * dx);
      if (along > 0 && along < distance && across <= target.radius) { distance = along; hit = target; }
    }
    if (hit) {
      this.hits++;
      const contact = this.mission.contacts.find(contact => contact.id === hit.id);
      if (contact) {
        contact.detected = true; contact.health = Math.max(0, contact.health - 1);
        hit.hitUntil = this.time + .12;
        if (contact.health === 0) {
          contact.neutralized = true; contact.neutralizedAt = this.time;
          this.destroyTarget(hit, 'shot');
          this.mission.notice = `Fictional enemy ${contact.kind === 'vehicle' ? 'gun truck' : 'troop'} neutralized. Clear the remaining contacts, then deliver the team.`;
        }
      } else this.destroyTarget(hit, 'shot');
    }
    const contact = hit ? this.mission.contacts.find(contact => contact.id === hit.id) : undefined;
    const targetHeight = contact ? contact.kind === 'troop' ? 1.25 : 2.2 : 2.4;
    this.lastShotTime = this.time;
    this.shotsFired++;
    this.shots.push({ id: this.shotsFired, origin, end: { x: origin.x + dx * distance, y: hit ? terrainAt(hit.x, hit.z).height + targetHeight : origin.y, z: origin.z + dz * distance }, hitTargetId: hit?.id, createdAt: this.time });
  }

  restart(): void {
    this.time = 0; this.paused = false; this.position = { ...MISSION_START }; this.heading = 0; this.speed = 0;
    this.distanceTravelled = 0; this.debrief = null;
    this.dismount = stowedDismount();
    this.explorer.reset();
    this.movementTimer.reset();
    this.aimYaw = 0; this.shotsFired = 0; this.hits = 0; this.lastShotTime = -Infinity;
    this.aimLock = null; this.manualAimUntil = 0; this.centeringAim = false;
    this.shots = []; this.mission = this.makeMission(); this.targets = this.makeTargets(); this.soundState.restart(); this.drivetrain.restart(); this.vehicleHealth.restart(); this.dynamics.restart(); this.lastThrottle = 0;
  }
}
