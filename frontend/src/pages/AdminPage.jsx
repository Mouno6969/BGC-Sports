// ---------------------------------------------------------------------------
// AdminPage — stream management panel with redesigned UI matching FoxSports style.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
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
      <div className="flex flex-1 items-center justify-center p-4">
        <form
          onSubmit={handleSave}
          className="w-full max-w-lg space-y-6 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-7"
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
      </div>
    </div>
  );
}
