// ---------------------------------------------------------------------------
// Room — create/join room panel + active room view.
// Redesigned with hero section, improved UX, share button, and animations.
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { socket } from '../lib/socket.js';
import { copyToClipboard, getStoredUsername, setStoredUsername } from '../lib/utils.js';
import { showToast } from './Toast.jsx';

export default function Room({
  room,
  participants,
  error,
  kicked,
  isHost,
  onCreate,
  onJoin,
  onLeave,
  onRequestSync,
  onLock,
  onKick,
}) {
  const [codeInput, setCodeInput] = useState('');
  const [nameInput, setNameInput] = useState(getStoredUsername());
  const [copied, setCopied] = useState(false);

  function handleCreate() {
    const username = nameInput.trim() || 'Guest';
    setStoredUsername(username);
    onCreate(username);
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!codeInput.trim()) return;
    const username = nameInput.trim() || 'Guest';
    setStoredUsername(username);
    onJoin(codeInput.trim(), username);
  }

  async function handleCopy() {
    const link = `${window.location.origin}?room=${room.code}`;
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopied(true);
      showToast('Room link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleShare() {
    const link = `${window.location.origin}?room=${room.code}`;
    const text = `Join my BGC Sports watch party! Room code: ${room.code}`;
    // Try native share first
    if (navigator.share) {
      navigator.share({ title: 'BGC Sports Watch Party', text, url: link }).catch(() => {});
    } else {
      // Fallback: WhatsApp share
      window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + link)}`, '_blank');
    }
  }

  // ----- No room: Hero / Create / Join UI -----------------------------------
  if (!room) {
    return (
      <div className="animate-fadeIn space-y-5 rounded-2xl border border-ink-600/50 bg-gradient-to-br from-ink-800 to-ink-900 p-6 shadow-card">
        {/* Hero section when no room is active */}
        <div className="text-center">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-white md:text-2xl">
            Watch Live Sports{' '}
            <span className="bg-gradient-to-r from-accent to-accent-light bg-clip-text text-transparent">
              Together
            </span>
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Create a private room and invite up to 8 friends. No signup needed — just voice, video & vibes.
          </p>
        </div>

        {/* Name input */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Your Name
          </label>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Enter your name"
            maxLength={24}
            className="input-field"
          />
        </div>

        {kicked && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 ring-1 ring-red-500/20">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            You were removed from the room.
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 ring-1 ring-red-500/20">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Create room button */}
        <button
          onClick={handleCreate}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create a Room
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-ink-500 to-transparent" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            or join with code
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-transparent via-ink-500 to-transparent" />
        </div>

        {/* Join form */}
        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            value={codeInput}
            onChange={(e) =>
              setCodeInput(e.target.value.toUpperCase().slice(0, 6))
            }
            placeholder="ENTER CODE"
            maxLength={6}
            className="flex-1 rounded-xl border border-ink-500 bg-ink-900 px-4 py-2.5 text-center font-mono text-sm font-bold tracking-[0.3em] text-white outline-none transition-all duration-200 focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
          <button
            type="submit"
            className="btn-ghost px-5"
          >
            Join
          </button>
        </form>

        {/* Value proposition */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          {[
            { icon: '🎬', text: 'Synced streams' },
            { icon: '🎙️', text: 'Voice & video' },
            { icon: '💬', text: 'Live chat' },
          ].map((item) => (
            <span
              key={item.text}
              className="flex items-center gap-1.5 rounded-full bg-ink-700/50 px-2.5 py-1 text-[11px] text-slate-400"
            >
              <span>{item.icon}</span>
              {item.text}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ----- Active room --------------------------------------------------------
  return (
    <div className="animate-scaleIn space-y-4 rounded-2xl border border-ink-600/50 bg-gradient-to-br from-ink-800 to-ink-900 p-5 shadow-card">
      {/* Room header */}
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-white">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Room
        </h4>
        {room.locked && (
          <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2.5 py-1 text-[10px] font-bold text-yellow-300 ring-1 ring-yellow-500/20">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            LOCKED
          </span>
        )}
      </div>

      {/* Room code + copy + share */}
      <div className="flex items-center gap-2 rounded-xl bg-ink-950 p-3 ring-1 ring-ink-600/50">
        <span className="flex-1 text-center font-mono text-2xl font-bold tracking-[0.4em] text-accent drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
          {room.code}
        </span>
        <button
          onClick={handleCopy}
          className="rounded-lg bg-ink-600 px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-ink-500 hover:shadow-glow-sm"
          title="Copy invite link"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <button
          onClick={handleShare}
          className="rounded-lg bg-secondary/20 px-3 py-1.5 text-xs font-semibold text-secondary transition-all duration-200 hover:bg-secondary/30"
          title="Share room"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>
      </div>

      {/* Participants */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <span>Participants</span>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
            {participants.length}
          </span>
        </p>
        <ul className="space-y-1.5">
          {participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl bg-ink-700/50 px-3 py-2 text-sm transition-all duration-150 hover:bg-ink-700"
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-ink-800"
                  style={{ backgroundColor: p.color }}
                />
                <span className="font-medium text-slate-200">
                  {p.username}
                  {p.id === socket.id && (
                    <span className="ml-1 text-[10px] text-slate-500">(you)</span>
                  )}
                </span>
                {p.id === room.hostId && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent ring-1 ring-accent/20">
                    HOST
                  </span>
                )}
              </span>
              {isHost && p.id !== socket.id && (
                <button
                  onClick={() => onKick(p.id)}
                  className="rounded-lg px-2 py-1 text-[10px] font-medium text-red-400 transition-all hover:bg-red-500/10 hover:text-red-300"
                  title="Kick participant"
                >
                  Kick
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 pt-1">
        {isHost ? (
          <button
            onClick={() => onLock(!room.locked)}
            className="btn-ghost flex-1 flex items-center justify-center gap-1.5"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {room.locked ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              )}
            </svg>
            {room.locked ? 'Unlock' : 'Lock room'}
          </button>
        ) : (
          <button
            onClick={onRequestSync}
            className="btn-primary flex-1 flex items-center justify-center gap-1.5"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync to host
          </button>
        )}
        <button
          onClick={onLeave}
          className="flex-1 rounded-xl bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-400 ring-1 ring-red-500/20 transition-all duration-200 hover:bg-red-500/20 hover:text-red-300 active:scale-[0.98]"
        >
          Leave room
        </button>
      </div>
    </div>
  );
}
