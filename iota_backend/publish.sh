#!/usr/bin/env bash
#
# Publish one of the Move packages in this directory.
#
# By default it generates a fresh publisher address, funds it (faucet, or by
# waiting while you fund it yourself), then publishes — so a publish never
# touches an address you already use. Pass --use-active to publish from the
# CLI's current active address instead, which is quicker when it already has
# gas.
#
#   ./publish.sh recipe_move
#   ./publish.sh --use-active recipe_move
#   ./publish.sh --alias recipe-publisher recipe_move
#   ./publish.sh --check recipe_move      # build + test only, spends nothing
#   ./publish.sh --dry-run recipe_move    # simulate on chain, commits nothing
#
# The address that publishes ends up owning the package's UpgradeCap, so it is
# the only address that can ever upgrade the package. Keep track of it.

set -euo pipefail

MIN_NANOS=1000000000 # 1 IOTA — comfortably more than a small package costs
POLL_SECONDS=3
POLL_ATTEMPTS=100 # ~5 minutes
# Empty by default: the testnet HTTP faucet the CLI would call is deprecated
# ("This faucet is deprecated. Please use the faucet at …"), and the web one
# is captcha-gated, so automatic funding is not attempted unless you point
# --faucet-url at something that works (a localnet faucet, say).
FAUCET_URL="${FAUCET_URL:-}"
FAUCET_WEB="https://faucet.testnet.iota.cafe"

use_active=false
check_only=false
dry_run=false
alias_name=""
publisher_arg=""
package=""

while [ $# -gt 0 ]; do
    case "$1" in
        --use-active) use_active=true; shift ;;
        --check) check_only=true; shift ;;
        # A dry run still needs a funded sender to simulate against, so it
        # uses the active address rather than generating and funding one.
        --dry-run) dry_run=true; use_active=true; shift ;;
        --alias) alias_name="${2:?--alias needs a name}"; shift 2 ;;
        # Reuse an address you already generated (and perhaps already
        # funded), instead of making another one.
        --publisher) publisher_arg="${2:?--publisher needs an address}"; shift 2 ;;
        --faucet-url) FAUCET_URL="${2:?--faucet-url needs a URL}"; shift 2 ;;
        -h|--help)
            # The header comment, up to the first line that isn't a comment.
            awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
            exit 0
            ;;
        -*) echo "unknown option: $1" >&2; exit 2 ;;
        *) package="$1"; shift ;;
    esac
done

cd "$(dirname "$0")"

if [ -z "$package" ]; then
    echo "usage: $0 [--use-active] [--alias NAME] <package-dir>" >&2
    echo "packages here:" >&2
    for dir in */Move.toml; do echo "  ${dir%/Move.toml}" >&2; done
    exit 2
fi

package="${package%/}"
if [ ! -f "$package/Move.toml" ]; then
    echo "no Move.toml in '$package' — is that a Move package directory?" >&2
    exit 1
fi

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
note() { printf '    %s\n' "$1"; }
fail() { printf '\n\033[31merror: %s\033[0m\n' "$1" >&2; exit 1; }

env_alias=$(iota client active-env)
step "Publishing '$package' to '$env_alias'"

# --- build and test before spending anything --------------------------------
# A package that doesn't compile, or whose tests fail, must not reach the
# chain — and finding that out after funding an address wastes a faucet round.

step "Building and testing"
(cd "$package" && iota move test) || fail "tests failed — not publishing"

if $check_only; then
    step "--check: stopping before generating an address or spending gas"
    exit 0
fi

# --- pick the publisher address ---------------------------------------------

address_for_alias() {
    iota client addresses --json | jq -r --arg a "$1" '.addresses[] | select(.[0]==$a) | .[1]'
}

if [ -n "$publisher_arg" ]; then
    publisher="$publisher_arg"
    step "Publishing from the address you passed"
    note "$publisher"
elif $use_active; then
    publisher=$(iota client active-address)
    step "Publishing from the active address"
    note "$publisher"
else
    [ -n "$alias_name" ] || alias_name="publish-${package%_move}-$$"
    step "Generating a publisher address (alias: $alias_name)"
    note "The recovery phrase below is the only copy outside your keystore."
    echo
    iota client new-address --key-scheme ed25519 --alias "$alias_name" >&2
    echo
    publisher=$(address_for_alias "$alias_name")
    [ -n "$publisher" ] || fail "could not find the new address for alias '$alias_name'"
    note "address: $publisher"
fi

# --- funding -----------------------------------------------------------------

