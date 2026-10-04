#!/usr/bin/env bash
# Build our own Kraków tiles from OpenStreetMap, carrying surface and
# track quality that the hosted Protomaps planet build does not include.
#
# Runs entirely in Docker: there is no JDK on this machine and we are not
# installing one. It does NOT run on raw-steak — that box runs an IOTA
# validator and planetiler is a memory-hungry JVM batch job. raw-steak's
# only job here is `ipfs add` and serving.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="$HERE/../password_wallet_web"
HOST="${IPFS_HOST:-raw-steak-validator}"
NAME="${1:-krakow}"
BBOX="${BBOX:-19.6567,49.8817,20.2165,50.2411}"
MAXZOOM="${MAXZOOM:-14}"
REGION="${REGION:-europe/poland/malopolskie}"
UPSTREAM="$(cat "$HERE/UPSTREAM")"
WORK="${WORK:-$HERE/.work}"
PBF="$WORK/$(basename "$REGION")-latest.osm.pbf"
OUT="$HERE/$NAME-z$MAXZOOM.pmtiles"
POLY="https://download.geofabrik.de/$REGION.poly"

say() { printf '\n==> %s\n' "$1"; }

check() {
  command -v docker >/dev/null && echo "docker:          $(docker --version)" || echo "docker:          MISSING"
  command -v node   >/dev/null && echo "node:            $(node --version)"   || echo "node:            MISSING"
  if git ls-remote https://github.com/protomaps/basemaps.git >/dev/null 2>&1; then
    echo "upstream:        reachable, pinned at ${UPSTREAM:0:12}"
  else
    echo "upstream:        UNREACHABLE"
  fi
  if curl -sfI "https://download.geofabrik.de/$REGION-latest.osm.pbf" >/dev/null; then
    echo "extract:         $REGION available"
  else
    echo "extract:         $REGION NOT FOUND on geofabrik"
  fi
  if node "$WEB/tools/bbox.mjs" "$POLY" "$BBOX" >/dev/null 2>&1; then
    echo "coverage:        region is inside the extract"
  else
    echo "coverage:        REGION NOT COVERED — see: node $WEB/tools/bbox.mjs $POLY $BBOX"
  fi
  if ssh -o ConnectTimeout=10 -o BatchMode=yes "$HOST" 'docker exec ipfs ipfs id -f="<id>"' >/dev/null 2>&1; then
    echo "pinning node:    $HOST ok"
  else
    echo "pinning node:    $HOST unreachable"
  fi
}

[ "${1:-}" = "--check" ] && { check; exit 0; }

mkdir -p "$WORK"

say "verifying the extract covers the region"
# Silent failure otherwise: planetiler emits an archive whose edges are
# empty, which looks exactly like a finished map.
node "$WEB/tools/bbox.mjs" "$POLY" "$BBOX"

say "cloning protomaps/basemaps at ${UPSTREAM:0:12}"
rm -rf "$WORK/basemaps"
git clone --quiet --filter=blob:none https://github.com/protomaps/basemaps.git "$WORK/basemaps"
git -C "$WORK/basemaps" checkout --quiet "$UPSTREAM"

say "applying surface.patch"
# A build that proceeds unpatched produces tiles with no surface,
# indistinguishable from the ones we are replacing. Never continue.
git -C "$WORK/basemaps" apply --verbose "$HERE/surface.patch"
grep -q 'setAttrWithMinzoom("surface"' \
  "$WORK/basemaps/tiles/src/main/java/com/protomaps/basemap/layers/Roads.java" \
  || { echo "patch applied but the attribute is absent — refusing to build"; exit 1; }

say "building the profile (maven, in docker)"
docker run --rm -v "$WORK/basemaps:/src" -v "$WORK/m2:/root/.m2" -w /src/tiles \
  maven:3.9-eclipse-temurin-21 mvn --batch-mode --quiet clean package -DskipTests

say "downloading $REGION"
curl -fL --progress-bar -o "$PBF" "https://download.geofabrik.de/$REGION-latest.osm.pbf"

say "running planetiler"
docker run --rm -v "$WORK:/work" -v "$HERE:/out" -w /work \
  eclipse-temurin:21-jre \
  java -Xmx6g -jar /work/basemaps/tiles/target/*-with-deps.jar \
    --osm-path="/work/$(basename "$PBF")" \
    --bounds="$BBOX" --minzoom=0 --maxzoom="$MAXZOOM" --force \
    --output="/out/$(basename "$OUT")"

BYTES=$(wc -c < "$OUT" | tr -d ' ')
say "built $(basename "$OUT"): $BYTES bytes"

say "pinning on $HOST"
CID=$(ssh "$HOST" "docker exec -i ipfs ipfs add -Q --cid-version=1 --pin=true --fast-provide-wait" < "$OUT")
BLOCKS=$(ssh "$HOST" "docker exec ipfs ipfs dag stat --progress=false $CID" | awk 'NR==2 {print $2}')
[ -n "$BLOCKS" ] || { echo "could not read block count; refusing to print a broken entry"; exit 1; }

IFS=, read -r W S E N <<<"$BBOX"
CENTER=$(node -e "console.log(((($W)+($E))/2).toFixed(4)+', '+((($S)+($N))/2).toFixed(4))")

cat <<EOF

Paste into src/maps/regions.js:

  $NAME: {
    name: '$NAME',
    cid: '$CID',
    bbox: [${BBOX//,/, }],
    center: [$CENTER],
    minzoom: 0,
    maxzoom: $MAXZOOM,
    blocks: $BLOCKS,
    built: '$(date -u +%Y-%m-%d)',
  },

Then refresh the tile schema the style is checked against:
  cd $WEB && node tools/schema.mjs $CID > src/maps/schema.json

Do NOT commit $(basename "$OUT") — it belongs on IPFS, not in the repo.
EOF
