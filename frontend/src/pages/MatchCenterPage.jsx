// ---------------------------------------------------------------------------
// MatchCenterPage — SEO destination for a single fixture:
// lineups, H2H, form guide, live commentary timeline, watch links.
// Route: /match/:slug  (e.g. /match/france-vs-morocco-760510)
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiGet, logoUrl } from '../lib/config.js';
import { formatKickoff, localTimeHint } from '../lib/utils.js';
import { extractEventId, matchPredictPath } from '../lib/matchLinks.js';
import { buildSportsEvent } from '../lib/sportsEventSchema.js';
import JsonLd from '../components/JsonLd.jsx';
import StadiumGrassScene from '../components/StadiumGrassScene.jsx';
import LiveBadge from '../components/LiveBadge.jsx';
import { Skeleton, MatchCardSkeleton } from '../components/Skeleton.jsx';
import MatchActionRow from '../components/MatchActionRow.jsx';
import { armChannelMediaTransition } from '../lib/viewTransitions.js';
import { sanitizeRoomCode } from '../lib/socket.js';

/** Short room code for “Start Watch Party” channel deep links. */
function newPartyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return sanitizeRoomCode(out) || out;
}

function withPartyOnWatchPath(watchPath, partyCode) {
  if (!watchPath || !partyCode) return watchPath;
  const join = watchPath.includes('?') ? '&' : '?';
  return `${watchPath}${join}party=${encodeURIComponent(partyCode)}`;
}

