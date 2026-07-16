// ---------------------------------------------------------------------------
// LiveScoreTicker — accessible, seamless football score marquee.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/config.js';
import { formatKickoff } from '../lib/utils.js';
import { matchCenterPath } from '../lib/matchLinks.js';
import { ScoreTickerSkeleton } from './Skeleton.jsx';

function statusLabel(match) {
  if (match.status === 'LIVE') return match.progress || 'LIVE';
  if (match.status === 'FINISHED') return match.statusDetail || 'FT';
  if (match.timestamp) {
    return formatKickoff(match, { style: 'short', withTz: false });
  }
  return 'SOON';
}

function competitionLabel(match) {
  return match.competition || match.league || match.tournament || 'Football';
}

function MatchScore({ match }) {
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const centerPath = matchCenterPath(match);
  const score = isUpcoming
    ? 'VS'
    : `${match.homeScore ?? 0}–${match.awayScore ?? 0}`;

  const inner = (
    <>
      <span className="ticker-match__meta">
        <span className={`ticker-match__status ${isLive ? 'is-live' : ''}`}>
          {isLive && <span className="ticker-match__live-dot" aria-hidden="true" />}
          {statusLabel(match)}
        </span>
        <span className="ticker-match__competition">{competitionLabel(match)}</span>
      </span>
      <span className="ticker-match__fixture">
        <span className="ticker-match__team">{match.home}</span>
        <span className={`ticker-match__score ${isLive ? 'is-live' : ''}`}>{score}</span>
        <span className="ticker-match__team">{match.away}</span>
      </span>
    </>
  );

  const className = 'ticker-match';
  if (!centerPath) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Link
      to={centerPath}
      viewTransition
      className={className}
      aria-label={`Open Match Center for ${match.home} versus ${match.away}`}
    >
      {inner}
    </Link>
  );
}

function TickerGroup({ scores, duplicate = false }) {
  return (
    <div className="score-marquee__group" aria-hidden={duplicate || undefined}>
      {scores.map((match, index) => (
        <MatchScore
          key={`${match.id || `${match.home}-${match.away}`}-${index}`}
          match={match}
        />
      ))}
    </div>
  );
}

function EmptyTicker() {
  return (
    <div className="live-score-ticker">
      <div className="score-marquee__label">
        <span className="score-marquee__label-dot" aria-hidden="true" />
        <span>Live desk</span>
      </div>
      <div className="score-marquee__empty">No matches available right now</div>
    </div>
  );
}

export default function LiveScoreTicker() {
  const [scores, setScores] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const data = await apiGet('/api/scores');
        if (!alive) return;
        const rows = data.matches?.length
          ? data.matches
          : (data.worldCup?.length ? data.worldCup : []);
        setScores(rows);
      } catch {
        // Keep the latest successful response. The ticker degrades quietly.
      } finally {
        if (alive) setLoaded(true);
      }
    };

    load();
    const interval = window.setInterval(load, 60_000);
    const onPull = () => load();
    window.addEventListener('bgc:pull-refresh', onPull);

    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener('bgc:pull-refresh', onPull);
    };
  }, []);

  const animationDuration = useMemo(
    () => `${Math.max(30, Math.min(96, scores.length * 7))}s`,
    [scores.length]
  );

  if (!loaded) return <ScoreTickerSkeleton />;
  if (scores.length === 0) return <EmptyTicker />;

  return (
    <section className="live-score-ticker" aria-label="Live football scores">
      <div className="score-marquee__label" aria-hidden="true">
        <span className="score-marquee__label-dot" />
        <span>Live desk</span>
      </div>

      <div className="score-marquee__viewport">
        <div
          className="score-marquee__track"
          style={{ '--ticker-duration': animationDuration }}
        >
          <TickerGroup scores={scores} />
          <TickerGroup scores={scores} duplicate />
        </div>
      </div>
    </section>
  );
}
