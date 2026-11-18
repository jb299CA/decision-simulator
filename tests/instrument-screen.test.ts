import assert from 'node:assert/strict';
import test from 'node:test';
import { instrumentSnapshot, InstrumentScreen } from '../src/instrument-screen.ts';
import type { VehicleFault } from '../src/mission-contract.ts';
import { systemHealthScore } from '../src/health-score.ts';

const fault: VehicleFault = { id: 'charging', label: 'Charging', component: 'Charging system', severity: 'severe', diagnosed: false, firstWarningAt: 2, severeAt: 5, exposure: 1, damage: 0, baseline: 100, reading: 128.5, observations: [{ time: 0, value: 100 }, { time: 1, value: 128.5 }], consequence: 'Fault', maintenance: 'repair', repair: 'Repair needed' };
const input = { mode: 'range' as const, time: 1.29, engine: true, speed: -4, rpm: 1821, load: .53, integrity: 81, status: 'Review', faults: [fault] };

test('physical screen uses actual relative readings and categorical severity without thresholds', () => {
  const snapshot = instrumentSnapshot(input);
  assert.equal(snapshot.rows[0].value, 128.5); assert.equal(snapshot.rows[0].severity, 'severe');
  assert.deepEqual(snapshot.rows[0].history, [100, 128.5]); assert.equal(snapshot.speed, 4); assert.equal(snapshot.load, 53);
  assert.equal(snapshot.time, 1.2);
  fault.reading = 100;
  assert.equal(instrumentSnapshot(input).rows[0].severity, 'severe', 'reading alone does not replace state severity'); fault.reading = 128.5;
  assert.equal(instrumentSnapshot({ ...input, faults: [{ ...fault, severity: 'normal' }] }).rows[0].label, fault.component);
  assert.equal(snapshot.rows[0].label, fault.label);
});

test('normalization prevents NaN and uses zero drivetrain values after engine shutdown', () => {
  const snapshot = instrumentSnapshot({ ...input, engine: false, time: NaN, speed: Infinity, rpm: NaN, load: NaN, integrity: NaN, faults: [{ ...fault, reading: NaN, observations: [{ time: 0, value: NaN }] }] });
  assert.equal(snapshot.time, 0); assert.equal(snapshot.speed, 0); assert.equal(snapshot.rpm, 0); assert.equal(snapshot.load, 0);
  assert.equal(snapshot.integrity, 0); assert.equal(snapshot.rows[0].value, null); assert.deepEqual(snapshot.rows[0].history, []);
});

test('guided display preserves actual voltage evidence and alert state', () => {
  const snapshot = instrumentSnapshot({ ...input, mode: 'guided', faults: undefined, voltage: 30.21, voltageHistory: [28.1, 29, NaN, 30.21], alert: true });
  assert.equal(snapshot.rows.length, 1); assert.equal(snapshot.rows[0].value, 30.21); assert.equal(snapshot.rows[0].unit, 'V');
  assert.deepEqual(snapshot.rows[0].history, [28.1, 29, 30.21]); assert.equal(snapshot.rows[0].severity, 'moderate');
  assert.equal(instrumentSnapshot({ ...input, mode: 'guided', alert: false }).rows[0].severity, 'severe', 'supplied charging state controls row severity');
});

test('systems score uses fault state independently from mobility and voltage', () => {
  const snapshot = instrumentSnapshot(input);
  assert.deepEqual(snapshot.systems, systemHealthScore(input.faults));
  assert.deepEqual(instrumentSnapshot({ ...input, integrity: 1 }).systems, snapshot.systems);
  const guided = instrumentSnapshot({ ...input, mode: 'guided', faults: undefined, voltage: 30.21, alert: true });
  assert.equal(guided.systems.available, false);
  assert.equal(guided.systems.label, 'No data');
  assert.equal(instrumentSnapshot({ ...input, faults: [] }).systems.available, false);
});

test('one texture is reused, paint is bucketed on simulation time and shutdown is dark', () => {
  const oldDocument = globalThis.document;
  let paints = 0, texts: string[] = [];
  const context = new Proxy({}, { get: (_, property) => property === 'fillRect' ? () => paints++ : property === 'fillText' ? (text: string) => texts.push(text) : () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
  try {
    const screen = new InstrumentScreen(), texture = screen.texture;
    assert.equal(screen.update(input), true); const painted = paints;
    for (const text of ['SYSTEMS', 'SPEED', 'ENGINE', 'LOAD', 'SEVERE', '% start', 'RECENT SAMPLES']) assert.ok(texts.includes(text), `physical screen labels ${text}`);
    assert.ok(texts.includes(String(systemHealthScore(input.faults).score)));
    assert.equal(screen.update({ ...input, time: 1.31, speed: 8 }), false); assert.equal(paints, painted);
    assert.equal(screen.update({ ...input, time: 1.4 }), true); assert.equal(screen.texture, texture);
    assert.equal(screen.update({ ...input, time: 1.4 }), false, 'paused timestamp does not repaint');
    assert.equal(screen.update({ ...input, time: 1.4, status: 'Pace reduced' }), true, 'discrete paused decisions repaint immediately');
    texts = []; const beforeShutdown = paints;
    assert.equal(screen.update({ ...input, time: 1.4, engine: false }), true);
    assert.equal(paints - beforeShutdown, 1); assert.deepEqual(texts, []); screen.dispose();
  } finally { globalThis.document = oldDocument; }
});

test('bundled logo loads into the frozen screen, stays dark after shutdown and cannot repaint after disposal', () => {
  const oldDocument = globalThis.document, oldImage = globalThis.Image;
  let paints = 0, images = 0, texts: string[] = [];
  const context = new Proxy({}, { get: (_, property) => property === 'fillRect' ? () => paints++ : property === 'drawImage' ? () => images++ : property === 'fillText' ? (text: string) => texts.push(text) : () => {}, set: () => true });
  class FakeImage {
    complete = false; naturalWidth = 0; src = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
  }
  let logo: FakeImage;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
  globalThis.Image = class extends FakeImage { constructor() { super(); logo = this; } } as unknown as typeof Image;
  try {
    const screen = new InstrumentScreen();
    assert.equal(logo!.src, '/branding/shift5-logo.svg');
    screen.update(input);
    const frozenText = [...texts], beforeLogo = screen.texture.version;
    texts = []; logo!.complete = true; logo!.naturalWidth = 167; logo!.onload!();
    assert.deepEqual(texts, frozenText, 'asset arrival uses the stored simulation snapshot');
    assert.equal(images, 1); assert.equal(screen.texture.version, beforeLogo + 1);
    assert.equal(screen.update(input), false, 'asset arrival does not invalidate the simulation-time bucket');
    screen.update({ ...input, engine: false });
    texts = []; const beforeOffLoad = paints, imagesBeforeOffLoad = images;
    logo!.onload!();
    assert.equal(paints - beforeOffLoad, 1); assert.deepEqual(texts, []);
    assert.equal(images, imagesBeforeOffLoad, 'branding never illuminates a powered-off display');
    const lateLoad = logo!.onload!, beforeDispose = paints, disposedVersion = screen.texture.version;
    screen.dispose();
    assert.equal(logo!.onload, null); assert.equal(logo!.onerror, null);
    lateLoad();
    assert.equal(screen.update(input), false);
    assert.equal(paints, beforeDispose); assert.equal(screen.texture.version, disposedVersion);
  } finally { globalThis.document = oldDocument; globalThis.Image = oldImage; }
});
