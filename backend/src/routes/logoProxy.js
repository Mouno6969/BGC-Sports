// ---------------------------------------------------------------------------
// Logo Proxy — fetches remote logo images and re-serves them with the correct
// Content-Type so browsers can render them as <img> elements.
// Fixes s3.aynaott.com (and similar) which return Content-Disposition: attachment.
// ---------------------------------------------------------------------------
import { Router } from 'express';

const router = Router();

// Simple in-memory cache to avoid re-fetching the same logo repeatedly
const cache = new Map(); // url -> { buffer, contentType, timestamp }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

router.get('/', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Only allow http/https URLs
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    return res.send(cached.buffer);
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BGCSports/1.0)',
        'Accept': 'image/*,*/*',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine content type — override application/octet-stream with image detection
    let contentType = response.headers.get('content-type') || 'image/jpeg';
    if (contentType.includes('octet-stream') || contentType.includes('application/')) {
      // Detect from magic bytes
      if (buffer[0] === 0xFF && buffer[1] === 0xD8) contentType = 'image/jpeg';
      else if (buffer[0] === 0x89 && buffer[1] === 0x50) contentType = 'image/png';
      else if (buffer[0] === 0x47 && buffer[1] === 0x49) contentType = 'image/gif';
      else if (buffer[0] === 0x52 && buffer[1] === 0x49) contentType = 'image/webp';
      else contentType = 'image/jpeg'; // fallback
    }
    // Strip charset and extra params, keep only mime type
    contentType = contentType.split(';')[0].trim();

    // Cache it
    cache.set(url, { buffer, contentType, timestamp: Date.now() });
    // Limit cache size
    if (cache.size > 1000) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(buffer);
  } catch (err) {
    console.error('[logo-proxy] error:', err.message, 'for url:', url);
    res.status(502).json({ error: 'Failed to fetch logo' });
  }
});

export default router;
