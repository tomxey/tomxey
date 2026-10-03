#!/usr/bin/env bash
# Vendor the MapLibre glyph and sprite assets Protomaps publishes, so the
# page makes no third-party request. Latin ranges only: 0-255 and 256-511
# cover Polish diacritics (Latin Extended-A), and the full 256-range set is
# 5.95 MB per fontstack against 204 KB for these two.
set -euo pipefail

BASE="https://protomaps.github.io/basemaps-assets"
OUT="$(dirname "$0")/../public/basemaps"
STACKS=("Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic")
RANGES=("0-255" "256-511")

for stack in "${STACKS[@]}"; do
  enc=$(printf %s "$stack" | sed 's/ /%20/g')
  mkdir -p "$OUT/fonts/$stack"
  for range in "${RANGES[@]}"; do
    curl -fsSL -o "$OUT/fonts/$stack/$range.pbf" "$BASE/fonts/$enc/$range.pbf"
  done
done

mkdir -p "$OUT/sprites"
for v in light light@2x; do
  for ext in json png; do
    curl -fsSL -o "$OUT/sprites/$v.$ext" "$BASE/sprites/v4/$v.$ext"
  done
done

du -sh "$OUT"
