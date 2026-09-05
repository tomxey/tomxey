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

/// Below this a slot is treated as unable to play. A gameplay transaction
/// measured ~1.9M nanos on testnet, so this is roughly 25 moves of headroom —
/// enough that a guest will not run dry mid-round, low enough that topping up
/// an already-funded room is a no-op rather than a second 3.5 IOTA.
export const MIN_SLOT_NANOS = 50_000_000;

/// Which slots cannot afford to play. Pure, so the threshold is testable
/// without a node: `balances[i]` belongs to `slots[i]`.
export function slotsNeedingFunds(slots, balances, minNanos = MIN_SLOT_NANOS) {
  return slots.filter((_, index) => (balances[index] ?? 0) < minNanos);
}

/// Total nanos held by each slot address, in the order given.
export async function slotBalances(client, slots) {
  return Promise.all(
    slots.map(async (slot) => {
      try {
        const coins = await client.getCoins({ owner: slot.address });
        return coins.data.reduce((sum, coin) => sum + Number(coin.balance), 0);
      } catch {
        // Treat an unreadable balance as empty: funding a slot that turns out
        // to be solvent wastes a little gas, refusing to fund one that is
        // broke leaves a player unable to join.
        return 0;
      }
    }),
  );
}

/// Serialise writes when the caller does not supply a queue. Tests import this
/// module in node, where `app/shell.js` cannot load, so the real queue is
/// injected rather than imported.
const localQueue = (() => {
  let chain = Promise.resolve();
  return (task) => {
    // `then(task, task)` so one failure does not wedge the queue.
    chain = chain.then(task, task);
    return chain;
  };
})();

/// A store bound to one game and one identity.
///
/// `identity` is either `{kind: 'host', seed, accountAddress}` or
/// `{kind: 'guest', keypair}`.
export function makeGameStore({ client, packageId, identity, log, enqueue = localQueue }) {
  const target = (fn) => `${packageId}::${MODULE}::${fn}`;

  /// Every write goes through the queue, because they all spend the same gas
  /// coin. Two transactions using one owned object at once fail with either
  /// "reserved for another transaction" or "Version … is not available for
  /// consumption" — which is what a paint landing beside a claim used to do.
  function send(build, gasBudget) {
    return enqueue(() => submit(build, gasBudget));
  }

  async function submit(build, gasBudget) {
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
    /// Publish the current drawing. Measured at ~1M nanos a frame once the
    /// canvas stops changing size, because the storage rebate cancels the
    /// storage charge — which is what makes a snapshot every couple of
    /// seconds affordable.
    async paint(gameId, canvasId, pixels) {
      await send((tx) => {
        tx.moveCall({
          target: target('paint'),
          arguments: [
            tx.object(gameId),
            tx.object(canvasId),
            tx.pure.vector('u8', Array.from(pixels)),
          ],
        });
      }, 60_000_000);
    },

    /// Add one guest slot and fund it in the same transaction, exactly as
    /// `createGame` funds the first batch.
    async addSlot(gameId, address, fundingNanos) {
      await send((tx) => {
        tx.moveCall({
          target: target('add_slot'),
          arguments: [tx.object(gameId), tx.pure.address(address)],
        });
        const [coin] = tx.splitCoins(tx.gas, [fundingNanos]);
        tx.transferObjects([coin], address);
      }, 80_000_000);
    },

    /// Drop the last slot. The contract refuses if somebody has claimed it.
    removeLastSlot: (gameId) =>
      send((tx) =>
        tx.moveCall({
          target: target('remove_last_slot'),
          arguments: [tx.object(gameId)],
        }),
      ),

    /// Delete a finished room, returning its storage deposit. Host-only, and
    /// the canvas must be the one this game created — the contract checks both.
    async closeGame(gameId, canvasId) {
      await send((tx) => {
        tx.moveCall({
          target: target('close_game'),
          arguments: [tx.object(gameId), tx.object(canvasId)],
        });
      }, 50_000_000);
    },

    /// Top up guest slots after the room already exists — the counterpart to
    /// `sweepSlots`. `createGame` funds once, but a resumed room may have been
    /// swept, and a long game can drain a guest. Without this the host has no
    /// way to make a swept room playable again.
    async fundSlots({ slots, fundingNanos }) {
      if (slots.length === 0) return 0;
      await send((tx) => {
        const coins = tx.splitCoins(
          tx.gas,
          slots.map(() => fundingNanos),
        );
        slots.forEach((slot, index) => tx.transferObjects([coins[index]], slot.address));
      }, 50_000_000 + slots.length * 20_000_000);
      return slots.length;
    },

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

    /// Put a removed player back. Lobby only, host only — the contract
    /// enforces both.
    readmit: (gameId, player) =>
      send((tx) =>
        tx.moveCall({
          target: target('readmit'),
          arguments: [tx.object(gameId), tx.pure.u16(player)],
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
/// Reduce a host's event history to the rooms that still exist.
///
/// Pure, and deliberately matched on the type *suffix*: an event's type
/// carries the package version that emitted it, so `RoomCreated` from v2 and
/// from a future v3 are different type strings for the same thing. Objects do
/// not behave this way — their types stay pinned to the original package — so
/// only events need this treatment.
export function roomsFromEvents(events) {
  const closed = new Set();
  for (const event of events) {
    if (String(event.type).endsWith('::kalambury::RoomClosed')) {
      closed.add(event.parsedJson?.game);
    }
  }

  const rooms = [];
  const seen = new Set();
  for (const event of events) {
    if (!String(event.type).endsWith('::kalambury::RoomCreated')) continue;
    const { game, canvas, room_index: roomIndex } = event.parsedJson ?? {};
    if (!game || closed.has(game) || seen.has(game)) continue;
    seen.add(game);
    rooms.push({ gameId: game, canvasId: canvas, roomIndex: Number(roomIndex ?? 0) });
  }
  return rooms.sort((a, b) => b.roomIndex - a.roomIndex);
}

/// Every room this host still has on chain, newest room index first.
///
/// A Game is shared, so it is owned by nobody and getOwnedObjects will never
/// list it. The creation event is the only durable record, which is why losing
/// localStorage used to strand a room for good.
export async function listRooms({ client, host, pages = 5, log }) {
  const events = [];
  let cursor = null;
  try {
    for (let page = 0; page < pages; page += 1) {
      const response = await client.queryEvents({
        query: { Sender: host },
        cursor,
        limit: 50,
        order: 'descending',
      });
      events.push(...(response.data ?? []));
      if (!response.hasNextPage || !response.nextCursor) break;
      cursor = response.nextCursor;
      if (page === pages - 1) log?.('room history is long — showing the most recent rooms only');
    }
  } catch (error) {
    // A room list is a convenience; failing to build it must not stop the host
    // from playing the room they already have.
    log?.(`could not list rooms: ${error.message ?? error}`);
  }
  return roomsFromEvents(events);
}

/// Game and canvas in one request. The round view polls both every 1.5 s, and
/// two round trips per tick would double the RPC traffic for no reason.
/// `canvasId` is unknown on the very first poll, so that one reads the game
/// alone and learns it.
export async function fetchRound(client, gameId, canvasId) {
  if (!canvasId) return { game: await fetchGame(client, gameId), canvas: null };

  const objects = await client.multiGetObjects({
    ids: [gameId, canvasId],
    options: { showContent: true },
  });
  const game = objects?.[0]?.data?.content?.fields;
  if (!game) throw new Error(`game ${gameId} not found`);
  return { game, canvas: objects?.[1]?.data?.content?.fields ?? null };
}

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
