// The regions this page can show.
//
// A region is identified by its CID and nothing else. Where the bytes live
// is discovered at runtime; see routing.js. Adding a region is: run
// tiles/extract.sh, pin it, paste the entry it prints.

export const REGIONS = {
  krakow: {
    name: 'Kraków',
    cid: 'bafybeigpv7cjt6echhfwlndntzckpkekzkobpnxf7nnheq6uccse5zytby',
    bbox: [19.6567, 49.8817, 20.2165, 50.2411],
    center: [19.9366, 50.0614],
    minzoom: 0,
    maxzoom: 14,
    /// Blocks in the archive DAG — used to show honest progress, since a
    /// viewport fetches a fraction of them (measured: 17 of 116).
    blocks: 116,
    /// The planet build this was cut from. Only the newest exists upstream,
    /// so a region is a dated snapshot.
    built: '2026-09-25',
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
