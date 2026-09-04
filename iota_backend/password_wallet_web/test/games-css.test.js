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

// --- classes must be defined by a stylesheet the page loads -------------------

test('every class games.html uses is styled by a stylesheet it loads', () => {
  // .icon-btn was defined only in todo/todo.css, which games.html does not
  // load, so nine controls on the games page rendered as bare browser
  // buttons. Nothing else could catch that: the markup and the CSS were both
  // present, just not in the same page.
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(sheets.length >= 2, 'expected games.html to load its stylesheets');

  const loaded = sheets
    .map((href) => readFileSync(new URL(`../${href}`, import.meta.url), 'utf8'))
    .join('\n');

  const used = new Set(
    [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean),
  );
  // Classes the JS attaches rather than the markup.
  for (const extra of ['who', 'score', 'swatch', 'chosen', 'inactive', 'correct', 'editable']) {
    used.add(extra);
  }

  const missing = [...used].filter((name) => !loaded.includes(`.${name}`));
  assert.deepEqual(missing, [], `classes with no rule in a loaded stylesheet: ${missing}`);
});

test('todo.html still styles everything it uses after the move', () => {
  // .icon-btn and .about were moved out of todo.css into the shared
  // stylesheet so games.html would get them. This checks the page they came
  // from did not lose them on the way.
  const todo = readFileSync(new URL('../todo.html', import.meta.url), 'utf8');
  const sheets = [...todo.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)].map((m) => m[1]);
  const loaded = sheets
    .map((href) => readFileSync(new URL(`../${href}`, import.meta.url), 'utf8'))
    .join('\n');

  const used = new Set(
    [...todo.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean),
  );
  const missing = [...used].filter((name) => !loaded.includes(`.${name}`));
  assert.deepEqual(missing, [], `todo.html classes with no rule: ${missing}`);
});

// --- theming -------------------------------------------------------------------

test('the games page overrides the accent', () => {
  for (const name of ['--accent:', '--accent-dark:', '--accent-soft:']) {
    assert.ok(css.includes(name), `games.css does not set ${name}`);
  }
});

test('shared rules use the accent, never red directly', () => {
  // This is what makes one override re-theme the whole page. A shared rule
  // that reaches for var(--red) instead would stay red on the blue page.
  const shared = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const body = shared.slice(shared.indexOf('[hidden] {'));
  const strays = [...body.matchAll(/var\(--red[a-z-]*\)/g)].map((m) => m[0]);
  assert.deepEqual(strays, [], `shared rules using red directly: ${strays}`);
});

test('the accent defaults to red so todo.html is unchanged', () => {
  const shared = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const root = shared.slice(0, shared.indexOf('[hidden] {'));
  assert.match(root, /--accent:\s*var\(--red\)/);
  assert.match(root, /--accent-dark:\s*var\(--red-dark\)/);
  assert.match(root, /--accent-soft:\s*var\(--red-soft\)/);
});

test('the blue is the same blue everywhere it is written down', () => {
  // The stylesheet, the browser chrome, the tab icon and the manifest each
  // carry the colour literally; they drift apart silently.
  const svg = readFileSync(new URL('../public/games-favicon.svg', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../public/games.webmanifest', import.meta.url), 'utf8');
  const accent = css.match(/--accent:\s*(#[0-9a-fA-F]{6})/)[1].toLowerCase();
  assert.ok(html.includes(`content="${accent}"`), 'theme-color differs from --accent');
  assert.ok(svg.toLowerCase().includes(accent), 'favicon differs from --accent');
  assert.ok(manifest.toLowerCase().includes(accent), 'manifest theme differs from --accent');
});

// --- the log -------------------------------------------------------------------

test('the log starts collapsed but errors force it open', () => {
  // Collapsing the log hides the only place failures are reported, so the two
  // halves belong together: a <details> with no `open`, and shell.js opening
  // it when a message is a failure.
  assert.match(html, /<details id="log-block"/, 'the log is not collapsible');
  const tag = html.slice(html.indexOf('<details id="log-block"'));
  assert.ok(!/^<details id="log-block"[^>]*\bopen\b/.test(tag), 'the log starts expanded');

  const shell = readFileSync(new URL('../src/app/shell.js', import.meta.url), 'utf8');
  assert.match(shell, /log-block/, 'nothing opens the log when something fails');
  assert.match(shell, /startsWith\('❌'\)/, 'failures are not detected');
});

test('the log itself is still where shell.js looks for it', () => {
  assert.match(html, /<pre id="log">/);
});
