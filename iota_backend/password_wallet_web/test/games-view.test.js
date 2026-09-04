// What a client may do right now, given the game state and who it is.
//
// This is the logic that would otherwise live inside a render function and go
// untested — which is exactly where the bugs in this project have landed. The
// DOM layer reads these flags and does nothing else.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseGame, viewFor } from '../src/games/view.js';

const HOST = '0xaaa';
const ANNA = '0xbbb';
const PIOTR = '0xccc';

/// RPC returns Move structs wrapped as `{type, fields}`. The exact shape is
/// verified against a real object during the on-chain smoke test; this fixture
/// encodes the assumption so a mismatch shows up as a failing test rather than
/// a blank screen.
const raw = (over = {}) => ({
  host: HOST,
  room_index: 0,
  open: false,
  phase: 1,
  drawer: 0,
  round: 1,
  deadline_ms: '100000',
  has_claim: false,
  claimed: 0,
  players: [
    { fields: { who: HOST, name: 'host', score: 0, active: true } },
    { fields: { who: ANNA, name: 'Anna', score: 2, active: true } },
    { fields: { who: PIOTR, name: 'Piotr', score: 1, active: true } },
  ],
  slots: [{ fields: { who: ANNA, claimed: true } }],
  guesses: [],
  ...over,
});

const PHASE = { LOBBY: 0, READY: 1, DRAWING: 2, REVEAL: 3 };

// --- parsing ------------------------------------------------------------------

test('unwraps the RPC struct shape', () => {
  const game = parseGame(raw());
  assert.equal(game.players.length, 3);
  assert.deepEqual(game.players[1], { who: ANNA, name: 'Anna', score: 2, active: true });
  assert.deepEqual(game.slots[0], { who: ANNA, claimed: true });
});

test('accepts already-unwrapped structs too', () => {
  // Not every RPC shape wraps; being tolerant here is cheaper than being wrong.
  const game = parseGame(raw({ players: [{ who: HOST, name: 'h', score: 0, active: true }] }));
  assert.equal(game.players[0].who, HOST);
});

test('reads u64 fields returned as strings', () => {
  assert.equal(parseGame(raw({ deadline_ms: '1234567890' })).deadlineMs, 1234567890);
});

test('a missing guesses vector parses as empty', () => {
  const game = parseGame(raw({ guesses: undefined }));
  assert.deepEqual(game.guesses, []);
});

// --- who may do what ----------------------------------------------------------

test('the drawer may start a round in READY', () => {
  const view = viewFor(parseGame(raw({ phase: PHASE.READY, drawer: 0 })), HOST, 0);
  assert.equal(view.role, 'drawer');
  assert.equal(view.canStartRound, true);
  assert.equal(view.canGuess, false);
});

test('a guesser may do nothing in READY', () => {
  const view = viewFor(parseGame(raw({ phase: PHASE.READY, drawer: 0 })), ANNA, 0);
  assert.equal(view.role, 'guesser');
  assert.equal(view.canStartRound, false);
  assert.equal(view.canGuess, false, 'there is no commitment to guess against yet');
});

test('a guesser may guess while drawing', () => {
  const view = viewFor(parseGame(raw({ phase: PHASE.DRAWING, drawer: 0 })), ANNA, 0);
  assert.equal(view.canGuess, true);
});

test('the drawer may not guess', () => {
  const view = viewFor(parseGame(raw({ phase: PHASE.DRAWING, drawer: 0 })), HOST, 0);
  assert.equal(view.canGuess, false);
});

test('a kicked player is a spectator', () => {
  const players = raw().players;
  players[1] = { fields: { who: ANNA, name: 'Anna', score: 2, active: false } };
  const view = viewFor(parseGame(raw({ phase: PHASE.DRAWING, players })), ANNA, 0);
  assert.equal(view.role, 'spectator');
  assert.equal(view.canGuess, false);
});

test('someone who never joined is a spectator', () => {
  const view = viewFor(parseGame(raw({ phase: PHASE.DRAWING })), '0xstranger', 0);
  assert.equal(view.role, 'spectator');
  assert.equal(view.canGuess, false);
});

// --- unsticking ---------------------------------------------------------------

test('nobody may unstick before the deadline', () => {
  const game = parseGame(raw({ phase: PHASE.DRAWING, deadline_ms: '100000' }));
  assert.equal(viewFor(game, ANNA, 99_000).canUnstick, false);
});

test('anyone may time out an abandoned drawing round', () => {
  const game = parseGame(raw({ phase: PHASE.DRAWING, deadline_ms: '100000' }));
  const view = viewFor(game, ANNA, 101_000);
  assert.equal(view.canUnstick, true);
  assert.equal(view.unstickAction, 'timeout');
});

test('anyone may forfeit a drawer who never revealed', () => {
  const game = parseGame(raw({ phase: PHASE.REVEAL, deadline_ms: '100000', has_claim: true }));
  assert.equal(viewFor(game, ANNA, 101_000).unstickAction, 'forfeit');
});

test('anyone may skip a drawer who never committed', () => {
  const game = parseGame(raw({ phase: PHASE.READY, deadline_ms: '100000' }));
  assert.equal(viewFor(game, ANNA, 101_000).unstickAction, 'skip');
});

// --- the lobby ----------------------------------------------------------------

test('the host may start once two players are active', () => {
  const game = parseGame(raw({ phase: PHASE.LOBBY, open: true }));
  assert.equal(viewFor(game, HOST, 0).canStartGame, true);
});

test('a lone host may not start', () => {
  const game = parseGame(
    raw({
      phase: PHASE.LOBBY,
      open: true,
      players: [{ fields: { who: HOST, name: 'host', score: 0, active: true } }],
    }),
  );
  assert.equal(viewFor(game, HOST, 0).canStartGame, false);
});

test('a guest may not start the game', () => {
  const game = parseGame(raw({ phase: PHASE.LOBBY, open: true }));
  assert.equal(viewFor(game, ANNA, 0).canStartGame, false);
});

// --- scoreboard ---------------------------------------------------------------

test('scores come back highest first', () => {
  const view = viewFor(parseGame(raw()), ANNA, 0);
  assert.deepEqual(
    view.scoreboard.map((p) => [p.name, p.score]),
    [
      ['Anna', 2],
      ['Piotr', 1],
      ['host', 0],
    ],
  );
});
