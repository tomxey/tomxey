//! Password -> ed25519 seed derivation.
//!
//! The password is stretched with Argon2id (memory-hard, GPU-hostile) into a
//! 32-byte ed25519 seed. The salt is derived from a domain-separation tag and
//! a user-chosen username, so the same password+username always re-derives the
//! same keypair — nothing needs to be backed up except the password itself.

use argon2::{Algorithm, Argon2, Params, Version};
use blake2::{digest::consts::U32, Blake2b, Digest};
use ed25519_dalek::SigningKey;

/// Domain-separation tag mixed into the salt. Changing it invalidates every
/// derived key, so it is versioned.
const KDF_CONTEXT: &[u8] = b"iota-password-auth-v1";

/// Argon2id memory cost: 512 MiB (in KiB). ~1s and 512 MB per guess.
const ARGON2_MEMORY_KIB: u32 = 512 * 1024;
/// Argon2id iteration count.
const ARGON2_ITERATIONS: u32 = 3;
/// Argon2id lane count.
const ARGON2_PARALLELISM: u32 = 1;

/// Derive the 32-byte ed25519 seed from a password and username at the
/// production Argon2id cost.
pub fn derive_seed(password: &str, username: &str) -> Result<[u8; 32], String> {
    derive_seed_with_params(
        password,
        username,
        ARGON2_MEMORY_KIB,
        ARGON2_ITERATIONS,
        ARGON2_PARALLELISM,
    )
}

/// Derive the ed25519 signing key from a password and username at the
/// production Argon2id cost.
pub fn derive_signing_key(password: &str, username: &str) -> Result<SigningKey, String> {
    Ok(SigningKey::from_bytes(&derive_seed(password, username)?))
}

pub fn derive_seed_with_params(
    password: &str,
    username: &str,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<[u8; 32], String> {
    let salt = salt_for_username(username);
    let params = Params::new(memory_kib, iterations, parallelism, Some(32))
        .map_err(|e| format!("invalid Argon2 params: {e}"))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut seed = [0u8; 32];
    argon
        .hash_password_into(password.as_bytes(), &salt, &mut seed)
        .map_err(|e| format!("Argon2 derivation failed: {e}"))?;

    Ok(seed)
}

/// Salt = Blake2b-256(context-tag || username). The salt cannot be the account
/// address because the public key must exist before the account does.
fn salt_for_username(username: &str) -> [u8; 32] {
    let mut hasher = Blake2b::<U32>::new();
    hasher.update(KDF_CONTEXT);
    hasher.update(username.as_bytes());
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Cheap params so the deterministic tests run in milliseconds.
    const TEST_MEM_KIB: u32 = 64;
    const TEST_ITERS: u32 = 1;

    #[test]
    fn derivation_is_deterministic() {
        let a = derive_seed_with_params("hunter2", "alice", TEST_MEM_KIB, TEST_ITERS, 1).unwrap();
        let b = derive_seed_with_params("hunter2", "alice", TEST_MEM_KIB, TEST_ITERS, 1).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn different_password_or_username_gives_different_key() {
        let base = derive_seed_with_params("hunter2", "alice", TEST_MEM_KIB, TEST_ITERS, 1).unwrap();
        let other_pw =
            derive_seed_with_params("hunter3", "alice", TEST_MEM_KIB, TEST_ITERS, 1).unwrap();
        let other_user =
            derive_seed_with_params("hunter2", "alicia", TEST_MEM_KIB, TEST_ITERS, 1).unwrap();
        assert_ne!(base, other_pw);
        assert_ne!(base, other_user);
    }

    /// Golden vector — must stay in sync with the value asserted by the web
    /// client's parity test. Full production cost, ~1s; run explicitly with
    /// `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn production_golden_vector() {
        let seed = derive_seed("correct horse battery staple", "alice").unwrap();
        assert_eq!(
            hex_encode(&seed),
            "c3c8e09b6b8299f89f7de3cfde1eeb090abc88c2ad5e56d796477b4595d58983"
        );
        assert_eq!(
            hex_encode(&crate::public_key(&seed)),
            "09142b51ed94ef5a8627bd2ae96de234c840f75fabde74076b08e78b5cd7012c"
        );
    }

    fn hex_encode(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
}
