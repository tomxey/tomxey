//! Hashes shared with on-chain code.
//!
//! Move's `iota::hash::blake2b256` is Blake2b with a 32-byte digest. Exposing
//! the same function here means the commitment a client builds and the one the
//! contract verifies cannot drift — parity by construction rather than by
//! hope.

use blake2::{digest::consts::U32, Blake2b, Digest};

pub fn blake2b256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2b::<U32>::new();
    hasher.update(data);
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    /// Blake2b-256 of the empty input, from the reference vectors.
    #[test]
    fn empty_input_matches_the_reference_vector() {
        assert_eq!(
            hex(&blake2b256(b"")),
            "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8"
        );
    }

    /// The kalambury commitment vector, asserted identically in
    /// `commitment.test.js` and in the Move tests.
    #[test]
    fn the_kalambury_commitment_vector() {
        let mut preimage = b"harmonijka".to_vec();
        preimage.extend_from_slice(&[7u8; 32]);
        assert_eq!(
            hex(&blake2b256(&preimage)),
            "99a8e6a7153fb5f5e586ffad68b1c2883d9ee13c3e1276f9ddfc167f2492acec"
        );
    }
}
