// ---------------------------------------------------------------------------
// Live Scores — fetches REAL football match data from TheSportsDB free API.
// Aggregates recent results (with real final scores), in-play live matches,
// and upcoming fixtures across major leagues. Cached to respect rate limits.
//
// GET /api/scores         -> { matches: [...], updatedAt }
// ---------------------------------------------------------------------------
import { Router } from 'express';

const router = Router();

// TheSportsDB free API key "3" (public test key)
const API = 'https://www.thesportsdb.com/api/v1/json/3';

// Major leagues to aggregate (id -> short label)
const LEAGUES = [
  { id: '4328', label: 'EPL' },        // English Premier League
  { id: '4335', label: 'La Liga' },    // Spanish La Liga
  { id: '4331', label: 'Bundesliga' }, // German Bundesliga
  { id: '4332', label: 'Serie A' },    // Italian Serie A
  { id: '4334', label: 'Ligue 1' },    // French Ligue 1
  { id: '4480', label: 'UCL' },        // UEFA Champions League
  { id: '4481', label: 'UEL' },        // UEFA Europa League
  { id: '4346', label: 'MLS' },        // US Major League Soccer
];

// Cache (live data changes often, so short TTL)
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 60 * 1000; // 60 seconds

function fmtMatch(e, leagueLabel, kind) {
  const home = e.strHomeTeam;
  const away = e.strAwayTeam;
  const hs = e.intHomeScore;
  const as = e.intAwayScore;
  const hasScore = hs !== null && hs !== '' && as !== null && as !== '';

  return {
    id: e.idEvent,
    home,
    away,
    homeBadge: e.strHomeTeamBadge || null,
    awayBadge: e.strAwayTeamBadge || null,
    homeScore: hasScore ? parseInt(hs, 10) : null,
    awayScore: hasScore ? parseInt(as, 10) : null,
    league: leagueLabel || e.strLeague,
    status: kind, // 'LIVE' | 'FINISHED' | 'UPCOMING'
    progress: e.strProgress || null,
    timestamp: e.strTimestamp || null,
    date: e.dateEvent || null,
    time: e.strTime || null,
  };
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function buildScores() {
  const matches = [];

  // 1) Try in-play LIVE matches first (real live scores when games are on)
  const live = await fetchJson(`${API}/livescore.php?s=Soccer`);
  if (live && Array.isArray(live.events)) {
    for (const e of live.events) {
      matches.push(fmtMatch(e, e.strLeague, 'LIVE'));
    }
  }

  // 2) For each league, fetch most recent result + next fixture (real data)
  const results = await Promise.all(
    LEAGUES.flatMap((lg) => [
      fetchJson(`${API}/eventspastleague.php?id=${lg.id}`).then((d) => ({ d, lg, kind: 'FINISHED' })),
      fetchJson(`${API}/eventsnextleague.php?id=${lg.id}`).then((d) => ({ d, lg, kind: 'UPCOMING' })),
    ])
  );

  for (const { d, lg, kind } of results) {
    if (d && Array.isArray(d.events)) {
      for (const e of d.events.slice(0, 2)) {
        // Avoid duplicating a match already present as LIVE
        if (!matches.some((m) => m.id === e.idEvent)) {
          matches.push(fmtMatch(e, lg.label, kind));
        }
      }
    }
  }

  // Sort: LIVE first, then UPCOMING (soonest), then FINISHED (most recent)
  const order = { LIVE: 0, UPCOMING: 1, FINISHED: 2 };
  matches.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return a.status === 'FINISHED' ? tb - ta : ta - tb;
  });

  return matches;
}

router.get('/', async (_req, res) => {
  // Serve from cache if fresh
  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    return res.json({ matches: cache.data, updatedAt: cache.timestamp, cached: true });
  }

  try {
    const matches = await buildScores();
    cache = { data: matches, timestamp: Date.now() };
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ matches, updatedAt: cache.timestamp, cached: false });
  } catch (err) {
    console.error('[scores] error:', err.message);
    // Serve stale cache if available
    if (cache.data) {
      return res.json({ matches: cache.data, updatedAt: cache.timestamp, stale: true });
    }
    res.status(502).json({ matches: [], error: 'Failed to fetch scores' });
  }
});

export default router;
