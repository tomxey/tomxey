// Word commitment for a kalambury round.
//
// The drawer commits blake2b256(normalised_word || nonce) before anyone
// guesses, and reveals the pair afterwards. The contract re-hashes and
// compares, so nobody can read the word off the chain and the drawer cannot
// change it once guessing has started.
//
// The hash is passed in rather than imported. The browser has the web WASM
// build and node has the nodejs one, and the web build cannot load in node —
// so importing it directly here would make this module untestable. It is also
// honest: the only dependency is stated in the signature.
import { normaliseWord } from './normalise.js';

const NONCE_BYTES = 32;

/// Digest for a known word and nonce. The word is normalised first, because
/// that is the form the contract compares a guess against.
export function commitmentFor(word, nonce, blake2b256) {
  const normalised = new TextEncoder().encode(normaliseWord(word));
  const preimage = new Uint8Array(normalised.length + nonce.length);
  preimage.set(normalised, 0);
  preimage.set(nonce, normalised.length);
  return new Uint8Array(blake2b256(preimage));
}

/// A fresh commitment: `{word, nonce, commitment}`. `word` is the normalised
/// form, which is what `reveal` must send.
///
/// The nonce is random per round. Reusing one would let anyone who saw a
/// previous round recognise the word from its digest, since the word list is
/// public and small enough to enumerate.
export function newCommitment(word, blake2b256) {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const normalised = normaliseWord(word);
  return { word: normalised, nonce, commitment: commitmentFor(normalised, nonce, blake2b256) };
}
