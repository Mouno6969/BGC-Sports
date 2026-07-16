// ---------------------------------------------------------------------------
// Match hub deep links — Match Center is the primary destination; Watch /
// Predict / Party hang off the same match identity for a hub-style UX.
// ---------------------------------------------------------------------------

export function slugifyPart(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Extract numeric ESPN id from espn-760510 or plain id */
export function extractEventId(matchOrId) {
  if (!matchOrId) return null;
  if (typeof matchOrId === 'object') {
    const raw = matchOrId.eventId || matchOrId.id || '';
    return extractEventId(raw);
  }
  const s = String(matchOrId);
  const m = s.match(/(\d{5,})$/);
  if (m) return m[1];
  const m2 = s.match(/espn-?(\d+)/i);
  return m2 ? m2[1] : null;
}

/**
 * Build path like /match/france-vs-morocco-760510
 * Falls back to /match/{id} when names missing.
 * Any match with a numeric ESPN-style event id is linkable.
 */
export function matchCenterPath(match) {
  if (!match) return null;
  if (match.path) return match.path;
  if (match.slug) return `/match/${match.slug}`;
  const id = extractEventId(match);
  if (!id) return null;
  const home = slugifyPart(match.home);
  const away = slugifyPart(match.away);
  if (home && away) return `/match/${home}-vs-${away}-${id}`;
  return `/match/${id}`;
}

/** Stats / Match Center with optional focus section. */
export function matchStatsPath(match, focus = null) {
  const base = matchCenterPath(match);
  if (!base) return null;
  if (!focus) return base;
  return `${base}?focus=${encodeURIComponent(focus)}`;
}

/** Watch streams for this match (Match Center watch block). */
export function matchWatchPath(match) {
  return matchStatsPath(match, 'watch') || '/category/Sports';
}

/** Predict tab, deep-linked to this match when possible. */
export function matchPredictPath(match) {
  const id = extractEventId(match) || match?.id;
  if (id) return `/?tab=predict&match=${encodeURIComponent(id)}`;
  return '/?tab=predict';
}

/** Watch Together entry via Match Center party block. */
export function matchPartyPath(match) {
  return matchStatsPath(match, 'party') || '/?tab=worldcup';
}

/**
 * All hub destinations for action rows / cards.
 * @returns {{
 *   stats: string|null,
 *   watch: string,
 *   predict: string,
 *   party: string,
 *   hasCenter: boolean,
 * }}
 */
export function buildMatchHubLinks(match) {
  const stats = matchCenterPath(match);
  return {
    stats,
    watch: matchWatchPath(match),
    predict: matchPredictPath(match),
    party: matchPartyPath(match),
    hasCenter: Boolean(stats),
  };
}

export function matchCenterUrl(match, origin = '') {
  const path = matchCenterPath(match);
  if (!path) return null;
  return origin ? `${origin.replace(/\/$/, '')}${path}` : path;
}

/** True when league/stage looks like World Cup (for channel suggestions). */
export function isWorldCupMatch(match) {
  if (!match) return false;
  const blob = `${match.league || ''} ${match.stage || ''} ${match.round || ''}`;
  return /world\s*cup|fifa/i.test(blob);
}
