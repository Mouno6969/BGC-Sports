// ---------------------------------------------------------------------------
// Toffee channel scraper — multi-source merge + live probe.
//
// Sources (community auto-updaters, free, no API key):
//   - sm-monirulislam/Toffee-Auto-Update-Playlist (freshest cookies)
//   - Gtajisan/* (client-api-header + extra channels)
//   - BINOD-XD/Toffee-Auto-Update-Playlist
//   - SM-Live-TV Toffee.m3u
//
// Why merge: one source often has fresh Edge-Cache-Cookie, another has a valid
// client-api-header. Alone neither is enough for reliable playback.
// ---------------------------------------------------------------------------
import fetch from 'node-fetch';
import {
  ensureToffeeProxies,
  getProxyPoolStatus,
  nextWorkingProxy,
} from '../toffee/proxyPool.js';

const SOURCES = [
  {
    id: 'sm-monirul-json',
    url: 'https://raw.githubusercontent.com/sm-monirulislam/Toffee-Auto-Update-Playlist/main/toffee_data.json',
    listKey: 'response',
  },
  {
    id: 'sm-monirul-jsdelivr',
    url: 'https://cdn.jsdelivr.net/gh/sm-monirulislam/Toffee-Auto-Update-Playlist@main/toffee_data.json',
    listKey: 'response',
  },
  {
    id: 'gtajisan-dev',
    url: 'https://raw.githubusercontent.com/Gtajisan/Toffee-Auto-Update-Playlist/dev/toffee_data.json',
    listKey: 'channels',
  },
  {
    id: 'gtajisan-bypass',
    url: 'https://raw.githubusercontent.com/Gtajisan/Toffee-channel-bypass/main/toffee_channel_data.json',
    listKey: 'channels',
  },
  {
    id: 'binod-xd',
    url: 'https://raw.githubusercontent.com/BINOD-XD/Toffee-Auto-Update-Playlist/main/toffee_channel_data.json',
    listKey: 'channels',
  },
];

const M3U_SOURCES = [
  'https://raw.githubusercontent.com/sm-monirulislam/SM-Live-TV/main/Toffee.m3u',
  'https://raw.githubusercontent.com/sm-monirulislam/Toffee-Auto-Update-Playlist/main/toffee_playlist.m3u',
];

let cache = {
  data: null,
  lastFetched: 0,
  ttl: 90 * 1000, // 90s — cookies refresh often
  status: null,
};

function normalizeHeaderValue(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') {
    return null;
  }
  return text;
}

/** Normalize mixed-case header objects from community playlists. */
export function normalizeToffeeHeaders(raw = {}) {
  const out = {};
  const mapping = {
    host: 'Host',
    cookie: 'Cookie',
    'user-agent': 'User-Agent',
    'client-api-header': 'client-api-header',
    'accept-encoding': 'Accept-Encoding',
    referer: 'Referer',
  };

  for (const [key, value] of Object.entries(raw || {})) {
    const normalized = normalizeHeaderValue(value);
    if (!normalized) continue;
    const lower = key.toLowerCase();
    const headerName = mapping[lower] || key;
    out[headerName] = normalized;
  }

  if (!out.Referer) out.Referer = 'https://www.toffee.live/';
  if (!out['User-Agent']) {
    out['User-Agent'] =
      'Toffee (Linux;Android 14) AndroidXMedia3/1.1.1/64103898/4d2ec9b8c7534adc';
  }

  return out;
}

function cookieExpiry(cookie = '') {
  const match = String(cookie).match(/Expires=(\d+)/i);
  if (!match) return 0;
  return Number(match[1]) * 1000;
}

function cookieExpired(cookie) {
  const exp = cookieExpiry(cookie);
  if (!exp) return false;
  // 60s grace
  return exp <= Date.now() + 60_000;
}

function channelKey(url = '') {
  return String(url).split('?')[0].toLowerCase().replace(/\/+$/, '');
}

function slugFromUrl(url = '') {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // .../cdn/live/<slug>/playlist.m3u8  or  /live/<slug>/...
    const liveIdx = parts.findIndex((p) => p === 'live' || p === 'cdn');
    if (liveIdx >= 0 && parts[liveIdx + 1]) {
      if (parts[liveIdx] === 'cdn' && parts[liveIdx + 1] === 'live' && parts[liveIdx + 2]) {
        return parts[liveIdx + 2].toLowerCase();
      }
      return parts[liveIdx + 1].toLowerCase();
    }
    return parts[parts.length - 2] || parts[parts.length - 1] || '';
  } catch {
    return String(url).split('/').pop()?.replace(/\.m3u8.*/, '') || '';
  }
}

