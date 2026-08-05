//! Pins `password_auth_core`'s hand-rolled MoveAuthenticator encoding against
//! the authoritative `iota-sdk-types` implementation, and regenerates the
//! golden vectors used by the web client's parity tests
//! (run with `-- --nocapture` to print them).

use iota_sdk_types::{
    MoveAuthenticator, MoveAuthenticatorV1, ObjectId, SharedObjectReference, UserSignature,
};
use iota_types::transaction::CallArg;

#[test]
fn core_encoding_matches_iota_sdk_types() {
    let signature = vec![0xABu8; 64];
    let account_id_bytes = [0x01u8; 32];
    let initial_shared_version = 42u64;

    let signature_call_arg = CallArg::Pure(bcs::to_bytes(&signature).unwrap());
    let account_id = ObjectId::from_bytes(account_id_bytes).unwrap();
    let authenticator =
        MoveAuthenticator::from(MoveAuthenticatorV1::new_with_shared_account_object(
            vec![signature_call_arg],
            vec![],
            SharedObjectReference::new(account_id, initial_shared_version.into(), false),
        ));
    let reference_bytes = UserSignature::MoveAuthenticator(authenticator).to_bytes();

    let core_bytes = password_auth_core::authenticator::move_authenticator_signature(
        &signature,
        &account_id_bytes,
        initial_shared_version,
    );

    assert_eq!(hex::encode(&core_bytes), hex::encode(&reference_bytes));
    println!("golden move-authenticator signature: {}", hex::encode(&core_bytes));
}

/// Production-cost KDF vector (Argon2id 512 MiB / t=3), the same one asserted
/// by `password_auth_core` and the web client. ~1s.
#[test]
fn kdf_golden_vector() {
    let seed = password_auth_core::kdf::derive_seed("correct horse battery staple", "alice")
        .unwrap();
    assert_eq!(
        hex::encode(seed),
        "c3c8e09b6b8299f89f7de3cfde1eeb090abc88c2ad5e56d796477b4595d58983"
    );
    let pubkey = password_auth_core::public_key(&seed);
    assert_eq!(
        hex::encode(pubkey),
        "09142b51ed94ef5a8627bd2ae96de234c840f75fabde74076b08e78b5cd7012c"
    );
    println!("golden kdf pubkey: {}", hex::encode(pubkey));
}
