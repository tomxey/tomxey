// test/maps-routing.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isBrowserDialable,
  makeRouting,
  parseRecords,
  withPeerId,
} from '../src/maps/routing.js';

const PEER = '12D3KooWKJHdtEG3GvWWx4EaJqtHpUsfE8b9uZiaoFgesmnoSnk4';
const CID = 'bafybeigpv7cjt6echhfwlndntzckpkekzkobpnxf7nnheq6uccse5zytby';
const WT = `/ip4/65.108.14.12/udp/4001/quic-v1/webtransport/certhash/uEiCAnum/certhash/uEiCQV5Z`;
const WRTC = `/ip4/65.108.14.12/udp/4001/webrtc-direct/certhash/uEiD7Cs4`;
const AUTOTLS = `/dns4/65-108-14-12.k51abc.libp2p.direct/tcp/4001/tls/ws`;
const CIRCUIT = `/ip4/1.2.3.4/udp/4001/webrtc-direct/certhash/uEiX/p2p/12D3KooWRelay/p2p-circuit`;
const TCP = `/ip4/65.108.14.12/tcp/4001`;

// --- Review Focus 3: /tls/ws vs /wss -----------------------------------

test('all four browser transport spellings are recognised', () => {
  // AutoTLS writes /tls/ws, not /wss. Matching only /wss silently skips the
  // most reachable address a NAT-free kubo publishes.
  assert.equal(isBrowserDialable(WT), true);
  assert.equal(isBrowserDialable(WRTC), true);
  assert.equal(isBrowserDialable(AUTOTLS), true);
  assert.equal(isBrowserDialable('/dns4/x.example/tcp/443/wss'), true);
});

test('plain tcp and quic are not browser-dialable', () => {
  assert.equal(isBrowserDialable(TCP), false);
  assert.equal(isBrowserDialable('/ip4/1.2.3.4/udp/4001/quic-v1'), false);
});

// --- Review Focus 4: circuit addresses ---------------------------------

test('p2p-circuit addresses are excluded even with a good transport', () => {
  // Measured: a relayed connection comes back limited={} and the block
  // fetch dies. Discoverable but unusable is worse than unreachable, so
  // never offer one.
  assert.equal(isBrowserDialable(CIRCUIT), false);
});

// --- Review Focus 1: the /p2p/ suffix ----------------------------------

test('withPeerId appends the peer id when routing omitted it', () => {
  // Routing records carry bare addresses. Dialling without the peer id
  // leaves libp2p no identity to verify and the handshake fails.
  assert.equal(withPeerId(WT, PEER), `${WT}/p2p/${PEER}`);
});

test('withPeerId leaves an address that already has one alone', () => {
  const full = `${WT}/p2p/${PEER}`;
  assert.equal(withPeerId(full, PEER), full);
});

// --- parsing -----------------------------------------------------------

test('parseRecords reads ndjson and tolerates blank and broken lines', () => {
  const ndjson = [
    JSON.stringify({ ID: PEER, Addrs: [WT, TCP] }),
    '',
    'not json at all',
    JSON.stringify({ Providers: [{ ID: 'p2', Addrs: [WRTC] }] }),
  ].join('\n');
  const recs = parseRecords(ndjson);
  assert.deepEqual(recs.map((r) => r.id), [PEER, 'p2']);
  assert.equal(recs[0].addrs.length, 2);
});

// --- the loader --------------------------------------------------------

const ROUTERS = ['https://r1.example/routing/v1', 'https://r2.example/routing/v1'];

function fakeStorage({ throws = false, seed = {} } = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(k) { if (throws) throw new Error('storage disabled'); return map.get(k) ?? null; },
    setItem(k, v) { if (throws) throw new Error('storage disabled'); map.set(k, v); },
    removeItem(k) { if (throws) throw new Error('storage disabled'); map.delete(k); },
    map,
  };
}

/// fetch fake: route by url substring to a canned ndjson body.
function fakeFetch(plan) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const hit = plan.find((p) => url.includes(p.match));
    if (!hit || hit.fail) throw new Error('router down');
    return { ok: true, status: 200, text: async () => hit.body };
  };
  fn.calls = calls;
  return fn;
}

const rec = (id, addrs) => JSON.stringify({ ID: id, Addrs: addrs });

test('addresses are returned with peer ids appended and circuits dropped', async () => {
  const routing = makeRouting({
    fetch: fakeFetch([{ match: 'r1.example', body: rec(PEER, [WT, TCP, CIRCUIT]) }]),
    storage: fakeStorage(),
    routers: ['https://r1.example/routing/v1'],
    log: () => {},
  });
  const addrs = await routing.addressesFor(CID);
  assert.deepEqual(addrs, [`${WT}/p2p/${PEER}`]);
});

test('both routers are queried and their results merged without duplicates', async () => {
  const fetch = fakeFetch([
    { match: 'r1.example', body: rec(PEER, [WT]) },
    { match: 'r2.example', body: rec(PEER, [WT, WRTC]) },
  ]);
  const routing = makeRouting({ fetch, storage: fakeStorage(), routers: ROUTERS, log: () => {} });
  const addrs = await routing.addressesFor(CID);
  assert.equal(addrs.length, 2, addrs.join(' '));
  assert.equal(new Set(addrs).size, 2);
});

