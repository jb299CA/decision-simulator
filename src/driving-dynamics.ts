/** One world unit is one simulated metre; speed is signed metres per second. */
export const METRES_PER_SECOND_PER_MPH = .44704;
export const mphToMps = (mph: number): number => mph * METRES_PER_SECOND_PER_MPH;
export const mpsToMph = (mps: number): number => mps / METRES_PER_SECOND_PER_MPH;
/** Road top speed follows the Army's public 60 mph reference. All remaining
 * limits, acceleration and handling are game tuning, not equipment performance.
 * https://www.army.mil/article/277459/56th_stryker_brigade_combat_team_getting_upgraded_strykers */
export const DRIVE_LIMITS_MPH = { road: 60, grass: 45, wash: 25, rock: 18, reverse: 10 } as const;
export const DRIVING_TUNING = { wheelbase: 4.5, maxSteer: Math.PI / 6, lateralAcceleration: 3.5, steeringResponse: 3.5 } as const;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));

/** A deliberately simplified heavy-vehicle bicycle model with a grip-limited turn.
 * State belongs to the exercise; this class stores only the smoothed wheel angle. */
export class DrivingDynamics {
  steeringAngle = 0;
  appliedSteeringAngle = 0;

  step(dt: number, speed: number, input: { throttle: number; steer: number; brake: boolean; limit: number; grip: number }): { speed: number; yawRate: number } {
    if (!Number.isFinite(dt) || dt <= 0) return { speed, yawRate: 0 };
    dt = Math.min(dt, .1);
    speed = clamp(speed, -mphToMps(60), mphToMps(60));
    const throttle = clamp(input.throttle, -1, 1), limit = clamp(input.limit, 0, mphToMps(60));
    const desired = input.brake ? 0 : throttle * limit;
    const opposing = desired * speed < 0;
    const slowing = Math.abs(desired) < Math.abs(speed);
    // Full throttle reaches 30 mph in about 7 s and 60 mph in about 21 s.
    // Speed governs acceleration progressively; terrain/health transitions decelerate.
    const acceleration = input.brake ? 4.2 : opposing ? 4.2
      : throttle === 0 ? .45 + Math.abs(speed) * .012
        : slowing ? 2.8 : 2.35 * (1 - .8 * Math.pow(Math.min(1, Math.abs(speed) / mphToMps(60)), 1.25));
    // Direction changes reach zero before reverse/forward propulsion begins.
    const target = opposing ? 0 : desired;
    speed += clamp(target - speed, -acceleration * dt, acceleration * dt);
    if (Math.abs(speed) < 1e-6) speed = 0;
    const targetAngle = clamp(input.steer, -1, 1) * DRIVING_TUNING.maxSteer;
    this.steeringAngle += (targetAngle - this.steeringAngle) * (1 - Math.exp(-DRIVING_TUNING.steeringResponse * dt));
    const bicycleYaw = speed / DRIVING_TUNING.wheelbase * Math.tan(this.steeringAngle);
    const maxYaw = Math.abs(speed) > .001 ? DRIVING_TUNING.lateralAcceleration * clamp(input.grip, .1, 1) / Math.abs(speed) : 0;
    const yawRate = clamp(bicycleYaw, -maxYaw, maxYaw);
    this.appliedSteeringAngle = Math.abs(speed) > .001 ? Math.atan(yawRate * DRIVING_TUNING.wheelbase / speed) : this.steeringAngle;
    return { speed, yawRate };
  }

  restart(): void { this.steeringAngle = 0; this.appliedSteeringAngle = 0; }
}
