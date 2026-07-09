// ---------------------------------------------------------------------------
// roomSession — per-tab storage of the private-room resume credentials.
//
// When the server puts a member into a room it hands back a `sessionToken`.
// If the socket briefly drops (common on mobile), the server holds the slot
// for a grace period; the client presents `{ code, sessionToken }` via
// `proom:resume` on reconnect to reclaim it.
//
// sessionStorage is deliberately used instead of localStorage:
//   - it is per-tab, so two tabs in different rooms never clobber each other
//   - it survives transient disconnects and page reloads within the tab
//   - it disappears when the tab closes (matching the room's lifetime)
//
// `scope` separates the two room UIs ('privateRoom' | 'watchParty') so each
// keeps its own resume credentials.
// ---------------------------------------------------------------------------

// Sanity cap: sessions older than this are ignored (server grace is 30s, so
// anything this stale can never resume; keeps stray reload loops clean).
const MAX_SESSION_AGE_MS = 10 * 60 * 1000;

function storageKey(scope) {
  return `bgc:roomSession:${scope || 'privateRoom'}`;
}

/** Persist the resume credentials for the current room. */
export function saveRoomSession(scope, { code, sessionToken }) {
  if (!code || !sessionToken) return;
  try {
    sessionStorage.setItem(
      storageKey(scope),
      JSON.stringify({ code, sessionToken, savedAt: Date.now() })
    );
  } catch (_) {
    // Storage unavailable (private mode/quota) — resume just won't work.
  }
}

/**
 * Read the stored resume credentials, or null if absent/invalid/stale.
 * @returns {{code: string, sessionToken: string}|null}
 */
export function getRoomSession(scope) {
  try {
    const raw = sessionStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.code || !parsed.sessionToken) return null;
    if (Date.now() - (parsed.savedAt || 0) > MAX_SESSION_AGE_MS) {
      clearRoomSession(scope);
      return null;
    }
    return { code: parsed.code, sessionToken: parsed.sessionToken };
  } catch (_) {
    return null;
  }
}

/** Drop the stored credentials (deliberate leave, kick, or failed resume). */
export function clearRoomSession(scope) {
  try {
    sessionStorage.removeItem(storageKey(scope));
  } catch (_) {
    // ignore
  }
}