function nameKey(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(hd|sd|vip|tv|channel)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreChannel(ch) {
  let score = 0;
  const cookie = ch.headers?.Cookie || '';
  const api = ch.headers?.['client-api-header'] || '';
  if (cookie && !cookieExpired(cookie)) score += 50;
  else if (cookie) score += 5;
  if (api.length > 40) score += 40;
  if (ch.url?.includes('edge-cache-token')) score += 30;
  if (/sport|sony|ten |euro|cricket|fifa|football|toffee sports/i.test(ch.name || '')) score += 10;
  return score;
}

function mergeHeaders(a = {}, b = {}) {
  const A = normalizeToffeeHeaders(a);
  const B = normalizeToffeeHeaders(b);
  const out = { ...A };

  // Prefer non-expired cookie with latest expiry
  const cA = A.Cookie || '';
  const cB = B.Cookie || '';
  if (cB) {
    if (!cA || cookieExpired(cA) || cookieExpiry(cB) > cookieExpiry(cA)) {
      if (!cookieExpired(cB) || cookieExpired(cA)) out.Cookie = cB;
    }
  }

  // Prefer longer client-api-header
  const apiA = A['client-api-header'] || '';
  const apiB = B['client-api-header'] || '';
  if (apiB.length > apiA.length) out['client-api-header'] = apiB;

  // Prefer Toffee-app UA when present
  if (B['User-Agent'] && /toffee|okhttp/i.test(B['User-Agent'])) {
    out['User-Agent'] = B['User-Agent'];
  } else if (!out['User-Agent'] && B['User-Agent']) {
    out['User-Agent'] = B['User-Agent'];
  }

  if (B.Host) out.Host = B.Host;
  if (B.Referer) out.Referer = B.Referer;
  return normalizeToffeeHeaders(out);
}

function parseM3u(text = '', sourceUrl = '') {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let name = '';
  let logo = '';
  let headers = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      name = line.split(',').slice(1).join(',').trim();
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      logo = logoMatch?.[1] || '';
      headers = {};
    } else if (line.startsWith('#EXTVLCOPT:http-user-agent=')) {
      headers['user-agent'] = line.replace('#EXTVLCOPT:http-user-agent=', '').trim();
    } else if (line.startsWith('#EXTHTTP:')) {
      try {
        const json = JSON.parse(line.slice('#EXTHTTP:'.length));
        headers = { ...headers, ...json };
      } catch {
        /* ignore */
      }
    } else if (line.startsWith('http')) {
      out.push({
        name: name || 'Toffee Channel',
        link: line,
        logo,
        headers: normalizeToffeeHeaders(headers),
        source: sourceUrl,
      });
      name = '';
      logo = '';
      headers = {};
    }
  }
  return out;
}

