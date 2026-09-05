// The bundled word list and picking from it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normaliseWord } from '../src/games/normalise.js';
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

// --- the expanded list ---------------------------------------------------------

test('no two words normalise to the same guess', () => {
  // The contract compares normalised bytes, so "łoś" and "los" would be the
  // same guess: a guesser typing it could not be told which was meant, and one
  // of the two could never be won.
  const byNormal = new Map();
  const collisions = [];
  for (const word of WORDS) {
    const key = normaliseWord(word);
    if (byNormal.has(key)) collisions.push(`${byNormal.get(key)} / ${word} -> ${key}`);
    byNormal.set(key, word);
  }
  assert.deepEqual(collisions, [], `collide once normalised: ${collisions}`);
});

test('every word survives normalising', () => {
  for (const word of WORDS) {
    const normalised = normaliseWord(word);
    assert.ok(normalised.length > 0, `${word} normalises to nothing`);
    assert.equal(normalised, normaliseWord(normalised), `${word} is not stable`);
    assert.match(normalised, /^[a-z]+$/, `${word} -> ${normalised} is not plain letters`);
  }
});

test('every word fits the contract limit', () => {
  // MAX_GUESS_BYTES is 64, and a guess has to be able to equal the word.
  for (const word of WORDS) {
    assert.ok(new TextEncoder().encode(word).length <= 64, `${word} is too long`);
  }
});

test('the list is big enough for an evening', () => {
  // Eight players taking several turns each should not exhaust it, since
  // pickWord starts repeating once it does. The floor is deliberately well
  // below the actual count: chasing a round number is what put a horse
  // blanket and a made-up word in here, so this guards against the list
  // wasting away, not against it being smaller than some target.
  assert.ok(WORDS.length >= 1000, `only ${WORDS.length} words`);
});
