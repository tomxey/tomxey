//! CLI client for the `password_auth` abstract account.
//!
//! - `derive`         — show the public key for a password+username.
//! - `create-account` — one-time setup: create the on-chain account (sent from
//!   a normal funded address in the local keystore).
//! - `exec`           — send IOTA from the account, authenticated purely by the
//!   password-derived key.
//! - `rotate`         — change password: swap the stored public key, authorized
//!   by the current password.

use std::{path::PathBuf, str::FromStr};

use anyhow::{anyhow, bail, Context, Result};
use clap::{Parser, Subcommand};
use ed25519_dalek::{Signer, SigningKey};
use iota_keys::keystore::{AccountKeystore, FileBasedKeystore, Keystore};
use iota_sdk::{
    rpc_types::{
        IotaObjectDataOptions, IotaTransactionBlockEffectsAPI, IotaTransactionBlockResponse,
        IotaTransactionBlockResponseOptions, ObjectChange,
    },
    types::{
        programmable_transaction_builder::ProgrammableTransactionBuilder,
        quorum_driver_types::ExecuteTransactionRequestType,
        transaction::{CallArg, Transaction, TransactionData, TransactionDataAPI},
    },
    IotaClient, IotaClientBuilder,
};
use iota_sdk_types::{
    crypto::Intent, Address, Argument, Identifier, MoveAuthenticatorV1, ObjectId, Owner,
    SharedObjectReference, TypeTag, UserSignature,
};
use iota_types::move_package;
use password_auth_core::kdf;

const MODULE_NAME: &str = "password_account";
const AUTHENTICATE_FN_NAME: &str = "authenticate";
const GAS_BUDGET: u64 = 50_000_000;

#[derive(Parser)]
#[command(about = "Password-derived-key wallet for an IOTA abstract account")]
struct Cli {
    /// Fullnode RPC URL.
    #[arg(long, default_value = "https://api.testnet.iota.cafe", global = true)]
    node: String,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Derive and print the public key for a password+username.
    Derive {
        #[arg(long)]
        username: String,
    },
    /// Create the on-chain account (one-time; paid by a local keystore address).
    CreateAccount {
        #[arg(long)]
        username: String,
        /// The published password_auth package ID.
        #[arg(long)]
        package_id: String,
        /// Funded keystore address paying for the setup; defaults to the first
        /// keystore entry.
        #[arg(long)]
        sender: Option<String>,
        /// Path to the iota keystore file.
        #[arg(long)]
        keystore: Option<PathBuf>,
    },
    /// Send IOTA from the account, authenticated by the password.
    Exec {
        #[arg(long)]
        username: String,
        /// The account object ID (= the account address).
        #[arg(long)]
        account_id: String,
        #[arg(long)]
        recipient: String,
        /// Amount in nanos.
        #[arg(long)]
        amount: u64,
    },
    /// Change password: rotate the stored public key to a new
    /// password/username pair, authorized by the current password.
    Rotate {
        #[arg(long)]
        username: String,
        #[arg(long)]
        account_id: String,
        /// The published password_auth package ID.
        #[arg(long)]
        package_id: String,
        /// Username for the new credentials (defaults to the current one).
        #[arg(long)]
        new_username: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::Derive { username } => {
            let key = prompt_and_derive(&username, "Password: ")?;
            println!(
                "public key: {}",
                hex::encode(key.verifying_key().as_bytes())
            );
        }
        Command::CreateAccount {
            username,
            package_id,
            sender,
            keystore,
        } => {
            let key = prompt_and_derive_confirmed(&username)?;
            let client = build_client(&cli.node).await?;
            let package_id = ObjectId::from_str(&package_id)?;
            let account_address = create_account(
                &client,
                package_id,
                key.verifying_key().as_bytes().to_vec(),
                sender,
                keystore,
            )
            .await?;
            println!("account created: {account_address}");
            println!("fund it with gas, then use `exec` to spend from it.");
        }
        Command::Exec {
            username,
            account_id,
            recipient,
            amount,
        } => {
            let key = prompt_and_derive(&username, "Password: ")?;
            let client = build_client(&cli.node).await?;
            let account_id = ObjectId::from_str(&account_id)?;
            let recipient = Address::from_str(&recipient)?;

            let pt = {
                let mut builder = ProgrammableTransactionBuilder::new();
                builder.transfer_iota(recipient, Some(amount));
                builder.finish()
            };
            let response = exec_as_account(&client, account_id, &key, pt).await?;
            print_outcome(&response);
        }
        Command::Rotate {
            username,
            account_id,
            package_id,
            new_username,
        } => {
            let key = prompt_and_derive(&username, "Current password: ")?;
            let new_username = new_username.as_deref().unwrap_or(&username);
            println!("Deriving key for the new password (username '{new_username}')...");
            let new_key = prompt_and_derive_confirmed_with(new_username, "New password: ")?;

            let client = build_client(&cli.node).await?;
            let account_id = ObjectId::from_str(&account_id)?;
            let package_id = ObjectId::from_str(&package_id)?;

            let initial_version = shared_initial_version(&client, account_id).await?;
            let pt = {
                let mut builder = ProgrammableTransactionBuilder::new();
                let account_arg = builder.obj(CallArg::Shared(SharedObjectReference::new(
                    account_id,
                    initial_version,
                    true,
                )))?;
                let pubkey_arg =
                    builder.pure(new_key.verifying_key().as_bytes().to_vec())?;
                builder.programmable_move_call(
                    package_id,
                    Identifier::from_static(MODULE_NAME),
                    Identifier::from_static("rotate_pubkey"),
                    vec![],
                    vec![account_arg, pubkey_arg],
                );
                builder.finish()
            };
            let response = exec_as_account(&client, account_id, &key, pt).await?;
            print_outcome(&response);
        }
    }

