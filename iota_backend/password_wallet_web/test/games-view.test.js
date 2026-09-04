// What a client may do right now, given the game state and who it is.
//
// This is the logic that would otherwise live inside a render function and go
// untested — which is exactly where the bugs in this project have landed. The
// DOM layer reads these flags and does nothing else.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  describeSlots,
  parseCanvas,
  parseGame,
  viewFor,
  winningGuess,
} from '../src/games/view.js';

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

// --- the lobby ----------------------------------------------------------------

test('nobody is the drawer in the lobby', () => {
  // Regression: `drawer` is 0 in the lobby because the field must hold
  // something, which made player zero — the host — read as the drawer and told
  // them "you are drawing" before a single guest had joined. Caught against a
  // real on-chain object, not this fixture.
  const lobby = parseGame(raw({ phase: PHASE.LOBBY, drawer: 0, open: true }));
  const view = viewFor(lobby, HOST, 0);
  assert.equal(view.role, 'waiting');
  assert.equal(view.canStartRound, false);
  assert.equal(view.canGuess, false);
});

test('a guest waits in the lobby too', () => {
  const lobby = parseGame(raw({ phase: PHASE.LOBBY, drawer: 0, open: true }));
  assert.equal(viewFor(lobby, ANNA, 0).role, 'waiting');
});

test('a non-player still spectates in the lobby', () => {
  const lobby = parseGame(raw({ phase: PHASE.LOBBY, open: true }));
  assert.equal(viewFor(lobby, '0xdead', 0).role, 'spectator');
});

test('the host may start once two players are active', () => {
  const lobby = parseGame(raw({ phase: PHASE.LOBBY, open: true }));
  assert.equal(viewFor(lobby, HOST, 0).canStartGame, true);
  assert.equal(viewFor(lobby, ANNA, 0).canStartGame, false);
});

// --- the canvas ---------------------------------------------------------------

test('the drawer may paint only while drawing', () => {
  // The contract rejects paint outside DRAWING with EWrongPhase, and the
  // drawer holds the role in READY as well — so role alone is not enough.
  const ready = parseGame(raw({ phase: PHASE.READY, drawer: 0 }));
  const drawing = parseGame(raw({ phase: PHASE.DRAWING, drawer: 0 }));
  assert.equal(viewFor(ready, HOST, 0).canPaint, false);
  assert.equal(viewFor(drawing, HOST, 0).canPaint, true);
});

test('a guesser never paints', () => {
  const drawing = parseGame(raw({ phase: PHASE.DRAWING, drawer: 0 }));
  assert.equal(viewFor(drawing, ANNA, 0).canPaint, false);
  assert.equal(viewFor(drawing, '0xdead', 0).canPaint, false);
});

test('parseCanvas reads a number array of pixels', () => {
  // Verified against a real object: pixels is a number array, version a number.
  const canvas = parseCanvas({ version: 3, pixels: [134, 0, 8, 5] });
  assert.equal(canvas.version, 3);
  assert.deepEqual([...canvas.pixels], [134, 0, 8, 5]);
});

test('parseCanvas tolerates an empty and a missing canvas', () => {
  assert.deepEqual([...parseCanvas({ version: 0, pixels: [] }).pixels], []);
  assert.equal(parseCanvas(null), null);
});

// --- whose slot is whose ------------------------------------------------------

test('an unscanned slot is not called a player', () => {
  // The bug this fixes: seven funded slots were labelled "player 1".."player 7"
  // in the gas list, so five addresses nobody had scanned looked like five
  // players each sitting on 0.5 IOTA.
  const slots = [{ address: ANNA }, { address: PIOTR }, { address: '0xnobody' }];
  const players = [
    { who: HOST, name: 'host', score: 0, active: true },
    { who: ANNA, name: 'Anna', score: 0, active: true },
  ];
  assert.deepEqual(describeSlots(slots, players), [
    'Anna',
    'slot 2 · unclaimed',
    'slot 3 · unclaimed',
  ]);
});

test('a removed player is still shown against their slot', () => {
  const slots = [{ address: ANNA }];
  const players = [{ who: ANNA, name: 'Anna', score: 0, active: false }];
  assert.deepEqual(describeSlots(slots, players), ['Anna (removed)']);
});

test('slots with no players at all are all unclaimed', () => {
  assert.deepEqual(describeSlots([{ address: ANNA }], []), ['slot 1 · unclaimed']);
  assert.deepEqual(describeSlots([{ address: ANNA }], undefined), ['slot 1 · unclaimed']);
});

test('describeSlots accepts the on-chain slot shape too', () => {
  // parseGame gives slots as {who, claimed}; host.js derives them as
  // {address, secretKey}. Both are used to label the same list.
  const players = [{ who: ANNA, name: 'Anna', score: 0, active: true }];
  assert.deepEqual(describeSlots([{ who: ANNA }], players), ['Anna']);
});

