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
/// `lang` controls MAP LABELS, not the interface. It defaults to Polish
/// deliberately: for a Kraków region the local names are the ones on the
/// signposts and on every other map you would carry, so "Wisła" beats
/// "Vistula" when you are navigating. The page's own text is English.
/// Surfaces OSM considers hard. Anything else — including values we have
/// never seen, which `surface` being free text guarantees — is treated as
/// unpaved. That is the safe direction to be wrong in: calling a muddy
/// track a road tells someone they can ride it.
const HARD_SURFACES = [
  'paved', 'asphalt', 'concrete', 'concrete:plates', 'concrete:lanes',
  'paving_stones', 'sett', 'cobblestone', 'metal', 'wood',
];

/// grade1 (firm) through grade5 (barely a track), with the dash getting
/// sparser as the surface gets worse.
const TRACK_GRADES = [
  ['grade1', [6, 1]],
  ['grade2', [4, 1]],
  ['grade3', [3, 2]],
  ['grade4', [2, 3]],
  ['grade5', [1, 4]],
];

/// Drawn on top of the Protomaps layers, never merged into them, so an
/// upstream bump cannot displace this.
export function trailLayers(source) {
  const common = { source, 'source-layer': 'roads' };
  return [
    {
      ...common,
      id: 'trek-unpaved',
      type: 'line',
      filter: ['all', ['has', 'surface'], ['!', ['in', ['get', 'surface'], ['literal', HARD_SURFACES]]]],
      paint: {
        'line-color': '#8a6d3b',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 3],
        'line-dasharray': [2, 2],
      },
    },
    // One layer per grade, because `line-dasharray` is NOT data-driven in
    // MapLibre — it is read with constantOr(), so a match expression on it
    // is silently ignored and every track would get the same dash. The
    // dash itself reads as "how rough is this": grade1 nearly solid,
    // grade5 barely there.
    ...TRACK_GRADES.map(([grade, dash]) => ({
      ...common,
      id: `trek-tracktype-${grade}`,
      type: 'line',
      filter: ['==', ['get', 'tracktype'], grade],
      paint: {
        'line-dasharray': dash,
        'line-color': '#7a5c2e',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 3.5],
      },
    })),
    {
      ...common,
      id: 'trek-paths',
      type: 'line',
      filter: ['==', ['get', 'kind'], 'path'],
      paint: {
        // kind_detail is the raw OSM `highway` value. `path` must be here:
        // it is what most forest and hill trails are tagged, and leaving
        // it to the fallback painted nearly the whole network one colour.
        //
        // A path explicitly open to bikes is drawn as a cycleway, because
        // on the ground that is what it is — which is the question
        // `bicycle` is carried in the tiles to answer.
        'line-color': [
          'case',
          ['in', ['get', 'bicycle'], ['literal', ['yes', 'designated', 'permissive']]],
          '#1565c0',
          [
            'match', ['get', 'kind_detail'],
            'cycleway', '#1565c0',
            'bridleway', '#6a4c93',
            'track', '#7a5c2e',
            'steps', '#8e44ad',
            'footway', '#b03a2e',
            'pedestrian', '#b03a2e',
            'path', '#c0392b',
            '#c0392b',
          ],
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 2.5],
      },
    },
  ];
}

export function styleFor({ maxzoom, flavor = 'light', lang = 'pl', base } = {}) {
  const dir = new URL(BASEMAP_DIR, base ?? document.baseURI).href;
  return {
    version: 8,
    glyphs: dir + GLYPHS_PATH,
    sprite: dir + SPRITE_PATH,
    sources: {
      [SOURCE_NAME]: { type: 'vector', url: `pmtiles://${SOURCE_NAME}`, maxzoom },
    },
    layers: [...layers(SOURCE_NAME, namedFlavor(flavor), { lang }), ...trailLayers(SOURCE_NAME)],
  };
}
