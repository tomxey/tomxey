// Host flow: unlock the password account, create the room, fund the slots,
// and hand out one QR per guest.
//
// The slot keys are derived from the host's seed, so unlocking again after a
// reload reproduces the same addresses — which is what lets a guest who
// cleared their browser rescan and rejoin, and lets the host sweep the
// leftover gas afterwards.
// The web WASM build; `guest.js` and `commitment.js` take the hash as a
// parameter so they stay testable in node, and this is where it comes from.
import { blake2b256 } from 'password_auth_wasm';
import { NANOS_PER_IOTA, normalizeIotaAddress } from '@iota/iota-sdk/utils';

import { fetchAccountPublicKey, makeClient } from '../chain.js';
import { loadSettings } from '../config.js';
import { log, run, session, trimZeros } from '../app/shell.js';
import { deriveSeed, publicKey } from '../wallet.js';
import { deriveSlots, keypairFromSecret, slotUrl } from './guest.js';
import { renderQr } from './qr.js';
import { offerPasswordSave } from '../password-save.js';
import {
  fetchGame,
  listRooms,
  MIN_SLOT_NANOS,
  makeGameStore,
  slotBalances,
  slotsNeedingFunds,
  sweepSlots,
} from './store.js';
import { parseGame } from './view.js';

const $ = (id) => document.getElementById(id);

const SLOT_COUNT = 7;
/// 0.5 IOTA each: a guess costs a few million nanos, so this covers a long
/// game with room to spare, and the host sweeps the rest back.
const FUNDING_NANOS = 500_000_000;

const ROOM_KEY = 'kalambury-room';
const GAME_KEY = 'kalambury-game';

const remember = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private mode: the host can still play, just not resume after a reload.
  }
};
const recall = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/// Which password account hosts the game. Taken from the URL the same way
/// todo.html takes it, so one bookmarked link per account works without
/// editing config.js; `hostAccountId` is only the fallback.
function resolveHostAccount(settings) {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('account');
  return {
    accountId: fromUrl ? normalizeIotaAddress(fromUrl) : settings.hostAccountId,
    username: params.get('username') ?? '',
  };
}

