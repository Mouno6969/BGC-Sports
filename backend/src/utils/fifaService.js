import fetch from 'node-fetch';

const FIFA_LOGO = 'https://i.ibb.co.com/vnbkF0r/fifa-world-cup-2026-logo-png-seeklogo-665644.png';
const BEIN_LOGO = 'https://imglink.cc/cdn/kIiut6WBq0.jpg';
const TYC_LOGO = 'https://imglink.cc/cdn/1oSRQnyUqK.jpg';

const FIFA_CHANNELS = [
  {
    id: 'fifa-bein1',
    name: 'BeIN Sports 1',
    url: 'https://andro.226503.xyz/checklist/androstreamlivebs1.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein', 'world-cup'],
    priority: 1,
  },
  {
    id: 'fifa-bein2',
    name: 'BeIN Sports 2',
    url: 'https://andro.226503.xyz/checklist/androstreamlivebs2.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein', 'world-cup'],
    priority: 2,
  },
  {
    id: 'fifa-bein3',
    name: 'BeIN Sports 3',
    url: 'https://andro.226503.xyz/checklist/androstreamlivebs3.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein', 'world-cup'],
    priority: 3,
  },
  {
    id: 'fifa-bein4',
    name: 'BeIN Sports 4',
    url: 'https://andro.226503.xyz/checklist/androstreamlivebs4.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein', 'world-cup'],
    priority: 4,
  },
  {
    id: 'fifa-bein-fr',
    name: 'BeIN Sports France',
    url: 'http://145.239.5.177:80/559/index.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein', 'france'],
    priority: 5,
  },
  {
    id: 'fifa-bein-xumo-1080',
    name: 'BeIN Sports HD',
    url: 'https://bein-esp-xumo.amagi.tv/playlistR1080p.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein'],
    priority: 6,
  },
  {
    id: 'fifa-bein-xumo-720',
    name: 'BeIN Sports Xtra',
    url: 'https://bein-esp-xumo.amagi.tv/playlistR720P.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein'],
    priority: 7,
  },
  {
    id: 'fifa-bein-rs1',
    name: 'BeIN Sports 1 (Alt)',
    url: 'http://ua.online24.pm/play/1101/350B326FB34F4B8/video.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein'],
    priority: 8,
  },
  {
    id: 'fifa-bein-rs2',
    name: 'BeIN Sports 2 (Alt)',
    url: 'http://ua.online24.pm/play/1102/350B326FB34F4B8/video.m3u8',
    logo: BEIN_LOGO,
    provider: 'bein',
    group: 'FIFA Live',
    tags: ['fifa', 'bein'],
    priority: 9,
  },
  {
    id: 'fifa-plus-english',
    name: 'FIFA+ English',
    url: 'https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8',
    logo: FIFA_LOGO,
    provider: 'fifa',
    group: 'FIFA Live',
    tags: ['fifa', 'official', 'english'],
    priority: 10,
  },
  {
    id: 'fifa-tyc-sports',
    name: 'TYC Sports',
    url: 'https://amg26268-amg26268c14-freelivesports-emea-10267.playouts.now.amagi.tv/ts-us-e2-n2/playlist/amg26268-sportsstudio-tycsports-freelivesportsemea/playlist.m3u8',
    logo: TYC_LOGO,
    provider: 'international',
    group: 'FIFA Live',
    tags: ['fifa', 'argentina', 'spanish'],
    priority: 20,
  },
  {
    id: 'fifa-euro-sports',
    name: 'Euro Sports HD',
    url: 'https://stream.ottplus.bd/live/euro_sports_hd_abr/live/euro_sports_hd/chunks.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    group: 'FIFA Live',
    tags: ['fifa', 'bangladesh', 'sports'],
    priority: 21,
  },
  {
    id: 'fifa-free-sports',
    name: 'World of Free Sports',
    url: 'https://mainstreammedia-worldoffreesportsintl-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-mainstreammediafreesportsintl-rakuten/CDN/master.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    group: 'FIFA Live',
    tags: ['fifa', 'sports', 'international'],
    priority: 22,
  },
  {
    id: 'fifa-trace-sport',
    name: 'Trace Sport',
    url: 'https://lightning-tracesport-samsungau.amagi.tv/playlist.m3u8',
    logo: FIFA_LOGO,
    provider: 'international',
    group: 'FIFA Live',
    tags: ['fifa', 'sports'],
    priority: 23,
  },
];

const PROVIDER_LABELS = {
  bein: 'BeIN Sports',
  fifa: 'FIFA+ Official',
  international: 'International',
};

let cache = { channels: null, checkedAt: 0, ttl: 5 * 60 * 1000 };

export function getFifaChannelCatalog() {
  return FIFA_CHANNELS.map((ch) => ({
    ...ch,
    source: 'fifa',
    type: 'hls',
    proxied: true,
    providerLabel: PROVIDER_LABELS[ch.provider] || 'FIFA Live',
    logo: ch.logo || FIFA_LOGO,
  }));
}

