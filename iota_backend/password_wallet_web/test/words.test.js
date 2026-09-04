// The bundled word list and picking from it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WORDS, pickWord } from '../src/games/words.js';

test('every word is distinct', () => {
  assert.equal(new Set(WORDS).size, WORDS.length);
});

test('every word is lower case and free of surrounding space', () => {
  // The drawer commits the normalised form, so a stray capital or space in the
  // list would only ever confuse the person reading their own screen.
  for (const word of WORDS) {
    assert.equal(word, word.trim().toLowerCase(), word);
  }
});

test('picks a word from the list', () => {
  assert.ok(WORDS.includes(pickWord()));
});

test('avoids words already used this game', () => {
  const used = WORDS.slice(0, WORDS.length - 1);
  assert.equal(pickWord(used), WORDS[WORDS.length - 1]);
});

test('falls back to the full list once everything is used', () => {
  // Better a repeat than an exception at the end of a long game.
  assert.ok(WORDS.includes(pickWord([...WORDS])));
});

test('uses the injected randomness', () => {
  assert.equal(pickWord([], () => 0), WORDS[0]);
});
