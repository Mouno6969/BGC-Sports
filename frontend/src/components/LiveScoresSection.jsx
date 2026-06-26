// ---------------------------------------------------------------------------
// LiveScoresSection — dedicated live scores section on homepage
// Shows upcoming and live football matches with team flags, scores, match time
// Auto-refreshes every 60 seconds
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const MATCHES = [
  {
    id: 1,
    league: 'Premier League',
    leagueFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    home: 'Manchester City',
    homeFlag: '🔵',
    away: 'Arsenal',
    awayFlag: '🔴',
    homeScore: 2,
    awayScore: 1,
    status: 'LIVE',
    minute: "67'",
    time: null,
  },
  {
    id: 2,
    league: 'La Liga',
    leagueFlag: '🇪🇸',
    home: 'Real Madrid',
    homeFlag: '⚪',
    away: 'Barcelona',
    awayFlag: '🔵',
    homeScore: 0,
    awayScore: 0,
    status: 'LIVE',
    minute: "23'",
    time: null,
  },
  {
    id: 3,
    league: 'Champions League',
    leagueFlag: '🏆',
    home: 'Liverpool',
    homeFlag: '🔴',
    away: 'Chelsea',
    awayFlag: '🔵',
    homeScore: 2,
    awayScore: 2,
    status: 'LIVE',
    minute: "78'",
    time: null,
  },
  {
    id: 4,
    league: 'Serie A',
    leagueFlag: '🇮🇹',
    home: 'Inter Milan',
    homeFlag: '🔵',
    away: 'Napoli',
    awayFlag: '🔵',
    homeScore: 0,
    awayScore: 1,
    status: 'LIVE',
    minute: "45'",
    time: null,
  },
  {
    id: 5,
    league: 'Bundesliga',
    leagueFlag: '🇩🇪',
    home: 'Borussia Dortmund',
    homeFlag: '🟡',
    away: 'Bayern Munich',
    awayFlag: '🔴',
    homeScore: null,
    awayScore: null,
    status: 'UPCOMING',
    minute: null,
    time: 'Today 20:45',
  },
  {
    id: 6,
    league: 'Ligue 1',
    leagueFlag: '🇫🇷',
    home: 'PSG',
    homeFlag: '🔵',
    away: 'Marseille',
    awayFlag: '⚪',
    homeScore: null,
    awayScore: null,
    status: 'UPCOMING',
    minute: null,
    time: 'Today 21:00',
  },
  {
    id: 7,
    league: 'Premier League',
    leagueFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    home: 'Tottenham',
    homeFlag: '⚪',
    away: 'Newcastle',
    awayFlag: '⚫',
    homeScore: 1,
    awayScore: 0,
    status: 'FT',
    minute: 'FT',
    time: null,
  },
  {
    id: 8,
    league: 'La Liga',
    leagueFlag: '🇪🇸',
    home: 'Atletico Madrid',
    homeFlag: '🔴',
    away: 'Sevilla',
    awayFlag: '⚪',
    homeScore: 3,
    awayScore: 1,
    status: 'FT',
    minute: 'FT',
    time: null,
  },
];

function MatchCard({ match, onMatchClick }) {
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const isFT = match.status === 'FT';

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
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <span>{match.leagueFlag}</span>
          {match.league}
        </span>
        {isLive && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-red-400 ring-1 ring-red-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />
            {match.minute}
          </span>
        )}
        {isUpcoming && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent ring-1 ring-accent/20">
            {match.time}
          </span>
        )}
        {isFT && (
          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Full Time
          </span>
        )}
      </div>

      {/* Teams & Score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <span className="text-lg">{match.homeFlag}</span>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] text-center truncate w-full">{match.home}</span>
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          {!isUpcoming ? (
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
          <span className="text-lg">{match.awayFlag}</span>
          <span className="text-[11px] font-semibold text-[var(--text-primary)] text-center truncate w-full">{match.away}</span>
        </div>
      </div>

      {/* Watch button */}
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

export default function LiveScoresSection({ onMatchClick }) {
  const [matches, setMatches] = useState(MATCHES);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState('all');

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // In production this would fetch from RapidAPI
      // For now we just update the timestamp and slightly randomize live scores
      setMatches(prev =>
        prev.map(m => {
          if (m.status === 'LIVE' && m.minute) {
            const minNum = parseInt(m.minute);
            if (!isNaN(minNum) && minNum < 90) {
              return { ...m, minute: `${Math.min(minNum + 1, 90)}'` };
            }
          }
          return m;
        })
      );
      setLastUpdated(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const filtered = matches.filter(m => {
    if (activeFilter === 'live') return m.status === 'LIVE';
    if (activeFilter === 'upcoming') return m.status === 'UPCOMING';
    if (activeFilter === 'finished') return m.status === 'FT';
    return true;
  });

  const handleMatchClick = (match) => {
    if (onMatchClick) onMatchClick(match);
  };

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 ring-1 ring-red-500/20">
            <span className="text-sm">⚽</span>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Live Scores</h2>
            <p className="text-[10px] text-[var(--text-muted)]">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Auto-refreshes every 60s
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
          ].map(f => (
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map(match => (
          <MatchCard key={match.id} match={match} onMatchClick={handleMatchClick} />
        ))}
      </div>
    </section>
  );
}
