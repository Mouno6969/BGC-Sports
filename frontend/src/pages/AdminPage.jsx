// ---------------------------------------------------------------------------
// AdminPage — password-protected panel to update the global live stream.
//
// Flow:
//   1. Enter the admin password (verified against the backend).
//   2. The password is held in memory and sent on each update request as the
//      "x-admin-password" header.
//   3. Set the stream URL + type; the backend broadcasts the change to all
//      connected viewers in real time.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/config.js';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [url, setUrl] = useState('');
  const [type, setType] = useState('hls');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load the current stream once authenticated.
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
          className="w-full max-w-sm space-y-4 rounded-xl border border-ink-600 bg-ink-800 p-6"
        >
          <div>
            <h1 className="text-lg font-extrabold text-white">Admin Panel</h1>
            <p className="mt-1 text-sm text-slate-400">
              Enter the admin password to manage the live stream.
            </p>
          </div>
          {authError && (
            <div className="rounded bg-red-500/10 px-2 py-1 text-sm text-red-300">
              {authError}
            </div>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:bg-accent-dark"
          >
            Log in
          </button>
          <Link
            to="/"
            className="block text-center text-xs text-slate-500 hover:text-slate-300"
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
        className="w-full max-w-lg space-y-5 rounded-xl border border-ink-600 bg-ink-800 p-6"
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-white">Stream Settings</h1>
          <Link
            to="/"
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            View site →
          </Link>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Stream URL
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/stream.m3u8  or YouTube/Twitch URL"
            className="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Stream Type
          </label>
          <div className="flex gap-2">
            {['hls', 'youtube', 'twitch'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                  type === t
                    ? 'bg-accent text-black'
                    : 'bg-ink-600 text-slate-300 hover:bg-ink-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {status && (
          <div className="rounded bg-ink-700 px-3 py-2 text-sm text-slate-200">
            {status}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:bg-accent-dark disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Update stream (broadcast to all viewers)'}
        </button>
      </form>
    </div>
  );
}
