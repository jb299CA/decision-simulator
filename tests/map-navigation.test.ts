import test from 'node:test';
import assert from 'node:assert/strict';
import { clientMapPoint, clampMapViewport, MapNavigation } from '../src/map-navigation.ts';

const rect = { left: 10, top: 20, width: 320, height: 360 };

test('zoom stays bounded, preserves center and recenter/pan never escape the world', () => {
  const nav = new MapNavigation();
  nav.setZoom(2);
  assert.deepEqual(nav.view, { x: 40, y: 45, width: 80, height: 90 });
  nav.setZoom(100); assert.equal(nav.zoom, 4);
  nav.center(999, -999); assert.deepEqual(nav.view, { x: 120, y: 0, width: 40, height: 45 });
  nav.pan(-999, 999); assert.equal(nav.view.x, 0); assert.equal(nav.view.y, 135);
  nav.fit(); assert.equal(nav.zoom, 1); assert.deepEqual(nav.view, { x: 0, y: 0, width: 160, height: 180 });
  assert.deepEqual(clampMapViewport({ x: NaN, y: Infinity, width: NaN, height: 0 }), nav.view);
});

test('client coordinates account for SVG letterboxing and the zoomed viewport', () => {
  const view = { x: 40, y: 45, width: 80, height: 90 };
  assert.deepEqual(clientMapPoint(170, 200, rect, view), { x: 80, y: 90 });
  const wide = { left: 0, top: 0, width: 500, height: 180 };
  assert.equal(clientMapPoint(10, 90, wide, { x: 0, y: 0, width: 160, height: 180 }), null);
  assert.deepEqual(clientMapPoint(250, 90, wide, { x: 0, y: 0, width: 160, height: 180 }), { x: 80, y: 90 });
  assert.equal(clientMapPoint(NaN, 0, rect, view), null);
  assert.equal(clientMapPoint(0, 0, { ...rect, width: 0 }, view), null);
});

test('small finger jitter taps, a real drag pans and remains a drag after returning', () => {
  const nav = new MapNavigation(); nav.setZoom(2);
  nav.begin(1, 100, 100, rect); nav.move(1, 104, 101);
  assert.equal(nav.end(1, 104, 101), true); assert.equal(nav.view.x, 40);
  nav.begin(2, 100, 100, rect); nav.move(2, 140, 120);
  assert.equal(nav.view.x, 30); assert.equal(nav.view.y, 40);
  nav.move(2, 100, 100);
  assert.equal(nav.end(2, 100, 100), false);
  nav.begin(3, 100, 100, rect);
  assert.equal(nav.end(3, 140, 100), false); // release without an intermediate move
});

test('attempted pinch never chooses a waypoint in either release order or after cancel', () => {
  for (const order of [[1, 2], [2, 1]]) {
    const nav = new MapNavigation();
    assert.equal(nav.begin(1, 100, 100, rect), true);
    assert.equal(nav.begin(2, 160, 100, rect), false);
    assert.equal(nav.move(1, 110, 100), false);
    assert.equal(nav.end(order[0], 100, 100), false);
    assert.equal(nav.end(order[1], 100, 100), false);
    nav.begin(3, 100, 100, rect); assert.equal(nav.end(3, 100, 100), true);
  }
  const nav = new MapNavigation();
  nav.begin(1, 100, 100, rect); nav.begin(2, 160, 100, rect); nav.cancelPointer(2);
  assert.equal(nav.end(1, 100, 100), false);
  nav.begin(3, 100, 100, rect); nav.cancel();
  assert.equal(nav.end(3, 100, 100), false);
  assert.deepEqual(nav.pointerIds, []);
});