    Ok(())
}

fn prompt_and_derive(username: &str, prompt: &str) -> Result<SigningKey> {
    let password = read_password(prompt)?;
    eprintln!("Deriving key (Argon2id, ~1s, 512 MiB)...");
    kdf::derive_signing_key(&password, username).map_err(|e| anyhow!(e))
}

/// Interactive prompt, or `PASSWORD_WALLET_PASSWORD` if set — the env path is
/// for scripted testing only (env vars leak into process listings and logs).
fn read_password(prompt: &str) -> Result<String> {
    if let Ok(password) = std::env::var("PASSWORD_WALLET_PASSWORD") {
        eprintln!("(using password from PASSWORD_WALLET_PASSWORD)");
        return Ok(password);
    }
    Ok(rpassword::prompt_password(prompt)?)
}

fn prompt_and_derive_confirmed(username: &str) -> Result<SigningKey> {
    prompt_and_derive_confirmed_with(username, "Password: ")
}

fn prompt_and_derive_confirmed_with(username: &str, prompt: &str) -> Result<SigningKey> {
    let password = match std::env::var("PASSWORD_WALLET_PASSWORD") {
        Ok(password) => {
            eprintln!("(using password from PASSWORD_WALLET_PASSWORD)");
            password
        }
        Err(_) => {
            let password = rpassword::prompt_password(prompt)?;
            let again = rpassword::prompt_password("Repeat: ")?;
            if password != again {
                bail!("passwords do not match");
            }
            password
        }
    };
    eprintln!("Deriving key (Argon2id, ~1s, 512 MiB)...");
    kdf::derive_signing_key(&password, username).map_err(|e| anyhow!(e))
}

async fn build_client(node: &str) -> Result<IotaClient> {
    IotaClientBuilder::default()
        .build(node)
        .await
        .with_context(|| format!("cannot connect to {node}"))
}

/// One-time setup: build and execute the PTB that registers the abstract
/// account, signed by a normal keystore address.
async fn create_account(
    client: &IotaClient,
    package_id: ObjectId,
    pubkey: Vec<u8>,
    sender: Option<String>,
    keystore_path: Option<PathBuf>,
) -> Result<Address> {
    let keystore_path = keystore_path.unwrap_or_else(default_keystore_path);
    let keystore = Keystore::from(
        FileBasedKeystore::new(&keystore_path)
            .with_context(|| format!("cannot open keystore {}", keystore_path.display()))?,
    );
    let sender = match sender {
        Some(s) => Address::from_str(&s)?,
        None => *keystore
            .addresses()
            .first()
            .ok_or_else(|| anyhow!("keystore {} is empty", keystore_path.display()))?,
    };

    // The PackageMetadataV1 object ID is derived deterministically from the
    // package ID.
    let metadata_id = move_package::derive_package_metadata_id(package_id);
    let metadata_ref = client
        .read_api()
        .get_object_with_options(metadata_id, IotaObjectDataOptions::new())
        .await?
        .data
        .ok_or_else(|| anyhow!("package metadata object {metadata_id} not found"))?
        .object_ref();

    let account_type = TypeTag::from_str(&format!(
        "{package_id}::{MODULE_NAME}::PasswordAccount"
    ))?;

    let pt = {
        let mut builder = ProgrammableTransactionBuilder::new();
        let arguments = vec![
            builder.obj(CallArg::ImmutableOrOwned(metadata_ref))?,
            builder.pure(MODULE_NAME)?,
            builder.pure(AUTHENTICATE_FN_NAME)?,
        ];
        let auth_ref = builder.programmable_move_call(
            ObjectId::FRAMEWORK,
            Identifier::from_static("authenticator_function"),
            Identifier::from_static("create_auth_function_ref_v1"),
            vec![account_type],
            arguments,
        );
        let Argument::Result(auth_ref) = auth_ref else {
            bail!("unexpected argument kind returned by move call");
        };
        let pubkey_arg = builder.pure(pubkey)?;
        builder.programmable_move_call(
            package_id,
            Identifier::from_static(MODULE_NAME),
            Identifier::from_static("create"),
            vec![],
            vec![pubkey_arg, Argument::Result(auth_ref)],
        );
        builder.finish()
    };

    let tx_data = transaction_data_with_gas(client, sender, pt).await?;
    let signature = keystore.sign_secure(&sender, &tx_data, Intent::iota_transaction())?;
    let response = execute(client, Transaction::from_data(tx_data, vec![signature])).await?;
    print_outcome(&response);

    let account_ref = response
        .object_changes
        .as_ref()
        .and_then(|changes| {
            changes.iter().find_map(|change| match change {
                ObjectChange::Created { owner, .. } if matches!(owner, Owner::Shared { .. }) => {
                    Some(change.object_ref())
                }
                _ => None,
            })
        })
        .ok_or_else(|| anyhow!("no shared account object in transaction effects"))?;

    Ok(account_ref.object_id.into())
}

