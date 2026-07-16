import { toffeeConfig } from './config.js';

const HEADER_MAP = {
  host: 'Host',
  cookie: 'Cookie',
  'user-agent': 'User-Agent',
  'client-api-header': 'client-api-header',
  'accept-encoding': 'Accept-Encoding',
  referer: 'Referer',
};

function cleanValue(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return null;
  return text;
}

export function normalizeToffeeHeaders(raw = {}) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const cleaned = cleanValue(value);
    if (!cleaned) continue;
    const headerName = HEADER_MAP[key.toLowerCase()] || key;
    out[headerName] = cleaned;
  }
  return out;
}

export function buildBrowserHeaders(targetUrl, sessionHeaders = {}) {
  const normalized = normalizeToffeeHeaders(sessionHeaders);
  let host = '';
  try {
    host = new URL(targetUrl).hostname;
  } catch {
    host = '';
  }

  const headers = {
    'User-Agent':
      normalized['User-Agent']
      || toffeeConfig.defaultUserAgent
      || 'Toffee (Linux;Android 14) AndroidXMedia3/1.1.1/64103898/4d2ec9b8c7534adc',
    Referer: normalized.Referer || toffeeConfig.defaultReferer,
    Accept: '*/*',
    'Accept-Language': toffeeConfig.acceptLanguage,
    // identity — free proxies often break gzip
    'Accept-Encoding': 'identity',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  if (host.includes('toffeelive.com')) {
    if (normalized.Cookie) headers.Cookie = normalized.Cookie;
    if (normalized['client-api-header']) {
      headers['client-api-header'] = normalized['client-api-header'];
    }
    // Host header is set automatically by node-fetch from URL; only force when needed
    if (normalized.Host) headers.Host = normalized.Host;
  } else if (host.includes('sm-monirul.top') || host.includes('pages.dev')) {
    if (normalized.Host) headers.Host = normalized.Host;
  }

  return headers;
}