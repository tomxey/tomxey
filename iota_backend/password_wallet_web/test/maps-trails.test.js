// test/maps-trails.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SOURCE_NAME, styleFor, trailLayers } from '../src/maps/style.js';

const layers = trailLayers(SOURCE_NAME);
const byId = (id) => layers.find((l) => l.id === id);

test('every trail layer reads the roads layer of our source', () => {
  for (const l of layers) {
    assert.equal(l.source, SOURCE_NAME, l.id);
    assert.equal(l['source-layer'], 'roads', l.id);
  }
});

test('unpaved ways are drawn dashed', () => {
  const l = byId('trek-unpaved');
  assert.ok(l, 'no unpaved layer');
  assert.ok(JSON.stringify(l.paint).includes('line-dasharray'), 'unpaved is not dashed');
  assert.ok(JSON.stringify(l.filter).includes('surface'), 'unpaved does not read surface');
});

test('track quality drives the dash, grade1 through grade5', () => {
  // One layer per grade on purpose: line-dasharray is NOT data-driven in
  // MapLibre (it is read with constantOr), so a match expression on it is
  // ignored and every track would come out with the same dash.
  const dashes = [];
  for (const grade of ['grade1', 'grade2', 'grade3', 'grade4', 'grade5']) {
    const l = byId(`trek-tracktype-${grade}`);
    assert.ok(l, `no layer for ${grade}`);
    assert.ok(JSON.stringify(l.filter).includes(grade), `${grade} layer does not filter on it`);
    const dash = l.paint['line-dasharray'];
    assert.ok(Array.isArray(dash) && dash.every((n) => typeof n === 'number'),
      `${grade} dasharray must be a constant array, not an expression`);
    dashes.push(dash.join(','));
  }
  assert.equal(new Set(dashes).size, 5, 'the five grades must look different');
});

test('foot, bike and bridleway are visually distinct', () => {
  const l = byId('trek-paths');
  assert.ok(l, 'no paths layer');
  const s = JSON.stringify(l);
  for (const kind of ['footway', 'cycleway', 'bridleway', 'track']) {
    assert.ok(s.includes(kind), `paths layer does not distinguish ${kind}`);
  }
});

// --- Review Focus 5 ---------------------------------------------------

test('an unrecognised path kind still gets a colour', () => {
  // OSM is free text and `kind_detail` carries whatever the tagger wrote.
  // A match with no fallback renders nothing, which on a trekking map
  // means a path that exists and is not drawn.
  // line-color is a `case` wrapping a `match`, so find the match rather
  // than assume it is at the top.
  const findMatch = (node) => {
    if (!Array.isArray(node)) return null;
    if (node[0] === 'match') return node;
    for (const child of node) {
      const found = findMatch(child);
      if (found) return found;
    }
    return null;
  };
  const colour = findMatch(byId('trek-paths').paint['line-color']);
  assert.ok(colour, 'no match expression in the path colour');
  // ['match', input, k1, v1, …, fallback] — 3 + 2N, so odd. An even
  // length means the fallback is missing and the last pair is truncated.
  assert.equal(colour.length % 2, 1, 'a match with a fallback has an odd length');
  assert.equal(typeof colour[colour.length - 1], 'string', 'no fallback colour');
});

test('unknown surfaces are treated as unpaved, not as paved', () => {
  // Guessing "paved" for an unknown value is the dangerous direction: it
  // tells someone a muddy track is a road they can ride.
  const l = byId('trek-unpaved');
  const s = JSON.stringify(l.filter);
  assert.ok(
    s.includes('paved') || s.includes('asphalt') || s.includes('concrete'),
    'unpaved layer should be defined by excluding known-hard surfaces, so unknowns fall in',
  );
});

// --- Review Focus 4 ---------------------------------------------------

test('our layers are appended after the upstream ones', () => {
  // Appending rather than merging means an upstream bump cannot displace
  // our work: their layers change under us, ours stay on top.
  const style = styleFor({ maxzoom: 14, base: 'https://example.org/' });
  const ids = style.layers.map((l) => l.id);
  const firstOurs = ids.indexOf(layers[0].id);
  assert.ok(firstOurs > 0, 'trail layers are missing from the style');
  assert.equal(firstOurs + layers.length, ids.length, 'trail layers are not last');
});

test('the commonest trail kinds are coloured explicitly, not left to the fallback', () => {
  // kind_detail is the raw OSM `highway` value. `path` is what most
  // forest and hill trails are tagged, so omitting it sent nearly the
  // whole network to the fallback colour and the foot/bike distinction
  // the map exists for did not appear.
  const colour = JSON.stringify(byId('trek-paths').paint['line-color']);
  for (const kind of ['path', 'footway', 'cycleway', 'bridleway', 'track', 'steps', 'pedestrian']) {
    assert.ok(colour.includes(`"${kind}"`), `kind_detail "${kind}" is not coloured explicitly`);
  }
});

test('ridable paths are distinguishable from walking ones', () => {
  // `bicycle` is in the tiles precisely so a trekking map can say whether
  // a path may legally be ridden; styling that reads kind_detail alone
  // throws that away.
  const l = byId('trek-paths');
  assert.ok(JSON.stringify(l).includes('bicycle'), 'the paths layer ignores the bicycle attribute');
});

// --- the legend --------------------------------------------------------

import { legendEntries } from '../src/maps/style.js';

