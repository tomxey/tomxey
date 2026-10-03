import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { webRTCDirect } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { multiaddr } from '@multiformats/multiaddr';
import { createHelia } from 'helia';

export class NoProviderReachableError extends Error {
  constructor(attempts) {
    super(
      attempts.length
        ? `found ${attempts.length} host(s) but could not connect — ` +
            attempts.map((a) => `${a.addr}: ${a.reason}`).join('; ')
        : 'no host is currently providing this map',
    );
    this.name = 'NoProviderReachableError';
    this.attempts = attempts;
  }
}

/// A dial-only Helia node.
///
/// `addresses.listen: []` matters: Helia's browser default listens on
/// /webrtc, and without that transport configured startup fails with
/// UnsupportedListenAddressError. This node never accepts connections.
///
/// No `routers` are configured — routing.js does provider lookup with plain
/// fetch, because @helia/delegated-routing-v1-http-api-client is defective
/// (see the spec, §6.2).
export async function createMapNode() {
  const helia = await createHelia({
    libp2p: {
      addresses: { listen: [] },
      transports: [webTransport(), webRTCDirect(), webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: { identify: identify() },
      peerDiscovery: [],
    },
  });
  await helia.start();
  return helia;
}

/// Try addresses in order; the first that connects wins. Addresses are
/// already filtered to browser-dialable, non-relayed ones by routing.js.
export async function dialFirstWorking(libp2p, addrs, { dialTimeoutMs = 15000, onAttempt } = {}) {
  const attempts = [];
  for (const [index, addr] of addrs.entries()) {
    onAttempt?.(addr, index, addrs.length);
    try {
      await libp2p.dial(multiaddr(addr), { signal: AbortSignal.timeout(dialTimeoutMs) });
      return addr;
    } catch (error) {
      attempts.push({ addr, reason: error.message });
    }
  }
  throw new NoProviderReachableError(attempts);
}