export function createHostFlow({ onReady }) {
  const settings = loadSettings();
  const host = resolveHostAccount(settings);
  let slots = [];
  let shown = 0;
  let gameId = null;
  let canvasId = null;
  let roomIndex = 0;
  let rooms = [];
  let store = null;
  /// The round view, so switching rooms can drop a stale word and repaint.
  let round = null;

  $('game-unlock-info').textContent = !settings.kalamburyPackageId
    ? 'No kalambury package configured yet (kalamburyPackageId).'
    : !host.accountId
      ? 'Open this page as games.html?account=0x…&username=… to host.'
      : 'Guests need no account — you fund them.';
  if (host.username) $('game-unlock-username').value = host.username;

  $('game-unlock-form').addEventListener('submit', (event) => {
    event.preventDefault();
    run($('game-unlock-btn'), async () => {
      const username = $('game-unlock-username').value.trim();
      const password = $('game-unlock-password').value;
      if (!username || !password) throw new Error('username and password are required');
      if (!settings.kalamburyPackageId) throw new Error('set kalamburyPackageId first');
      if (!host.accountId) throw new Error('no account — open games.html?account=0x…');

      log('deriving key (Argon2id, ~1 s)…');
      const seed = await deriveSeed(password, username);
      const client = makeClient(settings.nodeUrl);

      // Cheap wrong-password check before spending anything.
      const onChain = await fetchAccountPublicKey(client, host.accountId);
      if (onChain) {
        const derived = await publicKey(seed);
        if (!bytesEqual(derived, onChain)) {
          seed.fill(0);
          throw new Error('wrong password (public key mismatch)');
        }
        log('password verified against the on-chain public key');
      }

      session.client = client;
      session.seed = seed;
      session.accountAddress = host.accountId;
      $('game-unlock-password').value = '';

      store = makeGameStore({
        client,
        packageId: settings.kalamburyPackageId,
        identity: { kind: 'host', seed, accountAddress: host.accountId },
        log,
      });

      // Same call the todo page makes, and the reason this page never offered
      // to save the password: it was simply missing here.
      await offerPasswordSave(username, password);

      rooms = await listRooms({ client, host: host.accountId, log });
      const remembered = recall(GAME_KEY);
      const chosen = rooms.find((room) => room.gameId === remembered) ?? rooms[0] ?? null;
      if (chosen) await openRoom(chosen);
      else await createRoom();

      $('game-unlock-section').hidden = true;
      $('host-section').hidden = false;
      renderRooms();
      showSlot(0);
      // `gameId` is passed as a getter so switching rooms retargets the poll
      // instead of leaving the view on the room the host just left.
      round = onReady({ store, gameId: () => gameId, client, me: host.accountId, slots });
      await refreshGasList();
    });
  });

  /// A room index nobody has used. Taken from the rooms actually on chain, not
  /// only from localStorage — clearing storage used to reset the counter and
  /// re-derive an existing room's guest keys.
  function nextRoomIndex() {
    const known = rooms.map((room) => room.roomIndex);
    return Math.max(0, Number(recall(ROOM_KEY) ?? 0), ...known) + 1;
  }

  async function createRoom() {
    roomIndex = nextRoomIndex();
    slots = deriveSlots(session.seed, roomIndex, SLOT_COUNT, blake2b256);
    log(`creating room ${roomIndex} and funding ${slots.length} slots…`);
    const created = await store.createGame({ roomIndex, slots, fundingNanos: FUNDING_NANOS });
    gameId = created.gameId;
    canvasId = created.canvasId;
    rooms = [{ gameId, canvasId, roomIndex }, ...rooms];
    remember(ROOM_KEY, roomIndex);
    remember(GAME_KEY, gameId);
    log(`room ${roomIndex} ready: ${gameId}`);
  }

  /// Point at an existing room and re-derive its guest keys. Reads the object
  /// rather than trusting the event, so a room created before the contract
  /// emitted events still works and the slot count matches what is on chain.
  async function openRoom(room) {
    const game = parseGame(await fetchGame(session.client, room.gameId));
    gameId = room.gameId;
    roomIndex = game.roomIndex;
    canvasId = room.canvasId ?? game.canvasId;
    slots = deriveSlots(
      session.seed,
      roomIndex,
      Math.max(SLOT_COUNT, game.slots.length),
      blake2b256,
    );
    remember(ROOM_KEY, roomIndex);
    remember(GAME_KEY, gameId);
    log(`room ${roomIndex}: ${game.players.length} player(s)`);

    // A room may have been swept, in which case joining fails with a no-gas
    // error that says nothing about the cause. Warn rather than fund: spending
    // 3.5 IOTA is the host's decision, not a side effect of opening a room.
    const short = slotsNeedingFunds(slots, await slotBalances(session.client, slots));
    if (short.length > 0) {
      log(`⚠ ${short.length} of ${slots.length} guests have no gas — press "Fund guests"`);
    }
  }

  function renderRooms() {
    const select = $('room-select');
    select.replaceChildren();
    for (const room of rooms) {
      const option = document.createElement('option');
      option.value = room.gameId;
      option.textContent = `room ${room.roomIndex} · ${room.gameId.slice(0, 10)}…`;
      option.selected = room.gameId === gameId;
      select.appendChild(option);
    }
    select.disabled = rooms.length < 2;
    $('room-close').disabled = !gameId || !canvasId;
  }

  /// Repaint after the room changed under us.
  async function switchTo(room) {
    round?.clearSecret();
    await openRoom(room);
    renderRooms();
    showSlot(0);
    await refreshGasList();
    await round?.refresh();
  }

  /// Host balance plus every guest's, because "it said no funds" was
  /// impossible to diagnose from the UI.
  async function refreshGasList() {
    const list = $('gas-list');
    const row = (name, nanos, low) => {
      const li = document.createElement('li');
      if (low) li.className = 'inactive';
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = name;
      const amount = document.createElement('span');
      amount.className = 'score';
      amount.textContent = `${trimZeros((nanos / Number(NANOS_PER_IOTA)).toFixed(3))} IOTA`;
      li.append(who, amount);
      return li;
    };

    let hostNanos = 0;
    try {
      const balance = await session.client.getBalance({ owner: host.accountId });
      hostNanos = Number(balance.totalBalance);
    } catch (error) {
      log(`could not read your balance: ${error.message ?? error}`);
    }
    const balances = await slotBalances(session.client, slots);

    list.replaceChildren();
    list.appendChild(row('your account', hostNanos, hostNanos < FUNDING_NANOS));
    balances.forEach((nanos, index) =>
      list.appendChild(row(`player ${index + 1}`, nanos, nanos < MIN_SLOT_NANOS)),
    );
  }

  function showSlot(index) {
    // No room open — deleting the last one leaves the navigation buttons live.
    if (slots.length === 0 || !gameId) {
      $('host-qr').replaceChildren();
      $('host-qr-caption').textContent = 'no room open';
      return;
    }
    shown = Math.max(0, Math.min(index, slots.length - 1));
    const url = slotUrl(`${location.origin}${location.pathname}`, gameId, slots[shown].secretKey);
    renderQr($('host-qr'), url);
    $('host-qr-caption').textContent = `player ${shown + 1} of ${slots.length}`;
  }

  $('room-select').addEventListener('change', (event) => {
    const room = rooms.find((candidate) => candidate.gameId === event.target.value);
    if (room) run(null, () => switchTo(room));
  });

  $('room-new').addEventListener('click', () =>
    run($('room-new'), async () => {
      round?.clearSecret();
      await createRoom();
      renderRooms();
      showSlot(0);
      await refreshGasList();
      await round?.refresh();
    }),
  );

  $('room-close').addEventListener('click', () =>
    run($('room-close'), async () => {
      // Irreversible, and the guests' gas is not part of the refund — losing
      // that silently would be worse than an extra prompt.
      if (!confirm(`Delete room ${roomIndex}? The game and its scores are gone for good.`)) {
        return;
      }
      const closing = gameId;
      await store.closeGame(closing, canvasId);
      log(`deleted room ${roomIndex}, storage deposit refunded`);

      rooms = rooms.filter((room) => room.gameId !== closing);
      round?.clearSecret();
      if (rooms.length > 0) {
        await switchTo(rooms[0]);
      } else {
        // Nothing left to show, and creating one silently would spend 3.5
        // IOTA the host did not ask for.
        gameId = null;
        canvasId = null;
        slots = [];
        // Leaving the last room's QR on screen would invite guests into an
        // object that no longer exists.
        $('host-qr').replaceChildren();
        $('host-qr-caption').textContent = '';
        renderRooms();
        await refreshGasList();
        log('no rooms left — press "New room" to make one');
      }
    }),
  );

  $('host-next-slot').addEventListener('click', () => showSlot(shown + 1));
  $('host-prev-slot').addEventListener('click', () => showSlot(shown - 1));

  $('host-start').addEventListener('click', () =>
    run($('host-start'), async () => {
      await store.startGame(gameId);
      log('game started — no more players can join');
      $('host-section').hidden = true;
    }),
  );

  /// Top up whichever slots are short. Idempotent: a room that is already
  /// funded costs nothing to press this on.
  async function fundShortSlots() {
    const balances = await slotBalances(session.client, slots);
    const needy = slotsNeedingFunds(slots, balances);
    if (needy.length === 0) {
      log('every guest already has gas');
      return 0;
    }
    log(`funding ${needy.length} guest(s)…`);
    await store.fundSlots({ slots: needy, fundingNanos: FUNDING_NANOS });
    log(`funded ${needy.length} guest(s)`);
    await refreshGasList();
    return needy.length;
  }

  $('host-fund').addEventListener('click', () => run($('host-fund'), fundShortSlots));

  $('host-sweep').addEventListener('click', () =>
    run($('host-sweep'), async () => {
      // Easy to press mid-game by mistake, and the symptom lands on a guest
      // ("no funds" when joining) rather than on whoever pressed it.
      if (!confirm('Take every guest’s gas back? Nobody can play until you fund them again.')) {
        return;
      }
      // No contract entry point exists for this, and none can: the coins sit
      // in the guests' own addresses, so only the key holder can move them.
      const withKeys = slots.map((slot) => ({ ...slot, keypair: keypairFromSecret(slot.secretKey) }));
      const swept = await sweepSlots({
        client: session.client,
        slots: withKeys,
        to: session.accountAddress,
        log,
      });
      log(`swept ${swept} slot(s) back to the host`);
      await refreshGasList();
    }),
  );

  /// Refresh the lobby list. Called by the page after each poll.
  function renderPlayers(game, view) {
    const list = $('player-list');
    list.replaceChildren();
    game.players.forEach((player, index) => {
      const li = document.createElement('li');
      if (!player.active) li.className = 'inactive';
      const name = document.createElement('span');
      name.textContent = index === 0 ? `${player.name} (host)` : player.name;
      li.appendChild(name);

      if (view.isHost && index !== 0 && player.active) {
        const kick = document.createElement('button');
        kick.className = 'icon-btn';
        kick.textContent = '✕';
        kick.title = 'remove this player';
        kick.addEventListener('click', () =>
          run(kick, async () => {
            await store.kick(gameId, index);
            log(`removed ${player.name}`);
          }),
        );
        li.appendChild(kick);
      }
      list.appendChild(li);
    });
    $('host-start').disabled = !view.canStartGame;
  }

  return { renderPlayers };
}

function bytesEqual(a, b) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
