//! Assembly of the `UserSignature::MoveAuthenticator` wire bytes.
//!
//! Hand-encoded BCS so this stays dependency-free and wasm32-friendly. The
//! layout is pinned against `iota-sdk-types` by a golden test in
//! `password_wallet_rs/tests/golden_vectors.rs`:
//!
//! ```text
//! 0x07                                   UserSignature scheme flag (MoveAuthenticator)
//! 0x00                                   MoveAuthenticator::V1
//! vector<CallArg> call_args              [Pure(bcs(vector<u8> signature))]
//!   CallArg::Pure = 0x00, payload = uleb-prefixed bytes
//! vector<TypeTag> type_args              empty
//! CallArg object_to_authenticate         Object(Shared { id, initial_shared_version, mutable: false })
//!   CallArg::Object = 0x01, ObjectArg::Shared = 0x01
//! ```

/// `UserSignature` scheme flag for MoveAuthenticator.
const MOVE_AUTHENTICATOR_FLAG: u8 = 0x07;

/// Build the full signature bytes (flag byte included) authenticating
/// `account_id` (a shared account object) with an ed25519 `signature` over the
/// transaction digest. Base64-encode the result for JSON-RPC submission.
pub fn move_authenticator_signature(
    signature: &[u8],
    account_id: &[u8; 32],
    initial_shared_version: u64,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(signature.len() + 64);
    out.push(MOVE_AUTHENTICATOR_FLAG);
    out.push(0x00); // MoveAuthenticator::V1

    out.push(0x01); // call_args: 1 element
    out.push(0x00); // CallArg::Pure
    // Pure payload = BCS of the Move `vector<u8>` value, itself uleb-prefixed.
    let mut pure = Vec::with_capacity(signature.len() + 2);
    write_uleb128(&mut pure, signature.len() as u64);
    pure.extend_from_slice(signature);
    write_uleb128(&mut out, pure.len() as u64);
    out.extend_from_slice(&pure);

    out.push(0x00); // type_args: empty vector

    out.push(0x01); // CallArg::Object
    out.push(0x01); // ObjectArg::Shared
    out.extend_from_slice(account_id);
    out.extend_from_slice(&initial_shared_version.to_le_bytes());
    out.push(0x00); // mutable: false

    out
}

fn write_uleb128(out: &mut Vec<u8>, mut value: u64) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Golden vector generated from `iota-sdk-types`
    /// (`UserSignature::MoveAuthenticator(...).to_bytes()`); see
    /// `password_wallet_rs/tests/golden_vectors.rs`.
    #[test]
    fn matches_iota_sdk_types_encoding() {
        let signature = [0xABu8; 64];
        let account_id = [0x01u8; 32];
        let bytes = move_authenticator_signature(&signature, &account_id, 42);

        let expected = "070001004140\
            abababababababababababababababababababababababababababababababab\
            abababababababababababababababababababababababababababababababab\
            0001\
            0101010101010101010101010101010101010101010101010101010101010101\
            012a0000000000000000"
            .replace(char::is_whitespace, "");
        assert_eq!(hex_encode(&bytes), expected);
    }

    #[test]
    fn uleb_multi_byte() {
        let mut out = Vec::new();
        write_uleb128(&mut out, 300);
        assert_eq!(out, vec![0xAC, 0x02]);
    }

    fn hex_encode(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
}
