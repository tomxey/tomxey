// Entry point for todo.html: unlock, then three tabs (items, recipes,
// history) sharing one chain session and one write queue.
import { normalizeIotaAddress } from '@iota/iota-sdk/utils';

import { fetchAccountPublicKey, makeClient } from '../chain.js';
import { loadSettings } from '../config.js';
import { offerPasswordSave } from '../password-save.js';
import { deriveSeed, publicKey } from '../wallet.js';
import { describeRecipe } from '../recipes/describe.js';
import { createRecipesTab } from '../recipes/main.js';
import { makeRecipeStore, recipeType } from '../recipes/recipes.js';
import { describeTodo } from '../todo/describe.js';
import { itemType, makeItemStore, migrateLegacyStore } from '../todo/items.js';
import { createTodoTab } from '../todo/main.js';
import { createHistoryTab } from './historyTab.js';
import { showNetwork } from '../network-label.js';
import { log, run, session, shorten } from './shell.js';

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
showNetwork(settings.network);
const params = new URLSearchParams(location.search);
const accountParam = params.get('account');
const username = params.get('username');

if (!accountParam || !username) {
  $('unlock-info').textContent =
    'Missing URL parameters — open this page as todo.html?account=0x…&username=…';
  $('unlock-btn').disabled = true;
} else {
  session.accountAddress = normalizeIotaAddress(accountParam);
  $('unlock-info').textContent = `account ${shorten(session.accountAddress)}`;
  $('unlock-username').value = username;
}

let tabs = null;

// --- unlock ------------------------------------------------------------------

$('unlock-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run($('unlock-btn'), async () => {
    const password = $('unlock-password').value;
    if (!password) throw new Error('password is required');

    log(`deriving key for "${username}" (Argon2id, ~1 s)…`);
    const seed = await deriveSeed(password, username);

    const client = makeClient(settings.nodeUrl);

    // Cheap wrong-password check against the on-chain pubkey, before any tx.
    const onChainPubkey = await fetchAccountPublicKey(client, session.accountAddress);
    if (onChainPubkey) {
      const derived = await publicKey(seed);
      if (!bytesEqual(derived, onChainPubkey)) {
        seed.fill(0);
        throw new Error('wrong password (public key mismatch)');
      }
      log('password verified against on-chain public key');
    } else {
      log('⚠ could not read the account public key — proceeding without verification');
    }

    session.client = client;
    session.seed = seed;

    await migrateLegacyStore({
      client,
      seed,
      accountAddress: session.accountAddress,
      packageId: settings.todoItemPackageId,
      legacyPackageId: settings.legacyTodoPackageId,
      log,
    });

    tabs = buildTabs();

    log('loading todo items…');
    await tabs.todo.refreshAll();
    log(`loaded ${tabs.todo.count()} item(s)`);

    await offerPasswordSave(username, password);
    $('unlock-section').hidden = true;
    $('tabs').hidden = false;
    $('unlock-password').value = '';
    showTab('items');
  });
});

function buildTabs() {
  const chain = {
    client: session.client,
    seed: session.seed,
    accountAddress: session.accountAddress,
    log,
  };

  const todo = createTodoTab({
    store: makeItemStore({ ...chain, packageId: settings.todoItemPackageId }),
  });

  // The recipes tab reaches into the todo tab only to copy ingredients into a
  // chosen item; todo owns its own state and writes, as before.
  const recipes = createRecipesTab({
    store: makeRecipeStore({ ...chain, packageId: settings.recipePackageId }),
    todo,
    configured: Boolean(settings.recipePackageId),
  });

  // History goes through the indexer endpoint when configured: it serves
  // FromOrToAddress with archival fallback, i.e. unlimited depth.
  const kinds = [{ type: itemType(settings.todoItemPackageId), describe: describeTodo }];
  if (settings.recipePackageId) {
    kinds.push({ type: recipeType(settings.recipePackageId), describe: describeRecipe });
  }
  const history = createHistoryTab({
    network: settings.network,
    client: settings.indexerUrl ? makeClient(settings.indexerUrl) : session.client,
    kinds,
    legacyType: `${settings.legacyTodoPackageId}::todo_store::TodoStore`,
  });

  return { todo, recipes, history };
}

// --- tabs --------------------------------------------------------------------

const TAB_SECTIONS = {
  items: 'todo-section',
  recipes: 'recipes-section',
  history: 'history-section',
};

function showTab(which) {
  for (const [name, sectionId] of Object.entries(TAB_SECTIONS)) {
    $(`tab-${name}`).classList.toggle('active', name === which);
    $(sectionId).hidden = name !== which;
  }
}

$('tab-items').addEventListener('click', () => showTab('items'));

$('tab-recipes').addEventListener('click', () => {
  showTab('recipes');
  run($('tab-recipes'), () => tabs.recipes.activate());
});

$('tab-history').addEventListener('click', () => {
  showTab('history');
  run($('tab-history'), () => tabs.history.activate());
});

function bytesEqual(a, b) {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
