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

import { TimeoutError, withTimeout } from './timeout.js';

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

/// Try addresses in order; the first that connects AND works wins.
/// Addresses are already filtered to browser-dialable, non-relayed ones by
/// routing.js.
///
/// `verify` is what makes this honest. A dial can succeed over a transport
/// that then carries nothing: Firefox reports a connected WebTransport
/// session to kubo and never transfers a byte, and a relayed connection is
/// byte-limited by design. Treating "connected" as "working" strands the
/// page on a dead link while other addresses go untried, so the caller
/// passes a cheap read and we only keep a connection that answers it.
export async function dialFirstWorking(
  libp2p,
  addrs,
  { dialTimeoutMs = 10000, overallTimeoutMs = 45000, onAttempt, verify } = {},
) {
  const attempts = [];
  const deadline = Date.now() + overallTimeoutMs;

  for (const [index, addr] of addrs.entries()) {
    if (Date.now() >= deadline) {
      attempts.push({ addr, reason: 'gave up before trying: overall deadline reached' });
      break;
    }
    // Both phases are reported. Firing only at dial start left the page on
    // one motionless message for the dial AND the probe — up to half a
    // minute per address, which reads as frozen because it is.
    onAttempt?.(addr, index, addrs.length, 'dialing');
    try {
      // withTimeout as well as the signal: libp2p takes an AbortSignal, but
      // a transport that never settles ignores it, and then nothing bounds
      // this at all. Firefox opens a WebTransport session to kubo that
      // connects and then does nothing, so that is the observed case.
      await withTimeout(
        libp2p.dial(multiaddr(addr), { signal: AbortSignal.timeout(dialTimeoutMs) }),
        dialTimeoutMs,
        'connecting',
      );
    } catch (error) {
      attempts.push({ addr, reason: error.message });
      continue;
    }
    if (!verify) return addr;
    onAttempt?.(addr, index, addrs.length, 'checking');
    try {
      await verify(addr);
      return addr;
    } catch (error) {
      attempts.push({ addr, reason: `connected but unusable: ${error.message}` });
      // Leave it open and libp2p will keep preferring it over the address
      // we are about to try.
      await libp2p.hangUp?.(multiaddr(addr)).catch(() => {});
    }
  }
  if (Date.now() >= deadline) {
    throw new TimeoutError('finding a usable host', overallTimeoutMs);
  }
  throw new NoProviderReachableError(attempts);
}
