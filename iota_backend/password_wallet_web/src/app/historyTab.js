// The History tab view: paging through reconstructed edit history and
// rendering it. Kind-specific wording comes from the describers registered in
// `kinds`.
import { fetchHistory } from './history.js';
import { formatTime, run, session, trimZeros } from './shell.js';

const $ = (id) => document.getElementById(id);

/// `client` is the history client — the indexer endpoint when configured,
/// since it serves FromOrToAddress with archival fallback (unlimited depth).
export function createHistoryTab({ client, kinds, legacyType, network }) {
  const state = { entries: [], cursor: null, hasMore: false };

  async function activate() {
    state.entries = [];
    state.cursor = null;
    state.hasMore = false;
    $('history-list').textContent = 'loading…';
    await loadPage();
  }

  /// Fetch pages (keeping the cursor) until at least one new visible entry
  /// turns up or the history is exhausted — a raw page may contain only
  /// irrelevant transactions, which would make "load more" look like a no-op.
  async function loadPage() {
    for (let attempts = 0; attempts < 5; attempts++) {
      const page = await fetchHistory({
        client,
        seed: session.seed,
        accountAddress: session.accountAddress,
        kinds,
        legacyType,
        cursor: state.cursor,
      });
      state.entries.push(...page.transactions);
      state.cursor = page.nextCursor;
      state.hasMore = page.hasNextPage;
      if (page.transactions.length > 0 || !page.hasNextPage) break;
    }
    render();
    $('history-more').hidden = !state.hasMore;
  }

  function render() {
    const listEl = $('history-list');
    listEl.replaceChildren();
    if (!state.entries.length) {
      listEl.textContent = 'no list-related transactions found';
      return;
    }
    for (const tx of state.entries) {
      listEl.appendChild(renderEntry(tx));
    }
  }

  function renderEntry(tx) {
    const entry = document.createElement('div');
    entry.className = 'hx';

    const time = document.createElement('div');
    time.className = 'hx-time';
    const link = document.createElement('a');
    link.href = `https://explorer.iota.org/txblock/${tx.digest}?network=${network}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = tx.digest.slice(0, 10) + '…';
    time.append(tx.timestampMs ? `${formatTime(tx.timestampMs)} · ` : '', link);
    if (tx.balanceNanos !== 0n) {
      const cost = document.createElement('span');
      const iota = Number(tx.balanceNanos) / 1e9;
      cost.textContent = ` · ${iota > 0 ? '+' : ''}${trimZeros(iota.toFixed(6))} IOTA`;
      cost.title = 'account balance change (gas − storage rebate)';
      time.appendChild(cost);
    }
    entry.appendChild(time);

    const lines = document.createElement('ul');
    for (const text of tx.lines) {
      const li = document.createElement('li');
      li.textContent = text;
      lines.appendChild(li);
    }
    entry.appendChild(lines);
    return entry;
  }

  $('history-more').addEventListener('click', () => {
    run($('history-more'), loadPage);
  });

  return { activate };
}
