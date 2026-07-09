// ---------------------------------------------------------------------------
// Guest identity helpers: auto-generate friendly usernames and stable colors.
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  'Swift', 'Mighty', 'Clutch', 'Golden', 'Rapid', 'Bold', 'Epic', 'Prime',
  'Turbo', 'Stealth', 'Cosmic', 'Blazing', 'Iron', 'Nova', 'Vivid', 'Royal',
];

const NOUNS = [
  'Striker', 'Falcon', 'Captain', 'Ranger', 'Tiger', 'Comet', 'Viper', 'Phoenix',
  'Hawk', 'Maverick', 'Champion', 'Rocket', 'Panther', 'Bolt', 'Titan', 'Ace',
];

// A pleasant, readable palette for usernames in chat / call overlay.
const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee',
  '#60a5fa', '#818cf8', '#a78bfa', '#e879f9', '#f472b6', '#2dd4bf',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a random guest username like "SwiftFalcon42". */
export function generateUsername() {
  const n = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${n}`;
}

/** Pick a random user color from the palette. */
export function generateColor() {
  return pick(COLORS);
}

/** Sanitize a user-supplied username to a safe, bounded string. */
export function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>]/g, '').trim().slice(0, 24);
}

// Max serialized size for an avatar data URL (~64 KB keeps payloads small).
const MAX_AVATAR_LEN = 64 * 1024;

/**
 * Sanitize a user-supplied avatar. Only small base64 image data URLs are
 * accepted; anything else is dropped to avoid abuse (URLs, scripts, etc.).
 */
export function sanitizeAvatar(raw) {
  if (typeof raw !== 'string') return '';
  if (raw.length === 0 || raw.length > MAX_AVATAR_LEN) return '';
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(raw)) return '';
  return raw;
}
