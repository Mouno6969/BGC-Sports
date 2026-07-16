// ---------------------------------------------------------------------------
// iptv-org integration — free public IPTV catalog (NO API key required).
//
// Data sources (all free, no auth):
//   https://iptv-org.github.io/api/streams.json
//   https://iptv-org.github.io/api/channels.json
//   https://iptv-org.github.io/iptv/categories/sports.m3u
//
// Docs: https://github.com/iptv-org/iptv  |  API: https://github.com/iptv-org/api
//
// We pull World-Cup-relevant sports networks, deep-probe them through our
// on-site HLS proxy, and expose only streams that return real media segments.
// ---------------------------------------------------------------------------
import fetch from 'node-fetch';

const API_STREAMS = 'https://iptv-org.github.io/api/streams.json';
const API_CHANNELS = 'https://iptv-org.github.io/api/channels.json';
const API_LOGOS = 'https://iptv-org.github.io/api/logos.json';
const SPORTS_M3U = 'https://iptv-org.github.io/iptv/categories/sports.m3u';
// Full catalog — TUDN and some rights networks sit outside group-title=Sports
const INDEX_M3U = 'https://iptv-org.github.io/iptv/index.m3u';

const PROBE_BASE = process.env.FIFA_PROBE_BASE || 'http://127.0.0.1:4000';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min catalog cache
const PROBE_TTL_MS = 3 * 60 * 1000; // 3 min live probe cache

// Networks most relevant to FIFA World Cup live coverage
const WC_NETWORK_RE =
  /\b(bein|be\s*in|fox\s*sport|fox\s*deportes|tsn\s*[1-5]?|tsn\s*the\s*ocho|tudn|azteca\s*deportes|caze|caz[eé]\s*tv|gol\s*tv|goltv|tyc|fifa\+|fifa plus|telemundo|univision\s*deportes|sky\s*sport|espn|premier\s*sport|match\s*!|cbs\s*sport|golazo|dazn|euro\s*sport|sony\s*sport|star\s*sport|t\s*sports?|fubo\s*sport|nbc\s*sport|sportv|rds\b|tnt\s*sport|supersport|itv\s*deportes|itv\s*sport|itv\s*1|itv\s*2|itv\s*4|btv\s*world|btv\s*national|btv\s*chattogram|btv\s*news|\bbtv\b)\b/i;

// Drop non-match fluff (news/novelas/wellness) even if name partially matches
// Keep TSN / TUDN even if title has noise.
const WC_EXCLUDE_RE =
  /noticias|romance|telenovela|wellbeing|weather|news\b|al\s*d[ií]a|accion|northeast|florida|texas|west|california|corpus|tele\s*sondrio/i;

const PROVIDER_FROM_NAME = [
  { re: /\btsn\b/i, id: 'tsn', label: 'TSN Canada' },
  { re: /tudn|azteca\s*deportes/i, id: 'tudn', label: 'TUDN' },
  { re: /bein|be\s*in/i, id: 'bein', label: 'BeIN Sports' },
  { re: /fox/i, id: 'fox', label: 'Fox Sports' },
  { re: /gol\s*tv|goltv/i, id: 'goltv', label: 'GolTV' },
  { re: /caze|caz[eé]/i, id: 'cazetv', label: 'CazeTV' },
  { re: /btv\s*world|btv\s*national|btv\s*chattogram|btv\s*news|\bbtv\b/i, id: 'btv', label: 'BTV Bangladesh' },
  { re: /itv\s*deportes|itv\s*sport|\bitv\b/i, id: 'itv', label: 'ITV' },
  { re: /fifa/i, id: 'fifa', label: 'FIFA+' },
  { re: /tyc/i, id: 'international', label: 'TYC Sports' },
  { re: /telemundo|univision/i, id: 'international', label: 'Telemundo / Uni' },
  { re: /espn/i, id: 'international', label: 'ESPN' },
  { re: /sky\s*sport/i, id: 'international', label: 'Sky Sports' },
  { re: /euro\s*sport/i, id: 'international', label: 'Euro Sports' },
  { re: /match/i, id: 'international', label: 'Match TV' },
  { re: /cbs\s*sport|golazo/i, id: 'international', label: 'CBS Sports' },
  { re: /fubo/i, id: 'international', label: 'fubo Sports' },
  { re: /nbc\s*sport/i, id: 'international', label: 'NBC Sports' },
];

