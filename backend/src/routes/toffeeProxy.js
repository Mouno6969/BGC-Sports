import { Router } from 'express';
import {
  getToffeeChannelByUrl,
  getToffeeHeadersForUrl,
  isToffeeStreamUrl,
  normalizeToffeeHeaders,
} from '../utils/toffeeService.js';
import { getToffeeSession } from '../toffee/sessionStore.js';
import { fetchToffeeResource, mapPipelineErrorToStatus } from '../toffee/toffeeClient.js';
import { rewriteManifest } from '../toffee/manifestRewrite.js';
import { ToffeeRequestError } from '../toffee/errors.js';

const router = Router();

function getBaseProxyUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/api/toffee-proxy`;
}

function decodeHeadersParam(encoded) {
  if (!encoded) return {};
  try {
    const json = Buffer.from(String(encoded), 'base64').toString('utf8');
    return normalizeToffeeHeaders(JSON.parse(json));
  } catch {
    return {};
  }
}

function buildUpstreamHeaders(channelHeaders = {}, req, targetUrl = '') {
  const sessionHeaders = getToffeeSession(req.query.sid) || {};
  const queryHeaders = decodeHeadersParam(req.query.h);
  const merged = { ...sessionHeaders, ...queryHeaders, ...channelHeaders };
  const headers = getToffeeHeadersForUrl(targetUrl, merged);

  if (req.headers['x-forwarded-referer']) {
    headers.Referer = req.headers['x-forwarded-referer'];
  } else if (req.query.referer) {
    headers.Referer = String(req.query.referer);
  }

  return headers;
}

function cdnApiPath(url, sessionId = '') {
  const parts = [`/api/toffee-cdn?url=${encodeURIComponent(url)}`];
  if (sessionId) parts.push(`sid=${encodeURIComponent(sessionId)}`);
  return parts.join('&');
}

function shouldRewriteToClientProxy(url) {
  return url.toLowerCase().includes('toffeelive.com');
}

router.get('/manifest', async (req, res) => {
  const { url, sid } = req.query;
  if (!url) return res.status(400).send('Missing url');

  const channel = await getToffeeChannelByUrl(url);
  const headers = buildUpstreamHeaders(channel?.headers || {}, req, url);
  const baseProxyUrl = getBaseProxyUrl(req);

  try {
    const result = await fetchToffeeResource({
      url,
      headers,
      expect: 'manifest',
    });

    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
    const rewritten = rewriteManifest(result.body, baseUrl, (absoluteUrl) => {
      if (shouldRewriteToClientProxy(absoluteUrl)) return cdnApiPath(absoluteUrl, sid);
      const isManifest = absoluteUrl.includes('.m3u8') || absoluteUrl.includes('playlist');
      const proxyPath = isManifest ? 'manifest' : 'segment';
      return `${baseProxyUrl}/${proxyPath}?url=${encodeURIComponent(absoluteUrl)}`;
    });

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');
    res.set('X-Toffee-Request-Id', result.requestId);
    res.send(rewritten);
  } catch (error) {
    const status = mapPipelineErrorToStatus(error);
    console.error('[toffee-proxy] manifest error:', error.code || error.message);
    if (error instanceof ToffeeRequestError) {
      return res.status(status).json({ ok: false, code: error.code, error: error.message });
    }
    return res.status(502).send('Failed to fetch manifest');
  }
});

router.get('/segment', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  const channel = await getToffeeChannelByUrl(url);
  const headers = buildUpstreamHeaders(channel?.headers || {}, req, url);

  try {
    const result = await fetchToffeeResource({
      url,
      headers,
      expect: 'binary',
    });

    if (result.contentType) res.set('Content-Type', result.contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=30');
    res.set('X-Toffee-Request-Id', result.requestId);
    res.send(result.body);
  } catch (error) {
    const status = mapPipelineErrorToStatus(error);
    console.error('[toffee-proxy] segment error:', error.code || error.message);
    return res.status(status).send(error.message || 'Failed to fetch segment');
  }
});

export { isToffeeStreamUrl };
export default router;