// The faucet link. Its only job is to hand over an address in the exact form
// the faucet's own validator accepts, so the host clicks once and then clicks
// "Request" — no copying.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { faucetUrl, isFundableAddress } from '../src/games/faucet.js';

const BASE = 'https://faucet.testnet.iota.cafe';
const ACCOUNT = `0x${'a'.repeat(64)}`;

test('builds a link the faucet will accept', () => {
  assert.equal(faucetUrl(BASE, ACCOUNT), `${BASE}/?address=${ACCOUNT}`);
});

test('the address survives as the faucet expects to find it', () => {
  // The faucet reads the param, trims it, and tests /^0x[0-9a-fA-F]{64}$/.
  const url = new URL(faucetUrl(BASE, ACCOUNT));
  assert.match(url.searchParams.get('address'), /^0x[0-9a-fA-F]{64}$/);
});

test('a trailing slash on the base does not double up', () => {
  assert.equal(faucetUrl(`${BASE}/`, ACCOUNT), `${BASE}/?address=${ACCOUNT}`);
});

test('surrounding whitespace is trimmed, not encoded', () => {
  assert.equal(faucetUrl(BASE, `  ${ACCOUNT}  `), `${BASE}/?address=${ACCOUNT}`);
});

test('an address the faucet would reject yields no link', () => {
  // Better to hide the button than to send the host to a form that refuses
  // what it was given — that reads as a broken faucet.
  assert.equal(faucetUrl(BASE, '0xabc'), null);
  assert.equal(faucetUrl(BASE, `0x${'a'.repeat(63)}`), null);
  assert.equal(faucetUrl(BASE, `0x${'a'.repeat(65)}`), null);
  assert.equal(faucetUrl(BASE, `0x${'z'.repeat(64)}`), null);
  assert.equal(faucetUrl(BASE, ACCOUNT.slice(2)), null, 'needs the 0x prefix');
  assert.equal(faucetUrl(BASE, ''), null);
  assert.equal(faucetUrl(BASE, null), null);
});

test('no base means no link', () => {
  assert.equal(faucetUrl('', ACCOUNT), null);
});

test('a mixed-case address is accepted', () => {
  const mixed = '0xAbCdEf0123456789'.padEnd(66, '0');
  assert.ok(isFundableAddress(mixed));
  assert.ok(faucetUrl(BASE, mixed));
});
