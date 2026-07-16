// ---------------------------------------------------------------------------
// Watch stats — history, favorites, total watch time, and badges.
// Local-first (localStorage) with optional backend sync via userId.
// ---------------------------------------------------------------------------

import { getPredictorId, getEffectiveName } from './profile.js';

const STORE_KEY = 'bgc_watch_stats_v1';
const FAV_KEY = 'bgc_favorite_teams';
const EVENT = 'bgc:watch-stats-updated';

const MAX_HISTORY = 80;
const MIN_SESSION_SEC = 15; // ignore accidental opens under 15s

// Popular World Cup / national teams for favorites picker
export const FAVORITE_TEAM_OPTIONS = [
  'Argentina', 'France', 'Brazil', 'England', 'Spain', 'Germany', 'Portugal',
  'Netherlands', 'Belgium', 'Uruguay', 'Croatia', 'Morocco', 'USA', 'Mexico',
  'Canada', 'Japan', 'South Korea', 'Senegal', 'Colombia', 'Switzerland',
  'Austria', 'Norway', 'Australia', 'Ghana', 'Ecuador', 'Iran', 'Saudi Arabia',
  'Qatar', 'Scotland', 'Paraguay', 'Ivory Coast', 'Egypt',
];

// ---------------------------------------------------------------------------
// Badge catalog — order is display order
// ---------------------------------------------------------------------------
export const BADGE_DEFS = [
  {
    id: 'first_stream',
    name: 'First Stream',
    description: 'Watched your first channel',
    icon: '🎬',
    check: (s) => s.sessionsCount >= 1,
  },
  {
    id: 'wc_fan',
    name: 'World Cup Fan',
    description: 'Watched a World Cup channel',
    icon: '🏆',
    check: (s) => s.wcSessions >= 1,
  },
  {
    id: 'wc_10',
    name: 'Match Day Regular',
    description: 'Watched 10 World Cup sessions',
    icon: '⚽',
    check: (s) => s.wcSessions >= 10,
  },
  {
    id: 'wc_25',
    name: 'Tournament Die-Hard',
    description: 'Watched 25 World Cup sessions',
    icon: '🏟️',
    check: (s) => s.wcSessions >= 25,
  },
  {
    id: 'hour_1',
    name: 'Warming Up',
    description: '1 hour total watch time',
    icon: '⏱️',
    check: (s) => s.totalWatchSec >= 3600,
  },
  {
    id: 'hour_5',
    name: 'Couch Critic',
    description: '5 hours total watch time',
    icon: '🛋️',
    check: (s) => s.totalWatchSec >= 5 * 3600,
  },
  {
    id: 'hour_20',
    name: 'Marathon Viewer',
    description: '20 hours total watch time',
    icon: '🏅',
    check: (s) => s.totalWatchSec >= 20 * 3600,
  },
  {
    id: 'channels_5',
    name: 'Channel Surfer',
    description: 'Watched 5 different channels',
    icon: '📺',
    check: (s) => s.uniqueChannels >= 5,
  },
  {
    id: 'channels_15',
    name: 'Channel Hopper',
    description: 'Watched 15 different channels',
    icon: '📡',
    check: (s) => s.uniqueChannels >= 15,
  },
  {
    id: 'streak_3',
    name: '3-Day Streak',
    description: 'Watched on 3 different days',
    icon: '🔥',
    check: (s) => s.uniqueDays >= 3,
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Watched on 7 different days',
    icon: '💪',
    check: (s) => s.uniqueDays >= 7,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Watched after midnight local time',
    icon: '🦉',
    check: (s) => s.nightSessions >= 1,
  },
  {
    id: 'party_goer',
    name: 'Party Goer',
    description: 'Opened a Watch Together invite',
    icon: '🎉',
    check: (s) => s.partyJoins >= 1,
  },
  {
    id: 'predictor',
    name: 'Tipster',
    description: 'Submitted a match prediction',
    icon: '🎯',
    check: (s) => s.predictionsMade >= 1,
  },
  {
    id: 'loyal',
    name: 'Home Fan',
    description: 'Replayed the same channel 5 times',
    icon: '💚',
    check: (s) => s.maxChannelPlays >= 5,
  },
];

function emptyStore() {
  return {
    version: 1,
    totalWatchSec: 0,
    sessionsCount: 0,
    wcSessions: 0,
    nightSessions: 0,
    partyJoins: 0,
    predictionsMade: 0,
    history: [], // newest first
    channelPlays: {}, // name -> count
    dayKeys: {}, // YYYY-MM-DD -> true
    badgesUnlocked: {}, // id -> iso timestamp
    activeSession: null,
    updatedAt: null,
  };
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    const p = JSON.parse(raw);
    return { ...emptyStore(), ...p, history: Array.isArray(p.history) ? p.history : [] };
  } catch {
    return emptyStore();
  }
}

