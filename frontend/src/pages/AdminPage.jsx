// ---------------------------------------------------------------------------
// AdminPage — stream management panel restyled to match the landing page
// design system (Design System v2: CSS variable tokens, Montserrat type
// scale, emerald accent, card-sports depth, rounded-xl controls).
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/config.js';

const STREAM_TYPES = [
  {
    id: 'hls',
    label: 'HLS',
    hint: '.m3u8 streams',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hint: 'Live or VOD links',
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
      </svg>
    ),
  },
  {
    id: 'twitch',
    label: 'Twitch',
    hint: 'Channel streams',
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
      </svg>
    ),
  },
];

function AdminHeader({ subtitle }) {
  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-[var(--border-primary)] glass-panel shadow-nav">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-6">
        <Link to="/" className="flex min-h-[44px] items-center gap-2.5" aria-label="BGC Sports Home">
          <span className="type-display text-xl italic tracking-tight text-[var(--accent)]">
            BGC<span className="text-[var(--text-primary)]"> </span>SPORTS
          </span>
          {subtitle && (
            <span className="rounded-md bg-[var(--accent-muted)] px-2 py-0.5 type-label text-[var(--accent-light)] ring-1 ring-[var(--accent)]/20">
              {subtitle}
            </span>
          )}
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Site
        </Link>
      </div>
    </header>
  );
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [url, setUrl] = useState('');
  const [type, setType] = useState('hls');
  const [status, setStatus] = useState(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authed) return;
    // F3: Hydrate from protected route with password header
    apiGet('/api/admin/stream', { 'x-admin-password': password })
      .then((d) => {
        setUrl(d.stream.url || '');
        setType(d.stream.type || 'hls');
      })
      .catch(() => {});
  }, [authed, password]);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError(null);
    setLoggingIn(true);
    try {
      await apiPost('/api/admin/login', { password });
      setAuthed(true);
    } catch (err) {
      setAuthError(err.message || 'Invalid password');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const { stream } = await apiPost(
        '/api/admin/stream',
        { url, type },
        { 'x-admin-password': password }
      );
      setStatusIsError(false);
      setStatus(`Stream updated at ${new Date(stream.updatedAt).toLocaleTimeString()}`);
    } catch (err) {
      setStatusIsError(true);
      setStatus(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  // ----- Login screen -------------------------------------------------------
  if (!authed) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--bg-primary)]">
        <AdminHeader subtitle="Admin" />
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
          {/* Stadium backdrop — same hero treatment as the landing page */}
          <div className="absolute inset-0 bg-[url('/stadium-bg.jpg')] bg-cover bg-center opacity-40" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-primary)]/90 via-[var(--bg-primary)]/80 to-[var(--bg-primary)]" aria-hidden="true" />

          <form
            onSubmit={handleLogin}
            className="card-sports relative z-10 w-full max-w-sm space-y-5 rounded-2xl p-7 animate-fadeInUp"
          >
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]/20">
                <svg className="h-7 w-7 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="type-h1 text-[var(--text-primary)]">Admin Panel</h1>
              <p className="type-body mt-2 text-[var(--text-secondary)]">
                Enter the admin password to manage the live stream.
              </p>
            </div>

            {authError && (
              <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400 ring-1 ring-red-500/20" role="alert">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {authError}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="admin-password" className="block type-label text-[var(--text-muted)]">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn || !password}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:bg-[var(--accent-dark)] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
            >
              {loggingIn ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Log in'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ----- Admin dashboard ----------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-primary)]">
      <AdminHeader subtitle="Admin" />
      <div className="page-container flex flex-1 items-start justify-center pt-10 sm:pt-16">
        <form
          onSubmit={handleSave}
          className="card-sports w-full max-w-lg space-y-6 rounded-2xl p-6 sm:p-8 animate-fadeInUp"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]/20">
              <svg className="h-6 w-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="type-h2 text-[var(--text-primary)]">Stream Settings</h1>
              <p className="type-caption mt-0.5 text-[var(--text-muted)]">
                Changes broadcast instantly to every viewer.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="stream-url" className="block type-label text-[var(--text-muted)]">
              Stream URL
            </label>
            <input
              id="stream-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/stream.m3u8  or YouTube/Twitch URL"
              className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>

          <div className="space-y-2">
            <span className="block type-label text-[var(--text-muted)]">Stream Type</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Stream type">
              {STREAM_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={type === t.id}
                  onClick={() => setType(t.id)}
                  className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 transition-all active:scale-[0.97] ${
                    type === t.id
                      ? 'border-[var(--accent)]/40 bg-[var(--accent-muted)] text-[var(--accent-light)] shadow-md shadow-[var(--accent)]/10'
                      : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t.icon}
                  <span className="text-xs font-bold">{t.label}</span>
                  <span className="type-caption text-[var(--text-muted)]">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {status && (
            <div
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ring-1 ${
                statusIsError
                  ? 'bg-red-500/10 text-red-400 ring-red-500/20'
                  : 'bg-[var(--accent-muted)] text-[var(--accent-light)] ring-[var(--accent)]/20'
              }`}
              role="status"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                {statusIsError ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
              {status}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:bg-[var(--accent-dark)] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Update stream (broadcast to all viewers)'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
