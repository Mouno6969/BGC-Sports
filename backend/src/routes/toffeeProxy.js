import { Router } from 'express';
import fetch from 'node-fetch';
import { getToffeeChannelByUrl } from '../utils/toffeeService.js';

const router = Router();

router.get('/manifest', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Missing url');
  }

  // Auto-fetch headers from our service based on the URL
  const channel = await getToffeeChannelByUrl(url);
  const headers = channel?.headers || {};

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

    const lines = manifest.split('\n');
    const rewrittenLines = lines.map(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) {
        return line;
      }

      let absoluteUrl = line;
      try {
        if (!line.startsWith('http')) {
          absoluteUrl = new URL(line, baseUrl).href;
        }
      } catch (e) {
        return line;
      }

      const isManifest = absoluteUrl.includes('.m3u8');
      const proxyPath = isManifest ? 'manifest' : 'segment';

      // We no longer need to pass headers in the URL!
      return `/api/toffee-proxy/${proxyPath}?url=${encodeURIComponent(absoluteUrl)}`;
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
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Missing url');
  }

  // Find headers based on the URL
  const channel = await getToffeeChannelByUrl(url);
  const headers = channel?.headers || {};

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

    const contentType = response.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=30');

    response.body.pipe(res);
  } catch (err) {
    console.error('[toffee-proxy] segment error:', err.message);
    res.status(502).send('Failed to fetch segment');
  }
});

export default router;