function saveRaw(store) {
  store.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // quota — drop oldest history and retry
    try {
      store.history = (store.history || []).slice(0, 40);
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* give up */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: summarize(store) }));
  } catch {
    /* ignore */
  }
  return store;
}

export function isWorldCupChannel({ name, source, group, tags } = {}) {
  const blob = `${name || ''} ${source || ''} ${group || ''} ${(tags || []).join(' ')}`.toLowerCase();
  return (
    blob.includes('world cup') ||
    blob.includes('fifa') ||
    source === 'fifa' ||
    /wc-?\d|worldcup/.test(blob)
  );
}

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isNightHour(ts = Date.now()) {
  const h = new Date(ts).getHours();
  return h >= 0 && h < 5;
}

/**
 * Derive aggregate stats from store for badge checks.
 */
export function computeAggregates(store) {
  const channelPlays = store.channelPlays || {};
  const uniqueChannels = Object.keys(channelPlays).length;
  let maxChannelPlays = 0;
  for (const n of Object.values(channelPlays)) {
    if (n > maxChannelPlays) maxChannelPlays = n;
  }
  return {
    totalWatchSec: store.totalWatchSec || 0,
    sessionsCount: store.sessionsCount || 0,
    wcSessions: store.wcSessions || 0,
    nightSessions: store.nightSessions || 0,
    partyJoins: store.partyJoins || 0,
    predictionsMade: store.predictionsMade || 0,
    uniqueChannels,
    uniqueDays: Object.keys(store.dayKeys || {}).length,
    maxChannelPlays,
  };
}

function unlockBadges(store) {
  const agg = computeAggregates(store);
  const unlocked = { ...(store.badgesUnlocked || {}) };
  let changed = false;
  const newly = [];
  for (const b of BADGE_DEFS) {
    if (unlocked[b.id]) continue;
    try {
      if (b.check(agg)) {
        unlocked[b.id] = new Date().toISOString();
        changed = true;
        newly.push(b);
      }
    } catch {
      /* ignore badge errors */
    }
  }
  store.badgesUnlocked = unlocked;
  return { store, newly, changed };
}

export function evaluateBadges() {
  const store = loadRaw();
  const { store: next, newly, changed } = unlockBadges(store);
  if (changed) saveRaw(next);
  return newly;
}

/**
 * Start a watch session for a channel. Ends any previous active session.
 */
