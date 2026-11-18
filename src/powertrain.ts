import { DRIVE_LIMITS_MPH, mphToMps } from './driving-dynamics.ts';

/** Synthesized arcade sound controls; these are not vehicle performance data. */
export type PowertrainState = {
  rpm: number;
  load: number;
  throttle: number;
  gear: number;
  whine: number;
  roughness: number;
};

type PowertrainInput = { speed: number; throttle: number; acceleration: number; roughness: number; speedFactor: number; brake: boolean; engine: boolean };
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
const follow = (from: number, to: number, rate: number, dt: number): number => from + (to - from) * (1 - Math.exp(-rate * dt));

/** Virtual gears and turbo-like spool separate engine effort from road speed. */
export class ArcadePowertrain {
  readonly state: PowertrainState = { rpm: 720, load: .08, throttle: 0, gear: 1, whine: 0, roughness: .08 };
  private shiftTime = 0;

  tick(delta: number, input: PowertrainInput): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(delta, .1), state = this.state;
    if (!input.engine) {
      state.rpm = 0; state.load = 0; state.throttle = 0; state.whine = 0;
      this.shiftTime = 0;
      return;
    }
    const topSpeed = mphToMps(DRIVE_LIMITS_MPH.road);
    const speed = Math.abs(clamp(input.speed, -topSpeed, topSpeed));
    const throttle = Math.abs(clamp(input.throttle, -1, 1));
    const oldGear = state.gear;
    if (input.speed < -.1) state.gear = -1;
    else {
      if (state.gear < 1) state.gear = 1;
      const up = [0, 6.5, 13.5, 20, Infinity], down = [0, 0, 5.2, 11.8, 18];
      if (speed > up[state.gear]! && state.gear < 4) state.gear++;
      else if (speed < down[state.gear]! && state.gear > 1) state.gear--;
    }
    if (state.gear !== oldGear) this.shiftTime = .24;
    this.shiftTime = Math.max(0, this.shiftTime - dt);
    state.roughness = clamp(input.roughness, 0, 1);
    state.throttle = follow(state.throttle, throttle, 10, dt);
    const effort = state.throttle * (.2 + .35 * (1 - clamp(input.speedFactor, 0, 1)) + .35 * clamp(Math.abs(input.acceleration) / 2.35, 0, 1) + (input.brake ? .25 : 0));
    state.load = follow(state.load, clamp(.07 + effort, 0, 1), 5, dt);
    const ratio = state.gear < 0 ? 1 : [0, 1, .69, .5, .38][state.gear]!;
    const driven = speed * ratio * 76;
    const shiftDip = this.shiftTime > 0 ? .72 : 1;
    const targetRpm = clamp(720 + (state.throttle * 950 + driven + state.load * 340) * shiftDip, 720, 2650);
    state.rpm = follow(state.rpm, targetRpm, this.shiftTime > 0 ? 16 : 7, dt);
    const targetWhine = clamp(state.throttle * .45 + state.load * .45 + (state.rpm - 720) / 1930 * .24 - .12, 0, 1);
    state.whine = follow(state.whine, targetWhine, targetWhine > state.whine ? 1.9 : 2.7, dt);
  }

  restart(): void {
    Object.assign(this.state, { rpm: 720, load: .08, throttle: 0, gear: 1, whine: 0, roughness: .08 });
    this.shiftTime = 0;
  }
}
