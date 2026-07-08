/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'toffee-auth-v2';
const SESSION_CACHE = 'toffee-session-v2';
const CDN_API_PATH = '/api/toffee-cdn';
const PROXY_MANIFEST_PATH = '/api/toffee-proxy/manifest';
const PROXY_SEGMENT_PATH = '/api/toffee-proxy/segment';
const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

let activeHeaders = {
  Cookie: '',
  'User-Agent': DEFAULT_UA,
  Referer: 'https://www.toffee.live/',
  'client-api-header': '',
};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('auth.json');
        if (cached) activeHeaders = { ...activeHeaders, ...(await cached.json()) };
      } catch {
        // ignore
      }
      await self.clients.claim();
    })()
  );
});

function normalizeHeaders(raw = {}) {
  const out = {};
  const map = {
    cookie: 'Cookie',
    host: 'Host',
    'user-agent': 'User-Agent',
    'client-api-header': 'client-api-header',
    referer: 'Referer',
  };

  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'null') continue;
    out[map[key.toLowerCase()] || key] = text;
  }

  if (!out.Referer) out.Referer = 'https://www.toffee.live/';
  if (!out['User-Agent']) out['User-Agent'] = DEFAULT_UA;
  return out;
}

async function persistHeaders(headers) {
  activeHeaders = { ...activeHeaders, ...normalizeHeaders(headers) };
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put('auth.json', new Response(JSON.stringify(activeHeaders)));
  } catch {
    // ignore
  }
}

