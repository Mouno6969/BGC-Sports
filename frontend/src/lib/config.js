// ---------------------------------------------------------------------------
// Frontend runtime config + small fetch helpers for the backend REST API.
// ---------------------------------------------------------------------------

import { reportApiError } from './errorTracker.js';

// Absolute backend origin — used only when a full URL is required (e.g. HLS proxy).
// API calls use relative paths so they always hit the same host serving the page.
export const BACKEND_URL = (() => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  if (typeof window === 'undefined') return '';

  const origin = window.location.origin;

  if (origin.includes('5173') || origin.includes('5174')) {
    return origin.replace(/(5173|5174)/, '4000');
  }

  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    const url = new URL(origin);
    url.port = '4000';
    return url.origin;
  }

  return origin;
})();

function apiUrl(path) {
  if (path.startsWith('http')) return path;
  const rel = path.startsWith('/') ? path : `/${path}`;
  // In dev the frontend (5173) and backend (4000) run on different ports and
  // there is no Vite proxy, so prefix the backend origin when it differs.
  // In production (SERVE_FRONTEND=1) BACKEND_URL equals the page origin, so
  // this keeps behaving like a same-origin relative call.
  if (typeof window !== 'undefined' && BACKEND_URL && BACKEND_URL !== window.location.origin) {
    return `${BACKEND_URL}${rel}`;
  }
  return rel;
}

/** GET helper returning parsed JSON. `headers` lets callers add auth. */
export async function apiGet(path, headers = {}) {
  // Never report failures of the error intake endpoint (feedback loop)
  const isErrorIntake = path.startsWith('/api/errors');
  try {
    const res = await fetch(apiUrl(path), { headers });
    if (!res.ok) {
      const err = new Error(`GET ${path} failed: ${res.status}`);
      err.status = res.status;
      if (!isErrorIntake) reportApiError(path, res.status, err, { method: 'GET' });
      throw err;
    }
    return res.json();
  } catch (err) {
    if (!isErrorIntake && err?.status == null) {
      // Network failure
      reportApiError(path, 0, err, { method: 'GET', network: true });
    }
    throw err;
  }
}

/**
 * Hosts that break as raw <img src> (wrong Content-Type / attachment / CORS).
 * Everything else is loaded directly so the browser uses the viewer IP —
 * important for imgur which rate-limits our server (429).
 */
const LOGO_PROXY_HOSTS = [
  'aynaott.com',
  's3.aynaott.com',
  'imglink.cc',
  'i.ibb.co',
  'i.ibb.co.com',
  'ibb.co',
  'postimg.cc',
  'i.postimg.cc',
  'cloudfront.net', // btvlive posters sometimes need proxy
  'btvlive.gov.bd',
  // ESPN team / country crests — more reliable via our origin (hotlink/CDN quirks)
  'espncdn.com',
  'a.espncdn.com',
];

function logoNeedsProxy(url = '') {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return LOGO_PROXY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h));
  } catch {
    return false;
  }
}

/**
 * Returns a displayable logo URL.
 * - Proxies hosts that serve attachment/octet-stream logos
 * - Loads imgur/wikimedia/gstatic/etc. directly (avoids server-side 429/blocks)
 */
export function logoUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (!s.startsWith('http://') && !s.startsWith('https://')) return s;
  if (!logoNeedsProxy(s)) return s;
  return `/api/logo-proxy?url=${encodeURIComponent(s)}`;
}

/** POST helper returning parsed JSON. `headers` lets callers add auth. */
export async function apiPost(path, body, headers = {}) {
  const isErrorIntake = path.startsWith('/api/errors');
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `POST ${path} failed: ${res.status}`);
      err.status = res.status;
      if (!isErrorIntake) reportApiError(path, res.status, err, { method: 'POST' });
      throw err;
    }
    return data;
  } catch (err) {
    if (!isErrorIntake && err?.status == null) {
      reportApiError(path, 0, err, { method: 'POST', network: true });
    }
    throw err;
  }
}
