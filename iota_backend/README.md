# iota_backend — password-based abstract account

A password-based authenticator built on IOTA account abstraction (live on
mainnet since Q2 2026). Lets a user control an on-chain account with nothing
but a password — including from a static website.

## How it works

The password itself never goes on-chain (a literal on-chain password check
would be public the moment it's used, and front-runnable while in consensus).
Instead:

1. Off-chain, the password + username are stretched with **Argon2id**
   (512 MiB memory, t=3 — about a second and half a gigabyte per guess,
   GPU-hostile) into an **ed25519 keypair**. Same password+username always
   re-derives the same key; there is nothing to back up except the password.
2. On-chain, a `PasswordAccount` shared object stores only the **public key**.
   Its `#[authenticator]` function accepts a transaction iff the auth argument
   is a valid ed25519 signature, by the derived key, over `ctx.digest()` —
   the framework guarantees that digest matches the submitted transaction, so
   signatures cannot be replayed or attached to a different transaction.
3. Changing the password = `rotate_pubkey`, callable only by a transaction
   already authenticated as the account itself.

Residual risk: the public key is on-chain, so a targeted attacker can
brute-force offline at ~1s per guess. A short dictionary password protects an
account only as long as it isn't worth days of GPU time — use a decent
passphrase for anything real.

## Layout

- `password_auth_move/` — the Move package (`password_auth::password_account`).
  Build/test: `iota move build`, `iota move test`.
- `password_auth_core/` — Rust lib with the KDF and MoveAuthenticator
  signature assembly. Shared by the CLI and the WASM bindings so every client
  is byte-identical. wasm32-compatible, no heavy deps.
- `password_auth_wasm/` — `wasm-bindgen` bindings over the core crate for the
  browser (~98 KB wasm). Build: `wasm-pack build --target web --release`
  (plus `--target nodejs --out-dir pkg-node` for the web app's node tests).
  Note: official `@iota/sdk-wasm` 3.0.0-alpha bindings (uniffi, GraphQL) exist
  in the iota-rust-sdk repo but are not on npm yet and don't cover our KDF;
  revisit once published.
- `password_wallet_rs/` — Rust CLI (`derive`, `create-account`, `exec`,
  `rotate`) against `iota-sdk` git develop. Needs rust 1.97.1 (pinned via
  `rust-toolchain.toml`).
- `password_wallet_web/` — static web app (vite) for GitHub Pages: create a
  wallet on testnet (faucet-funded) and send funds from it, entering the
  password on the page. Uses npm `@iota/iota-sdk` for tx building/RPC/faucet
  and `password_auth_wasm` for all crypto.

## Cross-implementation parity (tested)

The scheme only works if every client produces identical bytes. Pinned by
tests:

- KDF golden vector: `password_auth_core` unit test (`-- --ignored`),
  `password_wallet_rs/tests/golden_vectors.rs`, and
  `password_wallet_web/test/parity.test.js` (WASM) all assert the same
  seed/pubkey.
- MoveAuthenticator signature bytes: core's hand-rolled BCS ==
  `iota-sdk-types`' `UserSignature::to_bytes()` == WASM output.
- ed25519 signature vector: shared between the Move unit tests
  (`password_account_tests.move`) and the WASM tests.
- Transaction digest: TS SDK `TransactionDataBuilder.getDigestFromBytes` ==
  `iota-types` `TransactionData::digest()`
  (`password_wallet_rs/tests/ts_digest_parity.rs`) — i.e., what the web app
  signs is exactly what `ctx.digest()` verifies.

## Usage (testnet)

```sh
# 1. Publish the Move package (once, from a normal funded address).
#    The output lists the package ID and the PackageMetadataV1 object ID.
cd password_auth_move && iota client publish

# 2. CLI flow
password_wallet_rs derive --username alice
password_wallet_rs create-account --username alice --package-id 0x<pkg>
password_wallet_rs exec --username alice --account-id 0x<account> \
    --recipient 0x<to> --amount 1000000000
password_wallet_rs rotate --username alice --account-id 0x<account> --package-id 0x<pkg>

# 3. Web flow
cd password_wallet_web
npm install && npm test        # WASM/Rust parity tests
npm run dev                    # local dev server
npm run build                  # dist/ for GitHub Pages
```

In the web app, set the package ID and metadata ID under Settings (or bake
them into `src/config.js` before building). Deploy `dist/` to GitHub Pages
(e.g. `gh-pages` branch or a Pages workflow); asset paths are relative, so a
project subpath works.

## Status

- Move package: builds, 6/6 unit tests pass.
- Rust CLI: compiles, tests pass (incl. golden vectors).
- WASM: builds (98 KB), 512 MiB Argon2id runs in ~0.8 s in-node, parity
  tests pass.
- Web app: `vite build` passes; **not yet exercised against testnet** — the
  Move package is deliberately unpublished so far. Faucet CORS from the
  browser is the main untested assumption.
