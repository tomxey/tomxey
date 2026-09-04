#!/usr/bin/env bash
#
# Build the wallet/todo web app and stage it into docs/, which is what
# GitHub Pages serves at tomxey.pl.
#
#   ./deploy.sh              # test, build, sync into docs/
#   ./deploy.sh --check      # test and build only, change nothing
#   ./deploy.sh --prune      # also delete build assets no longer referenced
#   ./deploy.sh --verify     # poll the live site until it serves what docs/ has
#
# Typical flow:
#
#   ./deploy.sh              # then review `git diff --stat`, commit, push
#   ./deploy.sh --verify     # confirm Pages actually rebuilt
#
# Deploying is deliberately separate from committing: the script never runs
# git for you, because staging a build is not the same decision as publishing
# source, and the two have had different intents every time so far.

set -euo pipefail

SITE_URL="https://tomxey.pl/password_wallet/todo.html"
POLL_SECONDS=20
POLL_ATTEMPTS=15 # ~5 minutes; Pages usually rebuilds in one or two

check_only=false
prune=false
verify_only=false

while [ $# -gt 0 ]; do
    case "$1" in
        --check) check_only=true; shift ;;
        --prune) prune=true; shift ;;
        --verify) verify_only=true; shift ;;
        -h|--help)
            awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
            exit 0
            ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

cd "$(dirname "$0")"
APP=password_wallet_web
DOCS=../docs/password_wallet

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
note() { printf '    %s\n' "$1"; }
fail() { printf '\n\033[31merror: %s\033[0m\n' "$1" >&2; exit 1; }

bundle_of() { grep -o 'assets/todo-[A-Za-z0-9_-]*\.js' "$1" | head -1; }

# --- verify only -------------------------------------------------------------

if $verify_only; then
    expected=$(bundle_of "$DOCS/todo.html") || fail "no built todo.html in $DOCS"
    step "Waiting for Pages to serve $expected"
    for attempt in $(seq 1 "$POLL_ATTEMPTS"); do
        live=$(curl -s --max-time 15 "$SITE_URL" | grep -o 'assets/todo-[A-Za-z0-9_-]*\.js' | head -1 || true)
        if [ "$live" = "$expected" ]; then
            note "live: $live"
            exit 0
        fi
        note "attempt $attempt: ${live:-<no response>}"
        sleep "$POLL_SECONDS"
    done
    fail "still not live after $((POLL_ATTEMPTS * POLL_SECONDS))s — is the commit pushed?"
fi

# --- test --------------------------------------------------------------------
# A red build must not reach the site, and finding out afterwards has cost a
# round trip more than once.

step "Testing"
(cd "$APP" && npm test) || fail "tests failed — not deploying"

# --- build -------------------------------------------------------------------

step "Building"
(cd "$APP" && npx vite build) || fail "build failed"

built=$(bundle_of "$APP/dist/todo.html")
note "bundle: $built"

if $check_only; then
    step "--check: built but not staged"
    exit 0
fi

# --- sync --------------------------------------------------------------------

step "Staging into $DOCS"
before=$(bundle_of "$DOCS/todo.html" || true)
cp -R "$APP/dist/." "$DOCS/"

if [ "$before" = "$built" ]; then
    note "bundle unchanged ($built)"
else
    note "bundle ${before:-none} -> $built"
fi

# Old hashed chunks are left in place by default: someone holding a cached
# page may still request one. They accumulate, so the count is always shown.
#
# The keep-set is what this build just produced, NOT what the HTML mentions.
# The wasm module and the KDF worker are referenced from inside the JS
# bundles, so scanning only the HTML would mark them stale and delete them.
keep=$(ls "$APP/dist/assets")
present=$(ls "$DOCS/assets")
stale=$(comm -13 <(echo "$keep") <(echo "$present"))
stale_count=$(echo "$stale" | grep -c . || true)

if [ "$stale_count" -gt 0 ]; then
    if $prune; then
        echo "$stale" | while read -r file; do
            [ -n "$file" ] && rm -f "$DOCS/assets/$file"
        done
        note "pruned $stale_count unreferenced asset(s)"
    else
        note "$stale_count unreferenced asset(s) in docs/ — ./deploy.sh --prune to remove"
    fi
fi

step "Staged"
note "review with: git diff --stat"
note "then commit, push, and: ./deploy.sh --verify"
