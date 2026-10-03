import { layers, namedFlavor } from '@protomaps/basemaps';

/// The style's name for the tile source. The pmtiles Protocol is registered
/// under the same name, so `pmtiles://protomaps` resolves to our archive.
export const SOURCE_NAME = 'protomaps';

/// Vendored assets — see tools/fetch-basemap-assets.sh. Relative, because
/// the build is served from a GitHub Pages subpath; resolved against the
/// page at runtime below.
export const BASEMAP_DIR = './basemaps/';
const GLYPHS_PATH = 'fonts/{fontstack}/{range}.pbf';
const SPRITE_PATH = 'sprites/light';

/// MapLibre rejects relative glyph and sprite URLs outright ("must be
/// absolute"), so resolve them here. Only the DIRECTORY goes through
/// new URL(): resolving the glyph path itself would percent-encode the
/// {fontstack} and {range} placeholders to %7B/%7D, after which MapLibre
/// never substitutes them and no label renders.
export function styleFor({ maxzoom, flavor = 'light', lang = 'pl', base } = {}) {
  const dir = new URL(BASEMAP_DIR, base ?? document.baseURI).href;
  return {
    version: 8,
    glyphs: dir + GLYPHS_PATH,
    sprite: dir + SPRITE_PATH,
    sources: {
      [SOURCE_NAME]: { type: 'vector', url: `pmtiles://${SOURCE_NAME}`, maxzoom },
    },
    layers: layers(SOURCE_NAME, namedFlavor(flavor), { lang }),
  };
}
