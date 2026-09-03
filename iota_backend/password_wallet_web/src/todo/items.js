// Todo-specific storage: the content schema and the one-off migration from
// the retired whole-list TodoStore. The chain plumbing lives in
// `app/blobStore.js`, shared with recipes.
import { Transaction } from '@iota/iota-sdk/transactions';
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';

import { decodeBlobData, encryptContent, makeBlobStore } from '../app/blobStore.js';
import { gasBudgetForBytes } from '../app/gas.js';
import { executeAsAccount } from '../chain.js';
import { decryptData } from '../wallet.js';
import { ITEM_FORMAT_VERSION } from './content.js';

export const TODO_MODULE = 'todo_item';
export const TODO_STRUCT = 'TodoItem';

export function itemType(packageId) {
  return `${packageId}::${TODO_MODULE}::${TODO_STRUCT}`;
}

/// A store over TodoItem objects, plus todo-specific ordering.
export function makeItemStore(config) {
  const store = makeBlobStore({ ...config, module: TODO_MODULE, struct: TODO_STRUCT });
  return {
    ...store,
    async fetchItems() {
      const { entries, lastUpdatedMs } = await store.fetchAll();
      entries.sort((a, b) => (a.content.order ?? 0) - (b.content.order ?? 0));
      return { items: entries, lastUpdatedMs };
    },
  };
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
  const blob = decodeBlobData(object);
  let items = [];
  if (blob.length > 0) {
    const legacy = JSON.parse(new TextDecoder().decode(await decryptData(seed, blob)));
    items = legacy.items ?? [];
  }

  const tx = new Transaction();
  let order = Date.now();
  // One transaction creates every item, so it is budgeted for their combined
  // size rather than for a single blob.
  let totalBytes = 0;
  for (const item of items) {
    const content = {
      v: ITEM_FORMAT_VERSION,
      title: item.text,
      done: item.done,
      order: order++,
      subs: item.subs ?? [],
    };
    const encrypted = await encryptContent(seed, content);
    totalBytes += encrypted.length;
    tx.moveCall({
      target: `${packageId}::${TODO_MODULE}::create`,
      arguments: [tx.pure.vector('u8', Array.from(encrypted))],
    });
  }
  tx.moveCall({
    target: `${legacyPackageId}::todo_store::destroy`,
    arguments: [
      tx.objectRef({ objectId: object.objectId, version: object.version, digest: object.digest }),
    ],
  });
  await executeAsAccount({
    client,
    seed,
    accountAddress,
    tx,
    log,
    gasBudget: gasBudgetForBytes(totalBytes),
  });
  log(`migrated ${items.length} item(s); legacy storage destroyed`);
  return true;
}
