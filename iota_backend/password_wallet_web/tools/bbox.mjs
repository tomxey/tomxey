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

/// Inclusive on every edge: an extract whose boundary exactly meets the
/// region still covers it.
export function contains(outer, inner) {
  return (
    inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
  );
}

/// CLI: bbox.mjs <poly-url-or-file> <w,s,e,n>  — exit 0 if covered.
if (process.argv[1]?.endsWith('bbox.mjs')) {
  const [source, bboxArg] = process.argv.slice(2);
  const text = /^https?:/.test(source)
    ? await (await fetch(source)).text()
    : await (await import('node:fs/promises')).readFile(source, 'utf8');
  const outer = envelopeOfPoly(text);
  const inner = parseBbox(bboxArg);
  const ok = contains(outer, inner);
  console.log(`extract envelope: ${outer.map((v) => v.toFixed(4)).join(',')}`);
  console.log(`region bbox:      ${inner.map((v) => v.toFixed(4)).join(',')}`);
  console.log(ok ? 'region is covered' : 'REGION IS NOT COVERED by this extract');
  process.exit(ok ? 0 : 1);
}
