// The region registry: what the app knows about a map before it finds one.
//
// The last test is the load-bearing one — the whole design rests on the app
// knowing WHAT it wants (a CID) and never WHERE it lives.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_REGION, REGIONS, regionById, regionFrom } from '../src/maps/regions.js';

test('Kraków is registered at the agreed bbox, zoom and CID', () => {
  const k = REGIONS[DEFAULT_REGION];
  assert.deepEqual(k.bbox, [19.6567, 49.8817, 20.2165, 50.2411]);
  assert.equal(k.maxzoom, 14);
  assert.match(k.cid, /^bafy[a-z0-9]+$/);
});

test('?region= selects a known region', () => {
  assert.equal(regionFrom('?region=krakow'), 'krakow');
});

test('an unknown ?region= falls back rather than yielding undefined', () => {
  assert.equal(regionFrom('?region=atlantis'), DEFAULT_REGION);
  assert.notEqual(regionById(regionFrom('?region=atlantis')), null);
});

test('absent or empty search falls back', () => {
  assert.equal(regionFrom(''), DEFAULT_REGION);
  assert.equal(regionFrom(undefined), DEFAULT_REGION);
});

test('regionById returns null for an unknown id', () => {
  assert.equal(regionById('atlantis'), null);
});

test('no entry names a host — only content identity', () => {
  // The whole point of the design: the app must not know where data lives.
  const text = JSON.stringify(REGIONS);
  for (const bad of ['http://', 'https://', '/ip4/', '/dns4/', '.com', '.dev']) {
    assert.equal(text.includes(bad), false, `registry leaks a host: ${bad}`);
  }
});
