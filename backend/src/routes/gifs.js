// ---------------------------------------------------------------------------
// GIF search proxy — powers the chat GIF picker.
//
// GET /api/gifs?q=<query>&limit=<n>   -> search GIFs
// GET /api/gifs?limit=<n>             -> trending GIFs (no query)
//
// Uses the GIPHY API server-side so the key never ships to the client and
// the frontend gets a small, normalized payload:
//   { ok: true, gifs: [{ id, title, url, preview }] }
//
// Set GIPHY_API_KEY in backend/.env to use your own key; a public web key
// is used as a fallback so GIFs work out of the box.
// Results are cached in memory for a few minutes to stay well within limits.
// ---------------------------------------------------------------------------
import { Router } from 'express';

const router = Router();

const GIPHY_KEY = process.env.GIPHY_API_KEY || 'Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LIMIT = 24;

// Tiny in-memory cache: query -> { ts, data }
const cache = new Map();

function getCached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  cache.delete(key);
  return null;
}

function setCached(key, data) {
  cache.set(key, { ts: Date.now(), data });
  // Prevent unbounded growth
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function normalize(giphyData) {
  return (giphyData || [])
    .map((g) => {
      const imgs = g.images || {};
      const full = imgs.fixed_height || imgs.original || {};
      const prev = imgs.fixed_height_small || imgs.fixed_height_downsampled || full;
      if (!full.url) return null;
      return {
        id: g.id,
        title: g.title || 'GIF',
        url: full.url,
        preview: prev.url || full.url,
        width: Number(full.width) || 0,
        height: Number(full.height) || 0,
      };
    })
    .filter(Boolean);
}

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 64);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 16, 1), MAX_LIMIT);
  const cacheKey = `${q.toLowerCase()}|${limit}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ ok: true, gifs: cached, cached: true });
  }

  const endpoint = q
    ? `${GIPHY_BASE}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&lang=en`
    : `${GIPHY_BASE}/trending?api_key=${GIPHY_KEY}&limit=${limit}&rating=pg-13`;

  try {
    const resp = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) {
      throw new Error(`GIPHY responded ${resp.status}`);
    }
    const data = await resp.json();
    const gifs = normalize(data.data);
    setCached(cacheKey, gifs);
    res.json({ ok: true, gifs });
  } catch (err) {
    console.error('[gifs] search failed:', err.message);
    res.status(502).json({ ok: false, error: 'GIF search is unavailable right now.', gifs: [] });
  }
});

export default router;
