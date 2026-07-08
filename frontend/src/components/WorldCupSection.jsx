// ---------------------------------------------------------------------------
// WorldCupSection — dedicated FIFA World Cup 2026 section on the homepage.
// Shows World Cup results and upcoming fixtures with a highlighted trophy theme.
// Auto-refreshes every 60 seconds alongside the main scores.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet, logoUrl } from '../lib/config.js';
import FifaLiveSection from './FifaLiveSection.jsx';
import LiveBadge from './LiveBadge.jsx';

function formatKickoff(match) {
  if (!match.timestamp) return 'Scheduled';
  const d = new Date(match.timestamp);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`;
}

function TeamBadge({ badge, name }) {
  if (badge) {
    return (
      <img
        src={logoUrl(badge)}
        alt={name}
        className="h-10 w-10 object-contain"
        onError={(e) => {
          e.target.style.display = 'none';
          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
        }}
      />
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10 text-sm font-bold text-yellow-400">
      {(name || '?').charAt(0)}
    </div>
  );
}

function WorldCupMatchCard({ match }) {
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl border p-4 transition-all duration-300 hover:scale-[1.02] ${
        isLive
          ? 'border-red-500/40 bg-gradient-to-br from-red-500/10 to-yellow-500/5 shadow-lg shadow-red-500/10'
          : isUpcoming
          ? 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-amber-500/5'
          : 'border-[var(--border-primary)] bg-[var(--bg-card)]'
      }`}
    >
      {/* Match header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {match.round && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-yellow-500/80">
              Round {match.round}
            </span>
          )}
          {match.venue && (
            <span className="text-[9px] text-[var(--text-muted)] truncate max-w-[120px]">
              {match.venue}
            </span>
          )}
        </div>
        {isLive && (
          <LiveBadge label={match.progress ? `${match.progress}'` : 'LIVE'} />
        )}
        {isUpcoming && (
          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-yellow-400 ring-1 ring-yellow-500/20 whitespace-nowrap">
            {formatKickoff(match)}
          </span>
        )}
        {match.status === 'FINISHED' && (
          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Full Time
          </span>
        )}
      </div>

      {/* Teams & Score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <div className="relative">
            <TeamBadge badge={match.homeBadge} name={match.home} />
            <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10 text-sm font-bold text-yellow-400">
              {(match.home || '?').charAt(0)}
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] text-center truncate w-full">
            {match.home}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          {!isUpcoming && match.homeScore !== null ? (
            <span className={`text-xl font-extrabold px-4 py-1.5 rounded-lg ${
              isLive ? 'text-red-400 bg-red-500/10 ring-1 ring-red-500/20' : 'text-[var(--text-primary)] bg-[var(--bg-tertiary)]'
            }`}>
              {match.homeScore} - {match.awayScore}
            </span>
          ) : (
            <span className="text-sm font-bold text-yellow-400/60 px-3 py-1">VS</span>
          )}
          {isLive && (
            <span className="text-[9px] font-bold text-red-400 uppercase animate-pulse">● Live</span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
          <div className="relative">
            <TeamBadge badge={match.awayBadge} name={match.away} />
            <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10 text-sm font-bold text-yellow-400">
              {(match.away || '?').charAt(0)}
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] text-center truncate w-full">
            {match.away}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-yellow-500/10 bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="skeleton h-4 w-14 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="skeleton h-3 w-14 rounded" />
        </div>
        <div className="skeleton h-9 w-16 rounded-lg" />
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="skeleton h-3 w-14 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function WorldCupSection() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await apiGet('/api/scores');
        if (alive && data.worldCup) {
          setMatches(data.worldCup);
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
    if (activeFilter === 'results') return m.status === 'FINISHED';
    return true;
  });

  const liveCount = matches.filter((m) => m.status === 'LIVE').length;
  const upcomingCount = matches.filter((m) => m.status === 'UPCOMING').length;

  // Don't render if no World Cup data available
  if (!loading && matches.length === 0) return null;

  return (
    <section className="space-y-4">
      {/* Section Header with World Cup branding */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/10 ring-1 ring-yellow-500/30">
            <span className="text-lg">🏆</span>
          </div>
          <div>
            <h2 className="type-h2 text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
              FIFA World Cup 2026
              {liveCount > 0 && <LiveBadge label={`${liveCount} LIVE`} />}
            </h2>
            <p className="text-[10px] text-[var(--text-muted)]">
              {upcomingCount > 0
                ? `${upcomingCount} upcoming match${upcomingCount > 1 ? 'es' : ''} · USA, Mexico & Canada`
                : 'Real-time scores & fixtures · USA, Mexico & Canada'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'live', label: '🔴 Live' },
            { id: 'upcoming', label: '🕐 Upcoming' },
            { id: 'results', label: '✓ Results' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFilter(f.id)}
              className={`rounded-full px-3 py-1 text-[10px] font-bold transition-all ${
                activeFilter === f.id
                  ? 'bg-yellow-500/10 text-yellow-400 ring-1 ring-yellow-500/30'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <FifaLiveSection />

      {/* Match Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-yellow-500/10 bg-[var(--bg-card)] p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No {activeFilter !== 'all' ? activeFilter : ''} World Cup matches available right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((match) => (
            <WorldCupMatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </section>
  );
}
