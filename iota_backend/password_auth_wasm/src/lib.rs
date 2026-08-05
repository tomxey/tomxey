//! WASM bindings over `password_auth_core` for the browser client.
//!
//! Exposing the same Rust code the CLI uses guarantees the browser derives
//! byte-identical keys and signatures — no hand-ported JS crypto to drift.

use wasm_bindgen::prelude::*;

/// Argon2id(password, username-salt) -> 32-byte ed25519 seed.
/// Runs the production-cost derivation (~1s, 512 MiB) — call from a worker or
/// behind a spinner.
#[wasm_bindgen]
pub fn derive_seed(password: &str, username: &str) -> Result<Vec<u8>, JsError> {
    password_auth_core::kdf::derive_seed(password, username)
        .map(|seed| seed.to_vec())
        .map_err(|e| JsError::new(&e))
}

/// The ed25519 public key for a derived seed (what the on-chain account stores).
#[wasm_bindgen]
pub fn public_key(seed: &[u8]) -> Result<Vec<u8>, JsError> {
    Ok(password_auth_core::public_key(&seed_array(seed)?).to_vec())
}

/// Sign a 32-byte transaction digest; returns the 64-byte ed25519 signature.
#[wasm_bindgen]
pub fn sign_digest(seed: &[u8], digest: &[u8]) -> Result<Vec<u8>, JsError> {
    Ok(password_auth_core::sign_digest(&seed_array(seed)?, digest).to_vec())
}

/// Assemble the full `UserSignature::MoveAuthenticator` wire bytes
/// (base64-encode the result for JSON-RPC submission).
#[wasm_bindgen]
pub fn move_authenticator_signature(
    signature: &[u8],
    account_id: &[u8],
    initial_shared_version: u64,
) -> Result<Vec<u8>, JsError> {
    let account_id: [u8; 32] = account_id
        .try_into()
        .map_err(|_| JsError::new("account id must be exactly 32 bytes"))?;
    Ok(password_auth_core::authenticator::move_authenticator_signature(
        signature,
        &account_id,
        initial_shared_version,
    ))
}

/// Encrypt data with the password-derived encryption subkey (domain-separated
/// from the signing key). `nonce` must be 24 fresh random bytes
/// (`crypto.getRandomValues`); the result is `nonce || ciphertext+tag`.
#[wasm_bindgen]
pub fn encrypt_data(seed: &[u8], nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, JsError> {
    let nonce: [u8; 24] = nonce
        .try_into()
        .map_err(|_| JsError::new("nonce must be exactly 24 bytes"))?;
    password_auth_core::encryption::encrypt(&seed_array(seed)?, &nonce, plaintext)
        .map_err(|e| JsError::new(&e))
}

/// Decrypt a `nonce || ciphertext+tag` blob. Fails cleanly on a wrong
/// password (AEAD tag mismatch).
#[wasm_bindgen]
pub fn decrypt_data(seed: &[u8], blob: &[u8]) -> Result<Vec<u8>, JsError> {
    password_auth_core::encryption::decrypt(&seed_array(seed)?, blob).map_err(|e| JsError::new(&e))
}

fn seed_array(seed: &[u8]) -> Result<[u8; 32], JsError> {
    seed.try_into()
        .map_err(|_| JsError::new("seed must be exactly 32 bytes"))
}
