// ---------------------------------------------------------------------------
// PredictionLeaderboard — pick World Cup / football scores, earn points, climb
// the leaderboard. Exact score = 5 pts, correct winner/draw = 2 pts.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiGet, apiPost, logoUrl } from '../lib/config.js';
import { extractEventId } from '../lib/matchLinks.js';
import {
  getPredictorId,
  getEffectiveName,
  getEffectiveAvatar,
  onProfileChange,
} from '../lib/profile.js';
import { markPredictionMade } from '../lib/watchStats.js';
import { formatKickoff } from '../lib/utils.js';
import { showToast } from './Toast.jsx';
import UserAvatar from './UserAvatar.jsx';
import LiveBadge from './LiveBadge.jsx';
import {
  PredictionGridSkeleton,
  LeaderboardRowSkeleton,
} from './Skeleton.jsx';
import MatchActionRow from './MatchActionRow.jsx';

function TeamBadge({ badge, name }) {
  if (badge) {
    return (
      <img
        src={logoUrl(badge)}
        alt={name}
        className="h-9 w-9 object-contain"
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      />
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
      {(name || '?').charAt(0)}
    </div>
  );
}

function ScoreStepper({ value, onChange, disabled, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-lg font-bold text-[var(--text-primary)] ring-1 ring-[var(--border-primary)] disabled:opacity-40 active:scale-95"
          aria-label="Decrease"
        >
          −
        </button>
        <span className="min-w-[2rem] text-center text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
          {value}
        </span>
        <button
          type="button"
          disabled={disabled || value >= 15}
          onClick={() => onChange(Math.min(15, value + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-lg font-bold text-[var(--text-primary)] ring-1 ring-[var(--border-primary)] disabled:opacity-40 active:scale-95"
          aria-label="Increase"
        >
          +
        </button>
      </div>
    </div>
  );
}

function PredictMatchCard({ match, existing, onSaved, scoring }) {
  const locked = Boolean(match.locked) || match.status === 'FINISHED' || match.status === 'LIVE';
  const [home, setHome] = useState(existing?.homeScore ?? 1);
  const [away, setAway] = useState(existing?.awayScore ?? 1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setHome(existing.homeScore);
      setAway(existing.awayScore);
    }
  }, [existing?.homeScore, existing?.awayScore, existing?.id]);

  async function save() {
    if (locked) return;
    setSaving(true);
    try {
      const res = await apiPost('/api/predictions', {
        userId: getPredictorId(),
        matchId: match.id,
        homeScore: home,
        awayScore: away,
        matchHome: match.home,
        matchAway: match.away,
        kickoff: match.timestamp,
        league: match.league,
        stage: match.stage,
        displayName: getEffectiveName(),
        avatar: getEffectiveAvatar(),
      });
      if (res.ok) {
        showToast(existing ? 'Prediction updated' : 'Prediction locked in!', 'success');
        if (!existing) {
          const newly = markPredictionMade();
          if (newly?.[0]) {
            showToast(`Badge unlocked: ${newly[0].icon} ${newly[0].name}`, 'success');
          }
        }
        onSaved?.(res.prediction);
      }
    } catch (err) {
      showToast(err.message || 'Could not save prediction', 'error');
    } finally {
      setSaving(false);
    }
  }

  const settled = existing?.status === 'settled';
  const pts = existing?.pointsAwarded;

  const eventId = extractEventId(match) || '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      data-match-id={match.id}
      data-match-event={eventId || undefined}
      className={`rounded-xl border p-4 transition-shadow ${
        settled
          ? pts > 0
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-[var(--border-primary)] bg-[var(--bg-card)]'
          : locked
            ? 'border-[var(--border-primary)] bg-[var(--bg-card)] opacity-90'
            : 'border-accent/25 bg-accent/5'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {match.league}
            {match.stage ? ` · ${String(match.stage).replace(/^FIFA World Cup,?\s*/i, '')}` : ''}
          </p>
          {match.timestamp && (
            <p className="text-[10px] text-[var(--text-muted)]">
              {formatKickoff(match, { style: 'medium' })}
            </p>
          )}
        </div>
        {match.status === 'LIVE' && <LiveBadge label="LIVE" />}
        {settled && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              pts >= (scoring?.exact || 5)
                ? 'bg-emerald-500/15 text-emerald-400'
                : pts > 0
                  ? 'bg-accent/15 text-accent'
                  : 'bg-slate-500/15 text-slate-400'
            }`}
          >
            {pts > 0 ? `+${pts} pts` : '0 pts'}
          </span>
        )}
        {!settled && existing && !locked && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold text-accent">
            Saved
          </span>
        )}
        {locked && !settled && (
          <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[9px] font-bold text-slate-400">
            Locked
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 flex-col items-center gap-1 min-w-0">
          <TeamBadge badge={match.homeBadge} name={match.home} />
          <span className="w-full truncate text-center text-[11px] font-semibold text-[var(--text-primary)]">
            {match.home}
          </span>
        </div>

        {settled || match.status === 'FINISHED' || match.status === 'LIVE' ? (
          <div className="flex flex-col items-center gap-1 shrink-0 px-2">
            <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
              {match.homeScore ?? existing?.actualHome ?? '–'} – {match.awayScore ?? existing?.actualAway ?? '–'}
            </span>
            {existing && (
              <span className="text-[10px] text-[var(--text-muted)]">
                Your pick {existing.homeScore}–{existing.awayScore}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <ScoreStepper value={home} onChange={setHome} disabled={locked || saving} label="Home" />
            <span className="text-sm font-bold text-[var(--text-muted)] pt-4">–</span>
            <ScoreStepper value={away} onChange={setAway} disabled={locked || saving} label="Away" />
          </div>
        )}

        <div className="flex flex-1 flex-col items-center gap-1 min-w-0">
          <TeamBadge badge={match.awayBadge} name={match.away} />
          <span className="w-full truncate text-center text-[11px] font-semibold text-[var(--text-primary)]">
            {match.away}
          </span>
        </div>
      </div>

      {!locked && match.status === 'UPCOMING' && (
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="mt-4 w-full rounded-lg bg-accent py-2.5 text-sm font-bold text-white transition-all hover:bg-accent-light active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? 'Saving…' : existing ? 'Update prediction' : 'Submit prediction'}
        </button>
      )}
      <MatchActionRow match={match} hide={['predict']} />
    </motion.div>
  );
}

function LeaderboardRow({ row, highlight }) {
  const medal =
    row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null;
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
        highlight
          ? 'bg-accent/10 ring-1 ring-accent/30'
          : 'bg-[var(--bg-card)] border border-[var(--border-primary)]'
      }`}
    >
      <span className="w-8 shrink-0 text-center text-sm font-extrabold text-[var(--text-muted)]">
        {medal || `#${row.rank}`}
      </span>
      <UserAvatar
        name={row.displayName}
        avatar={row.avatarUrl || ''}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--text-primary)]">
          {row.displayName}
          {highlight && (
            <span className="ml-1.5 text-[10px] font-semibold text-accent">you</span>
          )}
        </p>
        <p className="text-[10px] text-[var(--text-muted)]">
          {row.exactScores} exact · {row.correctResults} correct
          {row.currentStreak > 1 ? ` · 🔥 ${row.currentStreak}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-base font-extrabold tabular-nums text-accent">{row.points}</p>
        <p className="text-[9px] font-bold uppercase text-[var(--text-muted)]">pts</p>
      </div>
    </div>
  );
}

export default function PredictionLeaderboard({ pitch = false }) {
  const [searchParams] = useSearchParams();
  const focusMatchParam = searchParams.get('match') || '';
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState([]);
  const [recentFinished, setRecentFinished] = useState([]);
  const [myPredictions, setMyPredictions] = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [me, setMe] = useState(null);
  const [scoring, setScoring] = useState({ exact: 5, correctResult: 2 });
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [subTab, setSubTab] = useState('predict'); // predict | board | history
  const [nameTick, setNameTick] = useState(0);

  useEffect(() => onProfileChange(() => setNameTick((n) => n + 1)), []);

  const load = useCallback(async () => {
    const userId = getPredictorId();
    try {
      const [openData, boardData] = await Promise.all([
        apiGet(`/api/predictions/open?userId=${encodeURIComponent(userId)}`),
        apiGet(`/api/predictions/leaderboard?userId=${encodeURIComponent(userId)}&limit=40`),
      ]);
      setOpen(openData.open || []);
      setRecentFinished(openData.recentFinished || []);
      setMyPredictions(openData.myPredictions || {});
      setScoring(openData.scoring || boardData.scoring || { exact: 5, correctResult: 2 });
      setLeaderboard(boardData.leaderboard || []);
      setMe(boardData.me || openData.me || null);
      setTotalPlayers(boardData.totalPlayers || 0);
    } catch (err) {
      console.error('[predictions]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [load]);

  // Deep-link from score cards: /?tab=predict&match=760510
  useEffect(() => {
    if (!focusMatchParam || loading) return;
    setSubTab('predict');
    const target = String(focusMatchParam);
    const timer = setTimeout(() => {
      const el =
        document.querySelector(`[data-match-id="${CSS.escape(target)}"]`) ||
        document.querySelector(`[data-match-event="${CSS.escape(target)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-[var(--bg-primary)]');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-accent', 'ring-offset-2', 'ring-offset-[var(--bg-primary)]');
        }, 2600);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [focusMatchParam, loading, open, recentFinished]);

  const pendingCount = useMemo(
    () => open.filter((m) => m.status === 'UPCOMING' && !m.locked).length,
    [open]
  );

  const history = useMemo(() => {
    return Object.values(myPredictions)
      .filter((p) => p.status === 'settled')
      .sort((a, b) => String(b.settledAt || '').localeCompare(String(a.settledAt || '')));
  }, [myPredictions]);

  function handleSaved(pred) {
    setMyPredictions((prev) => ({ ...prev, [pred.matchId]: pred }));
    // soft refresh rank
    load();
  }

  const textMuted = pitch ? 'text-slate-300' : 'text-[var(--text-muted)]';
  const textPrimary = pitch ? 'text-white' : 'text-[var(--text-primary)]';

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 ring-1 ring-amber-500/30">
            <span className="text-lg">🎯</span>
          </div>
          <div>
            <h2 className={`type-h2 flex items-center gap-2 flex-wrap ${textPrimary}`}>
              Prediction League
            </h2>
            <p className={`text-[10px] ${textMuted}`}>
              Exact score {scoring.exact} pts · Correct result {scoring.correctResult} pts
              {totalPlayers > 0 ? ` · ${totalPlayers} players` : ''}
            </p>
          </div>
        </div>

        {me && (
          <div className="rounded-xl border border-accent/25 bg-accent/10 px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase text-accent">Your rank</p>
            <p className={`text-lg font-extrabold ${textPrimary}`}>
              {me.rank ? `#${me.rank}` : '—'}{' '}
              <span className="text-sm font-bold text-accent">{me.points || 0} pts</span>
            </p>
            <p className={`text-[10px] ${textMuted}`}>
              {me.exactScores || 0} exact · streak {me.currentStreak || 0}
            </p>
          </div>
        )}
      </div>

      {/* Identity hint */}
      <div
        className={`rounded-xl border border-[var(--border-primary)] px-3 py-2 text-[11px] ${
          pitch ? 'bg-black/30 text-slate-300' : 'bg-[var(--bg-card)] text-[var(--text-muted)]'
        }`}
      >
        Playing as <strong className={textPrimary}>{getEffectiveName()}</strong>
        {' · '}
        Set your name in profile so friends recognize you on the board.
        {pendingCount > 0 && (
          <span className="ml-1 font-semibold text-accent">
            {pendingCount} match{pendingCount > 1 ? 'es' : ''} open to predict
          </span>
        )}
        <span className="sr-only">{nameTick}</span>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'predict', label: '⚽ Predict' },
          { id: 'board', label: '🏆 Leaderboard' },
          { id: 'history', label: '📋 My results' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            data-haptic="selection"
            data-haptic-tab="1"
            onClick={() => setSubTab(t.id)}
            className={`rounded-full px-3 py-1 text-[10px] font-bold transition-all ${
              subTab === t.id
                ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                : `${textMuted} hover:text-[var(--text-secondary)]`
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        subTab === 'board' ? (
          <div className="space-y-2" role="status" aria-label="Loading leaderboard">
            {Array.from({ length: 8 }).map((_, i) => (
              <LeaderboardRowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <PredictionGridSkeleton count={4} />
        )
      ) : subTab === 'board' ? (
        <div className="space-y-2">
          {leaderboard.length === 0 ? (
            <p className={`rounded-xl border border-[var(--border-primary)] p-8 text-center text-sm ${textMuted}`}>
              No predictors yet — be the first to submit a score!
            </p>
          ) : (
            leaderboard.map((row) => (
              <LeaderboardRow
                key={row.id}
                row={row}
                highlight={me && row.id === me.id}
              />
            ))
          )}
        </div>
      ) : subTab === 'history' ? (
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className={`rounded-xl border border-[var(--border-primary)] p-8 text-center text-sm ${textMuted}`}>
              Settled predictions will show here after matches finish.
            </p>
          ) : (
            history.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className={`truncate text-sm font-bold ${textPrimary}`}>
                    {p.matchHome} vs {p.matchAway}
                  </p>
                  <p className={`text-[10px] ${textMuted}`}>
                    Pick {p.homeScore}–{p.awayScore}
                    {p.actualHome != null && (
                      <> · FT {p.actualHome}–{p.actualAway}</>
                    )}
                    {p.exact && ' · Exact!'}
                    {!p.exact && p.correctResult && ' · Result'}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-extrabold ${
                    p.pointsAwarded > 0 ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {p.pointsAwarded > 0 ? `+${p.pointsAwarded}` : '0'}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {open.length === 0 && recentFinished.length === 0 ? (
            <p className={`rounded-xl border border-[var(--border-primary)] p-8 text-center text-sm ${textMuted}`}>
              No open fixtures right now. Check back before the next kickoff.
            </p>
          ) : (
            <>
              {open.length > 0 && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {[...open]
                    .sort((a, b) => {
                      if (!focusMatchParam) return 0;
                      const fa = String(a.id).includes(focusMatchParam) || extractEventId(a) === focusMatchParam;
                      const fb = String(b.id).includes(focusMatchParam) || extractEventId(b) === focusMatchParam;
                      if (fa && !fb) return -1;
                      if (!fa && fb) return 1;
                      return 0;
                    })
                    .map((m) => (
                    <PredictMatchCard
                      key={m.id}
                      match={m}
                      existing={myPredictions[m.id]}
                      onSaved={handleSaved}
                      scoring={scoring}
                    />
                  ))}
                </div>
              )}
              {recentFinished.length > 0 && (
                <div className="space-y-2">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${textMuted}`}>
                    Recently finished
                  </h3>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {recentFinished.map((m) => (
                      <PredictMatchCard
                        key={m.id}
                        match={m}
                        existing={myPredictions[m.id]}
                        onSaved={handleSaved}
                        scoring={scoring}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
