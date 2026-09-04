// Deciding which guest slots are too poor to play.
//
// Extracted from the host flow because getting it wrong is expensive in both
// directions: too eager and the host spends another 3.5 IOTA on a room that
// was already funded, too lax and a guest cannot join.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIN_SLOT_NANOS, roomsFromEvents, slotsNeedingFunds } from '../src/games/store.js';

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

// --- finding a host's rooms ----------------------------------------------------

const V2 = '0x06e066af';
const V3 = '0xfuture99';
const created = (pkg, game, canvas, roomIndex) => ({
  type: `${pkg}::kalambury::RoomCreated`,
  parsedJson: { game, canvas, host: '0xhost', room_index: roomIndex },
});
const closedEvent = (pkg, game) => ({
  type: `${pkg}::kalambury::RoomClosed`,
  parsedJson: { game, host: '0xhost' },
});

test('lists a created room', () => {
  assert.deepEqual(roomsFromEvents([created(V2, '0xg1', '0xc1', 3)]), [
    { gameId: '0xg1', canvasId: '0xc1', roomIndex: 3 },
  ]);
});

test('a closed room is not listed', () => {
  const events = [closedEvent(V2, '0xg1'), created(V2, '0xg1', '0xc1', 1)];
  assert.deepEqual(roomsFromEvents(events), []);
});

test('closing one room leaves the others', () => {
  const events = [
    closedEvent(V2, '0xg2'),
    created(V2, '0xg2', '0xc2', 2),
    created(V2, '0xg1', '0xc1', 1),
  ];
  assert.deepEqual(
    roomsFromEvents(events).map((room) => room.gameId),
    ['0xg1'],
  );
});

test('newest room index first', () => {
  const events = [created(V2, '0xg1', '0xc1', 1), created(V2, '0xg9', '0xc9', 9)];
  assert.deepEqual(
    roomsFromEvents(events).map((room) => room.roomIndex),
    [9, 1],
  );
});

test('a room created by a later package version is still found', () => {
  // Event types carry the package that emitted them, verified on testnet: v2
  // emitted 0x06e066af…::kalambury::RoomCreated. Matching a full type string
  // would silently stop listing rooms after the next upgrade.
  const events = [created(V3, '0xg2', '0xc2', 2), created(V2, '0xg1', '0xc1', 1)];
  assert.deepEqual(
    roomsFromEvents(events).map((room) => room.gameId),
    ['0xg2', '0xg1'],
  );
});

test('a room closed by a later version is still excluded', () => {
  const events = [closedEvent(V3, '0xg1'), created(V2, '0xg1', '0xc1', 1)];
  assert.deepEqual(roomsFromEvents(events), []);
});

test('unrelated events are ignored', () => {
  const events = [
    { type: '0x2::account::MutableAccountCreated<0xabc::password_account::PasswordAccount>' },
    { type: '0x2::coin::CoinCreated', parsedJson: { game: '0xg1' } },
    created(V2, '0xg1', '0xc1', 1),
  ];
  assert.deepEqual(
    roomsFromEvents(events).map((room) => room.gameId),
    ['0xg1'],
  );
});

test('a duplicated creation event yields one room', () => {
  const events = [created(V2, '0xg1', '0xc1', 1), created(V2, '0xg1', '0xc1', 1)];
  assert.equal(roomsFromEvents(events).length, 1);
});

test('an event with no parsedJson does not throw', () => {
  assert.deepEqual(roomsFromEvents([{ type: `${V2}::kalambury::RoomCreated` }]), []);
});

test('no events means no rooms', () => {
  assert.deepEqual(roomsFromEvents([]), []);
});
