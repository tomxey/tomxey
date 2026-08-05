import { normalizeIotaAddress } from '@iota/iota-sdk/utils';

import { fetchAccountPublicKey, makeClient } from '../chain.js';
import { loadSettings } from '../config.js';
import { offerPasswordSave } from '../password-save.js';
import { deriveSeed, publicKey } from '../wallet.js';
import {
  createItem,
  deleteItem,
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
    session.items = await fetchItems(chainArgs());
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

function enqueue(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

async function refetchAfterConflict() {
  log('the list changed on-chain (someone else edited it?) — reloading…');
  session.items = await fetchItems(chainArgs());
  render();
  log('reloaded — please repeat your last action if still wanted.');
}

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
  const index = session.items.indexOf(item);
  session.items = session.items.filter((other) => other !== item);
  render();

  run(null, () =>
    enqueue(async () => {
      try {
        await deleteItem({ ...chainArgs(), item });
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
    listEl.appendChild(
      renderRow(
        { text: content.title, done: content.done, pending: !item.ref },
        () => mutateItem(item, (c) => (c.done = !c.done)),
        () => removeItem(item),
      ),
    );

    // Open subitems, then the inline add-entry, then the completed ones.
    const renderSub = (sub) =>
      listEl.appendChild(
        renderRow(
          { text: sub.text, done: sub.done, pending: !item.ref },
          () =>
            mutateItem(item, (c) => {
              const target = c.subs.find((s) => s.id === sub.id);
              if (target) target.done = !target.done;
            }),
          () => mutateItem(item, (c) => (c.subs = c.subs.filter((s) => s.id !== sub.id))),
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
}

function renderRow(entry, onToggle, onRemove, isSub = false) {
  const li = document.createElement('li');
  li.className = `${isSub ? 'sub' : ''} ${entry.done ? 'done' : ''} ${entry.pending ? 'pending' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = entry.done;
  checkbox.addEventListener('change', onToggle);
  li.appendChild(checkbox);

  const text = document.createElement('span');
  text.className = 'todo-text';
  text.textContent = entry.text;
  li.appendChild(text);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'icon-btn';
  removeBtn.textContent = '✕';
  removeBtn.title = 'delete';
  removeBtn.addEventListener('click', onRemove);
  li.appendChild(removeBtn);

  return li;
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

async function run(button, task) {
  if (button) button.disabled = true;
  pending += 1;
  document.querySelector('main').classList.add('busy');
  $('busy').hidden = false;
  try {
    await task();
  } catch (error) {
    console.error(error);
    log(`❌ ${error.message ?? error}`);
  } finally {
    if (button) button.disabled = false;
    pending -= 1;
    if (pending === 0) {
      document.querySelector('main').classList.remove('busy');
      $('busy').hidden = true;
    }
  }
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
