// Parity of the WASM bindings against the Rust golden vectors
// (password_wallet_rs/tests/golden_vectors.rs). Uses the nodejs-target build
// of the same crate (pkg-node).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const wasm = require('password_auth_wasm_node');

const hex = (bytes) => Buffer.from(bytes).toString('hex');

test('KDF matches Rust golden vector', () => {
  const seed = wasm.derive_seed('correct horse battery staple', 'alice');
  assert.equal(hex(seed), 'c3c8e09b6b8299f89f7de3cfde1eeb090abc88c2ad5e56d796477b4595d58983');
  assert.equal(
    hex(wasm.public_key(seed)),
    '09142b51ed94ef5a8627bd2ae96de234c840f75fabde74076b08e78b5cd7012c',
  );
});

test('MoveAuthenticator signature matches Rust golden vector', () => {
  const signature = new Uint8Array(64).fill(0xab);
  const accountId = new Uint8Array(32).fill(0x01);
  const bytes = wasm.move_authenticator_signature(signature, accountId, 42n);
  assert.equal(
    hex(bytes),
    '070001004140' +
      'ab'.repeat(64) +
      '0001' +
      '01'.repeat(32) +
      '012a0000000000000000',
  );
});

test('signature over digest verifies structurally', () => {
  const seed = new Uint8Array(32).fill(7);
  const digest = new Uint8Array(32).fill(1);
  const sig = wasm.sign_digest(seed, digest);
  assert.equal(sig.length, 64);
  // Same seed/digest as the Move test vectors (password_account_tests.move).
  assert.equal(
    hex(sig),
    '013f9d903c1a0a90b0beea2534582e2bb694712503215236622851f5afd54ad5' +
      'f2a89983965e192edd928d484bdb1e1e521ba704fbe37968371a11597363fb0d',
  );
});