export function startWatchSession(channel = {}) {
  const store = loadRaw();
  // Close previous if any
  if (store.activeSession) {
    finalizeActive(store, Date.now());
  }

  const now = Date.now();
  store.activeSession = {
    id: `ws_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    channelName: String(channel.name || 'Live Stream').slice(0, 80),
    channelUrl: String(channel.url || '').slice(0, 500),
    logo: String(channel.logo || '').slice(0, 500),
    source: String(channel.source || '').slice(0, 40),
    slug: String(channel.slug || '').slice(0, 80),
    group: String(channel.group || '').slice(0, 60),
    isWorldCup: isWorldCupChannel(channel),
    startedAt: now,
    lastHeartbeat: now,
    accumulatedSec: 0,
  };
  saveRaw(store);
  return store.activeSession;
}

/**
 * Heartbeat while watching (call every ~20–30s while page visible / playing).
 */
export function heartbeatWatchSession(deltaSec = 30) {
  const store = loadRaw();
  if (!store.activeSession) return null;
  const d = Math.max(0, Math.min(120, Math.floor(deltaSec)));
  store.activeSession.accumulatedSec = (store.activeSession.accumulatedSec || 0) + d;
  store.activeSession.lastHeartbeat = Date.now();
  // Live total for UI
  store.totalWatchSec = (store.totalWatchSec || 0) + d;
  saveRaw(store);
  return store.activeSession;
}

function finalizeActive(store, endedAt) {
  const s = store.activeSession;
  if (!s) return;
  store.activeSession = null;

  // Prefer heartbeat accumulators; fall back to wall-clock if the tab closed
  // before the first heartbeat fired.
  let sec = s.accumulatedSec || 0;
  if (sec < MIN_SESSION_SEC) {
    const wall = Math.floor((endedAt - s.startedAt) / 1000);
    if (sec === 0 && wall >= MIN_SESSION_SEC) {
      sec = Math.min(wall, 900);
      store.totalWatchSec = (store.totalWatchSec || 0) + sec;
    } else {
      // Session too short — refund any partial heartbeats
      if (s.accumulatedSec) {
        store.totalWatchSec = Math.max(0, (store.totalWatchSec || 0) - s.accumulatedSec);
      }
      return;
    }
  }
  // When sec came from heartbeats, totalWatchSec already includes them.

  store.sessionsCount = (store.sessionsCount || 0) + 1;
  if (s.isWorldCup) store.wcSessions = (store.wcSessions || 0) + 1;
  if (isNightHour(s.startedAt)) store.nightSessions = (store.nightSessions || 0) + 1;

  const name = s.channelName || 'Live';
  store.channelPlays = store.channelPlays || {};
  store.channelPlays[name] = (store.channelPlays[name] || 0) + 1;
  store.dayKeys = store.dayKeys || {};
  store.dayKeys[dayKey(s.startedAt)] = true;

  const entry = {
    id: s.id,
    channelName: name,
    channelUrl: s.channelUrl,
    logo: s.logo,
    source: s.source,
    slug: s.slug,
    isWorldCup: Boolean(s.isWorldCup),
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationSec: sec,
  };
  store.history = [entry, ...(store.history || [])].slice(0, MAX_HISTORY);
}

/**
 * End the current watch session and record history.
 */
export function endWatchSession() {
  const store = loadRaw();
  if (!store.activeSession) return { newly: [] };
  finalizeActive(store, Date.now());
  const { store: next, newly } = unlockBadges(store);
  saveRaw(next);
  return { newly };
}

export function markPartyJoin() {
  const store = loadRaw();
  store.partyJoins = (store.partyJoins || 0) + 1;
  const { store: next, newly } = unlockBadges(store);
  saveRaw(next);
  return newly;
}

export function markPredictionMade() {
  const store = loadRaw();
  store.predictionsMade = (store.predictionsMade || 0) + 1;
  const { store: next, newly } = unlockBadges(store);
  saveRaw(next);
  return newly;
}

export function getFavoriteTeams() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function setFavoriteTeams(teams) {
  const clean = [...new Set((teams || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 8);
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(clean));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: getWatchSummary() }));
  } catch {
    /* ignore */
  }
  return clean;
}

export function toggleFavoriteTeam(team) {
  const t = String(team || '').trim();
  if (!t) return getFavoriteTeams();
  const cur = getFavoriteTeams();
  if (cur.includes(t)) return setFavoriteTeams(cur.filter((x) => x !== t));
  if (cur.length >= 8) return cur;
  return setFavoriteTeams([...cur, t]);
}

export function formatWatchTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return `${s}s`;
}

function summarize(store) {
  const agg = computeAggregates(store);
  const badges = BADGE_DEFS.map((b) => ({
    ...b,
    unlocked: Boolean(store.badgesUnlocked?.[b.id]),
    unlockedAt: store.badgesUnlocked?.[b.id] || null,
  }));
  return {
    ...agg,
    history: store.history || [],
    badges,
    unlockedCount: badges.filter((b) => b.unlocked).length,
    totalBadges: badges.length,
    favoriteTeams: getFavoriteTeams(),
    activeSession: store.activeSession
      ? {
          channelName: store.activeSession.channelName,
          startedAt: store.activeSession.startedAt,
        }
      : null,
    userId: getPredictorId(),
    displayName: getEffectiveName(),
  };
}

export function getWatchSummary() {
  return summarize(loadRaw());
}

export function getWatchHistory(limit = 30) {
  return (loadRaw().history || []).slice(0, limit);
}

export function onWatchStatsChange(handler) {
  const fn = (e) => handler(e.detail || getWatchSummary());
  window.addEventListener(EVENT, fn);
  const storage = (e) => {
    if (e.key === STORE_KEY || e.key === FAV_KEY) handler(getWatchSummary());
  };
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', storage);
  };
}

/**
 * Payload for backend sync (no huge logos in bulk).
 */
export function buildSyncPayload() {
  const store = loadRaw();
  return {
    userId: getPredictorId(),
    displayName: getEffectiveName(),
    totalWatchSec: store.totalWatchSec || 0,
    sessionsCount: store.sessionsCount || 0,
    wcSessions: store.wcSessions || 0,
    favoriteTeams: getFavoriteTeams(),
    badgesUnlocked: store.badgesUnlocked || {},
    history: (store.history || []).slice(0, 30).map((h) => ({
      id: h.id,
      channelName: h.channelName,
      durationSec: h.durationSec,
      startedAt: h.startedAt,
      isWorldCup: h.isWorldCup,
      slug: h.slug,
      source: h.source,
    })),
    channelPlays: store.channelPlays || {},
    updatedAt: store.updatedAt,
  };
}
