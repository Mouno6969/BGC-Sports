// ---------------------------------------------------------------------------
// HLS Proxy — fetch upstream HLS manifests/segments server-side and rewrite
// URLs so the browser only talks to this origin (no external redirects).
// Tuned for Hyderabad/India egress (TLS quirks, disguised .jpg TS segments).
// ---------------------------------------------------------------------------
import { Router } from 'express';
import fetch from 'node-fetch';
import https from 'https';
import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { rewriteManifest } from '../toffee/manifestRewrite.js';
import { buildUpstreamHeaders, isProxiedPlaybackUrl } from '../utils/fifaService.js';
import {
  getCachedAesKey,
  ensureAesKey,
  setCachedAesKey,
  decryptHlsSegment,
  parseKeyIvFromPlaylist,
  stripExtXKey,
} from '../utils/aesKeyService.js';

const execFileAsync = promisify(execFile);
const router = Router();

// Some CDNs (Fastly edge hostnames) serve valid video over certs that don't
// match the hostname. Allow insecure TLS so India/HYD egress can still fetch.
const insecureHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  family: 4, // BD CDNs often break on IPv6
});
const httpAgent = new http.Agent({ keepAlive: true, family: 4 });

/** Hosts where node-fetch hangs/fails but curl --http1.1 works (BD OTT edges). */
function needsCurlFallback(url = '') {
  return /aynaott\.com|bozztv\.com|btvlive\.gov\.bd|streams\.btvlive|gia\.tv|ottplus\.bd|gpcdn\.net/i.test(url);
}

function proxyPath(kind, url) {
  return `/api/hls-proxy/${kind}?url=${encodeURIComponent(url)}`;
}

/** AES-128 / SAMPLE-AES key endpoints (must NOT be treated as m3u8). */
function isAesKeyUrl(url = '') {
  const lower = String(url).toLowerCase();
  return (
    /userkey\.php/i.test(lower)
    || /\/aes\//i.test(lower)
    || /\/keys?\//i.test(lower)
    || /\.key(\?|$)/i.test(lower)
    || /keyformat=/i.test(lower)
    || /getkey|license|drm/i.test(lower)
  );
}

function isManifest(url = '') {
  const lower = String(url).toLowerCase();
  // AES key URIs are binary — never treat as playlists (breaks bozztv/rongo EXT-X-KEY).
  if (isAesKeyUrl(lower)) return false;
  // Disguised TS segments (.jpg/.png used by some gateways) are NOT manifests.
  if (/\.(ts|m4s|mp4|aac|vtt|jpg|jpeg|png|bin)(\?|$)/i.test(lower) && !lower.includes('.m3u8')) {
    return false;
  }
  // PHP / CGI gateways (e.g. TUDN alwaysdata) often serve master playlists
  // but exclude key endpoints already handled above.
  if (/\.php(\?|$)/i.test(lower)) return true;
  return (
    lower.includes('.m3u8')
    || lower.includes('playlist')
    || /\/manifest\//i.test(lower)
    || /\/index\//i.test(lower)
    || /\/hls\//i.test(lower)
    || /\.isml?\//i.test(lower)
  );
}

