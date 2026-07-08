import { isToffeeStream } from './toffee.js';

const PROXY_HOST_PATTERNS = [
  'andro.226503.xyz',
  'online24.pm',
  '145.239.5.177',
  'bein-esp-xumo.amagi.tv',
  'ua102.online24.pm',
  'selamistrm',
  'fastly.net/androstream',
  'wurl.com',
  'wurl.tv',
  'playouts.now.amagi.tv',
  'lightning-tracesport',
  'worldoffreesportsintl-rakuten',
  'rakutenaa-mainstreammedia',
  'stream.ottplus.bd',
  'amagi.tv',
];

export function needsServerProxy(url = '', source = '') {
  if (source === 'fifa') return true;
  const lower = String(url).toLowerCase();
  return PROXY_HOST_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function buildProxiedPlaybackUrl(url) {
  return `/api/hls-proxy/manifest?url=${encodeURIComponent(url)}`;
}

export function resolvePlaybackUrl(url, source = '') {
  if (!url) return '';
  if (isToffeeStream(url, source)) return null;
  if (needsServerProxy(url, source)) return buildProxiedPlaybackUrl(url);
  return url;
}

export function isDirectPlayback(url, source = '') {
  return Boolean(resolvePlaybackUrl(url, source)) && !isToffeeStream(url, source);
}