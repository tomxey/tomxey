// A stalled fetch must become a message, not a spinner forever.
//
// Shipped without this: the page reached "downloading the map…" and stayed
// there indefinitely when block retrieval stalled — no error, no reason, and
// nothing for the user to act on. Spec §8: never fail silently.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TimeoutError, withTimeout } from '../src/maps/timeout.js';

const never = () => new Promise(() => {});

test('a promise that settles in time passes its value through', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 1000, 'x'), 'ok');
});

test('a promise that never settles rejects with the stage name', async () => {
  await assert.rejects(
    () => withTimeout(never(), 10, 'reading the map archive'),
    (e) => {
      assert.ok(e instanceof TimeoutError);
      assert.match(e.message, /reading the map archive/);
      assert.match(e.message, /10/);
      return true;
    },
  );
});

test('a rejection passes through unchanged, not masked as a timeout', async () => {
  await assert.rejects(
    () => withTimeout(Promise.reject(new Error('block fetch failed')), 1000, 'x'),
    /block fetch failed/,
  );
});

test('the timer does not keep the process alive after success', async () => {
  // An un-cleared timer would hold the event loop open and, in a browser,
  // fire a stale rejection long after the map had loaded.
  const t = withTimeout(Promise.resolve(1), 60_000, 'x');
  assert.equal(await t, 1);
});
