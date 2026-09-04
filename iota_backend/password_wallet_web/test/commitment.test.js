// The word commitment — the one cryptographic interop surface in the design,
// so it is asserted against a literal that the Rust core and the Move tests
// also assert. Three implementations agreeing on a constant, not on each
// other.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { commitmentFor, newCommitment } from '../src/games/commitment.js';

const require = createRequire(import.meta.url);
const { blake2b256 } = require('password_auth_wasm_node');

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const NONCE = new Uint8Array(32).fill(7);

test('the shared vector: "harmonijka" with a nonce of 32 0x07 bytes', () => {
  assert.equal(
    hex(commitmentFor('harmonijka', NONCE, blake2b256)),
    '99a8e6a7153fb5f5e586ffad68b1c2883d9ee13c3e1276f9ddfc167f2492acec',
  );
});

test('the word is normalised before hashing', () => {
  // Otherwise a drawer committing "Harmonijka" would never match a guess of
  // "harmonijka", and the round would be unwinnable.
  assert.equal(
    hex(commitmentFor('  Harmonijka ', NONCE, blake2b256)),
    hex(commitmentFor('harmonijka', NONCE, blake2b256)),
  );
});

test('a Polish word commits under its normalised form', () => {
  assert.equal(
    hex(commitmentFor('Żółw', NONCE, blake2b256)),
    hex(commitmentFor('zolw', NONCE, blake2b256)),
  );
});

test('a fresh commitment carries a 32-byte nonce and digest', () => {
  const fresh = newCommitment('Żółw', blake2b256);
  assert.equal(fresh.nonce.length, 32);
  assert.equal(fresh.commitment.length, 32);
  assert.equal(fresh.word, 'zolw', 'the normalised form is what gets revealed');
});

test('the digest of a fresh commitment matches recomputing it', () => {
  const fresh = newCommitment('kot', blake2b256);
  assert.equal(
    hex(fresh.commitment),
    hex(commitmentFor(fresh.word, fresh.nonce, blake2b256)),
    'reveal recomputes exactly this, so it must agree',
  );
});

test('two commitments to the same word differ', () => {
  // A reused nonce would let anyone who saw an earlier round recognise the
  // word from its digest alone.
  assert.notEqual(
    hex(newCommitment('kot', blake2b256).commitment),
    hex(newCommitment('kot', blake2b256).commitment),
  );
});
