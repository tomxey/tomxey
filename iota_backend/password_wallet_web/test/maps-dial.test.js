// test/maps-dial.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NoProviderReachableError, dialFirstWorking } from '../src/maps/node.js';

const A = '/ip4/1.1.1.1/udp/4001/webrtc-direct/certhash/x/p2p/12D3KooWA';
const B = '/ip4/2.2.2.2/udp/4001/quic-v1/webtransport/certhash/y/p2p/12D3KooWB';

const libp2pThat = (behaviour) => ({ dial: async (ma) => behaviour(ma.toString()) });

test('the first working address is returned', async () => {
  const got = await dialFirstWorking(libp2pThat(() => {}), [A, B], {});
  assert.equal(got, A);
});

test('a failing address falls through to the next', async () => {
  const lib = libp2pThat((a) => {
    if (a === A) throw new Error('timed out');
  });
  assert.equal(await dialFirstWorking(lib, [A, B], {}), B);
});

test('every address failing throws an error naming each attempt', async () => {
  const lib = libp2pThat(() => {
    throw new Error('nope');
  });
  await assert.rejects(
    () => dialFirstWorking(lib, [A, B], {}),
    (e) => {
      assert.ok(e instanceof NoProviderReachableError);
      assert.equal(e.attempts.length, 2);
      assert.match(e.message, /1\.1\.1\.1/);
      return true;
    },
  );
});

test('an empty address list is distinguishable from everything failing', async () => {
  // "nobody is hosting this" and "hosts exist but are unreachable" need
  // different messages: the user's remedy differs.
  await assert.rejects(
    () => dialFirstWorking(libp2pThat(() => {}), [], {}),
    (e) => e instanceof NoProviderReachableError && e.attempts.length === 0,
  );
});

test('each attempt is reported so the UI can show progress', async () => {
  const seen = [];
  const lib = libp2pThat((a) => {
    if (a === A) throw new Error('timed out');
  });
  await dialFirstWorking(lib, [A, B], { onAttempt: (a, i, n) => seen.push([i, n]) });
  assert.deepEqual(seen, [[0, 2], [1, 2]]);
});