/// Build a transaction with sender = the abstract account, sign its digest
/// with the password-derived key, and submit it with a `MoveAuthenticator`.
async fn exec_as_account(
    client: &IotaClient,
    account_id: ObjectId,
    key: &SigningKey,
    pt: iota_sdk_types::ProgrammableTransaction,
) -> Result<IotaTransactionBlockResponse> {
    let account_address: Address = account_id.into();
    let initial_version = shared_initial_version(client, account_id).await?;

    let tx_data = transaction_data_with_gas(client, account_address, pt).await?;

    // `ctx.digest()` inside the authenticator equals this transaction digest,
    // so the signature is bound to exactly this transaction.
    let tx_digest = tx_data.digest();
    let signature_bytes = key.sign(tx_digest.as_ref()).to_bytes().to_vec();
    let signature_call_arg = CallArg::Pure(bcs::to_bytes(&signature_bytes)?);

    let signature = UserSignature::MoveAuthenticator(
        MoveAuthenticatorV1::new_with_shared_account_object(
            vec![signature_call_arg],
            vec![],
            SharedObjectReference::new(account_id, initial_version, false),
        )
        .into(),
    );

    execute(client, Transaction::from_user_sig_data(tx_data, vec![signature])).await
}

/// Fetch the initial shared version of the account object.
async fn shared_initial_version(
    client: &IotaClient,
    account_id: ObjectId,
) -> Result<iota_sdk_types::Version> {
    let object = client
        .read_api()
        .get_object_with_options(account_id, IotaObjectDataOptions::new().with_owner())
        .await?
        .data
        .ok_or_else(|| anyhow!("account object {account_id} not found"))?;
    match object.owner {
        Some(Owner::Shared(initial_shared_version)) => Ok(initial_shared_version),
        other => bail!("account object {account_id} is not shared (owner: {other:?})"),
    }
}

async fn transaction_data_with_gas(
    client: &IotaClient,
    sender: Address,
    pt: iota_sdk_types::ProgrammableTransaction,
) -> Result<TransactionData> {
    let gas_coin = client
        .coin_read_api()
        .get_coins(sender, None, None, None)
        .await?
        .data
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("no gas coin owned by {sender} — fund it first"))?;
    let gas_price = client.read_api().get_reference_gas_price().await?;

    Ok(TransactionData::new_programmable(
        sender,
        vec![gas_coin.object_ref()],
        pt,
        GAS_BUDGET,
        gas_price,
    ))
}

async fn execute(
    client: &IotaClient,
    transaction: Transaction,
) -> Result<IotaTransactionBlockResponse> {
    Ok(client
        .quorum_driver_api()
        .execute_transaction_block(
            transaction,
            IotaTransactionBlockResponseOptions::full_content(),
            Some(ExecuteTransactionRequestType::WaitForLocalExecution),
        )
        .await?)
}

fn print_outcome(response: &IotaTransactionBlockResponse) {
    println!("transaction digest: {}", response.digest);
    if let Some(effects) = &response.effects {
        println!("status: {:?}", effects.status());
    }
}

fn default_keystore_path() -> PathBuf {
    dirs_home().join(".iota").join("iota_config").join("iota.keystore")
}

fn dirs_home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}
