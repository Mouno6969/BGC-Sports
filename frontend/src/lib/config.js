// ---------------------------------------------------------------------------
// Frontend runtime config + small fetch helpers for the backend REST API.
// ---------------------------------------------------------------------------

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
  const res = await fetch(apiUrl(path), { headers });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * Returns a proxied URL for a channel logo image.
 * Routes through the backend proxy to fix Content-Disposition: attachment issues
 * (e.g. s3.aynaott.com returns images as file downloads instead of displayable images).
 */
export function logoUrl(url) {
  if (!url || !url.startsWith('http')) return url;
  return `/api/logo-proxy?url=${encodeURIComponent(url)}`;
}

/** POST helper returning parsed JSON. `headers` lets callers add auth. */
export async function apiPost(path, body, headers = {}) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `POST ${path} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
