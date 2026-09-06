// The drawing format. Encoding is the part that decides whether the game is
// affordable, and decoding runs on bytes another player's phone produced, so
// both are worth pinning down.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  blank,
  cellFromPointer,
  decodeRle,
  drawLine,
  encodeRle,
  fitsInAFrame,
  MAX_FRAME_BYTES,
  paintAt,
  PALETTE,
  PIXEL_COUNT,
  samePixels,
  shouldPublish,
  SIDE,
} from '../src/games/pixels.js';

// --- encoding -----------------------------------------------------------------

test('a blank canvas encodes to a handful of bytes', () => {
  const encoded = encodeRle(blank());
  // One pair per run of at most 255, so the whole grid is ceil(n/255) pairs.
  // This ratio is why a snapshot every two seconds is affordable at all.
  assert.equal(encoded.length, Math.ceil(PIXEL_COUNT / 255) * 2);
  assert.ok(encoded.length < PIXEL_COUNT / 100);
});

test('encode then decode is the identity', () => {
  const pixels = blank();
  drawLine(pixels, 0, 0, 47, 47, 1);
  drawLine(pixels, 0, 47, 47, 0, 2);
  paintAt(pixels, 24, 24, 3, 4);
  assert.ok(samePixels(decodeRle(encodeRle(pixels)), pixels));
});

test('runs longer than 255 are split', () => {
  const encoded = encodeRle(blank());
  for (let index = 0; index < encoded.length; index += 2) {
    assert.ok(encoded[index] <= 255 && encoded[index] > 0);
  }
  const total = [...encoded].filter((_, index) => index % 2 === 0).reduce((a, b) => a + b, 0);
  assert.equal(total, PIXEL_COUNT);
});

test('the worst case still fits what the contract accepts', () => {
  // Alternating colours: no two neighbours match, so every pixel is its own
  // run. MAX_CANVAS_BYTES in the contract is exactly this.
  const pixels = blank();
  for (let index = 0; index < PIXEL_COUNT; index += 1) pixels[index] = index % 2;
  assert.equal(encodeRle(pixels).length, PIXEL_COUNT * 2);
});

// --- decoding hostile input ---------------------------------------------------

test('a truncated frame decodes as far as it can', () => {
  const pixels = decodeRle(Uint8Array.from([10, 1]));
  assert.equal(pixels.length, PIXEL_COUNT);
  assert.equal(pixels[0], 1);
  assert.equal(pixels[9], 1);
  assert.equal(pixels[10], 0);
});

test('a trailing odd byte is ignored', () => {
  assert.equal(decodeRle(Uint8Array.from([2, 1, 7])).length, PIXEL_COUNT);
});

test('a run past the end of the grid is clamped', () => {
  // Enough full runs to overshoot the grid, whatever size it is.
  const overshoot = [];
  for (let filled = 0; filled < PIXEL_COUNT + 255; filled += 255) overshoot.push(255, 1);
  const pixels = decodeRle(Uint8Array.from(overshoot));
  assert.equal(pixels.length, PIXEL_COUNT);
  assert.equal(pixels[PIXEL_COUNT - 1], 1);
});

test('an unknown colour falls back to the background', () => {
  const pixels = decodeRle(Uint8Array.from([3, 200]));
  assert.equal(pixels[0], 0);
});

test('a zero-length run does not stall decoding', () => {
  const pixels = decodeRle(Uint8Array.from([0, 5, 2, 1]));
  assert.equal(pixels[0], 1);
});

test('empty bytes decode to a blank canvas', () => {
  assert.ok(samePixels(decodeRle(new Uint8Array()), blank()));
});

// --- drawing ------------------------------------------------------------------

test('a single dot changes one pixel', () => {
  const pixels = blank();
  assert.equal(paintAt(pixels, 5, 5, 1), true);
  assert.equal(pixels[5 * SIDE + 5], 1);
  assert.equal([...pixels].filter((value) => value !== 0).length, 1);
});

test('painting the same colour twice reports no change', () => {
  const pixels = blank();
  paintAt(pixels, 5, 5, 1);
  assert.equal(paintAt(pixels, 5, 5, 1), false);
});

test('drawing off the grid does not throw or wrap', () => {
  const pixels = blank();
  assert.equal(paintAt(pixels, -5, -5, 1), false);
  assert.equal(paintAt(pixels, SIDE + 10, 3, 1), false);
  assert.ok(samePixels(pixels, blank()));
});

test('a brush at the edge clips instead of wrapping to the next row', () => {
  const pixels = blank();
  paintAt(pixels, 0, 10, 1, 3);
  // Row 10 gets cells 0 and 1; row 10's last cell must stay clear, which is
  // what wrapping would have set.
  assert.equal(pixels[10 * SIDE + 0], 1);
  assert.equal(pixels[10 * SIDE + 1], 1);
  assert.equal(pixels[10 * SIDE + (SIDE - 1)], 0);
});

test('a line is connected', () => {
  // The bug this prevents: pointer events arrive far apart, so without
  // interpolation a fast stroke is a row of dots.
  const pixels = blank();
  drawLine(pixels, 0, 0, 20, 7, 1);
  for (let x = 0; x <= 20; x += 1) {
    const column = [...Array(SIDE).keys()].some((y) => pixels[y * SIDE + x] === 1);
    assert.ok(column, `column ${x} has no pixel`);
  }
});

