// ---------------------------------------------------------------------------
// Frontend runtime config + small fetch helpers for the backend REST API.
// ---------------------------------------------------------------------------

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

/** GET helper returning parsed JSON. */
export async function apiGet(path) {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
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
