// ---------------------------------------------------------------------------
// Prediction store — JSON file persistence for match predictions + leaderboard.
//
// Scoring (classic football predictor):
//   Exact scoreline ............... 5 pts
//   Correct winner / draw only .... 2 pts
//   Wrong ......................... 0 pts
//
// Users are identified by a client-generated id (no accounts required).
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'predictions.json');

const POINTS_EXACT = 5;
const POINTS_RESULT = 2;

const MAX_NAME = 24;
const MAX_AVATAR = 80_000; // compressed data URLs stay small

let mem = null;
let writeTimer = null;
let dirty = false;

function emptyStore() {
  return {
    version: 1,
    users: {}, // userId -> stats
    predictions: {}, // `${userId}::${matchId}` -> prediction
  };
}

function load() {
  if (mem) return mem;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      mem = {
        version: 1,
        users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
        predictions:
          parsed.predictions && typeof parsed.predictions === 'object'
            ? parsed.predictions
            : {},
      };
      return mem;
    }
  } catch (err) {
    console.warn('[predictions] load failed, starting fresh:', err.message);
  }
  mem = emptyStore();
  return mem;
}

function scheduleSave() {
  dirty = true;
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!dirty || !mem) return;
    dirty = false;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${STORE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(mem, null, 0), 'utf8');
      fs.renameSync(tmp, STORE_FILE);
    } catch (err) {
      console.warn('[predictions] save failed:', err.message);
      dirty = true; // retry next time
    }
  }, 400);
}

function predKey(userId, matchId) {
  return `${userId}::${matchId}`;
}

function sanitizeName(name) {
  return String(name || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, MAX_NAME) || 'Guest';
}

function sanitizeAvatar(avatar) {
  const s = String(avatar || '');
  if (!s.startsWith('data:image/')) return '';
  return s.length > MAX_AVATAR ? '' : s;
}

function sanitizeUserId(id) {
  return String(id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
}

function sanitizeMatchId(id) {
  return String(id || '')
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, 80);
}

function scoreInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0 || v > 30) return null;
  return Math.floor(v);
}