function segmentContentType(url = '', upstreamType = '', buffer = Buffer.alloc(0)) {
  const lower = String(url).toLowerCase();
  if (lower.includes('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (lower.includes('.vtt')) return 'text/vtt';
  if (lower.includes('.aac')) return 'audio/aac';
  // MPEG-TS sync byte 0x47 — many providers mask TS as .jpg
  if (buffer.length > 0 && buffer[0] === 0x47) return 'video/mp2t';
  if (/\.(ts|m2ts|mp2t|jpg|jpeg|png|bin)(\?|$)/i.test(lower)) return 'video/mp2t';
  if (upstreamType && !upstreamType.includes('text/html') && !upstreamType.includes('xml')) {
    return upstreamType;
  }
  return 'application/octet-stream';
}

function pickAgent(url) {
  try {
    return new URL(url).protocol === 'http:' ? httpAgent : insecureHttpsAgent;
  } catch {
    return insecureHttpsAgent;
  }
}

async function fetchUpstreamCurl(url, { asBuffer = false } = {}) {
  const headers = {
    ...buildUpstreamHeaders(url),
    'Accept-Encoding': 'identity',
  };
  const args = [
    '-sL',
    '--http1.1',
    '--max-time',
    '22',
    '-A',
    headers['User-Agent'] || 'Mozilla/5.0',
    '-H',
    'Accept: */*',
    '-H',
    'Accept-Encoding: identity',
  ];
  if (headers.Referer) args.push('-H', `Referer: ${headers.Referer}`);
  if (headers.Origin) args.push('-H', `Origin: ${headers.Origin}`);
  if (headers.Cookie) args.push('-H', `Cookie: ${headers.Cookie}`);
  args.push('-w', '\n%{http_code}', url);

  const { stdout } = await execFileAsync('curl', args, {
    encoding: asBuffer ? 'buffer' : 'utf8',
    maxBuffer: 12 * 1024 * 1024,
  });

  if (asBuffer) {
    const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    // last line is status code
    const nl = buf.lastIndexOf(0x0a);
    const statusLine = buf.slice(nl + 1).toString('utf8').trim();
    const body = nl >= 0 ? buf.slice(0, nl) : buf;
    const status = parseInt(statusLine, 10) || 0;
    if (status && status >= 400) {
      const error = new Error(`Upstream HTTP ${status}`);
      error.status = status;
      throw error;
    }
    return { response: { status, headers: { get: () => null } }, buffer: body };
  }

  const text = String(stdout);
  const nl = text.lastIndexOf('\n');
  const status = parseInt(text.slice(nl + 1).trim(), 10) || 0;
  const body = nl >= 0 ? text.slice(0, nl) : text;
  if (status && status >= 400) {
    const error = new Error(`Upstream HTTP ${status}`);
    error.status = status;
    error.body = body.slice(0, 200);
    throw error;
  }
  return { response: { status: status || 200, headers: { get: () => null } }, text: body };
}

async function fetchUpstream(url, { asBuffer = false } = {}) {
  const headers = {
    ...buildUpstreamHeaders(url),
    'Accept-Encoding': 'identity',
  };

  // Prefer curl for BD OTT hosts that hang under node-fetch
  if (needsCurlFallback(url)) {
    try {
      return await fetchUpstreamCurl(url, { asBuffer });
    } catch (err) {
      console.warn('[hls-proxy] curl fallback failed, trying node-fetch:', err.message);
    }
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      timeout: 20_000,
      agent: pickAgent(url),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error = new Error(`Upstream HTTP ${response.status}`);
      error.status = response.status;
      error.body = text.slice(0, 200);
      throw error;
    }

    if (asBuffer) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return { response, buffer };
    }
    const text = await response.text();
    return { response, text };
  } catch (err) {
    // Last-chance curl if node-fetch failed
    if (!needsCurlFallback(url)) {
      try {
        return await fetchUpstreamCurl(url, { asBuffer });
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

router.get('/manifest', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const { text } = await fetchUpstream(url);
    // Guard against HTML error pages being served as m3u8
    if (!text.includes('#EXTM3U')) {
      return res.status(502).send('Upstream did not return a valid HLS playlist');
    }
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    // AES-128 (bozztv/rongo): if we can obtain the key, strip EXT-X-KEY and
    // decrypt segments on this server so the browser plays clear MPEG-TS.
    const keyInfo = parseKeyIvFromPlaylist(text);
    let serverDecrypt = false;
    let keyBuf = null;
    if (keyInfo?.keyUrl && /AES-128/i.test(keyInfo.method || '')) {
      keyBuf = getCachedAesKey(keyInfo.keyUrl);
      if (!keyBuf) {
        // Non-blocking hunt on first miss; wait briefly for cache/env
        const raced = await Promise.race([
          ensureAesKey(keyInfo.keyUrl),
          new Promise((r) => setTimeout(() => r(null), 2500)),
        ]);
        keyBuf = raced || getCachedAesKey(keyInfo.keyUrl);
      }
      serverDecrypt = Boolean(keyBuf && keyInfo.iv);
      if (!keyBuf) {
        // Kick longer hunt in background for subsequent requests
        ensureAesKey(keyInfo.keyUrl).catch(() => {});
      }
    }

    const sourceText = serverDecrypt ? stripExtXKey(text) : text;
    const ivHex = keyInfo?.iv ? keyInfo.iv.toString('hex') : '';
    const kid = keyInfo?.keyUrl || '';

    const rewritten = rewriteManifest(sourceText, baseUrl, (absoluteUrl) => {
      if (isAesKeyUrl(absoluteUrl)) {
        // Prefer server key path (uses cache / hunt). Fallback absolute for CORS hosts.
        if (serverDecrypt) {
          // Key line stripped — should not reach here
          return proxyPath('key', absoluteUrl);
        }
        return proxyPath('key', absoluteUrl);
      }
      const nextIsManifest = isManifest(absoluteUrl);
      if (nextIsManifest) return proxyPath('manifest', absoluteUrl);
      if (serverDecrypt && ivHex) {
        return `/api/hls-proxy/segment?url=${encodeURIComponent(absoluteUrl)}&iv=${ivHex}&kid=${encodeURIComponent(kid)}`;
      }
      return proxyPath('segment', absoluteUrl);
    });

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache, no-store');
    res.set('X-Hls-Proxy', '1');
    if (serverDecrypt) res.set('X-Hls-Aes', 'server-decrypt');
    return res.send(rewritten);
  } catch (error) {
    console.error('[hls-proxy] manifest error:', error.message);
    return res.status(error.status || 502).send(error.message || 'Failed to fetch manifest');
  }
});

/** Binary AES key proxy (16/32-byte keys). Separate from /segment so tiny bodies are OK. */
router.get('/key', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    // Serve from cache first
    const cached = getCachedAesKey(url);
    if (cached) {
      res.set('Content-Type', 'application/octet-stream');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'private, max-age=120');
      res.set('X-Hls-Proxy', '1');
      return res.send(cached);
    }

    // Hunt / fetch
    const hunted = await ensureAesKey(url);
    if (hunted) {
      res.set('Content-Type', 'application/octet-stream');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'private, max-age=120');
      res.set('X-Hls-Proxy', '1');
      return res.send(hunted);
    }

    // Last resort: 302 so the *browser* fetches with the viewer IP (may bypass CF)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, url);
  } catch (error) {
    console.error('[hls-proxy] key error:', error.message);
    // Redirect fallback even on error
    try {
      res.set('Access-Control-Allow-Origin', '*');
      return res.redirect(302, url);
    } catch {
      return res.status(error.status || 502).send(error.message || 'Failed to fetch key');
    }
  }
});

