// Does a Geofabrik extract cover the region we are about to cut from it?
//
// Getting this wrong is silent: planetiler emits an archive whose edges
// are simply empty, which looks like a finished map. Cheap to check from
// the .poly boundary file Geofabrik publishes beside every extract.

/// "w,s,e,n" -> [w, s, e, n]
export function parseBbox(text) {
  const parts = String(text ?? '').split(',').map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`bbox must be four numbers "w,s,e,n", got: ${JSON.stringify(text)}`);
  }
  return parts;
}

/// The envelope of a .poly file. Format: a name line, then one or more
/// rings — a ring name line, "lon lat" pairs, END — then a final END.
/// Only lines that are exactly two numbers are coordinates; the ring
/// names ("1") and the END markers are not, and treating them as such
/// would drag the envelope towards 0,0 and pass every check.
export function envelopeOfPoly(polyText) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  let seen = 0;
  for (const line of String(polyText ?? '').split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 2) continue;
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    seen += 1;
    w = Math.min(w, lon);
    s = Math.min(s, lat);
    e = Math.max(e, lon);
    n = Math.max(n, lat);
  }
  if (!seen) throw new Error('no coordinates found in .poly file');
  return [w, s, e, n];
}

/// Every ring in a .poly file. The format is: a name line, then for each
/// ring a name line ("1", "2", …, or "!1" for a hole), "lon lat" pairs,
/// END — and a final END.
///
/// Rings matter because an ENVELOPE IS NOT A POLYGON. Geofabrik extracts
/// are concave and sometimes multi-ring (a mainland plus an offshore
/// group), so a bbox can sit inside the bounding box and hundreds of
/// kilometres from any data.
export function parsePolyRings(polyText) {
  const rings = [];
  let current = null;
  let hole = false;
  for (const raw of String(polyText ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'END') {
      if (current) {
        if (current.points.length < 3) {
          throw new Error(`ring has ${current.points.length} points; a ring needs at least 3`);
        }
        rings.push(current);
        current = null;
      }
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length === 2 && parts.every((n) => Number.isFinite(Number(n)))) {
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      // Without this, one stray "-180 -90" line makes the extract the
      // whole planet and every containment check passes.
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        throw new Error(`coordinate out of range: ${lon} ${lat}`);
      }
      if (!current) current = { hole, points: [] };
      current.points.push([lon, lat]);
      continue;
    }
    // A ring header. "!" prefixes a hole.
    hole = line.startsWith('!');
    current = null;
  }
  if (!rings.length) throw new Error('no coordinates found in .poly file');
  return rings;
}

function pointInRing(points, [x, y]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/// Inside an outer ring and not inside a hole.
export function pointInRings(rings, point) {
  const outer = rings.some((r) => !r.hole && pointInRing(r.points, point));
  if (!outer) return false;
  return !rings.some((r) => r.hole && pointInRing(r.points, point));
}

/// Does the extract cover the whole region?
///
/// Sampled, not exact: true rectangle-in-polygon needs clipping, and a
/// dense grid catches the failure that actually happens — a region near
/// or across a boundary. `steps` samples (steps+1)^2 points including all
/// four corners, so a notch bigger than the region divided by `steps` is
/// caught.
export function coversBbox(rings, bbox, steps = 12) {
  const [w, s, e, n] = bbox;
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const lon = w + ((e - w) * i) / steps;
      const lat = s + ((n - s) * j) / steps;
      if (!pointInRings(rings, [lon, lat])) return false;
    }
  }
  return true;
}

/// Inclusive on every edge: an extract whose boundary exactly meets the
/// region still covers it. Kept because `coversBbox` is the real test and
/// this is the cheap pre-filter.
export function contains(outer, inner) {
  return (
    inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
  );
}

/// CLI: bbox.mjs <poly-url-or-file> <w,s,e,n>  — exit 0 if covered.
if (process.argv[1]?.endsWith('bbox.mjs')) {
  const [source, bboxArg] = process.argv.slice(2);
  let text;
  if (/^https?:/.test(source)) {
    const res = await fetch(source);
    // An unchecked body means a 404 page gets parsed as a boundary.
    if (!res.ok) {
      console.log(`could not fetch ${source}: HTTP ${res.status}`);
      process.exit(1);
    }
    text = await res.text();
  } else {
    text = await (await import('node:fs/promises')).readFile(source, 'utf8');
  }
  const rings = parsePolyRings(text);
  const outer = envelopeOfPoly(text);
  const inner = parseBbox(bboxArg);
  const ok = coversBbox(rings, inner);
  console.log(`extract: ${rings.length} ring(s), envelope ${outer.map((v) => v.toFixed(4)).join(',')}`);
  console.log(`region bbox:      ${inner.map((v) => v.toFixed(4)).join(',')}`);
  console.log(ok ? 'region is covered' : 'REGION IS NOT COVERED by this extract');
  process.exit(ok ? 0 : 1);
}
