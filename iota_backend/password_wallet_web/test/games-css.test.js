// Lists built from the same <li><span class="who">…<span class="score"> shape
// must all be laid out by the same rules.
//
// The gas list was added without them, so its two spans ran together as inline
// text: "player 7" followed by "0.5 IOTA" rendered as "player 70.5 IOTA",
// which reads as a wrong balance rather than a missing style. Nothing in the
// JS tests could see it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../src/games/games.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../games.html', import.meta.url), 'utf8');

/// Every list the games page fills with who/score rows.
const ROW_LISTS = ['player-list', 'round-feed', 'gas-list', 'score-list'];

test('every who/score list exists in the page', () => {
  for (const id of ROW_LISTS) {
    assert.ok(html.includes(`id="${id}"`), `${id} is missing from games.html`);
  }
});

test('every who/score list is laid out as a flex row', () => {
  // Without this the label and the amount are adjacent inline spans with no
  // separation between them.
  for (const id of ROW_LISTS) {
    assert.ok(
      css.includes(`#${id} li,`) || css.includes(`#${id} li {`),
      `#${id} li has no layout rule — its spans will run together`,
    );
  }
});

test('every who/score list pushes its amount to the right', () => {
  // `.score { margin-left: auto }` is what separates the two spans; a list
  // without it renders "player 70.5 IOTA".
  for (const id of ['gas-list', 'score-list']) {
    assert.ok(
      css.includes(`#${id} .score`),
      `#${id} .score has no rule — the amount will sit against the label`,
    );
  }
});

test('the canvas cannot be smoothed or scroll the page', () => {
  // Two rules that are invisible in tests but break the game on a phone: a
  // blurry 48x48 grid reads as a rendering bug, and without touch-action the
  // page scrolls under the finger instead of drawing.
  const canvasRule = css.slice(css.indexOf('#draw-canvas {'));
  assert.match(canvasRule, /image-rendering:\s*pixelated/);
  assert.match(canvasRule, /touch-action:\s*none/);
});
