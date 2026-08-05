// Thin wrapper over the password_auth_wasm bindings (the same Rust code the
// CLI uses, compiled to WASM — keys and signatures are byte-identical).
import init, {
  decrypt_data,
  derive_seed,
  encrypt_data,
  move_authenticator_signature,
  public_key,
  sign_digest,
} from 'password_auth_wasm';

let ready;

async function ensureInit() {
  ready ??= init();
  await ready;
}

/// Argon2id (512 MiB, ~1 s) password+username -> 32-byte ed25519 seed.
export async function deriveSeed(password, username) {
  await ensureInit();
  return derive_seed(password, username);
}

export async function publicKey(seed) {
  await ensureInit();
  return public_key(seed);
}

export async function signDigest(seed, digestBytes) {
  await ensureInit();
  return sign_digest(seed, digestBytes);
}

/// Full UserSignature::MoveAuthenticator wire bytes (base64 these for RPC).
export async function moveAuthenticatorSignature(signature, accountIdBytes, initialSharedVersion) {
  await ensureInit();
  return move_authenticator_signature(signature, accountIdBytes, BigInt(initialSharedVersion));
}

/// Encrypt with the password-derived encryption subkey; `nonce` = 24 fresh
/// random bytes. Returns `nonce || ciphertext+tag`.
export async function encryptData(seed, nonce, plaintext) {
  await ensureInit();
  return encrypt_data(seed, nonce, plaintext);
}

/// Decrypt a blob; throws on wrong password (AEAD tag mismatch).
export async function decryptData(seed, blob) {
  await ensureInit();
  return decrypt_data(seed, blob);
}
