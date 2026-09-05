// Which chain a page talks to.
//
// The wallet and the game deliberately live on different networks, so the
// wrong answer here is not a cosmetic bug: it points a page at a chain where
// its package does not exist, and every call fails for reasons that look
// nothing like "wrong network".
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GAME_NETWORK, NETWORKS, networkFrom, WALLET_NETWORK } from '../src/config.js';

test('the game and the wallet default to different networks', () => {
  assert.equal(WALLET_NETWORK, 'testnet');
  assert.equal(GAME_NETWORK, 'devnet');
});

test('?network= picks a network', () => {
  assert.equal(networkFrom('?network=devnet', 'testnet'), 'devnet');
  assert.equal(networkFrom('?network=testnet', 'devnet'), 'testnet');
});

test('an unknown network falls back instead of half-configuring the page', () => {
  // Returning the name as given would produce a settings object whose every
  // endpoint is undefined — far harder to diagnose than ignoring a typo.
  assert.equal(networkFrom('?network=mainnet-typo', 'devnet'), 'devnet');
  assert.equal(networkFrom('?network=', 'devnet'), 'devnet');
});

test('no parameter means the page default', () => {
  assert.equal(networkFrom('', 'devnet'), 'devnet');
  assert.equal(networkFrom(undefined, 'testnet'), 'testnet');
  assert.equal(networkFrom('?account=0x1&username=a', 'testnet'), 'testnet');
});

test('a network parameter survives other parameters', () => {
  // The host's link carries ?account= and ?username= as well.
  assert.equal(networkFrom('?account=0x1&network=devnet&username=a', 'testnet'), 'devnet');
});

test('every network defines the same settings', () => {
  // A missing key is an undefined endpoint at runtime, which surfaces as a
  // fetch to "undefined" rather than as a configuration error.
  const names = Object.keys(NETWORKS);
  const shape = Object.keys(NETWORKS[names[0]]).sort();
  for (const name of names) {
    assert.deepEqual(Object.keys(NETWORKS[name]).sort(), shape, `${name} has a different shape`);
  }
});

test('every network has the endpoints the game needs', () => {
  for (const [name, network] of Object.entries(NETWORKS)) {
    for (const key of ['nodeUrl', 'indexerUrl', 'subscriptionUrl', 'faucetUrl']) {
      assert.match(network[key], /^(https|wss):\/\//, `${name}.${key} is not a URL`);
    }
    assert.match(network.subscriptionUrl, /\/subscriptions$/, `${name} subscription path is wrong`);
  }
});

test('endpoints point at the network they claim to be', () => {
  // Copy-paste between these blocks is the obvious way to get this wrong.
  for (const [name, network] of Object.entries(NETWORKS)) {
    for (const key of ['nodeUrl', 'indexerUrl', 'subscriptionUrl', 'faucetUrl']) {
      assert.ok(network[key].includes(name), `${name}.${key} points at another network`);
    }
  }
});
