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

async function start() {
  const region = regionById(regionFrom(location.search));
  badge.textContent = region.name;

  if (!webglAvailable()) {
    say('Ta przeglądarka nie obsługuje WebGL, więc mapy nie da się narysować.', { error: true });
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
  try {
    say('Szukam, kto udostępnia tę mapę…');
    helia = await createMapNode();

    const connect = async (addrs) => {
      say(`Łączę się (${addrs.length} ${addrs.length === 1 ? 'host' : 'hostów'})…`);
      return dialFirstWorking(helia.libp2p, addrs, {
        onAttempt: (_addr, i, n) => say(`Łączę się z hostem ${i + 1} z ${n}…`),
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
      say('Zapisany host nie odpowiada — szukam ponownie…');
      worked = await connect(addresses);
    }
    routing.remember(region.cid, worked);
  } catch (error) {
    routing.forget(region.cid);
    // Three distinct states, three remedies. "Nobody is hosting this" sends
    // you to the pinning node; "found hosts, none browser-reachable" is the
    // relay-only case in spec §4 and sends you to the node's connectivity;
    // "could not connect" is the network in between.
    let detail;
    if (error instanceof NoProviderReachableError && error.attempts.length === 0) {
      detail = error.providersSeen
        ? `Znaleziono ${error.providersSeen} host(ów), ale żaden nie jest osiągalny z przeglądarki.`
        : 'Nikt obecnie nie udostępnia tej mapy.';
    } else {
      detail = `Znaleziono hosty, ale nie udało się połączyć. ${error.message}`;
    }
    say(detail, { error: true });
    return;
  }

  try {
    say('Pobieram mapę…');
    progressBar.removeAttribute('value');

    const protocol = new Protocol({ metadata: true });
    addProtocol('pmtiles', protocol.tile);
    const source = makeTileSource({
      fs: unixfs(helia),
      cid: CID.parse(region.cid),
      key: SOURCE_NAME,
    });
    const archive = new PMTiles(source);
    // Parse the header now, so a bad archive surfaces here rather than as
    // an inscrutable decoder error on the first tile.
    await archive.getHeader();
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
    map.on('load', hideStatus);
    map.on('error', (e) => say(`Błąd mapy: ${e.error?.message ?? 'nieznany'}`, { error: true }));
  } catch (error) {
    // Stage 3: connected, but the data would not load. The learned address
    // may be stale or that host may no longer hold the archive — drop it so
    // the next load rediscovers instead of failing identically forever.
    routing.forget(region.cid);
    say(`Połączono, ale nie udało się wczytać mapy: ${error.message}`, { error: true });
  }
}

// Without this, anything thrown before the first try — or by a bug in the
// handlers — leaves the page sitting on "Szukam mapy…" forever with the
// reason only in the console. Spec §8: never fail silently.
start().catch((error) => {
  say(`Nie udało się uruchomić mapy: ${error?.message ?? error}`, { error: true });
});
