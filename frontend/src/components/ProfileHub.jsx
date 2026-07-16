// ---------------------------------------------------------------------------
// ProfileHub — stats, watch history, favorite teams, badges, and settings.
// Used inside the profile modal and the /profile page.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getProfile,
  saveProfile,
  clearProfile,
  getGuestName,
  getEffectiveName,
  getPredictorId,
  fileToCompressedAvatar,
  MAX_NAME_LEN,
  MAX_ADDRESS_LEN,
  MAX_BIO_LEN,
} from '../lib/profile.js';
import {
  getWatchSummary,
  onWatchStatsChange,
  formatWatchTime,
  getFavoriteTeams,
  setFavoriteTeams,
  FAVORITE_TEAM_OPTIONS,
  buildSyncPayload,
} from '../lib/watchStats.js';
import { apiGet, apiPost, logoUrl } from '../lib/config.js';
import UserAvatar from './UserAvatar.jsx';
import { showToast } from './Toast.jsx';
import { armChannelMediaTransition } from '../lib/viewTransitions.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'History' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'badges', label: 'Badges' },
  { id: 'settings', label: 'Settings' },
];

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60 px-3 py-2.5 text-center">
      <p className="text-lg font-extrabold tabular-nums text-[var(--accent)]">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      {sub && <p className="mt-0.5 text-[9px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function ProfileHub({ compact = false, onClose }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(() => getWatchSummary());
  const [form, setForm] = useState(getProfile);
  const [favs, setFavs] = useState(() => getFavoriteTeams());
  const [avatarError, setAvatarError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [predStats, setPredStats] = useState(null);
  const fileInputRef = useRef(null);
  const guestName = getGuestName();

  const refreshStats = useCallback(() => {
    setStats(getWatchSummary());
    setFavs(getFavoriteTeams());
  }, []);

  useEffect(() => onWatchStatsChange(refreshStats), [refreshStats]);

  useEffect(() => {
    setForm(getProfile());
    refreshStats();
    const userId = getPredictorId();
    apiGet(`/api/predictions/leaderboard?userId=${encodeURIComponent(userId)}&limit=5`)
      .then((d) => setPredStats(d.me || null))
      .catch(() => {});
    // Optional cloud backup of watch stats
    const payload = buildSyncPayload();
    apiPost('/api/profile/stats', payload).catch(() => {});
  }, [refreshStats]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError(null);
    try {
      const dataUrl = await fileToCompressedAvatar(file);
      update('avatar', dataUrl);
    } catch (err) {
      setAvatarError(err.message || 'Could not process the image');
    }
  }

  function handleSave(e) {
    e?.preventDefault();
    setSaving(true);
    saveProfile(form);
    setSaving(false);
    showToast('Profile saved', 'success');
    if (onClose && compact) onClose();
  }

  function handleClear() {
    clearProfile();
    setForm(getProfile());
    showToast('Profile cleared — back to guest name', 'success');
  }

  function toggleTeam(team) {
    const next = favs.includes(team)
      ? favs.filter((t) => t !== team)
      : favs.length >= 8
        ? favs
        : [...favs, team];
    if (!favs.includes(team) && favs.length >= 8) {
      showToast('Max 8 favorite teams', 'warning');
      return;
    }
    setFavs(setFavoriteTeams(next));
  }

  const previewName = (form.displayName || '').trim() || guestName;
  const unlockedBadges = useMemo(
    () => (stats.badges || []).filter((b) => b.unlocked),
    [stats.badges]
  );
  const lockedBadges = useMemo(
    () => (stats.badges || []).filter((b) => !b.unlocked),
    [stats.badges]
  );

  const topChannels = useMemo(() => {
    const plays = {};
    for (const h of stats.history || []) {
      plays[h.channelName] = (plays[h.channelName] || 0) + 1;
    }
    return Object.entries(plays)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [stats.history]);

  return (
    <div className={compact ? '' : 'mx-auto max-w-2xl px-4 py-6 space-y-4'}>
      {/* Header identity */}
      <div className="flex items-center gap-4">
        <UserAvatar
          name={previewName}
          avatar={form.avatar || getProfile().avatar}
          color="#22c55e"
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-extrabold text-[var(--text-primary)]">
            {getEffectiveName()}
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            {unlockedBadges.length}/{stats.totalBadges || 0} badges ·{' '}
            {formatWatchTime(stats.totalWatchSec)} watched
            {predStats?.rank ? ` · Predict #${predStats.rank}` : ''}
          </p>
          {favs.length > 0 && (
            <p className="mt-1 truncate text-[11px] text-accent">
              ❤️ {favs.join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-haptic="selection"
            data-haptic-tab="1"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
              tab === t.id
                ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Watch time" value={formatWatchTime(stats.totalWatchSec)} />
            <StatCard label="Sessions" value={stats.sessionsCount || 0} />
            <StatCard label="WC watches" value={stats.wcSessions || 0} />
            <StatCard
              label="Badges"
              value={`${stats.unlockedCount || 0}/${stats.totalBadges || 0}`}
            />
          </div>

          {unlockedBadges.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Recent badges
              </h3>
              <div className="flex flex-wrap gap-2">
                {unlockedBadges.slice(0, 6).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1"
                    title={b.description}
                  >
                    <span>{b.icon}</span>
                    <span className="text-[11px] font-bold text-amber-200">{b.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topChannels.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Most watched
              </h3>
              <ul className="space-y-1.5">
                {topChannels.map(([ch, n]) => (
                  <li
                    key={ch}
                    className="flex items-center justify-between rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                  >
                    <span className="truncate font-semibold text-[var(--text-primary)]">{ch}</span>
                    <span className="shrink-0 text-[11px] font-bold text-[var(--text-muted)]">
                      {n}×
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(stats.history || []).length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--border-primary)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              Start watching a channel to build your history and unlock badges.
            </p>
          )}

          {!compact && (
            <Link
              to="/?tab=predict"
              viewTransition
              className="block rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-center text-sm font-bold text-accent"
            >
              🎯 Climb the prediction leaderboard →
            </Link>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto scrollbar-thin">
          {(stats.history || []).length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              No watch history yet. Open any live channel to start tracking.
            </p>
          ) : (
            (stats.history || []).map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] px-3 py-2.5"
              >
                <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                  {h.logo && h.logo.startsWith('http') ? (
                    <img
                      src={logoUrl(h.logo)}
                      alt=""
                      className="h-full w-full object-contain p-0.5"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-sm">{h.isWorldCup ? '🏆' : '📺'}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                    {h.channelName}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {formatWhen(h.startedAt)} · {formatWatchTime(h.durationSec)}
                    {h.isWorldCup ? ' · World Cup' : ''}
                  </p>
                </div>
                {h.slug || h.channelUrl ? (
                  <Link
                    to={
                      h.slug
                        ? `/watch/${encodeURIComponent(h.slug)}`
                        : `/watch?url=${encodeURIComponent(h.channelUrl)}&name=${encodeURIComponent(h.channelName)}&logo=${encodeURIComponent(h.logo || '')}&source=${encodeURIComponent(h.source || '')}`
                    }
                    viewTransition
                    onPointerDown={() => {
                      if (h.channelUrl) armChannelMediaTransition(h.channelUrl);
                    }}
                    onClick={() => onClose?.()}
                    className="shrink-0 rounded-lg bg-accent/15 px-2.5 py-1.5 text-[10px] font-bold text-accent"
                  >
                    Watch
                  </Link>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {/* Favorites */}
      {tab === 'favorites' && (
        <div className="space-y-3">
          <p className="text-[11px] text-[var(--text-muted)]">
            Pick up to 8 favorite teams. Shown on your profile and used for personalization.
          </p>
          {favs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {favs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTeam(t)}
                  className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white"
                >
                  {t} ×
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 max-h-[40vh] overflow-y-auto scrollbar-thin">
            {FAVORITE_TEAM_OPTIONS.map((t) => {
              const on = favs.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTeam(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    on
                      ? 'bg-accent text-white'
                      : 'border border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-accent/40'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Badges */}
      {tab === 'badges' && (
        <div className="space-y-4 max-h-[55vh] overflow-y-auto scrollbar-thin">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-400/90">
              Unlocked ({unlockedBadges.length})
            </h3>
            {unlockedBadges.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">None yet — keep watching!</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {unlockedBadges.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 px-3 py-2.5"
                  >
                    <span className="text-2xl leading-none">{b.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{b.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{b.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Locked ({lockedBadges.length})
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {lockedBadges.map((b) => (
                <div
                  key={b.id}
                  className="flex items-start gap-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] px-3 py-2.5 opacity-60"
                >
                  <span className="text-2xl leading-none grayscale">{b.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text-secondary)]">{b.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{b.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      {tab === 'settings' && (
        <form onSubmit={handleSave} className="space-y-3.5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <UserAvatar name={previewName} avatar={form.avatar} color="#22c55e" size="xl" />
              {form.avatar && (
                <button
                  type="button"
                  onClick={() => update('avatar', '')}
                  aria-label="Remove picture"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
            >
              {form.avatar ? 'Change picture' : 'Upload picture'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFile}
              className="hidden"
            />
          </div>
          {avatarError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {avatarError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Display name
            </label>
            <input
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              placeholder={`Leave empty for ${guestName}`}
              maxLength={MAX_NAME_LEN}
              className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Date of birth
            </label>
            <input
              type="date"
              value={form.dob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => update('dob', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Address
            </label>
            <input
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="City, Country"
              maxLength={MAX_ADDRESS_LEN}
              className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Bio</label>
              <span className="text-[10px] text-[var(--text-muted)]">
                {(form.bio || '').length}/{MAX_BIO_LEN}
              </span>
            </div>
            <textarea
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              maxLength={MAX_BIO_LEN}
              rows={3}
              placeholder="Tell people a little about yourself…"
              className="w-full resize-none rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            Name & picture appear in chat and watch parties. Watch history and badges stay on this
            device (synced when online).
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              Save Profile
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-400"
            >
              Clear
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
