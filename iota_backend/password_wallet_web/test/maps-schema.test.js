// test/maps-schema.test.js
// The style must only reference fields the tiles actually carry.
//
// This test exists because its absence cost a whole project: the style was
// written against a schema with no `surface` field, nothing said so, and it
// surfaced weeks later as a map that would not show what it was asked to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { SOURCE_NAME, styleFor } from '../src/maps/style.js';

const schema = JSON.parse(readFileSync(new URL('../src/maps/schema.json', import.meta.url), 'utf8'));
const style = styleFor({ maxzoom: 14, base: 'https://example.org/' });

/// Every ["get", "<field>"] reference in a layer's filter, paint or
/// layout. Deliberately does NOT try to parse the legacy filter form
/// ["==", "field", value]: telling a field name from a value string there
/// needs guesswork, and a cross-check that guesses produces false alarms
/// nobody trusts. The test below asserts the style really does use `get`,
/// so if upstream ever reverts to legacy syntax we find out rather than
/// silently checking nothing.
function fieldsUsed(layer) {
  const used = new Set();
  const walk = (node) => {
    if (!Array.isArray(node)) {
      if (node && typeof node === 'object') Object.values(node).forEach(walk);
      return;
    }
    if (node[0] === 'get' && typeof node[1] === 'string') used.add(node[1]);
    node.forEach(walk);
  };
  walk(layer.filter);
  walk(layer.paint);
  walk(layer.layout);
  return used;
}

test('the schema snapshot matches the pinned region', async () => {
  // A stale schema.json would make this whole file check the wrong tiles.
  const { REGIONS } = await import('../src/maps/regions.js');
  assert.equal(schema.cid, REGIONS.krakow.cid, 'schema.json is for a different archive');
});

test('the roads layer carries surface and track quality', () => {
  for (const field of ['surface', 'tracktype', 'sac_scale', 'bicycle']) {
    assert.ok(schema.layers.roads.includes(field), `roads has no ${field}`);
  }
});

/// Fields whose absence from a REGIONAL extract means nothing is wrong.
///
/// `vector_layers` declares what actually occurs in these tiles, not what
/// the schema could hold, so anything data-dependent is legitimately
/// missing from a one-region archive:
///
///   name2/name3/script*/pgf:*  multi-script name machinery, emitted only
///                              where a feature carries names in several
///                              scripts. Poland is Latin-only.
///   name:<lang> / ref:<lang>   per-language names, present only for the
///                              languages that occur in the region.
///   addr_housenumber           emitted above our maxzoom of 14.
///   places.ref                 a region abbreviation (US state codes and
///                              the like); Polish voivodeships carry none.
///                              Scoped to `places` on purpose — roads.ref
///                              IS present, and must stay checked.
///
/// Everything else staying strict is what gives this test its teeth: a
/// field the style reads that the tiles could never carry — `surface`
/// before this project — is still a failure.
const dataDependent = (source, field) =>
  /^pgf:/.test(field) ||
  /^(name|ref):/.test(field) ||
  ['name2', 'name3', 'script', 'script2', 'script3', 'addr_housenumber'].includes(field) ||
  (source === 'places' && field === 'ref');

// --- Review Focus 3 ---------------------------------------------------

test('the fields this app depends on are carried by the tiles', () => {
  // The strong half: these are ours, we style on them, and their absence
  // is exactly the bug that made this pipeline necessary.
  for (const field of ['surface', 'tracktype', 'sac_scale', 'bicycle', 'kind', 'kind_detail']) {
    assert.ok(schema.layers.roads.includes(field), `roads has no ${field}`);
  }
});

test('every non-data-dependent field the style reads exists in the tiles', () => {
  const missing = [];
  for (const layer of style.layers) {
    const source = layer['source-layer'];
    if (!source || !schema.layers[source]) continue;
    for (const field of fieldsUsed(layer)) {
      if (dataDependent(source, field)) continue;
      if (!schema.layers[source].includes(field)) missing.push(`${layer.id}: ${source}.${field}`);
    }
  }
  assert.deepEqual(missing, [], `style reads fields the tiles do not carry:\n  ${missing.join('\n  ')}`);
});

test('the style uses get expressions, so the cross-check actually sees fields', () => {
  // If upstream switched to legacy ["==", "kind", …] filters, fieldsUsed
  // would return nothing and the check above would pass vacuously —
  // the worst kind of green.
  const total = style.layers.reduce((n, l) => n + fieldsUsed(l).size, 0);
  assert.ok(total > 50, `only ${total} field references found; is the style using legacy filters?`);
});

test('the style only reads source-layers the archive declares', () => {
  const declared = new Set(Object.keys(schema.layers));
  for (const layer of style.layers) {
    const source = layer['source-layer'];
    if (layer.source === SOURCE_NAME && source) {
      assert.ok(declared.has(source), `${layer.id} reads undeclared layer ${source}`);
    }
  }
});
