// ---------------------------------------------------------------------------
// Small UI utilities.
// ---------------------------------------------------------------------------

/** Format a unix-ms timestamp as HH:MM (24h, local). */
export function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

/** Persist + read a guest username from localStorage. */
const USERNAME_KEY = 'bgc_username';
export function getStoredUsername() {
  try {
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
}
