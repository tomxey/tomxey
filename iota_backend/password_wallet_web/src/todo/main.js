// The todo items tab: rendering, optimistic mutations, and the status bar.
// Chain access comes in as a store (`app/blobStore.js`); the write queue,
// logging and busy badge come from the shell.
import { enqueue, formatTime, log, refreshGas, run, session } from '../app/shell.js';
import { isVersionConflict } from '../app/blobStore.js';
import { MAX_PAYLOAD_BYTES, payloadBytes } from '../app/payload.js';
import { appendSubitems, newItemContent } from './content.js';

const $ = (id) => document.getElementById(id);

const LOW_GAS_NANOS = 1_000_000_000n; // 1 IOTA

// Top-level items sort alphabetically but numeric-aware, so "2." precedes
// "10." for titles that carry a numeric prefix.
const byTitle = (a, b) =>
  a.content.title.localeCompare(b.content.title, undefined, {
    numeric: true,
    sensitivity: 'base',
  });

/// Wire up the items tab. `store` is a todo item store; `onWrite` is called
/// after every confirmed write so the page can refresh shared readouts.
export function createTodoTab({ store }) {
  // [{ ref: {objectId, version, digest} | null, content: {title, done, order, subs} }]
  let items = [];
  let lastUpdatedMs = null;
  let lastRefreshedMs = null;

  // Unsent "add subitem" input text, preserved across re-renders.
  const subDrafts = new Map();
  // In-progress text edit: { key, value } — key identifies the row.
  let editState = null;

  /// Reload items, their last-modified time, and the gas balance from chain.
  async function refreshAll() {
    const loaded = await store.fetchItems();
    items = loaded.items;
    lastUpdatedMs = loaded.lastUpdatedMs;
    await refreshGas();
    lastRefreshedMs = Date.now();
    render();
    updateStatus();
  }

  /// After a confirmed write: bump the update clock and the gas readout.
  async function afterWriteSync() {
    lastUpdatedMs = Date.now();
    await refreshGas();
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
    items.push(draft);
    render();

    run(null, () =>
      enqueue(async () => {
        try {
          const confirmed = await store.create(draft.content);
          const index = items.indexOf(draft);
          if (index >= 0) items[index] = confirmed;
          render();
          await afterWriteSync();
        } catch (error) {
          items = items.filter((item) => item !== draft);
          render();
          throw error;
        }
      }),
    );
  });

  /// Apply `change` to a copy of the item's content and persist it against
  /// the exact object version we read. On a version conflict the change is
  /// rolled back and the list reloaded — the other writer's action wins, the
  /// user re-applies theirs by clicking again.
  ///
  /// Resolves to whether the change actually reached the chain. `run` logs
  /// and swallows failures, so without this a caller could not tell a
  /// successful write from a rolled-back one.
  function mutateItem(item, change) {
    if (!item.ref) return Promise.resolve(false); // still being created
    const previous = item.content;
    const next = structuredClone(previous);
    change(next);

    // Every mutation now shares the blob cap with recipes — a long copied
    // ingredient list is the realistic way a todo item gets near it. Refuse
    // before the display changes, so nothing has to be rolled back.
    const bytes = payloadBytes(next);
    if (bytes > MAX_PAYLOAD_BYTES) {
      log(
        `❌ “${previous.title}” would grow to ${bytes} bytes; the on-chain limit is ${MAX_PAYLOAD_BYTES}. Nothing was changed.`,
      );
      return Promise.resolve(false);
    }

    item.content = next;
    render();

    let applied = false;
    return run(null, () =>
      enqueue(async () => {
        try {
          item.ref = await store.update(item.ref, next);
          applied = true;
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
    ).then(() => applied);
  }

  function removeItem(item) {
    if (!item.ref) return;
    if (item.content.subs.length > 0) {
      log('this item still has subitems — remove them first');
      return;
    }
    const index = items.indexOf(item);
    items = items.filter((other) => other !== item);
    render();

    run(null, () =>
      enqueue(async () => {
        try {
          await store.remove(item.ref);
          await afterWriteSync();
        } catch (error) {
          items.splice(index, 0, item);
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

  // --- rendering ------------------------------------------------------------

  function render() {
    const listEl = $('todo-list');
    // If the user is typing in (or just submitted) an add-subitem row, keep
    // that input focused across the DOM rebuild — makes rapid entry painless.
    const focusItemId = document.activeElement?.closest?.('.add-sub')?.dataset.itemId;
    listEl.replaceChildren();

    const sorted = [...items].sort(byTitle);

    for (const item of sorted) {
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

  function updateStatus() {
    const gasEl = $('gas-status');
    if (session.gasNanos !== null) {
      const iota = Number(session.gasNanos) / 1e9;
      gasEl.textContent = `⛽ ${iota.toFixed(iota < 10 ? 3 : 1)} IOTA`;
      gasEl.classList.toggle('low', session.gasNanos < LOW_GAS_NANOS);
    }
    $('updated-status').textContent = lastUpdatedMs
      ? `updated ${formatTime(lastUpdatedMs)}`
      : 'no items yet';
    $('refreshed-status').textContent = lastRefreshedMs
      ? `refreshed ${formatTime(lastRefreshedMs)}`
      : '';
  }

  /// Confirmed top-level items, in the order the list shows them. These are
  /// what the recipes tab offers as copy targets — an item still being
  /// created has no ref to write against, so it is not offered.
  function topLevelItems() {
    return [...items].filter((item) => item.ref).sort(byTitle);
  }

  /// Append `texts` to `item` as open subitems, in one transaction. Used by
  /// the recipes tab to copy a recipe's ingredients into a chosen item.
  /// Rejects synchronously on the cases the caller should report immediately;
  /// anything else surfaces through the shared log and badge.
  function addSubitems(item, texts) {
    if (!item?.ref) {
      throw new Error('that item is still being created — try again in a moment');
    }
    if (!texts.length) {
      throw new Error('there are no ingredients to copy');
    }

    // Checked here as well as in mutateItem so the caller gets a message
    // naming the destination, before anything is optimistically applied.
    const next = appendSubitems(item.content, texts);
    const bytes = payloadBytes(next);
    if (bytes > MAX_PAYLOAD_BYTES) {
      throw new Error(
        `“${item.content.title}” would grow to ${bytes} bytes, over the ${MAX_PAYLOAD_BYTES} limit — copy into a different item, or split the list`,
      );
    }

    return mutateItem(item, (content) => {
      content.subs = next.subs;
    });
  }

  return {
    refreshAll,
    render,
    topLevelItems,
    addSubitems,
    count: () => items.reduce((n, item) => n + 1 + item.content.subs.length, 0),
  };
}
