// ---------------------------------------------------------------------------
// Client error intake — receives browser-side error reports (JS crashes,
// failed API calls, stream load failures) and keeps a ring buffer for
// inspection. Logs every event so PM2/cloud logs stay the source of truth.
//
// POST /api/errors          — public (rate-limited), body: { events: [...] }
// GET  /api/errors          — admin only (x-admin-password)
// GET  /api/errors/stats    — admin only
// ---------------------------------------------------------------------------
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAdmin } from './admin.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'client-errors.jsonl');

const MAX_BUFFER = 300;
const MAX_EVENTS_PER_REQ = 25;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

// Ring buffer (newest first)
const buffer = [];

// Simple IP rate limit: max N posts per window
const rate = new Map(); // ip -> { count, reset }
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60_000;

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function allow(ip) {
  const now = Date.now();
  let entry = rate.get(ip);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + RATE_WINDOW_MS };
    rate.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT;
}

function truncate(str, max) {
  if (str == null) return '';
  const s = String(str);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function sanitizeEvent(raw, meta) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = truncate(raw.kind || 'error', 40) || 'error';
  const level = ['error', 'warning', 'info', 'fatal'].includes(raw.level)
    ? raw.level
    : 'error';

  return {
    id: `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    receivedAt: new Date().toISOString(),
    kind,
    level,
    message: truncate(raw.message || 'Unknown error', MAX_MESSAGE),
    stack: truncate(raw.stack || '', MAX_STACK),
    source: truncate(raw.source || '', 80),
    name: truncate(raw.name || '', 80),
    status: typeof raw.status === 'number' ? raw.status : null,
    fingerprint: truncate(raw.fingerprint || '', 200),
    sessionId: truncate(raw.sessionId || '', 80),
    release: truncate(raw.release || '', 40),
    env: truncate(raw.env || '', 20),
    ts: truncate(raw.ts || '', 40),
    extra: raw.extra && typeof raw.extra === 'object' ? raw.extra : {},
    context: raw.context && typeof raw.context === 'object' ? raw.context : {},
    breadcrumbs: Array.isArray(raw.breadcrumbs) ? raw.breadcrumbs.slice(-15) : [],
    ip: meta.ip,
    userAgent: truncate(meta.userAgent || '', 240),
  };
}

function pushEvent(ev) {
  buffer.unshift(ev);
  if (buffer.length > MAX_BUFFER) buffer.length = MAX_BUFFER;

  // Structured log for PM2
  const short = {
    kind: ev.kind,
    level: ev.level,
    message: ev.message,
    source: ev.source,
    path: ev.context?.path,
    status: ev.status,
    sessionId: ev.sessionId,
    stream: ev.extra?.channelName || ev.extra?.streamUrl || undefined,
  };
  console.error(`[client-error] ${JSON.stringify(short)}`);

  // Append to JSONL (best-effort, never throw)
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(ev)}\n`, 'utf8');
  } catch (err) {
    // Only log once-ish failures
    if (!pushEvent._fsWarned) {
      pushEvent._fsWarned = true;
      console.warn('[client-error] file log disabled:', err.message);
    }
  }
}

// POST /api/errors — browser intake
router.post('/', (req, res) => {
  const ip = clientIp(req);
  if (!allow(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }

  const body = req.body || {};
  let events = [];
  if (Array.isArray(body.events)) events = body.events;
  else if (body.message || body.kind) events = [body];

  events = events.slice(0, MAX_EVENTS_PER_REQ);
  if (!events.length) {
    return res.status(400).json({ ok: false, error: 'no_events' });
  }

  const meta = {
    ip,
    userAgent: req.headers['user-agent'] || '',
  };

  let accepted = 0;
  for (const raw of events) {
    const ev = sanitizeEvent(raw, meta);
    if (!ev) continue;
    pushEvent(ev);
    accepted += 1;
  }

  res.status(202).json({ ok: true, accepted });
});

// GET /api/errors — admin list (newest first)
router.get('/', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, MAX_BUFFER);
  const kind = (req.query.kind || '').toString().toLowerCase();
  let rows = buffer;
  if (kind) rows = rows.filter((e) => e.kind === kind);
  res.json({
    ok: true,
    total: buffer.length,
    count: Math.min(limit, rows.length),
    events: rows.slice(0, limit),
  });
});

// GET /api/errors/stats — admin summary
router.get('/stats', requireAdmin, (_req, res) => {
  const byKind = {};
  const byLevel = {};
  for (const e of buffer) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    byLevel[e.level] = (byLevel[e.level] || 0) + 1;
  }
  res.json({
    ok: true,
    buffered: buffer.length,
    byKind,
    byLevel,
    logFile: LOG_FILE,
  });
});

export default router;
