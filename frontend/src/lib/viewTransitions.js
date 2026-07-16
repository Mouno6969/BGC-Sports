// ---------------------------------------------------------------------------
// View Transitions — shared-element helpers for channel card → player morph.
// Relies on document.startViewTransition (Chrome/Edge/Android; Safari 18+).
// No-ops cleanly where the API is missing.
// ---------------------------------------------------------------------------

/** Fixed name for the card media ↔ player shared element. */
export const CHANNEL_MEDIA_VT = 'channel-media';

const STORAGE_KEY = 'bgc_vt_channel';
const listeners = new Set();

let activeChannelKey = null;

export function supportsViewTransitions() {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function'
  );
}

/** Stable key for a channel (stream URL). */
export function channelTransitionKey(url) {
  return String(url || '').trim();
}

export function getActiveChannelTransition() {
  if (activeChannelKey) return activeChannelKey;
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Mark which channel participates in the shared-element morph.
 * Call on pointerdown/focus of a channel card before navigation.
 */
export function setActiveChannelTransition(url) {
  const key = channelTransitionKey(url);
  activeChannelKey = key || null;
  try {
    if (key) sessionStorage.setItem(STORAGE_KEY, key);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => {
    try {
      fn(activeChannelKey);
    } catch {
      /* ignore */
    }
  });
}

/** Subscribe to active shared-element channel changes (for reverse morph). */
export function onActiveChannelTransition(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isActiveChannelTransition(url) {
  const active = getActiveChannelTransition();
  if (!active) return false;
  return active === channelTransitionKey(url);
}

/**
 * Inline style for the shared media element.
 * Only one node in the document should enable this at a time (aside from
 * the brief old/new pair during a view transition).
 */
export function channelMediaVtStyle(enabled) {
  if (!enabled || !supportsViewTransitions()) return undefined;
  // Prefer reduced motion: skip naming so we don't morph, only soft fade root.
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
  } catch {
    /* continue */
  }
  return { viewTransitionName: CHANNEL_MEDIA_VT };
}

/** Warm the WatchPage chunk so the player is in the DOM for the new snapshot. */
export function preloadWatchPage() {
  return import('../pages/WatchPage.jsx');
}

/**
 * Arm a card → player shared transition: record the channel key, optionally
 * set view-transition-name on a media node, and preload the watch chunk.
 */
export function armChannelMediaTransition(url, mediaEl) {
  setActiveChannelTransition(url);
  if (mediaEl && supportsViewTransitions()) {
    try {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        mediaEl.style.viewTransitionName = CHANNEL_MEDIA_VT;
      }
    } catch {
      /* ignore */
    }
  }
  preloadWatchPage();
}
