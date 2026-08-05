// Deployment constants. Fill in after publishing password_auth_move to
// testnet (the publish output lists both the package and its
// PackageMetadataV1 object). Values can also be overridden per-browser via
// the Settings panel (persisted in localStorage).
export const DEFAULTS = {
  packageId: '0x2b12619da2e4e75b36c0d1d739bf3d1be2773d4cd646207a367d9a9fad67c6a6',
  metadataId: '0xdab02752e316241fb6d41f9d5e0eb7e0f0f2d3c5b20c23668755ca2d984e49e8',
  todoItemPackageId: '0xb4259ca1304afaab2d2378945bd3ec1e175cdf0e3b451741d22f946417642d5f',
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
