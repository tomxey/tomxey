// The round view, shared by the host and every guest.
//
// Rendering only: every "may I?" question is answered by `view.js`, and every
// transaction is built by `store.js`. The one piece of judgement that lives
// here is spotting the winning guess — and only the drawer's client can do
// that, because only it knows the word.
import { log, run } from '../app/shell.js';
import { newCommitment } from './commitment.js';
import { normaliseWord } from './normalise.js';
import { fetchGame } from './store.js';
import { parseGame, viewFor } from './view.js';
import { pickWord } from './words.js';

const $ = (id) => document.getElementById(id);
const POLL_MS = 1500;

const ROLE_TEXT = Object.freeze({
  waiting: 'Waiting for the host to start the game.',
  drawer: 'You are drawing. Show them, do not tell them.',
  guesser: 'Guess what is being drawn.',
  spectator: 'Watching.',
});

/// `gameId` may be a string or a getter — the host can switch rooms, and a
/// captured id would leave this view polling the room they just left.
export function createRoundView({ store, gameId, client, me, blake2b256 }) {
  const currentGame = () => (typeof gameId === 'function' ? gameId() : gameId);
  /// `{word, nonce}` while this client is the drawer. Never leaves the device
  /// until `reveal`.
  let secret = null;
  let used = [];
  let claiming = false;
  let timer = null;

  async function refresh() {
    const game = parseGame(await fetchGame(client, currentGame()));
    const view = viewFor(game, me, Date.now());
    render(game, view);
    // Only the drawer can tell a guess is right, so only the drawer claims.
    if (secret && !claiming) detectWinner(game);
    return { game, view };
  }

  function render(game, view) {
    $('round-section').hidden = false;
    $('round-status').textContent = `round ${game.round} · ${view.phaseLabel}`;
    $('round-role').textContent = ROLE_TEXT[view.role] ?? 'Watching.';

    // The word is shown only on the drawer's own device.
    $('round-word').textContent = secret ? secret.word : '';

    $('round-start').hidden = !view.canStartRound;
    $('round-guess-form').hidden = !view.canGuess;
    $('round-unstick').hidden = !view.canUnstick;
    if (view.canUnstick) {
      $('round-unstick').textContent =
        view.unstickAction === 'timeout'
          ? 'Nobody guessed — next player'
          : view.unstickAction === 'forfeit'
            ? 'Drawer never confirmed — next player'
            : 'Drawer is away — skip them';
    }

    const remaining = Math.max(0, game.deadlineMs - Date.now());
    $('round-clock').textContent = remaining > 0 ? `${Math.ceil(remaining / 1000)}s` : '';

    renderList($('round-feed'), game.guesses, (guess) => {
      const who = game.players[guess.player]?.name ?? `#${guess.player}`;
      return { who, text: guess.text, correct: game.hasClaim && game.claimed === guess.player };
    });

    const scores = $('score-list');
    scores.replaceChildren();
    for (const player of view.scoreboard) {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = player.name;
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = String(player.score);
      li.append(who, score);
      if (!player.active) li.className = 'inactive';
      scores.appendChild(li);
    }
  }

  function renderList(element, items, describe) {
    element.replaceChildren();
    for (const item of items) {
      const { who, text, correct } = describe(item);
      const li = document.createElement('li');
      if (correct) li.className = 'correct';
      const label = document.createElement('span');
      label.className = 'who';
      label.textContent = who;
      li.append(label, document.createTextNode(text));
      element.appendChild(li);
    }
  }

  /// The drawer's client compares each guess to the word it holds. `claiming`
  /// guards against the poll firing again while the claim is still in flight
  /// and submitting it twice.
  function detectWinner(game) {
    const index = game.guesses.findIndex((guess) => normaliseWord(guess.text) === secret.word);
    if (index === -1) return;

    claiming = true;
    run(null, async () => {
      try {
        log(`"${game.guesses[index].text}" is right — claiming`);
        await store.claimWinner(currentGame(), index);
        await store.reveal(currentGame(), secret.word, secret.nonce);
        log('revealed, round over');
        secret = null;
      } finally {
        claiming = false;
      }
      await refresh();
    });
  }

  $('round-start').addEventListener('click', () =>
    run($('round-start'), async () => {
      const word = pickWord(used);
      used.push(word);
      secret = newCommitment(word, blake2b256);
      log(`your word: ${secret.word}`);
      await store.startRound(currentGame(), secret.commitment);
      await refresh();
    }),
  );

  $('round-guess-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = normaliseWord($('round-guess-input').value);
    if (!text) return;
    $('round-guess-input').value = '';
    run(null, async () => {
      await store.guess(currentGame(), text);
      await refresh();
    });
  });

  $('round-unstick').addEventListener('click', () =>
    run($('round-unstick'), async () => {
      const { view } = await refresh();
      if (!view.canUnstick) return;
      if (view.unstickAction === 'timeout') await store.timeoutRound(currentGame());
      else if (view.unstickAction === 'forfeit') await store.forfeitRound(currentGame());
      else await store.skipDrawer(currentGame());
      // A round this client was drawing is over; drop the word.
      secret = null;
      await refresh();
    }),
  );

  function start() {
    if (timer !== null) return;
    timer = setInterval(() => {
      refresh().catch((error) => console.warn('poll failed', error));
    }, POLL_MS);
    return refresh();
  }

  /// Drop the drawer's word. Called when the host switches rooms: claiming a
  /// word from the previous room in this one would be a wrong claim.
  function clearSecret() {
    secret = null;
    used = [];
  }

  return { start, refresh, clearSecret };
}
