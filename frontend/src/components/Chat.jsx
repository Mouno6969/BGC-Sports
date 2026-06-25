// ---------------------------------------------------------------------------
// Chat — public live chat over Socket.IO (no login required).
//
// Features:
//   - guest username (auto-generated server-side or user-chosen)
//   - real-time messages with user colors + timestamps
//   - basic text formatting (*bold*, _italic_) rendered safely
//   - emoji quick-reactions on messages
//   - online count
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import {
  formatTime,
  formatChatText,
  getStoredUsername,
  setStoredUsername,
} from '../lib/utils.js';

const QUICK_EMOJIS = ['🔥', '⚽', '🏀', '🎉', '😂', '😮', '👏', '💪'];
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '⚽'];

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState({}); // messageId -> {emoji: count}
  const [draft, setDraft] = useState('');
  const [me, setMe] = useState({ username: null, color: null });
  const [count, setCount] = useState(0);
  const [joined, setJoined] = useState(false);
  const [nameInput, setNameInput] = useState(getStoredUsername());
  const [openReactionFor, setOpenReactionFor] = useState(null);

  const listRef = useRef(null);

  // ----- Socket wiring ------------------------------------------------------
  useEffect(() => {
    function onWelcome(payload) {
      setMe(payload);
      setJoined(true);
    }
    function onHistory(history) {
      setMessages(history);
    }
    function onMessage(msg) {
      setMessages((prev) => [...prev, msg].slice(-200));
    }
    function onReaction({ messageId, emoji }) {
      setReactions((prev) => {
        const m = { ...(prev[messageId] || {}) };
        m[emoji] = (m[emoji] || 0) + 1;
        return { ...prev, [messageId]: m };
      });
    }
    function onCount(n) {
      setCount(n);
    }

    socket.on('chat:welcome', onWelcome);
    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    socket.on('chat:reaction', onReaction);
    socket.on('chat:count', onCount);

    return () => {
      socket.off('chat:welcome', onWelcome);
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
      socket.off('chat:reaction', onReaction);
      socket.off('chat:count', onCount);
    };
  }, []);

  // Auto-scroll to latest message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, reactions]);

  // ----- Actions ------------------------------------------------------------
  function handleJoin(e) {
    e.preventDefault();
    const name = nameInput.trim();
    if (name) setStoredUsername(name);
    socket.emit('chat:join', { username: name });
  }

  function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    socket.emit('chat:message', { text });
    setDraft('');
  }

  function sendReaction(messageId, emoji) {
    socket.emit('chat:reaction', { messageId, emoji });
    setOpenReactionFor(null);
  }

  const onlineLabel = useMemo(() => `${count} online`, [count]);

  // ----- Pre-join screen ----------------------------------------------------
  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div>
          <h3 className="text-lg font-bold text-white">Join the live chat</h3>
          <p className="mt-1 text-sm text-slate-400">
            No account needed. Pick a name or get a random one.
          </p>
        </div>
        <form onSubmit={handleJoin} className="w-full max-w-xs space-y-3">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={24}
            className="w-full rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-white outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:bg-accent-dark"
          >
            Enter chat
          </button>
        </form>
      </div>
    );
  }

  // ----- Chat screen --------------------------------------------------------
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-white">
          Live Chat
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulseLive" />
          {onlineLabel}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-4 py-3"
      >
        {messages.map((m) => {
          if (m.system) {
            return (
              <div
                key={m.id}
                className="text-center text-xs italic text-slate-500"
              >
                {m.text}
              </div>
            );
          }
          const msgReactions = reactions[m.id] || {};
          return (
            <div key={m.id} className="group relative">
              <div className="flex items-baseline gap-2">
                <span
                  className="text-sm font-semibold"
                  style={{ color: m.color }}
                >
                  {m.username}
                </span>
                <span className="text-[10px] text-slate-500">
                  {formatTime(m.ts)}
                </span>
              </div>
              <div
                className="break-words text-sm text-slate-200"
                dangerouslySetInnerHTML={{ __html: formatChatText(m.text) }}
              />

              {/* Reaction counts */}
              {Object.keys(msgReactions).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(msgReactions).map(([emoji, n]) => (
                    <span
                      key={emoji}
                      className="rounded-full bg-ink-600 px-2 py-0.5 text-xs"
                    >
                      {emoji} {n}
                    </span>
                  ))}
                </div>
              )}

              {/* Hover react button */}
              <button
                onClick={() =>
                  setOpenReactionFor(openReactionFor === m.id ? null : m.id)
                }
                className="absolute right-0 top-0 hidden rounded bg-ink-600 px-1.5 py-0.5 text-xs text-slate-300 group-hover:block hover:bg-ink-500"
                title="React"
              >
                ☺
              </button>

              {openReactionFor === m.id && (
                <div className="absolute right-0 top-6 z-10 flex gap-1 rounded-lg border border-ink-500 bg-ink-700 p-1 shadow-lg">
                  {REACTION_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => sendReaction(m.id, e)}
                      className="rounded px-1 text-base hover:bg-ink-500"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick emojis */}
      <div className="flex flex-wrap gap-1 border-t border-ink-600 px-3 pt-2">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => setDraft((d) => d + e)}
            className="rounded px-1.5 py-0.5 text-base hover:bg-ink-600"
          >
            {e}
          </button>
        ))}
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="flex gap-2 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…  (*bold* _italic_)"
          maxLength={500}
          className="flex-1 rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-white outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent-dark"
        >
          Send
        </button>
      </form>
    </div>
  );
}
