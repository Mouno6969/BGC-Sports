// ---------------------------------------------------------------------------
// Sports Data Collector — Aggregates real-time World Cup data from multiple
// sources: ESPN, BBC Sport, TheSportsDB, and other reliable sports APIs.
//
// Provides: live scores, match commentary, player stats, team lineups,
// coach info, historical head-to-head records, and tournament standings.
// ---------------------------------------------------------------------------

const THESPORTSDB_API = 'https://www.thesportsdb.com/api/v1/json/3';
const WORLD_CUP_ID = '4429';

// ESPN endpoints (public web API)
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_SCOREBOARD = `${ESPN_BASE}/fifa.world/scoreboard`;
const ESPN_NEWS = `${ESPN_BASE}/fifa.world/news`;
const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings';

// Cache for expensive API calls
const dataCache = new Map();
const CACHE_TTL = 20 * 1000; // 20s for live scoreboard (matches move fast)
const LONG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for static data

/**
 * Normalize ESPN status.type → LIVE | FINISHED | UPCOMING | POSTPONED
 * ESPN uses description "Second Half" / "First Half" — NOT "In Progress".
 * Always prefer type.state: in | pre | post.
 */
export function mapEspnMatchStatus(statusType = {}, statusObj = {}) {
  const name = String(statusType.name || '').toUpperCase();
  const state = String(statusType.state || '').toLowerCase();
  const desc = String(statusType.description || statusType.detail || '').toLowerCase();
  const completed = Boolean(statusType.completed);

  if (
    state === 'in' ||
    name.includes('IN_PROGRESS') ||
    name.includes('HALFTIME') ||
    name.includes('EXTRA_TIME') ||
    name.includes('PENALTY') ||
    name.includes('SECOND_HALF') ||
    name.includes('FIRST_HALF') ||
    /half|extra time|penalt|in progress|live/i.test(desc)
  ) {
    return 'LIVE';
  }
  if (
    completed ||
    state === 'post' ||
    name.includes('FINAL') ||
    name.includes('FULL_TIME') ||
    name.includes('STATUS_FINAL') ||
    /full time|final|ft-pens|aet/i.test(desc)
  ) {
    return 'FINISHED';
  }
  if (name.includes('POSTPONED') || /postponed/i.test(desc)) return 'POSTPONED';
  if (name.includes('CANCEL')) return 'CANCELLED';
  return 'UPCOMING';
}

function isLiveEspnRow(m) {
  if (!m) return false;
  if (m.statusCode === 'LIVE') return true;
  const s = String(m.status || '').toLowerCase();
  return (
    s === 'live' ||
    s === 'in progress' ||
    s === 'halftime' ||
    s.includes('half') ||
    s.includes('extra') ||
    s.includes('penalt')
  );
}

function getCached(key) {
  const entry = dataCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    dataCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  dataCache.set(key, { data, ts: Date.now(), ttl });
}

