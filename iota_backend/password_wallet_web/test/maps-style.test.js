// test/maps-style.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GLYPHS_URL, SOURCE_NAME, SPRITE_URL, styleFor } from '../src/maps/style.js';

test('the style is a v8 shell pointing at the pmtiles source', () => {
  const s = styleFor({ maxzoom: 14 });
  assert.equal(s.version, 8);
  assert.equal(s.sources[SOURCE_NAME].type, 'vector');
  assert.equal(s.sources[SOURCE_NAME].url, `pmtiles://${SOURCE_NAME}`);
  assert.equal(s.sources[SOURCE_NAME].maxzoom, 14);
});

test('glyphs and sprites are same-origin, never protomaps.github.io', () => {
  const s = styleFor({ maxzoom: 14 });
  for (const url of [s.glyphs, s.sprite, GLYPHS_URL, SPRITE_URL]) {
    assert.equal(/^https?:/.test(url), false, url);
  }
});

test('the style has layers', () => {
  assert.ok(styleFor({ maxzoom: 14 }).layers.length > 10);
});

test('maxzoom is carried through so overzoom works above z14', () => {
  assert.equal(styleFor({ maxzoom: 12 }).sources[SOURCE_NAME].maxzoom, 12);
});
