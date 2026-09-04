// The drawing surface, and the loop that publishes it.
//
// Thin on purpose: encoding, rasterising and "did anything change" all live in
// pixels.js, which is tested. What is left here is genuinely browser-shaped —
// pointer events, an image buffer, and a timer.
//
// Two rules make the whole thing behave:
//
//   - the drawer's own canvas is authoritative. Incoming frames are ignored
//     while editable, or a snapshot in flight would rub out strokes made since
//     it was sent.
//   - only one paint is ever in flight, so frames cannot land out of order and
//     the version on chain always moves forward.
import { log } from '../app/shell.js';
import {
  blank,
  cellFromPointer,
  decodeRle,
  drawLine,
  encodeRle,
  PALETTE,
  samePixels,
  SIDE,
} from './pixels.js';

const $ = (id) => document.getElementById(id);

/// Fast enough to follow a drawing, slow enough that a round costs ~0.06 IOTA.
const PAINT_MS = 2000;

const RGB = PALETTE.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]);

export function createCanvasView({ store, getGameId, getCanvasId }) {
  const element = $('draw-canvas');
  element.width = SIDE;
  element.height = SIDE;
  const context = element.getContext('2d');
  const image = context.createImageData(SIDE, SIDE);

  let pixels = blank();
  let published = blank();
  let colour = 1;
  let brush = 2;
  let editable = false;
  let inFlight = false;
  let stroke = null;
  let lastVersion = -1;
  let timer = null;

  function render() {
    for (let index = 0; index < pixels.length; index += 1) {
      const [r, g, b] = RGB[pixels[index]] ?? RGB[0];
      const at = index * 4;
      image.data[at] = r;
      image.data[at + 1] = g;
      image.data[at + 2] = b;
      image.data[at + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  // --- drawing ----------------------------------------------------------------

  function cellOf(event) {
    const box = element.getBoundingClientRect();
    return cellFromPointer(
      event.clientX - box.left,
      event.clientY - box.top,
      box.width,
      box.height,
    );
  }

  element.addEventListener('pointerdown', (event) => {
    if (!editable) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    stroke = cellOf(event);
    if (drawLine(pixels, stroke.x, stroke.y, stroke.x, stroke.y, colour, brush)) render();
  });

  element.addEventListener('pointermove', (event) => {
    if (!editable || !stroke) return;
    event.preventDefault();
    const to = cellOf(event);
    // From the last cell, not just a dot: pointer events are far apart on a
    // fast stroke and the gaps would show.
    if (drawLine(pixels, stroke.x, stroke.y, to.x, to.y, colour, brush)) render();
    stroke = to;
  });

  const endStroke = () => {
    stroke = null;
  };
  element.addEventListener('pointerup', endStroke);
  element.addEventListener('pointercancel', endStroke);
  element.addEventListener('pointerleave', endStroke);

  // --- publishing -------------------------------------------------------------

  async function publish() {
    if (!editable || inFlight || samePixels(pixels, published)) return;
    const snapshot = Uint8Array.from(pixels);
    inFlight = true;
    try {
      await store.paint(getGameId(), getCanvasId(), encodeRle(snapshot));
      // What is on chain is this snapshot, not whatever has been drawn since —
      // the difference is exactly what the next tick will send.
      published = snapshot;
    } catch (error) {
      log(`drawing not sent: ${error.message ?? error}`);
    } finally {
      inFlight = false;
    }
  }

  /// A frame from chain. Ignored for the drawer, whose local canvas is ahead.
  function applyRemote(canvas) {
    if (editable || !canvas) return;
    if (canvas.version === lastVersion) return;
    lastVersion = canvas.version;
    pixels = decodeRle(canvas.pixels);
    render();
  }

  /// Called when this client's role changes. Turning editing on resets the
  /// surface: a new round starts blank, and the first tick publishes that.
  function setEditable(next) {
    if (next === editable) return;
    editable = next;
    $('draw-tools').hidden = !next;
    element.classList.toggle('editable', next);
    if (next) {
      pixels = blank();
      // Deliberately not equal to `pixels`, so the blank canvas is published
      // and the previous round's drawing does not linger for the guessers.
      published = blank().fill(255);
      render();
    }
  }

  // --- tools ------------------------------------------------------------------

  const swatches = $('draw-palette');
  PALETTE.forEach((hex, index) => {
    const button = document.createElement('button');
    button.className = 'swatch';
    button.style.background = hex;
    button.title = index === 0 ? 'eraser' : `colour ${index}`;
    if (index === colour) button.classList.add('chosen');
    button.addEventListener('click', () => {
      colour = index;
      swatches.querySelectorAll('.swatch').forEach((other) => other.classList.remove('chosen'));
      button.classList.add('chosen');
    });
    swatches.appendChild(button);
  });

  $('draw-brush').addEventListener('input', (event) => {
    brush = Number(event.target.value);
  });

  $('draw-clear').addEventListener('click', () => {
    pixels = blank();
    render();
  });

  function start() {
    if (timer !== null) return;
    timer = setInterval(() => {
      publish().catch((error) => console.warn('publish failed', error));
    }, PAINT_MS);
  }

  render();
  return { applyRemote, setEditable, start, render };
}
