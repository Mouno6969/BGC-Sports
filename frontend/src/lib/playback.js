import { isToffeeStream } from './toffee.js';

const PROXY_HOST_PATTERNS = [
  'andro.226503.xyz',
  'online24.pm',
  '145.239.5.177',
  'bein-esp-xumo.amagi.tv',
  'bein-xtra-bein.amagi.tv',
  'ua102.online24.pm',
  'selamistrm',
  'fastly.net',
  'wurl.com',
  'wurl.tv',
  'playouts.now.amagi.tv',
  'playout.now3.amagi.tv',
  'lightning-tracesport',
  'worldoffreesportsintl-rakuten',
  'rakutenaa-mainstreammedia',
  'stream.ottplus.bd',
  'amagi.tv',
  '23.237.104.106',
  '177.234.249.178',
  'cloudfront.net',
  'streamvidex',
  'qzz.io',
  'otteravision.com',
  'live-tv.od.ua',
  'aynaott.com',
  'airspace-cdn.cbsivideo.com',
  // TSN / TUDN / WC rights feeds (iptv-org)
  '40.160.24.',
  'alwaysdata.net',
  'univisionnow.com',
  'univision.com',
  'jmp2.uk',
  'nbcuni.com',
  'streaming-live-fcdn',
  'otteravision.com',
  'ottera.tv',
  'live-tv.cloud',
  'live-tv.od.ua',
  'aynaott.com',
  'bozztv.com',
  'btvlive.gov.bd',
  'streams.btvlive.gov.bd',
  'gia.tv',
  'gpcdn.net',
];

/** Official web players (btvlive etc.) — play inside an iframe, not via HLS proxy. */
export function isEmbedPlaybackUrl(url = '', type = '') {
  if (String(type).toLowerCase() === 'embed') return true;
  const lower = String(url || '').toLowerCase();
  if (!lower) return false;
  // Channel page embeds (not raw m3u8)
  if (/btvlive\.gov\.bd\/channel\//i.test(lower)) return true;
  if (lower.includes('.m3u8') || lower.includes('playlist')) return false;
  return false;
}

export function needsServerProxy(url = '', source = '', type = '') {
  if (isEmbedPlaybackUrl(url, type)) return false;
  // World Cup / FIFA / iptv-org streams always play through the on-site HLS proxy.
  if (source === 'fifa' || source === 'iptv-org') return true;
  const lower = String(url).toLowerCase();
  if (lower.includes('/api/hls-proxy/')) return false;
  // Prefer proxy for any remote http(s) sports stream so CORS/referrer issues
  // don't break playback in the browser.
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return PROXY_HOST_PATTERNS.some((pattern) => lower.includes(pattern))
      || lower.includes('m3u8')
      || lower.includes('playlist');
  }
  return false;
}

export function buildProxiedPlaybackUrl(url) {
  return `/api/hls-proxy/manifest?url=${encodeURIComponent(url)}`;
}

export function resolvePlaybackUrl(url, source = '', type = '') {
  if (!url) return '';
  if (isEmbedPlaybackUrl(url, type)) return url;
  if (isToffeeStream(url, source)) return null;
  if (needsServerProxy(url, source, type)) return buildProxiedPlaybackUrl(url);
  return url;
}

export function isDirectPlayback(url, source = '', type = '') {
  return Boolean(resolvePlaybackUrl(url, source, type)) && !isToffeeStream(url, source);
}