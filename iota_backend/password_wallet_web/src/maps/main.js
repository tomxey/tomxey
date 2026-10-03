import { unixfs } from '@helia/unixfs';
// maplibre-gl 6 has no default export; `Map` is aliased so it does not
// shadow the global Map.
import { Map as MapLibreMap, NavigationControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
// MapLibre builds its tile-parsing worker from a URL that rollup cannot see,
// so vite emits no worker asset and the page dies with "Worker failed to
// load". `?worker&url` makes vite bundle the worker — resolving its own
// sibling imports, which a bare `?url` would not — and hand back its URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CID } from 'multiformats/cid';
import { PMTiles, Protocol } from 'pmtiles';

import { NoProviderReachableError, createMapNode, dialFirstWorking } from './node.js';
import { regionById, regionFrom } from './regions.js';
import { ROUTERS, makeRouting } from './routing.js';
import { SOURCE_NAME, styleFor } from './style.js';
import { webglAvailable } from './support.js';
import { withTimeout } from './timeout.js';
import { makeTileSource } from './tileSource.js';

setWorkerUrl(maplibreWorkerUrl);

const statusBox = document.getElementById('map-status');
const statusText = document.getElementById('map-status-text');
const progressBar = document.getElementById('map-progress');
const badge = document.getElementById('region-badge');

function say(message, { error = false } = {}) {
  statusBox.classList.remove('is-hidden');
  statusBox.classList.toggle('is-error', error);
  statusText.textContent = message;
}

const hideStatus = () => statusBox.classList.add('is-hidden');

/// Peer-to-peer retrieval can stall with the connection still up: the peer
/// simply stops sending. Nothing below has a timeout of its own, and without
/// these the page sits on its last message forever — a hang, as far as the
/// user can tell.
/// Short, because it runs per candidate address: a transport that connects
/// but cannot deliver the header is dead and we want the next one quickly.
const PROBE_TIMEOUT_MS = 12_000;
const RENDER_TIMEOUT_MS = 45_000;

async function start() {
  const region = regionById(regionFrom(location.search));
  badge.textContent = region.name;

  if (!webglAvailable()) {
    say('This browser has no WebGL, so the map cannot be drawn.', { error: true });
    return;
  }

  // Merely READING window.localStorage throws in Chrome with site data
  // blocked, and in a sandboxed iframe — before any getItem call, so
  // routing.js's own guards would never run.
  let storage = null;
  try {
    storage = localStorage;
  } catch {
    console.warn('localStorage unavailable; provider addresses will not be remembered');
  }

  const routing = makeRouting({
    fetch: (...args) => fetch(...args),
    storage,
    routers: ROUTERS,
    log: (m) => console.log(m),
  });

  let helia;
  let worked;
  let archive;
  try {
    say('Looking for someone hosting this map…');
    helia = await createMapNode();

    archive = new PMTiles(
      makeTileSource({ fs: unixfs(helia), cid: CID.parse(region.cid), key: SOURCE_NAME }),
    );

    const connect = async (addrs) => {
      say(`Connecting (${addrs.length} host${addrs.length === 1 ? '' : 's'} found)…`);
      return dialFirstWorking(helia.libp2p, addrs, {
        onAttempt: (_addr, i, n) => say(`Connecting to host ${i + 1} of ${n}…`),
        // Reading the header is the liveness probe. A dial can succeed over
        // a transport that then carries nothing — Firefox does exactly this
        // with WebTransport against kubo — and without a probe the page
        // sits on a dead connection while working addresses go untried.
        verify: () => withTimeout(archive.getHeader(), PROBE_TIMEOUT_MS, 'reading the map archive'),
      });
    };

    const learned = await routing.addressesFor(region.cid);
    try {
      worked = await connect(learned);
    } catch (first) {
      // A remembered address goes stale on its own — libp2p caps
      // self-signed WebTransport certificates at 14 days, so kubo rotates
      // the certhash. Rediscover NOW rather than erroring and leaving the
      // user to work out that a reload fixes it.
      routing.forget(region.cid);
      const { addresses, providersSeen } = await routing.findProviders(region.cid);
      if (!addresses.length) throw new NoProviderReachableError([], providersSeen);
      if (addresses.join() === learned.join()) throw first;
      say('The remembered host did not answer — searching again…');
      worked = await connect(addresses);
    }
    routing.remember(region.cid, worked);
    // Which transport won matters when someone reports a hang: the
    // UDP-based ones are what a restrictive network blocks.
    console.log(`connected over ${worked.replace(/\/certhash\/[^/]+/g, '')}`);
  } catch (error) {
    routing.forget(region.cid);
    // Three distinct states, three remedies. "Nobody is hosting this" sends
    // you to the pinning node; "found hosts, none browser-reachable" is the
    // relay-only case in spec §4 and sends you to the node's connectivity;
    // "could not connect" is the network in between.
    let detail;
    if (error instanceof NoProviderReachableError && error.attempts.length === 0) {
      detail = error.providersSeen
        ? `Found ${error.providersSeen} host(s), but none reachable from a browser.`
        : 'No one is currently hosting this map.';
    } else {
      detail = `Found hosts, but could not connect. ${error.message}`;
    }
    say(detail, { error: true });
    return;
  }

  try {
    say('Downloading the map…');
    progressBar.removeAttribute('value');

    const protocol = new Protocol({ metadata: true });
    addProtocol('pmtiles', protocol.tile);
    // The header was already read and verified while connecting, so by here
    // the archive is known good over a connection known to carry data.
    protocol.add(archive);

    const map = new MapLibreMap({
      container: 'map',
      style: styleFor({ maxzoom: region.maxzoom }),
      center: region.center,
      zoom: 11,
      maxBounds: [
        [region.bbox[0], region.bbox[1]],
        [region.bbox[2], region.bbox[3]],
      ],
    });
    map.addControl(new NavigationControl());

    // MapLibre emits no event when tiles simply never arrive, so bound it
    // ourselves. Without this the page stays on "Downloading the map…"
    // indefinitely over a blank canvas, with nothing to act on.
    await withTimeout(
      new Promise((resolve, reject) => {
        map.on('load', resolve);
        map.on('error', (e) => reject(e.error ?? new Error('map failed to load')));
      }),
      RENDER_TIMEOUT_MS,
      'drawing the map',
    );
    hideStatus();
    map.on('error', (e) => say(`Map error: ${e.error?.message ?? 'unknown'}`, { error: true }));
  } catch (error) {
    // Stage 3: connected, but the data would not load. The learned address
    // may be stale or that host may no longer hold the archive — drop it so
    // the next load rediscovers instead of failing identically forever.
    routing.forget(region.cid);
    say(`Connected, but the map data would not load. ${error.message}`, { error: true });
  }
}

// Without this, anything thrown before the first try — or by a bug in the
// handlers — leaves the page sitting on its first message forever with the
// reason only in the console. Spec §8: never fail silently.
start().catch((error) => {
  say(`Could not start the map. ${error?.message ?? error}`, { error: true });
});
