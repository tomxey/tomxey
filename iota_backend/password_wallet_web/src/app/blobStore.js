// Generic CRUD over "one object holding one encrypted JSON blob" — the
// storage shape both TodoItem and Recipe use.
//
// Each store is bound to one Move type, so `getOwnedObjects` filters
// server-side and opening one tab never fetches the other kind's objects.
// Updates and deletes reference the exact object version the caller read
// (`tx.objectRef`), so a racing edit from another device fails on-chain
// instead of overwriting: owned-object versioning doubles as compare-and-swap.
import { Transaction } from '@iota/iota-sdk/transactions';
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';
import { fromBase64 } from '@iota/bcs';

import { executeAsAccount } from '../chain.js';
import { gasBudgetForBytes } from './gas.js';
import { decryptData, encryptData } from '../wallet.js';

/// Bind a store to one Move type. `module`/`struct` name the Move module and
/// its struct; the module is expected to expose `create`, `set_data` and
/// `destroy`, as both todo_item and recipe do.
export function makeBlobStore({ client, seed, accountAddress, packageId, module, struct, log }) {
  const typeTag = `${packageId}::${module}::${struct}`;
  const owner = normalizeIotaAddress(accountAddress);
  const target = (fn) => `${packageId}::${module}::${fn}`;

  // Writes are budgeted by blob size: storage dominates, and a 16 KB recipe
  // costs well over the flat base budget.
  const execute = (tx, payloadBytes) =>
    executeAsAccount({
      client,
      seed,
      accountAddress,
      tx,
      log,
      gasBudget: gasBudgetForBytes(payloadBytes),
    });

  return {
    typeTag,

    /// Every object of this type owned by the account, decrypted. Returns
    /// `{entries: [{ref, content}], lastUpdatedMs}`, where the timestamp is
    /// that of the most recent transaction touching any current object (from
    /// any device), or null if there are none.
    ///
    /// An object that cannot be decrypted or parsed is skipped rather than
    /// failing the whole load — one corrupt blob must not make the tab
    /// unusable.
    async fetchAll() {
      const entries = [];
      const txDigests = new Set();
      let cursor = null;

      do {
        const page = await client.getOwnedObjects({
          owner,
          cursor,
          filter: { StructType: typeTag },
          options: { showBcs: true, showPreviousTransaction: true },
        });
        for (const { data: object } of page.data) {
          try {
            const blob = decodeBlobData(object);
            const plaintext = await decryptData(seed, blob);
            entries.push({
              ref: { objectId: object.objectId, version: object.version, digest: object.digest },
              content: JSON.parse(new TextDecoder().decode(plaintext)),
            });
            if (object.previousTransaction) txDigests.add(object.previousTransaction);
          } catch (error) {
            console.warn(`skipping unreadable ${struct} ${object?.objectId}`, error);
          }
        }
        cursor = page.hasNextPage ? page.nextCursor : null;
      } while (cursor);

      return { entries, lastUpdatedMs: await latestTimestamp(client, [...txDigests]) };
    },

    /// Create an object holding `content`. The new ref comes from the
    /// transaction effects, so no follow-up query is needed.
    async create(content) {
      const blob = await encryptContent(seed, content);
      const tx = new Transaction();
      tx.moveCall({
        target: target('create'),
        arguments: [tx.pure.vector('u8', Array.from(blob))],
      });
      const response = await execute(tx, blob.length);
      const created = (response.objectChanges ?? []).find(
        (change) => change.type === 'created' && change.objectType === typeTag,
      );
      if (!created) throw new Error(`created ${struct} not found in effects`);
      return {
        ref: { objectId: created.objectId, version: created.version, digest: created.digest },
        content,
      };
    },

    /// Overwrite one object, based on the exact version in `ref`. Throws (and
    /// changes nothing) if it moved on chain since it was read. Returns the
    /// ref advanced to the new version.
    async update(ref, content) {
      const blob = await encryptContent(seed, content);
      const tx = new Transaction();
      tx.moveCall({
        target: target('set_data'),
        arguments: [tx.objectRef(ref), tx.pure.vector('u8', Array.from(blob))],
      });
      const response = await execute(tx, blob.length);
      const mutated = (response.objectChanges ?? []).find(
        (change) => change.type === 'mutated' && change.objectId === ref.objectId,
      );
      return mutated
        ? { objectId: mutated.objectId, version: mutated.version, digest: mutated.digest }
        : ref;
    },

    /// Delete one object, based on the exact version in `ref`.
    async remove(ref) {
      const tx = new Transaction();
      tx.moveCall({ target: target('destroy'), arguments: [tx.objectRef(ref)] });
      await execute(tx);
    },
  };
}

/// Serialize and encrypt one content object. Exported because the legacy
/// migration builds its own multi-call transaction.
export async function encryptContent(seed, content) {
  const plaintext = new TextEncoder().encode(JSON.stringify(content));
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  return encryptData(seed, nonce, plaintext);
}

/// Blob-object BCS: id (32 bytes) || vector<u8> data (uleb length + bytes).
/// Both TodoItem and Recipe are declared as exactly `{ id, data }`, which is
/// what makes one decoder enough — adding a field to either struct breaks
/// this.
export function decodeBlobData(object) {
  const bytes = fromBase64(object.bcs.bcsBytes);
  const [length, offset] = readUleb128(bytes, 32);
  return bytes.slice(offset, offset + length);
}

function readUleb128(bytes, offset) {
  let value = 0;
  let shift = 0;
  for (;;) {
    const byte = bytes[offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [value, offset];
    shift += 7;
  }
}

/// Max timestamp of the given transactions; tolerates lookup failures.
async function latestTimestamp(client, digests) {
  if (!digests.length) return null;
  try {
    const blocks = await client.multiGetTransactionBlocks({ digests, options: {} });
    const times = blocks.map((b) => Number(b.timestampMs ?? 0)).filter(Boolean);
    return times.length ? Math.max(...times) : null;
  } catch (error) {
    console.warn('could not resolve object timestamps', error);
    return null;
  }
}

/// True for the on-chain failure that means "someone changed this object (or
/// raced you for gas) since you read it".
export function isVersionConflict(error) {
  const message = `${error?.message ?? error}`;
  return (
    message.includes('is not available for consumption') ||
    message.includes('ObjectVersionUnavailableForConsumption') ||
    message.includes('not available for consumption')
  );
}
