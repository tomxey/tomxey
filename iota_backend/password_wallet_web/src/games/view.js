// Turning the on-chain game object into "what may this client do now".
//
// Pure on purpose. Every guard here mirrors one the contract enforces, so the
// UI can grey out a button the chain would reject — but the chain remains the
// authority, and this module deciding wrongly can only ever mislead the player,
// never let them cheat.

export const PHASE = Object.freeze({
  LOBBY: 0,
  READY: 1,
  DRAWING: 2,
  REVEAL: 3,
});

const PHASE_LABELS = Object.freeze({
  [PHASE.LOBBY]: 'waiting for players',
  [PHASE.READY]: 'waiting for the drawer',
  [PHASE.DRAWING]: 'drawing',
  [PHASE.REVEAL]: 'checking the answer',
});

/// RPC wraps Move structs as `{type, fields}` in some shapes and returns them
/// bare in others, so unwrap defensively rather than assuming one.
const unwrap = (entry) => entry?.fields ?? entry ?? {};

/// u64 comes back as a string, u8/u16/u32 as numbers.
const number = (value) => Number(value ?? 0);

export function parseGame(fields) {
  return {
    host: fields.host,
    roomIndex: number(fields.room_index),
    open: Boolean(fields.open),
    phase: number(fields.phase),
    drawer: number(fields.drawer),
    round: number(fields.round),
    deadlineMs: number(fields.deadline_ms),
    hasClaim: Boolean(fields.has_claim),
    claimed: number(fields.claimed),
    // Needed to close the room: `close_game` deletes both objects together.
    canvasId: fields.canvas_id,
    players: (fields.players ?? []).map((entry) => {
      const player = unwrap(entry);
      return {
        who: player.who,
        name: player.name,
        score: number(player.score),
        active: Boolean(player.active),
      };
    }),
    slots: (fields.slots ?? []).map((entry) => {
      const slot = unwrap(entry);
      return { who: slot.who, claimed: Boolean(slot.claimed) };
    }),
    guesses: (fields.guesses ?? []).map((entry) => {
      const guess = unwrap(entry);
      return { player: number(guess.player), text: guess.text };
    }),
  };
}

/// The canvas object as the round view wants it.
///
/// `pixels` comes back as a plain number array — verified against a real
/// object holding a 344-byte drawing, not assumed. `decodeRle` tolerates
/// whatever these bytes turn out to be, so a surprise here degrades to a
/// partial drawing rather than a thrown render.
export function parseCanvas(fields) {
  if (!fields) return null;
  return { version: number(fields.version), pixels: Uint8Array.from(fields.pixels ?? []) };
}

/// Label each funded slot with whoever claimed it.
///
/// A slot is an address the host funded, not a person. Every slot exists and
/// is funded from the moment the room is created, so labelling them "player 1"
/// through "player 7" made five addresses nobody had scanned look like five
/// players holding gas.
export function describeSlots(slots, players) {
  const byAddress = new Map((players ?? []).map((player) => [player.who, player]));
  return slots.map((slot, index) => {
    const player = byAddress.get(slot.address ?? slot.who);
    if (!player) return `slot ${index + 1} · unclaimed`;
    return player.active ? player.name : `${player.name} (removed)`;
  });
}

/// The guess that ended the round, once the drawer has claimed one.
///
/// The claimed guess *is* the word — `reveal` asserts they are byte-equal — so
/// this is also how everyone learns what was being drawn. The game object
/// never stores the word itself.
export function winningGuess(game) {
  if (!game.hasClaim) return null;
  const guess = game.guesses[game.claimed];
  if (!guess) return null;
  return {
    name: game.players[guess.player]?.name ?? `#${guess.player}`,
    text: guess.text,
    player: guess.player,
  };
}

/// `me` is this client's address; `nowMs` is wall-clock time, passed in so the
/// function stays pure and the deadline logic is testable.
export function viewFor(game, me, nowMs) {
  const index = game.players.findIndex((player) => player.who === me);
  const player = index >= 0 ? game.players[index] : null;
  const isPlaying = player !== null && player.active;

  // `drawer` is 0 in the lobby because it has to be *something*, which would
  // otherwise make player zero — the host — read as the drawer before the
  // game has even started. Nobody draws until there is a round.
  const isDrawer = isPlaying && index === game.drawer && game.phase !== PHASE.LOBBY;
  const role = !isPlaying
    ? 'spectator'
    : game.phase === PHASE.LOBBY
      ? 'waiting'
      : isDrawer
        ? 'drawer'
        : 'guesser';

  const expired = nowMs > game.deadlineMs;
  const unstickAction =
    game.phase === PHASE.DRAWING
      ? 'timeout'
      : game.phase === PHASE.REVEAL
        ? 'forfeit'
        : game.phase === PHASE.READY
          ? 'skip'
          : null;

  const activeCount = game.players.filter((p) => p.active).length;

  return {
    role,
    myIndex: index,
    isHost: me === game.host,
    phaseLabel: PHASE_LABELS[game.phase] ?? 'unknown',

    canStartGame: me === game.host && game.phase === PHASE.LOBBY && activeCount >= 2,
    canStartRound: isDrawer && game.phase === PHASE.READY,
    // The contract rejects paint outside DRAWING, so the pen must go away
    // between rounds — the drawer holds the role in READY too.
    canPaint: isDrawer && game.phase === PHASE.DRAWING,
    // The drawer knows the word, so the contract rejects a guess from them.
    canGuess: role === 'guesser' && game.phase === PHASE.DRAWING && !expired,
    canUnstick: expired && unstickAction !== null && isPlaying,
    unstickAction,

    scoreboard: [...game.players].sort((a, b) => b.score - a.score),
  };
}
