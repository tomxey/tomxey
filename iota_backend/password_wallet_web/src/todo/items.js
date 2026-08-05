// On-chain persistence: one TodoItem object per top-level item, each holding
// an encrypted blob of `{v, title, done, order, subs}`. Updates and deletes
// reference the exact object version the UI read (`tx.objectRef`), so a
// racing edit by another device fails on-chain instead of overwriting —
// owned-object versioning doubles as compare-and-swap.
import { Transaction } from '@iota/iota-sdk/transactions';
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';
import { fromBase64 } from '@iota/bcs';

import { executeAsAccount } from '../chain.js';
import { decryptData, encryptData } from '../wallet.js';

const ITEM_FORMAT_VERSION = 1;

function itemType(packageId) {
  return `${packageId}::todo_item::TodoItem`;
}

/// Fetch and decrypt all items. Returns { items: [{ ref, content }],
/// lastUpdatedMs } — the timestamp of the most recent transaction that
/// touched any current item (from any device), or null if there are none.
export async function fetchItems({ client, seed, accountAddress, packageId }) {
  const owner = normalizeIotaAddress(accountAddress);
  const items = [];
  const txDigests = new Set();
  let cursor = null;
  do {
    const page = await client.getOwnedObjects({
      owner,
      cursor,
      filter: { StructType: itemType(packageId) },
      options: { showBcs: true, showPreviousTransaction: true },
    });
    for (const entry of page.data) {
      const object = entry.data;
      const blob = decodeItemData(object);
      const content = JSON.parse(new TextDecoder().decode(await decryptData(seed, blob)));
      items.push({
        ref: { objectId: object.objectId, version: object.version, digest: object.digest },
        content,
      });
      if (object.previousTransaction) txDigests.add(object.previousTransaction);
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  items.sort((a, b) => (a.content.order ?? 0) - (b.content.order ?? 0));
  return { items, lastUpdatedMs: await latestTimestamp(client, [...txDigests]) };
}

/// Max timestamp of the given transactions; tolerates lookup failures.
async function latestTimestamp(client, digests) {
  if (!digests.length) return null;
  try {
    const blocks = await client.multiGetTransactionBlocks({ digests, options: {} });
    const times = blocks.map((b) => Number(b.timestampMs ?? 0)).filter(Boolean);
    return times.length ? Math.max(...times) : null;
  } catch (error) {
    console.warn('could not resolve item timestamps', error);
    return null;
  }
}

/// The account's IOTA balance in nanos.
export async function fetchGasNanos(client, accountAddress) {
  const balance = await client.getBalance({ owner: normalizeIotaAddress(accountAddress) });
  return BigInt(balance.totalBalance);
}

/// TodoItem BCS: id (32 bytes) || vector<u8> data (uleb length + bytes).
export function decodeItemData(object) {
  const bytes = fromBase64(object.bcs.bcsBytes);
  let [length, offset] = readUleb128(bytes, 32);
  return bytes.slice(offset, offset + length);
}

function readUleb128(bytes, offset) {
  let value = 0;
  let shift = 0;
  while (true) {
    const byte = bytes[offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [value, offset];
    shift += 7;
  }
}

export function newItemContent(title) {
  return {
    v: ITEM_FORMAT_VERSION,
    title,
    done: false,
    order: Date.now(),
    subs: [],
  };
}

async function encryptContent(seed, content) {
  const plaintext = new TextEncoder().encode(JSON.stringify(content));
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  return encryptData(seed, nonce, plaintext);
}

/// Create a new item; returns its {ref, content} (ref from the tx effects, so
/// no follow-up query is needed).
export async function createItem({ client, seed, accountAddress, packageId, content, log }) {
  const blob = await encryptContent(seed, content);
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::todo_item::create`,
    arguments: [tx.pure.vector('u8', Array.from(blob))],
  });
  const response = await executeAsAccount({ client, seed, accountAddress, tx, log });
  const created = (response.objectChanges ?? []).find(
    (change) => change.type === 'created' && change.objectType === itemType(packageId),
  );
  if (!created) throw new Error('created todo item not found in effects');
  return {
    ref: { objectId: created.objectId, version: created.version, digest: created.digest },
    content,
  };
}

/// Overwrite one item, based on the exact version in `item.ref`. Throws (and
/// changes nothing) if the item changed on-chain since it was read. Returns
/// the item with its ref advanced to the new version.
export async function updateItem({ client, seed, accountAddress, packageId, item, log }) {
  const blob = await encryptContent(seed, item.content);
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::todo_item::set_data`,
    arguments: [tx.objectRef(item.ref), tx.pure.vector('u8', Array.from(blob))],
  });
  const response = await executeAsAccount({ client, seed, accountAddress, tx, log });
  const mutated = (response.objectChanges ?? []).find(
    (change) => change.type === 'mutated' && change.objectId === item.ref.objectId,
  );
  return {
    ref: mutated
      ? { objectId: mutated.objectId, version: mutated.version, digest: mutated.digest }
      : item.ref,
    content: item.content,
  };
}

/// Delete one item, based on the exact version in `item.ref`.
export async function deleteItem({ client, seed, accountAddress, packageId, item, log }) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::todo_item::destroy`,
    arguments: [tx.objectRef(item.ref)],
  });
  await executeAsAccount({ client, seed, accountAddress, tx, log });
}

/// True for the on-chain failure that means "someone changed this item (or
/// raced you for gas) since you read it".
export function isVersionConflict(error) {
  const message = `${error?.message ?? error}`;
  return (
    message.includes('is not available for consumption') ||
    message.includes('ObjectVersionUnavailableForConsumption') ||
    message.includes('not available for consumption')
  );
}

// --- migration from the legacy whole-list TodoStore -------------------------

/// If the account still has a legacy TodoStore, convert it: one `create` per
/// top-level item plus `destroy` of the store, all in a single atomic
/// transaction. Returns true if a migration ran.
export async function migrateLegacyStore({
  client,
  seed,
  accountAddress,
  packageId,
  legacyPackageId,
  log,
}) {
  const response = await client.getOwnedObjects({
    owner: normalizeIotaAddress(accountAddress),
    filter: { StructType: `${legacyPackageId}::todo_store::TodoStore` },
    options: { showBcs: true },
  });
  const object = response.data[0]?.data;
  if (!object) return false;

  log('legacy whole-list storage found — migrating to per-item objects…');
  const blob = decodeItemData(object);
  let items = [];
  if (blob.length > 0) {
    const legacy = JSON.parse(new TextDecoder().decode(await decryptData(seed, blob)));
    items = legacy.items ?? [];
  }

  const tx = new Transaction();
  let order = Date.now();
  for (const item of items) {
    const content = {
      v: ITEM_FORMAT_VERSION,
      title: item.text,
      done: item.done,
      order: order++,
      subs: item.subs ?? [],
    };
    const encrypted = await encryptContent(seed, content);
    tx.moveCall({
      target: `${packageId}::todo_item::create`,
      arguments: [tx.pure.vector('u8', Array.from(encrypted))],
    });
  }
  tx.moveCall({
    target: `${legacyPackageId}::todo_store::destroy`,
    arguments: [
      tx.objectRef({ objectId: object.objectId, version: object.version, digest: object.digest }),
    ],
  });
  await executeAsAccount({ client, seed, accountAddress, tx, log });
  log(`migrated ${items.length} item(s); legacy storage destroyed`);
  return true;
}
