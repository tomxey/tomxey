// Deployment constants. Fill in after publishing password_auth_move to
// testnet (the publish output lists both the package and its
// PackageMetadataV1 object). Values can also be overridden per-browser via
// the Settings panel (persisted in localStorage).
export const DEFAULTS = {
  packageId: '0x2b12619da2e4e75b36c0d1d739bf3d1be2773d4cd646207a367d9a9fad67c6a6',
  metadataId: '0xdab02752e316241fb6d41f9d5e0eb7e0f0f2d3c5b20c23668755ca2d984e49e8',
  todoItemPackageId: '0xb4259ca1304afaab2d2378945bd3ec1e175cdf0e3b451741d22f946417642d5f',
  recipePackageId: '0x01d91ac2f8d55b6b332a5afe8a6656359734895f56dc9780ce5177cb705446ba',
  // Calls target the latest version. Note that object types stay pinned to the
  // package that first defined the module, so an upgraded package can still
  // read and delete objects created by an earlier one — but *event* types
  // carry the executing package id, which is why the room list filters events
  // by sender and matches the type suffix rather than a full type string.
  kalamburyPackageId: '0x06e066af827780225772b052d63343889e9bb9843b44174256e114943f7d1165',
  // The password account that hosts games. Usually left empty: games.html
  // reads ?account=… from the URL, the same way todo.html does, so the host
  // uses whichever account their bookmarked link names.
  hostAccountId: '',
  // The retired whole-list-in-one-object package; still readable so existing
  // lists migrate to per-item objects on unlock.
  legacyTodoPackageId: '0x6167eabac87e35561d36fbadacf10e0e8002405f2f3e4e9b87b2dd2bcc495463',
  nodeUrl: 'https://api.testnet.iota.cafe',
  // Indexer-backed RPC: supports FromOrToAddress with archival fallback, so
  // history reaches arbitrarily far back. Falls back to nodeUrl if empty.
  indexerUrl: 'https://indexer.testnet.iota.cafe',
};

export const FAUCET_URL = 'https://faucet.testnet.iota.cafe';

const KEY = 'password-wallet-settings';

export function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    // Corrupt localStorage — fall back to defaults.
  }
  return { ...DEFAULTS, ...stored };
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