async function fetchJsonSource({ url, listKey, id }) {
  try {
    const res = await fetch(url, {
      timeout: 12_000,
      headers: { 'User-Agent': 'BGC-Sports-Toffee-Fetcher/2.0', Accept: 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[toffee] ${id} HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const raw =
      data?.[listKey]
      || data?.channels
      || data?.response
      || (Array.isArray(data) ? data : null);
    if (!Array.isArray(raw)) {
      console.warn(`[toffee] ${id} invalid format`);
      return [];
    }
    return raw
      .map((ch) => {
        const link = ch.link || ch.url;
        if (!link || !String(link).startsWith('http')) return null;
        return {
          name: ch.name || 'Unknown',
          link,
          logo: ch.logo || null,
          category: ch.category_name || ch.category || 'Toffee',
          headers: normalizeToffeeHeaders({
            ...(ch.headers || {}),
            ...(ch.cookie ? { cookie: ch.cookie } : {}),
          }),
          source: url,
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.warn(`[toffee] ${id} failed: ${err.message}`);
    return [];
  }
}

async function fetchM3uSource(url) {
  try {
    const res = await fetch(url, {
      timeout: 12_000,
      headers: { 'User-Agent': 'BGC-Sports-Toffee-Fetcher/2.0' },
    });
    if (!res.ok) return [];
    const text = await res.text();
    return parseM3u(text, url);
  } catch (err) {
    console.warn(`[toffee] m3u ${url} failed: ${err.message}`);
    return [];
  }
}

/**
 * Merge all sources into unique channels with best headers per stream.
 */
export async function scrapeToffeeCatalog() {
  const results = await Promise.all([
    ...SOURCES.map((s) => fetchJsonSource(s)),
    ...M3U_SOURCES.map((u) => fetchM3uSource(u)),
  ]);

  const byKey = new Map(); // channelKey -> channel
  let rawCount = 0;

  for (const list of results) {
    for (const ch of list) {
      rawCount += 1;
      const key = channelKey(ch.link);
      const slug = slugFromUrl(ch.link);
      const nk = nameKey(ch.name);
      const mapped = {
        id: `toffee-${slug || byKey.size}`,
        name: ch.name,
        url: ch.link,
        type: 'hls',
        logo: ch.logo || null,
        headers: normalizeToffeeHeaders(ch.headers || {}),
        group: 'Toffee',
        source: 'toffee',
        category: ch.category || 'Toffee',
        dataSource: ch.source,
        slug,
        nameKey: nk,
        updatedAt: Date.now(),
      };

      // Also index by slug/name for header enrichment across different URL hosts
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, mapped);
      } else {
        byKey.set(key, {
          ...existing,
          headers: mergeHeaders(existing.headers, mapped.headers),
          logo: existing.logo || mapped.logo,
          // Prefer fresher non-expired cookie URL
          url:
            cookieExpired(existing.headers?.Cookie) && !cookieExpired(mapped.headers?.Cookie)
              ? mapped.url
              : existing.url,
          dataSource: `${existing.dataSource}|${mapped.dataSource}`,
        });
      }
    }
  }

  // Cross-enrich by slug / name (cookie from A + api-header from B)
  const list = Array.from(byKey.values());
  const bySlug = new Map();
  const byName = new Map();
  for (const ch of list) {
    if (ch.slug) {
      const prev = bySlug.get(ch.slug);
      if (!prev || scoreChannel(ch) > scoreChannel(prev)) bySlug.set(ch.slug, ch);
    }
    if (ch.nameKey) {
      const prev = byName.get(ch.nameKey);
      if (!prev || scoreChannel(ch) > scoreChannel(prev)) byName.set(ch.nameKey, ch);
    }
  }

  // Best long API header globally as last resort
  let globalApi = '';
  for (const ch of list) {
    const api = ch.headers?.['client-api-header'] || '';
    if (api.length > globalApi.length) globalApi = api;
  }

  // Best fresh cookie globally for same CDN host family
  let globalCookie = '';
  let globalCookieExp = 0;
  let globalUa = '';
  for (const ch of list) {
    const c = ch.headers?.Cookie || '';
    const exp = cookieExpiry(c);
    if (c && !cookieExpired(c) && exp >= globalCookieExp) {
      globalCookie = c;
      globalCookieExp = exp;
      globalUa = ch.headers?.['User-Agent'] || globalUa;
    }
  }

  const enriched = list.map((ch) => {
    let headers = { ...ch.headers };
    const slugPeer = ch.slug ? bySlug.get(ch.slug) : null;
    const namePeer = ch.nameKey ? byName.get(ch.nameKey) : null;
    if (slugPeer) headers = mergeHeaders(headers, slugPeer.headers);
    if (namePeer) headers = mergeHeaders(headers, namePeer.headers);

    if (!headers['client-api-header'] && globalApi) {
      headers['client-api-header'] = globalApi;
    }
    if ((!headers.Cookie || cookieExpired(headers.Cookie)) && globalCookie) {
      // Only inject global cookie if same CDN host family
      if (/toffeelive\.com/i.test(ch.url)) {
        headers.Cookie = globalCookie;
        if (globalUa) headers['User-Agent'] = globalUa;
      }
    }

    headers = normalizeToffeeHeaders(headers);

    // Drop clearly unusable (no token, no cookie, no api) linear streams
    const hasToken = /edge-cache-token|hdntl=/i.test(ch.url);
    const hasAuth = Boolean(headers.Cookie && !cookieExpired(headers.Cookie));
    const hasApi = Boolean(headers['client-api-header']);
    if (!hasToken && !hasAuth && !hasApi) return null;

    return {
      ...ch,
      headers,
      auth: {
        hasToken,
        hasCookie: hasAuth,
        hasApi,
        cookieExpiresAt: cookieExpiry(headers.Cookie) || null,
      },
    };
  }).filter(Boolean);

  // Prefer sports / higher score first
  enriched.sort((a, b) => scoreChannel(b) - scoreChannel(a) || a.name.localeCompare(b.name));

  console.log(
    `[toffee] scraped raw=${rawCount} unique=${enriched.length} globalApi=${globalApi.length} cookieFresh=${Boolean(globalCookie)}`
  );

  return enriched;
}

/**
 * Quick master-playlist probe (uses proxy pool when needed).
 */
async function probeChannelLive(channel) {
  try {
    const { fetchToffeeResource } = await import('../toffee/toffeeClient.js');
    const result = await fetchToffeeResource({
      url: channel.url,
      headers: channel.headers || {},
      expect: 'manifest',
    });
    return Boolean(result?.body && String(result.body).includes('#EXTM3U'));
  } catch {
    return false;
  }
}

async function warmProxyPool(channels = []) {
  const sample =
    channels.find((c) => /euro_sports|sony_sports|toffeelive\.com/i.test(c.url))
    || channels[0];
  if (!sample) return;
  await ensureToffeeProxies({
    testUrl: sample.url,
    headers: sample.headers || {},
    force: false,
  });
}

export async function fetchToffeeChannels({ probe = false } = {}) {
  const now = Date.now();
  if (cache.data && now - cache.lastFetched < cache.ttl) {
    return cache.data;
  }

  console.log('[toffee] Refreshing channel data (multi-source scrape)…');
  let channels = await scrapeToffeeCatalog();

  // Warm BD proxy pool in background (do not block catalog response)
  warmProxyPool(channels).catch((err) => {
    console.warn('[toffee] proxy warm failed:', err.message);
  });

  // Optional: light probe top sports (keeps cache fast by default)
  if (probe && channels.length) {
    const sports = channels.filter((c) =>
      /sport|sony|ten |euro|cricket|fifa|football/i.test(c.name)
    );
    const toCheck = (sports.length ? sports : channels).slice(0, 12);
    const live = [];
    for (const ch of toCheck) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await probeChannelLive(ch);
      if (ok) live.push({ ...ch, status: 'live' });
    }
    if (live.length) {
      // keep live sports first, then rest unprobed
      const liveUrls = new Set(live.map((c) => c.url));
      channels = [...live, ...channels.filter((c) => !liveUrls.has(c.url))];
    }
  }

  cache.data = channels;
  cache.lastFetched = now;
  cache.status = {
    count: channels.length,
    proxy: getProxyPoolStatus(),
    scrapedAt: new Date().toISOString(),
  };
  console.log(`[toffee] Loaded ${channels.length} channels`);
  return channels;
}

export function getToffeeChannels() {
  return cache.data || [];
}

export function getToffeeScrapeStatus() {
  return cache.status || { count: (cache.data || []).length };
}

function hostnameFromUrl(url = '') {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function getToffeeHeadersForUrl(targetUrl = '', fallbackHeaders = {}) {
  const normalized = normalizeToffeeHeaders(fallbackHeaders);
  const host = hostnameFromUrl(targetUrl);

  if (!host) return normalized;

  if (host.includes('pages.dev') || host.includes('sm-monirul.top')) {
    return {
      ...normalized,
      Host: host,
      Referer: normalized.Referer || 'https://www.toffee.live/',
    };
  }

  if (host.includes('toffeelive.com')) {
    const out = {
      'User-Agent':
        normalized['User-Agent']
        || 'Toffee (Linux;Android 14) AndroidXMedia3/1.1.1/64103898/4d2ec9b8c7534adc',
      Referer: normalized.Referer || 'https://www.toffee.live/',
      Accept: '*/*',
      'Accept-Encoding': 'identity',
    };

    // Tokenized Akamai-style URLs often work without cookie
    if (targetUrl.includes('hdntl=') || targetUrl.includes('edge-cache-token=')) {
      if (normalized.Cookie) out.Cookie = normalized.Cookie;
      if (normalized['client-api-header']) out['client-api-header'] = normalized['client-api-header'];
      return out;
    }

    if (normalized.Cookie) out.Cookie = normalized.Cookie;
    if (normalized['client-api-header'] && normalized['client-api-header'] !== 'null') {
      out['client-api-header'] = normalized['client-api-header'];
    }
    out.Host = normalized.Host || host;
    return out;
  }

  return normalized;
}

export async function getToffeeChannelByUrl(url) {
  const channels = await fetchToffeeChannels();
  if (!url) return null;

  const target = channelKey(url);
  const targetHost = hostnameFromUrl(url);
  const slug = slugFromUrl(url);

  let found = channels.find((ch) => channelKey(ch.url) === target);
  if (found) return found;

  if (slug) {
    found = channels.find((ch) => ch.slug === slug || channelKey(ch.url).includes(slug));
    if (found) return found;
  }

  if (targetHost) {
    found = channels.find((ch) => {
      const chHost = hostnameFromUrl(ch.url) || (ch.headers?.Host || '').toLowerCase();
      return chHost === targetHost;
    });
  }

  return found || null;
}

export async function refreshToffeeChannels() {
  cache.lastFetched = 0;
  return fetchToffeeChannels({ probe: false });
}

export function isToffeeStreamUrl(url = '') {
  const lower = String(url).toLowerCase();
  return (
    lower.includes('toffeelive.com')
    || lower.includes('cdn-tt.pages.dev')
    || lower.includes('sm-monirul.top')
    || lower.includes('toffee')
  );
}

/** Expose for diagnostics */
export function getToffeeProxyHint() {
  return nextWorkingProxy();
}
