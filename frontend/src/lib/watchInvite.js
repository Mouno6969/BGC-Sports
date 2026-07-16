// ---------------------------------------------------------------------------
// Watch Together deep-link invites.
//
// Shareable form:
//   /watch/bein-sports-1?party=ABC123
//   /watch?url=...&name=...&party=ABC123   (fallback when no stable slug)
//
// Opening a link with ?party=CODE (or ?room=CODE) lands on the channel and
// auto-joins the Watch Party room.
// ---------------------------------------------------------------------------

import { sanitizeRoomCode } from './socket.js';
import { slugify } from './slug.js';
import { apiGet } from './config.js';

export const PARTY_QUERY_KEYS = ['party', 'room'];

/** Extract a sanitized 6-char party code from URLSearchParams / location. */
export function parsePartyCode(searchParams) {
  if (!searchParams) return '';
  const raw =
    typeof searchParams.get === 'function'
      ? searchParams.get('party') || searchParams.get('room') || ''
      : String(searchParams);
  return sanitizeRoomCode(raw);
}

/**
 * Build an absolute invite URL for the current channel + room code.
 * Prefers pretty slug routes; falls back to preserving current path/query.
 *
 * @param {string} code
 * @param {{
 *   origin?: string,
 *   pathname?: string,
 *   search?: string,
 *   channelSlug?: string|null,
 *   channelName?: string|null,
 *   streamUrl?: string|null,
 * }} opts
 */
export function buildInviteUrl(code, opts = {}) {
  const clean = sanitizeRoomCode(code);
  if (!clean) return '';

  const origin =
    opts.origin ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const pathname =
    opts.pathname ||
    (typeof window !== 'undefined' ? window.location.pathname : '/watch');
  const search =
    opts.search != null
      ? opts.search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';

  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  for (const k of PARTY_QUERY_KEYS) params.delete(k);
  params.set('party', clean);

  // Explicit slug wins (e.g. from /watch/:slug or resolved channel)
  const slug =
    (opts.channelSlug && slugify(opts.channelSlug)) ||
    (() => {
      const m = String(pathname).match(/^\/watch\/([^/]+)$/);
      return m ? slugify(decodeURIComponent(m[1])) : '';
    })();

  if (slug) {
    return `${origin}/watch/${slug}?party=${clean}`;
  }

  // Keep existing query context (url/name/logo/source) for custom streams
  const qs = params.toString();
  const path = pathname.startsWith('/watch') ? pathname : '/watch';
  return `${origin}${path}?${qs}`;
}

/**
 * Upgrade to a pretty slug invite when the backend confirms the slug maps to
 * the same stream URL (avoids wrong channel when names collide).
 */
export async function buildPrettyInviteUrl(code, opts = {}) {
  const clean = sanitizeRoomCode(code);
  if (!clean) return null;

  const origin =
    opts.origin ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const pathname =
    opts.pathname ||
    (typeof window !== 'undefined' ? window.location.pathname : '');

  // Already on a slug route — that's the pretty form
  const onSlug = /^\/watch\/([^/]+)$/.exec(pathname || '');
  if (onSlug) {
    return `${origin}/watch/${slugify(decodeURIComponent(onSlug[1]))}?party=${clean}`;
  }

  const channelName = opts.channelName || null;
  const streamUrl = opts.streamUrl || null;
  const preferredSlug = opts.channelSlug ? slugify(opts.channelSlug) : '';
  const slug = preferredSlug || (channelName ? slugify(channelName) : '');
  if (!slug || !streamUrl) return null;

  try {
    const data = await apiGet(`/api/channels/by-slug/${encodeURIComponent(slug)}`);
    if (data?.channel?.url === streamUrl) {
      return `${origin}/watch/${slug}?party=${clean}`;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Best invite URL (pretty when possible). */
export async function resolveInviteUrl(code, opts = {}) {
  const pretty = await buildPrettyInviteUrl(code, opts);
  return pretty || buildInviteUrl(code, opts);
}

/**
 * Merge party=CODE into the current location search string (no navigation).
 * Returns a new URLSearchParams suitable for setSearchParams.
 */
export function withPartyParam(searchParams, code) {
  const next = new URLSearchParams(searchParams || '');
  for (const k of PARTY_QUERY_KEYS) next.delete(k);
  const clean = sanitizeRoomCode(code);
  if (clean) next.set('party', clean);
  return next;
}

/** Remove party/room query keys. */
export function withoutPartyParam(searchParams) {
  const next = new URLSearchParams(searchParams || '');
  for (const k of PARTY_QUERY_KEYS) next.delete(k);
  return next;
}

/**
 * Share invite via Web Share API when available; otherwise copy to clipboard.
 * @returns {Promise<'shared'|'copied'|'failed'>}
 */
export async function shareInvite({ url, title, text }) {
  if (!url) return 'failed';
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({
        title: title || 'Watch Together on BGC Sports',
        text: text || 'Join my watch party — open the link to watch and join the room.',
        url,
      });
      return 'shared';
    }
  } catch (err) {
    // User cancelled share sheet
    if (err?.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** WhatsApp deep link (works on mobile + web.whatsapp.com fallback). */
export function whatsappShareUrl({ url, text }) {
  if (!url) return '';
  const body = [text, url].filter(Boolean).join('\n');
  return `https://wa.me/?text=${encodeURIComponent(body)}`;
}

/**
 * Messenger share. Uses Facebook sharer as a reliable web fallback;
 * on mobile the OS may open the Messenger app for facebook.com links.
 */
export function messengerShareUrl({ url }) {
  if (!url) return '';
  // fb-messenger scheme often blocked in in-app browsers; use m.me send + web sharer
  const encoded = encodeURIComponent(url);
  if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
    return `fb-messenger://share/?link=${encoded}`;
  }
  return `https://www.facebook.com/sharer/sharer.php?u=${encoded}`;
}

/** Telegram share URL. */
export function telegramShareUrl({ url, text }) {
  if (!url) return '';
  const params = new URLSearchParams();
  params.set('url', url);
  if (text) params.set('text', text);
  return `https://t.me/share/url?${params.toString()}`;
}
