// Push updates over a GraphQL subscription, with polling still underneath.
//
// Polling alone means a guess or a brush stroke shows up as much as a poll
// interval late. The node offers a `transactions` subscription filtered by
// package/module/function, so a client can instead be told when something
// touched the game — verified against testnet, including the exact endpoint,
// which is not the GraphQL HTTP URL:
//
//   https://graphql.testnet.iota.cafe        HTTP queries
//   wss://graphql.testnet.iota.cafe/subscriptions   subscriptions
//
// The subprotocol matters too: `graphql-transport-ws`. Connecting to the bare
// host, or to /graphql, closes with 1006 and no reason.
//
// This never becomes the source of truth. A notification only says "look
// again" — the object read that follows is what the UI trusts. That keeps the
// fallback honest: if the socket never connects, or silently dies, or reports
// that it lagged behind and dropped payloads, the poll still gets there.

/// There is no changed-object filter, so this subscribes to the whole module
/// and lets the refresh decide whether anything relevant moved. With a handful
/// of rooms the difference is noise; the alternative — a filter per function —
/// would miss whichever entry point was added next.
export const LIVE_QUERY = `subscription($filter: SubscriptionTransactionFilter) {
  transactions(filter: $filter) {
    ... on TransactionBlock { digest }
    ... on Lagged { __typename }
  }
}`;

/// What a raw socket message means. Pure, so the protocol handling is tested
/// without a network: the message shapes come from the graphql-transport-ws
/// spec and from what the node actually sent back.
export function interpret(raw) {
  let message;
  try {
    message = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { kind: 'ignore' };
  }

  switch (message?.type) {
    case 'connection_ack':
      return { kind: 'ack' };
    // The server may ping; the spec requires a pong or it closes the socket.
    case 'ping':
      return { kind: 'ping' };
    case 'next': {
      const payload = message.payload?.data?.transactions;
      if (message.payload?.errors?.length) {
        return { kind: 'error', message: message.payload.errors[0]?.message ?? 'query rejected' };
      }
      // Lagged means the stream fell behind and payloads were dropped, so the
      // next read has to be a full one rather than an incremental nudge.
      if (payload?.__typename === 'Lagged') return { kind: 'lagged' };
      return { kind: 'change', digest: payload?.digest ?? null };
    }
    case 'error':
      return {
        kind: 'error',
        message: Array.isArray(message.payload)
          ? (message.payload[0]?.message ?? 'subscription error')
          : 'subscription error',
      };
    case 'complete':
      return { kind: 'complete' };
    default:
      return { kind: 'ignore' };
  }
}

/// Capped exponential backoff. A phone that loses signal mid-game must not
/// hammer the node, but must also come back quickly once it has service.
export function backoffMs(attempt) {
  const base = 1000 * 2 ** Math.min(attempt, 5);
  return Math.min(base, 30_000);
}

/// Collapse a burst into one call. Several players guessing at once, or a
/// paint landing beside a guess, would otherwise trigger a refresh each.
export function debounce(fn, waitMs, setTimer = setTimeout, clearTimer = clearTimeout) {
  let handle = null;
  return (...args) => {
    if (handle !== null) clearTimer(handle);
    handle = setTimer(() => {
      handle = null;
      fn(...args);
    }, waitMs);
  };
}

const DEBOUNCE_MS = 250;

/// Open the subscription and keep it open.
///
/// `onChange` is called when something touched the module; `onLive` reports
/// whether the socket is currently up, which the caller uses to decide how
/// hard to keep polling.
export function createLiveUpdates({ url, moduleFilter, onChange, onLive, log }) {
  let socket = null;
  let attempt = 0;
  let closed = false;
  let retry = null;

  const notify = debounce(() => onChange(), DEBOUNCE_MS);

  function connect() {
    if (closed) return;
    try {
      socket = new WebSocket(url, 'graphql-transport-ws');
    } catch (error) {
      log?.(`live updates unavailable: ${error.message ?? error}`);
      onLive?.(false);
      return;
    }

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'connection_init' }));
    });

    socket.addEventListener('message', (event) => {
      const action = interpret(event.data);
      switch (action.kind) {
        case 'ack':
          attempt = 0;
          onLive?.(true);
          socket.send(
            JSON.stringify({
              id: '1',
              type: 'subscribe',
              payload: { query: LIVE_QUERY, variables: { filter: { function: moduleFilter } } },
            }),
          );
          break;
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'change':
          notify();
          break;
        case 'lagged':
          log?.('live updates fell behind — catching up');
          notify();
          break;
        case 'error':
          log?.(`live updates rejected: ${action.message}`);
          onLive?.(false);
          break;
        default:
          break;
      }
    });

    // Both paths land here; polling has been carrying the UI the whole time,
    // so a dead socket costs latency, never correctness.
    const dropped = () => {
      onLive?.(false);
      if (closed) return;
      const wait = backoffMs(attempt);
      attempt += 1;
      retry = setTimeout(connect, wait);
    };
    socket.addEventListener('close', dropped);
    socket.addEventListener('error', () => {});
  }

  connect();

  return {
    stop() {
      closed = true;
      if (retry !== null) clearTimeout(retry);
      try {
        socket?.close();
      } catch {
        // Already gone; nothing to do.
      }
    },
  };
}
