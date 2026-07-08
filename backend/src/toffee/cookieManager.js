import { normalizeToffeeHeaders } from './headerNormalizer.js';

const sessions = new Map();

function sessionKey(url = '') {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('toffeelive.com')) return 'toffeelive';
    if (host.includes('sm-monirul.top')) return 'sm-monirul';
    return host || 'default';
  } catch {
    return 'default';
  }
}

export function getSessionHeaders(url, incoming = {}) {
  const key = sessionKey(url);
  const current = sessions.get(key) || {};
  const merged = normalizeToffeeHeaders({ ...current, ...incoming });
  sessions.set(key, merged);
  return merged;
}

export function updateSessionFromResponse(url, responseHeaders = {}) {
  const key = sessionKey(url);
  const current = sessions.get(key) || {};
  const setCookie = responseHeaders.get?.('set-cookie') || responseHeaders['set-cookie'];
  if (!setCookie) return current;

  const cookiePart = String(setCookie).split(';')[0];
  if (!cookiePart) return current;

  const merged = normalizeToffeeHeaders({
    ...current,
    Cookie: current.Cookie ? `${current.Cookie}; ${cookiePart}` : cookiePart,
  });
  sessions.set(key, merged);
  return merged;
}