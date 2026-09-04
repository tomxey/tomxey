// Entry point for games.html.
//
// A guest arrives with ?game=…&k=… in the URL; anyone else is a prospective
// host. Those are the only two roles, and which one you are is decided here
// and nowhere else.
import { blake2b256 } from 'password_auth_wasm';

import { log, run } from '../app/shell.js';
import { createHostFlow } from './host.js';
import { hideHostUi, importGuest, joinIfNeeded } from './player.js';
import { createRoundView } from './round.js';

const guest = importGuest();

if (guest) {
  hideHostUi();
  run(null, async () => {
    await joinIfNeeded(guest);
    const round = createRoundView({
      store: guest.store,
      gameId: guest.gameId,
      client: guest.client,
      me: guest.me,
      blake2b256,
    });
    await round.start();
  });
} else {
  const host = createHostFlow({
    onReady: ({ store, gameId, client, me }) => {
      const round = createRoundView({ store, gameId, client, me, blake2b256 });

      // The lobby list and the round view share one poll: two intervals
      // hitting the same object would double the RPC traffic for nothing.
      const paint = round.refresh;
      round.refresh = async () => {
        const state = await paint();
        host.renderPlayers(state.game, state.view);
        return state;
      };
      run(null, () => round.start());
      // Returned so the host flow can drop a stale word and repaint when the
      // room changes.
      return round;
    },
  });
  log('unlock to create a room');
}
