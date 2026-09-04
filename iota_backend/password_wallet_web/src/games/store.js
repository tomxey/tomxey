// Chain access for the games page. Thin by design: the rules live in Move, so
// this module only builds transactions and reads objects. Nothing here decides
// whether a move is legal.
//
// Every call goes through one `send`, chosen by identity — the host signs with
// their password account through the MoveAuthenticator path, a guest signs
// directly with their own keypair. Keeping that in one place is why the round
// view has no transaction code in it.
import { Transaction } from '@iota/iota-sdk/transactions';

import { executeAsAccount } from '../chain.js';

const MODULE = 'kalambury';
/// The shared Clock, at a fixed address since genesis.
const CLOCK = '0x6';

const GUEST_GAS_BUDGET = 50_000_000;

/// A store bound to one game and one identity.
///
/// `identity` is either `{kind: 'host', seed, accountAddress}` or
/// `{kind: 'guest', keypair}`.
export function makeGameStore({ client, packageId, identity, log }) {
  const target = (fn) => `${packageId}::${MODULE}::${fn}`;

  async function send(build, gasBudget) {
    const tx = new Transaction();
    build(tx);

    if (identity.kind === 'host') {
      return executeAsAccount({
        client,
        seed: identity.seed,
        accountAddress: identity.accountAddress,
        tx,
        log,
        gasBudget,
      });
    }

    tx.setSender(identity.keypair.getPublicKey().toIotaAddress());
    tx.setGasBudget(gasBudget ?? GUEST_GAS_BUDGET);
    const response = await client.signAndExecuteTransaction({
      signer: identity.keypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });
    const status = response.effects?.status;
    if (status && status.status !== 'success') {
      throw new Error(`transaction failed: ${status.error ?? 'unknown error'}`);
    }
    await client.waitForTransaction({ digest: response.digest });
    return response;
  }

  return {
    /// Create the room and fund every guest slot in one transaction.
    /// Splitting the host's gas coin and transferring is what saves each guest
    /// from an account and a faucet round.
    async createGame({ roomIndex, slots, fundingNanos }) {
      const response = await send((tx) => {
        tx.moveCall({
          target: target('create_game'),
          arguments: [
            tx.pure.u32(roomIndex),
            tx.pure.vector(
              'address',
              slots.map((slot) => slot.address),
            ),
          ],
        });
        if (slots.length > 0) {
          const coins = tx.splitCoins(
            tx.gas,
            slots.map(() => fundingNanos),
          );
          slots.forEach((slot, index) => tx.transferObjects([coins[index]], slot.address));
        }
      }, 200_000_000 + slots.length * 20_000_000);

      const created = (response.objectChanges ?? []).filter((c) => c.type === 'created');
      const game = created.find((c) => `${c.objectType}`.endsWith(`::${MODULE}::Game`));
      const canvas = created.find((c) => `${c.objectType}`.endsWith(`::${MODULE}::Canvas`));
      if (!game) throw new Error('no Game object in the transaction effects');
      return { gameId: game.objectId, canvasId: canvas?.objectId ?? null };
    },

    join: (gameId, name) =>
      send((tx) =>
        tx.moveCall({
          target: target('join'),
          arguments: [tx.object(gameId), tx.pure.string(name)],
        }),
      ),

    kick: (gameId, player) =>
      send((tx) =>
        tx.moveCall({
          target: target('kick'),
          arguments: [tx.object(gameId), tx.pure.u16(player)],
        }),
      ),

    startGame: (gameId) =>
      send((tx) =>
        tx.moveCall({
          target: target('start_game'),
          arguments: [tx.object(gameId), tx.object(CLOCK)],
        }),
      ),

    startRound: (gameId, commitment) =>
      send((tx) =>
        tx.moveCall({
          target: target('start_round'),
          arguments: [
            tx.object(gameId),
            tx.pure.vector('u8', Array.from(commitment)),
            tx.object(CLOCK),
          ],
        }),
      ),

    guess: (gameId, text) =>
      send((tx) =>
        tx.moveCall({
          target: target('guess'),
          arguments: [tx.object(gameId), tx.pure.string(text), tx.object(CLOCK)],
        }),
      ),

    claimWinner: (gameId, index) =>
      send((tx) =>
        tx.moveCall({
          target: target('claim_winner'),
          arguments: [tx.object(gameId), tx.pure.u16(index), tx.object(CLOCK)],
        }),
      ),

    reveal: (gameId, word, nonce) =>
      send((tx) =>
        tx.moveCall({
          target: target('reveal'),
          arguments: [
            tx.object(gameId),
            tx.pure.string(word),
            tx.pure.vector('u8', Array.from(nonce)),
            tx.object(CLOCK),
          ],
        }),
      ),

    /// Any player may call these once the deadline has passed, which is what
    /// stops an absent drawer freezing the table.
    timeoutRound: (gameId) => send((tx) => unstick(tx, target('timeout_round'), gameId)),
    forfeitRound: (gameId) => send((tx) => unstick(tx, target('forfeit_round'), gameId)),
    skipDrawer: (gameId) => send((tx) => unstick(tx, target('skip_drawer'), gameId)),
  };
}

function unstick(tx, fn, gameId) {
  tx.moveCall({ target: fn, arguments: [tx.object(gameId), tx.object(CLOCK)] });
}

/// The game object's fields, as returned by RPC.
export async function fetchGame(client, gameId) {
  const object = await client.getObject({ id: gameId, options: { showContent: true } });
  const fields = object.data?.content?.fields;
  if (!fields) throw new Error(`game ${gameId} not found`);
  return fields;
}

/// Return every slot's leftover gas to the host.
///
/// There is no contract entry point for this and there cannot be: the coins
/// sit in the guests' own addresses, not inside the Game, so only the key
/// holder can move them. Deriving the slot keys from the host's seed is what
/// makes the host that holder.
export async function sweepSlots({ client, slots, to, log }) {
  let swept = 0;
  for (const slot of slots) {
    try {
      const coins = await client.getCoins({ owner: slot.address });
      if (coins.data.length === 0) continue;

      const tx = new Transaction();
      tx.setSender(slot.address);
      tx.setGasBudget(GUEST_GAS_BUDGET);
      tx.transferObjects([tx.gas], to);

      const response = await client.signAndExecuteTransaction({
        signer: slot.keypair,
        transaction: tx,
        options: { showEffects: true },
      });
      await client.waitForTransaction({ digest: response.digest });
      swept += 1;
    } catch (error) {
      // One unfunded or already-swept slot must not stop the rest.
      log?.(`could not sweep ${slot.address}: ${error.message ?? error}`);
    }
  }
  return swept;
}
