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

/// `me` is this client's address; `nowMs` is wall-clock time, passed in so the
/// function stays pure and the deadline logic is testable.
export function viewFor(game, me, nowMs) {
  const index = game.players.findIndex((player) => player.who === me);
  const player = index >= 0 ? game.players[index] : null;
  const isPlaying = player !== null && player.active;

  const isDrawer = isPlaying && index === game.drawer;
  const role = !isPlaying ? 'spectator' : isDrawer ? 'drawer' : 'guesser';

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
    // The drawer knows the word, so the contract rejects a guess from them.
    canGuess: role === 'guesser' && game.phase === PHASE.DRAWING && !expired,
    canUnstick: expired && unstickAction !== null && isPlaying,
    unstickAction,

    scoreboard: [...game.players].sort((a, b) => b.score - a.score),
  };
}
