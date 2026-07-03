// ---------------------------------------------------------------------------
// Toffee HLS Proxy — the ONLY place Toffee streams can actually be played from.
//
// Why a proxy is required:
//   • Browsers silently drop the `cookie`, `user-agent` and `host` headers that
//     Toffee's signed CDN requires (they're on the fetch "forbidden header"
//     list), so client-side header injection via hls.js xhrSetup cannot work.
//   • Toffee's CDN (bldcmprod-cdn.toffeelive.com) is geo-locked to Bangladesh.
//
// What this route does:
//   GET /api/toffee-proxy?url=<encoded upstream url>
//   1. Looks up the required headers for that URL (from the Toffee data feed).
//   2. Fetches the upstream resource server-side WITH those headers.
//   3. If it's an .m3u8 playlist, rewrites every child URL (variants, segments,
//      EXT-X-KEY / EXT-X-MAP URIs) to route back through this same proxy.
//   4. Otherwise streams the raw bytes (segments, keys) straight back.
//
// Optional geo-unblocking:
//   Set TOFFEE_HTTP_PROXY to an http(s) proxy that egresses from Bangladesh and
//   all upstream Toffee requests will be routed through it.
// ---------------------------------------------------------------------------

import { Router } from 'express';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  fetchToffeeChannels,
  getToffeeHeaders,
  hasToffeeData,
} from '../utils/toffee.js';

const router = Router();

const UPSTREAM_TIMEOUT_MS = 15000;
const OUTBOUND_PROXY = process.env.TOFFEE_HTTP_PROXY || null;
const proxyAgent = OUTBOUND_PROXY ? new HttpsProxyAgent(OUTBOUND_PROXY) : null;

if (OUTBOUND_PROXY) {
  console.log('[toffee-proxy] Routing upstream requests via TOFFEE_HTTP_PROXY');
}

/** Only allow proxying Toffee's known CDN hosts (prevents open-proxy abuse). */
const ALLOWED_HOST_SUFFIXES = ['toffeelive.com'];

function isAllowedUpstream(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => u.host === suffix || u.host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

/** Build an absolute proxy URL (pointing back at this server) for a child URL. */
function buildProxyUrl(req, absoluteChildUrl) {
  const base = `${req.protocol}://${req.get('host')}/api/toffee-proxy`;
  return `${base}?url=${encodeURIComponent(absoluteChildUrl)}`;
}

/** Rewrite an m3u8 playlist so every child URL is routed back through us. */
function rewritePlaylist(playlistText, upstreamUrl, req) {
  const lines = playlistText.split(/\r?\n/);

  const rewriteUri = (uri) => {
    try {
      const absolute = new URL(uri, upstreamUrl).toString();
      return buildProxyUrl(req, absolute);
    } catch {
      return uri;
    }
  };

  // Rewrite URI="..." occurrences inside tags (EXT-X-KEY, EXT-X-MAP, etc.).
  const rewriteTagUris = (line) =>
    line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${rewriteUri(uri)}"`);

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === '') return line;
      if (trimmed.startsWith('#')) {
        return trimmed.includes('URI="') ? rewriteTagUris(line) : line;
      }
      // A bare line is a media segment or a variant playlist URL.
      return rewriteUri(trimmed);
    })
    .join('\n');
}

function looksLikePlaylist(upstreamUrl, contentType) {
  if (contentType && /mpegurl/i.test(contentType)) return true;
  try {
    return new URL(upstreamUrl).pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return false;
  }
}

router.get('/', async (req, res) => {
  const upstreamUrl = req.query.url;

  if (!upstreamUrl || typeof upstreamUrl !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing url parameter' });
  }
  if (!isAllowedUpstream(upstreamUrl)) {
    return res
      .status(400)
      .json({ ok: false, error: 'URL host is not an allowed Toffee upstream' });
  }

  // Ensure headers are loaded (first request after a cold start).
  if (!hasToffeeData()) {
    await fetchToffeeChannels();
  }

  const upstreamHeaders = { ...getToffeeHeaders(upstreamUrl) };
  // Let node/undici negotiate encoding so we can safely read text playlists.
  delete upstreamHeaders['accept-encoding'];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: upstreamHeaders,
      signal: controller.signal,
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    });

    if (!upstream.ok) {
      console.error(
        `[toffee-proxy] upstream ${upstream.status} for ${upstreamUrl}`
      );
      return res.status(502).json({
        ok: false,
        error: `Upstream returned ${upstream.status}`,
        hint:
          upstream.status === 403 || upstream.status === 401
            ? 'Signed Toffee token is likely expired or the request is geo-blocked. Update the data source and/or set TOFFEE_HTTP_PROXY to a Bangladesh proxy.'
            : undefined,
      });
    }

    const contentType = upstream.headers.get('content-type') || '';

    if (looksLikePlaylist(upstreamUrl, contentType)) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, upstreamUrl, req);
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Cache-Control', 'no-store');
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(rewritten);
    }

    // Binary passthrough (segments, keys, etc.).
    if (contentType) res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=5');
    res.set('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    const aborted = err.name === 'AbortError';
    console.error('[toffee-proxy] error:', err.message, 'for', upstreamUrl);
    return res.status(aborted ? 504 : 502).json({
      ok: false,
      error: aborted ? 'Upstream timed out' : 'Failed to reach upstream',
      hint: 'Toffee is geo-locked to Bangladesh — set TOFFEE_HTTP_PROXY to a BD proxy if the server is hosted elsewhere.',
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
