# Map tiles

`build.sh` builds the region's vector tiles from OpenStreetMap, pins them on
the IPFS node, and prints the `src/maps/regions.js` entry to paste.

```bash
./build.sh --check                   # diagnose preconditions, change nothing
./build.sh krakow                    # the default region
REGION=europe/poland/slaskie BBOX=18.8,49.6,19.4,50.1 ./build.sh beskidy
MAXZOOM=15 ./build.sh krakow         # bigger archive, more detail
```

## Why we build our own

The hosted Protomaps planet build does not carry `surface` or `tracktype`.
On a trekking map that is not cosmetic: it is the difference between a
forest road you can ride and a bog you should walk around.

So this builds the Protomaps profile **with four attributes added**:

| attribute | what it gives you |
|---|---|
| `surface` | asphalt / gravel / dirt / sand — free text, straight from OSM |
| `tracktype` | grade1–grade5, OSM's quality scale for terrain roads |
| `sac_scale` | hiking difficulty, T1–T6 |
| `bicycle` | whether a path may legally be ridden |

They are added by `surface.patch` — four lines against the upstream commit
pinned in `UPSTREAM`, not a vendored fork. The change stays reviewable in
one screen, and a drifted upstream **fails loudly at apply time** rather
than quietly producing tiles without the fields. Re-basing it, when that
happens, is minutes.

Upstream is [protomaps/basemaps](https://github.com/protomaps/basemaps),
BSD-3-Clause. Keeping their schema is what lets the existing 600-layer
MapLibre style keep working — we only append to it.

## It builds locally, never on raw-steak

raw-steak runs an **IOTA validator**. planetiler is a memory-hungry JVM
batch job, and starving a validator to render tiles is a bad trade that
would be slow to attribute when it bit. raw-steak's only job here is
`ipfs add` and serving.

Everything Java runs in **Docker**; there is no JDK on either machine and
there is no reason to install one.

## Stages

1. verify the Geofabrik extract covers the region (`tools/bbox.mjs`)
2. clone `protomaps/basemaps` at the pinned SHA
3. apply `surface.patch`, and refuse to continue if it does not apply
4. `mvn package` in a Maven image
5. download the extract, run planetiler clipped to the bbox, z0–14
6. `ipfs add` on the pinning node and print the `regions.js` entry

## The extract must cover the region

Name the wrong Geofabrik file and planetiler happily produces an archive
whose edges are empty — a map that looks finished and is not. Step 1
checks it from the `.poly` boundary file and aborts if not covered. For a
region spanning voivodeships, use `REGION=europe/poland` and accept the
bigger download.

## Operational notes

- **`:5001` on the pinning node must stay bound to `127.0.0.1`.** It is
  remote control over the node.
- `4001` must be reachable on **both TCP and UDP** — WebTransport and
  WebRTC-direct, the transports browsers actually use, run over UDP.
- `--fast-provide-wait` forces an immediate DHT provide, so the CID is
  discoverable when the script returns rather than after the next sweep.
- One node pinning means if it is down, the map is down. Content
  addressing gives verifiability and portability, **not** redundancy.
- After a build, refresh the schema the style is checked against:
  `node tools/schema.mjs <cid> > src/maps/schema.json`.

## Never commit an archive

`.gitignore` here excludes `*.pmtiles`. They belong on IPFS, not in the
repo, and emphatically not in `docs/`, the live GitHub Pages site.

## Licence

Tiles are derived from OpenStreetMap, licensed **ODbL**. Attribution is
mandatory and travels in the archive's own metadata, so MapLibre renders
it from the style rather than from a hardcoded string.