# The address is POSITIONAL: `iota client gas <address> --json`. Passing it as
# --address makes the CLI exit with "unexpected argument", which reads as a
# zero balance and polls forever.
#
# An address with no coins prints nothing at all, so the result is scrubbed to
# a plain integer — an empty string would abort the script on the first
# numeric comparison, which is exactly the fresh-address case.
balance_nanos() {
    local out
    out=$(iota client gas "$1" --json 2>/dev/null | jq '[.[]?.nanosBalance] | add // 0' 2>/dev/null) || out=""
    case "$out" in
        '' | *[!0-9]*) echo 0 ;;
        *) echo "$out" ;;
    esac
}

funded=$(balance_nanos "$publisher")
if [ "$funded" -ge "$MIN_NANOS" ]; then
    step "Already funded"
    note "$funded nanos"
else
    step "Funding $publisher"
    if [ -n "$FAUCET_URL" ]; then
        if iota client faucet --address "$publisher" --url "$FAUCET_URL" 2>&1 | sed 's/^/    /'; then
            note "faucet request sent"
        else
            note "that faucet did not work — fund the address yourself"
        fi
        echo
    fi

    note "Fund this address in your browser:"
    note "  $FAUCET_WEB"
    note "  address: $publisher"
    echo
    printf '    waiting for at least %s nanos' "$MIN_NANOS"

    attempt=0
    while [ "$(balance_nanos "$publisher")" -lt "$MIN_NANOS" ]; do
        attempt=$((attempt + 1))
        if [ "$attempt" -ge "$POLL_ATTEMPTS" ]; then
            echo
            fail "no funds after $((POLL_ATTEMPTS * POLL_SECONDS))s — fund the address and re-run"
        fi
        printf '.'
        sleep "$POLL_SECONDS"
    done
    echo
    note "funded: $(balance_nanos "$publisher") nanos"
fi

# --- publish ------------------------------------------------------------------
#
# `publish` signs as the active address, so switch to the publisher only now,
# for as short a window as possible. The previous active address is restored
# on any exit, including Ctrl-C.

previous_active=$(iota client active-address)
restore_active() {
    if [ "$previous_active" != "$(iota client active-address 2>/dev/null)" ]; then
        iota client switch --address "$previous_active" >/dev/null 2>&1 || true
        note "restored active address $previous_active"
    fi
}
trap restore_active EXIT INT TERM
iota client switch --address "$publisher" >/dev/null

publish_args=(--json)
if $dry_run; then
    publish_args+=(--dry-run)
    step "Publishing (dry run — nothing is committed)"
else
    step "Publishing"
fi
output=$(iota client publish "${publish_args[@]}" "$package") || fail "publish failed"

status=$(printf '%s' "$output" | jq -r '.effects.status.status // "unknown"')
if [ "$status" != "success" ]; then
    printf '%s\n' "$output" | jq '.effects.status' >&2
    fail "transaction did not succeed (status: $status)"
fi

package_id=$(printf '%s' "$output" | jq -r '.objectChanges[]? | select(.type=="published") | .packageId')
[ -n "$package_id" ] || fail "published, but no packageId found in the output"

# `.digest` is top-level on a real execution; `.effects.transactionDigest` is
# present either way, so prefer it as the fallback.
digest=$(printf '%s' "$output" | jq -r '.digest // .effects.transactionDigest // "?"')

if $dry_run; then
    step "Dry run succeeded — nothing was published"
    note "the package ID below is only what this simulation would have produced"
else
    step "Published"
fi
printf '    package ID: \033[1m%s\033[0m\n' "$package_id"
note "tx digest:  $digest"
note "publisher:  $publisher"

echo
note "objects created:"
printf '%s' "$output" \
    | jq -r '.objectChanges[]? | select(.type=="created") | "      \(.objectId)  \(.objectType)"'

# The web app reads these from src/config.js (or the Settings panel).
config_key=""
case "$package" in
    recipe_move) config_key="recipePackageId" ;;
    kalambury_move) config_key="kalamburyPackageId" ;;
    todo_item_move) config_key="todoItemPackageId" ;;
    todo_store_move) config_key="legacyTodoPackageId" ;;
    password_auth_move) config_key="packageId" ;;
esac

if [ -n "$config_key" ] && ! $dry_run; then
    echo
    note "set this in password_wallet_web/src/config.js (or under Settings):"
    printf "      %s: '%s',\n" "$config_key" "$package_id"
fi

if [ "$package" = "password_auth_move" ]; then
    metadata=$(printf '%s' "$output" \
        | jq -r '.objectChanges[]? | select((.objectType? // "") | endswith("::package::PackageMetadataV1")) | .objectId')
    [ -n "$metadata" ] && printf "      metadataId: '%s',\n" "$metadata"
fi

upgrade_cap=$(printf '%s' "$output" \
    | jq -r '.objectChanges[]? | select((.objectType? // "") | endswith("::package::UpgradeCap")) | .objectId')
if [ -n "$upgrade_cap" ]; then
    echo
    note "UpgradeCap $upgrade_cap is owned by $publisher —"
    note "that address is the only one that can upgrade this package."
fi