function TeamBlock({ name, badge, score, form, side }) {
  const [badgeFailed, setBadgeFailed] = useState(false);
  useEffect(() => {
    setBadgeFailed(false);
  }, [badge]);
  const showImg = Boolean(badge) && !badgeFailed;
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <div className={`flex flex-1 flex-col items-center gap-2 min-w-0 ${side === 'away' ? 'order-3' : ''}`}>
      {showImg ? (
        <img
          src={logoUrl(badge)}
          alt=""
          className="h-14 w-14 object-contain sm:h-16 sm:w-16"
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBadgeFailed(true)}
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-xl font-bold text-accent sm:h-16 sm:w-16">
          {initial}
        </div>
      )}
      <h2 className="text-center text-sm font-extrabold text-[var(--text-primary)] sm:text-base truncate w-full">
        {name}
      </h2>
      {form && (
        <div className="flex gap-0.5">
          {form.split('').slice(0, 5).map((r, i) => (
            <span
              key={i}
              className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${
                r === 'W'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : r === 'D'
                    ? 'bg-slate-500/20 text-slate-300'
                    : r === 'L'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
              }`}
            >
              {r}
            </span>
          ))}
        </div>
      )}
      {score != null && (
        <span className="sr-only">{side} score {score}</span>
      )}
    </div>
  );
}

function FormGuide({ form }) {
  if (!form?.length) {
    return <p className="text-sm text-[var(--text-muted)]">Form data not available yet.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {form.map((block) => (
        <div
          key={block.team}
          className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {block.teamLogo && (
                <img src={logoUrl(block.teamLogo)} alt="" className="h-6 w-6 object-contain" />
              )}
              <span className="truncate text-sm font-bold text-[var(--text-primary)]">{block.team}</span>
            </div>
            <div className="flex gap-0.5">
              {(block.formString || '').split('').map((r, i) => (
                <span
                  key={i}
                  className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${
                    r === 'W'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : r === 'D'
                        ? 'bg-slate-500/20 text-slate-300'
                        : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
          <ul className="space-y-1.5">
            {(block.results || []).map((g) => (
              <li
                key={g.id || `${g.date}-${g.opponent}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="min-w-0 truncate text-[var(--text-muted)]">
                  {g.atVs === '@' ? '@' : 'vs'} {g.opponent}
                </span>
                <span className="shrink-0 font-bold tabular-nums text-[var(--text-secondary)]">
                  {g.score}
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold ${
                    g.result === 'W'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : g.result === 'D'
                        ? 'bg-slate-500/20 text-slate-300'
                        : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {g.result || '–'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LineupColumn({ lineup }) {
  if (!lineup) {
    return <p className="text-sm text-[var(--text-muted)]">Lineups not announced yet.</p>;
  }
  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {lineup.teamLogo && (
            <img src={logoUrl(lineup.teamLogo)} alt="" className="h-6 w-6 object-contain" />
          )}
          <span className="truncate text-sm font-bold text-[var(--text-primary)]">{lineup.team}</span>
        </div>
        {lineup.formation && (
          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
            {lineup.formation}
          </span>
        )}
      </div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        Starting XI
      </p>
      <ul className="mb-3 space-y-1">
        {(lineup.starters || []).map((p) => (
          <li key={p.id || p.jersey + p.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-6 shrink-0 text-center font-mono text-[10px] font-bold text-[var(--text-muted)]">
              {p.jersey || '–'}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-primary)]">
              {p.name}
            </span>
            <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{p.position}</span>
          </li>
        ))}
      </ul>
      {(lineup.bench || []).length > 0 && (
        <>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Bench
          </p>
          <ul className="space-y-1">
            {lineup.bench.slice(0, 12).map((p) => (
              <li key={p.id || p.jersey + p.name} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                <span className="w-6 shrink-0 text-center font-mono text-[10px] text-[var(--text-muted)]">
                  {p.jersey || '–'}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{p.position}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Timeline({ events }) {
  if (!events?.length) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Commentary will appear when the match kicks off.
      </p>
    );
  }
  // Show newest first for live feel, but keep key goals visible
  const ordered = [...events].reverse();
  return (
    <ol className="relative space-y-0 border-l border-[var(--border-primary)] ml-3">
      {ordered.map((e) => {
        const isGoal = e.scoringPlay || /goal/i.test(e.type || '') || /goal/i.test(e.typeLabel || '');
        const isCard = /card|yellow|red/i.test(e.type || '') || /card/i.test(e.typeLabel || '');
        return (
          <li key={e.id} className="relative pb-4 pl-5">
            <span
              className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full ring-2 ring-[var(--bg-secondary)] ${
                isGoal
                  ? 'bg-emerald-400'
                  : isCard
                    ? 'bg-amber-400'
                    : 'bg-[var(--accent)]/60'
              }`}
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {e.clock && (
                <span className="font-mono text-[11px] font-bold text-accent">{e.clock}</span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {e.typeLabel}
              </span>
              {e.team && (
                <span className="text-[10px] text-[var(--text-muted)]">· {e.team}</span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-primary)]">{e.text}</p>
          </li>
        );
      })}
    </ol>
  );
}

function StatsTable({ stats, home, away }) {
  if (!stats?.length) {
    return <p className="text-sm text-[var(--text-muted)]">Match statistics unavailable.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="mb-2 flex justify-between text-[10px] font-bold uppercase text-[var(--text-muted)]">
        <span className="w-16 truncate text-left">{home}</span>
        <span>Stat</span>
        <span className="w-16 truncate text-right">{away}</span>
      </div>
      {stats.map((s) => (
        <div key={s.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
          <span className="text-right font-bold tabular-nums text-[var(--text-primary)]">
            {s.home ?? '–'}
          </span>
          <span className="min-w-[5.5rem] text-center text-[10px] font-semibold uppercase text-[var(--text-muted)]">
            {s.label}
          </span>
          <span className="font-bold tabular-nums text-[var(--text-primary)]">{s.away ?? '–'}</span>
        </div>
      ))}
    </div>
  );
}

function MatchCenterSkeleton() {
  return (
    <div className="page-container max-w-5xl space-y-4 py-4" role="status" aria-label="Loading match center">
      <Skeleton className="h-4 w-40" />
      <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col items-center gap-2">
            <Skeleton className="h-16 w-16" rounded="rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-10 w-20" rounded="rounded-lg" />
          <div className="flex flex-1 flex-col items-center gap-2">
            <Skeleton className="h-16 w-16" rounded="rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MatchCardSkeleton worldCup />
        <MatchCardSkeleton worldCup />
      </div>
      <Skeleton className="h-48 w-full" rounded="rounded-xl" />
    </div>
  );
}

export default function MatchCenterPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const focus = (searchParams.get('focus') || '').toLowerCase();
  const partyIntent = focus === 'party' || searchParams.get('party') === '1';
  const [partyCode] = useState(() => newPartyCode());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('timeline'); // timeline | lineups | form | h2h | stats

  // Deep-link focus: watch / party scrolls to streams; stats to detail tabs
  useEffect(() => {
    if (loading || !data?.match) return;
    if (!focus && !partyIntent) return;
    const id =
      focus === 'stats' || focus === 'lineups' || focus === 'form' || focus === 'h2h'
        ? 'match-stats'
        : 'match-watch';
    if (focus === 'lineups' || focus === 'form' || focus === 'h2h' || focus === 'timeline') {
      setTab(focus === 'timeline' ? 'timeline' : focus);
    }
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => clearTimeout(t);
  }, [loading, data?.match, focus, partyIntent]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const league = searchParams.get('league');
    const q = league ? `?league=${encodeURIComponent(league)}` : '';
    apiGet(`/api/match/${encodeURIComponent(slug)}${q}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        // Prefer lineups tab if upcoming with lineups, else timeline
        const m = d.match;
        if (m?.status === 'UPCOMING' && m.lineups?.home?.starters?.length) {
          setTab('lineups');
        } else if (m?.timeline?.length) {
          setTab('timeline');
        } else {
          setTab('form');
        }
      })
      .catch((err) => {
        if (alive) setError(err.message || 'Match not found');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    // Live refresh
    const id = setInterval(() => {
      apiGet(`/api/match/${encodeURIComponent(slug)}${q}`)
        .then((d) => alive && setData(d))
        .catch(() => {});
    }, 45000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [slug, searchParams]);

  const match = data?.match;
  const watch = data?.watch;

  // Document title + meta description for SEO
  useEffect(() => {
    if (!match?.seo) return undefined;
    const prev = document.title;
    document.title = match.seo.title;
    let meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', match.seo.description);
    // canonical
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = `${window.location.origin}${match.path || `/match/${slug}`}`;
    return () => {
      document.title = prev;
      if (prevDesc != null) meta.setAttribute('content', prevDesc);
    };
  }, [match, slug]);

  const sportsJsonLd = useMemo(() => {
    if (!match) return null;
    const event = buildSportsEvent(match, {
      pageUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}${match.path}`,
      includeScore: true,
    });
    if (!event) return null;
    return {
      '@context': 'https://schema.org',
      '@graph': [
        event,
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item: typeof window !== 'undefined' ? window.location.origin : 'https://preview.cryptobgc.eu.cc',
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Scores',
              item: `${typeof window !== 'undefined' ? window.location.origin : ''}/?tab=scores`,
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: `${match.home} vs ${match.away}`,
            },
          ],
        },
      ],
    };
  }, [match]);

  if (loading) {
    return (
      <StadiumGrassScene>
        <MatchCenterSkeleton />
      </StadiumGrassScene>
    );
  }

  if (error || !match) {
    return (
      <StadiumGrassScene>
        <div className="page-container max-w-lg py-16 text-center">
          <h1 className="type-h2 text-white drop-shadow">Match not found</h1>
          <p className="mt-2 text-sm text-slate-300">
            {error || 'This match center page is unavailable.'}
          </p>
          <Link to="/?tab=scores" viewTransition className="mt-4 inline-block text-sm font-bold text-[var(--brand-purple-light)]">
            ← Back to scores
          </Link>
        </div>
      </StadiumGrassScene>
    );
  }

  const isLive = match.status === 'LIVE';
  const isFinished = match.status === 'FINISHED';
  const showScore = match.homeScore != null && match.awayScore != null;

  const tabs = [
    { id: 'timeline', label: isLive ? 'Live' : 'Commentary' },
    { id: 'lineups', label: 'Lineups' },
    { id: 'form', label: 'Form' },
    { id: 'h2h', label: 'H2H' },
    { id: 'stats', label: 'Stats' },
  ];

  return (
    <StadiumGrassScene>
    <article className="page-container max-w-5xl space-y-4 py-4 md:py-6">
      <JsonLd id="match-center-jsonld" data={sportsJsonLd} />

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300" aria-label="Breadcrumb">
        <Link to="/" viewTransition className="hover:text-[var(--brand-purple-light)]">Home</Link>
        <span>/</span>
        <Link to={watch?.scoresTab || '/?tab=scores'} viewTransition className="hover:text-[var(--brand-purple-light)]">
          {match.league || 'Scores'}
        </Link>
        <span>/</span>
        <span className="font-semibold text-white">
          {match.home} vs {match.away}
        </span>
      </nav>

      {/* Hero scoreboard */}
      <header className="scene-card scene-card--glow relative overflow-hidden p-4 sm:p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 90% 80% at 50% 0%, rgba(168, 85, 247, 0.16) 0%, transparent 65%)',
          }}
          aria-hidden="true"
        />
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {match.league}
            {match.stage ? ` · ${String(match.stage).replace(/^FIFA World Cup,?\s*/i, '')}` : ''}
          </span>
          {isLive && <LiveBadge label={match.progress || 'LIVE'} />}
          {isFinished && (
            <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold text-slate-400">
              {match.statusDetail || 'FT'}
            </span>
          )}
          {match.status === 'UPCOMING' && match.timestamp && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
              {formatKickoff(match, { style: 'full' })}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 sm:gap-6">
          <TeamBlock
            name={match.home}
            badge={match.homeBadge}
            score={match.homeScore}
            form={match.homeForm}
            side="home"
          />
          <div className="shrink-0 text-center">
            {showScore ? (
              <p className="text-3xl font-black tabular-nums text-[var(--text-primary)] sm:text-4xl">
                {match.homeScore}
                <span className="mx-1 text-[var(--text-muted)]">–</span>
                {match.awayScore}
              </p>
            ) : (
              <p className="text-xl font-bold text-[var(--text-muted)] sm:text-2xl">VS</p>
            )}
            {match.venue && (
              <p className="mt-2 max-w-[10rem] text-[10px] text-[var(--text-muted)] sm:max-w-[14rem]">
                📍 {match.venue}
                {match.city ? ` · ${match.city}` : ''}
              </p>
            )}
          </div>
          <TeamBlock
            name={match.away}
            badge={match.awayBadge}
            score={match.awayScore}
            form={match.awayForm}
            side="away"
          />
        </div>

        {match.broadcasts?.length > 0 && (
          <p className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
            📺 {match.broadcasts.slice(0, 5).join(' · ')}
          </p>
        )}
        <p className="mt-1 text-center text-[9px] text-[var(--text-muted)]">{localTimeHint()}</p>

        {/* Match hub action row — primary way into Watch / Predict / Stats / Party */}
        <MatchActionRow match={match} stopPropagation={false} className="relative mt-4" />
      </header>

      {/* Watch CTAs */}
      <section
        id="match-watch"
        className={`scene-card p-4 scroll-mt-24 ${
          partyIntent || focus === 'watch'
            ? '!border-[var(--accent)]/50 ring-1 ring-[var(--accent)]/30'
            : ''
        }`}
        aria-labelledby="watch-heading"
      >
        <h2 id="watch-heading" className="mb-1 text-sm font-extrabold text-white">
          {partyIntent ? 'Start a Watch Party' : 'Watch this match'}
        </h2>
        <p className="mb-3 text-[11px] text-[var(--text-muted)]">
          {partyIntent
            ? `Pick a stream to open Watch Together (party code ${partyCode}). Share the link so friends join automatically.`
            : 'Stream free on BGC Sports — or open a party and watch with friends.'}
        </p>
        {watch?.channels?.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {watch.channels.map((ch) => {
              const to = partyIntent
                ? withPartyOnWatchPath(ch.watchPath, partyCode)
                : ch.watchPath;
              return (
                <Link
                  key={ch.id || ch.url}
                  to={to}
                  viewTransition
                  onPointerDown={() => {
                    if (ch.url) armChannelMediaTransition(ch.url);
                  }}
                  className="scene-row flex items-center gap-3 p-2.5"
                >
                  <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#4c1d95]/70 to-[#1e1033]/80">
                    {ch.logo ? (
                      <img src={logoUrl(ch.logo)} alt="" className="h-full w-full object-contain p-0.5" />
                    ) : (
                      <span className="text-sm">📺</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{ch.name}</p>
                    <p className="text-[10px] text-accent">
                      {partyIntent ? `Join party ${partyCode} →` : 'Watch free on BGC Sports →'}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link
              to={watch?.scoresTab || '/?tab=worldcup'}
              viewTransition
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white"
            >
              Browse live channels
            </Link>
            <Link
              to={matchPredictPath(match)}
              viewTransition
              className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm font-bold text-accent"
            >
              Predict the score
            </Link>
          </div>
        )}
      </section>

      {/* Stats hub */}
      <div id="match-stats" className="scroll-mt-24 space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            data-haptic="selection"
            onClick={() => setTab(t.id)}
            className={`pill-tab ${tab === t.id ? 'is-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="scene-card p-4 sm:p-5">
        {tab === 'timeline' && <Timeline events={match.timeline} />}
        {tab === 'lineups' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <LineupColumn lineup={match.lineups?.home} />
            <LineupColumn lineup={match.lineups?.away} />
          </div>
        )}
        {tab === 'form' && <FormGuide form={match.form} />}
        {tab === 'h2h' && (
          <div className="space-y-2">
            {!match.headToHead?.length ? (
              <p className="text-sm text-[var(--text-muted)]">No recent head-to-head meetings found.</p>
            ) : (
              match.headToHead.map((g) => (
                <div
                  key={g.id}
                  className="scene-row flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--text-primary)]">
                      {g.forTeam} {g.score} {g.opponent}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {g.date ? new Date(g.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                      {g.competition ? ` · ${g.competition}` : ''}
                      {g.round ? ` · ${g.round}` : ''}
                    </p>
                  </div>
                  {g.id && (
                    <Link
                      to={`/match/${extractEventId(g.id) || g.id}`}
                      className="shrink-0 text-[11px] font-bold text-accent"
                    >
                      Details
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        )}
        {tab === 'stats' && (
          <StatsTable stats={match.stats} home={match.homeShort || match.home} away={match.awayShort || match.away} />
        )}
      </section>
      </div>

      {match.article?.headline && (
        <aside className="scene-card p-4">
          <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Match report</p>
          <h3 className="mt-1 text-sm font-bold text-[var(--text-primary)]">{match.article.headline}</h3>
          {match.article.description && (
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              {match.article.description}
            </p>
          )}
        </aside>
      )}

      <footer className="flex flex-wrap gap-3 pb-8 text-[11px]">
        <Link to={watch?.scoresTab || '/?tab=scores'} viewTransition className="font-bold text-[var(--brand-purple-light)]">
          ← All scores
        </Link>
        <Link to={matchPredictPath(match)} viewTransition className="font-bold text-slate-300 hover:text-[var(--brand-purple-light)]">
          Predict this match
        </Link>
        <Link to="/?tab=worldcup" viewTransition className="font-bold text-slate-300 hover:text-[var(--brand-purple-light)]">
          World Cup channels
        </Link>
      </footer>
    </article>
    </StadiumGrassScene>
  );
}
