// Shared shell for the tabs on todo.html: the chain session, the log pane,
// the corner sync badge, and — the reason this is shared rather than
// per-tab — the single write queue.
//
// Two of the account's own transactions in flight at once race each other for
// its one gas coin, so every write from every tab goes through `enqueue`.
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';

const $ = (id) => document.getElementById(id);
const logEl = $('log');

/// Account-level state. Per-tab data (todo items, recipes) belongs to that
/// tab's module, not here.
export const session = {
  client: null,
  seed: null,
  accountAddress: null,
  gasNanos: null,
};

export function log(message) {
  logEl.textContent += `${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;

  // The games page keeps its log collapsed, which would otherwise hide the
  // one thing worth reading. `run` prefixes failures with ❌. Pages without a
  // collapsible log are unaffected.
  if (String(message).startsWith('❌')) {
    const block = document.getElementById('log-block');
    if (block) block.open = true;
  }
}

// --- write queue ------------------------------------------------------------

let writeQueue = Promise.resolve();
let queuedWrites = 0;

/// Serialize a chain write against every other write in the app.
export function enqueue(task) {
  queuedWrites += 1;
  writeQueue = writeQueue.then(task, task).finally(() => {
    queuedWrites -= 1;
  });
  return writeQueue;
}

// --- unload protection ------------------------------------------------------

const unloadGuards = [];

/// Register a predicate that means "there is unsaved work" — an open recipe
/// editor with edits, for instance. Queued writes are always covered.
export function addUnloadGuard(hasUnsavedWork) {
  unloadGuards.push(hasUnsavedWork);
}

// Warn before closing the tab while edits are still syncing to chain, or
// while an editor holds text that was never submitted — either would be lost
// silently.
window.addEventListener('beforeunload', (event) => {
  if (queuedWrites > 0 || unloadGuards.some((hasUnsavedWork) => hasUnsavedWork())) {
    event.preventDefault();
    event.returnValue = '';
  }
});

// --- busy / error badge -----------------------------------------------------

let pending = 0;
let failed = false;

export async function run(button, task) {
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
  badge.title = state === 'error' ? 'last action failed — tap to see why' : 'syncing with chain…';
}

$('sync-spinner').addEventListener('click', () => {
  if ($('sync-spinner').classList.contains('error')) {
    logEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
});

// --- account balance --------------------------------------------------------

/// Refresh the account's IOTA balance into `session.gasNanos`. Called after
/// every confirmed write, from whichever tab made it, so the readout stays
/// honest. Failures are non-fatal: a stale balance must not break a write.
export async function refreshGas() {
  try {
    const balance = await session.client.getBalance({
      owner: normalizeIotaAddress(session.accountAddress),
    });
    session.gasNanos = BigInt(balance.totalBalance);
  } catch (error) {
    console.warn('balance refresh failed', error);
  }
  return session.gasNanos;
}

// --- formatting -------------------------------------------------------------

export function formatTime(ms) {
  const date = new Date(ms);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function shorten(address) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function trimZeros(fixed) {
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}
