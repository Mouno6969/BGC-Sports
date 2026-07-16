// ---------------------------------------------------------------------------
// SportsEvent JSON-LD builders (schema.org) for Google rich results.
// https://schema.org/SportsEvent
// ---------------------------------------------------------------------------

const SITE_NAME = 'BGC Sports';
const DEFAULT_SPORT = 'Soccer';

/**
 * Absolute site origin for URLs in structured data.
 */
export function getSiteOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  try {
    const envUrl = import.meta?.env?.VITE_SITE_URL;
    if (envUrl) return String(envUrl).replace(/\/$/, '');
  } catch { /* non-Vite runtime */ }
  return 'https://preview.cryptobgc.eu.cc';
}

function isoDate(match) {
  if (match?.timestamp) {
    const d = new Date(match.timestamp);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (match?.date) {
    // dateEvent is YYYY-MM-DD; optional strTime HH:MM:SS
    const time = match.time && match.time !== '00:00:00' ? match.time : '12:00:00';
    const d = new Date(`${match.date}T${time}Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return `${match.date}T12:00:00Z`;
  }
  return undefined;
}

function eventStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case 'LIVE':
      return 'https://schema.org/EventMovedOnline'; // still playing; keep EventScheduled for pure offline
    case 'FINISHED':
      return 'https://schema.org/EventScheduled'; // completed events still valid as past SportsEvent
    case 'CANCELLED':
      return 'https://schema.org/EventCancelled';
    case 'POSTPONED':
      return 'https://schema.org/EventPostponed';
    default:
      return 'https://schema.org/EventScheduled';
  }
}

function sportsTeam(name, badge) {
  if (!name) return undefined;
  const team = {
    '@type': 'SportsTeam',
    name: String(name),
    sport: DEFAULT_SPORT,
  };
  if (badge && String(badge).startsWith('http')) {
    team.logo = {
      '@type': 'ImageObject',
      url: badge,
    };
  }
  return team;
}

/**
 * Build a single schema.org SportsEvent from an API match object.
 */
export function buildSportsEvent(match, { pageUrl, includeScore = true } = {}) {
  if (!match?.home || !match?.away) return null;

  const startDate = isoDate(match);
  const name = `${match.home} vs ${match.away}`;
  const origin = getSiteOrigin();
  // Prefer dedicated Match Center URL when we have an ESPN-backed match id
  let defaultPath = `/?tab=${match.league?.toLowerCase().includes('world cup') ? 'worldcup' : 'scores'}`;
  try {
    const id = String(match.id || match.eventId || '');
    const num = id.match(/(\d{5,})$/)?.[1];
    if (num && (match.source === 'espn' || id.startsWith('espn-'))) {
      const slugHome = String(match.home || 'home')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const slugAway = String(match.away || 'away')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      defaultPath = `/match/${slugHome}-vs-${slugAway}-${num}`;
    }
  } catch { /* keep tab fallback */ }
  const url = pageUrl || `${origin}${defaultPath}`;

  const event = {
    '@type': 'SportsEvent',
    '@id': `${origin}/sports-event/${encodeURIComponent(match.id || name)}`,
    name,
    description: [
      match.league || 'Football match',
      match.venue ? `at ${match.venue}` : null,
      match.status === 'LIVE' && match.progress
        ? `Live — ${match.progress}'`
        : match.status === 'FINISHED' && match.homeScore != null
          ? `Final ${match.homeScore}–${match.awayScore}`
          : match.status === 'UPCOMING'
            ? 'Upcoming fixture'
            : null,
    ]
      .filter(Boolean)
      .join('. '),
    sport: DEFAULT_SPORT,
    url,
    eventStatus: eventStatus(match.status),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    homeTeam: sportsTeam(match.home, match.homeBadge),
    awayTeam: sportsTeam(match.away, match.awayBadge),
    competitor: [
      sportsTeam(match.home, match.homeBadge),
      sportsTeam(match.away, match.awayBadge),
    ].filter(Boolean),
    organizer: {
      '@type': 'Organization',
      name: match.league?.toLowerCase().includes('world cup')
        ? 'FIFA'
        : match.league || SITE_NAME,
    },
    performer: [
      sportsTeam(match.home, match.homeBadge),
      sportsTeam(match.away, match.awayBadge),
    ].filter(Boolean),
  };

  if (startDate) {
    event.startDate = startDate;
    // Estimate ~2h duration for football
    try {
      const end = new Date(startDate);
      end.setHours(end.getHours() + 2);
      event.endDate = end.toISOString();
    } catch { /* ignore */ }
  }

  if (match.venue) {
    event.location = {
      '@type': 'Place',
      name: match.venue,
      address: {
        '@type': 'PostalAddress',
        name: match.venue,
      },
    };
  } else {
    event.location = {
      '@type': 'VirtualLocation',
      url,
    };
    event.eventAttendanceMode = 'https://schema.org/OnlineEventAttendanceMode';
  }

  if (match.homeBadge || match.awayBadge) {
    event.image = [match.homeBadge, match.awayBadge].filter(
      (u) => u && String(u).startsWith('http')
    );
  }

  if (includeScore && match.homeScore != null && match.awayScore != null) {
    // Non-standard but useful custom property for our data layer;
    // Google primarily uses name/startDate/location/teams.
    event.additionalProperty = [
      {
        '@type': 'PropertyValue',
        name: 'homeScore',
        value: String(match.homeScore),
      },
      {
        '@type': 'PropertyValue',
        name: 'awayScore',
        value: String(match.awayScore),
      },
      {
        '@type': 'PropertyValue',
        name: 'matchStatus',
        value: match.status || '',
      },
    ];
  }

  // Free stream offer → watch page
  event.offers = {
    '@type': 'Offer',
    url: `${origin}/?tab=worldcup`,
    price: 0,
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    category: 'Free live stream',
  };

  return event;
}

/**
 * ItemList of SportsEvent objects for a scores / World Cup page.
 */
export function buildSportsEventList(matches = [], { listName, pagePath = '/' } = {}) {
  const origin = getSiteOrigin();
  const pageUrl = `${origin}${pagePath.startsWith('/') ? pagePath : `/${pagePath}`}`;
  const events = (matches || [])
    .map((m) => buildSportsEvent(m, { pageUrl }))
    .filter(Boolean)
    .slice(0, 40); // keep payload reasonable

  if (!events.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName || 'Live sports matches',
    description: 'Football match schedule, live scores, venues and kickoff times on BGC Sports.',
    numberOfItems: events.length,
    url: pageUrl,
    itemListElement: events.map((event, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: event,
    })),
  };
}

/**
 * Graph combining Organization + WebSite + SportsEvent list.
 */
export function buildPageSportsGraph(matches = [], options = {}) {
  const origin = getSiteOrigin();
  const list = buildSportsEventList(matches, options);
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: SITE_NAME,
      url: origin,
      logo: {
        '@type': 'ImageObject',
        url: `${origin}/logo.png`,
      },
      sameAs: [],
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      url: origin,
      name: SITE_NAME,
      description:
        'Watch live sports channels, FIFA World Cup, cricket, football and more. Free live streams and match scores.',
      publisher: { '@id': `${origin}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/?tab=channels&q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  if (list) {
    graph.push(list);
    // Also emit individual SportsEvent nodes for crawlers that prefer flat graphs
    for (const entry of list.itemListElement || []) {
      if (entry.item) graph.push(entry.item);
    }
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}
