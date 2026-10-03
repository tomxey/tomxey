// test/maps-support.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { webglAvailable } from '../src/maps/support.js';

test('webgl2 present means supported', () => {
  assert.equal(webglAvailable(() => ({ getContext: () => ({}) })), true);
});

test('no context means unsupported rather than a thrown error', () => {
  // MapLibre throws during construction on such a device, leaving a blank
  // page with no explanation. Detect it and say so.
  assert.equal(webglAvailable(() => ({ getContext: () => null })), false);
});

test('a getContext that throws is treated as unsupported', () => {
  assert.equal(webglAvailable(() => ({ getContext() { throw new Error('blocked'); } })), false);
});
