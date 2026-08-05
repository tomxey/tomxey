//! Authenticated encryption for off-chain-private, on-chain-stored data.
//!
//! The encryption key is derived from the same Argon2 seed as the signing key
//! but with domain separation, so the two keys are independent while the user
//! still only needs one password. XChaCha20-Poly1305 with a caller-provided
//! random 24-byte nonce (callers use the platform CSPRNG); the nonce is
//! prepended to the ciphertext. The AEAD tag doubles as wrong-password
//! detection.

use blake2::{digest::consts::U32, Blake2b, Digest};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};

/// Domain-separation tag for the encryption subkey. Versioned: changing it
/// makes existing blobs undecryptable.
const ENC_KEY_CONTEXT: &[u8] = b"iota-password-auth-enc-v1";

pub const NONCE_LENGTH: usize = 24;

/// Encrypt `plaintext`; returns `nonce || ciphertext+tag`.
pub fn encrypt(
    seed: &[u8; 32],
    nonce: &[u8; NONCE_LENGTH],
    plaintext: &[u8],
) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new((&encryption_key(seed)).into());
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(nonce), plaintext)
        .map_err(|e| format!("encryption failed: {e}"))?;

    let mut blob = Vec::with_capacity(NONCE_LENGTH + ciphertext.len());
    blob.extend_from_slice(nonce);
    blob.extend_from_slice(&ciphertext);
    Ok(blob)
}

/// Decrypt a `nonce || ciphertext+tag` blob.
pub fn decrypt(seed: &[u8; 32], blob: &[u8]) -> Result<Vec<u8>, String> {
    if blob.len() < NONCE_LENGTH {
        return Err("encrypted blob too short".to_string());
    }
    let (nonce, ciphertext) = blob.split_at(NONCE_LENGTH);
    let cipher = XChaCha20Poly1305::new((&encryption_key(seed)).into());
    cipher
        .decrypt(XNonce::from_slice(nonce), ciphertext)
        .map_err(|_| "decryption failed — wrong password or corrupted data".to_string())
}

/// Encryption subkey = Blake2b-256(context-tag || signing seed).
fn encryption_key(seed: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Blake2b::<U32>::new();
    hasher.update(ENC_KEY_CONTEXT);
    hasher.update(seed);
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEED: [u8; 32] = [7u8; 32];
    const NONCE: [u8; NONCE_LENGTH] = [9u8; NONCE_LENGTH];

    #[test]
    fn roundtrip() {
        let blob = encrypt(&SEED, &NONCE, b"buy milk").unwrap();
        assert_eq!(decrypt(&SEED, &blob).unwrap(), b"buy milk");
    }

    #[test]
    fn wrong_seed_fails() {
        let blob = encrypt(&SEED, &NONCE, b"buy milk").unwrap();
        assert!(decrypt(&[8u8; 32], &blob).is_err());
    }

    #[test]
    fn tampered_blob_fails() {
        let mut blob = encrypt(&SEED, &NONCE, b"buy milk").unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0x01;
        assert!(decrypt(&SEED, &blob).is_err());
    }

    #[test]
    fn key_differs_from_seed() {
        // Domain separation: the encryption key must not equal the signing seed.
        assert_ne!(encryption_key(&SEED), SEED);
    }

    /// Golden vector pinning the derivation + cipher across implementations.
    #[test]
    fn golden_vector() {
        let blob = encrypt(&SEED, &NONCE, b"golden").unwrap();
        assert_eq!(
            blob.iter().map(|b| format!("{b:02x}")).collect::<String>(),
            "090909090909090909090909090909090909090909090909\
             94fa7f9a552015385ae1f93588736e690669fe634cc3"
                .replace(char::is_whitespace, "")
        );
    }
}
