// ---------------------------------------------------------------------------
// LiveScoreTicker — horizontal scrolling ticker showing REAL football scores
// from /api/scores (ESPN primary). Kickoff labels use visitor local time.
// ---------------------------------------------------------------------------
import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import { formatKickoff } from '../lib/utils.js';
import { matchCenterPath } from '../lib/matchLinks.js';
import { ScoreTickerSkeleton } from './Skeleton.jsx';

// Returns a short status label for the ticker (e.g. live minute, FT, kickoff)
function statusLabel(match) {
  if (match.status === 'LIVE') return match.progress || 'LIVE';
  if (match.status === 'FINISHED') return match.statusDetail || 'FT';
  // UPCOMING — local kickoff (short, no TZ to save space)
  if (match.timestamp) {
    return formatKickoff(match, { style: 'short', withTz: false });
  }
  return 'SOON';
}

function MatchScore({ match }) {
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const label = statusLabel(match);
  const centerPath = matchCenterPath(match);

  const inner = (
    <>
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
        <span className="text-xs font-extrabold px-1.5 py-0.5 rounded min-w-[36px] text-center bg-[var(--bg-tertiary)] text-slate-400">
          vs
        </span>
      ) : (
        <span
          className={`text-xs font-extrabold px-1.5 py-0.5 rounded min-w-[36px] text-center ${
            isLive ? 'bg-red-500/10 text-red-400' : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
          }`}
        >
          {match.homeScore} - {match.awayScore}
        </span>
      )}
      <span className="text-[11px] font-semibold text-[var(--text-secondary)] max-w-[90px] truncate">
        {match.away}
      </span>
    </>
  );

  const className =
    'flex items-center gap-2 shrink-0 px-4 py-1 border-r border-[var(--border-primary)] transition-colors hover:bg-[var(--bg-tertiary)]/60';

  if (centerPath) {
    return (
      <Link
        to={centerPath}
        viewTransition
        className={className}
        aria-label={`Match Center: ${match.home} vs ${match.away}`}
      >
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

export default function LiveScoreTicker() {
  const [scores, setScores] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const tickerRef = useRef(null);

  // Fetch real scores from backend, then auto-refresh every 60s / pull-to-refresh
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await apiGet('/api/scores');
        if (!alive) return;
        // Prefer homepage matches (already mixes WC + leagues); fall back to WC only
        const rows = data.matches?.length
          ? data.matches
          : (data.worldCup?.length ? data.worldCup : []);
        if (rows.length) setScores(rows);
      } catch {
        // keep whatever we have; ticker simply won't render if empty
      } finally {
        if (alive) setLoaded(true);
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

  // Auto-scroll animation — pauses while the user scrolls the page (saves GPU)
  useEffect(() => {
    const ticker = tickerRef.current;
    if (!ticker || scores.length === 0) return;

    let animFrame;
    let pos = 0;
    let pageScrolling = false;
    let scrollEndTimer;
    const speed = 0.5;

    const onPageScroll = () => {
      pageScrolling = true;
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => { pageScrolling = false; }, 150);
    };

    const tick = () => {
      if (!pageScrolling) {
        pos += speed;
        if (pos >= ticker.scrollWidth / 2) pos = 0;
        ticker.scrollLeft = pos;
      }
      animFrame = requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', onPageScroll, { passive: true });
    animFrame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('scroll', onPageScroll);
      clearTimeout(scrollEndTimer);
      cancelAnimationFrame(animFrame);
    };
  }, [scores]);

  // Skeleton while loading; quiet empty state once we know there's nothing
  if (!loaded) {
    return <ScoreTickerSkeleton />;
  }
  if (scores.length === 0) {
    return (
      <div className="live-score-ticker relative z-[5] w-full bg-[var(--bg-primary)] border-b border-[var(--border-primary)] overflow-hidden">
        <div className="flex items-center">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border-r border-[var(--border-primary)]">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulseLive" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400 whitespace-nowrap">
              Live Scores
            </span>
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-500">
            No matches available right now
          </div>
        </div>
      </div>
    );
  }

  const doubled = [...scores, ...scores];

  return (
    <div className="live-score-ticker relative z-[5] w-full bg-[var(--bg-primary)] border-b border-[var(--border-primary)] overflow-hidden">
      <div className="flex items-center">
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border-r border-[var(--border-primary)]">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulseLive" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400 whitespace-nowrap">
            Live Scores
          </span>
        </div>
        <div ref={tickerRef} className="flex flex-1 min-w-0 overflow-hidden whitespace-nowrap" style={{ scrollBehavior: 'auto' }}>
          {doubled.map((match, i) => (
            <MatchScore key={`${match.id}-${i}`} match={match} />
          ))}
        </div>
      </div>
    </div>
  );
}
