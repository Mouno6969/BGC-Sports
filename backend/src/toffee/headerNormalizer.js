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
    'User-Agent': normalized['User-Agent'] || toffeeConfig.defaultUserAgent,
    Referer: normalized.Referer || toffeeConfig.defaultReferer,
    Accept: '*/*',
    'Accept-Language': toffeeConfig.acceptLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-CH-UA': toffeeConfig.clientHintUa,
    'Sec-CH-UA-Mobile': '?1',
    'Sec-CH-UA-Platform': '"Android"',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Dest': 'empty',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  if (host.includes('toffeelive.com') && !targetUrl.includes('hdntl=')) {
    if (normalized.Cookie) headers.Cookie = normalized.Cookie;
    if (normalized['client-api-header']) headers['client-api-header'] = normalized['client-api-header'];
    headers.Host = normalized.Host || host;
  } else if (host.includes('sm-monirul.top') || host.includes('pages.dev')) {
    headers.Host = normalized.Host || host;
  }

  return headers;
}