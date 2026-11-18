import assert from 'node:assert/strict';
import test from 'node:test';
import { DrivingDynamics, DRIVE_LIMITS_MPH, DRIVING_TUNING, mphToMps, mpsToMph } from '../src/driving-dynamics.ts';

const full = { throttle: 1, steer: 0, brake: false, limit: mphToMps(60), grip: 1 };
test('metres per second convert to signed MPH and terrain tuning is explicit', () => {
  assert.equal(mphToMps(60), 26.8224);
  assert.equal(mpsToMph(mphToMps(-10)), -10);
  assert.deepEqual(DRIVE_LIMITS_MPH, { road: 60, grass: 45, wash: 25, rock: 18, reverse: 10 });
});

test('progressive heavy acceleration reaches30mph in6–9s and60mph in20–30s', () => {
  const model = new DrivingDynamics(); let speed = 0, thirty = 0, sixty = 0;
  for (let t = .025; t <= 30; t += .025) {
    speed = model.step(.025, speed, full).speed;
    if (!thirty && mpsToMph(speed) >= 30) thirty = t;
    if (!sixty && mpsToMph(speed) >= 60 - 1e-8) sixty = t;
  }
  assert.ok(thirty >= 6 && thirty <= 9, `30mph at ${thirty}s`);
  assert.ok(sixty >= 20 && sixty <= 30, `60mph at ${sixty}s`);
  assert.equal(mpsToMph(speed), 60);
});

test('steering ramps, cannot pivot stationary, reverses correctly, and caps highspeed lateral acceleration', () => {
  const model = new DrivingDynamics(), input = { ...full, steer: 1 };
  assert.equal(model.step(.025, 0, { ...input, throttle: 0 }).yawRate, 0);
  assert.ok(model.steeringAngle > 0 && model.steeringAngle < DRIVING_TUNING.maxSteer * .1);
  const first = model.step(.025, 2, input).yawRate;
  for (let i = 0; i < 100; i++) model.step(.025, 2, input);
  assert.ok(model.step(.025, 2, input).yawRate > first * 2);
  assert.ok(model.step(.025, -2, { ...input, throttle: -1, limit: mphToMps(10) }).yawRate < 0);
  const speed = mphToMps(60), fast = model.step(.025, speed, input);
  assert.ok(Math.abs(fast.yawRate * fast.speed) <= 3.5 + 1e-9);
  assert.ok(Math.abs(fast.speed / fast.yawRate) > 200, 'top-speed turning radius stays broad');
  assert.ok(Math.abs(fast.speed / DRIVING_TUNING.wheelbase * Math.tan(model.appliedSteeringAngle) - fast.yawRate) < 1e-10);
  model.restart(); assert.equal(model.steeringAngle, 0);
});

test('coasting, terrain speed reduction and direction changes remain continuous', () => {
  const model = new DrivingDynamics(), speed = mphToMps(60);
  const coast = model.step(.025, speed, { ...full, throttle: 0 }).speed;
  assert.ok(coast < speed && coast > speed - .03);
  const rough = model.step(.025, speed, { ...full, limit: mphToMps(18) }).speed;
  assert.ok(rough < speed && rough > speed - .08, 'terrain does not snap to its lower cap');
  let reversing = 2, reachedZero = false;
  for (let i = 0; i < 200; i++) {
    reversing = model.step(.025, reversing, { ...full, throttle: -1, limit: mphToMps(10) }).speed;
    if (reversing === 0) reachedZero = true;
  }
  assert.equal(reachedZero, true); assert.equal(reversing, -mphToMps(10));
  const angle = model.steeringAngle;
  assert.deepEqual(model.step(NaN, reversing, full), { speed: reversing, yawRate: 0 });
  assert.equal(model.steeringAngle, angle);
});

test('terrain caps and proportional input settle deterministically without overshoot', () => {
  for (const mph of Object.values(DRIVE_LIMITS_MPH)) {
    const model = new DrivingDynamics(); let speed = 0;
    for (let i = 0; i < 1600; i++) speed = model.step(.025, speed, { ...full, limit: mphToMps(mph), throttle: .5 }).speed;
    assert.ok(Math.abs(mpsToMph(speed) - mph * .5) < 1e-10);
  }
  const run = (dt: number) => {
    const model = new DrivingDynamics(); let speed = 0;
    for (let i = 0; i < Math.round(8 / dt); i++) speed = model.step(dt, speed, full).speed;
    return speed;
  };
  assert.ok(Math.abs(run(.025) - run(.01)) < .02, 'integration is stable across common frame rates');
});
