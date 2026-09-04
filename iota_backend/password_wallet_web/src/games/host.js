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
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';

import { fetchAccountPublicKey, makeClient } from '../chain.js';
import { loadSettings } from '../config.js';
import { log, run, session } from '../app/shell.js';
import { deriveSeed, publicKey } from '../wallet.js';
import { deriveSlots, keypairFromSecret, slotUrl } from './guest.js';
import { renderQr } from './qr.js';
import {
  fetchGame,
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
  let store = null;

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

      const existing = recall(GAME_KEY);
      if (existing) await resume(existing, seed);
      else await create(seed);

      $('game-unlock-section').hidden = true;
      $('host-section').hidden = false;
      showSlot(0);
      onReady({ store, gameId, client, me: host.accountId, slots });
    });
  });

  async function create(seed) {
    const roomIndex = Number(recall(ROOM_KEY) ?? 0) + 1;
    slots = deriveSlots(seed, roomIndex, SLOT_COUNT, blake2b256);
    log(`creating room ${roomIndex} and funding ${slots.length} slots…`);
    const created = await store.createGame({ roomIndex, slots, fundingNanos: FUNDING_NANOS });
    gameId = created.gameId;
    remember(ROOM_KEY, roomIndex);
    remember(GAME_KEY, gameId);
    log(`room ready: ${gameId}`);
  }

  /// Re-derive the same slots for a game already on chain. The room index is
  /// read from the object, so this works even if localStorage lost it.
  async function resume(existingGameId, seed) {
    const game = parseGame(await fetchGame(session.client, existingGameId));
    gameId = existingGameId;
    slots = deriveSlots(seed, game.roomIndex, Math.max(SLOT_COUNT, game.slots.length), blake2b256);
    log(`resumed room ${game.roomIndex} with ${game.players.length} player(s)`);

    // A resumed room may have been swept, in which case joining fails with a
    // no-gas error that says nothing about the cause. Warn rather than fund:
    // spending 3.5 IOTA is the host's decision, not a side effect of unlocking.
    const short = slotsNeedingFunds(slots, await slotBalances(session.client, slots));
    if (short.length > 0) {
      log(`⚠ ${short.length} of ${slots.length} guests have no gas — press "Fund guests"`);
    }
  }

  function showSlot(index) {
    shown = Math.max(0, Math.min(index, slots.length - 1));
    const url = slotUrl(`${location.origin}${location.pathname}`, gameId, slots[shown].secretKey);
    renderQr($('host-qr'), url);
    $('host-qr-caption').textContent = `player ${shown + 1} of ${slots.length}`;
  }

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
