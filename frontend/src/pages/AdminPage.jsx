// ---------------------------------------------------------------------------
// AdminPage — stream management + client error feed for production visibility.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/config.js';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [url, setUrl] = useState('');
  const [type, setType] = useState('hls');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [errorStats, setErrorStats] = useState(null);
  const [errorsLoading, setErrorsLoading] = useState(false);

  const loadErrors = useCallback(async () => {
    if (!password) return;
    setErrorsLoading(true);
    try {
      const headers = { 'x-admin-password': password };
      const [list, stats] = await Promise.all([
        apiGet('/api/errors?limit=40', headers),
        apiGet('/api/errors/stats', headers),
      ]);
      setErrors(list.events || []);
      setErrorStats(stats);
    } catch {
      // leave existing
    } finally {
      setErrorsLoading(false);
    }
  }, [password]);

  useEffect(() => {
    if (!authed) return;
    // F3: Hydrate from protected route with password header
    apiGet('/api/admin/stream', { 'x-admin-password': password })
      .then((d) => {
        setUrl(d.stream.url || '');
        setType(d.stream.type || 'hls');
      })
      .catch(() => {});
    loadErrors();
    const t = setInterval(loadErrors, 30000);
    return () => clearInterval(t);
  }, [authed, password, loadErrors]);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError(null);
    try {
      await apiPost('/api/admin/login', { password });
      setAuthed(true);
    } catch (err) {
      setAuthError(err.message || 'Invalid password');
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
      setStatus(`Stream updated at ${new Date(stream.updatedAt).toLocaleTimeString()}`);
    } catch (err) {
      setStatus(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  // ----- Login screen -------------------------------------------------------
  if (!authed) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--bg-primary)]">
        <header className="border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <svg className="h-4 w-4 text-black" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
                </svg>
              </div>
              <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                BGC<span className="text-accent">SPORTS</span>
              </span>
            </Link>
            <Link to="/" className="text-xs font-bold text-accent hover:text-accent-light">
              &larr; Back to Site
            </Link>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center p-4">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-sm space-y-5 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-7"
          >
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
                <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="font-display text-xl font-extrabold text-[var(--text-primary)]">Admin Panel</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Enter the admin password to manage the live stream.
              </p>
            </div>
            {authError && (
              <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/20">
                {authError}
              </div>
            )}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-accent"
            />
            <button type="submit" className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-black hover:bg-accent-light">
              Log in
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ----- Admin dashboard ----------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-primary)]">
      <header className="border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <svg className="h-4 w-4 text-black" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
              </svg>
            </div>
            <span className="font-display text-sm font-bold text-[var(--text-primary)]">
              BGC<span className="text-accent">SPORTS</span> Admin
            </span>
          </Link>
          <Link to="/" className="text-xs font-bold text-accent hover:text-accent-light">
            View site &rarr;
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 py-8">
        <form
          onSubmit={handleSave}
          className="w-full space-y-6 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-7"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
              <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h1 className="font-display text-lg font-extrabold text-[var(--text-primary)]">Stream Settings</h1>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Stream URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/stream.m3u8  or YouTube/Twitch URL"
              className="w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Stream Type
            </label>
            <div className="flex gap-2">
              {['hls', 'youtube', 'twitch'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold capitalize transition-all duration-200 ${
                    type === t
                      ? 'bg-accent text-black'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {status && (
            <div className="rounded-xl bg-accent/10 px-3 py-2.5 text-sm text-accent ring-1 ring-accent/20">
              {status}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-black hover:bg-accent-light disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Update stream (broadcast to all viewers)'}
          </button>
        </form>

        {/* Client error feed */}
        <section className="w-full space-y-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[var(--text-primary)]">
                Client errors
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                JS crashes · failed APIs · stream load failures (last {errorStats?.buffered ?? errors.length} buffered)
                {errorStats?.byKind && (
                  <span className="ml-1">
                    · {Object.entries(errorStats.byKind).map(([k, v]) => `${k}:${v}`).join(' ')}
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={loadErrors}
              disabled={errorsLoading}
              className="rounded-full bg-[var(--bg-tertiary)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] ring-1 ring-[var(--border-primary)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              {errorsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {errors.length === 0 ? (
            <p className="rounded-xl bg-[var(--bg-tertiary)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              No client errors reported yet. They appear here automatically from production browsers.
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
              {errors.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
                    <span
                      className={
                        ev.level === 'error' || ev.level === 'fatal'
                          ? 'text-red-400'
                          : 'text-amber-400'
                      }
                    >
                      {ev.kind}
                    </span>
                    <span className="text-[var(--text-muted)]">{ev.level}</span>
                    <span className="text-[var(--text-muted)] font-normal normal-case">
                      {ev.receivedAt ? new Date(ev.receivedAt).toLocaleString() : ''}
                    </span>
                    {ev.context?.path && (
                      <span className="truncate font-mono font-normal normal-case text-[var(--text-muted)]">
                        {ev.context.path}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-primary)] break-words">{ev.message}</p>
                  {(ev.extra?.channelName || ev.extra?.streamUrl || ev.status != null) && (
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)] truncate">
                      {ev.extra?.channelName && <span>{ev.extra.channelName} · </span>}
                      {ev.extra?.streamUrl && <span>{ev.extra.streamUrl} · </span>}
                      {ev.status != null && <span>HTTP {ev.status}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
