// Finding who has a CID, without ever naming where the data lives.
//
// Every rule here came from a measured failure during the 2026-10-03 spike;
// each is annotated with the one it prevents.

/// Routing endpoints answer "who has CID X". They never carry tile data,
/// and content is verified against the CID, so a hostile router can only
/// fail to answer — it cannot poison the map. More than one, deliberately:
/// delegated-ipfs.dev is run by the organisation that just retired ipfs.io.
export const ROUTERS = [
  'https://delegated-ipfs.dev/routing/v1',
  'https://cid.contact/routing/v1',
];

/// Transports a browser can actually dial. Note `/tls/ws`: AutoTLS spells
/// secure websockets that way, and matching only `/wss` silently skips the
/// most reachable address a public kubo publishes.
const BROWSER_TRANSPORTS = ['/webtransport/', '/webrtc-direct/', '/wss', '/tls/ws'];

export function isBrowserDialable(addr) {
  // Relayed connections come back limited={} and bulk reads fail on them.
  // A relay-only provider is discoverable but unusable, so drop it here
  // rather than discovering that at the first tile.
  if (addr.includes('/p2p-circuit')) return false;
  return BROWSER_TRANSPORTS.some((t) => addr.includes(t));
}

/// Routing records carry addresses WITHOUT the /p2p/<id> suffix. Dialling
/// one without it leaves libp2p no identity to verify, and the handshake
/// fails with a message that names neither cause nor cure.
export function withPeerId(addr, peerId) {
  return addr.includes('/p2p/') ? addr : `${addr}/p2p/${peerId}`;
}

/// The routing API answers in newline-delimited JSON, and some lines are
/// neither records nor valid JSON. Skip what we cannot read.
export function parseRecords(ndjson) {
  const out = [];
  for (const line of String(ndjson ?? '').split('\n')) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    for (const rec of parsed.Providers ?? [parsed]) {
      if (!rec?.ID) continue;
      out.push({ id: rec.ID, addrs: rec.Addrs ?? [] });
    }
  }
  return out;
}

const keyFor = (cid) => `map-provider:${cid}`;

export function makeRouting({
  fetch,
  storage,
  routers = ROUTERS,
  log,
  /// Lookup is probabilistic: measured at roughly one empty answer in four
  /// for a CID that is definitely provided. Retrying is the difference
  /// between "no host" and "ask again".
  attempts = 2,
  backoffMs = 500,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  /// Storage can be refused entirely (Safari private browsing). A missing
  /// cache must never cost us the map.
  const safeStorage = {
    get(k) {
      try {
        return storage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        storage.setItem(k, v);
      } catch {
        log?.('could not remember provider address; continuing');
      }
    },
    remove(k) {
      try {
        storage.removeItem(k);
      } catch {
        /* nothing to do */
      }
    },
  };

  async function query(url) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
      if (!res.ok) return [];
      return parseRecords(await res.text());
    } catch (error) {
      log?.(`router ${url} failed: ${error.message}`);
      return [];
    }
  }

  /// Provider records sometimes arrive with no addresses at all — measured
  /// at roughly one query in four. The peer endpoint knows them.
  async function resolveAddresses(router, record) {
    if (record.addrs.length) return record.addrs;
    const [peer] = await query(`${router}/peers/${record.id}`);
    return peer?.addrs ?? [];
  }

  return {
    remember(cid, addr) {
      safeStorage.set(keyFor(cid), addr);
    },

    forget(cid) {
      safeStorage.remove(keyFor(cid));
    },

    /// Learned address first, then every router in parallel. "Learned"
    /// means an address that worked here before — never a configured one,
    /// so the no-hardcoded-host property holds.
    async addressesFor(cid) {
      const learned = safeStorage.get(keyFor(cid));
      if (learned) {
        log?.('using a previously working provider address');
        return [learned];
      }

      let wait = backoffMs;
      for (let attempt = 1; ; attempt += 1) {
        const found = await lookup(cid);
        if (found.length || attempt >= attempts) return found;
        log?.(`no providers on attempt ${attempt}; retrying in ${wait} ms`);
        await sleep(wait);
        wait *= 2;
      }
    },
  };

  async function lookup(cid) {
      const found = [];
      const results = await Promise.all(
        routers.map(async (router) => {
          const records = await query(`${router}/providers/${cid}`);
          return Promise.all(
            records.map(async (record) => ({
              record,
              addrs: await resolveAddresses(router, record),
            })),
          );
        }),
      );

      for (const perRouter of results) {
        for (const { record, addrs } of perRouter) {
          for (const addr of addrs) {
            if (!isBrowserDialable(addr)) continue;
            const full = withPeerId(addr, record.id);
            if (!found.includes(full)) found.push(full);
          }
        }
      }
      log?.(`routing found ${found.length} dialable addresses`);
      return found;
  }
}
