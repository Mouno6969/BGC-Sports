// ---------------------------------------------------------------------------
// Active watch session — powers the floating mini-player when the user leaves
// /watch to browse scores, Match Center, or other pages.
// Persists for the tab (sessionStorage) so a refresh still restores context.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bgc-watch-session-v1';
const EVENT = 'bgc:watch-session';

/**
 * @typedef {{
 *   url: string,
 *   name?: string,
 *   logo?: string,
 *   source?: string,
 *   type?: string,
 *   slug?: string,
 *   party?: string,
 *   path?: string,
 *   updatedAt?: number,
 * }} WatchSession
 */

/** @returns {WatchSession|null} */
export function getWatchSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.url) return null;
    return data;
  } catch {
    return null;
  }
}

/** @param {WatchSession|null} session */
export function setWatchSession(session) {
  try {
    if (!session?.url) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      const payload = {
        ...session,
        updatedAt: Date.now(),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    /* ignore quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: session?.url ? session : null }));
  }
}

export function clearWatchSession() {
  setWatchSession(null);
}

/**
 * Subscribe to session changes (same tab + storage from other tabs).
 * @param {(session: WatchSession|null) => void} cb
 * @returns {() => void}
 */
export function onWatchSessionChange(cb) {
  if (typeof window === 'undefined') return () => {};
  const onCustom = (e) => cb(e.detail ?? getWatchSession());
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) cb(getWatchSession());
  };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

/** Build the full /watch path for a session (expand mini-player). */
export function watchPathFromSession(session) {
  if (!session?.url) return '/watch';
  if (session.path && String(session.path).startsWith('/watch')) {
    return session.path;
  }
  if (session.slug) {
    const q = session.party ? `?party=${encodeURIComponent(session.party)}` : '';
    return `/watch/${encodeURIComponent(session.slug)}${q}`;
  }
  const params = new URLSearchParams();
  params.set('url', session.url);
  if (session.name) params.set('name', session.name);
  if (session.logo) params.set('logo', session.logo);
  if (session.source) params.set('source', session.source);
  if (session.type) params.set('type', session.type);
  if (session.party) params.set('party', session.party);
  return `/watch?${params.toString()}`;
}
