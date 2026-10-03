# Vendored basemap assets

Fetched 2026-10-03 by `tools/fetch-basemap-assets.sh` from
<https://protomaps.github.io/basemaps-assets>.

## Why these are in the repo

MapLibre cannot draw a single label without glyph files, and the Protomaps
flavors reference sprites for POI icons. Neither lives in the tile archive on
IPFS. Loading them from `protomaps.github.io` would put a third-party request
on every page load, which is against the grain of a page whose entire point is
not depending on a host — so they are served same-origin instead.

## What was taken, and what was not

Only the Latin ranges, `0-255` and `256-511`, for three fontstacks:

| | size |
|---|---|
| one fontstack, all 256 ranges | 5.95 MB |
| one fontstack, the two Latin ranges | 204 KB |
| what is here — 3 fontstacks + sprites | **676 KB** |

Polish diacritics (ą ć ę ł ń ó ś ź ż) are all in Latin Extended-A, inside
`256-511`, so Kraków's labels render completely.

**Labels in other scripts will not render.** Greek, Cyrillic, Hebrew, CJK and
the rest are in ranges that were not vendored. The Protomaps style also
*conditionally* asks for a separate `Noto Sans Devanagari Regular v1`
fontstack for Devanagari labels; that stack is not vendored either, so such a
label would produce a 404 for the glyph range and render blank. No Kraków
label triggers it. That is a deliberate trade for
size, and it is visible rather than silent — a missing glyph shows as a blank
box, not as a wrong name. Adding a region outside the Latin alphabet means
adding its ranges to `RANGES` in the script and re-running it.

## Licence

The Noto fonts are licensed under the SIL Open Font License; see
`OFL.txt` in the upstream `fonts/` directory. The sprites come from the
Protomaps basemaps assets repository, BSD-licensed.

Regenerate with `./tools/fetch-basemap-assets.sh` from the web app root.
