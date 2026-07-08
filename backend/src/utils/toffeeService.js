import fetch from 'node-fetch';

// Ordered by freshness/reliability (first success wins).
const SOURCES = [
  {
    url: 'https://raw.githubusercontent.com/sm-monirulislam/Toffee-Auto-Update-Playlist/main/toffee_data.json',
    listKey: 'response',
  },
  {
    url: 'https://raw.githubusercontent.com/Gtajisan/Toffee-Auto-Update-Playlist/dev/toffee_data.json',
    listKey: 'channels',
  },
  {
    url: 'https://raw.githubusercontent.com/Gtajisan/Toffee-channel-bypass/main/toffee_channel_data.json',
    listKey: 'channels',
  },
];

let cache = {
  data: null,
  lastFetched: 0,
  ttl: 2 * 60 * 1000,
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

  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizeHeaderValue(value);
    if (!normalized) continue;
    const lower = key.toLowerCase();
    const headerName = mapping[lower] || key;
    out[headerName] = normalized;
  }

  if (!out.Referer) out.Referer = 'https://www.toffee.live/';
  if (!out['User-Agent']) {
    out['User-Agent'] = 'Mozilla/5.0 (Linux; Android 14; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  }

  return out;
}

function cookieExpired(cookie) {
  if (!cookie) return false;
  const match = String(cookie).match(/Expires=(\d+)/i);
  if (!match) return false;
  return Number(match[1]) * 1000 <= Date.now();
}

function mapChannel(ch, index, sourceUrl, updatedAt) {
  const headers = normalizeToffeeHeaders({
    ...(ch.headers || {}),
    ...(ch.cookie ? { cookie: ch.cookie } : {}),
  });
  const cookie = headers.Cookie;

  // Skip entries that clearly require an expired signed cookie.
  if (cookie && cookieExpired(cookie)) {
    return null;
  }

  const link = ch.link || ch.url;
  if (!link || !link.startsWith('http')) return null;

  return {
    id: `toffee-${index}`,
    name: ch.name || 'Unknown Channel',
    url: link,
    type: 'hls',
    logo: ch.logo || null,
    headers,
    group: 'Toffee',
    source: 'toffee',
    category: ch.category_name || ch.category || 'Toffee',
    updatedAt,
    dataSource: sourceUrl,
  };
}

async function fetchFromSource({ url, listKey }) {
  try {
    const res = await fetch(url, {
      timeout: 10_000,
      headers: { 'User-Agent': 'BGC-Sports-Toffee-Fetcher/1.0' },
    });
    if (!res.ok) {
      console.warn(`[toffee] Source ${url} returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const rawChannels = data[listKey] || data.channels || data.response;
    if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
      console.warn(`[toffee] Source ${url} has invalid format`);
      return null;
    }

    const now = Date.now();
    const channels = rawChannels
      .map((ch, index) => mapChannel(ch, index, url, now))
      .filter(Boolean);

    if (channels.length === 0) {
      console.warn(`[toffee] Source ${url} produced zero usable channels`);
      return null;
    }

    return channels;
  } catch (err) {
    console.warn(`[toffee] Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

function channelKey(url = '') {
  return String(url).split('?')[0].toLowerCase();
}

function slugFromUrl(url = '') {
  return channelKey(url).split('/').pop()?.replace('.m3u8', '') || '';
}

/** Pull client-api-header from secondary JSON even when its cookies are expired. */
async function fetchClientApiHeaderMap() {
  const headerSources = SOURCES.filter((s) => s.url.includes('Gtajisan'));
  const byUrl = new Map();
  const bySlug = new Map();

  for (const source of headerSources) {
    try {
      const res = await fetch(source.url, {
        timeout: 10_000,
        headers: { 'User-Agent': 'BGC-Sports-Toffee-Fetcher/1.0' },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const rawChannels = data[source.listKey] || data.channels || data.response;
      if (!Array.isArray(rawChannels)) continue;

      for (const ch of rawChannels) {
        const link = ch.link || ch.url;
        if (!link) continue;
        const headers = normalizeToffeeHeaders(ch.headers || {});
        const apiHeader = headers['client-api-header'];
        if (!apiHeader) continue;

        byUrl.set(channelKey(link), apiHeader);
        const slug = slugFromUrl(link);
        if (slug) bySlug.set(slug, apiHeader);
      }

      if (byUrl.size > 0) {
        console.log(`[toffee] Loaded ${byUrl.size} client-api-header values from ${source.url}`);
        break;
      }
    } catch (err) {
      console.warn(`[toffee] Header enrichment failed for ${source.url}: ${err.message}`);
    }
  }

  return { byUrl, bySlug };
}

function enrichWithClientApiHeaders(channels = [], { byUrl, bySlug }) {
  if (!channels.length || (!byUrl.size && !bySlug.size)) return channels;

  return channels.map((ch) => {
    const key = channelKey(ch.url);
    const slug = slugFromUrl(ch.url);
    const apiHeader = byUrl.get(key) || (slug ? bySlug.get(slug) : null);
    if (!apiHeader) return ch;

    const headers = normalizeToffeeHeaders(ch.headers || {});
    if (!headers['client-api-header']) {
      headers['client-api-header'] = apiHeader;
    }

    return { ...ch, headers };
  });
}

export async function fetchToffeeChannels() {
  const now = Date.now();
  if (cache.data && now - cache.lastFetched < cache.ttl) {
    return cache.data;
  }

  console.log('[toffee] Refreshing channel data...');

  const fetched = [];
  for (const source of SOURCES) {
    const channels = await fetchFromSource(source);
    if (channels?.length) fetched.push({ source: source.url, channels });
  }

  if (fetched.length === 0) {
    console.error('[toffee] All data sources failed');
    return cache.data || [];
  }

  let channels = fetched[0].channels;
  const headerMap = await fetchClientApiHeaderMap();
  channels = enrichWithClientApiHeaders(channels, headerMap);

  cache.data = channels;
  cache.lastFetched = now;
  console.log(`[toffee] Loaded ${channels.length} channels from ${fetched[0].source}`);
  return channels;
}

export function getToffeeChannels() {
  return cache.data || [];
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
      'User-Agent': normalized['User-Agent'],
      Referer: normalized.Referer || 'https://www.toffee.live/',
    };

    if (targetUrl.includes('hdntl=')) return out;

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

  const target = url.split('?')[0].toLowerCase();
  const targetHost = hostnameFromUrl(url);

  let found = channels.find((ch) => ch.url && ch.url.split('?')[0].toLowerCase() === target);
  if (found) return found;

  if (targetHost) {
    found = channels.find((ch) => {
      const chHost = hostnameFromUrl(ch.url) || (ch.headers?.Host || '').toLowerCase();
      return chHost === targetHost;
    });
    if (found) return found;
  }

  const slug = target.split('/').pop()?.replace('.m3u8', '');
  if (slug) {
    found = channels.find((ch) => ch.url && ch.url.toLowerCase().includes(slug));
  }

  return found || null;
}

export async function refreshToffeeChannels() {
  cache.lastFetched = 0;
  return fetchToffeeChannels();
}

export function isToffeeStreamUrl(url = '') {
  const lower = String(url).toLowerCase();
  return (
    lower.includes('toffeelive.com') ||
    lower.includes('cdn-tt.pages.dev') ||
    lower.includes('toffee')
  );
}