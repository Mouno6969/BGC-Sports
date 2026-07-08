import { Router } from 'express';
import fetch from 'node-fetch';
import { rewriteManifest } from '../toffee/manifestRewrite.js';
import { buildUpstreamHeaders, isProxiedPlaybackUrl } from '../utils/fifaService.js';

const router = Router();

function proxyPath(kind, url) {
  return `/api/hls-proxy/${kind}?url=${encodeURIComponent(url)}`;
}

function isManifest(url = '') {
  const lower = String(url).toLowerCase();
  if (/\.(ts|m4s|mp4|aac|vtt|jpg|jpeg|png)(\?|$)/i.test(lower)) return false;
  return lower.includes('.m3u8') || lower.includes('/video.m3u8') || /\/manifest\//i.test(lower);
}

function segmentContentType(url = '', upstreamType = '', buffer = Buffer.alloc(0)) {
  const lower = String(url).toLowerCase();
  if (lower.includes('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (lower.includes('.vtt')) return 'text/vtt';
  if (lower.includes('.aac')) return 'audio/aac';
  if (buffer.length > 0 && buffer[0] === 0x47) return 'video/mp2t';
  if (/\.(ts|m2ts|mp2t)(\?|$)/i.test(lower)) return 'video/mp2t';
  if (/\.(jpg|jpeg)(\?|$)/i.test(lower)) return 'video/mp2t';
  if (upstreamType && !upstreamType.includes('text/html')) return upstreamType;
  return 'application/octet-stream';
}

async function fetchUpstream(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: buildUpstreamHeaders(url),
    redirect: 'follow',
    timeout: 15_000,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`Upstream HTTP ${response.status}`);
    error.status = response.status;
    error.body = text.slice(0, 200);
    throw error;
  }

  return response;
}

router.get('/manifest', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const response = await fetchUpstream(url);
    const text = await response.text();
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
    const rewritten = rewriteManifest(text, baseUrl, (absoluteUrl) => {
      const nextIsManifest = isManifest(absoluteUrl);
      return proxyPath(nextIsManifest ? 'manifest' : 'segment', absoluteUrl);
    });

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache, no-store');
    res.set('X-Hls-Proxy', '1');
    return res.send(rewritten);
  } catch (error) {
    console.error('[hls-proxy] manifest error:', error.message);
    return res.status(error.status || 502).send(error.message || 'Failed to fetch manifest');
  }
});

router.get('/segment', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const response = await fetchUpstream(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = segmentContentType(url, response.headers.get('content-type') || '', buffer);

    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', url.includes('.ts') || url.includes('.jpg') ? 'public, max-age=15' : 'no-cache');
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