test('every legend colour is actually used by a trail layer', () => {
  // A hand-written legend goes stale the first time a colour changes and
  // then confidently mislabels the map. Both are built from the same
  // constants, and this is what holds them together.
  const drawn = JSON.stringify(layers);
  for (const entry of legendEntries()) {
    assert.ok(drawn.includes(entry.colour), `legend shows ${entry.colour} but nothing draws it`);
  }
});

test('every colour a trail layer draws is explained by the legend', () => {
  // The other direction: a colour on the map with no legend entry is a
  // line the reader cannot interpret.
  const explained = new Set(legendEntries().map((e) => e.colour));
  const used = new Set(JSON.stringify(layers).match(/#[0-9a-f]{6}/g) ?? []);
  const unexplained = [...used].filter((c) => !explained.has(c));
  assert.deepEqual(unexplained, [], `drawn but not in the legend: ${unexplained.join(', ')}`);
});

test('the legend says what the dashes mean', () => {
  // The dash carries surface and track quality, which is the whole point
  // of the pipeline; a colour-only legend omits the headline feature.
  const text = legendEntries().map((e) => e.label).join(' ').toLowerCase();
  assert.ok(text.includes('unpaved'), 'nothing explains the dashed lines');
  assert.ok(/rough|grade|quality/.test(text), 'nothing explains dash density');
});

test('each entry has a label and a colour', () => {
  for (const e of legendEntries()) {
    assert.equal(typeof e.label, 'string');
    assert.match(e.colour, /^#[0-9a-f]{6}$/);
    assert.ok(e.label.length > 0);
  }
});

// --- behaviour, not string matching ------------------------------------
//
// The tests above assert on JSON.stringify(...).includes(...). A review
// showed four map-breaking mutations that leave them all green: deleting
// the `!` so unpaved draws only hard surfaces, negating the bicycle case,
// pointing trek-paths at a kind that does not exist, and rewriting a
// filter into legacy form. These evaluate the real expressions instead.

import { createExpression, featureFilter } from '@maplibre/maplibre-gl-style-spec';

const feature = (properties) => ({ type: 2, properties, geometry: [], id: 1 });
const matches = (layer, props) =>
  featureFilter(layer.filter, `layers[${layer.id}].filter`).filter({ zoom: 14 }, feature(props));
const colourOf = (layer, props) => {
  const compiled = createExpression(
    layer.paint['line-color'],
    `layers[${layer.id}].paint.line-color`,
  );
  assert.equal(compiled.result, 'success', `line-color did not compile: ${compiled.value}`);
  return String(compiled.value.evaluate({ zoom: 14 }, feature(props)));
};

test('unpaved draws unknown surfaces and skips hard ones', () => {
  // Review focus 5. The single assertion that stood behind it could not
  // tell the filter from its own negation — "paved" is a substring of
  // "unpaved".
  const l = byId('trek-unpaved');
  for (const soft of ['ground', 'dirt', 'gravel', 'woodchips', 'grass_paver', 'asphalt;gravel']) {
    assert.equal(matches(l, { surface: soft }), true, `${soft} should be drawn as unpaved`);
  }
  for (const hard of ['asphalt', 'concrete', 'paving_stones', 'sett']) {
    assert.equal(matches(l, { surface: hard }), false, `${hard} should not be drawn as unpaved`);
  }
  assert.equal(matches(l, {}), false, 'a way with no surface tag is not "unpaved"');
});

test('trek-paths actually selects paths', () => {
  const l = byId('trek-paths');
  assert.equal(matches(l, { kind: 'path', kind_detail: 'path' }), true);
  assert.equal(matches(l, { kind: 'major_road' }), false);
});

test('a bike-permitted path is coloured as ridable, a plain one is not', () => {
  const l = byId('trek-paths');
  const ridable = colourOf(l, { kind: 'path', kind_detail: 'path', bicycle: 'designated' });
  const onFoot = colourOf(l, { kind: 'path', kind_detail: 'path' });
  assert.notEqual(ridable, onFoot, 'bicycle makes no difference to the colour');
  assert.equal(ridable, colourOf(l, { kind: 'path', kind_detail: 'cycleway' }),
    'a bike-permitted path should look like a cycleway');
});

test('each trail kind gets its own colour, including path', () => {
  // F9: `path` was given the same colour as the fallback, so the test
  // claiming it was "not left to the fallback" asserted nothing and the
  // legend promised a distinction the map did not make.
  const l = byId('trek-paths');
  const seen = new Map();
  for (const kind of ['path', 'footway', 'cycleway', 'bridleway', 'track', 'steps']) {
    seen.set(kind, colourOf(l, { kind: 'path', kind_detail: kind }));
  }
  assert.equal(new Set(seen.values()).size, seen.size,
    `two kinds share a colour: ${[...seen].map(([k, v]) => k + '=' + v).join(' ')}`);
  const unknown = colourOf(l, { kind: 'path', kind_detail: 'wibble' });
  assert.ok(unknown, 'an unknown kind must still get a colour');
  assert.notEqual(seen.get('path'), unknown, 'path is indistinguishable from the fallback');
});

test('every trail layer filter and paint expression compiles', () => {
  for (const l of layers) {
    assert.doesNotThrow(
      () => featureFilter(l.filter, `layers[${l.id}].filter`),
      `${l.id} filter is invalid`,
    );
    for (const [prop, value] of Object.entries(l.paint)) {
      // A literal dasharray like [6, 1] is data, not an expression.
      if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
      const compiled = createExpression(value, `layers[${l.id}].paint.${prop}`);
      assert.equal(compiled.result, 'success', `${l.id} ${prop} did not compile`);
    }
  }
});
