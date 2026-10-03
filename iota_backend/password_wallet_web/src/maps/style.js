import { layers, namedFlavor } from '@protomaps/basemaps';

/// The style's name for the tile source. The pmtiles Protocol is registered
/// under the same name, so `pmtiles://protomaps` resolves to our archive.
export const SOURCE_NAME = 'protomaps';

/// Vendored — see tools/fetch-basemap-assets.sh. Relative, because the
/// build is served from a GitHub Pages subpath.
export const GLYPHS_URL = './basemaps/fonts/{fontstack}/{range}.pbf';
export const SPRITE_URL = './basemaps/sprites/light';

export function styleFor({ maxzoom, flavor = 'light', lang = 'pl' }) {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: SPRITE_URL,
    sources: {
      [SOURCE_NAME]: { type: 'vector', url: `pmtiles://${SOURCE_NAME}`, maxzoom },
    },
    layers: layers(SOURCE_NAME, namedFlavor(flavor), { lang }),
  };
}
