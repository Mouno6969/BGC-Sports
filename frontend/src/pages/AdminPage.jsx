// ---------------------------------------------------------------------------
// AdminPage — stream management panel with redesigned UI.
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
    apiGet('/api/stream')
      .then((d) => {
        setUrl(d.stream.url || '');
        setType(d.stream.type || 'hls');
      })
      .catch(() => {});
  }, [authed]);

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
      <div className="flex min-h-screen items-center justify-center bg-ink-900 p-4">
        <form
          onSubmit={handleLogin}
          className="animate-scaleIn w-full max-w-sm space-y-5 rounded-2xl border border-ink-600/50 bg-gradient-to-br from-ink-800 to-ink-900 p-7 shadow-card"
        >
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/10 ring-1 ring-secondary/20">
              <svg className="h-6 w-6 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="font-display text-xl font-extrabold text-white">Admin Panel</h1>
            <p className="mt-1 text-sm text-slate-400">
              Enter the admin password to manage the live stream.
            </p>
          </div>
          {authError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/20">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {authError}
            </div>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="input-field"
          />
          <button
            type="submit"
            className="btn-primary w-full"
          >
            Log in
          </button>
          <Link
            to="/"
            className="block text-center text-xs text-slate-500 transition-colors hover:text-slate-300"
          >
            ← Back to watch party
          </Link>
        </form>
      </div>
    );
  }

  // ----- Admin dashboard ----------------------------------------------------
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-900 p-4">
      <form
        onSubmit={handleSave}
        className="animate-scaleIn w-full max-w-lg space-y-6 rounded-2xl border border-ink-600/50 bg-gradient-to-br from-ink-800 to-ink-900 p-7 shadow-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 ring-1 ring-secondary/20">
              <svg className="h-5 w-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h1 className="font-display text-lg font-extrabold text-white">Stream Settings</h1>
          </div>
          <Link
            to="/"
            className="rounded-xl border border-ink-600 px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-ink-400 hover:text-slate-200"
          >
            View site →
          </Link>
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Stream URL
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/stream.m3u8  or YouTube/Twitch URL"
            className="input-field"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
                    ? 'bg-accent text-black shadow-glow-sm'
                    : 'bg-ink-700 text-slate-300 hover:bg-ink-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {status && (
          <div className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2.5 text-sm text-accent ring-1 ring-accent/20">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {status}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Update stream (broadcast to all viewers)'}
        </button>
      </form>
    </div>
  );
}
