// ---------------------------------------------------------------------------
// Frontend runtime config + small fetch helpers for the backend REST API.
// ---------------------------------------------------------------------------

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

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