router.get('/segment', async (req, res) => {
  const { url, iv, kid } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    // If a key URL was mis-routed here, still serve it (AES keys are 16–32 bytes).
    const keyLike = isAesKeyUrl(url);
    const { response, buffer: rawBuffer } = await fetchUpstream(url, { asBuffer: true });
    let buffer = rawBuffer;

    // Reject HTML error pages (SSL/CDN blocks) so hls.js fails cleanly
    if (buffer[0] === 0x3c /* < */ && buffer.toString('utf8', 0, 20).includes('<')) {
      return res.status(502).send('Upstream segment blocked or empty');
    }
    if (!keyLike && buffer.length < 200) {
      return res.status(502).send('Upstream segment blocked or empty');
    }
    if (keyLike && (!buffer.length || buffer.length > 512)) {
      return res.status(502).send('Invalid key payload');
    }

    // Server-side AES-128 decrypt when IV + key are available
    if (!keyLike && iv && kid) {
      let key = getCachedAesKey(String(kid));
      if (!key) key = await ensureAesKey(String(kid));
      if (key) {
        try {
          const ivBuf = Buffer.from(String(iv).replace(/^0x/i, ''), 'hex');
          if (ivBuf.length === 16) {
            const clear = decryptHlsSegment(buffer, key, ivBuf);
            // Prefer clear only if it looks like MPEG-TS / has more syncs
            const syncs = (buf) => {
              let n = 0;
              for (let i = 0; i < Math.min(buf.length, 1880); i += 188) {
                if (buf[i] === 0x47) n += 1;
              }
              return n;
            };
            if (clear?.length && (clear[0] === 0x47 || syncs(clear) > syncs(buffer))) {
              buffer = clear;
              res.set('X-Hls-Aes', 'decrypted');
            }
          }
        } catch (err) {
          console.warn('[hls-proxy] segment decrypt skip:', err.message);
        }
      }
    } else if (keyLike && buffer.length >= 16 && buffer.length <= 64) {
      setCachedAesKey(url, buffer);
    }

    const contentType = keyLike
      ? (response.headers.get('content-type') || 'application/octet-stream')
      : segmentContentType(url, response.headers.get('content-type') || '', buffer);

    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', keyLike ? 'private, max-age=60' : 'public, max-age=8');
    res.set('X-Hls-Proxy', '1');
    return res.send(buffer);
  } catch (error) {
    console.error('[hls-proxy] segment error:', error.message);
    return res.status(error.status || 502).send(error.message || 'Failed to fetch segment');
  }
});

router.get('/playback-url', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ ok: false, error: 'Missing url' });

  const needsProxy = isProxiedPlaybackUrl(url);
  res.json({
    ok: true,
    sourceUrl: needsProxy ? proxyPath('manifest', url) : url,
    proxied: needsProxy,
  });
});

export default router;
