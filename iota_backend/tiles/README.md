# Map tiles

`extract.sh` cuts one region out of the Protomaps planet build, pins it on
the IPFS node, and prints the `src/maps/regions.js` entry to paste.

```bash
./extract.sh --check                 # diagnose preconditions, change nothing
./extract.sh krakow                  # defaults: Kraków bbox, maxzoom 14
./extract.sh tatry 19.7,49.1,20.3,49.4 14
BUILD=20261015 ./extract.sh krakow   # when the default build has expired
```

## What it does, and why it is cheap

The planet file is ~129 GB and serves HTTP range requests, so `pmtiles
extract` reads only the tiles inside the bounding box. Measured for Kraków:
**51 requests, 32 MB transferred, 13 seconds**, producing a 29 MB archive of
1001 tiles across z0–z14 (116 IPFS blocks).

z14 is deliberate. MapLibre *overzooms* — it draws z15–z20 from z14 data — so
vector tiles are needed only to z14. z15 would double the archive to 58 MB for
data the renderer can already interpolate. Raster tiles would have needed
~87,000 tiles and over a gigabyte for the same result.

## The build date goes stale

Builds are kept for **about a week**. On 2026-10-03, `20260928` onwards
resolved and `20260926` was already gone — including the `20260925` build the
current Kraków archive was cut from, five days earlier. So the `BUILD` default
in the script will expire; `--check` tells you when, and you pass a newer date.

A region is a dated snapshot. Its durable identity is its **CID**, not the
build it came from — which is why nothing in the app references a build date.

## Pinning

The node is raw-steak (`IPFS_HOST`, default `raw-steak-validator`), running
kubo in a container named `ipfs`. Two rules:

- **`:5001` must never be exposed.** It is remote control over the node. It is
  bound to `127.0.0.1` today; keep it that way.
- `4001` must be reachable on **both TCP and UDP**. WebTransport and
  WebRTC-direct — the transports browsers actually use — run over UDP.

`--fast-provide-wait` on `ipfs add` forces an immediate DHT provide, so the
CID is discoverable when the script returns rather than after the next sweep.

With one node pinning, if it is down the map is down. Content addressing gives
verifiability and portability, **not** redundancy: browsers that load the map
cache blocks but do not re-provide them. Pinning the same CID anywhere else
adds a provider with no change to the app.

## Never commit an archive

`.gitignore` here excludes `*.pmtiles`. They belong on IPFS, not in the repo,
and emphatically not in `docs/`, which is the live GitHub Pages site.

## Licence

Tiles are derived from OpenStreetMap data, licensed **ODbL**. Attribution is
mandatory and is carried in the archive's own metadata, so MapLibre renders it
from the style rather than from a hardcoded string.

Deriving our own tiles is also what keeps this clear of the OSM tile usage
policy, which prohibits bulk-downloading `tile.openstreetmap.org`. That
service is never contacted.
