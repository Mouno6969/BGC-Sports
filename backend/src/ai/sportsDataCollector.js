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

// Cache for expensive API calls
const dataCache = new Map();
const CACHE_TTL = 45 * 1000; // 45 seconds for live data
const LONG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for static data

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

  const data = await fetchJson(ESPN_SCOREBOARD);
  if (!data?.events) return [];

  const matches = data.events.map((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');

    return {
      id: event.id,
      name: event.name,
      date: event.date,
      status: competition?.status?.type?.description || 'Scheduled',
      statusDetail: competition?.status?.type?.detail,
      clock: competition?.status?.displayClock,
      period: competition?.status?.period,
      home: {
        name: home?.team?.displayName,
        abbreviation: home?.team?.abbreviation,
        score: home?.score,
        logo: home?.team?.logo,
      },
      away: {
        name: away?.team?.displayName,
        abbreviation: away?.team?.abbreviation,
        score: away?.score,
        logo: away?.team?.logo,
      },
      venue: competition?.venue?.fullName,
      broadcasts: competition?.broadcasts?.map((b) => b.names?.join(', ')),
    };
  });

  setCache('espn_scoreboard', matches);
  return matches;
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
    const liveESPN = espnMatches.filter(
      (m) => m.status === 'In Progress' || m.status === 'Halftime'
    );
    if (liveESPN.length > 0) {
      const commentaries = await Promise.allSettled(
        liveESPN.slice(0, 3).map((m) => getMatchCommentary(m.id))
      );
      commentaryData = commentaries
        .filter((c) => c.status === 'fulfilled')
        .map((c) => c.value);
    }
  }

  return {
    liveMatches,
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

export async function collectContextForQuery(query) {
  const lowerQuery = query.toLowerCase();

  // Always get live scores and recent results
  const baseContext = {
    liveMatches: await getWorldCupLiveScores(),
    recentResults: await getWorldCupResults(),
    upcomingFixtures: await getWorldCupUpcoming(),
  };

  // If asking about a specific team
  const teamKeywords = extractTeamNames(lowerQuery);
  if (teamKeywords.length > 0) {
    const teamDetails = await Promise.allSettled(
      teamKeywords.map((t) => getTeamDetails(t))
    );
    baseContext.teamDetails = teamDetails
      .filter((t) => t.status === 'fulfilled' && t.value)
      .map((t) => t.value);
  }

  // If asking about a specific player
  const playerKeywords = extractPlayerNames(lowerQuery);
  if (playerKeywords.length > 0) {
    const playerDetails = await Promise.allSettled(
      playerKeywords.map((p) => getPlayerDetails(p))
    );
    baseContext.playerDetails = playerDetails
      .filter((p) => p.status === 'fulfilled' && p.value)
      .map((p) => p.value);
  }

  // If asking about predictions, scores, or analysis — get full context
  if (
    lowerQuery.includes('predict') ||
    lowerQuery.includes('score') ||
    lowerQuery.includes('win') ||
    lowerQuery.includes('analysis') ||
    lowerQuery.includes('chance') ||
    lowerQuery.includes('odds') ||
    lowerQuery.includes('form') ||
    lowerQuery.includes('stats')
  ) {
    baseContext.espnScoreboard = await getESPNScoreboard();
    baseContext.standings = await getWorldCupStandings();
    baseContext.espnNews = await getESPNNews();
  }

  // If asking about live match or commentary
  if (
    lowerQuery.includes('live') ||
    lowerQuery.includes('commentary') ||
    lowerQuery.includes('happening') ||
    lowerQuery.includes('now') ||
    lowerQuery.includes('current')
  ) {
    const espnMatches = await getESPNScoreboard();
    baseContext.espnScoreboard = espnMatches;
    const liveESPN = espnMatches.filter(
      (m) => m.status === 'In Progress' || m.status === 'Halftime'
    );
    if (liveESPN.length > 0) {
      const commentaries = await Promise.allSettled(
        liveESPN.slice(0, 2).map((m) => getMatchCommentary(m.id))
      );
      baseContext.commentary = commentaries
        .filter((c) => c.status === 'fulfilled')
        .map((c) => c.value);
    }
  }

  // If asking about news or updates
  if (
    lowerQuery.includes('news') ||
    lowerQuery.includes('update') ||
    lowerQuery.includes('latest') ||
    lowerQuery.includes('headline')
  ) {
    baseContext.espnNews = await getESPNNews();
    baseContext.bbcHeadlines = await getBBCSportHeadlines();
  }

  baseContext.collectedAt = new Date().toISOString();
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
