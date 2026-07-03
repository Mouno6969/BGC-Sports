import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

/**
 * Helper to encode headers for use in query params
 */
function encodeHeaders(headers) {
  return Buffer.from(JSON.stringify(headers)).toString('base64');
}

/**
 * Helper to decode headers from query params
 */
function decodeHeaders(encoded) {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString());
  } catch (e) {
    return {};
  }
}

router.get('/manifest', async (req, res) => {
  const { url, headers: encodedHeaders } = req.query;

  if (!url) {
    return res.status(400).send('Missing url');
  }

  const headers = decodeHeaders(encodedHeaders);

  try {
    const response = await fetch(url, {
      headers: {
        ...headers,
        'User-Agent': headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Upstream manifest error: ${response.status}`);
    }

    let manifest = await response.text();
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    // Rewrite relative URLs to absolute ones or proxy ones
    // We want all segments to also go through this proxy
    const lines = manifest.split('\n');
    const rewrittenLines = lines.map(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) {
        // Handle sub-manifests (Variant Playlists)
        if (line.startsWith('#EXT-X-STREAM-INF') || line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
          return line;
        }
        return line;
      }

      // It's a URL (segment or sub-manifest)
      let absoluteUrl = line;
      try {
        if (!line.startsWith('http')) {
          absoluteUrl = new URL(line, baseUrl).href;
        }
      } catch (e) {
        return line; // Skip if invalid URL
      }

      // Determine if it's a sub-manifest or a segment
      const isManifest = absoluteUrl.includes('.m3u8');
      const proxyPath = isManifest ? 'manifest' : 'segment';

      // Construct the proxy URL
      const proxyUrl = `/api/toffee-proxy/${proxyPath}?url=${encodeURIComponent(absoluteUrl)}&headers=${encodedHeaders}`;
      return proxyUrl;
    });

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(rewrittenLines.join('\n'));
  } catch (err) {
    console.error('[toffee-proxy] manifest error:', err.message);
    res.status(502).send('Failed to fetch manifest');
  }
});

router.get('/segment', async (req, res) => {
  const { url, headers: encodedHeaders } = req.query;

  if (!url) {
    return res.status(400).send('Missing url');
  }

  const headers = decodeHeaders(encodedHeaders);

  try {
    const response = await fetch(url, {
      headers: {
        ...headers,
        'User-Agent': headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Upstream segment error: ${response.status}`);
    }

    // Forward relevant headers
    const contentType = response.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=10'); // Segments are short-lived

    response.body.pipe(res);
  } catch (err) {
    console.error('[toffee-proxy] segment error:', err.message);
    res.status(502).send('Failed to fetch segment');
  }
});

export default router;
