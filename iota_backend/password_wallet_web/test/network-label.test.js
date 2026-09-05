// The network shown to the user must be the network being used.
//
// Every page used to say "testnet" in its title and badge. When the game moved
// to devnet those labels stayed put, so the page insisted it was on testnet
// while every transaction went to devnet — and the only way to tell was to
// look up an object id by hand. A label that can disagree with the config is
// worse than no label, so no page may contain a network name at all.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const pages = readdirSync(root).filter((name) => name.endsWith('.html'));

test('there are pages to check', () => {
  assert.ok(pages.length >= 3, `expected the app's pages, found ${pages}`);
});

test('no page hardcodes a network name', () => {
  for (const page of pages) {
    const html = readFileSync(new URL(page, root), 'utf8');
    const found = html.match(/\b(testnet|devnet|localnet|mainnet)\b/g);
    assert.equal(found, null, `${page} names a network: ${found}`);
  }
});

test('every page has a badge for the resolved network to go in', () => {
  for (const page of pages) {
    const html = readFileSync(new URL(page, root), 'utf8');
    assert.match(html, /id="network-badge"/, `${page} has nowhere to show the network`);
  }
});

test('every page entry point fills the badge in', () => {
  // A badge nothing writes to is an empty badge, which is quieter but no more
  // truthful than a wrong one.
  const entries = ['src/main.js', 'src/app/main.js', 'src/games/main.js'];
  for (const entry of entries) {
    const source = readFileSync(new URL(entry, root), 'utf8');
    assert.match(source, /showNetwork\(/, `${entry} never calls showNetwork`);
  }
});

test('the label appends rather than rewrites the title', () => {
  // The <title> ships without a network precisely so there is nothing to keep
  // in step; a substitution would silently do nothing if the format drifted.
  const source = readFileSync(new URL('src/network-label.js', root), 'utf8');
  assert.match(source, /document\.title = `\$\{document\.title\} \(\$\{network\}\)`/);
});