const PROBE_BASE = process.env.FIFA_PROBE_BASE || 'http://127.0.0.1:4000';

async function fetchProbeManifest(manifestUrl, depth = 0) {
  if (depth > 5) return null;
  const res = await fetch(manifestUrl, { timeout: 10_000 });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.includes('#EXTM3U')) return null;

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const variantIdx = lines.findIndex((line) => line.startsWith('#EXT-X-STREAM-INF'));
  if (variantIdx >= 0) {
    const child = lines[variantIdx + 1];
    if (!child) return null;
    const childUrl = child.startsWith('/')
      ? `${PROBE_BASE}${child}`
      : child.startsWith('http') ? child : null;
    if (!childUrl) return null;
    return fetchProbeManifest(childUrl, depth + 1);
  }

  return text;
}

async function probeSegment(segmentUrl) {
  const res = await fetch(segmentUrl, { timeout: 10_000 });
  if (!res.ok) return false;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 50_000) return false;
  return buffer[0] === 0x47 || res.headers.get('content-type')?.includes('mp2t');
}

async function probeChannel(channel) {
  try {
    const proxyEntry = `${PROBE_BASE}/api/hls-proxy/manifest?url=${encodeURIComponent(channel.url)}`;
    const mediaManifest = await fetchProbeManifest(proxyEntry);
    if (!mediaManifest) return false;

    const segLine = mediaManifest
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .pop();
    if (!segLine) return false;

    const segUrl = segLine.startsWith('/')
      ? `${PROBE_BASE}${segLine}`
      : segLine.startsWith('http') ? segLine : null;
    if (!segUrl) return false;

    return probeSegment(segUrl);
  } catch {
    return false;
  }
}

export function buildUpstreamHeaders(targetUrl = '') {
  let host = '';
  try {
    host = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      Accept: '*/*',
    };
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  if (host.includes('andro.226503.xyz') || host.includes('fastly.net') || host.includes('messiburada')) {
    headers.Referer = 'https://andro.226503.xyz/';
    headers.Origin = 'https://andro.226503.xyz';
  } else if (host.includes('online24.pm')) {
    headers.Referer = `http://${host}/`;
  } else if (host.includes('amagi.tv') || host.includes('xumo')) {
    headers.Referer = host.includes('rakuten')
      ? 'https://www.rakuten.tv/'
      : host.includes('xumo') || host.includes('bein-esp')
        ? 'https://www.xumo.com/'
        : 'https://www.samsung.com/';
  } else if (host.includes('145.239.5.177')) {
    headers.Referer = 'http://145.239.5.177/';
  } else if (host.includes('wurl.com') || host.includes('wurl.tv')) {
    headers.Referer = 'https://www.rakuten.tv/';
  } else if (host.includes('ottplus.bd')) {
    headers.Referer = 'https://ottplus.bd/';
  } else if (host.includes('cloudfront.net')) {
    headers.Referer = 'https://www.lgchannels.com/';
  }

  return headers;
}

export async function fetchLiveFifaChannels({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && cache.channels && now - cache.checkedAt < cache.ttl) {
    return cache.channels;
  }

  const catalog = getFifaChannelCatalog();
  const checks = await Promise.all(
    catalog.map(async (channel) => ({
      channel,
      live: await probeChannel(channel),
    }))
  );

  const liveChannels = checks
    .filter((entry) => entry.live)
    .map((entry) => ({ ...entry.channel, status: 'live' }))
    .sort((a, b) => a.priority - b.priority);

  cache = { channels: liveChannels, checkedAt: now, ttl: cache.ttl };
  return liveChannels;
}

export function getFifaChannelsByProvider(channels = []) {
  const groups = new Map();
  for (const channel of channels) {
    const key = channel.provider || 'other';
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: channel.providerLabel || PROVIDER_LABELS[key] || 'FIFA Live',
        channels: [],
      });
    }
    groups.get(key).channels.push(channel);
  }
  return Array.from(groups.values());
}

export function isProxiedPlaybackUrl(url = '') {
  const lower = String(url).toLowerCase();
  return (
    lower.includes('andro.226503.xyz')
    || lower.includes('online24.pm')
    || lower.includes('145.239.5.177')
    || lower.includes('bein-esp-xumo.amagi.tv')
    || lower.includes('ua102.online24.pm')
    || lower.includes('selamistrm')
    || lower.includes('fastly.net/androstream')
    || lower.includes('wurl.com')
    || lower.includes('wurl.tv')
    || lower.includes('playouts.now.amagi.tv')
    || lower.includes('lightning-tracesport')
    || lower.includes('worldoffreesportsintl-rakuten')
    || lower.includes('rakutenaa-mainstreammedia')
    || lower.includes('stream.ottplus.bd')
    || lower.includes('amagi.tv')
  );
}