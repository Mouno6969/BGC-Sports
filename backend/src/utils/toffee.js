// ---------------------------------------------------------------------------
// Toffee Stream Utility — Fetches Toffee live channel data and maps it into the
// BGC-Sports channel format.
//
// IMPORTANT: Toffee stream URLs require signed cookies + custom headers that the
// browser is NOT allowed to set (cookie, user-agent, host are on the fetch
// "forbidden header" list and get silently dropped). Toffee's CDN is also
// geo-restricted to Bangladesh. Because of this, the ONLY way these streams can
// play is through the server-side proxy in routes/toffeeProxy.js, which:
//   1. injects the required headers server-side, and
//   2. (optionally) routes traffic through a Bangladesh egress proxy.
//
// So the `url` we expose to the frontend points at our proxy, not directly at
// the Toffee CDN. The real upstream link is kept in `originalUrl`, and the
// per-host header sets are exported via getToffeeHeaders().
// ---------------------------------------------------------------------------

import fetch from 'node-fetch';

const TOFFEE_DATA_URL =
  'https://raw.githubusercontent.com/Gtajisan/Toffee-Auto-Update-Playlist/main/toffee_channel_data.json';

let cachedChannels = [];
let lastFetched = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Header lookup tables used by the proxy to authenticate upstream requests.
//   headersByExactUrl:  real upstream .m3u8 URL   -> headers
//   headersByHost:      upstream CDN hostname      -> headers (covers segments)
let headersByExactUrl = new Map();
let headersByHost = new Map();
let defaultHeaders = null;

/** Build the relative proxy path the frontend should actually load. */
function toProxyPath(originalUrl) {
  return `/api/toffee-proxy?url=${encodeURIComponent(originalUrl)}`;
}

/**
 * Fetches the latest Toffee channel data from the bypass repository and maps it
 * into the BGC-Sports channel format (with proxied playback URLs).
 */
export async function fetchToffeeChannels() {
  const now = Date.now();
  if (cachedChannels.length > 0 && now - lastFetched < CACHE_TTL) {
    return cachedChannels;
  }

  try {
    console.log('[toffee] Fetching latest channel data...');
    const res = await fetch(TOFFEE_DATA_URL);
    if (!res.ok) throw new Error(`Failed to fetch Toffee data: ${res.status}`);

    const data = await res.json();
    if (!data.channels || !Array.isArray(data.channels)) {
      throw new Error('Invalid Toffee data format');
    }

    const nextExact = new Map();
    const nextByHost = new Map();
    let nextDefault = null;

    const mapped = data.channels
      .filter((ch) => ch.link)
      .map((ch) => {
        // Normalize header keys; drop `host` (forbidden + set automatically).
        const headers = {};
        Object.entries(ch.headers || {}).forEach(([k, v]) => {
          if (k.toLowerCase() === 'host') return;
          headers[k] = v;
        });

        nextExact.set(ch.link, headers);
        try {
          const host = new URL(ch.link).host;
          if (!nextByHost.has(host)) nextByHost.set(host, headers);
        } catch {
          /* ignore malformed links */
        }
        if (!nextDefault) nextDefault = headers;

        return {
          name: `[Toffee] ${ch.name}`,
          logo: ch.logo,
          group: 'Toffee',
          type: 'hls',
          // Frontend plays through our proxy, never the CDN directly.
          url: toProxyPath(ch.link),
          originalUrl: ch.link,
        };
      });

    headersByExactUrl = nextExact;
    headersByHost = nextByHost;
    defaultHeaders = nextDefault;

    cachedChannels = mapped;
    lastFetched = now;
    console.log(`[toffee] Successfully mapped ${mapped.length} channels`);
    return mapped;
  } catch (err) {
    console.error('[toffee] Error fetching channels:', err.message);
    return cachedChannels; // Return stale cache on error
  }
}

/**
 * Returns the upstream headers required to authenticate a given Toffee URL.
 * Tries an exact match first (the master playlist), then falls back to matching
 * by hostname (covers variant playlists, segments, and key requests that live
 * on the same CDN), then to any known header set.
 */
export function getToffeeHeaders(targetUrl) {
  if (headersByExactUrl.has(targetUrl)) return headersByExactUrl.get(targetUrl);
  try {
    const host = new URL(targetUrl).host;
    if (headersByHost.has(host)) return headersByHost.get(host);
  } catch {
    /* ignore */
  }
  return defaultHeaders || {};
}

/** True once we have channel data (and therefore headers) cached. */
export function hasToffeeData() {
  return cachedChannels.length > 0;
}

/**
 * Returns a list of all channels including Toffee ones.
 */
export async function getAllChannels(baseChannels = []) {
  const toffee = await fetchToffeeChannels();
  return [...baseChannels, ...toffee];
}
