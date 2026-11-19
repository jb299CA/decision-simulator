import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_KEYS, KeyboardCheck, keyboardCheckMarkup } from '../src/keyboard-check.ts';

test('keyboard check is explicit and tracks eight navigation indicators in memory', () => {
  const check = new KeyboardCheck();
  assert.equal(check.observe({ type: 'keydown', key: 'ArrowLeft' }, 'capture'), false);
  check.start();
  for (const [code] of CHECK_KEYS) {
    const event = { type: 'keydown', code, key: code.startsWith('Key') ? code.slice(-1).toLowerCase() : code };
    assert.equal(check.observe(event, 'capture'), true);
    assert.equal(check.observe(event, 'bubble'), true);
    assert.equal(check.latest?.capture, true); assert.equal(check.latest?.bubble, true);
    assert.equal(check.received.has(code), true); assert.equal(check.held.has(code), true);
    check.observe({ ...event, type: 'keyup' }, 'capture');
    assert.equal(check.held.has(code), false);
  }
  assert.equal(check.received.size, 8);
  assert.match(check.status, /4 of 4 arrow keys received/);
  assert.match(check.details, /keyup.*normalized=KeyD.*capture=yes.*bubble=no/);
});

test('check distinguishes recognized letters, capture-only events and unidentified arrivals', () => {
  const check = new KeyboardCheck(); check.start();
  const event = { type: 'keydown', key: 'w', code: 'KeyW', repeat: true, metaKey: true };
  check.observe(event, 'capture');
  assert.match(check.status, /W received; no recognized arrow keys received yet/);
  assert.match(check.details, /repeat=yes.*modifiers=Meta.*capture=yes.*bubble=no/);
  check.observe(event, 'bubble'); assert.match(check.details, /bubble=yes/);
  check.observe({ type: 'keydown', key: 'Unidentified', code: 'Unidentified' }, 'capture');
  assert.match(check.details, /key=Unidentified.*normalized=\(unrecognized\)/);
  assert.equal(check.received.size, 1, 'unidentified arrival never lights a known indicator');
  assert.doesNotMatch(check.status, /blocked|OS|browser/i);
});

test('check rejects free text and shortcuts outside navigation and bounds displayed values', () => {
  const check = new KeyboardCheck(); check.start();
  for (const key of ['x', 'Enter', 'Tab', 'Escape', 'my private text']) assert.equal(check.observe({ type: 'keydown', key }, 'capture'), false);
  assert.equal(check.latest, null);
  check.observe({ type: 'keydown', code: 'KeyW', key: '<secret typed text>' }, 'capture');
  assert.equal(check.latest?.key, '(other)');
  assert.doesNotMatch(check.details, /secret|<|>/);
  assert.equal(check.observe({ type: 'keydown', key: 'f', code: 'KeyF' }, 'bubble'), false);
});

test('stopping on focus or lifecycle cleanup disarms observation and clears held indicators', () => {
  const check = new KeyboardCheck(); check.start();
  check.observe({ type: 'keydown', key: 'ArrowUp' }, 'capture'); check.stop();
  assert.equal(check.active, false); assert.equal(check.held.size, 0);
  assert.equal(check.observe({ type: 'keydown', key: 'ArrowLeft' }, 'bubble'), false);
  assert.equal(check.received.has('ArrowLeft'), false);
  assert.match(check.status, /^Check stopped/);
  check.start(); assert.equal(check.received.size, 0); assert.equal(check.latest, null);
  check.observe({ type: 'keydown', key: 'w' }, 'capture'); check.reset();
  assert.equal(check.active, false); assert.equal(check.received.size, 0); assert.equal(check.latest, null);
});

test('check markup starts collapsed with explicit start and a non-editable focused area', () => {
  const html = keyboardCheckMarkup();
  assert.match(html, /<details class="keyboard-check" id="keyboard-check">/);
  assert.match(html, /data-action="keyboard-check-start"/);
  assert.match(html, /id="keyboard-check-area"[^>]*tabindex="-1"[^>]*role="group"/);
  assert.equal((html.match(/data-check-key=/g) ?? []).length, 8);
  assert.doesNotMatch(html, /contenteditable|<input|<textarea|localStorage|fetch\(/);
});


test('release-only arrival stays visible in event details without lighting a press indicator', () => {
  const check = new KeyboardCheck(); check.start();
  check.observe({ type: 'keyup', key: 'ArrowUp', code: 'ArrowUp' }, 'capture');
  assert.equal(check.received.has('ArrowUp'), false);
  assert.equal(check.held.size, 0);
  assert.match(check.details, /keyup.*normalized=ArrowUp/);
  assert.match(check.status, /No recognized navigation keys received yet/);
  check.observe({ type: 'keydown', key: 'ArrowUp', code: 'ArrowUp' }, 'capture');
  assert.equal(check.received.has('ArrowUp'), true); assert.equal(check.held.has('ArrowUp'), true);
  check.observe({ type: 'keyup', key: 'ArrowUp', code: 'ArrowUp' }, 'capture');
  assert.equal(check.received.has('ArrowUp'), true); assert.equal(check.held.has('ArrowUp'), false);
});

test('direction indicator labels use distinct arrows and readable accessible names', () => {
  assert.deepEqual(CHECK_KEYS.slice(0, 4).map(([, label]) => label.codePointAt(0)), [0x2191, 0x2193, 0x2190, 0x2192]);
  for (const name of ['Up', 'Down', 'Left', 'Right']) assert.ok(keyboardCheckMarkup().includes(`aria-label="${name}: not received"`));
});
