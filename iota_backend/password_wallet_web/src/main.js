import { NANOS_PER_IOTA } from '@iota/iota-sdk/utils';

import {
  createAccount,
  makeClient,
  makeThrowawayFunder,
  sweepFunds,
  transferFromAccount,
  waitForFunds,
} from './chain.js';
import { loadSettings, saveSettings } from './config.js';
import { offerPasswordSave } from './password-save.js';
import { deriveSeed, publicKey } from './wallet.js';

const $ = (id) => document.getElementById(id);
const logEl = $('log');

function log(message) {
  logEl.textContent += `${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function logError(error) {
  console.error(error);
  log(`❌ ${error.message ?? error}`);
}

// --- settings ---------------------------------------------------------------

const settingsInputs = {
  packageId: $('package-id'),
  metadataId: $('metadata-id'),
  recipePackageId: $('recipe-package-id'),
  nodeUrl: $('node-url'),
  indexerUrl: $('indexer-url'),
};

const settings = loadSettings();
for (const [key, input] of Object.entries(settingsInputs)) {
  input.value = settings[key];
  input.addEventListener('change', () => {
    settings[key] = input.value.trim();
    saveSettings(settings);
  });
}

function requireSettings(keys) {
  for (const key of keys) {
    if (!settings[key]) {
      throw new Error(`missing "${key}" — fill it in under Settings`);
    }
  }
}

// --- create wallet ----------------------------------------------------------

$('create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run($('create-btn'), async () => {
    requireSettings(['packageId', 'metadataId', 'nodeUrl']);
    const username = $('create-username').value.trim();
    const password = $('create-password').value;
    if (!username || !password) throw new Error('username and password are required');
    if (password !== $('create-password2').value) throw new Error('passwords do not match');

    log(`deriving key for "${username}" (Argon2id, ~1 s)…`);
    const seed = await deriveSeed(password, username);
    const pubkey = await publicKey(seed);
    seed.fill(0);

    const client = makeClient(settings.nodeUrl);
    const { funder, address: funderAddress } = makeThrowawayFunder();
    log('the testnet faucet is captcha-gated, so this step is manual:');
    log(`➡ open ${settings.faucetUrl} and send funds to this one-time address:`);
    log(`   ${funderAddress}`);
    log('waiting for the funds to arrive…');
    await waitForFunds(client, funderAddress, log);

    const { accountId, gasRef } = await createAccount({
      client,
      funder,
      packageId: settings.packageId,
      metadataId: settings.metadataId,
      pubkey,
      log,
    });
    log(`✅ wallet created: ${accountId}`);

    // Give the wallet gas without a second captcha round.
    await sweepFunds({ client, funder, gasRef, recipient: accountId, log });
    $('send-account').value = accountId;
    log('wallet is funded and ready — use "Send funds" below.');
    log(`todo list for this wallet: todo.html?account=${accountId}&username=${encodeURIComponent(username)}`);
    await offerPasswordSave(username, password);
  });
});

// --- send funds -------------------------------------------------------------

$('send-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run($('send-btn'), async () => {
    requireSettings(['nodeUrl']);
    const accountId = $('send-account').value.trim();
    const username = $('send-username').value.trim();
    const password = $('send-password').value;
    const recipient = $('send-recipient').value.trim();
    const amountIota = Number($('send-amount').value);
    if (!accountId || !username || !password || !recipient) {
      throw new Error('account, username, password, and recipient are required');
    }
    if (!(amountIota > 0)) throw new Error('amount must be positive');

    log(`deriving key for "${username}" (Argon2id, ~1 s)…`);
    const seed = await deriveSeed(password, username);
    try {
      const digest = await transferFromAccount({
        client: makeClient(settings.nodeUrl),
        seed,
        accountId,
        recipient,
        amountNanos: BigInt(Math.round(amountIota * Number(NANOS_PER_IOTA))),
        log,
      });
      log(`✅ transfer executed: ${digest}`);
      await offerPasswordSave(username, password);
    } finally {
      seed.fill(0);
    }
  });
});

// --- helpers ----------------------------------------------------------------

async function run(button, task) {
  button.disabled = true;
  try {
    await task();
  } catch (error) {
    logError(error);
  } finally {
    button.disabled = false;
  }
}
