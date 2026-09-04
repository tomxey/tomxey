// Deciding which guest slots are too poor to play.
//
// Extracted from the host flow because getting it wrong is expensive in both
// directions: too eager and the host spends another 3.5 IOTA on a room that
// was already funded, too lax and a guest cannot join.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIN_SLOT_NANOS, slotsNeedingFunds } from '../src/games/store.js';

const slots = [{ address: '0x1' }, { address: '0x2' }, { address: '0x3' }];

test('a swept room needs every slot funded', () => {
  // The case that stranded a real game: sweep emptied all of them.
  assert.deepEqual(slotsNeedingFunds(slots, [0, 0, 0]), slots);
});

test('a freshly funded room needs nothing', () => {
  const funded = [500_000_000, 500_000_000, 500_000_000];
  assert.deepEqual(slotsNeedingFunds(slots, funded), []);
});

test('only the short slots are returned, and in order', () => {
  const mixed = [500_000_000, 0, 1_000_000];
  assert.deepEqual(slotsNeedingFunds(slots, mixed), [slots[1], slots[2]]);
});

test('a missing balance counts as empty', () => {
  // slotBalances yields 0 for an unreadable address, but a short array would
  // otherwise silently mean "funded" and skip the slot.
  assert.deepEqual(slotsNeedingFunds(slots, [500_000_000]), [slots[1], slots[2]]);
});

test('the threshold is exclusive at the boundary', () => {
  assert.deepEqual(slotsNeedingFunds([slots[0]], [MIN_SLOT_NANOS]), []);
  assert.deepEqual(slotsNeedingFunds([slots[0]], [MIN_SLOT_NANOS - 1]), [slots[0]]);
});

test('the threshold covers a useful number of moves', () => {
  // ~1.9M nanos per gameplay transaction, measured on testnet.
  assert.ok(MIN_SLOT_NANOS / 1_900_000 > 20);
});

test('an empty room is not an error', () => {
  assert.deepEqual(slotsNeedingFunds([], []), []);
});