// --- announcing the winner ----------------------------------------------------

test('no claim means nothing to announce', () => {
  assert.equal(winningGuess(parseGame(raw({ has_claim: false }))), null);
});

test('the claimed guess names the winner and the word', () => {
  // The claimed guess *is* the word — reveal asserts they are byte-equal — so
  // this is also how everyone learns what was drawn. Nothing stores the word.
  const game = parseGame(raw({
    phase: PHASE.REVEAL,
    has_claim: true,
    claimed: 1,
    guesses: [
      { fields: { player: 1, text: 'piesek' } },
      { fields: { player: 2, text: 'latarnia' } },
    ],
  }));
  assert.deepEqual(winningGuess(game), { name: 'Piotr', text: 'latarnia', player: 2 });
});

test('a claim pointing past the guesses does not throw', () => {
  // Defensive: this would be a contract bug, but it must not take the render
  // down with it.
  const game = parseGame(raw({ has_claim: true, claimed: 5, guesses: [] }));
  assert.equal(winningGuess(game), null);
});

test('a winner who has left is still named by index', () => {
  const game = parseGame(raw({
    has_claim: true,
    claimed: 0,
    guesses: [{ fields: { player: 9, text: 'zamek' } }],
  }));
  assert.deepEqual(winningGuess(game), { name: '#9', text: 'zamek', player: 9 });
});

// --- a host who runs the room without playing ---------------------------------

test('the host can take themselves off the roster and still start the game', () => {
  // Player zero is the host. With them inactive the game is still startable,
  // because starting is a host power, not a player one.
  const game = parseGame(raw({
    phase: PHASE.LOBBY,
    open: true,
    players: [
      { fields: { who: HOST, name: 'host', score: 0, active: false } },
      { fields: { who: ANNA, name: 'Anna', score: 0, active: true } },
      { fields: { who: PIOTR, name: 'Piotr', score: 0, active: true } },
    ],
  }));
  const view = viewFor(game, HOST, 0);
  assert.equal(view.canStartGame, true);
  assert.equal(view.activeCount, 2);
  // Not "waiting": waiting is for players in the lobby. A host who stepped
  // out is watching, and the round view tells them so.
  assert.equal(view.role, 'spectator');
  assert.equal(view.canPaint, false);
});

test('a host who is not playing cannot draw or guess', () => {
  const game = parseGame(raw({
    phase: PHASE.DRAWING,
    drawer: 1,
    players: [
      { fields: { who: HOST, name: 'host', score: 0, active: false } },
      { fields: { who: ANNA, name: 'Anna', score: 0, active: true } },
      { fields: { who: PIOTR, name: 'Piotr', score: 0, active: true } },
    ],
  }));
  const view = viewFor(game, HOST, 0);
  assert.equal(view.role, 'spectator');
  assert.equal(view.canGuess, false);
  assert.equal(view.canPaint, false);
});

test('a host who is not playing may still unstick a stalled round', () => {
  // The contract puts no sender check on timeout/forfeit/skip, and a host
  // running the room is exactly who notices a stall.
  const game = parseGame(raw({
    phase: PHASE.DRAWING,
    deadline_ms: '1000',
    players: [
      { fields: { who: HOST, name: 'host', score: 0, active: false } },
      { fields: { who: ANNA, name: 'Anna', score: 0, active: true } },
      { fields: { who: PIOTR, name: 'Piotr', score: 0, active: true } },
    ],
  }));
  assert.equal(viewFor(game, HOST, 9999).canUnstick, true);
  assert.equal(viewFor(game, ANNA, 9999).canUnstick, true);
  // A stranger holding no seat still cannot.
  assert.equal(viewFor(game, '0xdead', 9999).canUnstick, false);
});

test('the roster is editable only in the lobby', () => {
  const lobby = parseGame(raw({ phase: PHASE.LOBBY, open: true }));
  const playing = parseGame(raw({ phase: PHASE.DRAWING }));
  assert.equal(viewFor(lobby, HOST, 0).canEditRoster, true);
  assert.equal(viewFor(playing, HOST, 0).canEditRoster, false);
  assert.equal(viewFor(lobby, ANNA, 0).canEditRoster, false, 'guests never edit it');
});

test('two players are needed even when the host steps out', () => {
  const game = parseGame(raw({
    phase: PHASE.LOBBY,
    open: true,
    players: [
      { fields: { who: HOST, name: 'host', score: 0, active: false } },
      { fields: { who: ANNA, name: 'Anna', score: 0, active: true } },
    ],
  }));
  assert.equal(viewFor(game, HOST, 0).canStartGame, false);
  assert.equal(viewFor(game, HOST, 0).activeCount, 1);
});
