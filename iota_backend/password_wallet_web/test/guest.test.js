// Guest identities. A guest is a plain keypair the host funds — no password
// account, no username, no Argon2, no faucet.
//
// The keys are *derived*, not random, so a host who reloads the page can
// re-show any guest's QR and can sweep the leftover gas afterwards. Nothing
// secret is stored anywhere: the derivation needs the host's password seed,
// which only they can reproduce.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { deriveSlots, keypairFromSecret, parseSlotUrl, slotUrl } from '../src/games/guest.js';

const require = createRequire(import.meta.url);
const { blake2b256 } = require('password_auth_wasm_node');

const SEED = new Uint8Array(32).fill(3);
const OTHER_SEED = new Uint8Array(32).fill(4);

test('derives the requested number of distinct slots', () => {
  const slots = deriveSlots(SEED, 0, 5, blake2b256);
  assert.equal(slots.length, 5);
  assert.equal(new Set(slots.map((s) => s.address)).size, 5);
});

test('the same host, room and index always give the same address', () => {
  // This is the point: a host who reloads re-derives identical slots and can
  // re-show a guest's QR so they can rejoin.
  const first = deriveSlots(SEED, 4, 3, blake2b256);
  const again = deriveSlots(SEED, 4, 3, blake2b256);
  assert.deepEqual(
    first.map((s) => s.address),
    again.map((s) => s.address),
  );
});

test('a different room index gives different slots', () => {
  // Otherwise a previous game's guest could join the next room with the key
  // they already hold.
  const room4 = deriveSlots(SEED, 4, 3, blake2b256).map((s) => s.address);
  const room5 = deriveSlots(SEED, 5, 3, blake2b256).map((s) => s.address);
  assert.equal(room4.some((a) => room5.includes(a)), false);
});

test('a different host seed gives different slots', () => {
  // A guest cannot derive another guest's key, because they do not have the
  // host's seed.
  const mine = deriveSlots(SEED, 0, 3, blake2b256).map((s) => s.address);
  const theirs = deriveSlots(OTHER_SEED, 0, 3, blake2b256).map((s) => s.address);
  assert.equal(mine.some((a) => theirs.includes(a)), false);
});

test('a slot secret reconstructs its own address', () => {
  const [slot] = deriveSlots(SEED, 0, 1, blake2b256);
  assert.equal(keypairFromSecret(slot.secretKey).getPublicKey().toIotaAddress(), slot.address);
});

test('deriving zero slots is allowed', () => {
  assert.deepEqual(deriveSlots(SEED, 0, 0, blake2b256), []);
});

test('the slot URL round-trips the game and the secret', () => {
  const [slot] = deriveSlots(SEED, 0, 1, blake2b256);
  const url = slotUrl('https://tomxey.pl/games.html', '0xabc', slot.secretKey);
  const parsed = parseSlotUrl(new URL(url).search);
  assert.equal(parsed.gameId, '0xabc');
  assert.equal(parsed.secretKey, slot.secretKey);
});

test('a URL missing either parameter parses as null', () => {
  assert.equal(parseSlotUrl('?game=0xabc'), null);
  assert.equal(parseSlotUrl('?k=abc'), null);
  assert.equal(parseSlotUrl(''), null);
});
