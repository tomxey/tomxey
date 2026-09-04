// The drawing itself: a 48×48 grid of palette indices, and the encoding that
// makes it cheap enough to put on chain every couple of seconds.
//
// The contract stores `pixels` as opaque bytes and only checks the length, so
// the format lives entirely here. Run-length encoding is what makes this
// affordable: a blank canvas is 2304 pixels but 20 bytes, and a typical
// drawing a few hundred — against 7600 nanos per byte of storage, the
// difference between a playable game and one nobody can afford.
//
// Pure on purpose. Every DOM-free decision — encoding, decoding, line
// rasterising, whether anything actually changed — is tested; canvas.js only
// paints what these functions return.

export const SIDE = 48;
export const PIXEL_COUNT = SIDE * SIDE;

/// Index 0 is the background and must stay first: `blank()` fills with it, and
/// the eraser writes it. The rest are what a phone can distinguish at this
/// size — subtle shades are wasted here.
export const PALETTE = Object.freeze([
  '#ffffff',
  '#1b1b1b',
  '#d92b2b',
  '#1f6feb',
  '#2ea043',
  '#f2c744',
  '#8b5a2b',
  '#9c27b0',
]);

const MAX_RUN = 255;

export function blank() {
  return new Uint8Array(PIXEL_COUNT);
}

/// (count, colour) pairs. Runs longer than 255 are split, since a count has
/// to fit in a byte.
export function encodeRle(pixels) {
  const out = [];
  let index = 0;
  while (index < pixels.length) {
    const colour = pixels[index];
    let run = 1;
    while (index + run < pixels.length && pixels[index + run] === colour && run < MAX_RUN) {
      run += 1;
    }
    out.push(run, colour);
    index += run;
  }
  return Uint8Array.from(out);
}

/// Tolerant by design: the bytes come from another player's device, and a
/// truncated or malformed frame must render as much as it can rather than
/// throw inside a render loop. A trailing odd byte, an over-long run and an
/// unknown colour are all survivable.
export function decodeRle(bytes) {
  const pixels = blank();
  let at = 0;
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const run = bytes[index];
    const colour = bytes[index + 1] < PALETTE.length ? bytes[index + 1] : 0;
    if (run === 0) continue;
    const end = Math.min(at + run, PIXEL_COUNT);
    pixels.fill(colour, at, end);
    at = end;
    if (at >= PIXEL_COUNT) break;
  }
  return pixels;
}

const inside = (x, y) => x >= 0 && y >= 0 && x < SIDE && y < SIDE;

/// Paint a square brush centred on (x, y). Returns true if any pixel actually
/// changed, which is what lets the uploader skip a frame that would cost gas
/// and say nothing.
export function paintAt(pixels, x, y, colour, size = 1) {
  const half = Math.floor(size / 2);
  let changed = false;
  for (let dy = -half; dy <= size - 1 - half; dy += 1) {
    for (let dx = -half; dx <= size - 1 - half; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (!inside(px, py)) continue;
      const at = py * SIDE + px;
      if (pixels[at] === colour) continue;
      pixels[at] = colour;
      changed = true;
    }
  }
  return changed;
}

/// Bresenham between two grid cells. Pointer events arrive far apart on a
/// fast stroke — without this a quick line is a row of disconnected dots.
export function drawLine(pixels, x0, y0, x1, y1, colour, size = 1) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);

  const stepX = x < endX ? 1 : -1;
  const stepY = y < endY ? 1 : -1;
  const deltaX = Math.abs(endX - x);
  const deltaY = Math.abs(endY - y);
  let error = deltaX - deltaY;

  let changed = false;
  // Bounded because each iteration moves at least one axis one step, so it
  // cannot exceed the grid's diagonal span twice over.
  for (let guard = 0; guard <= deltaX + deltaY + 1; guard += 1) {
    if (paintAt(pixels, x, y, colour, size)) changed = true;
    if (x === endX && y === endY) break;
    const doubled = error * 2;
    if (doubled > -deltaY) {
      error -= deltaY;
      x += stepX;
    }
    if (doubled < deltaX) {
      error += deltaX;
      y += stepY;
    }
  }
  return changed;
}

/// Which grid cell a pointer at (offsetX, offsetY) over an element of
/// `width`×`height` CSS pixels is on. Clamped: a stroke that leaves the
/// element should draw to the edge, not vanish.
export function cellFromPointer(offsetX, offsetY, width, height) {
  const clamp = (value) => Math.min(SIDE - 1, Math.max(0, value));
  return {
    x: clamp(Math.floor((offsetX / width) * SIDE)),
    y: clamp(Math.floor((offsetY / height) * SIDE)),
  };
}

/// Whether a frame is worth a transaction.
///
/// An idle canvas must cost nothing: the drawer's client ticks every two
/// seconds whether or not they drew anything, and each frame is a real
/// transaction against their gas. `published` is what the chain already holds,
/// so this is the only thing standing between a paused drawer and a slow leak
/// of their funding.
export function shouldPublish({ editable, inFlight, pixels, published }) {
  if (!editable || inFlight) return false;
  return !samePixels(pixels, published);
}

export function samePixels(a, b) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}
