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
POLY="https://download.geofabrik.de/$REGION.poly"

say() { printf '\n==> %s\n' "$1"; }

check() {
  local failed=""
  command -v docker >/dev/null && echo "docker:          $(docker --version)" \
    || { echo "docker:          MISSING"; failed=1; }
  command -v node   >/dev/null && echo "node:            $(node --version)" \
    || { echo "node:            MISSING"; failed=1; }

  if git ls-remote https://github.com/protomaps/basemaps.git >/dev/null 2>&1; then
    echo "upstream:        reachable, pinned at ${UPSTREAM:0:12}"
  else
    echo "upstream:        UNREACHABLE"; failed=1
  fi

  # Spec 9 asks --check to establish that the patch still applies. It is
  # the cheapest guard against patch rot and the only one that catches it
  # before a clone and a Maven build.
  local probe
  probe=$(mktemp -d)
  if git clone --quiet --filter=blob:none https://github.com/protomaps/basemaps.git "$probe/b" 2>/dev/null \
     && git -C "$probe/b" checkout --quiet "$UPSTREAM" 2>/dev/null; then
    if git -C "$probe/b" apply --check "$HERE/surface.patch" 2>/dev/null; then
      echo "patch:           applies cleanly to ${UPSTREAM:0:12}"
    else
      echo "patch:           DOES NOT APPLY to ${UPSTREAM:0:12} — rebase surface.patch"; failed=1
    fi
  else
    echo "patch:           could not clone upstream to test"; failed=1
  fi
  rm -rf "$probe"

  if curl -sfI "https://download.geofabrik.de/$REGION-latest.osm.pbf" >/dev/null; then
    echo "extract:         $REGION available"
  else
    echo "extract:         $REGION NOT FOUND on geofabrik"; failed=1
  fi

  if node "$WEB/tools/bbox.mjs" "$POLY" "$BBOX" >/dev/null 2>&1; then
    echo "coverage:        region is inside the extract"
  else
    echo "coverage:        REGION NOT COVERED — run: node $WEB/tools/bbox.mjs $POLY $BBOX"; failed=1
  fi

  if ssh -o ConnectTimeout=10 -o BatchMode=yes "$HOST" 'docker exec ipfs ipfs id -f="<id>"' >/dev/null 2>&1; then
    echo "pinning node:    $HOST ok"
  else
    echo "pinning node:    $HOST unreachable"; failed=1
  fi

  # Non-zero on any problem, so --check can gate something.
  [ -z "$failed" ]
}

[ "${1:-}" = "--check" ] && { check; exit $?; }

# --resume reuses the compiled jar and the downloaded extract. planetiler
# is the last and most failure-prone stage; without this, every retry pays
# for a clone, a Maven build and a few hundred MB again.
RESUME=""
[ "${1:-}" = "--resume" ] && { RESUME=1; NAME="${2:-krakow}"; }
# Computed AFTER argument parsing: deriving it earlier produced
# "--resume-z14.pmtiles" from the flag itself.
OUT="$HERE/$NAME-z$MAXZOOM.pmtiles"

mkdir -p "$WORK"

say "verifying the extract covers the region"
# Silent failure otherwise: planetiler emits an archive whose edges are
# empty, which looks exactly like a finished map.
node "$WEB/tools/bbox.mjs" "$POLY" "$BBOX"

# A reused jar must be the jar this UPSTREAM and this patch produce.
# Without a stamp, editing surface.patch and running --resume builds tiles
# from the OLD jar while the script cheerfully announces the new SHA — and
# the only symptom is an attribute quietly missing from schema.json.
STAMP="$WORK/jar.stamp"
WANT_STAMP="$UPSTREAM $(shasum -a 256 "$HERE/surface.patch" | cut -d" " -f1)"

