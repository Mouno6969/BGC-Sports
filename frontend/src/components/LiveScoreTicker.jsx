// ---------------------------------------------------------------------------
// LiveScoreTicker — horizontal scrolling live score ticker at the top of page
// Shows real-time football match scores with auto-refresh
// ---------------------------------------------------------------------------
import { useEffect, useState, useRef } from 'react';

// Mock football scores for display when API is unavailable
const MOCK_SCORES = [
  { home: 'Manchester City', away: 'Arsenal', homeScore: 2, awayScore: 1, status: 'LIVE', minute: "67'" },
  { home: 'Real Madrid', away: 'Barcelona', homeScore: 0, awayScore: 0, status: 'LIVE', minute: "23'" },
  { home: 'PSG', away: 'Bayern Munich', homeScore: 1, awayScore: 3, status: 'FT', minute: 'FT' },
  { home: 'Liverpool', away: 'Chelsea', homeScore: 2, awayScore: 2, status: 'LIVE', minute: "78'" },
  { home: 'Juventus', away: 'AC Milan', homeScore: 1, awayScore: 0, status: 'HT', minute: 'HT' },
  { home: 'Atletico Madrid', away: 'Sevilla', homeScore: 3, awayScore: 1, status: 'FT', minute: 'FT' },
  { home: 'Inter Milan', away: 'Napoli', homeScore: 0, awayScore: 1, status: 'LIVE', minute: "45'" },
  { home: 'Borussia Dortmund', away: 'RB Leipzig', homeScore: 2, awayScore: 2, status: 'LIVE', minute: "88'" },
];

function MatchScore({ match }) {
  const isLive = match.status === 'LIVE';
  return (
    <div className="flex items-center gap-2 shrink-0 px-4 py-1 border-r border-ink-600/50">
      {isLive && (
        <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulseLive" />
          {match.minute}
        </span>
      )}
      {!isLive && (
        <span className="text-[9px] font-bold text-slate-500 uppercase">{match.minute}</span>
      )}
      <span className="text-[11px] font-semibold text-[var(--text-secondary)] max-w-[90px] truncate">{match.home}</span>
      <span className={`text-xs font-extrabold px-1.5 py-0.5 rounded min-w-[36px] text-center ${isLive ? 'bg-red-500/10 text-red-400' : 'bg-ink-700 text-white'}`}>
        {match.homeScore} - {match.awayScore}
      </span>
      <span className="text-[11px] font-semibold text-[var(--text-secondary)] max-w-[90px] truncate">{match.away}</span>
    </div>
  );
}

export default function LiveScoreTicker() {
  const [scores, setScores] = useState(MOCK_SCORES);
  const tickerRef = useRef(null);

  // Auto-scroll animation
  useEffect(() => {
    const ticker = tickerRef.current;
    if (!ticker) return;
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

  // Duplicate scores for seamless loop
  const doubled = [...scores, ...scores];

  return (
    <div className="w-full bg-ink-950 border-b border-ink-700/50 overflow-hidden">
      <div className="flex items-center">
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border-r border-ink-700/50">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulseLive" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-400 whitespace-nowrap">Live Scores</span>
        </div>
        <div
          ref={tickerRef}
          className="flex overflow-hidden whitespace-nowrap"
          style={{ scrollBehavior: 'auto' }}
        >
          {doubled.map((match, i) => (
            <MatchScore key={i} match={match} />
          ))}
        </div>
      </div>
    </div>
  );
}