test('one router failing does not lose the other router results', async () => {
  const fetch = fakeFetch([
    { match: 'r1.example', fail: true },
    { match: 'r2.example', body: rec(PEER, [WRTC]) },
  ]);
  const routing = makeRouting({ fetch, storage: fakeStorage(), routers: ROUTERS, log: () => {} });
  assert.deepEqual(await routing.addressesFor(CID), [`${WRTC}/p2p/${PEER}`]);
});

// --- Review Focus 2: address-less provider records ---------------------

test('a provider with no addresses triggers a /peers/ lookup', async () => {
  // Measured: one query in four returns the provider with Addrs: [].
  // Giving up there would report "nobody has this map" while a host does.
  const fetch = fakeFetch([
    { match: `/providers/${CID}`, body: rec(PEER, []) },
    { match: `/peers/${PEER}`, body: rec(PEER, [WT]) },
  ]);
  const routing = makeRouting({
    fetch, storage: fakeStorage(), routers: ['https://r1.example/routing/v1'], log: () => {},
  });
  assert.deepEqual(await routing.addressesFor(CID), [`${WT}/p2p/${PEER}`]);
  assert.ok(fetch.calls.some((u) => u.includes(`/peers/${PEER}`)));
});

test('no providers anywhere yields an empty list, not a throw', async () => {
  const routing = makeRouting({
    fetch: fakeFetch([{ match: 'r1.example', body: '' }]),
    storage: fakeStorage(),
    routers: ['https://r1.example/routing/v1'],
    log: () => {},
  });
  assert.deepEqual(await routing.addressesFor(CID), []);
});

// --- learned addresses -------------------------------------------------

test('a remembered address is tried first and skips the network', async () => {
  const fetch = fakeFetch([{ match: 'r1.example', body: rec(PEER, [WRTC]) }]);
  const storage = fakeStorage();
  const routing = makeRouting({
    fetch, storage, routers: ['https://r1.example/routing/v1'], log: () => {},
  });
  routing.remember(CID, `${WT}/p2p/${PEER}`);
  const addrs = await routing.addressesFor(CID);
  assert.equal(addrs[0], `${WT}/p2p/${PEER}`, 'learned address should lead');
  assert.deepEqual(fetch.calls, [], 'a learned address should avoid the lookup');
});

test('forget drops a learned address so the next lookup goes to the network', async () => {
  const fetch = fakeFetch([{ match: 'r1.example', body: rec(PEER, [WRTC]) }]);
  const routing = makeRouting({
    fetch, storage: fakeStorage(), routers: ['https://r1.example/routing/v1'], log: () => {},
  });
  routing.remember(CID, `${WT}/p2p/${PEER}`);
  routing.forget(CID);
  assert.deepEqual(await routing.addressesFor(CID), [`${WRTC}/p2p/${PEER}`]);
  assert.equal(fetch.calls.length, 1);
});

// --- retry (spec §3.1): lookup is probabilistic -------------------------

test('an empty first lookup is retried before giving up', async () => {
  // Measured: roughly one query in four comes back without the provider.
  // Reporting "nobody has this map" on a single empty answer would be
  // wrong a quarter of the time.
  let call = 0;
  const fetch = async () => {
    call += 1;
    return { ok: true, status: 200, text: async () => (call === 1 ? '' : rec(PEER, [WT])) };
  };
  const slept = [];
  const routing = makeRouting({
    fetch,
    storage: fakeStorage(),
    routers: ['https://r1.example/routing/v1'],
    log: () => {},
    sleep: async (ms) => slept.push(ms),
  });
  assert.deepEqual(await routing.addressesFor(CID), [`${WT}/p2p/${PEER}`]);
  assert.equal(call, 2, 'should have retried once');
  assert.deepEqual(slept, [500], 'should have backed off before retrying');
});

test('retries are bounded and back off', async () => {
  const slept = [];
  const routing = makeRouting({
    fetch: async () => ({ ok: true, status: 200, text: async () => '' }),
    storage: fakeStorage(),
    routers: ['https://r1.example/routing/v1'],
    log: () => {},
    attempts: 3,
    sleep: async (ms) => slept.push(ms),
  });
  assert.deepEqual(await routing.addressesFor(CID), []);
  assert.deepEqual(slept, [500, 1000], 'two waits between three attempts, doubling');
});

test('a successful first lookup does not sleep at all', async () => {
  const slept = [];
  const routing = makeRouting({
    fetch: fakeFetch([{ match: 'r1.example', body: rec(PEER, [WT]) }]),
    storage: fakeStorage(),
    routers: ['https://r1.example/routing/v1'],
    log: () => {},
    sleep: async (ms) => slept.push(ms),
  });
  await routing.addressesFor(CID);
  assert.deepEqual(slept, []);
});

// --- Review Focus 5: storage refused -----------------------------------

test('routing still works when localStorage throws', async () => {
  // Safari private browsing rejects storage outright. Losing a cache is
  // not a reason to lose the map.
  const routing = makeRouting({
    fetch: fakeFetch([{ match: 'r1.example', body: rec(PEER, [WT]) }]),
    storage: fakeStorage({ throws: true }),
    routers: ['https://r1.example/routing/v1'],
    log: () => {},
  });
  routing.remember(CID, `${WT}/p2p/${PEER}`); // must not throw
  assert.deepEqual(await routing.addressesFor(CID), [`${WT}/p2p/${PEER}`]);
});