async function fetchJson(url, timeout = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchText(url, timeout = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BGCSportsBot/1.0)',
        'Accept': 'text/html,application/json',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// TheSportsDB — World Cup matches, teams, players
// ---------------------------------------------------------------------------

export async function getWorldCupLiveScores() {
  const cached = getCached('wc_live');
  if (cached) return cached;

  const data = await fetchJson(`${THESPORTSDB_API}/livescore.php?s=Soccer`);
  const wcMatches = [];
  if (data?.events) {
    for (const e of data.events) {
      if (e.strLeague?.toLowerCase().includes('world cup')) {
        wcMatches.push({
          id: e.idEvent,
          home: e.strHomeTeam,
          away: e.strAwayTeam,
          homeScore: e.intHomeScore,
          awayScore: e.intAwayScore,
          progress: e.strProgress,
          status: 'LIVE',
          venue: e.strVenue,
          league: e.strLeague,
        });
      }
    }
  }
  setCache('wc_live', wcMatches);
  return wcMatches;
}

export async function getWorldCupResults() {
  const cached = getCached('wc_results');
  if (cached) return cached;

  const data = await fetchJson(`${THESPORTSDB_API}/eventspastleague.php?id=${WORLD_CUP_ID}`);
  const matches = [];
  if (data?.events) {
    for (const e of data.events.slice(0, 15)) {
      matches.push({
        id: e.idEvent,
        home: e.strHomeTeam,
        away: e.strAwayTeam,
        homeScore: e.intHomeScore,
        awayScore: e.intAwayScore,
        date: e.dateEvent,
        venue: e.strVenue,
        round: e.intRound,
        status: 'FINISHED',
      });
    }
  }
  setCache('wc_results', matches, LONG_CACHE_TTL);
  return matches;
}

export async function getWorldCupUpcoming() {
  const cached = getCached('wc_upcoming');
  if (cached) return cached;

  const data = await fetchJson(`${THESPORTSDB_API}/eventsnextleague.php?id=${WORLD_CUP_ID}`);
  const matches = [];
  if (data?.events) {
    for (const e of data.events.slice(0, 15)) {
      matches.push({
        id: e.idEvent,
        home: e.strHomeTeam,
        away: e.strAwayTeam,
        timestamp: e.strTimestamp,
        date: e.dateEvent,
        time: e.strTime,
        venue: e.strVenue,
        round: e.intRound,
        status: 'UPCOMING',
      });
    }
  }
  setCache('wc_upcoming', matches, LONG_CACHE_TTL);
  return matches;
}

export async function getTeamDetails(teamName) {
  const cacheKey = `team_${teamName}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await fetchJson(
    `${THESPORTSDB_API}/searchteams.php?t=${encodeURIComponent(teamName)}`
  );
  if (data?.teams?.[0]) {
    const team = data.teams[0];
    const result = {
      name: team.strTeam,
      country: team.strCountry,
      stadium: team.strStadium,
      manager: team.strManager,
      description: team.strDescriptionEN?.slice(0, 500),
      badge: team.strBadge,
      formedYear: team.intFormedYear,
    };
    setCache(cacheKey, result, LONG_CACHE_TTL);
    return result;
  }
  return null;
}

export async function getPlayerDetails(playerName) {
  const cacheKey = `player_${playerName}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await fetchJson(
    `${THESPORTSDB_API}/searchplayers.php?p=${encodeURIComponent(playerName)}`
  );
  if (data?.player?.[0]) {
    const p = data.player[0];
    const result = {
      name: p.strPlayer,
      nationality: p.strNationality,
      team: p.strTeam,
      position: p.strPosition,
      dateBorn: p.dateBorn,
      description: p.strDescriptionEN?.slice(0, 500),
      height: p.strHeight,
      weight: p.strWeight,
      wage: p.strWage,
    };
    setCache(cacheKey, result, LONG_CACHE_TTL);
    return result;
  }
  return null;
}

// ---------------------------------------------------------------------------
// ESPN — Scoreboard, news, and detailed match data
// ---------------------------------------------------------------------------

export async function getESPNScoreboard() {
  const cached = getCached('espn_scoreboard');
  if (cached) return cached;

  // Prefer multi-day window so knockout slate is present, fall back to default board
  const today = new Date();
  const ymd = (d) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const start = new Date(today.getTime() - 2 * 86400000);
  const end = new Date(today.getTime() + 5 * 86400000);
  const rangeUrl = `${ESPN_SCOREBOARD}?dates=${ymd(start)}-${ymd(end)}`;

  let data = await fetchJson(rangeUrl, 10000);
  if (!data?.events?.length) {
    data = await fetchJson(ESPN_SCOREBOARD, 10000);
  }
  if (!data?.events) return [];

  const matches = data.events.map((event) => {
    const competition = event.competitions?.[0] || {};
    const competitors = competition.competitors || [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    const statusObj = competition.status || event.status || {};
    const statusType = statusObj.type || {};
    const statusCode = mapEspnMatchStatus(statusType, statusObj);
    const note =
      competition.altGameNote ||
      (competition.notes || []).map((n) => n.headline).filter(Boolean).join(', ') ||
      null;

    return {
      id: event.id,
      name: event.name,
      date: event.date || competition.date || competition.startDate,
      // Canonical code for the AI — never invent finished from a live 1-1
      statusCode,
      status: statusType.description || statusType.detail || statusCode,
      statusDetail: statusType.detail || statusType.shortDetail || null,
      statusState: statusType.state || null,
      completed: Boolean(statusType.completed),
      clock: statusObj.displayClock || null,
      period: statusObj.period || null,
      home: {
        name: home?.team?.displayName,
        abbreviation: home?.team?.abbreviation,
        score: home?.score != null && home?.score !== '' ? Number(home.score) : null,
        winner: Boolean(home?.winner),
        logo: home?.team?.logo,
      },
      away: {
        name: away?.team?.displayName,
        abbreviation: away?.team?.abbreviation,
        score: away?.score != null && away?.score !== '' ? Number(away.score) : null,
        winner: Boolean(away?.winner),
        logo: away?.team?.logo,
      },
      venue: competition.venue?.fullName,
      stage: note,
      broadcasts: competition.broadcasts?.map((b) => b.names?.join(', ')),
    };
  });

  // Dedupe by id
  const byId = new Map();
  for (const m of matches) {
    if (m?.id) byId.set(String(m.id), m);
  }
  const list = [...byId.values()];
  setCache('espn_scoreboard', list);
  return list;
}

/**
 * Authoritative live board for the AI — prefer local /api/scores (full WC
 * schedule), merge any ESPN rows, never replace a rich board with a sparse one.
 */
export async function getVerifiedWorldCupBoard() {
  const cached = getCached('verified_wc_board');
  // Don't serve a tiny stale board if we previously cached a sparse ESPN-only fallback
  if (cached && cached.length >= 20) return cached;

  const port = process.env.PORT || 4000;
  const byId = new Map();

  const upsert = (m) => {
    if (!m?.home || !m?.away) return;
    const key = m.id || `${m.home}|${m.away}|${m.timestamp || m.date || ''}`;
    const prev = byId.get(key);
    // Prefer rows that already have scores / finished status
    if (prev && prev.status === 'FINISHED' && m.status !== 'FINISHED') return;
    if (prev && prev.homeScore != null && m.homeScore == null) return;
    byId.set(key, { ...prev, ...m, id: m.id || prev?.id });
  };

  try {
    const data = await fetchJson(`http://127.0.0.1:${port}/api/scores`, 12000);
    const rows = [...(data?.worldCup || []), ...(data?.matches || [])];
    for (const m of rows) {
      upsert({
        id: m.id,
        home: m.home,
        away: m.away,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        status: m.status,
        progress: m.progress || m.statusDetail || null,
        statusDetail: m.statusDetail || null,
        stage: m.stage || m.round || null,
        venue: m.venue || null,
        timestamp: m.timestamp || null,
        source: m.source || 'scores-api',
      });
    }
  } catch (err) {
    console.warn('[verified-board] scores API failed:', err.message);
  }

  // Always merge ESPN window (adds LIVE clocks); do not replace full WC list
  try {
    const espn = await getESPNScoreboard();
    for (const m of espn) {
      upsert({
        id: m.id ? `espn-${m.id}` : undefined,
        home: m.home?.name,
        away: m.away?.name,
        homeScore: m.home?.score,
        awayScore: m.away?.score,
        status: m.statusCode || 'UPCOMING',
        progress: m.statusCode === 'LIVE' ? m.clock || m.statusDetail : m.statusDetail,
        statusDetail: m.statusDetail,
        stage: m.stage,
        venue: m.venue,
        timestamp: m.date,
        source: 'espn-direct',
      });
    }
  } catch {
    /* ignore */
  }

  let verified = [...byId.values()];

  // Sort: LIVE first, then upcoming, then finished (newest finished first)
  const order = { LIVE: 0, UPCOMING: 1, POSTPONED: 2, FINISHED: 3 };
  verified.sort((a, b) => {
    const oa = order[a.status] ?? 9;
    const ob = order[b.status] ?? 9;
    if (oa !== ob) return oa - ob;
    if (a.status === 'FINISHED') {
      return (new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    }
    return (new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  });

  // Never cache a sparse ESPN-window-only board — full WC schedule is 50–100+ rows
  if (verified.length >= 20) {
    setCache('verified_wc_board', verified, CACHE_TTL);
  } else if (verified.length) {
    // Short cache only so we retry full /api/scores soon
    setCache('verified_wc_board', verified, 5 * 1000);
  }
  return verified;
}

export async function getESPNNews() {
  const cached = getCached('espn_news');
  if (cached) return cached;

  const data = await fetchJson(ESPN_NEWS);
  if (!data?.articles) return [];

  const articles = data.articles.slice(0, 10).map((a) => ({
    headline: a.headline,
    description: a.description,
    published: a.published,
    type: a.type,
  }));

  setCache('espn_news', articles, LONG_CACHE_TTL);
  return articles;
}

// ---------------------------------------------------------------------------
// ESPN Match Commentary / Play-by-Play
// ---------------------------------------------------------------------------

export async function getMatchCommentary(eventId) {
  if (!eventId) return [];
  const cacheKey = `commentary_${eventId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // ESPN play-by-play endpoint
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${eventId}`;
  const data = await fetchJson(url);

  const commentary = [];

  // Extract key events (goals, cards, substitutions)
  if (data?.keyEvents) {
    for (const event of data.keyEvents) {
      commentary.push({
        type: event.type?.text || 'Event',
        clock: event.clock?.displayValue,
        text: event.text,
        team: event.team?.displayName,
        player: event.participants?.[0]?.athlete?.displayName,
      });
    }
  }

  // Extract commentary/play-by-play
  if (data?.commentary) {
    for (const item of data.commentary.slice(0, 30)) {
      commentary.push({
        type: 'commentary',
        clock: item.time?.displayValue,
        text: item.text,
      });
    }
  }

  // Extract match statistics
  if (data?.boxscore?.teams) {
    commentary.push({
      type: 'stats',
      data: data.boxscore.teams.map((t) => ({
        team: t.team?.displayName,
        statistics: t.statistics?.slice(0, 10).map((s) => ({
          name: s.name,
          displayValue: s.displayValue,
        })),
      })),
    });
  }

  // Extract lineups
  if (data?.rosters) {
    for (const roster of data.rosters) {
      commentary.push({
        type: 'lineup',
        team: roster.team?.displayName,
        formation: roster.formation,
        players: roster.entries?.slice(0, 15).map((e) => ({
          name: e.athlete?.displayName,
          position: e.position?.abbreviation,
          jersey: e.jersey,
          starter: e.starter,
        })),
      });
    }
  }

  setCache(cacheKey, commentary);
  return commentary;
}

// ---------------------------------------------------------------------------
// World Cup Standings / Group Tables
// ---------------------------------------------------------------------------

export async function getWorldCupStandings() {
  const cached = getCached('wc_standings');
  if (cached) return cached;

  const data = await fetchJson(
    `${THESPORTSDB_API}/lookuptable.php?l=${WORLD_CUP_ID}&s=2026`
  );

  if (!data?.table) return [];

  const standings = data.table.map((entry) => ({
    team: entry.strTeam,
    played: entry.intPlayed,
    won: entry.intWin,
    drawn: entry.intDraw,
    lost: entry.intLoss,
    goalsFor: entry.intGoalsFor,
    goalsAgainst: entry.intGoalsAgainst,
    goalDifference: entry.intGoalDifference,
    points: entry.intPoints,
    group: entry.strGroup,
  }));

  setCache('wc_standings', standings, LONG_CACHE_TTL);
  return standings;
}

// ---------------------------------------------------------------------------
// BBC Sport / Additional Sources — Scrape headlines
// ---------------------------------------------------------------------------

export async function getBBCSportHeadlines() {
  const cached = getCached('bbc_headlines');
  if (cached) return cached;

  // BBC Sport RSS feed for football
  const rssUrl = 'https://feeds.bbci.co.uk/sport/football/rss.xml';
  const text = await fetchText(rssUrl);
  if (!text) return [];

  const headlines = [];
  const itemRegex = /<item>[\s\S]*?<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
  const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/;

  const items = text.match(itemRegex) || [];
  for (const item of items.slice(0, 8)) {
    const titleMatch = item.match(titleRegex);
    const descMatch = item.match(descRegex);
    const title = titleMatch?.[1] || titleMatch?.[2] || '';
    const desc = descMatch?.[1] || descMatch?.[2] || '';
    if (title.toLowerCase().includes('world cup') || title.toLowerCase().includes('fifa')) {
      headlines.push({ title, description: desc });
    }
  }

  // If no World Cup specific headlines, take top football ones
  if (headlines.length === 0) {
    for (const item of items.slice(0, 5)) {
      const titleMatch = item.match(titleRegex);
      const descMatch = item.match(descRegex);
      headlines.push({
        title: titleMatch?.[1] || titleMatch?.[2] || '',
        description: descMatch?.[1] || descMatch?.[2] || '',
      });
    }
  }

  setCache('bbc_headlines', headlines, LONG_CACHE_TTL);
  return headlines;
}

// ---------------------------------------------------------------------------
// Aggregate all World Cup context for AI analysis
// ---------------------------------------------------------------------------

export async function collectFullMatchContext() {
  const [live, results, upcoming, espnScoreboard, espnNews, standings, bbcNews] =
    await Promise.allSettled([
      getWorldCupLiveScores(),
      getWorldCupResults(),
      getWorldCupUpcoming(),
      getESPNScoreboard(),
      getESPNNews(),
      getWorldCupStandings(),
      getBBCSportHeadlines(),
    ]);

  // For live matches, also fetch commentary
  const liveMatches = live.status === 'fulfilled' ? live.value : [];
  const espnMatches = espnScoreboard.status === 'fulfilled' ? espnScoreboard.value : [];

  let commentaryData = [];
  if (espnMatches.length > 0) {
    const liveESPN = espnMatches.filter((m) => isLiveEspnRow(m));
    if (liveESPN.length > 0) {
      const commentaries = await Promise.allSettled(
        liveESPN.slice(0, 3).map((m) => getMatchCommentary(m.id))
      );
      commentaryData = commentaries
        .filter((c) => c.status === 'fulfilled')
        .map((c) => c.value);
    }
  }

  const verifiedBoard = await getVerifiedWorldCupBoard().catch(() => []);

  return {
    liveMatches,
    verifiedBoard,
    recentResults: results.status === 'fulfilled' ? results.value : [],
    upcomingFixtures: upcoming.status === 'fulfilled' ? upcoming.value : [],
    espnScoreboard: espnMatches,
    espnNews: espnNews.status === 'fulfilled' ? espnNews.value : [],
    standings: standings.status === 'fulfilled' ? standings.value : [],
    bbcHeadlines: bbcNews.status === 'fulfilled' ? bbcNews.value : [],
    commentary: commentaryData,
    collectedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Targeted data collection based on user query
// ---------------------------------------------------------------------------

/**
 * Collect sports context ONLY for tools the plan requested.
 * @param {string} query
 * @param {{ needsLiveScores?: boolean, needsStandings?: boolean, needsNews?: boolean, needsDeep?: boolean, needsIncident?: boolean } | null} planOpts
 */
export async function collectContextForQuery(query, planOpts = null) {
  const lowerQuery = query.toLowerCase();
  const teamKeywords = extractTeamNames(lowerQuery);
  const playerKeywords = extractPlayerNames(lowerQuery);

  const wantsLive =
    planOpts?.needsLiveScores === true ||
    (planOpts == null &&
      /\b(live|score|winning|fixture|upcoming|kick.?off|correct score)\b/i.test(lowerQuery));
  const wantsStandings =
    planOpts?.needsStandings === true ||
    (planOpts == null && /\b(table|standing|group|bracket)\b/i.test(lowerQuery));
  const wantsIncident =
    planOpts?.needsIncident === true ||
    /\b(yellow|red|card|coach|manager|booking|booked|sent off|why|referee|var|dissent)\b/i.test(
      lowerQuery
    );
  const wantsDeep =
    planOpts?.needsDeep === true ||
    wantsStandings ||
    wantsIncident ||
    planOpts?.needsNews === true ||
    /\b(predict|analysis|form|stats|lineup|tactics)\b/i.test(lowerQuery);

  // Fast empty shell when the user did not ask for scores/context at all
  if (planOpts && !wantsLive && !wantsStandings && !wantsDeep && !wantsIncident) {
    return {
      verifiedBoard: [],
      liveMatches: [],
      recentResults: [],
      upcomingFixtures: [],
      espnScoreboard: [],
      liveCount: 0,
      skipped: true,
      skipReason: 'plan_no_sports_context',
      collectedAt: new Date().toISOString(),
    };
  }

  // Board only when live scores / prediction / incident grounding needed
  let verifiedBoard = [];
  if (wantsLive || wantsIncident || wantsDeep || planOpts == null) {
    verifiedBoard = await getVerifiedWorldCupBoard().catch(() => []);
  }
  const liveCount = verifiedBoard.filter((m) => m.status === 'LIVE').length;

  const baseContext = {
    verifiedBoard: wantsLive || wantsIncident || wantsDeep ? verifiedBoard : [],
    liveMatches: wantsLive ? verifiedBoard.filter((m) => m.status === 'LIVE') : [],
    recentResults: wantsLive || wantsIncident
      ? verifiedBoard.filter((m) => m.status === 'FINISHED').slice(0, 12)
      : [],
    upcomingFixtures: wantsLive
      ? verifiedBoard.filter((m) => m.status === 'UPCOMING').slice(0, 12)
      : [],
    espnScoreboard: [],
    skipped: false,
  };

  // ESPN scoreboard for LIVE clocks; news/standings when needed
  if (wantsLive || wantsDeep || wantsIncident) {
    const [espnScoreboard, standings, espnNews] = await Promise.all([
      wantsLive || wantsIncident ? getESPNScoreboard().catch(() => []) : Promise.resolve([]),
      wantsStandings || wantsDeep ? getWorldCupStandings().catch(() => []) : Promise.resolve([]),
      wantsDeep || wantsIncident || planOpts?.needsNews
        ? getESPNNews().catch(() => [])
        : Promise.resolve([]),
    ]);
    baseContext.espnScoreboard = espnScoreboard;
    if (standings?.length) baseContext.standings = standings;
    if (espnNews?.length) baseContext.espnNews = espnNews;

    // Commentary for LIVE games OR for finished matches matching named teams (cards etc.)
    const liveESPN = (espnScoreboard || []).filter((m) => isLiveEspnRow(m));
    let commentaryTargets = wantsLive ? liveESPN.slice(0, 1).map((m) => m.id) : [];

    if (wantsIncident || (teamKeywords.length >= 1 && wantsDeep)) {
      const relevant = verifiedBoard.filter((m) => {
        if (m.status !== 'FINISHED' && m.status !== 'LIVE') return false;
        const blob = `${m.home || ''} ${m.away || ''}`.toLowerCase();
        return teamKeywords.some((t) => blob.includes(t));
      });
      for (const m of relevant.slice(0, 2)) {
        const eid = String(m.id || '').replace(/^espn-/, '');
        if (/^\d+$/.test(eid)) commentaryTargets.push(eid);
      }
    }

    commentaryTargets = [...new Set(commentaryTargets.filter(Boolean))].slice(0, 2);
    if (commentaryTargets.length) {
      const commentaries = await Promise.allSettled(
        commentaryTargets.map((id) => getMatchCommentary(id))
      );
      baseContext.commentary = commentaries
        .filter((c) => c.status === 'fulfilled')
        .map((c) => c.value);
    }
  }

  if (teamKeywords.length > 0 && (wantsDeep || wantsIncident || wantsLive)) {
    const teamDetails = await Promise.allSettled(
      teamKeywords.slice(0, 3).map((t) => getTeamDetails(t))
    );
    baseContext.teamDetails = teamDetails
      .filter((t) => t.status === 'fulfilled' && t.value)
      .map((t) => t.value);
  }

  if (playerKeywords.length > 0 && (wantsDeep || wantsLive)) {
    const playerDetails = await Promise.allSettled(
      playerKeywords.slice(0, 2).map((p) => getPlayerDetails(p))
    );
    baseContext.playerDetails = playerDetails
      .filter((p) => p.status === 'fulfilled' && p.value)
      .map((p) => p.value);
  }

  if (
    (planOpts?.needsNews || /\b(news|update|latest|headline)\b/i.test(lowerQuery)) &&
    !baseContext.bbcHeadlines
  ) {
    baseContext.bbcHeadlines = await getBBCSportHeadlines().catch(() => []);
  }

  baseContext.collectedAt = new Date().toISOString();
  baseContext.liveCount = liveCount;
  return baseContext;
}

// ---------------------------------------------------------------------------
// Helper: Extract team/player names from user query
// ---------------------------------------------------------------------------

const KNOWN_TEAMS = [
  'argentina', 'brazil', 'france', 'germany', 'spain', 'england',
  'portugal', 'netherlands', 'belgium', 'italy', 'croatia', 'uruguay',
  'colombia', 'mexico', 'usa', 'united states', 'japan', 'south korea',
  'australia', 'saudi arabia', 'qatar', 'morocco', 'senegal', 'ghana',
  'cameroon', 'nigeria', 'egypt', 'tunisia', 'canada', 'ecuador',
  'chile', 'peru', 'paraguay', 'poland', 'denmark', 'sweden',
  'norway', 'switzerland', 'austria', 'czech republic', 'serbia',
  'wales', 'scotland', 'ireland', 'turkey', 'ukraine', 'russia',
  'iran', 'costa rica', 'panama', 'honduras', 'jamaica', 'algeria',
  'ivory coast', 'mali', 'congo', 'south africa', 'new zealand',
  'indonesia', 'india', 'china', 'thailand', 'vietnam', 'bangladesh',
];

const KNOWN_PLAYERS = [
  'messi', 'ronaldo', 'mbappe', 'haaland', 'vinicius', 'bellingham',
  'salah', 'de bruyne', 'kane', 'neymar', 'modric', 'kroos',
  'pedri', 'gavi', 'saka', 'foden', 'palmer', 'rice', 'yamal',
  'lewandowski', 'suarez', 'griezmann', 'dembele', 'martinez',
  'diaz', 'nunez', 'alvarez', 'garnacho', 'osimhen', 'son',
  'kubo', 'valverde', 'rodri', 'bernardo silva', 'bruno fernandes',
];

function extractTeamNames(query) {
  return KNOWN_TEAMS.filter((team) => query.includes(team));
}

function extractPlayerNames(query) {
  return KNOWN_PLAYERS.filter((player) => query.includes(player));
}
