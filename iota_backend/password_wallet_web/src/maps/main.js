import { unixfs } from '@helia/unixfs';
// maplibre-gl 6 has no default export; `Map` is aliased so it does not
// shadow the global Map.
import { Map as MapLibreMap, NavigationControl, addProtocol } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CID } from 'multiformats/cid';
import { PMTiles, Protocol } from 'pmtiles';

import { NoProviderReachableError, createMapNode, dialFirstWorking } from './node.js';
import { regionById, regionFrom } from './regions.js';
import { ROUTERS, makeRouting } from './routing.js';
import { SOURCE_NAME, styleFor } from './style.js';
import { webglAvailable } from './support.js';
import { makeTileSource } from './tileSource.js';

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

  const routing = makeRouting({
    fetch: (...args) => fetch(...args),
    storage: localStorage,
    routers: ROUTERS,
    log: (m) => console.log(m),
  });

  let helia;
  let worked;
  try {
    say('Szukam, kto udostępnia tę mapę…');
    const addrs = await routing.addressesFor(region.cid);

    helia = await createMapNode();
    say(`Łączę się (${addrs.length} ${addrs.length === 1 ? 'host' : 'hostów'})…`);
    worked = await dialFirstWorking(helia.libp2p, addrs, {
      onAttempt: (_addr, i, n) => say(`Łączę się z hostem ${i + 1} z ${n}…`),
    });
    routing.remember(region.cid, worked);
  } catch (error) {
    // Stage 1 and 2 are different problems. "Nobody is hosting this" is not
    // the same as "hosts exist but none would talk to us", and conflating
    // them hides which one to go and fix.
    const detail =
      error instanceof NoProviderReachableError && error.attempts.length === 0
        ? 'Nikt obecnie nie udostępnia tej mapy.'
        : `Znaleziono hosty, ale nie udało się połączyć. ${error.message}`;
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

start();