async function loadSessionHeaders(sessionId) {
  if (!sessionId) return {};

  try {
    const cache = await caches.open(SESSION_CACHE);
    const cached = await cache.match(sessionId);
    if (cached) return normalizeHeaders(await cached.json());
  } catch {
    // ignore
  }

  try {
    const response = await fetch(`/api/toffee/session/${encodeURIComponent(sessionId)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return {};
    const data = await response.json();
    const headers = normalizeHeaders(data.headers || {});
    try {
      const cache = await caches.open(SESSION_CACHE);
      await cache.put(sessionId, new Response(JSON.stringify(headers)));
    } catch {
      // ignore
    }
    return headers;
  } catch {
    return {};
  }
}

self.addEventListener('message', (event) => {
  const { type, headers } = event.data || {};
  if (type === 'SET_TOFFEE_HEADERS' && headers) persistHeaders(headers);
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'PING') {
    event.source?.postMessage?.({ type: 'PONG', controlling: true });
  }
});

function buildAuthHeaders(url, override = {}) {
  const merged = { ...activeHeaders, ...normalizeHeaders(override) };
  const headers = {
    'User-Agent': merged['User-Agent'] || DEFAULT_UA,
    Referer: merged.Referer || 'https://www.toffee.live/',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
  };

  if (/toffeelive\.com/i.test(url) && !url.includes('hdntl=')) {
    if (merged.Cookie) headers.Cookie = merged.Cookie;
    const apiHeader = merged['client-api-header'];
    if (apiHeader && apiHeader !== 'null') headers['client-api-header'] = apiHeader;
  }

  return headers;
}

function corsResponse(body, contentType, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
      'X-Toffee-Proxy': 'service-worker',
    },
  });
}

function proxyApiUrl(absoluteUrl, sessionId = '') {
  const parts = [`${CDN_API_PATH}?url=${encodeURIComponent(absoluteUrl)}`];
  if (sessionId) parts.push(`sid=${encodeURIComponent(sessionId)}`);
  return parts.join('&');
}

function proxyManifestUrl(absoluteUrl, sessionId = '') {
  const parts = [`${PROXY_MANIFEST_PATH}?url=${encodeURIComponent(absoluteUrl)}`];
  if (sessionId) parts.push(`sid=${encodeURIComponent(sessionId)}`);
  return parts.join('&');
}

function shouldRewriteToClientProxy(url) {
  return /toffeelive\.com/i.test(url);
}

function rewriteManifest(manifest, baseUrl, sessionId = '', mode = 'cdn') {
  const isTag = (line) => line.startsWith('#');
  const isUrl = (line) => {
    if (!line || isTag(line)) return false;
    return line.startsWith('http') || line.includes('.m3u8') || line.includes('.ts');
  };

  return manifest
    .split('\n')
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return '';

      if (isTag(line)) {
        if (line.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
            let absoluteUrl = uri;
            if (!uri.startsWith('http')) absoluteUrl = new URL(uri, baseUrl).href;
            const proxied = shouldRewriteToClientProxy(absoluteUrl)
              ? proxyApiUrl(absoluteUrl, sessionId)
              : (absoluteUrl.includes('.m3u8') || absoluteUrl.includes('playlist')
                ? proxyManifestUrl(absoluteUrl, sessionId)
                : `${PROXY_SEGMENT_PATH}?url=${encodeURIComponent(absoluteUrl)}&sid=${encodeURIComponent(sessionId)}`);
            return `URI="${proxied}"`;
          });
        }
        return rawLine;
      }

      if (!isUrl(line)) return '';

      let absoluteUrl = line;
      try {
        if (!line.startsWith('http')) absoluteUrl = new URL(line, baseUrl).href;
      } catch {
        return '';
      }

      if (shouldRewriteToClientProxy(absoluteUrl)) {
        return proxyApiUrl(absoluteUrl, sessionId);
      }

      const isManifest = absoluteUrl.includes('.m3u8') || absoluteUrl.includes('playlist');
      if (mode === 'relay') {
        return isManifest
          ? proxyManifestUrl(absoluteUrl, sessionId)
          : `${PROXY_SEGMENT_PATH}?url=${encodeURIComponent(absoluteUrl)}&sid=${encodeURIComponent(sessionId)}`;
      }

      return proxyApiUrl(absoluteUrl, sessionId);
    })
    .filter((line, index, arr) => line !== '' || (index > 0 && arr[index - 1] !== ''))
    .join('\n');
}

async function fetchUpstream(targetUrl, overrideHeaders = {}, sessionId = '', rewriteMode = 'cdn') {
  const upstream = await fetch(targetUrl, {
    method: 'GET',
    headers: buildAuthHeaders(targetUrl, overrideHeaders),
    redirect: 'follow',
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return corsResponse(`Upstream ${upstream.status}`, 'text/plain', upstream.status);
  }

  const isManifest = targetUrl.includes('.m3u8') || targetUrl.includes('playlist');
  const isSegment = /\.ts(?:\?|$)/i.test(targetUrl);
  const contentType = upstream.headers.get('content-type')
    || (isManifest ? 'application/vnd.apple.mpegurl' : isSegment ? 'video/mp2t' : 'application/octet-stream');

  let body = await upstream.arrayBuffer();
  if (isManifest) {
    const text = new TextDecoder().decode(body);
    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
    body = new TextEncoder().encode(rewriteManifest(text, baseUrl, sessionId, rewriteMode));
  }

  return corsResponse(body, contentType);
}

async function handleCdnApi(requestUrl) {
  const reqUrl = new URL(requestUrl);
  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl) return corsResponse('Missing url', 'text/plain', 400);

  const sessionId = reqUrl.searchParams.get('sid') || '';
  const sessionHeaders = await loadSessionHeaders(sessionId);
  await persistHeaders(sessionHeaders);

  try {
    return await fetchUpstream(targetUrl, sessionHeaders, sessionId, 'cdn');
  } catch (err) {
    return corsResponse(`Toffee fetch failed: ${err.message}`, 'text/plain', 502);
  }
}

async function handleProxyManifest(requestUrl) {
  const reqUrl = new URL(requestUrl);
  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl) return corsResponse('Missing url', 'text/plain', 400);

  const sessionId = reqUrl.searchParams.get('sid') || '';
  const sessionHeaders = await loadSessionHeaders(sessionId);
  await persistHeaders(sessionHeaders);

  try {
    return await fetchUpstream(targetUrl, sessionHeaders, sessionId, 'relay');
  } catch (err) {
    return corsResponse(`Relay fetch failed: ${err.message}`, 'text/plain', 502);
  }
}

async function handleProxySegment(requestUrl) {
  const reqUrl = new URL(requestUrl);
  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl) return corsResponse('Missing url', 'text/plain', 400);

  const sessionId = reqUrl.searchParams.get('sid') || '';
  const sessionHeaders = await loadSessionHeaders(sessionId);

  try {
    return await fetchUpstream(targetUrl, sessionHeaders, sessionId, 'relay');
  } catch (err) {
    return corsResponse(`Segment fetch failed: ${err.message}`, 'text/plain', 502);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  try {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname === CDN_API_PATH) {
      event.respondWith(handleCdnApi(request.url));
      return;
    }
    if (reqUrl.pathname === PROXY_MANIFEST_PATH) {
      event.respondWith(handleProxyManifest(request.url));
      return;
    }
    if (reqUrl.pathname === PROXY_SEGMENT_PATH) {
      event.respondWith(handleProxySegment(request.url));
    }
  } catch {
    // ignore invalid URLs
  }
});