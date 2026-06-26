// ---------------------------------------------------------------------------
// LiveScoreTicker — horizontal scrolling ticker showing REAL football scores
// fetched from the backend (/api/scores -> TheSportsDB). Auto-refreshes.
// ---------------------------------------------------------------------------
import { useEffect, useState, useRef } from 'react';
import { apiGet } from '../lib/config.js';

// Returns a short status label for the ticker (e.g. live minute, FT, kickoff date)
function statusLabel(match) {
  if (match.status === 'LIVE') return match.progress ? `${match.progress}'` : 'LIVE';
  if (match.status === 'FINISHED') return 'FT';
  // UPCOMING — show short date
  if (match.timestamp) {
    const d = new Date(match.timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return 'SOON';
}

function MatchScore({ match }) {
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const label = statusLabel(match);

  return (
    <div className="flex items-center gap-2 shrink-0 px-4 py-1 border-r border-ink-600/50">
      <span
        className={`flex items-center gap-1 text-[9px] font-bold uppercase ${
          isLive ? 'text-red-400' : 'text-slate-500'
        }`}
      >
        {isLive && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />}
        {label}
      </span>
      <span className="text-[11px] font-semibold text-[var(--text-secondary)] max-w-[90px] truncate">
        {match.home}
      </span>
      {isUpcoming ? (
        <span className="text-xs font-extrabold px-1.5 py-0.5 rounded min-w-[36px] text-center bg-ink-700 text-slate-400">
          vs
        </span>
      ) : (
        <span
          className={`text-xs font-extrabold px-1.5 py-0.5 rounded min-w-[36px] text-center ${
            isLive ? 'bg-red-500/10 text-red-400' : 'bg-ink-700 text-white'
          }`}
        >
          {match.homeScore} - {match.awayScore}
        </span>
      )}
      <span className="text-[11px] font-semibold text-[var(--text-secondary)] max-w-[90px] truncate">
        {match.away}
      </span>
    </div>
  );
}

export default function LiveScoreTicker() {
  const [scores, setScores] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const tickerRef = useRef(null);

  // Fetch real scores from backend, then auto-refresh every 60s
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await apiGet('/api/scores');
        if (alive && data.matches && data.matches.length) {
          setScores(data.matches);
        }
      } catch {
        // keep whatever we have; ticker simply won't render if empty
      } finally {
        if (alive) setLoaded(true);
      }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll animation
  useEffect(() => {
    const ticker = tickerRef.current;
    if (!ticker || scores.length === 0) return;
    let animFrame;
    let pos = 0;
    const speed = 0.5;
    const scroll = () => {
      pos += speed;
      if (pos >= ticker.scrollWidth / 2) pos = 0;
      ticker.scrollLeft = pos;
      animFrame = requestAnimationFrame(scroll);
    };
    animFrame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animFrame);
  }, [scores]);

  // Don't render the bar until we have real data
  if (!loaded || scores.length === 0) {
    return (
      <div className="w-full bg-ink-950 border-b border-ink-700/50 overflow-hidden">
        <div className="flex items-center">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border-r border-ink-700/50">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulseLive" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400 whitespace-nowrap">
              Live Scores
            </span>
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-500">
            {loaded ? 'No matches available right now' : 'Loading real scores...'}
          </div>
        </div>
      </div>
    );
  }

  const doubled = [...scores, ...scores];

  return (
    <div className="w-full bg-ink-950 border-b border-ink-700/50 overflow-hidden">
      <div className="flex items-center">
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border-r border-ink-700/50">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulseLive" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400 whitespace-nowrap">
            Live Scores
          </span>
        </div>
        <div ref={tickerRef} className="flex overflow-hidden whitespace-nowrap" style={{ scrollBehavior: 'auto' }}>
          {doubled.map((match, i) => (
            <MatchScore key={`${match.id}-${i}`} match={match} />
          ))}
        </div>
      </div>
    </div>
  );
}
