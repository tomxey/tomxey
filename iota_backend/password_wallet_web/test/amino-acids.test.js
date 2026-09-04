// Amino acid scoring against the FAO/WHO/UNU reference pattern. Pure.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REFERENCE_PATTERN, scoreAminoAcids } from '../src/nutrition/aminoAcids.js';

/// mg of each amino acid that exactly meets the pattern for `protein` grams.
const exactlyMeeting = (protein) =>
  Object.fromEntries(Object.entries(REFERENCE_PATTERN).map(([aa, mgPerG]) => [aa, mgPerG * protein]));

test('the reference pattern covers the nine indispensable amino acids', () => {
  assert.deepEqual(Object.keys(REFERENCE_PATTERN).sort(), [
    'his',
    'ile',
    'leu',
    'lys',
    'phe_tyr',
    'sulfur',
    'thr',
    'trp',
    'val',
  ]);
});

test('protein that exactly meets the pattern scores 1', () => {
  const result = scoreAminoAcids(exactlyMeeting(10), 10);
  assert.equal(result.score, 1);
  for (const ratio of Object.values(result.ratios)) assert.equal(ratio, 1);
});

test('the score is the lowest amino acid, which is the limiting one', () => {
  const aa = exactlyMeeting(10);
  aa.lys *= 0.6;
  aa.thr *= 0.8;

  const result = scoreAminoAcids(aa, 10);
  assert.equal(result.limiting, 'lys');
  assert.ok(Math.abs(result.score - 0.6) < 1e-9);
  assert.ok(Math.abs(result.ratios.thr - 0.8) < 1e-9);
});

test('a surplus amino acid is reported above 1 rather than clipped', () => {
  // Seeing that tryptophan is at 180% is useful; clipping hides it.
  const aa = exactlyMeeting(10);
  aa.trp *= 1.8;
  assert.ok(Math.abs(scoreAminoAcids(aa, 10).ratios.trp - 1.8) < 1e-9);
});

test('ratios are per gram of protein, not per dish', () => {
  // Twice the food is not better protein: doubling both leaves the score put.
  const single = scoreAminoAcids(exactlyMeeting(10), 10);
  const double = scoreAminoAcids(exactlyMeeting(20), 20);
  assert.deepEqual(single.ratios, double.ratios);
});

test('methionine and cystine are scored together as the sulfur pair', () => {
  const aa = exactlyMeeting(10);
  const half = aa.sulfur / 2;
  const result = scoreAminoAcids({ ...aa, sulfur: half }, 10);
  assert.ok(Math.abs(result.ratios.sulfur - 0.5) < 1e-9);
});

test('no protein yields no score rather than a division by zero', () => {
  const result = scoreAminoAcids({}, 0);
  assert.equal(result.score, null);
  assert.equal(result.limiting, null);
});

test('a missing amino acid counts as absent, not as unknown', () => {
  // A food table entry lacking a value must not silently score as complete.
  const aa = exactlyMeeting(10);
  delete aa.lys;
  const result = scoreAminoAcids(aa, 10);
  assert.equal(result.ratios.lys, 0);
  assert.equal(result.limiting, 'lys');
  assert.equal(result.score, 0);
});
