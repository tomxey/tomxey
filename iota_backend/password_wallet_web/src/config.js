// Deployment constants. Values can also be overridden per-browser via the
// Settings panel (persisted in localStorage).
//
// The pages do not all live on the same network. The wallet, todo list and
// recipes are on testnet, because that is where the user's data already is and
// a devnet reset would take it with them. The game is on devnet: it writes a
// drawing frame every couple of seconds, which is a lot of traffic to put on a
// network other people share, and a room lost to a reset costs nothing.
//
// Everything network-shaped therefore lives in NETWORKS, and a page asks for
// the one it wants. A `?network=` parameter overrides it, which is how a host
// creates an account on the same network their game runs on.

export const NETWORKS = {
  testnet: {
    nodeUrl: 'https://api.testnet.iota.cafe',
    // Indexer-backed RPC: supports FromOrToAddress with archival fallback, so
    // history reaches arbitrarily far back. Falls back to nodeUrl if empty.
    indexerUrl: 'https://indexer.testnet.iota.cafe',
    // Push updates. Note this is NOT the GraphQL HTTP URL and NOT the node
    // URL: the bare host and /graphql both close with 1006. Empty disables
    // push and leaves the games page polling only.
    subscriptionUrl: 'wss://graphql.testnet.iota.cafe/subscriptions',
    faucetUrl: 'https://faucet.testnet.iota.cafe',

    packageId: '0x2b12619da2e4e75b36c0d1d739bf3d1be2773d4cd646207a367d9a9fad67c6a6',
    metadataId: '0xdab02752e316241fb6d41f9d5e0eb7e0f0f2d3c5b20c23668755ca2d984e49e8',
    todoItemPackageId: '0xb4259ca1304afaab2d2378945bd3ec1e175cdf0e3b451741d22f946417642d5f',
    recipePackageId: '0x01d91ac2f8d55b6b332a5afe8a6656359734895f56dc9780ce5177cb705446ba',
    // The retired whole-list-in-one-object package; still readable so existing
    // lists migrate to per-item objects on unlock.
    legacyTodoPackageId: '0x6167eabac87e35561d36fbadacf10e0e8002405f2f3e4e9b87b2dd2bcc495463',
    // Kept so a room created while the game lived here can still be opened
    // with ?network=testnet. Calls target the latest version; object types
    // stay pinned to the package that first defined the module.
    kalamburyPackageId: '0xd64e3ab56d2da4e964be27a668aef50c84d64906e27b6ac8b8fdb0e37030a259',
  },

  devnet: {
    nodeUrl: 'https://api.devnet.iota.cafe',
    indexerUrl: 'https://indexer.devnet.iota.cafe',
    subscriptionUrl: 'wss://graphql.devnet.iota.cafe/subscriptions',
    faucetUrl: 'https://faucet.devnet.iota.cafe',

    packageId: '0x6a1e37e91afd5f84e3eb61f7b9dbe29efb1b0af549a6cfa0750ff7c417457730',
    metadataId: '0x2b0c19a2df2af3c7e2d84791871f635cc111ada7f0d8128d6957c89803245924',
    // Only the game moved here. The todo list and recipes stay on testnet with
    // the user's data, so these are deliberately empty: todo.html?network=devnet
    // would find no package, which is the honest answer rather than a wrong id.
    todoItemPackageId: '',
    recipePackageId: '',
    legacyTodoPackageId: '',
    kalamburyPackageId: '0x093e1efb7fe4957000b0c9af87b3faa32362b62f2570af001b774a93da1cf722',
  },
};

/// Which network each page defaults to.
export const WALLET_NETWORK = 'testnet';
export const GAME_NETWORK = 'devnet';

const KEY = 'password-wallet-settings';

/// Anything that is not network-shaped, and survives a network switch.
const SHARED_DEFAULTS = {
  // The password account that hosts games. Usually left empty: games.html
  // reads ?account=… from the URL, the same way todo.html does, so the host
  // uses whichever account their bookmarked link names.
  hostAccountId: '',
};

/// The network a page should use: `?network=` if it names a real one,
/// otherwise the page's own default. An unknown name falls back rather than
/// producing a settings object full of undefined endpoints.
export function networkFrom(search, fallback) {
  const asked = new URLSearchParams(search ?? '').get('network');
  return asked && NETWORKS[asked] ? asked : fallback;
}

function settingsFor(network) {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    // Corrupt localStorage — fall back to defaults.
  }
  return { ...SHARED_DEFAULTS, ...NETWORKS[network], ...stored, network };
}

/// Settings for the wallet, todo list and recipes.
export function loadSettings() {
  return settingsFor(networkFrom(globalThis.location?.search, WALLET_NETWORK));
}

/// Settings for games.html, which runs on a different network to the rest.
///
/// Stored overrides are ignored for the endpoints here: a Settings panel value
/// saved while the game was on testnet would otherwise quietly point the game
/// at the wrong chain, where its package does not exist.
export function loadGameSettings() {
  const network = networkFrom(globalThis.location?.search, GAME_NETWORK);
  return { ...settingsFor(network), ...NETWORKS[network], network };
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

/// Kept for callers that just want the current wallet network's faucet.
export const FAUCET_URL = NETWORKS[WALLET_NETWORK].faucetUrl;
