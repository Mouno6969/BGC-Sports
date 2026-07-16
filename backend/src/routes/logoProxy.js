// ---------------------------------------------------------------------------
// Logo Proxy — fetches remote logo images and re-serves them with correct
// Content-Type so browsers can render them as <img> elements.
// Fixes hosts like s3.aynaott.com that return Content-Disposition: attachment
// or application/octet-stream.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';

const execFileAsync = promisify(execFile);
const router = Router();

const cache = new Map(); // url -> { buffer, contentType, timestamp }
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE = 2000;
const FETCH_TIMEOUT_MS = 12_000;

const insecureHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  family: 4,
});
const httpAgent = new http.Agent({ keepAlive: true, family: 4 });

function detectContentType(buffer, upstream = '') {
  let contentType = (upstream || '').split(';')[0].trim().toLowerCase();

  // Magic-byte detection (authoritative when upstream is wrong/generic)
  if (buffer.length >= 3) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/webp';
    // SVG often served as text/plain or octet-stream
    const head = buffer.slice(0, 256).toString('utf8').trimStart();
    if (head.startsWith('<svg') || head.startsWith('<?xml') || head.includes('<svg')) {
      return 'image/svg+xml';
    }
  }

  if (contentType.startsWith('image/')) return contentType;
  if (contentType === 'text/xml' || contentType === 'application/xml') return 'image/svg+xml';
  return 'image/jpeg';
}

function buildHeaders(url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (/imgur/i.test(host)) {
    headers.Referer = 'https://imgur.com/';
  } else if (/aynaott/i.test(host)) {
    headers.Referer = 'https://tvsen6.aynaott.com/';
  } else if (/postimg|ibb\.co/i.test(host)) {
    headers.Referer = 'https://postimg.cc/';
  } else if (/imglink/i.test(host)) {
    headers.Referer = 'https://imglink.cc/';
  } else if (/wikimedia|wikipedia/i.test(host)) {
    headers.Referer = 'https://www.wikipedia.org/';
  } else {
    headers.Referer = `https://${host}/`;
  }
  return headers;
}

async function fetchWithNode(url) {
  const agent = url.startsWith('http:') ? httpAgent : insecureHttpsAgent;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: buildHeaders(url),
    agent,
    redirect: 'follow',
  });
  if (!response.ok) {
    const err = new Error(`Upstream returned ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = detectContentType(buffer, response.headers.get('content-type') || '');
  return { buffer, contentType };
}

async function fetchWithCurl(url) {
  const headers = buildHeaders(url);
  const args = [
    '-sL',
    '--http1.1',
    '--max-time',
    '12',
    '-A',
    headers['User-Agent'],
    '-H',
    `Accept: ${headers.Accept}`,
    '-H',
    `Referer: ${headers.Referer}`,
    '-w',
    '\n%{http_code}',
    url,
  ];
  const { stdout } = await execFileAsync('curl', args, {
    encoding: 'buffer',
    maxBuffer: 8 * 1024 * 1024,
  });
  const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  const nl = buf.lastIndexOf(0x0a);
  const status = parseInt(buf.slice(nl + 1).toString('utf8').trim(), 10) || 0;
  const body = nl >= 0 ? buf.slice(0, nl) : buf;
  if (status && status >= 400) {
    const err = new Error(`Upstream returned ${status}`);
    err.status = status;
    throw err;
  }
  if (!body.length) {
    const err = new Error('Empty logo body');
    err.status = 502;
    throw err;
  }
  return { buffer: body, contentType: detectContentType(body) };
}

async function fetchLogo(url) {
  try {
    return await fetchWithNode(url);
  } catch (err) {
    // Retry once with curl (helps some CDNs / TLS quirks)
    try {
      return await fetchWithCurl(url);
    } catch {
      throw err;
    }
  }
}

router.get('/', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.send(cached.buffer);
  }

  try {
    const { buffer, contentType } = await fetchLogo(url);

    // Reject empty / HTML error pages
    if (!buffer.length || (buffer[0] === 0x3c && !contentType.includes('svg'))) {
      return res.status(502).json({ error: 'Upstream did not return an image' });
    }

    cache.set(url, { buffer, contentType, timestamp: Date.now() });
    if (cache.size > MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.send(buffer);
  } catch (err) {
    console.error('[logo-proxy] error:', err.message, 'for url:', String(url).slice(0, 120));
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({ error: 'Failed to fetch logo' });
  }
});

export default router;
