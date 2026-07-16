// ---------------------------------------------------------------------------
// Small UI utilities.
// ---------------------------------------------------------------------------

import { saveProfile } from './profile.js';

/** Format a unix-ms timestamp as HH:MM (local timezone of the visitor). */
export function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Detect the visitor's IANA timezone (e.g. "Asia/Dhaka", "America/New_York").
 * Falls back to "UTC" if the environment cannot report one.
 */
export function getUserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Short timezone label for the visitor, e.g. "BST", "EDT", "GMT+6".
 */
export function getUserTimeZoneAbbr(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'short',
    }).formatToParts(date instanceof Date ? date : new Date(date));
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

/**
 * Format a match kickoff in the visitor's real local timezone/country.
 * Accepts match.timestamp (ISO-8601 UTC preferred) or match.date + match.time.
 *
 * @param {object} match
 * @param {{ style?: 'short'|'medium'|'full', withTz?: boolean }} opts
 * @returns {string}
 */
export function formatKickoff(match, opts = {}) {
  const { style = 'short', withTz = true } = opts;
  if (!match) return 'Scheduled';

  let d = null;
  if (match.timestamp) {
    d = new Date(match.timestamp);
  } else if (match.date) {
    const t =
      match.time && match.time !== '00:00:00'
        ? String(match.time).length === 5
          ? `${match.time}:00`
          : match.time
        : '12:00:00';
    // Treat bare date+time as UTC if no offset present
    d = new Date(`${match.date}T${t}${/Z|[+-]\d{2}:?\d{2}$/.test(t) ? '' : 'Z'}`);
  }

  if (!d || Number.isNaN(d.getTime())) return 'Scheduled';

  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dayDiff = Math.round((startOf(d) - startOf(now)) / 86400000);

  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const tz = withTz ? getUserTimeZoneAbbr(d) : '';
  const tzSuffix = tz ? ` ${tz}` : '';

  if (style === 'full') {
    const datePart = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
    return `${datePart} · ${time}${tzSuffix}`;
  }

  if (style === 'medium') {
    if (dayDiff === 0) return `Today ${time}${tzSuffix}`;
    if (dayDiff === 1) return `Tomorrow ${time}${tzSuffix}`;
    if (dayDiff === -1) return `Yesterday ${time}${tzSuffix}`;
    const datePart = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return `${datePart} ${time}${tzSuffix}`;
  }

  // short (default) — good for badges / cards
  if (dayDiff === 0) return `Today ${time}${tzSuffix}`;
  if (dayDiff === 1) return `Tomorrow ${time}${tzSuffix}`;
  if (dayDiff === -1) return `Yday ${time}${tzSuffix}`;
  const datePart = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${datePart} ${time}${tzSuffix}`;
}

/**
 * One-line note for UI footers, e.g. "Times in your local time (Asia/Dhaka · GMT+6)"
 */
export function localTimeHint() {
  const tz = getUserTimeZone();
  const abbr = getUserTimeZoneAbbr();
  if (abbr && abbr !== tz) return `Times in your local time (${tz} · ${abbr})`;
  return `Times in your local time (${tz})`;
}

/** Copy text to clipboard, returning a boolean success flag. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Minimal, safe inline text formatting for chat:
 *   *bold*  -> <strong>, _italic_ -> <em>
 * Input is already server-sanitized (no < >). We escape & just in case
 * and only inject our own tags.
 */
export function formatChatText(text) {
  const escaped = text.replace(/&/g, '&amp;');
  return escaped
    .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

/**
 * Persist + read a guest username from localStorage.
 *
 * These are kept for backwards compatibility, but now route through the
 * profile system (lib/profile.js): reading returns the profile display name
 * (falling back to the legacy stored value), and writing stores the name as
 * the profile display name so it appears everywhere consistently.
 */
const USERNAME_KEY = 'bgc_username';
export function getStoredUsername() {
  try {
    const profileRaw = localStorage.getItem('bgc_profile');
    if (profileRaw) {
      const profile = JSON.parse(profileRaw);
      if (profile && profile.displayName) return profile.displayName;
    }
    return localStorage.getItem(USERNAME_KEY) || '';
  } catch {
    return '';
  }
}
export function setStoredUsername(name) {
  try {
    localStorage.setItem(USERNAME_KEY, name);
  } catch {
    /* ignore */
  }
  // Keep the profile system in sync so the name written here is the one
  // surfaced by getStoredUsername/getEffectiveName everywhere.
  saveProfile({ displayName: name });
}
