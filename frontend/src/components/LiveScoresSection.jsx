// ---------------------------------------------------------------------------
// LiveScoresSection — dedicated scores section on homepage showing REAL match
// data fetched from the backend (/api/scores -> TheSportsDB).
// Shows live, upcoming, and finished matches with real team badges and scores.
// Auto-refreshes every 60 seconds.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet, logoUrl } from '../lib/config.js';

function formatKickoff(match) {
  if (!match.timestamp) return 'Scheduled';
  const d = new Date(match.timestamp);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`;
}

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
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const isFinished = match.status === 'FINISHED';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      onClick={() => onMatchClick(match)}
      className={`cursor-pointer rounded-xl border p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-glow-green ${
        isLive
          ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
          : isUpcoming
          ? 'border-accent/20 bg-accent/5 hover:border-accent/40'
          : 'border-ink-600/50 bg-ink-800/50 hover:border-ink-500'
      }`}
    >
      {/* League header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate">
          {match.league}
        </span>
        {isLive && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-red-400 ring-1 ring-red-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />
            {match.progress ? `${match.progress}'` : 'LIVE'}
          </span>
        )}
        {isUpcoming && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent ring-1 ring-accent/20 whitespace-nowrap">
            {formatKickoff(match)}
          </span>
        )}
        {isFinished && (
          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Full Time
          </span>
        )}
      </div>

      {/* Teams & Score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div className="relative">
            <TeamBadge badge={match.homeBadge} name={match.home} />
            <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
              {(match.home || '?').charAt(0)}
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] text-center truncate w-full">{match.home}</span>
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          {!isUpcoming && match.homeScore !== null ? (
            <span className={`text-xl font-extrabold px-3 py-1 rounded-lg ${isLive ? 'text-red-400 bg-red-500/10' : 'text-white bg-ink-700'}`}>
              {match.homeScore} - {match.awayScore}
            </span>
          ) : (
            <span className="text-sm font-bold text-[var(--text-muted)] px-3 py-1">VS</span>
          )}
          {isLive && (
            <span className="text-[9px] font-bold text-red-400 uppercase animate-pulse">● Live</span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div className="relative">
            <TeamBadge badge={match.awayBadge} name={match.away} />
            <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
              {(match.away || '?').charAt(0)}
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] text-center truncate w-full">{match.away}</span>
        </div>
      </div>

      {/* Watch button for live */}
      {isLive && (
        <div className="mt-3 flex items-center justify-center">
          <span className="text-[10px] font-bold text-accent hover:text-accent-light transition-colors">
            Watch Related Channels →
          </span>
        </div>
      )}
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-ink-600/50 bg-ink-800/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-4 w-12 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-3 w-14 rounded" />
        </div>
        <div className="skeleton h-8 w-14 rounded-lg" />
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-3 w-14 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function LiveScoresSection({ onMatchClick }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  // Fetch real scores from backend + auto-refresh every 60s
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
    return () => {
      alive = false;
      clearInterval(interval);
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

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 ring-1 ring-red-500/20">
            <span className="text-sm">⚽</span>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
              Football Scores {liveCount > 0 && <span className="text-red-400">({liveCount} live)</span>}
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">
              {lastUpdated
                ? `Real data · Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Auto-refreshes every 60s`
                : 'Loading real match data...'}
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'live', label: '🔴 Live' },
            { id: 'upcoming', label: '🕐 Upcoming' },
            { id: 'finished', label: '✓ Finished' },
          ].map((f) => (
            <button
              key={f.id}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-ink-600/50 bg-ink-800/30 p-8 text-center">
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
