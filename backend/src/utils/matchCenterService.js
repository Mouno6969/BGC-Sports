// ---------------------------------------------------------------------------
// Match Center — ESPN summary normalization (lineups, H2H, form, commentary,
// stats, venue). Used by /api/match/:id for SEO destination pages.
// ---------------------------------------------------------------------------

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

// Leagues we try when the client doesn't pass an ESPN slug
const LEAGUE_CANDIDATES = [
  'fifa.world',
  'eng.1',
  'esp.1',
  'ger.1',
  'ita.1',
  'fra.1',
  'uefa.champions',
  'uefa.europa',
  'usa.1',
  'uefa.europa.conf',
];

const LEAGUE_LABEL_TO_SLUG = {
  epl: 'eng.1',
  'premier league': 'eng.1',
  'la liga': 'esp.1',
  bundesliga: 'ger.1',
  'serie a': 'ita.1',
  'ligue 1': 'fra.1',
  ucl: 'uefa.champions',
  'champions league': 'uefa.champions',
  uel: 'uefa.europa',
  mls: 'usa.1',
  'fifa world cup': 'fifa.world',
  'world cup': 'fifa.world',
};

const cache = new Map();
const CACHE_TTL_LIVE = 30 * 1000;
const CACHE_TTL_DONE = 5 * 60 * 1000;

async function fetchJson(url, timeoutMs = 12000) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; BGCSports/2.0; +https://preview.cryptobgc.eu.cc)',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Extract numeric ESPN event id from espn-760510, 760510, or france-vs-morocco-760510 */
export function parseEventId(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // trailing digits preferred (SEO slugs end with id)
  const m = s.match(/(?:^|[^0-9])(\d{5,})$/);
  if (m) return m[1];
  const m2 = s.match(/espn-?(\d+)/i);
  if (m2) return m2[1];
  if (/^\d+$/.test(s)) return s;
  return null;
}

