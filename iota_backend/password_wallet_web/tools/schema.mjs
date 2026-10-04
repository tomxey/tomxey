// Dump a pinned archive's declared schema to JSON, so tests can check the
// style against it without touching the network.
//
// Usage: node tools/schema.mjs <cid> [multiaddr] > src/maps/schema.json
import { withBitswap } from '@helia/bitswap';
import { withLibp2pLight } from '@helia/libp2p';
import { unixfs } from '@helia/unixfs';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { tcp } from '@libp2p/tcp';
import { multiaddr } from '@multiformats/multiaddr';
import { createHeliaLight } from 'helia';
import { CID } from 'multiformats/cid';
import { PMTiles } from 'pmtiles';

const [cidStr, addr] = process.argv.slice(2);
if (!cidStr) {
  console.error('usage: node tools/schema.mjs <cid> [multiaddr]');
  process.exit(1);
}
const PROVIDER =
  addr ??
  '/ip4/65.108.14.12/tcp/4001/p2p/12D3KooWKJHdtEG3GvWWx4EaJqtHpUsfE8b9uZiaoFgesmnoSnk4';

const helia = withBitswap(
  withLibp2pLight(createHeliaLight({ routers: [] }), {
    addresses: { listen: [] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify() },
    peerDiscovery: [],
  }),
);
await helia.start();
await helia.libp2p.dial(multiaddr(PROVIDER));

const cid = CID.parse(cidStr);
const fs = unixfs(helia);
const source = {
  getKey: () => cidStr,
  async getBytes(offset, length) {
    const parts = [];
    for await (const c of fs.cat(cid, { offset, length })) parts.push(c);
    const total = parts.reduce((n, p) => n + p.length, 0);
    const buf = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      buf.set(p, at);
      at += p.length;
    }
    return { data: buf.buffer };
  },
};

const meta = await new PMTiles(source).getMetadata();
const layers = {};
for (const l of meta.vector_layers ?? []) layers[l.id] = Object.keys(l.fields ?? {}).sort();
console.log(JSON.stringify({ cid: cidStr, built: new Date().toISOString().slice(0, 10), layers }, null, 2));
await helia.stop();
