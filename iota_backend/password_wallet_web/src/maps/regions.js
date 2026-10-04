// The regions this page can show.
//
// A region is identified by its CID and nothing else. Where the bytes live
// is discovered at runtime; see routing.js. Adding a region is: run
// tiles/extract.sh, pin it, paste the entry it prints.

export const REGIONS = {
  krakow: {
    name: 'Kraków',
    cid: 'bafybeih4bfsg5p343buuktyhcli4doaopn4qqscxbwh4duwr65j4a7jt2q',
    bbox: [19.6567, 49.8817, 20.2165, 50.2411],
    center: [19.9366, 50.0614],
    minzoom: 0,
    maxzoom: 14,
    /// Blocks in the archive DAG — used to show honest progress, since a
    /// viewport fetches a fraction of them (measured: 17 of 116).
    blocks: 118,
    /// Built by iota_backend/tiles/build.sh from a Geofabrik extract, not
    /// cut from the hosted planet build — that one carries no `surface`.
    built: '2026-10-04',
  },
};

export const DEFAULT_REGION = 'krakow';

/// Mirrors networkFrom() in config.js: an unknown name falls back rather
/// than producing an entry full of undefined.
export function regionFrom(search, fallback = DEFAULT_REGION) {
  const asked = new URLSearchParams(search ?? '').get('region');
  return asked && REGIONS[asked] ? asked : fallback;
}

export function regionById(id) {
  return REGIONS[id] ?? null;
}
