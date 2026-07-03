// ---------------------------------------------------------------------------
// Frontend runtime config + small fetch helpers for the backend REST API.
// ---------------------------------------------------------------------------

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || (window.location.origin.includes('5174') ? window.location.origin.replace('5174', '4000') : 'http://localhost:4000');

/** GET helper returning parsed JSON. `headers` lets callers add auth. */
export async function apiGet(path, headers = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, { headers });
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
  return `${BACKEND_URL}/api/logo-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Resolves a stream/playback URL to an absolute one the player can load.
 * Toffee channels are served as a relative backend proxy path
 * (e.g. "/api/toffee-proxy?url=..."); those must be prefixed with BACKEND_URL
 * so hls.js hits the backend (which injects the required headers) instead of
 * the frontend origin. Absolute http(s) URLs are returned unchanged.
 */
export function streamUrl(url) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${BACKEND_URL}${url}`;
  return url;
}

/** POST helper returning parsed JSON. `headers` lets callers add auth. */
export async function apiPost(path, body, headers = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
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
