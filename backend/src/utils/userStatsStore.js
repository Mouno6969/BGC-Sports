// ---------------------------------------------------------------------------
// User stats store — optional server-side backup of watch history / badges.
// Keyed by client userId (same as prediction id). Local client remains source
// of truth; server keeps last-synced snapshot for cross-device restore.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'user-stats.json');

let mem = null;
let writeTimer = null;
let dirty = false;

function empty() {
  return { version: 1, users: {} };
}

function load() {
  if (mem) return mem;
  try {
    if (fs.existsSync(STORE_FILE)) {
      mem = { ...empty(), ...JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) };
      if (!mem.users) mem.users = {};
      return mem;
    }
  } catch (err) {
    console.warn('[user-stats] load failed:', err.message);
  }
  mem = empty();
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
      fs.writeFileSync(tmp, JSON.stringify(mem), 'utf8');
      fs.renameSync(tmp, STORE_FILE);
    } catch (err) {
      console.warn('[user-stats] save failed:', err.message);
      dirty = true;
    }
  }, 500);
}

function sanitizeUserId(id) {
  return String(id || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
}

export function upsertUserStats(payload = {}) {
  const userId = sanitizeUserId(payload.userId);
  if (!userId || userId.length < 8) return { ok: false, error: 'Invalid userId' };

  const store = load();
  const prev = store.users[userId] || {};

  // Prefer higher totals (monotonic merge) so sync never decreases progress
  const totalWatchSec = Math.max(
    Number(prev.totalWatchSec) || 0,
    Number(payload.totalWatchSec) || 0
  );
  const sessionsCount = Math.max(
    Number(prev.sessionsCount) || 0,
    Number(payload.sessionsCount) || 0
  );
  const wcSessions = Math.max(Number(prev.wcSessions) || 0, Number(payload.wcSessions) || 0);

  const badgesUnlocked = {
    ...(prev.badgesUnlocked || {}),
    ...(payload.badgesUnlocked || {}),
  };

  // Merge history by id, newest first
  const byId = new Map();
  for (const h of [...(payload.history || []), ...(prev.history || [])]) {
    if (!h?.id) continue;
    if (!byId.has(h.id)) byId.set(h.id, h);
  }
  const history = [...byId.values()]
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
    .slice(0, 50);

  const favoriteTeams = Array.isArray(payload.favoriteTeams)
    ? payload.favoriteTeams.map((t) => String(t).slice(0, 40)).slice(0, 8)
    : prev.favoriteTeams || [];

  const channelPlays = {
    ...(prev.channelPlays || {}),
    ...(payload.channelPlays || {}),
  };

  store.users[userId] = {
    userId,
    displayName: String(payload.displayName || prev.displayName || 'Guest').slice(0, 24),
    totalWatchSec,
    sessionsCount,
    wcSessions,
    badgesUnlocked,
    history,
    favoriteTeams,
    channelPlays,
    updatedAt: new Date().toISOString(),
  };

  scheduleSave();
  return { ok: true, stats: publicStats(store.users[userId]) };
}

export function getUserStats(userId) {
  const uid = sanitizeUserId(userId);
  const store = load();
  const u = store.users[uid];
  if (!u) return null;
  return publicStats(u);
}

function publicStats(u) {
  return {
    userId: u.userId,
    displayName: u.displayName,
    totalWatchSec: u.totalWatchSec || 0,
    sessionsCount: u.sessionsCount || 0,
    wcSessions: u.wcSessions || 0,
    badgesUnlocked: u.badgesUnlocked || {},
    history: u.history || [],
    favoriteTeams: u.favoriteTeams || [],
    channelPlays: u.channelPlays || {},
    updatedAt: u.updatedAt,
  };
}

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