/** Winner side from scores: 'home' | 'away' | 'draw' */
export function resultSide(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

/** Points for a prediction vs actual scores. */
export function scorePrediction(predHome, predAway, actualHome, actualAway) {
  if (
    predHome == null ||
    predAway == null ||
    actualHome == null ||
    actualAway == null
  ) {
    return { points: 0, exact: false, correctResult: false };
  }
  const exact = predHome === actualHome && predAway === actualAway;
  if (exact) {
    return { points: POINTS_EXACT, exact: true, correctResult: true };
  }
  const correctResult =
    resultSide(predHome, predAway) === resultSide(actualHome, actualAway);
  return {
    points: correctResult ? POINTS_RESULT : 0,
    exact: false,
    correctResult,
  };
}

function ensureUser(store, userId, profile = {}) {
  if (!store.users[userId]) {
    store.users[userId] = {
      id: userId,
      displayName: sanitizeName(profile.displayName),
      avatar: sanitizeAvatar(profile.avatar),
      points: 0,
      exactScores: 0,
      correctResults: 0, // includes exacts
      totalPredictions: 0,
      settledCount: 0,
      currentStreak: 0,
      bestStreak: 0,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
  } else {
    if (profile.displayName) {
      store.users[userId].displayName = sanitizeName(profile.displayName);
    }
    if (profile.avatar !== undefined) {
      store.users[userId].avatar = sanitizeAvatar(profile.avatar);
    }
  }
  return store.users[userId];
}

function recomputeUserStats(store, userId) {
  const user = store.users[userId];
  if (!user) return;

  let points = 0;
  let exactScores = 0;
  let correctResults = 0;
  let totalPredictions = 0;
  let settledCount = 0;

  // Chronological for streak
  const settled = [];
  for (const p of Object.values(store.predictions)) {
    if (p.userId !== userId) continue;
    totalPredictions += 1;
    if (p.status === 'settled') {
      settledCount += 1;
      points += p.pointsAwarded || 0;
      if (p.exact) exactScores += 1;
      if (p.correctResult) correctResults += 1;
      settled.push(p);
    }
  }

  settled.sort((a, b) => {
    const ta = a.settledAt || a.updatedAt || '';
    const tb = b.settledAt || b.updatedAt || '';
    return ta.localeCompare(tb);
  });

  let currentStreak = 0;
  let bestStreak = 0;
  let run = 0;
  for (const p of settled) {
    if ((p.pointsAwarded || 0) > 0) {
      run += 1;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }
  // current streak = trailing run of scoring predictions
  for (let i = settled.length - 1; i >= 0; i--) {
    if ((settled[i].pointsAwarded || 0) > 0) currentStreak += 1;
    else break;
  }

  user.points = points;
  user.exactScores = exactScores;
  user.correctResults = correctResults;
  user.totalPredictions = totalPredictions;
  user.settledCount = settledCount;
  user.currentStreak = currentStreak;
  user.bestStreak = Math.max(bestStreak, user.bestStreak || 0, currentStreak);
  user.updatedAt = new Date().toISOString();
}

/**
 * Upsert a prediction. Locked once match has kicked off (unless still pending
 * and admin force — not exposed).
 */
export function upsertPrediction({
  userId: rawUserId,
  matchId: rawMatchId,
  homeScore,
  awayScore,
  matchHome,
  matchAway,
  kickoff,
  league,
  stage,
  displayName,
  avatar,
}) {
  const userId = sanitizeUserId(rawUserId);
  const matchId = sanitizeMatchId(rawMatchId);
  if (!userId || userId.length < 8) {
    return { ok: false, error: 'Invalid user id' };
  }
  if (!matchId) return { ok: false, error: 'Invalid match id' };

  const hs = scoreInt(homeScore);
  const as = scoreInt(awayScore);
  if (hs === null || as === null) {
    return { ok: false, error: 'Scores must be numbers 0–30' };
  }

  // Lock after kickoff
  if (kickoff) {
    const t = new Date(kickoff).getTime();
    if (Number.isFinite(t) && t <= Date.now() - 60_000) {
      // 1 min grace for clock skew
      const existing = load().predictions[predKey(userId, matchId)];
      if (!existing || existing.status === 'settled') {
        return { ok: false, error: 'Match has started — predictions are locked' };
      }
      // if they already predicted before kickoff, still block edits after start
      return { ok: false, error: 'Match has started — predictions are locked' };
    }
  }

  const store = load();
  ensureUser(store, userId, { displayName, avatar });

  const key = predKey(userId, matchId);
  const prev = store.predictions[key];
  if (prev?.status === 'settled') {
    return { ok: false, error: 'This prediction is already settled' };
  }

  const now = new Date().toISOString();
  store.predictions[key] = {
    id: key,
    userId,
    matchId,
    homeScore: hs,
    awayScore: as,
    matchHome: String(matchHome || prev?.matchHome || 'Home').slice(0, 80),
    matchAway: String(matchAway || prev?.matchAway || 'Away').slice(0, 80),
    kickoff: kickoff || prev?.kickoff || null,
    league: String(league || prev?.league || '').slice(0, 80),
    stage: String(stage || prev?.stage || '').slice(0, 120),
    status: 'pending',
    pointsAwarded: null,
    exact: null,
    correctResult: null,
    actualHome: null,
    actualAway: null,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    settledAt: null,
  };

  recomputeUserStats(store, userId);
  scheduleSave();
  return { ok: true, prediction: store.predictions[key], user: publicUser(store.users[userId]) };
}

/**
 * Settle pending predictions against finished match results.
 * results: Array<{ matchId, homeScore, awayScore, home?, away?, status? }>
 */
export function settleResults(results = []) {
  const store = load();
  let settled = 0;
  const touchedUsers = new Set();

  for (const r of results) {
    const matchId = sanitizeMatchId(r.matchId);
    const ah = scoreInt(r.homeScore);
    const aa = scoreInt(r.awayScore);
    if (!matchId || ah === null || aa === null) continue;

    for (const [key, p] of Object.entries(store.predictions)) {
      if (p.matchId !== matchId || p.status === 'settled') continue;
      const scored = scorePrediction(p.homeScore, p.awayScore, ah, aa);
      p.status = 'settled';
      p.actualHome = ah;
      p.actualAway = aa;
      p.pointsAwarded = scored.points;
      p.exact = scored.exact;
      p.correctResult = scored.correctResult;
      p.settledAt = new Date().toISOString();
      p.updatedAt = p.settledAt;
      if (r.home) p.matchHome = String(r.home).slice(0, 80);
      if (r.away) p.matchAway = String(r.away).slice(0, 80);
      settled += 1;
      touchedUsers.add(p.userId);
    }
  }

  for (const uid of touchedUsers) recomputeUserStats(store, uid);
  if (settled) scheduleSave();
  return { settled, usersUpdated: touchedUsers.size };
}

export function getUserPredictions(userId) {
  const uid = sanitizeUserId(userId);
  const store = load();
  const list = Object.values(store.predictions)
    .filter((p) => p.userId === uid)
    .sort((a, b) => {
      // pending first, then by kickoff
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return String(a.kickoff || '').localeCompare(String(b.kickoff || ''));
    });
  const user = store.users[uid] ? publicUser(store.users[uid]) : null;
  return { predictions: list, user };
}

export function getPredictionMapForUser(userId) {
  const uid = sanitizeUserId(userId);
  const store = load();
  const map = {};
  for (const p of Object.values(store.predictions)) {
    if (p.userId === uid) map[p.matchId] = p;
  }
  return map;
}

function publicUser(u, rank = null) {
  if (!u) return null;
  return {
    id: u.id,
    displayName: u.displayName,
    avatar: u.avatar ? true : false, // don't send huge avatars on leaderboard list by default
    avatarUrl: u.avatar || '',
    points: u.points || 0,
    exactScores: u.exactScores || 0,
    correctResults: u.correctResults || 0,
    totalPredictions: u.totalPredictions || 0,
    settledCount: u.settledCount || 0,
    currentStreak: u.currentStreak || 0,
    bestStreak: u.bestStreak || 0,
    rank,
  };
}

/**
 * Leaderboard sorted by points, then exact scores, then correct results.
 */
export function getLeaderboard({ limit = 50, userId = null } = {}) {
  const store = load();
  const rows = Object.values(store.users)
    .filter((u) => (u.totalPredictions || 0) > 0 || (u.points || 0) > 0)
    .sort((a, b) => {
      if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
      if ((b.exactScores || 0) !== (a.exactScores || 0)) {
        return (b.exactScores || 0) - (a.exactScores || 0);
      }
      if ((b.correctResults || 0) !== (a.correctResults || 0)) {
        return (b.correctResults || 0) - (a.correctResults || 0);
      }
      return String(a.displayName).localeCompare(String(b.displayName));
    });

  const capped = rows.slice(0, Math.min(limit, 100));
  const leaderboard = capped.map((u, i) => publicUser(u, i + 1));

  // Include full avatar only for top 20 to keep payload light
  for (let i = 0; i < leaderboard.length; i++) {
    if (i < 20 && capped[i].avatar) {
      leaderboard[i].avatarUrl = capped[i].avatar;
    } else {
      leaderboard[i].avatarUrl = '';
    }
  }

  let me = null;
  if (userId) {
    const uid = sanitizeUserId(userId);
    const idx = rows.findIndex((u) => u.id === uid);
    if (idx >= 0) {
      me = publicUser(rows[idx], idx + 1);
      me.avatarUrl = rows[idx].avatar || '';
    } else if (store.users[uid]) {
      me = publicUser(store.users[uid], null);
      me.avatarUrl = store.users[uid].avatar || '';
    }
  }

  return {
    leaderboard,
    me,
    totalPlayers: rows.length,
    scoring: {
      exact: POINTS_EXACT,
      correctResult: POINTS_RESULT,
      wrong: 0,
    },
  };
}

export function getMatchCommunityStats(matchId) {
  const mid = sanitizeMatchId(matchId);
  const store = load();
  const preds = Object.values(store.predictions).filter((p) => p.matchId === mid);
  const scoreCounts = {};
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  for (const p of preds) {
    const key = `${p.homeScore}-${p.awayScore}`;
    scoreCounts[key] = (scoreCounts[key] || 0) + 1;
    const side = resultSide(p.homeScore, p.awayScore);
    if (side === 'home') homeWins += 1;
    else if (side === 'away') awayWins += 1;
    else draws += 1;
  }
  const popular = Object.entries(scoreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([score, count]) => ({ score, count }));
  return {
    matchId: mid,
    total: preds.length,
    homeWins,
    awayWins,
    draws,
    popular,
  };
}

export function getScoringRules() {
  return {
    exact: POINTS_EXACT,
    correctResult: POINTS_RESULT,
    wrong: 0,
    description:
      'Exact scoreline = 5 pts. Correct winner or draw (wrong score) = 2 pts. Wrong = 0.',
  };
}

// Flush on process exit
for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
  process.on(sig, () => {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    if (dirty && mem) {
      try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_FILE, JSON.stringify(mem), 'utf8');
        dirty = false;
      } catch {
        /* ignore */
      }
    }
  });
}
