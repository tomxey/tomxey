// The core requirement, pinned.
//
// createHelia() is withBitswap(withLibp2p(withHTTP(...))) and withHTTP is a
// trustless-gateway block broker. Using it made the page fetch blocks over
// HTTP from trustless-gateway.link and 4everland.io — hash-verified, but a
// gateway dependency this whole design exists to avoid. Nothing but a human
// watching the network tab caught it. This test is that human.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/// Comments explain WHY the gateway broker is excluded and so mention it by
/// name; assert on code, not prose.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const node = strip(readFileSync(new URL('../src/maps/node.js', import.meta.url), 'utf8'));
const routing = strip(readFileSync(new URL('../src/maps/routing.js', import.meta.url), 'utf8'));

test('the helia node is composed without the HTTP block broker', () => {
  assert.match(node, /createHeliaLight/, 'should build from createHeliaLight');
  assert.doesNotMatch(
    node,
    /\bcreateHelia\b(?!Light)/,
    'createHelia() pulls in withHTTP, which fetches blocks from public gateways',
  );
  assert.doesNotMatch(node, /withHTTP\s*\(/, 'withHTTP is the gateway block broker');
  assert.doesNotMatch(node, /trustless|block-brokers/i, 'no gateway broker imported');
});

test('block retrieval is bitswap only', () => {
  assert.match(node, /withBitswap/);
});

test('no tile-data host is named anywhere in the map sources', () => {
  // Routing endpoints are intended and permitted; an address for where the
  // bytes live is not. A hardcoded multiaddr would defeat the design.
  for (const [name, src] of [['node.js', node], ['routing.js', routing]]) {
    assert.doesNotMatch(src, /\/ip4\/|\/ip6\/|\/dns4\/|\/dnsaddr\//, `${name} names a host`);
  }
});

test('the only configured endpoints are provider routing', () => {
  const urls = routing.match(/https:\/\/[a-z0-9.-]+/g) ?? [];
  for (const u of urls) {
    assert.match(u, /delegated-ipfs\.dev|cid\.contact/, `unexpected endpoint ${u}`);
  }
});