export function slugifyTeam(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildMatchSlug(home, away, eventId) {
  const a = slugifyTeam(home) || 'home';
  const b = slugifyTeam(away) || 'away';
  return `${a}-vs-${b}-${eventId}`;
}

function mapStatus(type = {}) {
  const name = String(type.name || '').toUpperCase();
  const state = String(type.state || '').toLowerCase();
  if (state === 'in' || name.includes('IN_PROGRESS') || name.includes('HALFTIME')) return 'LIVE';
  if (type.completed || state === 'post' || name.includes('FULL_TIME') || name.includes('FINAL')) {
    return 'FINISHED';
  }
  return 'UPCOMING';
}

function parseScore(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ESPN team payloads sometimes only have logos[] (summary) and sometimes logo
 * (scoreboard). Prefer full/default light logo for badges.
 */
export function teamLogoUrl(team = {}) {
  if (!team || typeof team !== 'object') return null;
  if (typeof team.logo === 'string' && team.logo.startsWith('http')) return team.logo;
  const logos = Array.isArray(team.logos) ? team.logos : [];
  const full = logos.find(
    (l) =>
      l?.href
      && (l.rel || []).includes('full')
      && !(l.rel || []).includes('dark')
  );
  if (full?.href) return full.href;
  const def = logos.find((l) => l?.href && (l.rel || []).includes('default'));
  if (def?.href) return def.href;
  const any = logos.find((l) => l?.href && !(l.rel || []).includes('dark'));
  if (any?.href) return any.href;
  if (logos[0]?.href) return logos[0].href;
  // National teams: fall back to ESPN country flag path from abbreviation
  const abbr = String(team.abbreviation || team.shortDisplayName || '').toLowerCase();
  if (/^[a-z]{3}$/.test(abbr)) {
    return `https://a.espncdn.com/i/teamlogos/countries/500/${abbr}.png`;
  }
  return null;
}

function normalizeFormEvent(e) {
  const opp = e.opponent || {};
  return {
    id: e.id,
    date: e.gameDate || null,
    result: e.gameResult || null, // W / D / L
    score: e.score || null,
    atVs: e.atVs || 'vs',
    opponent: opp.displayName || 'Opponent',
    opponentLogo: e.opponentLogo || teamLogoUrl(opp) || null,
    competition: e.competitionName || e.leagueName || null,
    round: e.roundName || null,
  };
}

function normalizeLineup(rosterBlock) {
  if (!rosterBlock) return null;
  const team = rosterBlock.team || {};
  const players = rosterBlock.roster || [];
  const starters = [];
  const bench = [];
  for (const p of players) {
    const row = {
      id: p.athlete?.id || null,
      name: p.athlete?.displayName || p.athlete?.fullName || 'Player',
      shortName: p.athlete?.shortName || null,
      jersey: p.jersey || null,
      position: p.position?.abbreviation || p.position?.displayName || null,
      formationPlace: p.formationPlace || null,
      starter: Boolean(p.starter),
      captain: Boolean(p.captain),
      subbedIn: Boolean(p.subbedIn),
      subbedOut: Boolean(p.subbedOut),
    };
    if (p.starter) starters.push(row);
    else bench.push(row);
  }
  // Sort starters by formation place when available
  starters.sort((a, b) => Number(a.formationPlace || 99) - Number(b.formationPlace || 99));
  return {
    homeAway: rosterBlock.homeAway,
    team: team.displayName || team.name,
    teamLogo: teamLogoUrl(team),
    formation: rosterBlock.formation || null,
    starters,
    bench,
  };
}

function normalizeStats(boxscore) {
  const teams = boxscore?.teams || [];
  if (teams.length < 2) return [];
  // Pair stats by name across home/away
  const byName = new Map();
  for (const t of teams) {
    const side = t.homeAway || (t.team?.displayName ? 'home' : 'home');
    for (const s of t.statistics || []) {
      const key = s.name || s.displayName || s.label;
      if (!key) continue;
      if (!byName.has(key)) {
        byName.set(key, {
          key,
          label: s.displayName || s.label || key,
          home: null,
          away: null,
        });
      }
      const row = byName.get(key);
      const val = s.displayValue ?? s.value ?? null;
      if (t.homeAway === 'home') row.home = val;
      else if (t.homeAway === 'away') row.away = val;
      else {
        // fallback order
        if (row.home == null) row.home = val;
        else row.away = val;
      }
    }
  }
  // Prefer interesting soccer stats first
  const prefer = [
    'possessionPct',
    'totalShots',
    'shotsOnTarget',
    'wonCorners',
    'foulsCommitted',
    'yellowCards',
    'redCards',
    'offsides',
    'saves',
    'goalAssists',
    'totalGoals',
    'passes',
    'accuratePasses',
  ];
  const rows = [...byName.values()];
  rows.sort((a, b) => {
    const ia = prefer.indexOf(a.key);
    const ib = prefer.indexOf(b.key);
    if (ia === -1 && ib === -1) return a.label.localeCompare(b.label);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return rows.slice(0, 16);
}

function normalizeTimeline(data) {
  const out = [];
  const keyEvents = data.keyEvents || [];
  for (const e of keyEvents) {
    const type = e.type?.type || e.type?.text || 'event';
    out.push({
      id: e.id || `ke-${out.length}`,
      kind: 'key',
      type,
      typeLabel: e.type?.text || type,
      clock: e.clock?.displayValue || '',
      period: e.period?.number || null,
      text: e.text || '',
      scoringPlay: Boolean(e.scoringPlay),
      team: e.team?.displayName || null,
      players: (e.participants || []).map((p) => p.athlete?.displayName).filter(Boolean),
      wallclock: e.wallclock || null,
    });
  }
  // Merge commentary if key events sparse
  if (out.length < 8 && Array.isArray(data.commentary)) {
    for (const c of data.commentary.slice(0, 40)) {
      out.push({
        id: c.play?.id || `cm-${c.sequence || out.length}`,
        kind: 'commentary',
        type: c.play?.type?.type || 'commentary',
        typeLabel: c.play?.type?.text || 'Commentary',
        clock: c.time?.displayValue || c.play?.clock?.displayValue || '',
        period: c.play?.period?.number || null,
        text: c.text || '',
        scoringPlay: false,
        team: c.play?.team?.displayName || null,
        players: [],
        wallclock: c.play?.wallclock || null,
      });
    }
  }
  // Sort by wallclock or sequence when possible
  out.sort((a, b) => {
    if (a.wallclock && b.wallclock) return a.wallclock.localeCompare(b.wallclock);
    return 0;
  });
  return out;
}

function normalizeH2H(headToHeadGames, homeName, awayName) {
  // headToHeadGames is per-team form-like history vs each other — take first team's events
  // that involve the opponent, or flatten unique games
  const seen = new Set();
  const games = [];
  for (const block of headToHeadGames || []) {
    for (const e of block.events || []) {
      if (!e.id || seen.has(e.id)) continue;
      seen.add(e.id);
      const opp = e.opponent?.displayName;
      games.push({
        id: e.id,
        date: e.gameDate,
        score: e.score,
        competition: e.competitionName || e.leagueName,
        round: e.roundName,
        result: e.gameResult, // relative to block.team
        forTeam: block.team?.displayName,
        opponent: opp,
        homeTeamScore: e.homeTeamScore,
        awayTeamScore: e.awayTeamScore,
        note: e.matchNote || null,
      });
    }
  }
  games.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return games.slice(0, 8);
}

function resolveLeagueSlug(hint) {
  if (!hint) return null;
  const s = String(hint).toLowerCase().trim();
  if (s.includes('.')) return s; // already a slug like fifa.world
  return LEAGUE_LABEL_TO_SLUG[s] || null;
}

/**
 * Fetch and normalize a full match center payload.
 * @param {string} rawId - espn-760510 | 760510 | france-vs-morocco-760510
 * @param {{ league?: string }} opts
 */
export async function getMatchCenter(rawId, opts = {}) {
  const eventId = parseEventId(rawId);
  if (!eventId) return { ok: false, error: 'Invalid match id', status: 400 };

  const leagueHint = resolveLeagueSlug(opts.league);
  const cacheKey = `mc:${eventId}:${leagueHint || 'auto'}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < hit.ttl) {
    return { ok: true, match: hit.data, cached: true };
  }

  const tryLeagues = leagueHint
    ? [leagueHint, ...LEAGUE_CANDIDATES.filter((l) => l !== leagueHint)]
    : LEAGUE_CANDIDATES;

  let data = null;
  let usedLeague = null;
  for (const slug of tryLeagues) {
    data = await fetchJson(`${ESPN_BASE}/${slug}/summary?event=${eventId}`);
    if (data?.header) {
      usedLeague = slug;
      break;
    }
  }
  if (!data?.header) {
    return { ok: false, error: 'Match not found', status: 404 };
  }

  const competition = data.header.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const homeC = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayC = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  const statusType = competition.status?.type || data.header.competitions?.[0]?.status?.type || {};
  const status = mapStatus(statusType);

  const homeName = homeC?.team?.displayName || 'Home';
  const awayName = awayC?.team?.displayName || 'Away';
  const homeScore = parseScore(homeC?.score);
  const awayScore = parseScore(awayC?.score);
  const startIso = competition.date || competition.startDate || null;

  const leagueMeta = data.header.league || {};
  const venue = data.gameInfo?.venue || competition.venue || {};
  const address = venue.address || {};

  // Form guide
  const form = (data.lastFiveGames || []).map((block) => ({
    team: block.team?.displayName,
    teamLogo: teamLogoUrl(block.team),
    results: (block.events || []).slice(0, 5).map(normalizeFormEvent),
    formString: (block.events || [])
      .slice(0, 5)
      .map((e) => e.gameResult || '?')
      .join(''),
  }));

  // Lineups
  const rosterHome = (data.rosters || []).find((r) => r.homeAway === 'home');
  const rosterAway = (data.rosters || []).find((r) => r.homeAway === 'away');
  const lineups = {
    home: normalizeLineup(rosterHome),
    away: normalizeLineup(rosterAway),
  };

  // Broadcasts
  const broadcastNames = new Set();
  for (const b of competition.broadcasts || data.broadcasts || []) {
    if (Array.isArray(b.names)) b.names.forEach((n) => broadcastNames.add(n));
    else if (b.media?.shortName) broadcastNames.add(b.media.shortName);
  }

  const slug = buildMatchSlug(homeName, awayName, eventId);
  const stage =
    competition.notes?.[0]?.headline ||
    competition.altGameNote ||
    data.header.season?.slug ||
    null;

  const match = {
    id: `espn-${eventId}`,
    eventId,
    slug,
    path: `/match/${slug}`,
    source: 'espn',
    league: leagueMeta.name || usedLeague,
    leagueSlug: leagueMeta.slug || usedLeague,
    stage,
    status,
    statusDetail: statusType.detail || statusType.shortDetail || statusType.description || null,
    progress:
      status === 'LIVE'
        ? competition.status?.displayClock || statusType.detail || null
        : null,
    timestamp: startIso,
    home: homeName,
    away: awayName,
    homeShort: homeC?.team?.abbreviation || null,
    awayShort: awayC?.team?.abbreviation || null,
    homeBadge: teamLogoUrl(homeC?.team),
    awayBadge: teamLogoUrl(awayC?.team),
    homeScore: status === 'UPCOMING' ? null : homeScore,
    awayScore: status === 'UPCOMING' ? null : awayScore,
    homeForm: homeC?.form || form.find((f) => f.team === homeName)?.formString || null,
    awayForm: awayC?.form || form.find((f) => f.team === awayName)?.formString || null,
    venue: venue.fullName || venue.name || null,
    city: address.city || null,
    country: address.country || null,
    attendance: data.gameInfo?.attendance || competition.attendance || null,
    officials: (data.gameInfo?.officials || []).map((o) => ({
      name: o.displayName || o.fullName,
      role: o.position?.displayName || o.role,
    })),
    broadcasts: [...broadcastNames],
    form,
    lineups,
    stats: normalizeStats(data.boxscore),
    headToHead: normalizeH2H(data.headToHeadGames, homeName, awayName),
    timeline: normalizeTimeline(data),
    article: data.article
      ? {
          headline: data.article.headline,
          description: data.article.description,
        }
      : null,
    seo: {
      title: `${homeName} vs ${awayName}${homeScore != null ? ` ${homeScore}–${awayScore}` : ''} | Match Center | BGC Sports`,
      description: [
        `${homeName} vs ${awayName}`,
        leagueMeta.name,
        stage,
        venue.fullName ? `at ${venue.fullName}` : null,
        status === 'FINISHED' && homeScore != null
          ? `Final score ${homeScore}–${awayScore}`
          : status === 'LIVE'
            ? 'Live now — lineups, commentary and watch links'
            : 'Lineups, head-to-head, form guide and where to watch',
      ]
        .filter(Boolean)
        .join('. '),
    },
  };

  const ttl = status === 'LIVE' ? CACHE_TTL_LIVE : CACHE_TTL_DONE;
  cache.set(cacheKey, { data: match, ts: Date.now(), ttl });

  return { ok: true, match, cached: false };
}
