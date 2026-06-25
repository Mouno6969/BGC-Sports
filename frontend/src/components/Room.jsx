// ---------------------------------------------------------------------------
// Room — watch-party room management UI.
//
// Shows one of two states:
//   1. Lobby: create a new room OR join by entering a 6-char code.
//   2. Active room: room code (with copy), participant list, host controls
//      (lock/unlock, kick), "Sync to host" for non-hosts, and leave.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { copyToClipboard, getStoredUsername } from '../lib/utils.js';
import { socket } from '../lib/socket.js';

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
  const [copied, setCopied] = useState(false);

  function handleCreate() {
    onCreate(getStoredUsername());
  }

  function handleJoin(e) {
    e.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (code.length === 6) onJoin(code, getStoredUsername());
  }

  async function handleCopy() {
    const ok = await copyToClipboard(room.code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  // ----- Lobby --------------------------------------------------------------
  if (!room) {
    return (
      <div className="space-y-4 rounded-xl border border-ink-600 bg-ink-800 p-4">
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wide text-white">
            Watch Party
          </h4>
          <p className="mt-1 text-xs text-slate-400">
            Create a private room and invite friends with a 6-character code.
          </p>
        </div>

        {kicked && (
          <div className="rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
            You were removed from the room.
          </div>
        )}
        {error && (
          <div className="rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:bg-accent-dark"
        >
          Create a room
        </button>

        <div className="flex items-center gap-2 text-[10px] uppercase text-slate-500">
          <span className="h-px flex-1 bg-ink-600" />
          or join
          <span className="h-px flex-1 bg-ink-600" />
        </div>

        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            value={codeInput}
            onChange={(e) =>
              setCodeInput(e.target.value.toUpperCase().slice(0, 6))
            }
            placeholder="ENTER CODE"
            maxLength={6}
            className="flex-1 rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-center text-sm font-mono tracking-[0.3em] text-white outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-lg bg-ink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-500"
          >
            Join
          </button>
        </form>
      </div>
    );
  }

  // ----- Active room --------------------------------------------------------
  return (
    <div className="space-y-3 rounded-xl border border-ink-600 bg-ink-800 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-white">
          Room
        </h4>
        {room.locked && (
          <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-300">
            LOCKED
          </span>
        )}
      </div>

      {/* Room code + copy */}
      <div className="flex items-center gap-2 rounded-lg bg-ink-900 p-2">
        <span className="flex-1 text-center font-mono text-2xl font-bold tracking-[0.4em] text-accent">
          {room.code}
        </span>
        <button
          onClick={handleCopy}
          className="rounded-lg bg-ink-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ink-500"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Participants */}
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
          Participants ({participants.length})
        </p>
        <ul className="space-y-1">
          {participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded bg-ink-700 px-2 py-1 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-slate-200">
                  {p.username}
                  {p.id === socket.id ? ' (you)' : ''}
                </span>
                {p.id === room.hostId && (
                  <span className="rounded bg-accent/20 px-1.5 text-[10px] font-semibold text-accent">
                    HOST
                  </span>
                )}
              </span>
              {isHost && p.id !== socket.id && (
                <button
                  onClick={() => onKick(p.id)}
                  className="rounded px-1.5 text-[10px] text-red-300 hover:bg-red-500/20"
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
      <div className="flex flex-wrap gap-2">
        {isHost ? (
          <button
            onClick={() => onLock(!room.locked)}
            className="flex-1 rounded-lg bg-ink-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-ink-500"
          >
            {room.locked ? 'Unlock room' : 'Lock room'}
          </button>
        ) : (
          <button
            onClick={onRequestSync}
            className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-black transition hover:bg-accent-dark"
          >
            Sync to host
          </button>
        )}
        <button
          onClick={onLeave}
          className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
        >
          Leave room
        </button>
      </div>
    </div>
  );
}
