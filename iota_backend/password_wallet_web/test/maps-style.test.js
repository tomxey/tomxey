import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BASEMAP_DIR, SOURCE_NAME, styleFor } from '../src/maps/style.js';

const BASE = 'https://example.org/sub/maps.html';
const style = (over = {}) => styleFor({ maxzoom: 14, base: BASE, ...over });

test('the style is a v8 shell pointing at the pmtiles source', () => {
  const s = style();
  assert.equal(s.version, 8);
  assert.equal(s.sources[SOURCE_NAME].type, 'vector');
  assert.equal(s.sources[SOURCE_NAME].url, `pmtiles://${SOURCE_NAME}`);
  assert.equal(s.sources[SOURCE_NAME].maxzoom, 14);
});

test('the asset directory stays relative, so it deploys under a subpath', () => {
  assert.equal(/^https?:/.test(BASEMAP_DIR), false);
});

test('glyphs and sprites are absolute — MapLibre rejects relative ones', () => {
  // "Invalid sprite URL ... must be absolute" is a hard error that leaves a
  // canvas with no map on it.
  const s = style();
  assert.ok(s.sprite.startsWith('https://'), s.sprite);
  assert.ok(s.glyphs.startsWith('https://'), s.glyphs);
});

test('the glyph placeholders survive resolution', () => {
  // Regression: new URL() percent-encodes { and } to %7B/%7D, after which
  // MapLibre never substitutes the fontstack and no label renders.
  const s = style();
  assert.ok(s.glyphs.includes('{fontstack}'), s.glyphs);
  assert.ok(s.glyphs.includes('{range}'), s.glyphs);
  assert.equal(s.glyphs.includes('%7B'), false, s.glyphs);
});

test('assets resolve against the page, not the server root', () => {
  // GitHub Pages serves this under a subpath; a root-absolute URL would 404.
  const s = style();
  assert.ok(s.glyphs.startsWith('https://example.org/sub/basemaps/'), s.glyphs);
  assert.ok(s.sprite.startsWith('https://example.org/sub/basemaps/'), s.sprite);
});

test('assets are same-origin, never protomaps.github.io', () => {
  const s = style();
  for (const url of [s.glyphs, s.sprite]) {
    assert.equal(new URL(url).origin, new URL(BASE).origin, url);
  }
});

test('the style has layers', () => {
  assert.ok(style().layers.length > 10);
});

test('maxzoom is carried through so overzoom works above z14', () => {
  assert.equal(style({ maxzoom: 12 }).sources[SOURCE_NAME].maxzoom, 12);
});
