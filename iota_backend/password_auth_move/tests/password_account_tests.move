#[test_only]
module password_auth::password_account_tests;

use iota::auth_context::AuthenticatorFunctionInfoV1;
use iota::ptb_call_arg::CallArg;
use iota::ptb_command::Command;
use password_auth::password_account;

// Test vectors: ed25519 keypair from seed 0x07*32, signatures over DIGEST.
const PUBKEY: vector<u8> = x"ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
const DIGEST: vector<u8> = x"0101010101010101010101010101010101010101010101010101010101010101";
const VALID_SIG: vector<u8> =
    x"013f9d903c1a0a90b0beea2534582e2bb694712503215236622851f5afd54ad5f2a89983965e192edd928d484bdb1e1e521ba704fbe37968371a11597363fb0d";
// Signature over DIGEST made with a different key (seed 0x09*32).
const OTHER_KEY_SIG: vector<u8> =
    x"9ea2cea0796e6769f538b50bb424ff68b6cb550615f49e178eee4891ee3d52711015e41eaa2e7c316976e8d3c62631b8dc43487152974b03177be01c3b47550c";
const PUBKEY2: vector<u8> = x"fd1724385aa0c75b64fb78cd602fa1d991fdebf76b13c58ed702eac835e9f618";

fun test_auth_context(): AuthContext {
    auth_context::new_for_testing(
        DIGEST,
        vector::empty<CallArg>(),
        vector::empty<Command>(),
        vector::empty(),
        DIGEST,
        option::none(),
        option::none<AuthenticatorFunctionInfoV1>(),
        option::none<AuthenticatorFunctionInfoV1>(),
    )
}

#[test]
fun authenticate_accepts_valid_signature() {
    let mut ctx = tx_context::new(@0xA, DIGEST, 0, 0, 0);
    let account = password_account::new_for_testing(PUBKEY, &mut ctx);
    let auth_ctx = test_auth_context();

    password_account::authenticate(&account, VALID_SIG, &auth_ctx, &ctx);

    password_account::destroy_for_testing(account);
}

#[test]
#[expected_failure(abort_code = password_account::EInvalidSignature)]
fun authenticate_rejects_wrong_key_signature() {
    let mut ctx = tx_context::new(@0xA, DIGEST, 0, 0, 0);
    let account = password_account::new_for_testing(PUBKEY, &mut ctx);
    let auth_ctx = test_auth_context();

    password_account::authenticate(&account, OTHER_KEY_SIG, &auth_ctx, &ctx);

    password_account::destroy_for_testing(account);
}

#[test]
#[expected_failure(abort_code = password_account::EInvalidSignature)]
fun authenticate_rejects_signature_over_different_digest() {
    // Same key, but the context digest differs from the signed one.
    let other_digest = x"0202020202020202020202020202020202020202020202020202020202020202";
    let mut ctx = tx_context::new(@0xA, other_digest, 0, 0, 0);
    let account = password_account::new_for_testing(PUBKEY, &mut ctx);
    let auth_ctx = test_auth_context();

    password_account::authenticate(&account, VALID_SIG, &auth_ctx, &ctx);

    password_account::destroy_for_testing(account);
}

#[test]
fun rotate_pubkey_allowed_for_account_itself() {
    let mut ctx = tx_context::new(@0xA, DIGEST, 0, 0, 0);
    let mut account = password_account::new_for_testing(PUBKEY, &mut ctx);

    // A transaction authenticated as the account has sender == account address.
    let account_address = object::id_address(&account);
    let ctx2 = tx_context::new(account_address, DIGEST, 0, 0, 1);

    password_account::rotate_pubkey(&mut account, PUBKEY2, &ctx2);
    let expected = PUBKEY2;
    assert!(password_account::public_key(&account) == &expected);

    password_account::destroy_for_testing(account);
}

#[test]
#[expected_failure(abort_code = password_account::ENotAccountItself)]
fun rotate_pubkey_rejected_for_other_sender() {
    let mut ctx = tx_context::new(@0xA, DIGEST, 0, 0, 0);
    let mut account = password_account::new_for_testing(PUBKEY, &mut ctx);

    password_account::rotate_pubkey(&mut account, PUBKEY2, &ctx);

    password_account::destroy_for_testing(account);
}

#[test]
#[expected_failure(abort_code = password_account::EBadPublicKeyLength)]
fun rotate_pubkey_rejects_short_key() {
    let mut ctx = tx_context::new(@0xA, DIGEST, 0, 0, 0);
    let mut account = password_account::new_for_testing(PUBKEY, &mut ctx);

    let account_address = object::id_address(&account);
    let ctx2 = tx_context::new(account_address, DIGEST, 0, 0, 1);

    password_account::rotate_pubkey(&mut account, x"0102", &ctx2);

    password_account::destroy_for_testing(account);
}
