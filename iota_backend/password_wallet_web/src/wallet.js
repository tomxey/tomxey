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
/// Runs in a Web Worker so the UI stays responsive; falls back to the main
/// thread if workers are unavailable.
export async function deriveSeed(password, username) {
  try {
    return await deriveSeedInWorker(password, username);
  } catch (error) {
    console.warn('KDF worker failed, deriving on main thread', error);
    await ensureInit();
    return derive_seed(password, username);
  }
}

function deriveSeedInWorker(password, username) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./kdf-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(new Uint8Array(event.data.seed));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message ?? 'worker error'));
    };
    worker.postMessage({ password, username });
  });
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
