// Chain interaction: account creation, faucet funding, and password-signed
// transfers, via the published @iota/iota-sdk (JSON-RPC) plus the WASM crypto.
import { IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { Transaction, TransactionDataBuilder } from '@iota/iota-sdk/transactions';
import { fromHex, normalizeIotaAddress, NANOS_PER_IOTA } from '@iota/iota-sdk/utils';
import { fromBase58, fromBase64, toBase64 } from '@iota/bcs';

import { BASE_GAS_BUDGET } from './app/gas.js';
import { moveAuthenticatorSignature, signDigest } from './wallet.js';

const MODULE_NAME = 'password_account';
const AUTHENTICATE_FN_NAME = 'authenticate';
const GAS_BUDGET = BASE_GAS_BUDGET;

export function makeClient(nodeUrl) {
  return new IotaClient({ url: nodeUrl });
}

/// Wait (up to ~10 min) until `address` owns a coin. The testnet faucet is
/// captcha-gated, so the user funds the address manually in another tab.
export async function waitForFunds(client, address, log) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const coins = await client.getCoins({ owner: address });
    if (coins.data.length > 0) {
      log(`funded: ${Number(coins.data[0].balance) / Number(NANOS_PER_IOTA)} IOTA`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('funds did not arrive within 10 minutes');
}

export function makeThrowawayFunder() {
  const funder = new Ed25519Keypair();
  return { funder, address: funder.getPublicKey().toIotaAddress() };
}

/// One-time on-chain account creation, paid by the (already funded) throwaway
/// key. Returns the new account's address (= its object ID).
export async function createAccount({ client, funder, packageId, metadataId, pubkey, log }) {
  const funderAddress = funder.getPublicKey().toIotaAddress();

  const tx = new Transaction();
  tx.setSender(funderAddress);
  const authRef = tx.moveCall({
    target: '0x2::authenticator_function::create_auth_function_ref_v1',
    typeArguments: [`${packageId}::${MODULE_NAME}::PasswordAccount`],
    arguments: [
      tx.object(metadataId),
      tx.pure.string(MODULE_NAME),
      tx.pure.string(AUTHENTICATE_FN_NAME),
    ],
  });
  tx.moveCall({
    target: `${packageId}::${MODULE_NAME}::create`,
    arguments: [tx.pure.vector('u8', Array.from(pubkey)), authRef],
  });

  log('submitting account creation transaction…');
  const response = await client.signAndExecuteTransaction({
    signer: funder,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  assertSuccess(response);
  log(`creation tx: ${response.digest}`);

  const created = (response.objectChanges ?? []).find(
    (change) => change.type === 'created' && change.owner?.Shared !== undefined,
  );
  if (!created) throw new Error('no shared account object found in effects');
  // The funder's gas coin as mutated by this tx — the sweep must use this
  // exact reference, because re-querying the fullnode races its indexer.
  const gasRef = response.effects?.gasObject?.reference;
  return { accountId: created.objectId, gasRef };
}

/// Sweep the funder's entire remaining balance (its gas coin, minus fees) to
/// the freshly created wallet so it has gas without a second faucet round.
export async function sweepFunds({ client, funder, gasRef, recipient, log }) {
  const funderAddress = funder.getPublicKey().toIotaAddress();
  const tx = new Transaction();
  tx.setSender(funderAddress);
  tx.setGasBudget(GAS_BUDGET);
  if (gasRef) tx.setGasPayment([gasRef]);
  tx.transferObjects([tx.gas], normalizeIotaAddress(recipient));

  log('sweeping remaining funder balance into the wallet…');
  const response = await client.signAndExecuteTransaction({
    signer: funder,
    transaction: tx,
    options: { showEffects: true },
  });
  assertSuccess(response);
  log(`sweep tx: ${response.digest}`);
  // Wait until the fullnode has indexed the sweep, so an immediate "send"
  // sees the wallet's gas coin.
  await client.waitForTransaction({ digest: response.digest });
}

/// The account object's initial shared version, needed for the
/// MoveAuthenticator signature.
export async function getInitialSharedVersion(client, accountAddress) {
  const object = await client.getObject({ id: accountAddress, options: { showOwner: true } });
  const initialSharedVersion = object.data?.owner?.Shared?.initial_shared_version;
  if (initialSharedVersion === undefined) {
    throw new Error(`account object ${accountAddress} not found or not shared`);
  }
  return initialSharedVersion;
}

/// Execute a prepared transaction as the abstract account: sign its digest
/// with the password-derived key and submit with a MoveAuthenticator
/// signature. Waits for the fullnode to index the result, so follow-up
/// queries see fresh object versions.
///
/// `gasBudget` defaults to the flat base; callers writing large payloads must
/// pass one from `gasBudgetForBytes`, since storage cost for a 16 KB blob is
/// roughly 2.5× the base budget.
export async function executeAsAccount({
  client,
  seed,
  accountAddress,
  tx,
  log,
  gasBudget = GAS_BUDGET,
}) {
  const initialSharedVersion = await getInitialSharedVersion(client, accountAddress);

  tx.setSender(accountAddress);
  tx.setGasBudget(gasBudget);

  log('building transaction…');
  const bytes = await tx.build({ client });

  // The digest signed here is what `ctx.digest()` returns inside the
  // on-chain authenticator — the signature is bound to exactly this tx.
  const digest = fromBase58(TransactionDataBuilder.getDigestFromBytes(bytes));
  const signature = await signDigest(seed, digest);
  const authSignature = await moveAuthenticatorSignature(
    signature,
    fromHex(accountAddress),
    initialSharedVersion,
  );

  log('submitting…');
  const response = await client.executeTransactionBlock({
    transactionBlock: bytes,
    signature: [toBase64(authSignature)],
    options: { showEffects: true, showObjectChanges: true },
  });
  assertSuccess(response);
  await client.waitForTransaction({ digest: response.digest });
  return response;
}

/// Transfer IOTA out of the abstract account.
export async function transferFromAccount({ client, seed, accountId, recipient, amountNanos, log }) {
  const accountAddress = normalizeIotaAddress(accountId);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountNanos]);
  tx.transferObjects([coin], normalizeIotaAddress(recipient));

  const response = await executeAsAccount({ client, seed, accountAddress, tx, log });
  return response.digest;
}

/// The account's stored authenticator public key (from its OwnerPublicKey
/// dynamic field), for client-side wrong-password detection. Returns null if
/// it cannot be located — callers should treat that as "cannot verify".
export async function fetchAccountPublicKey(client, accountAddress) {
  try {
    const fields = await client.getDynamicFields({ parentId: normalizeIotaAddress(accountAddress) });
    for (const field of fields.data) {
      if (!`${field.name?.type}`.includes('OwnerPublicKey')) continue;
      const object = await client.getObject({ id: field.objectId, options: { showBcs: true } });
      const bytes = fromBase64(object.data.bcs.bcsBytes);
      // Field<OwnerPublicKey, vector<u8>> BCS:
      // id (32) || dummy bool (1) || vector length 0x20 (1) || pubkey (32)
      if (bytes.length === 66 && bytes[33] === 32) return bytes.slice(34);
    }
  } catch (error) {
    console.warn('could not fetch account public key', error);
  }
  return null;
}

function assertSuccess(response) {
  const status = response.effects?.status;
  if (status && status.status !== 'success') {
    throw new Error(`transaction failed: ${status.error ?? 'unknown error'}`);
  }
}
