// Edit history, reconstructed from the chain: recent account transactions
// that touched TodoItem objects, with each touched object's before/after
// versions fetched, decrypted, and diffed into human-readable lines.
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';

import { decryptData } from '../wallet.js';
import { decodeItemData } from './items.js';

/// Returns [{ digest, timestampMs, lines: [string] }], newest first.
export async function fetchHistory({
  client,
  seed,
  accountAddress,
  packageId,
  legacyPackageId,
  limit = 20,
}) {
  const owner = normalizeIotaAddress(accountAddress);
  const page = await client.queryTransactionBlocks({
    filter: { FromAddress: owner },
    options: { showObjectChanges: true, showEffects: true },
    limit,
    order: 'descending',
  });

  const itemType = `${packageId}::todo_item::TodoItem`;
  const legacyType = `${legacyPackageId}::todo_store::TodoStore`;

  // Pass 1: collect the (objectId, version) pairs whose contents we need.
  const wanted = new Map(); // "id@version" -> {objectId, version}
  const want = (objectId, version) => {
    if (version == null) return null;
    const key = `${objectId}@${version}`;
    wanted.set(key, { objectId, version: String(version) });
    return key;
  };

  const transactions = [];
  for (const tx of page.data) {
    const changes = (tx.objectChanges ?? []).filter((c) => c.objectType === itemType);
    const legacyTouched = (tx.objectChanges ?? []).some((c) => c.objectType === legacyType);
    if (!changes.length && !legacyTouched) continue;

    const previousVersion = new Map(
      (tx.effects?.modifiedAtVersions ?? []).map((m) => [m.objectId, m.sequenceNumber]),
    );
    const ops = changes.map((change) => ({
      kind: change.type,
      before:
        change.type === 'created' ? null : want(change.objectId, previousVersion.get(change.objectId)),
      after: change.type === 'deleted' ? null : want(change.objectId, change.version),
    }));
    transactions.push({
      digest: tx.digest,
      timestampMs: Number(tx.timestampMs ?? 0),
      ops,
      legacyTouched,
    });
  }

  // Pass 2: fetch and decrypt all needed historical versions in one batch.
  const contents = await fetchPastContents(client, seed, [...wanted.values()]);

  // Pass 3: turn each transaction into description lines.
  for (const tx of transactions) {
    tx.lines = describe(tx, contents);
    delete tx.ops;
  }
  return transactions;
}

async function fetchPastContents(client, seed, wanted) {
  const contents = new Map();
  if (!wanted.length) return contents;
  try {
    // Not wrapped by the TS SDK yet — raw JSON-RPC call.
    const results = await client.call('iota_tryMultiGetPastObjects', [
      wanted,
      { showBcs: true },
    ]);
    for (let i = 0; i < results.length; i++) {
      const key = `${wanted[i].objectId}@${wanted[i].version}`;
      if (results[i].status !== 'VersionFound') continue;
      try {
        const blob = decodeItemData(results[i].details);
        contents.set(key, JSON.parse(new TextDecoder().decode(await decryptData(seed, blob))));
      } catch (error) {
        console.warn(`cannot decode past object ${key}`, error);
      }
    }
  } catch (error) {
    console.warn('past-object lookup failed; history will lack details', error);
  }
  return contents;
}

function describe(tx, contents) {
  const lines = [];
  for (const op of tx.ops) {
    const before = op.before ? contents.get(op.before) : null;
    const after = op.after ? contents.get(op.after) : null;
    if (op.kind === 'created') {
      lines.push(
        after
          ? `＋ created “${after.title}”` +
              (after.subs?.length ? ` with ${after.subs.length} subitem(s)` : '')
          : '＋ created an item',
      );
    } else if (op.kind === 'deleted') {
      lines.push(before ? `✕ deleted “${before.title}”` : '✕ deleted an item');
    } else {
      lines.push(...diffContents(before, after));
    }
  }
  if (!lines.length && tx.legacyTouched) lines.push('migrated legacy list storage');
  return lines;
}

function diffContents(before, after) {
  if (!before || !after) return ['edited an item (details no longer available)'];
  const lines = [];
  const title = after.title;
  if (before.title !== after.title) lines.push(`renamed “${before.title}” → “${after.title}”`);
  if (before.done !== after.done) {
    lines.push(after.done ? `☑ completed “${title}”` : `☐ reopened “${title}”`);
  }

  const beforeSubs = new Map((before.subs ?? []).map((s) => [s.id, s]));
  const afterSubs = new Map((after.subs ?? []).map((s) => [s.id, s]));
  for (const [id, sub] of afterSubs) {
    const old = beforeSubs.get(id);
    if (!old) {
      lines.push(`＋ added “${sub.text}” under “${title}”`);
    } else {
      if (old.text !== sub.text) lines.push(`renamed subitem “${old.text}” → “${sub.text}”`);
      if (old.done !== sub.done) {
        lines.push(sub.done ? `☑ completed “${sub.text}”` : `☐ reopened “${sub.text}”`);
      }
    }
  }
  for (const [id, old] of beforeSubs) {
    if (!afterSubs.has(id)) lines.push(`✕ removed “${old.text}” from “${title}”`);
  }

  if (!lines.length) lines.push(`touched “${title}” (no visible change)`);
  return lines;
}
