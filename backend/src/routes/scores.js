// ---------------------------------------------------------------------------
// Live Scores — multi-source football data with ESPN as primary (accurate
// ISO kickoff times, venues, broadcasts, live clocks) and TheSportsDB as
// fallback. World Cup schedule is built across the full tournament window.
//
// GET /api/scores -> {
//   matches: [...],      // major leagues + recent WC highlights
//   worldCup: [...],     // full WC schedule (sorted)
//   source, timezoneNote, updatedAt
// }
//
// GET /api/scores/standings -> {
//   groups: [...],       // Group A–L tables with P/W/D/L/GF/GA/GD/Pts
//   bracket: { rounds }, // knockout tree (R32 → Final)
//   phase, source, updatedAt
// }
//
// Each match includes ISO `timestamp` (UTC). Frontends should format kickoff
// with the visitor's local timezone via Intl.DateTimeFormat / toLocale*.
// ---------------------------------------------------------------------------
import { Router } from 'express';

const router = Router();

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_V2 = 'https://site.api.espn.com/apis/v2/sports/soccer';
const THESPORTSDB = 'https://www.thesportsdb.com/api/v1/json/3';
const WORLD_CUP_TSD_ID = '4429';

// ESPN soccer league slugs for club competitions
const ESPN_LEAGUES = [
  { slug: 'eng.1', label: 'EPL' },
  { slug: 'esp.1', label: 'La Liga' },
  { slug: 'ger.1', label: 'Bundesliga' },
  { slug: 'ita.1', label: 'Serie A' },
  { slug: 'fra.1', label: 'Ligue 1' },
  { slug: 'uefa.champions', label: 'UCL' },
  { slug: 'uefa.europa', label: 'UEL' },
  { slug: 'usa.1', label: 'MLS' },
];

// TheSportsDB league IDs (fallback only)
const TSD_LEAGUES = [
  { id: '4328', label: 'EPL' },
  { id: '4335', label: 'La Liga' },
  { id: '4331', label: 'Bundesliga' },
  { id: '4332', label: 'Serie A' },
  { id: '4334', label: 'Ligue 1' },
  { id: '4480', label: 'UCL' },
  { id: '4481', label: 'UEL' },
  { id: '4346', label: 'MLS' },
];

// FIFA World Cup 2026 window (group stage through final)
const WC_START = '2026-06-11';
const WC_END = '2026-07-20';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 45 * 1000; // 45s payload cache

// Separate WC schedule cache so we don't re-scrape every tournament day every 45s
let wcCache = { data: null, timestamp: 0, full: false };
const WC_FULL_TTL = 10 * 60 * 1000; // full schedule every 10 min
const WC_RECENT_TTL = 45 * 1000; // recent window every 45s

// Group standings + knockout bracket cache
let standingsCache = { data: null, timestamp: 0 };
const STANDINGS_TTL = 45 * 1000;

const FALLBACK_MATCHES = [
  {
    id: 'fb-1',
    home: 'Arsenal',
    away: 'Chelsea',
    homeScore: 2,
    awayScore: 1,
    league: 'EPL',
    status: 'FINISHED',
    progress: null,
    timestamp: null,
  },
  {
    id: 'fb-2',
    home: 'Real Madrid',
    away: 'Barcelona',
    homeScore: 1,
    awayScore: 1,
    league: 'La Liga',
    status: 'FINISHED',
    progress: null,
    timestamp: null,
  },
  {
    id: 'fb-3',
    home: 'Bayern Munich',
    away: 'Dortmund',
    homeScore: 3,
    awayScore: 2,
    league: 'Bundesliga',
    status: 'FINISHED',
    progress: null,
    timestamp: null,
  },
];

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchJson(url, timeoutMs = 10000) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BGCSports/2.0; +https://preview.cryptobgc.eu.cc)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function parseYmd(s) {
  // "2026-06-11" or "20260611"
  const clean = String(s).replace(/-/g, '');
  return new Date(
    Date.UTC(
      Number(clean.slice(0, 4)),
      Number(clean.slice(4, 6)) - 1,
      Number(clean.slice(6, 8))
    )
  );
}

