// ---------------------------------------------------------------------------
// Match predictions + leaderboard API.
//
// POST /api/predictions              — submit / update a prediction
// GET  /api/predictions/me           — my predictions (?userId=)
// GET  /api/predictions/leaderboard  — ranked players
// GET  /api/predictions/open         — open WC/matches + my picks
// GET  /api/predictions/match/:id    — community pick stats
// GET  /api/predictions/rules        — scoring rules
// POST /api/predictions/settle       — settle against finished scores (idempotent)
// ---------------------------------------------------------------------------
import { Router } from 'express';
import {
  upsertPrediction,
  getUserPredictions,
  getPredictionMapForUser,
  getLeaderboard,
  getMatchCommunityStats,
  settleResults,
  getScoringRules,
} from '../utils/predictionStore.js';

const router = Router();

// Lazy import scores builders would create a cycle — fetch ESPN/finished
// matches the same way as scores route via internal HTTP is heavy.
// Instead, settle accepts a results array OR pulls from the scores module cache.
let scoresModule = null;
async function getFinishedMatches() {
  try {
    if (!scoresModule) {
      // Dynamic import of scores route helpers is awkward (router export only).
      // Call local ESPN scoreboard for finished WC + leagues via the public API
      // we already expose — use fetch to self when PORT known, or re-query ESPN.
      scoresModule = true;
    }
    const port = process.env.PORT || 4000;
    const res = await fetch(`http://127.0.0.1:${port}/api/scores`, {
      signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const all = [...(data.worldCup || []), ...(data.matches || [])];
    const finished = [];
    const seen = new Set();
    for (const m of all) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      if (m.status !== 'FINISHED') continue;
      if (m.homeScore == null || m.awayScore == null) continue;
      finished.push({
        matchId: m.id,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        home: m.home,
        away: m.away,
      });
    }
    return finished;
  } catch (err) {
    console.warn('[predictions] settle fetch scores failed:', err.message);
    return [];
  }
}

async function autoSettle() {
  const finished = await getFinishedMatches();
  if (!finished.length) return { settled: 0 };
  return settleResults(finished);
}

// --- Routes ----------------------------------------------------------------

router.get('/rules', (_req, res) => {
  res.json({ ok: true, ...getScoringRules() });
});

router.get('/leaderboard', async (req, res) => {
  // Settle in background-ish before ranking so points stay fresh
  try {
    await autoSettle();
  } catch {
    /* ignore */
  }
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
  const userId = req.query.userId || null;
  const data = getLeaderboard({ limit, userId });
  res.json({ ok: true, ...data, updatedAt: Date.now() });
});

router.get('/me', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const data = getUserPredictions(userId);
  res.json({ ok: true, ...data });
});

router.get('/open', async (req, res) => {
  const userId = req.query.userId || '';
  try {
    await autoSettle();
  } catch {
    /* ignore */
  }

  let open = [];
  let recentFinished = [];
  try {
    const port = process.env.PORT || 4000;
    const r = await fetch(`http://127.0.0.1:${port}/api/scores`, {
      signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/json' },
    });
    if (r.ok) {
      const data = await r.json();
      const all = [...(data.worldCup || []), ...(data.matches || [])];
      const seen = new Set();
      const now = Date.now();
      for (const m of all) {
        if (!m?.id || !m.home || !m.away || seen.has(m.id)) continue;
        // Skip pure TBD knockout placeholders with both sides unknown
        if (/winner|loser|tbd/i.test(m.home) && /winner|loser|tbd/i.test(m.away)) continue;
        seen.add(m.id);
        const kick = m.timestamp ? new Date(m.timestamp).getTime() : 0;
        const row = {
          id: m.id,
          home: m.home,
          away: m.away,
          homeBadge: m.homeBadge || null,
          awayBadge: m.awayBadge || null,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          status: m.status,
          timestamp: m.timestamp,
          venue: m.venue,
          league: m.league,
          stage: m.stage || m.round,
          locked:
            m.status === 'LIVE' ||
            m.status === 'FINISHED' ||
            (kick && kick <= now),
        };
        if (m.status === 'UPCOMING' || (m.status === 'LIVE' && !row.locked)) {
          open.push(row);
        } else if (m.status === 'FINISHED') {
          recentFinished.push(row);
        } else if (m.status === 'LIVE') {
          // still show live as locked
          open.push(row);
        }
      }
    }
  } catch (err) {
    console.warn('[predictions] open matches fetch failed:', err.message);
  }

  // Sort open: soonest first
  open.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });
  // Recent finished: newest first, cap
  recentFinished.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });
  recentFinished = recentFinished.slice(0, 12);
  open = open.slice(0, 40);

  const myMap = userId ? getPredictionMapForUser(userId) : {};
  const mine = getUserPredictions(userId || '');

  res.json({
    ok: true,
    open,
    recentFinished,
    myPredictions: myMap,
    me: mine.user,
    scoring: getScoringRules(),
    updatedAt: Date.now(),
  });
});

router.get('/match/:id', (req, res) => {
  const stats = getMatchCommunityStats(req.params.id);
  res.json({ ok: true, ...stats });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const result = upsertPrediction({
    userId: body.userId,
    matchId: body.matchId,
    homeScore: body.homeScore,
    awayScore: body.awayScore,
    matchHome: body.matchHome || body.home,
    matchAway: body.matchAway || body.away,
    kickoff: body.kickoff || body.timestamp,
    league: body.league,
    stage: body.stage,
    displayName: body.displayName,
    avatar: body.avatar,
  });
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

router.post('/settle', async (_req, res) => {
  try {
    const out = await autoSettle();
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Background settle every 2 minutes so leaderboard stays current
const SETTLE_MS = 2 * 60 * 1000;
let settleTimer = null;
export function startPredictionSettler() {
  if (settleTimer) return;
  // delay first run so server is listening
  setTimeout(() => {
    autoSettle().catch(() => {});
    settleTimer = setInterval(() => {
      autoSettle().catch(() => {});
    }, SETTLE_MS);
  }, 15_000);
}

export default router;
