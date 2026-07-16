// ---------------------------------------------------------------------------
// WorldCupStandings — Group tables + knockout bracket for FIFA World Cup.
// Auto-refreshes with live results (poll + pull-to-refresh).
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, logoUrl } from '../lib/config.js';
import { formatKickoff, localTimeHint } from '../lib/utils.js';
import LiveBadge from './LiveBadge.jsx';
import { Skeleton } from './Skeleton.jsx';
import { matchCenterPath } from '../lib/matchLinks.js';
import MatchActionRow from './MatchActionRow.jsx';

const VIEWS = [
  { id: 'groups', label: 'Groups' },
  { id: 'bracket', label: 'Knockout' },
];

function teamTone(team) {
  if (team.advanced || /advance|qualified/i.test(team.note?.description || '')) {
    return 'advance';
  }
  if (/best|playoff/i.test(team.note?.description || '')) return 'best';
  if (/eliminat/i.test(team.note?.description || '')) return 'out';
  // Rank-based fallback during group stage
  if (team.rank <= 2) return 'advance';
  if (team.rank === 3) return 'best';
  return 'out';
}

function GroupTable({ group, pitch }) {
  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        pitch
          ? 'border-white/10 bg-black/40 backdrop-blur-sm'
          : 'border-[var(--border-primary)] bg-[var(--bg-card)]'
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-3 py-2 ${
          pitch ? 'border-white/10 bg-yellow-500/10' : 'border-[var(--border-primary)] bg-yellow-500/5'
        }`}
      >
        <h3
          className={`text-xs font-extrabold tracking-wide ${
            pitch ? 'text-yellow-300' : 'text-yellow-500'
          }`}
        >
          {group.name}
        </h3>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${pitch ? 'text-slate-400' : 'text-[var(--text-muted)]'}`}>
          P W D L GD Pts
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[260px] text-left text-[11px]">
          <thead className="sr-only">
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {group.teams.map((team) => {
              const tone = teamTone(team);
              const rowAccent =
                tone === 'advance'
                  ? 'border-l-[3px] border-l-emerald-400'
                  : tone === 'best'
                    ? 'border-l-[3px] border-l-sky-400'
                    : 'border-l-[3px] border-l-transparent';
              return (
                <tr
                  key={team.id || team.name}
                  className={`${rowAccent} ${
                    pitch
                      ? 'border-b border-white/5 hover:bg-white/5'
                      : 'border-b border-[var(--border-primary)]/60 hover:bg-[var(--bg-tertiary)]'
                  }`}
                  title={team.note?.description || undefined}
                >
                  <td className={`w-6 px-2 py-1.5 font-bold tabular-nums ${pitch ? 'text-slate-400' : 'text-[var(--text-muted)]'}`}>
                    {team.rank}
                  </td>
                  <td className="min-w-0 py-1.5 pr-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {team.badge ? (
                        <img
                          src={logoUrl(team.badge)}
                          alt=""
                          className="h-4 w-4 shrink-0 object-contain"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[8px] font-bold text-accent">
                          {(team.short || team.name || '?').slice(0, 1)}
                        </span>
                      )}
                      <span
                        className={`truncate font-semibold ${
                          pitch ? 'text-white' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {team.short || team.name}
                      </span>
                    </div>
                  </td>
                  <td className={`w-6 px-0.5 py-1.5 text-center tabular-nums ${pitch ? 'text-slate-300' : 'text-[var(--text-secondary)]'}`}>
                    {team.played}
                  </td>
                  <td className={`w-6 px-0.5 py-1.5 text-center tabular-nums ${pitch ? 'text-slate-300' : 'text-[var(--text-secondary)]'}`}>
                    {team.won}
                  </td>
                  <td className={`w-6 px-0.5 py-1.5 text-center tabular-nums ${pitch ? 'text-slate-300' : 'text-[var(--text-secondary)]'}`}>
                    {team.drawn}
                  </td>
                  <td className={`w-6 px-0.5 py-1.5 text-center tabular-nums ${pitch ? 'text-slate-300' : 'text-[var(--text-secondary)]'}`}>
                    {team.lost}
                  </td>
                  <td className={`w-8 px-0.5 py-1.5 text-center tabular-nums ${pitch ? 'text-slate-300' : 'text-[var(--text-secondary)]'}`}>
                    {team.gdDisplay ?? (team.gd > 0 ? `+${team.gd}` : team.gd)}
                  </td>
                  <td
                    className={`w-8 px-1.5 py-1.5 text-center text-xs font-extrabold tabular-nums ${
                      pitch ? 'text-yellow-300' : 'text-yellow-500'
                    }`}
                  >
                    {team.pts}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BracketMatch({ match, pitch }) {
  const homeWin = match.homeWinner || (
    match.status === 'FINISHED'
    && match.homeScore != null
    && match.awayScore != null
    && match.homeScore > match.awayScore
  );
  const awayWin = match.awayWinner || (
    match.status === 'FINISHED'
    && match.homeScore != null
    && match.awayScore != null
    && match.awayScore > match.homeScore
  );
  const showScore =
    match.status === 'LIVE'
    || match.status === 'FINISHED'
    || (match.homeScore != null && match.awayScore != null);

  const centerPath = matchCenterPath({ id: match.id, home: match.home, away: match.away });
  const kick = match.timestamp ? formatKickoff(match, { style: 'short', withTz: false }) : null;
  const hubMatch = {
    id: match.id,
    home: match.home,
    away: match.away,
    homeBadge: match.homeBadge,
    awayBadge: match.awayBadge,
    league: 'FIFA World Cup',
    stage: match.statusDetail,
    timestamp: match.timestamp,
    status: match.status,
  };

  const scoreBlock = (
    <>
      <div
        className={`flex items-center justify-between gap-1 border-b px-2 py-1 ${
          pitch ? 'border-white/10' : 'border-[var(--border-primary)]'
        }`}
      >
        <span className={`truncate text-[9px] font-bold ${pitch ? 'text-slate-400' : 'text-[var(--text-muted)]'}`}>
          {match.status === 'LIVE'
            ? match.progress || 'LIVE'
            : match.status === 'FINISHED'
              ? 'FT'
              : kick || 'TBD'}
        </span>
        {match.status === 'LIVE' && <LiveBadge className="scale-75 origin-right" />}
      </div>

      {[
        { name: match.home, short: match.homeShort, badge: match.homeBadge, score: match.homeScore, win: homeWin },
        { name: match.away, short: match.awayShort, badge: match.awayBadge, score: match.awayScore, win: awayWin },
      ].map((side, i) => (
        <div
          key={i}
          className={`flex items-center gap-1.5 px-2 py-1.5 ${
            i === 0 && (pitch ? 'border-b border-white/5' : 'border-b border-[var(--border-primary)]/50')
          } ${side.win ? (pitch ? 'bg-emerald-500/10' : 'bg-accent/10') : ''}`}
        >
          {side.badge ? (
            <img
              src={logoUrl(side.badge)}
              alt=""
              className="h-4 w-4 shrink-0 object-contain"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[8px]">
              {(side.short || side.name || '?').slice(0, 1)}
            </span>
          )}
          <span
            className={`min-w-0 flex-1 truncate font-semibold ${
              side.win
                ? pitch
                  ? 'text-white'
                  : 'text-[var(--text-primary)]'
                : pitch
                  ? 'text-slate-300'
                  : 'text-[var(--text-secondary)]'
            } ${match.placeholder ? 'italic opacity-70' : ''}`}
          >
            {side.short || side.name || 'TBD'}
          </span>
          {showScore && (
            <span
              className={`w-5 text-right font-extrabold tabular-nums ${
                side.win
                  ? pitch
                    ? 'text-yellow-300'
                    : 'text-accent'
                  : pitch
                    ? 'text-slate-400'
                    : 'text-[var(--text-muted)]'
              }`}
            >
              {side.score ?? '–'}
            </span>
          )}
        </div>
      ))}
    </>
  );

  return (
    <div
      className={`w-[210px] shrink-0 overflow-hidden rounded-lg border text-[11px] transition-colors ${
        pitch
          ? 'border-white/10 bg-black/50 hover:border-yellow-500/40'
          : 'border-[var(--border-primary)] bg-[var(--bg-card)] hover:border-accent/40'
      } ${match.status === 'LIVE' ? 'ring-1 ring-red-500/50' : ''}`}
    >
      {centerPath ? (
        <Link
          to={centerPath}
          viewTransition
          className="block"
          aria-label={`Match Center: ${match.home} vs ${match.away}`}
        >
          {scoreBlock}
        </Link>
      ) : (
        scoreBlock
      )}
      {centerPath && (
        <div className={`border-t px-1.5 pb-1.5 ${pitch ? 'border-white/5' : 'border-[var(--border-primary)]'}`}>
          <MatchActionRow match={hubMatch} compact pitch={pitch} className="mt-1.5" />
        </div>
      )}
    </div>
  );
}

function BracketView({ bracket, pitch }) {
  const rounds = bracket?.rounds || [];
  if (!rounds.length) {
    return (
      <div
        className={`rounded-xl border p-8 text-center text-sm ${
          pitch
            ? 'border-white/10 bg-black/30 text-slate-300'
            : 'border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-muted)]'
        }`}
      >
        Knockout bracket will appear once the group stage completes.
      </div>
    );
  }

  return (
    <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex min-w-min items-stretch gap-4 py-1">
        {rounds.map((round) => (
          <div key={round.key} className="flex w-[200px] shrink-0 flex-col gap-2">
            <div
              className={`sticky top-0 z-[1] rounded-lg px-2 py-1.5 text-center text-[10px] font-extrabold uppercase tracking-wider ${
                pitch
                  ? 'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30'
                  : 'bg-yellow-500/10 text-yellow-600 ring-1 ring-yellow-500/20'
              }`}
            >
              {round.label}
              <span className={`ml-1 font-semibold normal-case tracking-normal opacity-70`}>
                ({round.matches.length})
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-around gap-2">
              {round.matches.map((m) => (
                <BracketMatch key={m.id} match={m} pitch={pitch} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StandingsSkeleton({ pitch }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading standings">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`overflow-hidden rounded-xl border p-3 ${
            pitch ? 'border-white/10 bg-black/30' : 'border-[var(--border-primary)] bg-[var(--bg-card)]'
          }`}
        >
          <Skeleton className="mb-3 h-4 w-20" />
          {Array.from({ length: 4 }).map((__, j) => (
            <Skeleton key={j} className="mb-2 h-6 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function WorldCupStandings({ pitch = false, defaultView = 'groups' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState(defaultView);
  const [updatedLabel, setUpdatedLabel] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const payload = await apiGet('/api/scores/standings');
      setData(payload);
      setError(null);
      if (payload.updatedAt) {
        const d = new Date(payload.updatedAt);
        setUpdatedLabel(
          d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        );
      }
    } catch (err) {
      if (!silent) setError('Could not load standings right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Live results — poll frequently during tournament
    const interval = setInterval(() => load({ silent: true }), 45000);
    const onPull = () => load({ silent: true });
    window.addEventListener('bgc:pull-refresh', onPull);
    // Soft refresh when tab becomes visible again
    const onVis = () => {
      if (document.visibilityState === 'visible') load({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      window.removeEventListener('bgc:pull-refresh', onPull);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  // Prefer knockout view once group stage is done / KO active
  useEffect(() => {
    if (!data?.phase) return;
    if (/group/i.test(data.phase)) return;
    // Only auto-switch once if user hasn't chosen
    setView((v) => (v === 'groups' && defaultView === 'groups' ? v : v));
  }, [data?.phase, defaultView]);

  const groups = data?.groups || [];
  const bracket = data?.bracket || { rounds: [] };
  const hasBracket = (bracket.rounds || []).length > 0;

  const legend = useMemo(() => data?.legend || [], [data?.legend]);

  return (
    <section
      className={`space-y-3 rounded-2xl border p-3 sm:p-4 ${
        pitch
          ? 'border-yellow-500/20 bg-black/35 backdrop-blur-sm'
          : 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
      }`}
      aria-label="World Cup standings"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`type-h3 ${pitch ? 'text-white' : 'text-[var(--text-primary)]'}`}>
              Standings & Bracket
            </h3>
            {data?.phase && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                  pitch
                    ? 'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30'
                    : 'bg-yellow-500/10 text-yellow-600 ring-1 ring-yellow-500/25'
                }`}
              >
                {data.phase}
              </span>
            )}
          </div>
          <p className={`mt-0.5 text-[10px] ${pitch ? 'text-slate-400' : 'text-[var(--text-muted)]'}`}>
            Live tables · updates automatically · {localTimeHint()}
            {updatedLabel ? ` · ${updatedLabel}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-0.5">
          {VIEWS.map((v) => {
            const disabled = v.id === 'bracket' && !hasBracket && !loading;
            return (
              <button
                key={v.id}
                type="button"
                data-haptic="selection"
                data-haptic-tab="1"
                disabled={disabled}
                onClick={() => setView(v.id)}
                className={`rounded-full px-3 py-1.5 text-[10px] font-bold transition-all ${
                  view === v.id
                    ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40'
                    : disabled
                      ? 'cursor-not-allowed text-[var(--text-muted)] opacity-40'
                      : pitch
                        ? 'text-slate-300 hover:text-white'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      {view === 'groups' && legend.length > 0 && (
        <div className="flex flex-wrap gap-3 text-[9px] font-semibold">
          {legend.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: item.color || '#94a3b8' }}
                aria-hidden="true"
              />
              <span className={pitch ? 'text-slate-400' : 'text-[var(--text-muted)]'}>
                {item.label}
              </span>
            </span>
          ))}
        </div>
      )}

      {loading && !data ? (
        <StandingsSkeleton pitch={pitch} />
      ) : error && !data ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 text-xs font-bold text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      ) : view === 'bracket' ? (
        <BracketView bracket={bracket} pitch={pitch} />
      ) : groups.length === 0 ? (
        <div
          className={`rounded-xl border p-8 text-center text-sm ${
            pitch
              ? 'border-white/10 text-slate-300'
              : 'border-[var(--border-primary)] text-[var(--text-muted)]'
          }`}
        >
          Group tables will appear when official standings are published.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {groups.map((g) => (
            <GroupTable key={g.id || g.name} group={g} pitch={pitch} />
          ))}
        </div>
      )}
    </section>
  );
}