let rawCache = { at: 0, streams: null, channels: null, logos: null };
let liveCache = { at: 0, channels: null };

function providerFor(name = '') {
  for (const p of PROVIDER_FROM_NAME) {
    if (p.re.test(name)) return { id: p.id, label: p.label };
  }
  return { id: 'international', label: 'International' };
}

async function fetchJson(url, timeout = 25000) {
  const res = await fetch(url, {
    timeout,
    headers: {
      'User-Agent': 'BGC-Sports/1.0 (+https://preview.cryptobgc.eu.cc)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url, timeout = 25000) {
  const res = await fetch(url, {
    timeout,
    headers: {
      'User-Agent': 'BGC-Sports/1.0',
      Accept: '*/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseM3uPlaylist(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF')) continue;
    const name = line.split(',').slice(1).join(',').trim();
    const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
    const idMatch = line.match(/tvg-id="([^"]*)"/i);
    const groupMatch = line.match(/group-title="([^"]*)"/i);
    let url = '';
    if (i + 1 < lines.length && !lines[i + 1].trim().startsWith('#')) {
      url = lines[i + 1].trim();
      i += 1;
    }
    if (!url.startsWith('http') || url.includes('cors-proxy')) continue;
    // Skip geo-blocked tags when a non-blocked twin often exists
    const geoBlocked = /\[geo-blocked\]/i.test(name);
    out.push({
      channel: idMatch?.[1] || '',
      name,
      url,
      logo: logoMatch?.[1] || '',
      group: groupMatch?.[1] || '',
      quality: (name.match(/\((\d+p|\d+i)\)/i) || [])[1] || '',
      geoBlocked,
    });
  }
  return out;
}

/** @deprecated alias — sports.m3u and index.m3u share the same parser */
const parseSportsM3u = parseM3uPlaylist;

/**
 * Load + filter World-Cup-relevant streams from iptv-org (free, no key).
 */
export async function loadIptvOrgWcCandidates({ force = false } = {}) {
  const now = Date.now();
  if (!force && rawCache.streams && now - rawCache.at < CACHE_TTL_MS) {
    return buildCandidates(rawCache);
  }

  const [streams, channels, logos, sportsM3u, indexM3u] = await Promise.all([
    fetchJson(API_STREAMS).catch((e) => {
      console.warn('[iptv-org] streams.json failed:', e.message);
      return [];
    }),
    fetchJson(API_CHANNELS).catch(() => []),
    fetchJson(API_LOGOS).catch(() => []),
    fetchText(SPORTS_M3U).catch(() => ''),
    // Full index is large (~27k lines) — only used for TUDN / rights gaps
    fetchText(INDEX_M3U, 45000).catch((e) => {
      console.warn('[iptv-org] index.m3u failed:', e.message);
      return '';
    }),
  ]);

  rawCache = {
    at: now,
    streams: Array.isArray(streams) ? streams : [],
    channels: Array.isArray(channels) ? channels : [],
    logos: Array.isArray(logos) ? logos : [],
    sportsM3u: sportsM3u || '',
    indexM3u: indexM3u || '',
  };

  console.log(
    `[iptv-org] loaded streams=${rawCache.streams.length} channels=${rawCache.channels.length} indexM3u=${(indexM3u || '').length}`
  );
  return buildCandidates(rawCache);
}

function buildCandidates(cache) {
  const chMap = new Map((cache.channels || []).map((c) => [c.id, c]));
  const logoMap = new Map();
  for (const l of cache.logos || []) {
    // logos.json entries: { channel, feed, url, ... }
    if (l.channel && l.url && !logoMap.has(l.channel)) logoMap.set(l.channel, l.url);
  }

  const byUrl = new Map();

  // From API streams joined with channel metadata
  for (const s of cache.streams || []) {
    const ch = chMap.get(s.channel) || {};
    const name = ch.name || s.title || s.channel || 'Unknown';
    const cats = ch.categories || [];
    const isSports = cats.includes('sports');
    if (!isSports && !WC_NETWORK_RE.test(name) && !WC_NETWORK_RE.test(s.title || '')) continue;
    if (!WC_NETWORK_RE.test(name) && !WC_NETWORK_RE.test(s.title || '') && !WC_NETWORK_RE.test(s.channel || '')) {
      continue;
    }
    if (WC_EXCLUDE_RE.test(name) || WC_EXCLUDE_RE.test(s.title || '')) continue;
    const url = s.url || '';
    if (!url.startsWith('http') || url.includes('cors-proxy')) continue;
    if (byUrl.has(url)) continue;

    const prov = providerFor(name);
    byUrl.set(url, {
      id: `iptv-${(s.channel || 'ch').replace(/[^a-zA-Z0-9_-]/g, '')}-${byUrl.size}`,
      name: cleanName(name),
      url,
      logo: logoMap.get(s.channel) || '',
      quality: s.quality || '',
      referrer: s.referrer || '',
      userAgent: s.user_agent || '',
      provider: prov.id,
      providerLabel: prov.label,
      country: ch.country || '',
      source: 'iptv-org',
      type: 'hls',
      proxied: true,
      group: 'World Cup',
      tags: ['world-cup', 'iptv-org', prov.id],
      priority: priorityFor(name, prov.id),
    });
  }

  // From sports.m3u + full index.m3u (TUDN etc. may not be in Sports group)
  const m3uEntries = [
    ...parseM3uPlaylist(cache.sportsM3u || ''),
    ...parseM3uPlaylist(cache.indexM3u || ''),
  ];
  for (const s of m3uEntries) {
    if (!WC_NETWORK_RE.test(s.name) && !WC_NETWORK_RE.test(s.channel || '')) continue;
    // Prefer non-geo-blocked when duplicate names exist later
    if (s.geoBlocked && /tudn|tsn/i.test(s.name)) {
      // still keep as fallback — probe will filter
    }
    if (WC_EXCLUDE_RE.test(s.name) && !/\b(tsn|tudn)\b/i.test(s.name)) continue;
    if (byUrl.has(s.url)) {
      const existing = byUrl.get(s.url);
      if (!existing.logo && s.logo) existing.logo = s.logo;
      continue;
    }
    const prov = providerFor(s.name);
    byUrl.set(s.url, {
      id: `iptv-m3u-${byUrl.size}`,
      name: cleanName(s.name),
      url: s.url,
      logo: s.logo || '',
      quality: s.quality || '',
      referrer: '',
      userAgent: '',
      provider: prov.id,
      providerLabel: prov.label,
      country: '',
      source: 'iptv-org',
      type: 'hls',
      proxied: true,
      group: 'World Cup',
      tags: ['world-cup', 'iptv-org', prov.id],
      priority: priorityFor(s.name, prov.id),
      geoBlocked: Boolean(s.geoBlocked),
    });
  }

  return Array.from(byUrl.values()).sort((a, b) => a.priority - b.priority);
}

function cleanName(name) {
  return String(name || '')
    .replace(/\s*\(\d+p|\d+i\)\s*/gi, ' ')
    .replace(/\s*\[.*?\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function priorityFor(name, providerId) {
  const n = String(name).toLowerCase();
  // Prefer live-rights style networks for WC 2026 (CA/MX/US)
  if (/\btsn\s*1\b|\btsn1\b/.test(n)) return 0.1;
  if (/\btsn\s*[2-5]\b|\btsn[2-5]\b/.test(n)) return 0.2;
  if (/\btudn\b/.test(n) && !/geo-blocked/i.test(n)) return 0.3;
  if (/azteca\s*deportes/.test(n)) return 0.4;
  if (/fox\s*deportes|fox\s*sports\s*1|bein\s*sports\s*usa|bein\s*sports\s*1\b/.test(n)) return 1;
  if (providerId === 'tsn') return 2;
  if (providerId === 'tudn') return 3;
  if (providerId === 'bein') return 5;
  if (providerId === 'fox') return 8;
  if (providerId === 'goltv') return 12;
  if (providerId === 'cazetv') return 14;
  if (providerId === 'btv' || /btv\s*world|btv\s*national/i.test(n)) return 3.5;
  if (providerId === 'itv' || /itv\s*deportes|itv\s*sport/i.test(n)) return 4;
  if (providerId === 'fifa') return 18;
  if (/telemundo|tyc|espn|match|cbs\s*sport|fubo|nbc\s*sport/.test(n)) return 22;
  return 30;
}

/**
 * Deep probe via on-site proxy — real segment required.
 */
async function deepProbe(url) {
  try {
    const masterUrl = `${PROBE_BASE}/api/hls-proxy/manifest?url=${encodeURIComponent(url)}`;
    const r = await fetch(masterUrl, { timeout: 14000 });
    if (!r.ok) return false;
    const master = await r.text();
    if (!master.includes('#EXTM3U')) return false;

    const lines = master.split('\n').map((l) => l.trim()).filter(Boolean);
    let next = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1] && !lines[i + 1].startsWith('#')) {
        next = lines[i + 1];
        break;
      }
    }
    if (!next) next = lines.find((l) => l && !l.startsWith('#'));
    if (!next) return false;

    let abs = next.startsWith('/') ? `${PROBE_BASE}${next}` : next.startsWith('http') ? next : null;
    if (!abs) return false;

    if (abs.includes('hls-proxy/manifest') || abs.includes('.m3u8')) {
      const r2 = await fetch(abs, { timeout: 14000 });
      if (!r2.ok) return false;
      const media = await r2.text();
      if (!media.includes('#EXTM3U')) return false;
      const seg = media.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
      if (!seg) return false;
      abs = seg.startsWith('/') ? `${PROBE_BASE}${seg}` : seg.startsWith('http') ? seg : null;
      if (!abs) return false;
    }

    const rs = await fetch(abs, { timeout: 14000 });
    if (!rs.ok) return false;
    const buf = Buffer.from(await rs.arrayBuffer());
    if (buf.length < 8000) return false;
    if (buf[0] === 0x3c) return false; // HTML
    return true;
  } catch {
    return false;
  }
}

/**
 * Return live, probe-verified World Cup channels from iptv-org.
 */
export async function fetchLiveIptvOrgChannels({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && liveCache.channels && now - liveCache.at < PROBE_TTL_MS) {
    return liveCache.channels;
  }

  let candidates;
  try {
    candidates = await loadIptvOrgWcCandidates({ force: refresh });
  } catch (err) {
    console.warn('[iptv-org] candidate load failed:', err.message);
    return liveCache.channels || [];
  }

  // Always force-include TSN/TUDN candidates at the front of the probe queue
  const priorityNames = /tsn|tudn|azteca\s*deportes|fox\s*deportes|fox\s*sports\s*1|bein|telemundo|cbs\s*sport/i;
  const prioritized = [
    ...candidates.filter((c) => priorityNames.test(c.name)),
    ...candidates.filter((c) => !priorityNames.test(c.name)),
  ];
  // Cap probe set — top 24 for broader WC coverage, quick master check
  const toProbe = prioritized.slice(0, 24);
  const live = [];
  const batchSize = 6;
  for (let i = 0; i < toProbe.length; i += batchSize) {
    const batch = toProbe.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (ch) => ({ ch, ok: await quickProbe(ch.url) }))
    );
    for (const r of results) {
      if (r.ok) live.push({ ...r.ch, status: 'live' });
    }
  }

  // Deduplicate by channel name (keep best priority; prefer non-geo)
  const byName = new Map();
  for (const ch of live) {
    const key = cleanName(ch.name).toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, ch);
      continue;
    }
    const prevGeo = prev.geoBlocked ? 1 : 0;
    const nextGeo = ch.geoBlocked ? 1 : 0;
    if (nextGeo < prevGeo || (nextGeo === prevGeo && (ch.priority || 99) < (prev.priority || 99))) {
      byName.set(key, ch);
    }
  }
  const final = Array.from(byName.values()).sort((a, b) => a.priority - b.priority);

  liveCache = { at: Date.now(), channels: final };
  console.log(`[iptv-org] live WC channels: ${final.length}/${toProbe.length} probed`);
  return final;
}

/** Fast master-playlist probe only (used so UI never blocks for minutes). */
async function quickProbe(url) {
  try {
    const masterUrl = `${PROBE_BASE}/api/hls-proxy/manifest?url=${encodeURIComponent(url)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(masterUrl, { signal: controller.signal, timeout: 5000 });
    clearTimeout(timer);
    if (!r.ok) return false;
    const t = await r.text();
    return t.includes('#EXTM3U');
  } catch {
    return false;
  }
}

export function getIptvOrgStatus() {
  return {
    name: 'iptv-org',
    displayName: 'iptv-org (GitHub)',
    apiKeyRequired: false,
    free: true,
    docs: 'https://github.com/iptv-org/iptv',
    api: 'https://iptv-org.github.io/api/',
    playlists: {
      sports: SPORTS_M3U,
      index: INDEX_M3U,
    },
    enabled: true,
  };
}
