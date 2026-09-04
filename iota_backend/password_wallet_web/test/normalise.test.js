// Word normalisation. The drawer's commitment and every guess pass through
// this, and Move compares the resulting bytes exactly — so a disagreement
// between two clients rejects a correct guess with no visible error.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normaliseWord } from '../src/games/normalise.js';

test('lowercases', () => {
  assert.equal(normaliseWord('Harmonijka'), 'harmonijka');
});

test('trims and collapses whitespace', () => {
  assert.equal(normaliseWord('  wieża   Eiffla '), 'wieza eiffla');
});

test('strips the decomposable Polish diacritics', () => {
  assert.equal(normaliseWord('ĄĆĘŃÓŚŹŻ'), 'acenoszz');
  assert.equal(normaliseWord('gęś'), 'ges');
});

test('strips ł, which NFD does not decompose', () => {
  // U+0142 is a single indivisible codepoint, so a generic strip-the-marks
  // implementation leaves it untouched and silently fails on one of the most
  // common Polish letters. This is the trap this function exists for.
  assert.equal(normaliseWord('łódź'), 'lodz');
  assert.equal(normaliseWord('Łódź'), 'lodz');
  assert.equal(normaliseWord('żółw'), 'zolw');
});

test('a guess typed without diacritics matches the word with them', () => {
  assert.equal(normaliseWord('zolw'), normaliseWord('żółw'));
  assert.equal(normaliseWord('LODZ'), normaliseWord('Łódź'));
});

test('leaves inner punctuation and digits alone', () => {
  assert.equal(normaliseWord('C-3PO'), 'c-3po');
});

test('handles empty and whitespace-only input', () => {
  assert.equal(normaliseWord(''), '');
  assert.equal(normaliseWord('   '), '');
  assert.equal(normaliseWord(undefined), '');
});

test('is idempotent', () => {
  const once = normaliseWord('Żółty Łosoś');
  assert.equal(normaliseWord(once), once);
});
