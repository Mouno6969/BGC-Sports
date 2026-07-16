// ---------------------------------------------------------------------------
// LiveScoresSection — dedicated scores section on homepage showing REAL match
// data from /api/scores (ESPN primary + TheSportsDB fallback).
// Kickoff times render in the visitor's local timezone/country.
// Auto-refreshes every 60 seconds.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiGet, logoUrl } from '../lib/config.js';
import LiveBadge from './LiveBadge.jsx';
import JsonLd from './JsonLd.jsx';
import { buildPageSportsGraph } from '../lib/sportsEventSchema.js';
import { formatKickoff, localTimeHint } from '../lib/utils.js';
import { matchCenterPath } from '../lib/matchLinks.js';
import { MatchGridSkeleton } from './Skeleton.jsx';
import MatchActionRow from './MatchActionRow.jsx';

function TeamBadge({ badge, name }) {
  if (badge) {
    return (
      <img
        src={logoUrl(badge)}
        alt={name}
        className="h-8 w-8 object-contain"
        onError={(e) => {
          e.target.style.display = 'none';
          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
        }}
      />
    );
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
      {(name || '?').charAt(0)}
    </div>
  );
}

function MatchCard({ match, onMatchClick }) {
  const navigate = useNavigate();
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const isFinished = match.status === 'FINISHED';
  const location = [match.venue, match.city].filter(Boolean).join(' · ');
  const stage = match.stage || match.round;
  const centerPath = matchCenterPath(match);

  const className = `card-sports p-4 transition-all duration-300 hover:scale-[1.02] ${
    isLive
      ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
      : isUpcoming
        ? 'border-[var(--accent)]/20 bg-[var(--accent)]/5 hover:border-[var(--accent)]/40'
        : ''
  } ${centerPath ? 'cursor-pointer' : ''}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={className}
      onClick={() => {
        if (centerPath) navigate(centerPath);
        else onMatchClick?.(match);
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {match.league}
          {stage && !String(stage).toLowerCase().includes(String(match.league || '').toLowerCase()) && (
            <span className="font-semibold normal-case tracking-normal text-[var(--text-muted)]/80">
              · {stage}
            </span>
          )}
        </span>
        {isLive && <LiveBadge label={match.progress || 'LIVE'} />}
        {isUpcoming && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent ring-1 ring-accent/20">
            {formatKickoff(match, { style: 'short' })}
          </span>
        )}
        {isFinished && (
          <span className="shrink-0 rounded-full bg-slate-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {match.statusDetail || 'Full Time'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <TeamBadge badge={match.homeBadge} name={match.home} />
          <span className="w-full truncate text-center text-[11px] font-semibold text-[var(--text-primary)]">
            {match.home}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          {!isUpcoming && match.homeScore !== null ? (
            <span
              className={`rounded-lg px-3 py-1 text-xl font-extrabold ${
                isLive ? 'bg-red-500/10 text-red-400' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
              }`}
            >
              {match.homeScore} - {match.awayScore}
            </span>
          ) : (
            <span className="px-3 py-1 text-sm font-bold text-[var(--text-muted)]">VS</span>
          )}
          {isLive && (
            <span className="animate-pulse text-[9px] font-bold uppercase text-red-400">● Live</span>
          )}
          {isFinished && match.timestamp && (
            <span className="whitespace-nowrap text-[9px] text-[var(--text-muted)]">
              {formatKickoff(match, { style: 'short', withTz: false })}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <TeamBadge badge={match.awayBadge} name={match.away} />
          <span className="w-full truncate text-center text-[11px] font-semibold text-[var(--text-primary)]">
            {match.away}
          </span>
        </div>
      </div>

      {(location || match.broadcasts?.length > 0) && (
        <div className="mt-2.5 flex flex-col gap-0.5 border-t border-[var(--border-primary)]/60 pt-2">
          {location && (
            <p className="truncate text-[9px] text-[var(--text-muted)]" title={location}>
              📍 {location}
            </p>
          )}
          {match.broadcasts?.length > 0 && (
            <p className="truncate text-[9px] text-[var(--text-muted)]" title={match.broadcasts.join(', ')}>
              📺 {match.broadcasts.slice(0, 3).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Hub: Watch · Predict · Stats · Party — Stats opens Match Center */}
      <MatchActionRow match={match} stopPropagation />
      {centerPath && (
        <p className="mt-1.5 text-center text-[9px] font-semibold text-[var(--text-muted)]">
          Tap card for Match Center
        </p>
      )}
    </motion.div>
  );
}

export default function LiveScoresSection({ onMatchClick }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  // Fetch real scores from backend + auto-refresh every 60s / pull-to-refresh
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await apiGet('/api/scores');
        if (alive && data.matches) {
          setMatches(data.matches);
          setLastUpdated(new Date());
        }
      } catch {
        // leave existing data
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 60000);
    const onPull = () => load();
    window.addEventListener('bgc:pull-refresh', onPull);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener('bgc:pull-refresh', onPull);
    };
  }, []);

  const filtered = matches.filter((m) => {
    if (activeFilter === 'live') return m.status === 'LIVE';
    if (activeFilter === 'upcoming') return m.status === 'UPCOMING';
    if (activeFilter === 'finished') return m.status === 'FINISHED';
    return true;
  });

  const handleMatchClick = (match) => {
    if (onMatchClick) onMatchClick(match);
  };

  const liveCount = matches.filter((m) => m.status === 'LIVE').length;

  const sportsJsonLd = useMemo(
    () =>
      matches.length
        ? buildPageSportsGraph(matches, {
            listName: 'Football live scores and fixtures',
            pagePath: '/?tab=scores',
          })
        : null,
    [matches]
  );

  return (
    <section className="space-y-4" itemScope itemType="https://schema.org/ItemList">
      <JsonLd id="live-scores-sports-events" data={sportsJsonLd} />
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 ring-1 ring-red-500/20">
            <span className="text-sm">⚽</span>
          </div>
          <div>
            <h2 className="type-h2 text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
              Football Scores
              {liveCount > 0 && <LiveBadge label={`${liveCount} LIVE`} />}
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">
              {lastUpdated
                ? `Live data · Updated ${lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${localTimeHint()}`
                : 'Loading real match data...'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'live', label: '🔴 Live' },
            { id: 'upcoming', label: '🕐 Upcoming' },
            { id: 'finished', label: '✓ Finished' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              data-haptic="selection"
              data-haptic-tab="1"
              onClick={() => setActiveFilter(f.id)}
              className={`rounded-full px-3 py-1 text-[10px] font-bold transition-all ${
                activeFilter === f.id
                  ? 'bg-accent/10 text-accent ring-1 ring-accent/30'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Match Grid */}
      {loading ? (
        <MatchGridSkeleton count={8} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No {activeFilter !== 'all' ? activeFilter : ''} matches available right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((match) => (
            <MatchCard key={match.id} match={match} onMatchClick={handleMatchClick} />
          ))}
        </div>
      )}
    </section>
  );
}