test('a line of zero length is a dot', () => {
  const pixels = blank();
  assert.equal(drawLine(pixels, 3, 3, 3, 3, 1), true);
  assert.equal([...pixels].filter((value) => value !== 0).length, 1);
});

test('a line spanning the whole diagonal terminates', () => {
  const pixels = blank();
  drawLine(pixels, 0, 0, SIDE - 1, SIDE - 1, 1);
  assert.equal(pixels[0], 1);
  assert.equal(pixels[PIXEL_COUNT - 1], 1);
});

test('erasing is drawing with the background colour', () => {
  const pixels = blank();
  drawLine(pixels, 0, 0, 10, 10, 1);
  drawLine(pixels, 0, 0, 10, 10, 0);
  assert.ok(samePixels(pixels, blank()));
});

// --- pointer mapping ----------------------------------------------------------

test('a pointer maps to the cell under it', () => {
  // Expressed against the element's size rather than a grid constant, so this
  // says the same thing at any resolution.
  const size = 480;
  assert.deepEqual(cellFromPointer(0, 0, size, size), { x: 0, y: 0 });
  assert.deepEqual(cellFromPointer(size - 1, size - 1, size, size), {
    x: SIDE - 1,
    y: SIDE - 1,
  });
  assert.deepEqual(cellFromPointer(size / 2, size / 2, size, size), {
    x: SIDE / 2,
    y: SIDE / 2,
  });
});

test('a pointer outside the element clamps to the edge', () => {
  // Dragging off the canvas should draw to the edge, not jump or throw.
  assert.deepEqual(cellFromPointer(-40, 240, 480, 480), { x: 0, y: SIDE / 2 });
  assert.deepEqual(cellFromPointer(9999, 240, 480, 480), { x: SIDE - 1, y: SIDE / 2 });
});

test('every palette entry is a distinct colour', () => {
  assert.equal(new Set(PALETTE).size, PALETTE.length);
});

// --- when a frame is worth a transaction --------------------------------------

test('an idle canvas publishes nothing', () => {
  // The drawer's client ticks every two seconds whether or not they drew, and
  // each frame is real gas. This guard is the only thing between a paused
  // drawer and a slow leak of their funding.
  const pixels = blank();
  drawLine(pixels, 1, 1, 20, 20, 1);
  const published = Uint8Array.from(pixels);
  assert.equal(shouldPublish({ editable: true, inFlight: false, pixels, published }), false);
});

test('a changed canvas publishes', () => {
  const pixels = blank();
  const published = Uint8Array.from(pixels);
  paintAt(pixels, 5, 5, 1);
  assert.equal(shouldPublish({ editable: true, inFlight: false, pixels, published }), true);
});

test('nothing publishes while a frame is already in flight', () => {
  // Two frames at once would fight over the same gas coin.
  const pixels = blank();
  paintAt(pixels, 5, 5, 1);
  assert.equal(shouldPublish({ editable: true, inFlight: true, pixels, published: blank() }), false);
});

test('a guesser never publishes', () => {
  const pixels = blank();
  paintAt(pixels, 5, 5, 1);
  assert.equal(shouldPublish({ editable: false, inFlight: false, pixels, published: blank() }), false);
});

test('starting a round on an already-blank canvas costs nothing', () => {
  // The baseline at hand-over is what the chain last showed. Blank on both
  // sides means the "clear" is free.
  assert.equal(
    shouldPublish({ editable: true, inFlight: false, pixels: blank(), published: blank() }),
    false,
  );
});

test('starting a round over a previous drawing does publish the clear', () => {
  const previous = blank();
  drawLine(previous, 3, 3, 40, 40, 2, 3);
  assert.equal(
    shouldPublish({ editable: true, inFlight: false, pixels: blank(), published: previous }),
    true,
  );
});

// --- frames the network can carry ---------------------------------------------

test('a real drawing is far inside the frame limit', () => {
  // The cap exists because max_pure_argument_size is 16384, not because
  // drawings get close to it.
  const pixels = blank();
  for (let k = 0; k < 12; k += 1) {
    drawLine(pixels, 2 + k * 7, 12, 92 - k * 6, 84 - k * 2, 1 + (k % 7), 4);
  }
  const encoded = encodeRle(pixels);
  assert.ok(fitsInAFrame(encoded));
  assert.ok(encoded.length < 4000, `a scribble encoded to ${encoded.length} bytes`);
});

test('a deliberately dithered canvas is refused rather than sent', () => {
  // Every neighbour differing is the worst case: a pair per pixel, which at
  // this grid exceeds what a transaction can carry.
  const pixels = blank();
  for (let index = 0; index < PIXEL_COUNT; index += 1) pixels[index] = index % 2;
  const encoded = encodeRle(pixels);
  assert.equal(encoded.length, PIXEL_COUNT * 2);
  assert.equal(fitsInAFrame(encoded), false);
});

test('the frame limit stays under what a transaction can carry', () => {
  assert.ok(MAX_FRAME_BYTES <= 16384, 'a frame this size could never be submitted');
});
