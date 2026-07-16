// ---------------------------------------------------------------------------
// Client error tracker — production visibility for JS crashes, failed API
// calls, and stream load failures.
//
// Dual sink:
//   1) Always POSTs to our backend /api/errors (works with zero config)
//   2) Optionally forwards to Sentry free tier when VITE_SENTRY_DSN is set
//
// Usage:
//   import { initErrorTracker, reportError, reportApiError, reportStreamError } from './errorTracker.js';
//   initErrorTracker(); // once at boot
// ---------------------------------------------------------------------------

const DSN = (import.meta.env.VITE_SENTRY_DSN || '').trim();
const ENABLED =
  import.meta.env.VITE_ERROR_REPORTING !== '0' &&
  (import.meta.env.PROD || import.meta.env.VITE_ERROR_REPORTING === '1');

const MAX_QUEUE = 20;
const DEDUPE_MS = 30_000;
const FLUSH_MS = 2_000;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

let sessionId = '';
let sentry = null;
let installed = false;
let queue = [];
let flushTimer = null;
const recentFingerprints = new Map(); // fingerprint -> ts
const breadcrumbs = [];
const MAX_BREADCRUMBS = 30;

function nowIso() {
  return new Date().toISOString();
}

function makeSessionId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function truncate(str, max) {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function safeUrl(href) {
  try {
    const u = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    // Drop query/hash that may contain tokens
    return `${u.origin}${u.pathname}`;
  } catch {
    return truncate(href, 200);
  }
}

function fingerprint(payload) {
  return [
    payload.kind || 'error',
    payload.message || '',
    payload.source || '',
    (payload.stack || '').split('\n')[0] || '',
  ].join('|').slice(0, 300);
}

function isDuplicate(fp) {
  const last = recentFingerprints.get(fp);
  const t = Date.now();
  if (last && t - last < DEDUPE_MS) return true;
  recentFingerprints.set(fp, t);
  // prune
  if (recentFingerprints.size > 100) {
    for (const [k, v] of recentFingerprints) {
      if (t - v > DEDUPE_MS) recentFingerprints.delete(k);
    }
  }
  return false;
}

function baseContext() {
  if (typeof window === 'undefined') return {};
  return {
    url: safeUrl(window.location.href),
    path: window.location.pathname + window.location.search,
    referrer: document.referrer ? safeUrl(document.referrer) : '',
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return '';
      }
    })(),
  };
}

export function addBreadcrumb(category, message, data = {}) {
  breadcrumbs.push({
    ts: nowIso(),
    category: truncate(category, 40),
    message: truncate(message, 160),
    data: typeof data === 'object' && data ? data : {},
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
  try {
    sentry?.addBreadcrumb?.({
      category: String(category || 'app'),
      message: String(message || ''),
      data,
      level: 'info',
    });
  } catch { /* ignore */ }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue();
  }, FLUSH_MS);
}

async function flushQueue() {
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_QUEUE);
  // Never report failures of the reporter itself into the queue again
  try {
    const body = JSON.stringify({ events: batch });
    // sendBeacon is preferred on unload; fetch otherwise
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/errors', blob);
      if (ok) return;
    }
    await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // Drop on failure — avoid retry storms
  }
}

/**
 * Core reporter. Safe to call from anywhere; no-ops when disabled.
 * @param {object} event
 */
export function reportError(event = {}) {
  if (!ENABLED && !DSN) {
    // Still log in dev so developers see it
    if (import.meta.env.DEV) {
      console.warn('[errorTracker]', event.kind || 'error', event.message, event);
    }
    return;
  }

  const payload = {
    kind: event.kind || 'error',
    level: event.level || 'error',
    message: truncate(event.message || 'Unknown error', MAX_MESSAGE),
    stack: truncate(event.stack || '', MAX_STACK),
    source: truncate(event.source || '', 120),
    name: truncate(event.name || '', 80),
    status: event.status ?? null,
    extra: event.extra && typeof event.extra === 'object' ? event.extra : {},
    sessionId,
    ts: nowIso(),
    release: import.meta.env.VITE_APP_VERSION || import.meta.env.MODE || 'web',
    env: import.meta.env.MODE || 'production',
    breadcrumbs: breadcrumbs.slice(-15),
    context: baseContext(),
  };

  const fp = fingerprint(payload);
  if (isDuplicate(fp)) return;
  payload.fingerprint = fp;

  // Sentry (optional free tier)
  if (sentry) {
    try {
      if (event.error instanceof Error) {
        sentry.captureException(event.error, {
          tags: {
            kind: payload.kind,
            source: payload.source || 'client',
          },
          extra: payload.extra,
          level: payload.level,
        });
      } else {
        sentry.captureMessage(payload.message, {
          level: payload.level,
          tags: {
            kind: payload.kind,
            source: payload.source || 'client',
          },
          extra: { ...payload.extra, stack: payload.stack },
        });
      }
    } catch { /* ignore */ }
  }

  if (!ENABLED) return;

  queue.push(payload);
  if (queue.length >= MAX_QUEUE) {
    flushQueue();
  } else {
    scheduleFlush();
  }
}

