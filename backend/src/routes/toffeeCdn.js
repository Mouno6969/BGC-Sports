import { Router } from 'express';
import {
  getToffeeChannelByUrl,
  getToffeeHeadersForUrl,
  normalizeToffeeHeaders,
} from '../utils/toffeeService.js';
import { getToffeeSession } from '../toffee/sessionStore.js';
import { fetchToffeeResource, mapPipelineErrorToStatus } from '../toffee/toffeeClient.js';
import { rewriteManifest } from '../toffee/manifestRewrite.js';
import { ToffeeRequestError } from '../toffee/errors.js';

const router = Router();

function decodeHeadersParam(encoded) {
  if (!encoded) return {};
  try {
    const json = Buffer.from(String(encoded), 'base64').toString('utf8');
    return normalizeToffeeHeaders(JSON.parse(json));
  } catch {
    return {};
  }
}

function resolveHeaders(req, channelHeaders = {}, targetUrl = '') {
  const sessionHeaders = getToffeeSession(req.query.sid) || {};
  const queryHeaders = decodeHeadersParam(req.query.h);
  const merged = { ...sessionHeaders, ...queryHeaders, ...channelHeaders };
  return getToffeeHeadersForUrl(targetUrl, merged);
}

function cdnProxyPath(url, sid = '') {
  const parts = [`/api/toffee-cdn?url=${encodeURIComponent(url)}`];
  if (sid) parts.push(`sid=${encodeURIComponent(sid)}`);
  return parts.join('&');
}

function isManifest(url = '') {
  return url.includes('.m3u8') || url.includes('playlist');
}

async function handleCdnRequest(req, res) {
  const { url, sid } = req.query;
  if (!url) return res.status(400).json({ ok: false, error: 'Missing url' });

  const channel = await getToffeeChannelByUrl(url);
  const headers = resolveHeaders(req, channel?.headers || {}, url);

  try {
    if (isManifest(url)) {
      const result = await fetchToffeeResource({
        url,
        headers,
        expect: 'manifest',
      });

      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const rewritten = rewriteManifest(result.body, baseUrl, (absoluteUrl) => cdnProxyPath(absoluteUrl, sid));

      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'no-cache, no-store');
      res.set('X-Toffee-Request-Id', result.requestId);
      return res.send(rewritten);
    }

    const result = await fetchToffeeResource({
      url,
      headers,
      expect: 'binary',
    });

    if (result.contentType) res.set('Content-Type', result.contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', url.includes('.ts') ? 'public, max-age=30' : 'no-cache, no-store');
    res.set('X-Toffee-Request-Id', result.requestId);
    return res.send(result.body);
  } catch (error) {
    const status = mapPipelineErrorToStatus(error);
    const code = error instanceof ToffeeRequestError ? error.code : 'UNKNOWN';

    if (error instanceof ToffeeRequestError && error.code === 'DNS_FAILURE') {
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'no-cache, no-store');
      res.set('X-Toffee-Client-Required', '1');
      return res.status(503).send(
        '#EXTM3U\n#EXT-X-ERROR: Enable Streams on this site (tap the button on the player) and use Bangladesh mobile data.\n'
      );
    }

    if (isManifest(url)) {
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Cache-Control', 'no-cache, no-store');
      return res.status(status).send(`#EXTM3U\n#EXT-X-ERROR: ${error?.message || 'Upstream unavailable'} (${code})\n`);
    }

    return res.status(status).send(error?.message || 'Failed to fetch upstream resource');
  }
}

router.get('/', handleCdnRequest);

export default router;