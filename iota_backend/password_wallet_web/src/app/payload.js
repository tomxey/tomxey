// The size limit on anything stored in a blob object, shared by every kind.
//
// Recipes hit it first, but copying a long ingredient list into a todo item
// grows that item's blob too, so the check belongs here rather than in either
// tab.

/// 24-byte XChaCha20 nonce + 16-byte Poly1305 tag, added by `encryptData`.
const CRYPTO_OVERHEAD = 40;

/// Ceiling on the encrypted blob. The chain limit is
/// `max_pure_argument_size` = 16384 (the blob travels as a pure argument, and
/// a 16400-byte argument was rejected on chain); the gap covers the BCS
/// length prefix and any future schema field.
export const MAX_PAYLOAD_BYTES = 16_000;

/// Exact size of the blob this content will occupy on chain, so callers can
/// budget against `MAX_PAYLOAD_BYTES` instead of guessing from text length
/// (JSON escaping makes each newline two bytes, and non-ASCII characters
/// cost their UTF-8 length).
export function payloadBytes(content) {
  return new TextEncoder().encode(JSON.stringify(content)).length + CRYPTO_OVERHEAD;
}

export function isOverCap(content) {
  return payloadBytes(content) > MAX_PAYLOAD_BYTES;
}
