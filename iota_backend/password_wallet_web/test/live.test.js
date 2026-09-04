// The subscription protocol, without a socket.
//
// Every message shape here is one the testnet node actually sent, or one the
// graphql-transport-ws spec requires us to answer. Getting these wrong fails
// quietly — the socket connects and then nothing ever arrives — so they are
// worth pinning even though the transport itself cannot be unit tested.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { backoffMs, debounce, interpret, LIVE_QUERY } from '../src/games/live.js';

// --- classifying messages -----------------------------------------------------

test('connection_ack is what lets us subscribe', () => {
  assert.deepEqual(interpret('{"type":"connection_ack"}'), { kind: 'ack' });
});

test('a transaction notification is a change', () => {
  // Exactly the payload testnet returned for a paint.
  const raw = JSON.stringify({
    id: '1',
    type: 'next',
    payload: { data: { transactions: { digest: '7SZprkQKAKgWtMGM9Y6BSEQB7CDANs34T137D19Ht1zE' } } },
  });
  assert.deepEqual(interpret(raw), {
    kind: 'change',
    digest: '7SZprkQKAKgWtMGM9Y6BSEQB7CDANs34T137D19Ht1zE',
  });
});

test('Lagged is a change too, not something to ignore', () => {
  // The stream dropped payloads. Ignoring it would leave the UI stale until
  // the next poll, which is the one case push must not make worse.
  const raw = JSON.stringify({
    type: 'next',
    payload: { data: { transactions: { __typename: 'Lagged' } } },
  });
  assert.deepEqual(interpret(raw), { kind: 'lagged' });
});

test('a ping must be answered', () => {
  // The spec lets the server close the socket if a pong never comes.
  assert.deepEqual(interpret('{"type":"ping"}'), { kind: 'ping' });
});

test('a rejected query is reported, not treated as data', () => {
  // This is the shape testnet returned when the query selected fields that do
  // not exist on the payload union — the first version of this subscription.
  const raw = JSON.stringify({
    type: 'next',
    payload: {
      data: null,
      errors: [{ message: 'Unknown field "digest" on type "TransactionBlockSubscriptionPayload".' }],
    },
  });
  const action = interpret(raw);
  assert.equal(action.kind, 'error');
  assert.match(action.message, /Unknown field/);
});

test('a protocol-level error is reported', () => {
  const raw = JSON.stringify({ type: 'error', payload: [{ message: 'bad filter' }] });
  assert.deepEqual(interpret(raw), { kind: 'error', message: 'bad filter' });
});

test('completion is distinct from failure', () => {
  assert.deepEqual(interpret('{"type":"complete"}'), { kind: 'complete' });
});

test('unknown and malformed messages are ignored, never thrown', () => {
  // A throw here would land inside a socket event handler, where nothing
  // catches it.
  assert.deepEqual(interpret('not json'), { kind: 'ignore' });
  assert.deepEqual(interpret('{"type":"something_new"}'), { kind: 'ignore' });
  assert.deepEqual(interpret(undefined), { kind: 'ignore' });
  assert.deepEqual(interpret('{"type":"next"}'), { kind: 'change', digest: null });
});

test('the query asks for both members of the payload union', () => {
  // TransactionBlockSubscriptionPayload is a UNION of TransactionBlock and
  // Lagged; selecting fields directly on it is rejected by the server.
  assert.match(LIVE_QUERY, /\.\.\. on TransactionBlock/);
  assert.match(LIVE_QUERY, /\.\.\. on Lagged/);
});

// --- reconnecting -------------------------------------------------------------

test('backoff grows and then stops growing', () => {
  assert.equal(backoffMs(0), 1000);
  assert.equal(backoffMs(1), 2000);
  assert.equal(backoffMs(3), 8000);
  assert.equal(backoffMs(5), 30_000);
  assert.equal(backoffMs(50), 30_000);
});

test('backoff is never zero', () => {
  // A zero would spin as fast as the socket can fail.
  for (let attempt = 0; attempt < 10; attempt += 1) assert.ok(backoffMs(attempt) >= 1000);
});

// --- collapsing bursts --------------------------------------------------------

test('a burst of notifications becomes one refresh', () => {
  // Several players guessing at once, or a paint beside a guess, would
  // otherwise each trigger their own object read.
  let calls = 0;
  const timers = new Map();
  let nextId = 1;
  const setTimer = (fn) => {
    const id = nextId++;
    timers.set(id, fn);
    return id;
  };
  const clearTimer = (id) => timers.delete(id);

  const bump = debounce(() => { calls += 1; }, 250, setTimer, clearTimer);
  bump();
  bump();
  bump();
  assert.equal(calls, 0, 'nothing runs before the wait elapses');
  assert.equal(timers.size, 1, 'only the last timer survives');
  for (const fn of timers.values()) fn();
  assert.equal(calls, 1);
});

test('a later notification after the wait runs again', () => {
  let calls = 0;
  const timers = new Map();
  let nextId = 1;
  const setTimer = (fn) => {
    const id = nextId++;
    timers.set(id, fn);
    return id;
  };
  const bump = debounce(() => { calls += 1; }, 250, setTimer, (id) => timers.delete(id));

  bump();
  for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  bump();
  for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  assert.equal(calls, 2);
});
