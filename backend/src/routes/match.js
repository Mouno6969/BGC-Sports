// ---------------------------------------------------------------------------
// Match Center API
//
// GET /api/match/:idOrSlug
//   idOrSlug = espn-760510 | 760510 | france-vs-morocco-760510
//   ?league=fifa.world (optional)
//
// Returns normalized match center payload + WC watch channel suggestions.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { getMatchCenter, parseEventId } from '../utils/matchCenterService.js';

const router = Router();

async function fetchWatchChannels(isWorldCup) {
  if (!isWorldCup) return [];
  try {
    const port = process.env.PORT || 4000;
    const res = await fetch(`http://127.0.0.1:${port}/api/fifa/channels`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = data.channels || data || [];
    return (Array.isArray(list) ? list : [])
      .slice(0, 8)
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        logo: ch.logo || null,
        url: ch.url,
        source: ch.source || 'fifa',
        watchPath: `/watch?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}&logo=${encodeURIComponent(ch.logo || '')}&source=${encodeURIComponent(ch.source || 'fifa')}`,
      }))
      .filter((ch) => ch.url && ch.name);
  } catch {
    return [];
  }
}

router.get('/:idOrSlug', async (req, res) => {
  const { idOrSlug } = req.params;
  if (!parseEventId(idOrSlug)) {
    return res.status(400).json({ ok: false, error: 'Invalid match id' });
  }

  const result = await getMatchCenter(idOrSlug, {
    league: req.query.league || null,
  });

  if (!result.ok) {
    return res.status(result.status || 404).json(result);
  }

  const m = result.match;
  const isWorldCup = /world cup|fifa/i.test(m.league || '') || m.leagueSlug === 'fifa.world';
  const watchChannels = await fetchWatchChannels(isWorldCup);

  res.set('Cache-Control', m.status === 'LIVE' ? 'public, max-age=15' : 'public, max-age=60');
  res.json({
    ok: true,
    match: m,
    watch: {
      worldCup: isWorldCup,
      channels: watchChannels,
      scoresTab: isWorldCup ? '/?tab=worldcup' : '/?tab=scores',
      predictTab: '/?tab=predict',
    },
    cached: Boolean(result.cached),
    updatedAt: Date.now(),
  });
});

export default router;
