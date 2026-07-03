// ---------------------------------------------------------------------------
// Frontend runtime config + small fetch helpers for the backend REST API.
// ---------------------------------------------------------------------------

// Determine backend URL based on environment
// Priority: 1. VITE_BACKEND_URL env var (production), 2. Port rewrite for dev, 3. Same origin
export const BACKEND_URL = (() => {
  // If explicitly set via environment variable, use it
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  const origin = window.location.origin;
  
  // For Vite dev server (port 5173/5174), rewrite to backend port 4000
  if (origin.includes('5173') || origin.includes('5174')) {
    return origin.replace(/(5173|5174)/, '4000');
  }
  
  // For localhost, assume backend is on port 4000
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    const url = new URL(origin);
    url.port = '4000';
    return url.origin;
  }
  
  // For production/remote, assume backend is on same origin
  // (typically behind a reverse proxy on the same domain)
  return origin;
})();

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