if [ -n "$RESUME" ] \
  && [ -n "$(ls "$WORK"/basemaps/tiles/target/*-with-deps.jar 2>/dev/null)" ] \
  && [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$WANT_STAMP" ]; then
  say "reusing the jar built from ${UPSTREAM:0:12} with this exact patch (--resume)"
else
  if [ -n "$RESUME" ] && [ -f "$STAMP" ]; then
    say "cached jar was built from a different UPSTREAM/patch — rebuilding"
  fi

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

printf '%s' "$WANT_STAMP" > "$STAMP"

fi

# Geofabrik publishes an .md5 beside every extract. `-s` only proves the
# file is non-empty, and curl writes in place with no temp-and-rename, so
# an interrupted download leaves a truncated .pbf that --resume would
# happily feed to planetiler — producing exactly the empty-edges archive
# the coverage check exists to prevent, by the back door.
pbf_ok() {
  [ -s "$PBF" ] || return 1
  local want
  want=$(curl -fsSL "https://download.geofabrik.de/$REGION-latest.osm.pbf.md5" | cut -d" " -f1) || return 1
  [ -n "$want" ] || return 1
  local got
  got=$(md5 -q "$PBF" 2>/dev/null || md5sum "$PBF" | cut -d" " -f1)
  [ "$got" = "$want" ]
}

if [ -n "$RESUME" ] && pbf_ok; then
  say "reusing $(basename "$PBF") ($(wc -c < "$PBF" | tr -d ' ') bytes, md5 verified) (--resume)"
else
  [ -n "$RESUME" ] && [ -s "$PBF" ] && say "cached extract failed its md5 — re-downloading"
  say "downloading $REGION"
  curl -fL --progress-bar -o "$PBF.part" "https://download.geofabrik.de/$REGION-latest.osm.pbf"
  mv "$PBF.part" "$PBF"
  pbf_ok || { echo "downloaded extract does not match its published md5"; exit 1; }
fi

# planetiler fetches qrank (a Wikidata page-rank table used to order place
# labels) from a Wikimedia toolforge service. That host hiccupped once and
# killed an 11-minute run outright — planetiler treats a source download
# failure as fatal and has no --retry of its own. Fetch it here instead,
# with curl's retries, into the cache planetiler reads. Add a line per
# source if the profile ever grows another. planetiler fetches the rest
# (Natural Earth and friends) itself under --download; it is only qrank
# that has proven flaky.
say "pre-fetching build sources"
mkdir -p "$WORK/data/sources"
if [ -s "$WORK/data/sources/qrank.csv.gz" ]; then
  echo "  qrank.csv.gz already cached"
else
  curl -fL --retry 6 --retry-delay 5 --retry-all-errors --progress-bar \
    -o "$WORK/data/sources/qrank.csv.gz" \
    https://qrank.toolforge.org/download/qrank.csv.gz
fi

say "running planetiler"
# Resolve the jar on the HOST. `/work/...` exists only inside the
# container, so a glob in the docker argv is expanded by the host shell
# against a path that is not there, stays literal, and java reports
# "Unable to access jarfile .../*-with-deps.jar" after the slow stages.
JAR=$(basename "$(ls "$WORK"/basemaps/tiles/target/*-with-deps.jar | head -1)")
[ -n "$JAR" ] || { echo "no built jar found in $WORK/basemaps/tiles/target"; exit 1; }
# 3g, not 6g: a 200 MB regional extract needs nothing like 6g, and asking
# for it put the whole machine under memory pressure and got the run
# killed. --memory caps the container so a future regression cannot do
# that to the host again.
docker run --rm --memory=4g -v "$WORK:/work" -v "$HERE:/out" -w /work \
  eclipse-temurin:21-jre \
  java -Xmx3g -jar "/work/basemaps/tiles/target/$JAR" \
    --osm-path="/work/$(basename "$PBF")" \
    --download \
    --bounds="$BBOX" --minzoom=0 --maxzoom="$MAXZOOM" --force \
    --output="/out/$(basename "$OUT")"

BYTES=$(wc -c < "$OUT" | tr -d ' ')
say "built $(basename "$OUT"): $BYTES bytes"

say "pinning on $HOST"
CID=$(ssh "$HOST" "docker exec -i ipfs ipfs add -Q --cid-version=1 --pin=true --fast-provide-wait" < "$OUT")
[ -n "$CID" ] || { echo "ipfs add returned no CID"; exit 1; }
echo "    pinned as $CID"

# Nothing else compares what we built with what landed. `ipfs add` hashes
# whatever reached it and exits 0 with a perfectly valid CID for a
# truncated stream, after which the map loads a header and then finds no
# tiles in whole quadrants, with every step having reported success.
say "verifying the pinned object byte-for-byte"
LOCAL_SHA=$(shasum -a 256 "$OUT" | cut -d" " -f1)
REMOTE_SHA=$(ssh "$HOST" "docker exec ipfs ipfs cat $CID | sha256sum" | cut -d" " -f1)
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "PINNED CONTENT DIFFERS FROM THE BUILT ARCHIVE"
  echo "  local  $LOCAL_SHA"
  echo "  pinned $REMOTE_SHA ($CID)"
  echo "do not use this CID"
  exit 1
fi
echo "    sha256 matches: ${LOCAL_SHA:0:16}…"
# Match the row that starts with the CID, not a line number: the header
# row's second column is the literal word "Blocks", and a mere non-empty
# check accepts it and writes `blocks: Blocks` into the pasted entry.
BLOCKS=$(ssh "$HOST" "docker exec ipfs ipfs dag stat --progress=false $CID" \
  | awk -v cid="$CID" '$1 == cid {print $2; exit}')
case "$BLOCKS" in
  ''|*[!0-9]*)
    # Nothing reads `blocks`; losing a verified CID over it would be the
    # worse outcome, so note it and carry on.
    echo "    (could not read a block count: got '$BLOCKS')"
    BLOCKS=0 ;;
esac

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
