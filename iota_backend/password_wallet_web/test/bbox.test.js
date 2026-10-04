// test/bbox.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contains, envelopeOfPoly, parseBbox } from '../tools/bbox.mjs';

const KRAKOW = [19.6567, 49.8817, 20.2165, 50.2411];

/// A .poly file: name, ring name, then "lon lat" pairs, END, END.
const POLY = `malopolskie
1
   1.932556E+01   4.951537E+01
   2.143330E+01   4.916490E+01
   2.100000E+01   5.053220E+01
   1.907490E+01   5.000000E+01
END
END
`;

test('parseBbox reads a comma-separated bbox', () => {
  assert.deepEqual(parseBbox('19.6567,49.8817,20.2165,50.2411'), KRAKOW);
});

test('parseBbox rejects anything that is not four numbers', () => {
  // A malformed bbox silently becoming NaN would make `contains` return
  // false forever, or worse, true.
  for (const bad of ['1,2,3', '1,2,3,4,5', 'a,b,c,d', '']) {
    assert.throws(() => parseBbox(bad), /bbox/i, `accepted ${JSON.stringify(bad)}`);
  }
});

test('envelopeOfPoly returns the bounding box of the ring', () => {
  const [w, s, e, n] = envelopeOfPoly(POLY);
  assert.ok(Math.abs(w - 19.0749) < 0.001, `w=${w}`);
  assert.ok(Math.abs(s - 49.1649) < 0.001, `s=${s}`);
  assert.ok(Math.abs(e - 21.4333) < 0.001, `e=${e}`);
  assert.ok(Math.abs(n - 50.5322) < 0.001, `n=${n}`);
});

test('envelopeOfPoly ignores the header and END markers', () => {
  // Treating "1" or "END" as coordinates would drag the envelope to 0,0
  // and make every containment check pass.
  const [w, s] = envelopeOfPoly(POLY);
  assert.ok(w > 19, `header leaked into the envelope: w=${w}`);
  assert.ok(s > 49, `header leaked into the envelope: s=${s}`);
});

test('envelopeOfPoly refuses a file with no coordinates', () => {
  assert.throws(() => envelopeOfPoly('name\n1\nEND\nEND\n'), /no coordinates/i);
});

// --- Review Focus 1 ---------------------------------------------------

test('a region inside the extract is contained', () => {
  assert.equal(contains(envelopeOfPoly(POLY), KRAKOW), true);
});

test('a region poking out of any single edge is not contained', () => {
  // Each edge separately: an off-by-one that only checked three would
  // pass a region hanging off the fourth, and the map would be blank
  // along exactly that edge.
  const outer = [19, 49, 21, 50.5];
  assert.equal(contains(outer, [18.9, 49.5, 20, 50]), false, 'west');
  assert.equal(contains(outer, [19.5, 48.9, 20, 50]), false, 'south');
  assert.equal(contains(outer, [19.5, 49.5, 21.1, 50]), false, 'east');
  assert.equal(contains(outer, [19.5, 49.5, 20, 50.6]), false, 'north');
});

test('a region exactly on the boundary counts as contained', () => {
  assert.equal(contains([19, 49, 21, 50.5], [19, 49, 21, 50.5]), true);
});

// --- F1: an envelope is not a polygon ---------------------------------

import { coversBbox, parsePolyRings } from '../tools/bbox.mjs';

/// Two rings far apart — a mainland and an offshore group, the shape of
/// Portugal+Azores or Norway+Svalbard.
const TWO_RING = `country
1
   -9.5 37.0
   -6.2 37.0
   -6.2 42.2
   -9.5 42.2
END
2
   -31.3 36.9
   -25.0 36.9
   -25.0 39.7
   -31.3 39.7
END
END
`;

/// An L — concave, like most voivodeships.
const CONCAVE = `region
1
   19.0 49.0
   21.0 49.0
   21.0 50.0
   20.0 50.0
   20.0 51.0
   19.0 51.0
END
END
`;

test('parsePolyRings reads every ring, not just the first', () => {
  assert.equal(parsePolyRings(TWO_RING).length, 2);
});

test('a bbox in the gap between two rings is NOT covered', () => {
  // The envelope spans both, so an envelope check says yes and there is
  // no data within 400 km.
  assert.equal(coversBbox(parsePolyRings(TWO_RING), [-20, 37, -19, 38]), false);
});

test('a bbox inside one ring of a multi-ring extract is covered', () => {
  assert.equal(coversBbox(parsePolyRings(TWO_RING), [-9, 38, -7, 41]), true);
});

test('a bbox in the notch of a concave extract is NOT covered', () => {
  // Inside the envelope, outside the polygon — the boundary-adjacent case
  // the spec warns about and the envelope check waved through.
  assert.equal(coversBbox(parsePolyRings(CONCAVE), [20.2, 50.2, 20.8, 50.8]), false);
});

test('a bbox well inside a concave extract is covered', () => {
  assert.equal(coversBbox(parsePolyRings(CONCAVE), [19.2, 49.2, 19.8, 49.8]), true);
});

test('a bbox straddling the concave boundary is NOT covered', () => {
  assert.equal(coversBbox(parsePolyRings(CONCAVE), [19.5, 49.5, 20.5, 50.5]), false);
});

// --- F2: a stray numeric pair must not widen the world ----------------

test('coordinates outside the earth are rejected, not absorbed', () => {
  // One line reading "-180 -90" and another "180 90" made the envelope
  // the whole planet, after which everything was "covered".
  assert.throws(() => parsePolyRings('x\n1\n  -500 -500\n  200 200\nEND\nEND\n'), /range|coordinate/i);
});

test('a ring with too few points is rejected', () => {
  assert.throws(() => parsePolyRings('x\n1\n  19 49\n  20 50\nEND\nEND\n'), /ring|points/i);
});
