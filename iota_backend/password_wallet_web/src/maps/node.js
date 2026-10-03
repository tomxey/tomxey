import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { webRTCDirect } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { multiaddr } from '@multiformats/multiaddr';
import { withBitswap } from '@helia/bitswap';
import { withLibp2pLight } from '@helia/libp2p';
import { createHeliaLight } from 'helia';

export class NoProviderReachableError extends Error {
  /// `providersSeen` separates two states that look identical from here:
  /// nobody is providing the CID, versus providers exist but advertise
  /// nothing a browser can dial (the relay-only case in spec §4). They have
  /// different remedies, so the count has to reach the UI.
  constructor(attempts, providersSeen = 0) {
    let message;
    if (attempts.length) {
      message =
        `found ${attempts.length} host(s) but could not connect — ` +
        attempts.map((a) => `${a.addr}: ${a.reason}`).join('; ');
    } else if (providersSeen) {
      message = `found ${providersSeen} provider(s), none reachable from a browser`;
    } else {
      message = 'no host is currently providing this map';
    }
    super(message);
    this.name = 'NoProviderReachableError';
    this.attempts = attempts;
    this.providersSeen = providersSeen;
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
  // Composed by hand instead of calling createHelia(), which is
  //   withBitswap(withLibp2p(withHTTP(createHeliaLight(...))))
  // — and `withHTTP` is the trustless-gateway block broker. With it, the
  // page measurably fetched blocks from trustless-gateway.link and
  // 4everland.io: hash-verified, but a gateway dependency this design
  // exists to avoid. Leaving withHTTP out makes retrieval purely
  // peer-to-peer.
  //
  // `routers: []` because we discover providers ourselves in routing.js and
  // dial them explicitly. Helia's default delegated-routing client is also
  // defective — its abort handler calls cancel() on an already-locked
  // ReadableStream, which spams the console (and is fatal under Node).
  const helia = withBitswap(
    withLibp2pLight(createHeliaLight({ routers: [] }), {
      // Dial-only client. Helia's browser default listens on /webrtc, and
      // without that transport configured startup fails with
      // UnsupportedListenAddressError. This node accepts no connections.
      addresses: { listen: [] },
      transports: [webTransport(), webRTCDirect(), webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: { identify: identify() },
      peerDiscovery: [],
    }),
  );
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