export function reportApiError(path, status, err, extra = {}) {
  reportError({
    kind: 'api',
    level: status >= 500 || status === 0 ? 'error' : 'warning',
    message: err?.message || `API failed: ${path} (${status})`,
    stack: err?.stack || '',
    name: err?.name || 'ApiError',
    source: 'api',
    status,
    error: err instanceof Error ? err : undefined,
    extra: {
      path: truncate(path, 200),
      ...extra,
    },
  });
  addBreadcrumb('api', `fail ${status} ${path}`, { status });
}

export function reportStreamError({
  message,
  url,
  channelId,
  channelName,
  details,
  type,
  fatal = true,
  error,
} = {}) {
  reportError({
    kind: 'stream',
    level: fatal ? 'error' : 'warning',
    message: message || 'Stream load failure',
    stack: error?.stack || (typeof details === 'string' ? details : ''),
    name: error?.name || 'StreamError',
    source: 'stream',
    error: error instanceof Error ? error : undefined,
    extra: {
      streamUrl: url ? safeUrl(url) : '',
      channelId: channelId || null,
      channelName: channelName || null,
      hlsType: type || null,
      details: details && typeof details === 'object'
        ? {
            type: details.type,
            details: details.details,
            fatal: details.fatal,
            code: details.response?.code,
            url: details.url ? safeUrl(details.url) : undefined,
          }
        : details || null,
    },
  });
  addBreadcrumb('stream', message || 'stream error', {
    channelName: channelName || '',
  });
}

/**
 * Initialize global handlers + optional Sentry. Call once from main.jsx.
 */
export async function initErrorTracker() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  sessionId = makeSessionId();

  // Optional Sentry free tier
  if (DSN) {
    try {
      const Sentry = await import('@sentry/react');
      Sentry.init({
        dsn: DSN,
        environment: import.meta.env.MODE || 'production',
        release: import.meta.env.VITE_APP_VERSION || undefined,
        integrations: [
          Sentry.browserTracingIntegration?.(),
          Sentry.replayIntegration?.({
            maskAllText: true,
            blockAllMedia: true,
          }),
        ].filter(Boolean),
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0.5,
        // Avoid capturing our own reporter noise
        beforeSend(event) {
          const msg = event?.message || event?.exception?.values?.[0]?.value || '';
          if (String(msg).includes('/api/errors')) return null;
          return event;
        },
      });
      sentry = Sentry;
    } catch (err) {
      console.warn('[errorTracker] Sentry init failed:', err?.message || err);
    }
  }

  if (!ENABLED && !DSN) return;

  window.addEventListener('error', (ev) => {
    // Resource load errors (img/script) have no error object
    if (ev.target && ev.target !== window) {
      const tag = ev.target.tagName || 'resource';
      const src = ev.target.src || ev.target.href || '';
      // Ignore image/logo noise — only scripts/media matter
      if (tag === 'IMG' || tag === 'LINK') return;
      reportError({
        kind: 'resource',
        level: 'warning',
        message: `Resource failed: ${tag}`,
        source: 'resource',
        extra: { tag, src: safeUrl(src) },
      });
      return;
    }
    reportError({
      kind: 'js',
      level: 'error',
      message: ev.message || 'Uncaught error',
      stack: ev.error?.stack || '',
      name: ev.error?.name || 'Error',
      source: 'window.onerror',
      error: ev.error instanceof Error ? ev.error : undefined,
      extra: {
        filename: ev.filename ? safeUrl(ev.filename) : '',
        lineno: ev.lineno,
        colno: ev.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';
    reportError({
      kind: 'promise',
      level: 'error',
      message,
      stack: reason instanceof Error ? reason.stack : '',
      name: reason instanceof Error ? reason.name : 'UnhandledRejection',
      source: 'unhandledrejection',
      error: reason instanceof Error ? reason : undefined,
    });
  });

  // Flush on page hide so pending events are not lost
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushQueue();
  });
  window.addEventListener('pagehide', () => flushQueue());

  addBreadcrumb('lifecycle', 'error tracker ready', {
    sentry: Boolean(DSN),
    sessionId,
  });
}

/** React ErrorBoundary helper */
export function reportReactError(error, info) {
  reportError({
    kind: 'react',
    level: 'error',
    message: error?.message || 'React render error',
    stack: error?.stack || '',
    name: error?.name || 'ReactError',
    source: 'react',
    error: error instanceof Error ? error : undefined,
    extra: {
      componentStack: truncate(info?.componentStack || '', 2000),
    },
  });
}

export function getErrorTrackerMeta() {
  return {
    enabled: ENABLED || Boolean(DSN),
    sentry: Boolean(DSN),
    sessionId,
  };
}
