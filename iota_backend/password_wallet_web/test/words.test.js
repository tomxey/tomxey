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

// --- diminutives ---------------------------------------------------------------

/// Pairs where a word looks like the diminutive of another but is a different
/// object, so both are worth drawing. Everything not listed here is treated as
/// the same thing twice: "papuga" and "papużka" are one bird, and a drawer who
/// gets the second has nothing extra to draw.
const DIFFERENT_THINGS = new Set([
  'słoik',      // a jar, not a small elephant
  'myszka',     // the computer kind
  'gumka',      // an eraser, not small chewing gum
  'żołądek',    // a stomach, not a small acorn
  'cukierek',   // a sweet, not a grain of sugar
  'oliwka',     // the fruit; "oliwa" is the oil
  'kanapka',    // a sandwich, not a small sofa
  'piłka',      // a ball; "piła" is a saw
  'tabletka',   // a pill, not a small tablet computer
  'bramka',     // a goal, not a small gate
  'kominek',    // a fireplace, not a small chimney
  'koszulka',   // a t-shirt; "koszula" is a buttoned shirt
  'książka',    // a book, nothing to do with a prince
  'marynarka',  // a jacket, not a small sailor
  'zegarek',    // a wristwatch; "zegar" is a clock on the wall
]);

test('no word is just a smaller version of another', () => {
  // Found by hand three times — "papużka" beside "papuga", "parasolka" beside
  // "parasol" — so it is a test now. A diminutive adds a word to the list and
  // nothing to the game.
  const suffixes = ['ka', 'ek', 'ik', 'yk', 'ko', 'czek', 'eczka', 'uszka', 'czka'];
  const present = new Set(WORDS);
  const pairs = [];

  for (const word of WORDS) {
    for (const stem of [word, word.slice(0, -1)]) {
      if (stem.length < 3) continue;
      for (const suffix of suffixes) {
        const smaller = stem + suffix;
        if (smaller !== word && present.has(smaller) && !DIFFERENT_THINGS.has(smaller)) {
          pairs.push(`${word} / ${smaller}`);
        }
      }
    }
  }
  assert.deepEqual(pairs, [], `same thing twice: ${pairs.join(', ')}`);
});

test('the allowlist has no entries the list has dropped', () => {
  // Otherwise it accumulates permissions for words nobody plays with.
  const stale = [...DIFFERENT_THINGS].filter((word) => !WORDS.includes(word));
  assert.deepEqual(stale, [], `allowed but absent: ${stale}`);
});