function eachDate(startYmd, endYmd) {
  const out = [];
  let cur = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  while (cur <= end) {
    out.push(ymd(cur));
    cur = new Date(cur.getTime() + 86400000);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ESPN normalization
// ---------------------------------------------------------------------------

function mapEspnStatus(type = {}, competitionStatus = {}) {
  const name = String(type.name || '').toUpperCase();
  const state = String(type.state || '').toLowerCase();
  const completed = Boolean(type.completed);

  if (state === 'in' || name.includes('IN_PROGRESS') || name.includes('HALFTIME') || name.includes('EXTRA_TIME')) {
    return 'LIVE';
  }
  if (
    completed ||
    state === 'post' ||
    name.includes('FULL_TIME') ||
    name.includes('FINAL') ||
    name.includes('STATUS_FINAL')
  ) {
    return 'FINISHED';
  }
  if (name.includes('POSTPONED')) return 'POSTPONED';
  if (name.includes('CANCEL')) return 'CANCELLED';
  // pre / scheduled / delayed
  return 'UPCOMING';
}

function espnProgress(status = {}) {
  const type = status.type || {};
  const state = String(type.state || '').toLowerCase();
  if (state !== 'in') return null;
  // Prefer displayClock ("67'" or "45'+2'") then period labels
  const clock = status.displayClock || type.detail || type.shortDetail || null;
  if (!clock) return null;
  // Strip trailing fluff for ticker; keep minute-ish string
  return String(clock).replace(/\s+/g, '');
}

function parseScore(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map a single ESPN event into our shared match shape.
 * `leagueLabel` overrides competition name for club scoreboards.
 */
function fmtEspnEvent(event, leagueLabel = null) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  const statusObj = competition.status || event.status || {};
  const type = statusObj.type || {};
  const status = mapEspnStatus(type, statusObj);
  const venue = competition.venue || {};
  const address = venue.address || {};
  const startIso = competition.startDate || competition.date || event.date || null;

  // Broadcasts: flatten national + geo names
  const broadcastNames = new Set();
  for (const b of competition.broadcasts || []) {
    for (const n of b.names || []) if (n) broadcastNames.add(n);
  }
  for (const g of competition.geoBroadcasts || []) {
    const n = g.media?.shortName || g.media?.name;
    if (n) broadcastNames.add(n);
  }

  const stage =
    competition.altGameNote ||
    event.season?.slug ||
    event.season?.name ||
    type.detail ||
    null;

  const league =
    leagueLabel ||
    event.league?.name ||
    competition.league?.name ||
    (String(stage || '').toLowerCase().includes('world cup')
      ? 'FIFA World Cup'
      : 'Football');

  // Prefer FIFA World Cup branding for fifa.world
  const isWorldCup =
    /world\s*cup/i.test(league) ||
    /fifa/i.test(leagueLabel || '') ||
    /world\s*cup/i.test(competition.altGameNote || '');

  const homeScore = parseScore(home?.score);
  const awayScore = parseScore(away?.score);
  // Hide 0-0 on pure scheduled games
  const showScore =
    status === 'LIVE' ||
    status === 'FINISHED' ||
    (homeScore != null && awayScore != null && (homeScore > 0 || awayScore > 0));

  return {
    id: `espn-${event.id}`,
    source: 'espn',
    home: home?.team?.displayName || home?.team?.name || 'TBD',
    away: away?.team?.displayName || away?.team?.name || 'TBD',
    homeShort: home?.team?.abbreviation || home?.team?.shortDisplayName || null,
    awayShort: away?.team?.abbreviation || away?.team?.shortDisplayName || null,
    homeBadge:
      home?.team?.logo
      || home?.team?.logos?.find((l) => (l.rel || []).includes('full') && !(l.rel || []).includes('dark'))?.href
      || home?.team?.logos?.[0]?.href
      || null,
    awayBadge:
      away?.team?.logo
      || away?.team?.logos?.find((l) => (l.rel || []).includes('full') && !(l.rel || []).includes('dark'))?.href
      || away?.team?.logos?.[0]?.href
      || null,
    homeScore: showScore ? homeScore : null,
    awayScore: showScore ? awayScore : null,
    homeForm: home?.form || null,
    awayForm: away?.form || null,
    homeWinner: Boolean(home?.winner),
    awayWinner: Boolean(away?.winner),
    league: isWorldCup ? 'FIFA World Cup' : league,
    status,
    progress: status === 'LIVE' ? espnProgress(statusObj) : null,
    statusDetail: type.detail || type.shortDetail || type.description || null,
    // ISO-8601 UTC — critical for client-side local timezone display
    timestamp: startIso || null,
    date: startIso ? startIso.slice(0, 10) : null,
    time: startIso ? startIso.slice(11, 19) : null,
    venue: venue.fullName || venue.name || null,
    city: address.city || null,
    country: address.country || null,
    attendance: competition.attendance || null,
    broadcasts: [...broadcastNames],
    stage: stage,
    round: stage,
    completed: Boolean(type.completed),
  };
}

async function fetchEspnScoreboard(slug, datesYmd = null) {
  const qs = datesYmd ? `?dates=${datesYmd}` : '';
  const data = await fetchJson(`${ESPN_BASE}/${slug}/scoreboard${qs}`);
  return data?.events || [];
}

/**
 * Fetch ESPN scoreboard events for a list of YYYYMMDD dates (batched).
 */
async function fetchEspnDates(slug, dates, concurrency = 8) {
  const events = [];
  for (let i = 0; i < dates.length; i += concurrency) {
    const batch = dates.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((d) => fetchEspnScoreboard(slug, d))
    );
    for (const list of results) {
      for (const e of list) events.push(e);
    }
  }
  return events;
}

function dedupeEspnMatches(events) {
  const seen = new Set();
  const matches = [];
  for (const e of events) {
    if (!e?.id || seen.has(e.id)) continue;
    seen.add(e.id);
    matches.push(fmtEspnEvent(e, 'FIFA World Cup'));
  }
  return matches;
}

/**
 * Collect World Cup events.
 * - Full tournament window every WC_FULL_TTL (complete schedule)
 * - Between full refreshes, re-pull only a recent date window so live
 *   scores / near fixtures stay accurate without hammering ESPN.
 */
async function buildEspnWorldCup(windowStart = WC_START, windowEnd = WC_END) {
  const now = Date.now();
  const needFull =
    !wcCache.data ||
    !wcCache.full ||
    now - wcCache.timestamp > WC_FULL_TTL;

  if (needFull) {
    const allDates = eachDate(windowStart, windowEnd);
    const events = await fetchEspnDates('fifa.world', allDates, 10);
    const matches = dedupeEspnMatches(events);
    if (matches.length) {
      wcCache = { data: matches, timestamp: now, full: true };
      return matches;
    }
    // If full fetch failed, fall through to recent-only / stale
  }

  // Recent window refresh (yesterday → +10 days) merged into cached full set
  if (wcCache.data && now - wcCache.timestamp < WC_RECENT_TTL) {
    return wcCache.data;
  }

  const today = new Date();
  const recentStart = new Date(today.getTime() - 2 * 86400000);
  const recentEnd = new Date(today.getTime() + 10 * 86400000);
  const tourneyStart = parseYmd(windowStart);
  const tourneyEnd = parseYmd(windowEnd);
  const clampStart = recentStart < tourneyStart ? tourneyStart : recentStart;
  const clampEnd = recentEnd > tourneyEnd ? tourneyEnd : recentEnd;

  let recentDates = [];
  if (clampStart <= clampEnd) {
    recentDates = eachDate(ymd(clampStart), ymd(clampEnd));
  } else {
    // Outside tournament: still try "today" for residual fixtures
    recentDates = [ymd(today)];
  }

  const recentEvents = await fetchEspnDates('fifa.world', recentDates, 8);
  const recentMatches = dedupeEspnMatches(recentEvents);

  if (!wcCache.data?.length) {
    if (recentMatches.length) {
      wcCache = { data: recentMatches, timestamp: now, full: false };
    }
    return recentMatches;
  }

  // Merge recent into full cache by id
  const byId = new Map(wcCache.data.map((m) => [m.id, m]));
  for (const m of recentMatches) byId.set(m.id, m);
  const merged = [...byId.values()];
  wcCache = { data: merged, timestamp: now, full: wcCache.full };
  return merged;
}

async function buildEspnLeagues() {
  const results = await Promise.all(
    ESPN_LEAGUES.map(async (lg) => {
      const events = await fetchEspnScoreboard(lg.slug);
      return events.map((e) => fmtEspnEvent(e, lg.label));
    })
  );
  return results.flat();
}

// ---------------------------------------------------------------------------
// TheSportsDB fallback
// ---------------------------------------------------------------------------

function fmtTsdMatch(e, leagueLabel, kind) {
  const hs = e.intHomeScore;
  const as = e.intAwayScore;
  const hasScore = hs !== null && hs !== '' && as !== null && as !== '';

  // Prefer strTimestamp (UTC-ish); else combine date + time as UTC
  let timestamp = e.strTimestamp || null;
  if (!timestamp && e.dateEvent) {
    const t = e.strTime && e.strTime !== '00:00:00' ? e.strTime : '12:00:00';
    timestamp = `${e.dateEvent}T${t}Z`;
  }

  return {
    id: `tsd-${e.idEvent}`,
    source: 'thesportsdb',
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    homeShort: null,
    awayShort: null,
    homeBadge: e.strHomeTeamBadge || null,
    awayBadge: e.strAwayTeamBadge || null,
    homeScore: hasScore ? parseInt(hs, 10) : null,
    awayScore: hasScore ? parseInt(as, 10) : null,
    homeForm: null,
    awayForm: null,
    homeWinner: false,
    awayWinner: false,
    league: leagueLabel || e.strLeague,
    status: kind,
    progress: e.strProgress || null,
    statusDetail: null,
    timestamp,
    date: e.dateEvent || null,
    time: e.strTime || null,
    venue: e.strVenue || null,
    city: null,
    country: null,
    attendance: null,
    broadcasts: [],
    stage: e.strEvent || null,
    round: e.intRound || null,
    completed: kind === 'FINISHED',
  };
}

async function buildTsdWorldCup() {
  const worldCupMatches = [];

  const [past, next, live] = await Promise.all([
    fetchJson(`${THESPORTSDB}/eventspastleague.php?id=${WORLD_CUP_TSD_ID}`),
    fetchJson(`${THESPORTSDB}/eventsnextleague.php?id=${WORLD_CUP_TSD_ID}`),
    fetchJson(`${THESPORTSDB}/livescore.php?s=Soccer`),
  ]);

  if (past?.events) {
    for (const e of past.events.slice(0, 30)) {
      worldCupMatches.push(fmtTsdMatch(e, 'FIFA World Cup', 'FINISHED'));
    }
  }
  if (next?.events) {
    for (const e of next.events.slice(0, 30)) {
      worldCupMatches.push(fmtTsdMatch(e, 'FIFA World Cup', 'UPCOMING'));
    }
  }
  if (live?.events) {
    for (const e of live.events) {
      if (e.strLeague && /world cup/i.test(e.strLeague)) {
        if (!worldCupMatches.some((m) => m.id === `tsd-${e.idEvent}`)) {
          worldCupMatches.unshift(fmtTsdMatch(e, 'FIFA World Cup', 'LIVE'));
        }
      }
    }
  }
  return worldCupMatches;
}

async function buildTsdLeagues() {
  const matches = [];
  const live = await fetchJson(`${THESPORTSDB}/livescore.php?s=Soccer`);
  if (live?.events) {
    for (const e of live.events) {
      matches.push(fmtTsdMatch(e, e.strLeague, 'LIVE'));
    }
  }

  const results = await Promise.all(
    TSD_LEAGUES.flatMap((lg) => [
      fetchJson(`${THESPORTSDB}/eventspastleague.php?id=${lg.id}`).then((d) => ({
        d,
        lg,
        kind: 'FINISHED',
      })),
      fetchJson(`${THESPORTSDB}/eventsnextleague.php?id=${lg.id}`).then((d) => ({
        d,
        lg,
        kind: 'UPCOMING',
      })),
    ])
  );

  for (const { d, lg, kind } of results) {
    if (!d?.events) continue;
    for (const e of d.events.slice(0, 3)) {
      if (!matches.some((m) => m.id === `tsd-${e.idEvent}`)) {
        matches.push(fmtTsdMatch(e, lg.label, kind));
      }
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Sorting / assembly
// ---------------------------------------------------------------------------

function sortMatches(list) {
  const order = { LIVE: 0, UPCOMING: 1, POSTPONED: 2, FINISHED: 3, CANCELLED: 4 };
  return [...list].sort((a, b) => {
    const oa = order[a.status] ?? 9;
    const ob = order[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (a.status === 'FINISHED') return tb - ta; // newest first
    return ta - tb; // soonest first
  });
}

function isPlaceholderTeam(name) {
  if (!name) return true;
  return /winner|loser|tbd|to be determined|quarterfinal|semifinal|finalist/i.test(
    name
  );
}

/**
 * For the main scores grid: live + upcoming soon + recent finished.
 * World Cup upcoming/recent are included so homepage always shows WC.
 */
function pickHomepageMatches(worldCup, leagues) {
  const now = Date.now();
  const day = 86400000;

  const fromWc = worldCup.filter((m) => {
    if (m.status === 'LIVE') return true;
    if (m.status === 'UPCOMING') {
      // Hide pure TBD placeholders beyond next knockout slots when both TBD
      if (isPlaceholderTeam(m.home) && isPlaceholderTeam(m.away)) return false;
      const t = m.timestamp ? new Date(m.timestamp).getTime() : 0;
      return t && t - now < 14 * day;
    }
    if (m.status === 'FINISHED') {
      const t = m.timestamp ? new Date(m.timestamp).getTime() : 0;
      return t && now - t < 5 * day;
    }
    return false;
  });

  // Cap WC rows on homepage so club leagues still show
  const wcLive = fromWc.filter((m) => m.status === 'LIVE');
  const wcUp = fromWc.filter((m) => m.status === 'UPCOMING').slice(0, 8);
  const wcFin = fromWc.filter((m) => m.status === 'FINISHED').slice(0, 6);

  const merged = [...wcLive, ...wcUp, ...wcFin, ...leagues];
  // Dedupe by id
  const seen = new Set();
  const unique = [];
  for (const m of merged) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    unique.push(m);
  }
  return sortMatches(unique).slice(0, 48);
}

async function buildAll() {
  // ESPN first (parallel WC + leagues)
  const [espnWc, espnLeagues] = await Promise.all([
    buildEspnWorldCup(),
    buildEspnLeagues(),
  ]);

  let worldCup = espnWc;
  let leagues = espnLeagues;
  let source = 'espn';

  // Fallback if ESPN returned nothing useful
  if (!worldCup.length) {
    const tsdWc = await buildTsdWorldCup();
    if (tsdWc.length) {
      worldCup = tsdWc;
      source = source === 'espn' ? 'espn+thesportsdb' : 'thesportsdb';
    }
  }
  if (!leagues.length) {
    const tsdLg = await buildTsdLeagues();
    if (tsdLg.length) {
      leagues = tsdLg;
      source = source.includes('espn') ? 'espn+thesportsdb' : 'thesportsdb';
    }
  }

  worldCup = sortMatches(worldCup);
  const matches = pickHomepageMatches(worldCup, leagues);

  return {
    matches,
    worldCup,
    source,
    timezoneNote:
      'Kickoff timestamps are ISO-8601 UTC. Clients must format times in the visitor local timezone.',
    counts: {
      worldCup: worldCup.length,
      matches: matches.length,
      live: [...worldCup, ...leagues].filter((m) => m.status === 'LIVE').length,
      upcoming: worldCup.filter((m) => m.status === 'UPCOMING').length,
      finished: worldCup.filter((m) => m.status === 'FINISHED').length,
    },
  };
}

// ---------------------------------------------------------------------------
// World Cup standings + knockout bracket
// ---------------------------------------------------------------------------

const KNOCKOUT_ROUNDS = [
  { key: 'R32', label: 'Round of 32', order: 1, patterns: [/round of 32/i, /1\/16/i] },
  { key: 'R16', label: 'Round of 16', order: 2, patterns: [/round of 16/i, /1\/8/i] },
  { key: 'QF', label: 'Quarterfinals', order: 3, patterns: [/quarter/i] },
  { key: 'SF', label: 'Semifinals', order: 4, patterns: [/semi/i] },
  { key: '3RD', label: '3rd Place', order: 5, patterns: [/3rd|third.?place/i] },
  { key: 'F', label: 'Final', order: 6, patterns: [/\bfinal\b/i] },
];

function statMap(stats = []) {
  const m = {};
  for (const s of stats) {
    if (!s?.name) continue;
    m[s.name] = {
      value: s.value != null && s.value !== '' ? Number(s.value) : null,
      display: s.displayValue != null ? String(s.displayValue) : null,
    };
  }
  return m;
}

function numStat(map, name, fallback = 0) {
  const v = map[name]?.value;
  if (v != null && Number.isFinite(v)) return v;
  const d = map[name]?.display;
  if (d != null && d !== '' && !Number.isNaN(Number(d))) return Number(d);
  return fallback;
}

function classifyKnockoutRound(match) {
  const blob = [match.stage, match.round, match.statusDetail]
    .filter(Boolean)
    .join(' ');
  // Pure group-stage fixtures are not knockout
  if (/group\s+[a-l]/i.test(blob) && !/round of|quarter|semi|final/i.test(blob)) {
    return null;
  }
  // Most specific first so "Semifinal" does not become "Final"
  const ordered = [
    ['3RD', /3rd|third[\s-]?place/i],
    ['SF', /semi[\s-]?final/i],
    ['QF', /quarter[\s-]?final/i],
    ['R16', /round of 16|1\/8/i],
    ['R32', /round of 32|1\/16/i],
    ['F', /\bfinals?\b/i],
  ];
  for (const [key, re] of ordered) {
    if (re.test(blob)) {
      // "Final" regex can still match leftover "final" in "quarterfinal" — skip those
      if (key === 'F' && /quarter|semi|3rd|third/i.test(blob)) continue;
      return KNOCKOUT_ROUNDS.find((r) => r.key === key) || null;
    }
  }
  return null;
}

function isPlaceholderName(name) {
  return isPlaceholderTeam(name);
}

/**
 * Parse ESPN v2 standings payload into compact group tables.
 */
function parseEspnStandings(data) {
  const children = data?.children || [];
  const groups = [];

  for (const child of children) {
    const name = child.name || child.abbreviation || 'Group';
    const entries = child.standings?.entries || [];
    const teams = entries
      .map((entry) => {
        const team = entry.team || {};
        const sm = statMap(entry.stats || []);
        const logo =
          team.logos?.find((l) => (l.rel || []).includes('full'))?.href ||
          team.logos?.[0]?.href ||
          null;
        const rank = numStat(sm, 'rank', 99);
        const advanced = numStat(sm, 'advanced', 0) === 1;
        const note = entry.note || null;
        return {
          id: team.id || team.uid || team.abbreviation || team.displayName,
          name: team.displayName || team.name || 'TBD',
          short: team.abbreviation || team.shortDisplayName || null,
          badge: logo,
          rank,
          played: numStat(sm, 'gamesPlayed'),
          won: numStat(sm, 'wins'),
          drawn: numStat(sm, 'ties'),
          lost: numStat(sm, 'losses'),
          gf: numStat(sm, 'pointsFor'),
          ga: numStat(sm, 'pointsAgainst'),
          gd: numStat(sm, 'pointDifferential'),
          gdDisplay: sm.pointDifferential?.display || null,
          pts: numStat(sm, 'points'),
          form: sm.overall?.display || null,
          advanced,
          note: note
            ? {
                description: note.description || null,
                color: note.color || null,
                rank: note.rank ?? null,
              }
            : null,
        };
      })
      .sort((a, b) => a.rank - b.rank || b.pts - a.pts || b.gd - a.gd);

    groups.push({
      id: child.id || name,
      name,
      abbreviation: child.abbreviation || name,
      teams,
    });
  }

  // A–L alphabetical
  groups.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return groups;
}

/**
 * Build knockout rounds from World Cup match list.
 */
function buildKnockoutBracket(worldCupMatches = []) {
  const byRound = new Map(KNOCKOUT_ROUNDS.map((r) => [r.key, []]));

  for (const m of worldCupMatches) {
    const r = classifyKnockoutRound(m);
    if (!r) continue;
    // Skip pure group-stage mislabels
    if (/group\s+[a-l]/i.test(String(m.stage || m.round || ''))) continue;
    byRound.get(r.key).push({
      id: m.id,
      home: m.home,
      away: m.away,
      homeShort: m.homeShort,
      awayShort: m.awayShort,
      homeBadge: m.homeBadge,
      awayBadge: m.awayBadge,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      homeWinner: m.homeWinner,
      awayWinner: m.awayWinner,
      status: m.status,
      progress: m.progress,
      timestamp: m.timestamp,
      venue: m.venue,
      city: m.city,
      statusDetail: m.statusDetail,
      placeholder: isPlaceholderName(m.home) || isPlaceholderName(m.away),
    });
  }

  // Sort each round by kickoff
  for (const list of byRound.values()) {
    list.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });
  }

  const rounds = KNOCKOUT_ROUNDS.map((r) => ({
    key: r.key,
    label: r.label,
    order: r.order,
    matches: byRound.get(r.key) || [],
  })).filter((r) => r.matches.length > 0);

  return { rounds };
}

function detectTournamentPhase(groups, bracket) {
  const hasLiveKo = bracket.rounds.some((r) =>
    r.matches.some((m) => m.status === 'LIVE')
  );
  if (hasLiveKo) {
    const liveRound = bracket.rounds.find((r) =>
      r.matches.some((m) => m.status === 'LIVE')
    );
    return liveRound?.label || 'Knockout';
  }

  // Prefer the earliest knockout round that still has unfinished matches
  for (const r of bracket.rounds) {
    const open = r.matches.some(
      (m) => m.status === 'UPCOMING' || m.status === 'LIVE'
    );
    if (open) return r.label;
  }

  // All knockout done → Final complete
  const finalRound = bracket.rounds.find((r) => r.key === 'F');
  if (finalRound?.matches?.every((m) => m.status === 'FINISHED')) {
    return 'Champions';
  }

  // Group stage if any group match still incomplete (played < 3 for some teams)
  const groupOngoing = groups.some((g) =>
    g.teams.some((t) => (t.played || 0) < 3)
  );
  if (groupOngoing) return 'Group Stage';

  if (bracket.rounds.length) return bracket.rounds[bracket.rounds.length - 1].label;
  return 'Group Stage';
}

async function buildStandingsPayload() {
  const [standingsJson, worldCup] = await Promise.all([
    fetchJson(`${ESPN_V2}/fifa.world/standings`, 12000),
    buildEspnWorldCup(),
  ]);

  let groups = [];
  let source = 'espn';

  if (standingsJson?.children?.length) {
    groups = parseEspnStandings(standingsJson);
  }

  // Fallback: derive crude tables from finished group matches if ESPN standings empty
  if (!groups.length && worldCup.length) {
    groups = deriveGroupsFromMatches(worldCup);
    source = 'derived';
  }

  const bracket = buildKnockoutBracket(worldCup);
  const phase = detectTournamentPhase(groups, bracket);

  // Qualification legend from notes if present
  const legend = [
    { key: 'advance', label: 'Qualified', color: '#81D6AC' },
    { key: 'best', label: 'Best 3rd (playoff path)', color: '#B5E7CE' },
    { key: 'out', label: 'Eliminated', color: '#FF7F84' },
  ];

  return {
    groups,
    bracket,
    phase,
    legend,
    season: standingsJson?.season?.displayName || '2026 FIFA World Cup',
    source,
    counts: {
      groups: groups.length,
      teams: groups.reduce((n, g) => n + g.teams.length, 0),
      knockoutMatches: bracket.rounds.reduce((n, r) => n + r.matches.length, 0),
    },
  };
}

/**
 * Last-resort group tables from finished group-stage fixtures.
 */
function deriveGroupsFromMatches(worldCup) {
  const groupRe = /group\s+([a-l])/i;
  const tables = new Map();

  const ensure = (gKey, teamName, badge) => {
    if (!tables.has(gKey)) tables.set(gKey, new Map());
    const t = tables.get(gKey);
    if (!t.has(teamName)) {
      t.set(teamName, {
        id: teamName,
        name: teamName,
        short: null,
        badge: badge || null,
        rank: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        gdDisplay: null,
        pts: 0,
        form: null,
        advanced: false,
        note: null,
      });
    }
    return t.get(teamName);
  };

  for (const m of worldCup) {
    const blob = `${m.stage || ''} ${m.round || ''}`;
    const gm = blob.match(groupRe);
    if (!gm) continue;
    if (m.status !== 'FINISHED') continue;
    if (m.homeScore == null || m.awayScore == null) continue;
    if (isPlaceholderName(m.home) || isPlaceholderName(m.away)) continue;

    const gKey = gm[1].toUpperCase();
    const home = ensure(gKey, m.home, m.homeBadge);
    const away = ensure(gKey, m.away, m.awayBadge);
    home.played += 1;
    away.played += 1;
    home.gf += m.homeScore;
    home.ga += m.awayScore;
    away.gf += m.awayScore;
    away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) {
      home.won += 1;
      home.pts += 3;
      away.lost += 1;
    } else if (m.homeScore < m.awayScore) {
      away.won += 1;
      away.pts += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.pts += 1;
      away.pts += 1;
    }
  }

  const groups = [];
  for (const [letter, teamMap] of tables) {
    const teams = [...teamMap.values()].map((t) => {
      t.gd = t.gf - t.ga;
      t.gdDisplay = t.gd > 0 ? `+${t.gd}` : String(t.gd);
      return t;
    });
    teams.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    teams.forEach((t, i) => {
      t.rank = i + 1;
      t.advanced = i < 2;
    });
    groups.push({
      id: letter,
      name: `Group ${letter}`,
      abbreviation: `Group ${letter}`,
      teams,
    });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Group standings + knockout bracket (auto-updates with live results). */
// ---------------------------------------------------------------------------
// Live World Cup commentary feed for the watch page
// GET /api/scores/commentary
//   ?event=espn-760510 | 760510  (optional — pick one match)
// Returns LIVE (and recent FINISHED) WC matches + play-by-play timeline.
// ---------------------------------------------------------------------------
let commentaryCache = { data: null, timestamp: 0 };
const COMMENTARY_TTL = 20 * 1000;

function parseEspnEventId(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/(?:espn-)?(\d{5,})/);
  return m ? m[1] : null;
}

function normalizeCommentaryFromSummary(data, matchMeta = {}) {
  const events = [];
  for (const e of data?.keyEvents || []) {
    events.push({
      id: e.id || `ke-${events.length}`,
      kind: 'key',
      type: e.type?.type || e.type?.text || 'event',
      typeLabel: e.type?.text || 'Event',
      clock: e.clock?.displayValue || '',
      text: e.text || '',
      scoringPlay: Boolean(e.scoringPlay),
      team: e.team?.displayName || null,
      player: e.participants?.[0]?.athlete?.displayName || null,
    });
  }
  for (const c of (data?.commentary || []).slice(0, 50)) {
    const text = c.text || '';
    if (!text) continue;
    // Skip pure key-event duplicates when text already present
    if (events.some((ev) => ev.text === text)) continue;
    events.push({
      id: c.play?.id || `cm-${c.sequence || events.length}`,
      kind: 'commentary',
      type: c.play?.type?.type || 'commentary',
      typeLabel: c.play?.type?.text || 'Commentary',
      clock: c.time?.displayValue || c.play?.clock?.displayValue || '',
      text,
      scoringPlay: false,
      team: c.play?.team?.displayName || null,
      player: null,
    });
  }

  // Prefer newest first for a live feed feel
  const reversed = [...events].reverse();

  const header = data?.header?.competitions?.[0];
  const competitors = header?.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  const statusType = header?.status?.type || data?.header?.competitions?.[0]?.status?.type || {};

  return {
    id: matchMeta.id || `espn-${data?.header?.id || ''}`,
    eventId: parseEspnEventId(matchMeta.id) || String(data?.header?.id || ''),
    home: matchMeta.home || home?.team?.displayName || 'Home',
    away: matchMeta.away || away?.team?.displayName || 'Away',
    homeScore:
      matchMeta.homeScore != null
        ? matchMeta.homeScore
        : home?.score != null
          ? Number(home.score)
          : null,
    awayScore:
      matchMeta.awayScore != null
        ? matchMeta.awayScore
        : away?.score != null
          ? Number(away.score)
          : null,
    homeBadge:
      matchMeta.homeBadge
      || home?.team?.logo
      || home?.team?.logos?.find((l) => (l.rel || []).includes('full') && !(l.rel || []).includes('dark'))?.href
      || home?.team?.logos?.[0]?.href
      || null,
    awayBadge:
      matchMeta.awayBadge
      || away?.team?.logo
      || away?.team?.logos?.find((l) => (l.rel || []).includes('full') && !(l.rel || []).includes('dark'))?.href
      || away?.team?.logos?.[0]?.href
      || null,
    status: matchMeta.status || (statusType.state === 'in' ? 'LIVE' : statusType.completed ? 'FINISHED' : 'UPCOMING'),
    progress: matchMeta.progress || header?.status?.displayClock || statusType.detail || null,
    stage: matchMeta.stage || matchMeta.round || null,
    league: 'FIFA World Cup',
    events: reversed.slice(0, 60),
    matchCenterPath: matchMeta.id
      ? `/match/${String(matchMeta.id).replace(/^espn-/, '')}?league=fifa.world`
      : null,
  };
}

async function fetchEspnSummary(eventId) {
  const url = `${ESPN_BASE}/fifa.world/summary?event=${eventId}`;
  return fetchJson(url, 12000);
}

async function buildLiveCommentaryFeed(preferredEventId = null) {
  // Prefer live board from cache / recent WC build
  let worldCup = [];
  try {
    if (cache.data?.worldCup?.length) {
      worldCup = cache.data.worldCup;
    } else {
      worldCup = await buildEspnWorldCup();
    }
  } catch {
    worldCup = cache.data?.worldCup || wcCache.data || [];
  }

  const live = worldCup.filter((m) => m.status === 'LIVE');
  const finished = worldCup
    .filter((m) => m.status === 'FINISHED')
    .slice(0, 4);
  // Prefer LIVE; if none, show latest finished so UI is never empty mid-day
  let targets = live.length ? live : finished;

  if (preferredEventId) {
    const preferred =
      worldCup.find((m) => parseEspnEventId(m.id) === preferredEventId)
      || { id: `espn-${preferredEventId}` };
    targets = [preferred, ...targets.filter((m) => parseEspnEventId(m.id) !== preferredEventId)];
  }

  // Cap concurrent ESPN summary fetches
  const slice = targets.slice(0, 4);
  const matches = [];
  await Promise.all(
    slice.map(async (m) => {
      const eid = parseEspnEventId(m.id);
      if (!eid) return;
      try {
        const summary = await fetchEspnSummary(eid);
        if (!summary) return;
        matches.push(normalizeCommentaryFromSummary(summary, m));
      } catch (err) {
        console.warn('[scores/commentary] summary failed', eid, err.message);
      }
    })
  );

  // Keep preferred first, then LIVE, then rest
  matches.sort((a, b) => {
    if (preferredEventId) {
      if (a.eventId === preferredEventId) return -1;
      if (b.eventId === preferredEventId) return 1;
    }
    if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
    if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
    return 0;
  });

  return {
    ok: true,
    liveCount: matches.filter((m) => m.status === 'LIVE').length,
    matches,
    source: 'espn-fifa.world',
    note:
      matches.some((m) => m.status === 'LIVE')
        ? 'Live World Cup commentary'
        : matches.length
          ? 'No live matches right now — showing recent finals commentary'
          : 'No World Cup commentary available yet',
    updatedAt: Date.now(),
  };
}

router.get('/commentary', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=15');

  const preferred = parseEspnEventId(req.query.event || req.query.id || '');
  const cacheKeyOk =
    commentaryCache.data
    && Date.now() - commentaryCache.timestamp < COMMENTARY_TTL
    && (!preferred || commentaryCache.preferred === preferred);

  if (cacheKeyOk) {
    return res.json({ ...commentaryCache.data, cached: true });
  }

  try {
    const payload = await buildLiveCommentaryFeed(preferred);
    commentaryCache = {
      data: payload,
      timestamp: Date.now(),
      preferred: preferred || null,
    };
    res.json({ ...payload, cached: false });
  } catch (err) {
    console.error('[scores/commentary] error:', err.message);
    if (commentaryCache.data) {
      return res.json({ ...commentaryCache.data, stale: true, cached: true });
    }
    res.status(502).json({
      ok: false,
      error: 'Commentary unavailable',
      matches: [],
      liveCount: 0,
    });
  }
});

router.get('/standings', async (_req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=30');

  if (
    standingsCache.data &&
    Date.now() - standingsCache.timestamp < STANDINGS_TTL
  ) {
    return res.json({
      ...standingsCache.data,
      updatedAt: standingsCache.timestamp,
      cached: true,
    });
  }

  try {
    const payload = await buildStandingsPayload();
    if (!payload.groups.length && !payload.bracket.rounds.length) {
      if (standingsCache.data) {
        return res.json({
          ...standingsCache.data,
          updatedAt: standingsCache.timestamp,
          stale: true,
        });
      }
      return res.json({
        groups: [],
        bracket: { rounds: [] },
        phase: 'Group Stage',
        legend: [],
        source: 'empty',
        updatedAt: Date.now(),
      });
    }
    standingsCache = { data: payload, timestamp: Date.now() };
    res.json({ ...payload, updatedAt: Date.now(), cached: false });
  } catch (err) {
    console.error('[scores/standings] error:', err.message);
    if (standingsCache.data) {
      return res.json({
        ...standingsCache.data,
        updatedAt: standingsCache.timestamp,
        stale: true,
      });
    }
    res.status(502).json({
      ok: false,
      error: 'Standings unavailable',
      groups: [],
      bracket: { rounds: [] },
    });
  }
});

router.get('/', async (_req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=30');

  if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
    const hasRows = cache.data.matches?.length || cache.data.worldCup?.length;
    if (hasRows) {
      return res.json({ ...cache.data, updatedAt: cache.timestamp, cached: true });
    }
  }

  try {
    const payload = await buildAll();

    if (!payload.matches.length && !payload.worldCup.length) {
      if (cache.data && (cache.data.matches?.length || cache.data.worldCup?.length)) {
        return res.json({ ...cache.data, updatedAt: cache.timestamp, stale: true });
      }
      console.warn('[scores] upstream empty — serving fallback ticker data');
      return res.json({
        matches: FALLBACK_MATCHES,
        worldCup: [],
        source: 'fallback',
        updatedAt: Date.now(),
        cached: false,
      });
    }

    cache = { data: payload, timestamp: Date.now() };
    res.json({ ...payload, updatedAt: Date.now(), cached: false });
  } catch (err) {
    console.error('[scores] error:', err.message);
    if (cache.data && (cache.data.matches?.length || cache.data.worldCup?.length)) {
      return res.json({ ...cache.data, updatedAt: cache.timestamp, stale: true });
    }
    res.json({
      matches: FALLBACK_MATCHES,
      worldCup: [],
      source: 'fallback',
      fallback: true,
      updatedAt: Date.now(),
    });
  }
});

export default router;
