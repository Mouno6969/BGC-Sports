// ---------------------------------------------------------------------------
// WorldCupSection — dedicated FIFA World Cup 2026 section on the homepage.
// Shows full WC schedule from ESPN (via /api/scores) with local kickoff times.
// Auto-refreshes every 60 seconds alongside the main scores.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiGet, logoUrl } from '../lib/config.js';
import FifaLiveSection from './FifaLiveSection.jsx';
import LiveBadge from './LiveBadge.jsx';
import JsonLd from './JsonLd.jsx';
import { buildPageSportsGraph } from '../lib/sportsEventSchema.js';
import { formatKickoff, localTimeHint } from '../lib/utils.js';
import { matchCenterPath } from '../lib/matchLinks.js';
import { MatchCardSkeleton } from './Skeleton.jsx';
import MatchActionRow from './MatchActionRow.jsx';
import WorldCupStandings from './WorldCupStandings.jsx';

function TeamBadge({ badge, name }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [badge]);

  if (badge && !failed) {
    return (
      <img
        src={logoUrl(badge)}
        alt={name}
        className="h-10 w-10 object-contain"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
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
  const navigate = useNavigate();
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const stageLabel = match.stage || match.round;
  const location = [match.venue, match.city].filter(Boolean).join(' · ');
  const centerPath = matchCenterPath(match);
  const shellClass = `rounded-xl border p-4 transition-all duration-300 hover:scale-[1.02] ${
    isLive
      ? 'border-red-500/40 bg-gradient-to-br from-red-500/10 to-yellow-500/5 shadow-lg shadow-red-500/10'
      : isUpcoming
        ? 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-amber-500/5'
        : 'border-[var(--border-primary)] bg-[var(--bg-card)]'
  } ${centerPath ? 'cursor-pointer' : ''}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={shellClass}
      onClick={() => {
        if (centerPath) navigate(centerPath);
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {stageLabel && (
            <span className="truncate text-[9px] font-bold uppercase tracking-wider text-yellow-500/80">
              {String(stageLabel).replace(/^FIFA World Cup,?\s*/i, '') || stageLabel}
            </span>
          )}
        </div>
        {isLive && <LiveBadge label={match.progress || 'LIVE'} />}
        {isUpcoming && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-yellow-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-yellow-400 ring-1 ring-yellow-500/20">
            {formatKickoff(match, { style: 'medium' })}
          </span>
        )}
        {match.status === 'FINISHED' && (
          <span className="shrink-0 rounded-full bg-slate-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {match.statusDetail || 'Full Time'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <TeamBadge badge={match.homeBadge} name={match.home} />
          <span className="w-full truncate text-center text-[11px] font-semibold text-[var(--text-primary)]">
            {match.home}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          {!isUpcoming && match.homeScore !== null ? (
            <span
              className={`rounded-lg px-4 py-1.5 text-xl font-extrabold ${
                isLive
                  ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
              }`}
            >
              {match.homeScore} - {match.awayScore}
            </span>
          ) : (
            <span className="px-3 py-1 text-sm font-bold text-yellow-400/60">VS</span>
          )}
          {isLive && (
            <span className="animate-pulse text-[9px] font-bold uppercase text-red-400">● Live</span>
          )}
          {!isLive && match.timestamp && (
            <span className="whitespace-nowrap text-[9px] text-[var(--text-muted)]">
              {formatKickoff(match, { style: 'short' })}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <TeamBadge badge={match.awayBadge} name={match.away} />
          <span className="w-full truncate text-center text-[11px] font-semibold text-[var(--text-primary)]">
            {match.away}
          </span>
        </div>
      </div>

      {(location || match.broadcasts?.length > 0) && (
        <div className="mt-2.5 flex flex-col gap-0.5 border-t border-yellow-500/10 pt-2">
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

      <MatchActionRow match={match} stopPropagation pitch />
      {centerPath && (
        <p className="mt-1.5 text-center text-[9px] font-semibold text-slate-400">
          Tap card for Match Center
        </p>
      )}
    </motion.div>
  );
}

export default function WorldCupSection({ pitch = false }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  // matches | standings — standings embeds groups + knockout bracket
  const [sectionView, setSectionView] = useState('matches');

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
    if (activeFilter === 'results') return m.status === 'FINISHED';
    return true;
  });

  const liveCount = matches.filter((m) => m.status === 'LIVE').length;
  const upcomingCount = matches.filter((m) => m.status === 'UPCOMING').length;

  // SportsEvent JSON-LD for Google rich results (kickoff, teams, venue)
  const sportsJsonLd = useMemo(
    () =>
      matches.length
        ? buildPageSportsGraph(matches, {
            listName: 'FIFA World Cup 2026 matches',
            pagePath: '/?tab=worldcup',
          })
        : null,
    [matches]
  );

  // Always show section shell (standings may load even if fixtures are empty)
  return (
    <section className="space-y-3" itemScope itemType="https://schema.org/ItemList">
      <JsonLd id="worldcup-sports-events" data={sportsJsonLd} />
      {/* Section Header with World Cup branding */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/10 ring-1 ring-yellow-500/30">
            <span className="text-lg">🏆</span>
          </div>
          <div>
            <h2 className={`type-h2 flex items-center gap-2 flex-wrap ${pitch ? 'text-white' : 'text-[var(--text-primary)]'}`}>
              FIFA World Cup 2026
              {liveCount > 0 && <LiveBadge label={`${liveCount} LIVE`} />}
            </h2>
            <p className={`text-[10px] ${pitch ? 'text-slate-300' : 'text-[var(--text-muted)]'}`}>
              {upcomingCount > 0
                ? `${upcomingCount} upcoming · USA, Mexico & Canada · ${localTimeHint()}`
                : `Scores, standings & bracket · ${localTimeHint()}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Primary section switcher */}
          <div className="flex gap-1 rounded-full border border-yellow-500/20 bg-black/20 p-0.5">
            {[
              { id: 'matches', label: 'Fixtures' },
              { id: 'standings', label: '📊 Table' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                data-haptic="selection"
                data-haptic-tab="1"
                onClick={() => setSectionView(v.id)}
                className={`rounded-full px-3 py-1 text-[10px] font-bold transition-all ${
                  sectionView === v.id
                    ? 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/35'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {sectionView === 'matches' && (
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
                  data-haptic="selection"
                  data-haptic-tab="1"
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
          )}
        </div>
      </div>

      {sectionView === 'standings' ? (
        <WorldCupStandings pitch={pitch} />
      ) : (
        <>
          <FifaLiveSection pitch={pitch} />

          {/* Match Grid */}
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading matches">
              {Array.from({ length: 6 }).map((_, i) => (
                <MatchCardSkeleton key={i} worldCup />
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
        </>
      )}
    </section>
  );
}
