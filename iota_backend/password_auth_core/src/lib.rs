//! Core crypto for the password_auth abstract account: password -> ed25519
//! keypair derivation, digest signing, and MoveAuthenticator signature
//! assembly. Shared by the CLI and the browser WASM bindings so that every
//! client produces byte-identical results.

pub mod authenticator;
pub mod encryption;
pub mod kdf;

pub use ed25519_dalek::SigningKey;

use ed25519_dalek::Signer;

/// Sign a transaction digest with the derived key. Returns the 64-byte
/// ed25519 signature the on-chain authenticator verifies.
pub fn sign_digest(seed: &[u8; 32], digest: &[u8]) -> [u8; 64] {
    SigningKey::from_bytes(seed).sign(digest).to_bytes()
}

/// The ed25519 public key for a derived seed.
pub fn public_key(seed: &[u8; 32]) -> [u8; 32] {
    SigningKey::from_bytes(seed).verifying_key().to_bytes()
}
