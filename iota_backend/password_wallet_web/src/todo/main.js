import { normalizeIotaAddress } from '@iota/iota-sdk/utils';

import { fetchAccountPublicKey, makeClient } from '../chain.js';
import { loadSettings } from '../config.js';
import { offerPasswordSave } from '../password-save.js';
import { deriveSeed, publicKey } from '../wallet.js';
import {
  createItem,
  deleteItem,
  fetchGasNanos,
  fetchItems,
  isVersionConflict,
  migrateLegacyStore,
  newItemContent,
  updateItem,
} from './items.js';

const $ = (id) => document.getElementById(id);
const logEl = $('log');

function log(message) {
  logEl.textContent += `${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// --- session state -----------------------------------------------------------

const settings = loadSettings();
const params = new URLSearchParams(location.search);
const accountParam = params.get('account');
const username = params.get('username');

const session = {
  client: null,
  seed: null,
  accountAddress: null,
  items: [], // [{ ref: {objectId, version, digest}, content: {title, done, order, subs} }]
  gasNanos: null,
  lastUpdatedMs: null,
  lastRefreshedMs: null,
};

if (!accountParam || !username) {
  $('unlock-info').textContent =
    'Missing URL parameters — open this page as todo.html?account=0x…&username=…';
  $('unlock-btn').disabled = true;
} else {
  session.accountAddress = normalizeIotaAddress(accountParam);
  $('unlock-info').textContent = `account ${shorten(session.accountAddress)}`;
  $('unlock-username').value = username;
}

function chainArgs() {
  return {
    client: session.client,
    seed: session.seed,
    accountAddress: session.accountAddress,
    packageId: settings.todoItemPackageId,
    log,
  };
}

// --- unlock ------------------------------------------------------------------

$('unlock-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run($('unlock-btn'), async () => {
    const password = $('unlock-password').value;
    if (!password) throw new Error('password is required');

    log(`deriving key for "${username}" (Argon2id, ~1 s)…`);
    const seed = await deriveSeed(password, username);

    const client = makeClient(settings.nodeUrl);

    // Cheap wrong-password check against the on-chain pubkey, before any tx.
    const onChainPubkey = await fetchAccountPublicKey(client, session.accountAddress);
    if (onChainPubkey) {
      const derived = await publicKey(seed);
      if (!bytesEqual(derived, onChainPubkey)) {
        seed.fill(0);
        throw new Error('wrong password (public key mismatch)');
      }
      log('password verified against on-chain public key');
    } else {
      log('⚠ could not read the account public key — proceeding without verification');
    }

    session.client = client;
    session.seed = seed;

    await migrateLegacyStore({
      ...chainArgs(),
      legacyPackageId: settings.legacyTodoPackageId,
    });

    log('loading todo items…');
    await refreshAll();
    log(`loaded ${countItems(session.items)} item(s)`);

    await offerPasswordSave(username, password);
    $('unlock-section').hidden = true;
    $('todo-section').hidden = false;
    $('unlock-password').value = '';
    render();
  });
});

// --- mutations ---------------------------------------------------------------

// Writes are serialized: two of our own transactions in flight at once would
// race each other for the account's gas coin.
let writeQueue = Promise.resolve();
let queuedWrites = 0;

function enqueue(task) {
  queuedWrites += 1;
  writeQueue = writeQueue.then(task, task).finally(() => {
    queuedWrites -= 1;
  });
  return writeQueue;
}

// Warn before closing the tab while edits are still syncing to chain —
// whatever hasn't been submitted yet would be lost silently.
window.addEventListener('beforeunload', (event) => {
  if (queuedWrites > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
});

/// Reload items, their last-modified time, and the gas balance from chain.
async function refreshAll() {
  const { items, lastUpdatedMs } = await fetchItems(chainArgs());
  session.items = items;
  session.lastUpdatedMs = lastUpdatedMs;
  session.gasNanos = await fetchGasNanos(session.client, session.accountAddress);
  session.lastRefreshedMs = Date.now();
  render();
  updateStatus();
}

/// After a confirmed write: bump the update clock and the gas readout.
async function afterWriteSync() {
  session.lastUpdatedMs = Date.now();
  try {
    session.gasNanos = await fetchGasNanos(session.client, session.accountAddress);
  } catch (error) {
    console.warn('balance refresh failed', error);
  }
  updateStatus();
}

async function refetchAfterConflict() {
  log('the list changed on-chain (someone else edited it?) — reloading…');
  await refreshAll();
  log('reloaded — please repeat your last action if still wanted.');
}

$('refresh-btn').addEventListener('click', () => {
  run($('refresh-btn'), refreshAll);
});

$('add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = $('add-text').value.trim();
  if (!title) return;
  $('add-text').value = '';

  // Optimistic row with no ref yet; replaced by the confirmed item.
  const draft = { ref: null, content: newItemContent(title) };
  session.items.push(draft);
  render();

  run(null, () =>
    enqueue(async () => {
      try {
        const confirmed = await createItem({ ...chainArgs(), content: draft.content });
        replaceItem(draft, confirmed);
        await afterWriteSync();
      } catch (error) {
        session.items = session.items.filter((item) => item !== draft);
        render();
        throw error;
      }
    }),
  );
});

/// Apply `change` to a copy of the item's content and persist it against the
/// exact object version we read. On a version conflict the change is rolled
/// back and the list reloaded — the other writer's action wins, the user
/// re-applies theirs by clicking again.
function mutateItem(item, change) {
  if (!item.ref) return; // still being created — ignore clicks until confirmed
  const previous = item.content;
  const next = structuredClone(previous);
  change(next);
  item.content = next;
  render();

  run(null, () =>
    enqueue(async () => {
      try {
        const confirmed = await updateItem({ ...chainArgs(), item: { ref: item.ref, content: next } });
        item.ref = confirmed.ref;
        await afterWriteSync();
      } catch (error) {
        // Roll the display back only if this was the item's newest state —
        // a later queued edit includes this change and will write it anyway.
        if (item.content === next) {
          item.content = previous;
          render();
        }
        if (isVersionConflict(error)) {
          await refetchAfterConflict();
          return;
        }
        throw error;
      }
    }),
  );
}

function removeItem(item) {
  if (!item.ref) return;
  if (item.content.subs.length > 0) {
    log('this item still has subitems — remove them first');
    return;
  }
  const index = session.items.indexOf(item);
  session.items = session.items.filter((other) => other !== item);
  render();

  run(null, () =>
    enqueue(async () => {
      try {
        await deleteItem({ ...chainArgs(), item });
        await afterWriteSync();
      } catch (error) {
        session.items.splice(index, 0, item);
        render();
        if (isVersionConflict(error)) {
          await refetchAfterConflict();
          return;
        }
        throw error;
      }
    }),
  );
}

function replaceItem(draft, confirmed) {
  const index = session.items.indexOf(draft);
  if (index >= 0) session.items[index] = confirmed;
  render();
}

// --- rendering -----------------------------------------------------------------

// Unsent "add subitem" input text, preserved across re-renders.
const subDrafts = new Map();

// In-progress text edit: { key, value } — key identifies the row.
let editState = null;

function render() {
  const listEl = $('todo-list');
  // If the user is typing in (or just submitted) an add-subitem row, keep
  // that input focused across the DOM rebuild — makes rapid entry painless.
  const focusItemId = document.activeElement?.closest?.('.add-sub')?.dataset.itemId;
  listEl.replaceChildren();

  // Top-level items alphabetically (numeric-aware, so "2." sorts before
  // "10."); the user orders lists with title prefixes like "1.", "2.".
  const items = [...session.items].sort((a, b) =>
    a.content.title.localeCompare(b.content.title, undefined, { numeric: true, sensitivity: 'base' }),
  );

  for (const item of items) {
    const content = item.content;
    const itemKey = item.ref?.objectId ?? 'draft';
    listEl.appendChild(
      renderRow(
        {
          text: content.title,
          done: content.done,
          pending: !item.ref,
          removeBlocked: content.subs.length > 0,
          editKey: itemKey,
        },
        () => mutateItem(item, (c) => (c.done = !c.done)),
        () => removeItem(item),
        (text) => mutateItem(item, (c) => (c.title = text)),
      ),
    );

    // Open subitems, then the inline add-entry, then the completed ones.
    const renderSub = (sub) =>
      listEl.appendChild(
        renderRow(
          { text: sub.text, done: sub.done, pending: !item.ref, editKey: `${itemKey}/${sub.id}` },
          () =>
            mutateItem(item, (c) => {
              const target = c.subs.find((s) => s.id === sub.id);
              if (target) target.done = !target.done;
            }),
          () => mutateItem(item, (c) => (c.subs = c.subs.filter((s) => s.id !== sub.id))),
          (text) =>
            mutateItem(item, (c) => {
              const target = c.subs.find((s) => s.id === sub.id);
              if (target) target.text = text;
            }),
          true,
        ),
      );

    content.subs.filter((s) => !s.done).forEach(renderSub);
    if (item.ref) listEl.appendChild(renderAddSubRow(item));
    content.subs.filter((s) => s.done).forEach(renderSub);
  }

  if (focusItemId) {
    listEl.querySelector(`.add-sub[data-item-id="${focusItemId}"] input`)?.focus();
  }
  if (editState) {
    const editInput = listEl.querySelector(`input[data-edit-key="${editState.key}"]`);
    if (editInput) {
      editInput.focus();
      editInput.setSelectionRange(editInput.value.length, editInput.value.length);
    }
  }
}

function renderRow(entry, onToggle, onRemove, onEditSave, isSub = false) {
  const li = document.createElement('li');
  li.className = `${isSub ? 'sub' : ''} ${entry.done ? 'done' : ''} ${entry.pending ? 'pending' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = entry.done;
  checkbox.addEventListener('change', onToggle);
  li.appendChild(checkbox);

  if (editState?.key === entry.editKey) {
    li.appendChild(renderEditInput(entry, onEditSave));
  } else {
    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = entry.text;
    li.appendChild(text);

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.textContent = '✎';
    editBtn.title = 'edit text';
    editBtn.addEventListener('click', () => {
      editState = { key: entry.editKey, value: entry.text };
      render();
    });
    li.appendChild(editBtn);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'icon-btn';
  removeBtn.textContent = '✕';
  if (entry.removeBlocked) {
    removeBtn.disabled = true;
    removeBtn.title = 'remove all subitems first';
  } else {
    removeBtn.title = 'delete';
    removeBtn.addEventListener('click', onRemove);
  }
  li.appendChild(removeBtn);

  return li;
}

/// Inline editor replacing the row text: Enter or blur saves, Escape cancels.
function renderEditInput(entry, onEditSave) {
  const input = document.createElement('input');
  input.className = 'edit-input';
  input.value = editState.value;
  input.dataset.editKey = entry.editKey;
  input.addEventListener('input', () => (editState.value = input.value));

  const finish = (save) => {
    if (!editState) return;
    const text = editState.value.trim();
    editState = null;
    if (save && text && text !== entry.text) onEditSave(text);
    else render();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  return input;
}

/// The trailing row of each subitem group: an inline "add subitem" entry.
function renderAddSubRow(item) {
  const key = item.ref.objectId;

  const li = document.createElement('li');
  li.className = 'sub add-sub';
  li.dataset.itemId = key;

  const plus = document.createElement('span');
  plus.className = 'plus';
  plus.textContent = '+';
  li.appendChild(plus);

  const form = document.createElement('form');
  const input = document.createElement('input');
  input.placeholder = 'add subitem…';
  input.autocomplete = 'off';
  input.value = subDrafts.get(key) ?? '';
  input.addEventListener('input', () => subDrafts.set(key, input.value));
  form.appendChild(input);
  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.className = 'add-sub-btn';
  addBtn.textContent = 'Add';
  form.appendChild(addBtn);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    subDrafts.delete(key);
    mutateItem(item, (c) => c.subs.push({ id: crypto.randomUUID(), text, done: false }));
  });
  li.appendChild(form);

  return li;
}

// --- helpers -------------------------------------------------------------------

let pending = 0;
let failed = false;

async function run(button, task) {
  if (button) button.disabled = true;
  pending += 1;
  failed = false; // a new attempt supersedes any previous error badge
  setSyncBadge('spinning');
  try {
    await task();
  } catch (error) {
    console.error(error);
    log(`❌ ${error.message ?? error}`);
    failed = true;
  } finally {
    if (button) button.disabled = false;
    pending -= 1;
    if (pending === 0) setSyncBadge(failed ? 'error' : 'hidden');
  }
}

/// Corner badge states: spinning = work in flight; error = "last action
/// failed — tap to inspect the log, or just keep editing"; hidden = all good.
function setSyncBadge(state) {
  const badge = $('sync-spinner');
  badge.hidden = state === 'hidden';
  badge.classList.toggle('error', state === 'error');
  badge.textContent = state === 'error' ? '!' : '⟳';
  badge.title =
    state === 'error' ? 'last action failed — tap to see why' : 'syncing with chain…';
}

$('sync-spinner').addEventListener('click', () => {
  if ($('sync-spinner').classList.contains('error')) {
    logEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
});

const LOW_GAS_NANOS = 1_000_000_000n; // 1 IOTA

function updateStatus() {
  const gasEl = $('gas-status');
  if (session.gasNanos !== null) {
    const iota = Number(session.gasNanos) / 1e9;
    gasEl.textContent = `⛽ ${iota.toFixed(iota < 10 ? 3 : 1)} IOTA`;
    gasEl.classList.toggle('low', session.gasNanos < LOW_GAS_NANOS);
  }
  $('updated-status').textContent = session.lastUpdatedMs
    ? `updated ${formatTime(session.lastUpdatedMs)}`
    : 'no items yet';
  $('refreshed-status').textContent = session.lastRefreshedMs
    ? `refreshed ${formatTime(session.lastRefreshedMs)}`
    : '';
}

function formatTime(ms) {
  const date = new Date(ms);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function countItems(items) {
  return items.reduce((n, item) => n + 1 + item.content.subs.length, 0);
}

function shorten(address) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function bytesEqual(a, b) {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
