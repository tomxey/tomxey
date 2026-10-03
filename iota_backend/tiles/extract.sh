#!/usr/bin/env bash
# Cut one region out of the Protomaps planet build and pin it on raw-steak.
#
# The planet is ~129 GB and serves range requests, so `pmtiles extract`
# pulls only the tiles in the bbox — measured 51 requests / 32 MB / 13 s for
# Kraków.
#
# Builds are retained for roughly a week: on 2026-10-03, 20260928 onwards
# resolved and 20260926 was already 404. So BUILD goes stale on its own and
# this default will need bumping; --check tells you when. A region is a dated
# snapshot whose durable identity is its CID, not the build it came from.
set -euo pipefail

BUILD="${BUILD:-20261002}"
HOST="${IPFS_HOST:-raw-steak-validator}"
NAME="${1:-krakow}"
BBOX="${2:-19.6567,49.8817,20.2165,50.2411}"
MAXZOOM="${3:-14}"
OUT="$NAME-z$MAXZOOM.pmtiles"
URL="https://build.protomaps.com/$BUILD.pmtiles"

# --check diagnoses the preconditions and changes nothing. It must work
# without the pmtiles CLI installed — reporting that it is missing is one of
# the things it is for.
if [ "${1:-}" = "--check" ]; then
  if command -v pmtiles >/dev/null; then
    echo "pmtiles CLI:        $(pmtiles version 2>&1 | head -1)"
  else
    echo "pmtiles CLI:        MISSING — https://github.com/protomaps/go-pmtiles/releases"
  fi
  if curl -sfI "$URL" >/dev/null; then
    echo "planet build $BUILD: available"
  else
    echo "planet build $BUILD: GONE — builds are kept about a week;"
    echo "                     find a current date and re-run with BUILD=YYYYMMDD"
  fi
  if PEER=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$HOST" \
      'docker exec ipfs ipfs id -f="<id>"' 2>/dev/null); then
    echo "pinning node:       $HOST ok, peer $PEER"
  else
    echo "pinning node:       $HOST unreachable or ipfs container not running"
  fi
  exit 0
fi

command -v pmtiles >/dev/null || {
  echo "need the pmtiles CLI: https://github.com/protomaps/go-pmtiles/releases"; exit 1; }

if ! curl -sfI "$URL" >/dev/null; then
  echo "planet build $BUILD is gone — builds are kept about a week."
  echo "find a current date and re-run with BUILD=YYYYMMDD"
  exit 1
fi

pmtiles extract "$URL" "$OUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"
BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "==> $OUT: $BYTES bytes"

# --fast-provide-wait forces an immediate DHT provide, so the CID is
# discoverable before this script returns rather than after the next sweep.
CID=$(ssh "$HOST" "docker exec -i ipfs ipfs add -Q --cid-version=1 --pin=true --fast-provide-wait" < "$OUT")
BLOCKS=$(ssh "$HOST" "docker exec ipfs ipfs dag stat --progress=false $CID" | awk 'NR==2 {print $2}')

IFS=, read -r W S E N <<<"$BBOX"
CENTER=$(python3 -c "print(f'{($W+$E)/2:.4f}, {($S+$N)/2:.4f}')")

cat <<EOF

Pinned on $HOST. Paste into src/maps/regions.js:

  $NAME: {
    name: '$NAME',
    cid: '$CID',
    bbox: [${BBOX//,/, }],
    center: [$CENTER],
    minzoom: 0,
    maxzoom: $MAXZOOM,
    blocks: $BLOCKS,
    built: '${BUILD:0:4}-${BUILD:4:2}-${BUILD:6:2}',
  },

Do NOT commit $OUT — it belongs on IPFS, not in the repo.
EOF
