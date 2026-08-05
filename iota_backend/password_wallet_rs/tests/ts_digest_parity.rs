//! Pins the TS SDK's transaction digest (what the web client signs) against
//! `iota-types`' `TransactionData::digest()` (what `ctx.digest()` returns in
//! the on-chain authenticator). The fixture was produced by an offline
//! `Transaction.build()` in `@iota/iota-sdk` — see
//! `password_wallet_web/test/` for the generator snippet.

use iota_types::transaction::{TransactionData, TransactionDataAPI};

const TX_BYTES_B64: &str = "AAACAAg5MAAAAAAAAAAgu7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7sCAgABAQAAAQEDAAAAAAEBAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAQICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBQAAAAAAAAAgAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqugDAAAAAAAAgPD6AgAAAAAA";
const TS_DIGEST_B58: &str = "FXA7FYWtZvXdZJcqaZvtP3c9hA7rWGsWmmJzeLsPdV4f";

#[test]
fn ts_sdk_digest_matches_iota_types() {
    let bytes = base64_decode(TX_BYTES_B64);
    let tx_data: TransactionData = bcs::from_bytes(&bytes).expect("valid TransactionData BCS");
    let digest = tx_data.digest();
    assert_eq!(digest.to_string(), TS_DIGEST_B58);
}

fn base64_decode(input: &str) -> Vec<u8> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lookup = [255u8; 256];
    for (i, &c) in ALPHABET.iter().enumerate() {
        lookup[c as usize] = i as u8;
    }
    let mut out = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0u32;
    for &c in input.as_bytes() {
        if c == b'=' {
            break;
        }
        let value = lookup[c as usize];
        assert_ne!(value, 255, "invalid base64 character");
        buffer = (buffer << 6) | value as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    out
}
