// Password-derived-key abstract account for IOTA account abstraction.
//
// The password itself never touches the chain. Off-chain, the password is
// stretched with Argon2id into an ed25519 keypair; only the public key is
// stored here. Each transaction from the account carries an ed25519 signature
// over the transaction digest as its auth argument — the framework guarantees
// `ctx.digest()` matches the submitted transaction, so a signature cannot be
// replayed or attached to a different transaction.
module password_auth::password_account;

use iota::account;
use iota::authenticator_function::AuthenticatorFunctionRefV1;
use iota::dynamic_field;
use iota::ed25519;

#[error(code = 0)]
const EInvalidSignature: vector<u8> =
    b"Ed25519 signature verification against the stored public key failed.";
#[error(code = 1)]
const ENotAccountItself: vector<u8> =
    b"Only a transaction authenticated as this account may rotate its public key.";
#[error(code = 2)]
const EBadPublicKeyLength: vector<u8> = b"An ed25519 public key must be exactly 32 bytes.";

const ED25519_PUBLIC_KEY_LENGTH: u64 = 32;

/// Dynamic field key under which the account's public key is stored.
public struct OwnerPublicKey has copy, drop, store {}

public struct PasswordAccount has key {
    id: UID,
}

/// Create a `PasswordAccount` shared object guarded by `authenticator` and
/// return its address. The one-time setup transaction is sent from any normal
/// funded address; afterwards the account is controlled solely by the
/// password-derived key.
public fun create(
    pubkey: vector<u8>,
    authenticator: AuthenticatorFunctionRefV1<PasswordAccount>,
    ctx: &mut TxContext,
): address {
    assert!(pubkey.length() == ED25519_PUBLIC_KEY_LENGTH, EBadPublicKeyLength);

    let mut account = PasswordAccount { id: object::new(ctx) };
    dynamic_field::add(&mut account.id, OwnerPublicKey {}, pubkey);

    let account_address = object::id_address(&account);
    account::create_account_v1(account, authenticator);

    account_address
}

/// Authenticator: the auth argument must be an ed25519 signature, made with
/// the password-derived key, over the digest of the transaction being
/// authenticated.
#[authenticator]
public fun authenticate(
    account: &PasswordAccount,
    signature: vector<u8>,
    _auth_ctx: &AuthContext,
    ctx: &TxContext,
) {
    assert!(
        ed25519::ed25519_verify(&signature, account.public_key(), ctx.digest()),
        EInvalidSignature,
    );
}

/// Change-password path: only a transaction already authenticated as this
/// account (sender == account address) may swap in a new public key.
public fun rotate_pubkey(account: &mut PasswordAccount, new_pubkey: vector<u8>, ctx: &TxContext) {
    assert!(ctx.sender() == object::id_address(account), ENotAccountItself);
    assert!(new_pubkey.length() == ED25519_PUBLIC_KEY_LENGTH, EBadPublicKeyLength);

    dynamic_field::remove<OwnerPublicKey, vector<u8>>(&mut account.id, OwnerPublicKey {});
    dynamic_field::add(&mut account.id, OwnerPublicKey {}, new_pubkey);
}

public fun public_key(account: &PasswordAccount): &vector<u8> {
    dynamic_field::borrow(&account.id, OwnerPublicKey {})
}

#[test_only]
/// Build a bare `PasswordAccount` (not registered as an abstract account) so
/// unit tests can exercise `authenticate` and `rotate_pubkey` directly.
public fun new_for_testing(pubkey: vector<u8>, ctx: &mut TxContext): PasswordAccount {
    let mut account = PasswordAccount { id: object::new(ctx) };
    dynamic_field::add(&mut account.id, OwnerPublicKey {}, pubkey);
    account
}

#[test_only]
public fun destroy_for_testing(account: PasswordAccount) {
    let PasswordAccount { id } = account;
    id.delete();
}
