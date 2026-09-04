// Guest flow: import the slot key from the invitation URL and join.
//
// A guest has no password account and no faucet round — the host already
// funded this address, so the very first thing this key does is send a
// transaction.
import { makeClient } from '../chain.js';
import { loadSettings } from '../config.js';
import { log, session } from '../app/shell.js';
import { keypairFromSecret, parseSlotUrl } from './guest.js';
import { fetchGame, makeGameStore } from './store.js';
import { parseGame } from './view.js';

const $ = (id) => document.getElementById(id);

const NAME_KEY = 'kalambury-name';

/// This client's guest context, or null if the page was not opened from an
/// invitation.
export function importGuest() {
  const parsed = parseSlotUrl(location.search);
  if (!parsed) return null;

  const settings = loadSettings();
  const keypair = keypairFromSecret(parsed.secretKey);
  const client = makeClient(settings.nodeUrl);
  const me = keypair.getPublicKey().toIotaAddress();

  session.client = client;
  session.accountAddress = me;

  return {
    gameId: parsed.gameId,
    keypair,
    client,
    me,
    store: makeGameStore({
      client,
      packageId: settings.kalamburyPackageId,
      identity: { kind: 'guest', keypair },
      log,
    }),
  };
}

/// Join, unless this slot has already joined — which is the case whenever a
/// guest reloads, or rescans the QR the host re-showed them.
export async function joinIfNeeded(guest) {
  const game = parseGame(await fetchGame(guest.client, guest.gameId));
  const already = game.players.some((player) => player.who === guest.me);
  if (already) {
    log('rejoined — you were already in this game');
    return;
  }

  const remembered = (() => {
    try {
      return localStorage.getItem(NAME_KEY);
    } catch {
      return null;
    }
  })();
  const name = (remembered || prompt('Your name?') || 'player').slice(0, 24);
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode: they will be asked again next time.
  }

  log(`joining as ${name}…`);
  await guest.store.join(guest.gameId, name);
  log('joined');
}

export function hideHostUi() {
  $('game-unlock-section').hidden = true;
  $('host-section').hidden = true;
}
