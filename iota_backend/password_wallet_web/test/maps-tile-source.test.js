// test/maps-tile-source.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeTileSource } from '../src/maps/tileSource.js';

const data = new Uint8Array(1000).map((_, i) => i % 256);

/// A fake unixfs that records the ranges asked for and yields in chunks,
/// the way the real one streams.
function fakeFs(bytes = data) {
  const asked = [];
  return {
    asked,
    async *cat(_cid, { offset = 0, length, signal } = {}) {
      asked.push({ offset, length, signal });
      const end = length == null ? bytes.length : Math.min(offset + length, bytes.length);
      for (let at = offset; at < end; at += 64) yield bytes.slice(at, Math.min(at + 64, end));
    },
  };
}

test('getBytes asks for exactly the requested range', async () => {
  const fs = fakeFs();
  await makeTileSource({ fs, cid: 'c', key: 'k' }).getBytes(100, 8);
  assert.equal(fs.asked.length, 1);
  assert.equal(fs.asked[0].offset, 100);
  assert.equal(fs.asked[0].length, 8);
});

test('streamed chunks are reassembled in order', async () => {
  const { data: buf } = await makeTileSource({ fs: fakeFs(), cid: 'c', key: 'k' }).getBytes(10, 200);
  assert.equal(buf.byteLength, 200);
  assert.deepEqual([...new Uint8Array(buf).slice(0, 4)], [10, 11, 12, 13]);
});

test('getKey returns the key so pmtiles can cache against it', () => {
  assert.equal(makeTileSource({ fs: fakeFs(), cid: 'c', key: 'kk' }).getKey(), 'kk');
});

test('a read running past the end returns what exists', async () => {
  // pmtiles probes for the header before it knows the archive length.
  const { data: buf } = await makeTileSource({ fs: fakeFs(), cid: 'c', key: 'k' }).getBytes(990, 100);
  assert.equal(buf.byteLength, 10);
});

test('an error from the network surfaces rather than returning short data', async () => {
  // Returning a truncated buffer makes pmtiles fail with an inscrutable
  // decoder error instead of the truth.
  const fs = {
    async *cat() { throw new Error('block fetch failed'); },
  };
  await assert.rejects(
    () => makeTileSource({ fs, cid: 'c', key: 'k' }).getBytes(0, 10),
    /block fetch failed/,
  );
});

test('the abort signal is forwarded to the block fetch', async () => {
  // pmtiles passes a signal (getBytes(offset, length, signal, etag)) and
  // MapLibre aborts superseded tile requests when the user pans. Dropping
  // it leaves those block fetches running, competing on the one p2p
  // connection with the tiles now actually on screen.
  const fs = fakeFs();
  const controller = new AbortController();
  await makeTileSource({ fs, cid: 'c', key: 'k' }).getBytes(0, 8, controller.signal);
  assert.equal(fs.asked[0].signal, controller.signal);
});
