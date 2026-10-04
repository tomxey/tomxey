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

test('the error carries how many providers were seen', () => {
  // "nobody is hosting this" and "hosts exist but none are reachable from a
  // browser" need different messages: the first sends you to the pinning
  // node, the second to its connectivity. The count is what distinguishes
  // them, so it has to survive to the UI.
  assert.equal(new NoProviderReachableError([], 0).providersSeen, 0);
  assert.equal(new NoProviderReachableError([], 3).providersSeen, 3);
});

test('the no-provider message distinguishes unreachable from absent', () => {
  assert.match(new NoProviderReachableError([], 3).message, /3/);
  assert.doesNotMatch(new NoProviderReachableError([], 0).message, /\b3\b/);
});

// --- a dial that connects but carries no data --------------------------

test('an address that dials but fails verification falls through', async () => {
  // Firefox reports a successful WebTransport dial to kubo and then never
  // transfers a byte. "Connected" is not the same as "working", so the
  // archive read is the real liveness probe — if it fails, the address is
  // dead and the next one deserves a turn.
  const dialled = [];
  const lib = { dial: async (ma) => dialled.push(ma.toString()), hangUp: async () => {} };
  const got = await dialFirstWorking(lib, [A, B], {
    verify: async (addr) => {
      if (addr === A) throw new Error('reading the map archive timed out');
    },
  });
  assert.equal(got, B);
  assert.deepEqual(dialled, [A, B]);
});

test('a verified address hangs up nothing and is returned', async () => {
  const hungUp = [];
  const lib = { dial: async () => {}, hangUp: async (ma) => hungUp.push(ma.toString()) };
  assert.equal(await dialFirstWorking(lib, [A], { verify: async () => {} }), A);
  assert.deepEqual(hungUp, []);
});

test('a failed verification hangs up before moving on', async () => {
  // Leaving the dead connection open lets libp2p keep choosing it.
  const hungUp = [];
  const lib = { dial: async () => {}, hangUp: async (ma) => hungUp.push(ma.toString()) };
  await assert.rejects(() => dialFirstWorking(lib, [A], { verify: async () => { throw new Error('no data'); } }));
  assert.deepEqual(hungUp, [A]);
});

test('a verification failure is reported as the reason', async () => {
  const lib = { dial: async () => {}, hangUp: async () => {} };
  await assert.rejects(
    () => dialFirstWorking(lib, [A], { verify: async () => { throw new Error('archive read timed out'); } }),
    /archive read timed out/,
  );
});

// --- a dial that never settles ----------------------------------------

test('a dial that ignores its abort signal is still bounded', async () => {
  // libp2p takes an AbortSignal, but a transport that never settles leaves
  // the page on "Connecting to host 1 of 3…" forever. Firefox opens a
  // WebTransport session to kubo that connects and then does nothing, so
  // this is the observed case, not a hypothetical.
  const lib = { dial: () => new Promise(() => {}), hangUp: async () => {} };
  const started = Date.now();
  await assert.rejects(() => dialFirstWorking(lib, [A], { dialTimeoutMs: 40 }));
  assert.ok(Date.now() - started < 2000, 'dialFirstWorking hung past its own timeout');
});

test('the whole connect phase is bounded, not just each address', async () => {
  // Three addresses each taking their full timeout is a minute of a
  // motionless message. The user reads that as frozen, and they are right.
  const lib = { dial: () => new Promise(() => {}), hangUp: async () => {} };
  const started = Date.now();
  await assert.rejects(
    () => dialFirstWorking(lib, [A, B, A, B, A], { dialTimeoutMs: 100, overallTimeoutMs: 250 }),
    /gave up|timed out/i,
  );
  assert.ok(Date.now() - started < 2000, 'overall deadline not honoured');
});

test('progress is reported for the probe, not only the dial', async () => {
  // Reporting only at dial start means the message freezes for the whole
  // verify. The UI needs to know which phase it is in.
  const phases = [];
  const lib = { dial: async () => {}, hangUp: async () => {} };
  await dialFirstWorking(lib, [A], {
    verify: async () => {},
    onAttempt: (_a, i, n, phase) => phases.push(phase),
  });
  assert.deepEqual(phases, ['dialing', 'checking']);
});
