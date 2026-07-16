// ---------------------------------------------------------------------------
// LiveCommentary — World Cup live play-by-play on the watch page.
// Polls /api/scores/commentary and shows goals/cards/commentary for LIVE
// (or recent) FIFA World Cup matches while a WC channel stream is open.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, logoUrl } from '../lib/config.js';
import LiveBadge from './LiveBadge.jsx';

function eventIcon(ev) {
  const blob = `${ev.type || ''} ${ev.typeLabel || ''} ${ev.text || ''}`;
  if (ev.scoringPlay || /goal/i.test(blob)) return '⚽';
  if (/yellow/i.test(blob)) return '🟨';
  if (/red/i.test(blob)) return '🟥';
  if (/sub|substitut/i.test(blob)) return '🔄';
  if (/penalt|VAR|var/i.test(blob)) return '📺';
  if (/kick.?off|start|half/i.test(blob)) return '🏁';
  if (/whistle|full.?time|end/i.test(blob)) return '⏱';
  return '🎙️';
}

function MatchChip({ match, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(match.eventId || match.id)}
      className={`flex min-w-[140px] shrink-0 flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-all active:scale-[0.98] ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30'
          : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60 hover:border-[var(--accent)]/40'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {match.status === 'LIVE' ? (
          <LiveBadge className="scale-90 origin-left" />
        ) : (
          <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--text-muted)]">
            {match.status || 'FT'}
          </span>
        )}
        {match.progress && (
          <span className="font-mono text-[10px] font-bold text-accent">{match.progress}</span>
        )}
      </div>
      <p className="truncate text-[11px] font-bold text-[var(--text-primary)]">
        {match.homeShort || match.home} {match.homeScore ?? '–'}–{match.awayScore ?? '–'}{' '}
        {match.awayShort || match.away}
      </p>
      {match.stage && (
        <p className="truncate text-[9px] text-[var(--text-muted)]">{match.stage}</p>
      )}
    </button>
  );
}

function CommentaryEvent({ ev }) {
  const isGoal = ev.scoringPlay || /goal/i.test(`${ev.type} ${ev.typeLabel} ${ev.text}`);
  const isCard = /card|yellow|red/i.test(`${ev.type} ${ev.typeLabel}`);
  return (
    <li className="relative pb-3 pl-5 last:pb-1">
      <span
        className={`absolute -left-1.5 top-1.5 flex h-3 w-3 items-center justify-center rounded-full text-[8px] ring-2 ring-[var(--bg-secondary)] ${
          isGoal
            ? 'bg-emerald-400'
            : isCard
              ? 'bg-amber-400'
              : 'bg-[var(--accent)]/50'
        }`}
        aria-hidden
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm leading-none" aria-hidden>
          {eventIcon(ev)}
        </span>
        {ev.clock && (
          <span className="font-mono text-[11px] font-bold text-accent">{ev.clock}</span>
        )}
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {ev.typeLabel || 'Update'}
        </span>
        {ev.team && (
          <span className="text-[10px] text-[var(--text-muted)]">· {ev.team}</span>
        )}
      </div>
      <p
        className={`mt-0.5 text-[13px] leading-snug ${
          isGoal ? 'font-semibold text-emerald-300' : 'text-[var(--text-primary)]'
        }`}
      >
        {ev.text}
      </p>
    </li>
  );
}

export default function LiveCommentary({ compact = false, className = '' }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const listRef = useRef(null);
  const prevFirstEventId = useRef(null);

  useEffect(() => {
    let alive = true;
    let timer = null;

    async function load(isPoll = false) {
      try {
        if (!isPoll) setLoading(true);
        const q = selectedId ? `?event=${encodeURIComponent(selectedId)}` : '';
        const data = await apiGet(`/api/scores/commentary${q}`);
        if (!alive) return;
        setPayload(data);
        setError(null);
        // Auto-select first match once
        if (!selectedId && data?.matches?.length) {
          setSelectedId(data.matches[0].eventId || data.matches[0].id);
        }
      } catch (err) {
        if (!alive) return;
        if (!isPoll) setError('Could not load live commentary.');
      } finally {
        if (alive && !isPoll) setLoading(false);
      }
    }

    load(false);
    // Poll every 20s for live feel
    timer = setInterval(() => load(true), 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selectedId]);

  const matches = payload?.matches || [];
  const active = useMemo(() => {
    if (!matches.length) return null;
    if (selectedId) {
      return (
        matches.find((m) => m.eventId === selectedId || m.id === selectedId)
        || matches[0]
      );
    }
    return matches[0];
  }, [matches, selectedId]);

  // Soft scroll-to-top when a brand new event arrives
  useEffect(() => {
    const first = active?.events?.[0]?.id;
    if (first && prevFirstEventId.current && first !== prevFirstEventId.current) {
      listRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
    }
    prevFirstEventId.current = first || null;
  }, [active?.events]);

  if (loading && !payload) {
    return (
      <div className={`flex h-full flex-col gap-2 p-3 ${className}`}>
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--bg-tertiary)]" />
        <div className="h-16 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <div className="h-16 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <div className="h-16 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className={`flex h-full items-center justify-center p-4 text-center ${className}`}>
        <p className="text-sm text-[var(--text-muted)]">{error}</p>
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className={`flex h-full flex-col items-center justify-center gap-2 p-6 text-center ${className}`}>
        <span className="text-2xl" aria-hidden>
          🎙️
        </span>
        <p className="text-sm font-semibold text-[var(--text-primary)]">No live commentary yet</p>
        <p className="max-w-xs text-xs text-[var(--text-muted)]">
          World Cup play-by-play appears here when matches are live. Check the World Cup tab for the schedule.
        </p>
        <Link
          to="/?tab=worldcup"
          className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white active:scale-95"
        >
          World Cup schedule
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base" aria-hidden>
              🎙️
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-[var(--text-primary)]">
                World Cup Live Commentary
              </p>
              <p className="truncate text-[10px] text-[var(--text-muted)]">
                {payload?.note || 'Live updates'}
                {payload?.liveCount != null ? ` · ${payload.liveCount} live` : ''}
              </p>
            </div>
          </div>
          {active?.matchCenterPath && (
            <Link
              to={active.matchCenterPath}
              className="shrink-0 rounded-md border border-[var(--border-primary)] px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              Match Center
            </Link>
          )}
        </div>

        {/* Match picker when multiple */}
        {matches.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-thin pb-0.5">
            {matches.map((m) => (
              <MatchChip
                key={m.eventId || m.id}
                match={m}
                active={(selectedId || active?.eventId) === (m.eventId || m.id)}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Active scoreboard */}
      {active && (
        <div className="shrink-0 flex items-center gap-2 border-b border-[var(--border-primary)] px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {active.homeBadge && (
              <img
                src={logoUrl(active.homeBadge)}
                alt=""
                className="h-6 w-6 object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
            <span className="truncate text-xs font-bold text-[var(--text-primary)]">
              {active.home}
            </span>
          </div>
          <div className="shrink-0 text-center">
            <p className="font-display text-lg font-black tabular-nums text-[var(--text-primary)]">
              {active.homeScore ?? '–'}
              <span className="mx-0.5 text-[var(--text-muted)]">:</span>
              {active.awayScore ?? '–'}
            </p>
            <p className="text-[10px] font-bold text-accent">
              {active.status === 'LIVE' ? active.progress || 'LIVE' : active.status}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-xs font-bold text-[var(--text-primary)]">
              {active.away}
            </span>
            {active.awayBadge && (
              <img
                src={logoUrl(active.awayBadge)}
                alt=""
                className="h-6 w-6 object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Events — newest first */}
      <div
        ref={listRef}
        className={`min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3 py-2 ${
          compact ? '' : ''
        }`}
      >
        {!active?.events?.length ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            Waiting for the next update…
          </p>
        ) : (
          <ol className="relative ml-2 space-y-0 border-l border-[var(--border-primary)]">
            {active.events.map((ev) => (
              <CommentaryEvent key={ev.id} ev={ev} />
            ))}
          </ol>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--border-primary)] px-3 py-1.5 text-center text-[9px] text-[var(--text-muted)]">
        Auto-refreshes every 20s · ESPN World Cup feed
      </div>
    </div>
  );
}
