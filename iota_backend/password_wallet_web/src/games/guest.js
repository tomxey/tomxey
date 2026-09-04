// Guest identities and the invitation payload.
//
// A guest holds a plain keypair, not a password account: the password
// machinery exists to recover an identity from a password on any device, and a
// guest at the table for twenty minutes does not need that. It also saves them
// the ~1 s Argon2 derivation, an on-chain account object and the faucet.
//
// The keys are derived from the host's own password seed rather than generated
// randomly, which buys three things:
//
//   - a host who reloads re-derives identical slots and can re-show a guest's
//     QR, so a guest who cleared their browser can rejoin;
//   - the host can sweep the leftover gas when the game ends, because they can
//     reproduce every key;
//   - nothing secret is stored anywhere. Not on chain — a shared object is
//     public — and not in localStorage.
//
// The host therefore knows every guest's key, so the host could act as any
// player. That is a deliberate, scoped trade for scan-and-play, and the room
// index recorded on chain is public precisely because it derives nothing
// without the host's seed.
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';

/// Domain separation for the derivation, versioned: changing it invalidates
/// every previously derived slot, which would strand funds a host expected to
/// sweep.
const SLOT_CONTEXT = 'kalambury-slot-v1';

const SECRET_KEY_BYTES = 32;

/// `blake2b256(context || hostSeed || roomIndex || slotIndex)`, used directly
/// as an ed25519 secret key. Same shape as the encryption subkey derivation in
/// `password_auth_core::encryption`.
function deriveSecret(hostSeed, roomIndex, slotIndex, blake2b256) {
  const context = new TextEncoder().encode(SLOT_CONTEXT);
  const preimage = new Uint8Array(context.length + hostSeed.length + 4 + 1);

  let at = 0;
  preimage.set(context, at);
  at += context.length;
  preimage.set(hostSeed, at);
  at += hostSeed.length;
  // Little-endian u32, matching `room_index` in the Move object.
  preimage[at++] = roomIndex & 0xff;
  preimage[at++] = (roomIndex >>> 8) & 0xff;
  preimage[at++] = (roomIndex >>> 16) & 0xff;
  preimage[at++] = (roomIndex >>> 24) & 0xff;
  preimage[at] = slotIndex & 0xff;

  return new Uint8Array(blake2b256(preimage)).slice(0, SECRET_KEY_BYTES);
}

/// The slots for one room: `[{address, secretKey}]`, where `secretKey` is the
/// SDK's bech32 form, short enough to sit in a QR beside the game id.
export function deriveSlots(hostSeed, roomIndex, count, blake2b256) {
  return Array.from({ length: count }, (_unused, index) => {
    const keypair = Ed25519Keypair.fromSecretKey(
      deriveSecret(hostSeed, roomIndex, index, blake2b256),
    );
    return {
      address: keypair.getPublicKey().toIotaAddress(),
      secretKey: keypair.getSecretKey(),
    };
  });
}

export function keypairFromSecret(secretKey) {
  return Ed25519Keypair.fromSecretKey(secretKey);
}

export function slotUrl(base, gameId, secretKey) {
  const url = new URL(base);
  url.searchParams.set('game', gameId);
  url.searchParams.set('k', secretKey);
  return url.toString();
}

export function parseSlotUrl(search) {
  const params = new URLSearchParams(search);
  const gameId = params.get('game');
  const secretKey = params.get('k');
  return gameId && secretKey ? { gameId, secretKey } : null;
}
