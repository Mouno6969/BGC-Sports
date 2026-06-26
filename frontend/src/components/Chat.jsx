// ---------------------------------------------------------------------------
// Chat — live public chat sidebar with reactions, animations, and proper
// Socket.IO event handling matching the backend.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import { formatTime, formatChatText, getStoredUsername, setStoredUsername } from '../lib/utils.js';

const QUICK_EMOJIS = ['👏', '🔥', '⚽', '🏀', '🎉', '😂', '❤️', '💪'];
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😮'];

export default function Chat() {
  const [joined, setJoined] = useState(false);
  const [nameInput, setNameInput] = useState(getStoredUsername());
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [myUsername, setMyUsername] = useState('');
  const [myColor, setMyColor] = useState('#22c55e');
  const [reactions, setReactions] = useState({});
  const [openReactionFor, setOpenReactionFor] = useState(null);
  const listRef = useRef(null);

  // Auto-join if username is stored
  useEffect(() => {
    const stored = getStoredUsername();
    if (stored) {
      socket.emit('chat:join', { username: stored });
      setJoined(true);
    }
  }, []);

  // Socket listeners — fixed to match backend events
  useEffect(() => {
    function onWelcome({ username, color }) {
      setMyUsername(username);
      setMyColor(color);
    }
    function onHistory(history) {
      setMessages(history);
    }
    function onMessage(msg) {
      setMessages((prev) => [...prev.slice(-200), msg]);
    }
    function onCount(count) {
      // Backend emits a bare number for chat:count
      setOnlineCount(typeof count === 'number' ? count : count?.count || 0);
    }
    function onReaction({ messageId, emoji, username }) {
      setReactions((prev) => {
        const msgReactions = { ...(prev[messageId] || {}) };
        msgReactions[emoji] = (msgReactions[emoji] || 0) + 1;
        return { ...prev, [messageId]: msgReactions };
      });
    }
    function onError({ error }) {
      console.warn('[chat] error:', error);
    }

    socket.on('chat:welcome', onWelcome);
    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    socket.on('chat:count', onCount);
    socket.on('chat:reaction', onReaction);
    socket.on('chat:error', onError);

    return () => {
      socket.off('chat:welcome', onWelcome);
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
      socket.off('chat:count', onCount);
      socket.off('chat:reaction', onReaction);
      socket.off('chat:error', onError);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  function handleJoin(e) {
    e.preventDefault();
    const username = nameInput.trim() || 'Guest';
    setStoredUsername(username);
    socket.emit('chat:join', { username });
    setJoined(true);
  }

  function handleSend(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    socket.emit('chat:message', { text: draft.trim() });
    setDraft('');
  }

  function sendReaction(messageId, emoji) {
    socket.emit('chat:reaction', { messageId, emoji });
    setOpenReactionFor(null);
  }

  const onlineLabel = onlineCount > 0 ? `${onlineCount} online` : 'Live';

  // ----- Join screen --------------------------------------------------------
  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
          <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="mb-4 text-center">
          <h3 className="font-display text-base font-bold text-white">Join Live Chat</h3>
          <p className="mt-1 text-xs text-slate-400">
            Chat with everyone watching the stream.
          </p>
        </div>
        <form onSubmit={handleJoin} className="w-full max-w-xs space-y-3">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={24}
            className="input-field text-center"
          />
          <button type="submit" className="btn-primary w-full">
            Enter Chat
          </button>
        </form>
      </div>
    );
  }

  // ----- Chat screen --------------------------------------------------------
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-600/50 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-white">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Live Chat
        </h3>
        <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent ring-1 ring-accent/20">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseLive" />
          {onlineLabel}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-slate-500 italic">
              No messages yet — be the first to say something!
            </p>
          </div>
        )}
        {messages.map((m) => {
          if (m.system) {
            return (
              <div
                key={m.id}
                className="animate-fadeIn text-center text-[11px] italic text-slate-500"
              >
                {m.text}
              </div>
            );
          }
          const msgReactions = reactions[m.id] || {};
          return (
            <div key={m.id} className="group relative animate-fadeIn">
              <div className="flex items-baseline gap-2">
                <span
                  className="text-sm font-semibold"
                  style={{ color: m.color }}
                >
                  {m.username}
                </span>
                <span className="text-[10px] text-slate-600">
                  {formatTime(m.ts)}
                </span>
              </div>
              <div
                className="mt-0.5 break-words text-sm leading-relaxed text-slate-200"
                dangerouslySetInnerHTML={{ __html: formatChatText(m.text) }}
              />
              {/* Reaction counts */}
              {Object.keys(msgReactions).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Object.entries(msgReactions).map(([emoji, n]) => (
                    <span
                      key={emoji}
                      className="rounded-full bg-ink-600/50 px-2 py-0.5 text-[11px] ring-1 ring-ink-500/30"
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
                className="absolute right-0 top-0 hidden rounded-lg bg-ink-600 px-1.5 py-0.5 text-xs text-slate-300 opacity-0 transition-opacity group-hover:block group-hover:opacity-100 hover:bg-ink-500"
                title="React"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {openReactionFor === m.id && (
                <div className="absolute right-0 top-6 z-10 flex gap-0.5 rounded-xl border border-ink-500/50 bg-ink-700 p-1.5 shadow-lg backdrop-blur">
                  {REACTION_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => sendReaction(m.id, e)}
                      className="rounded-lg px-1.5 py-0.5 text-base transition-transform hover:scale-125 hover:bg-ink-500"
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
      <div className="flex flex-wrap gap-1 border-t border-ink-600/50 px-3 pt-2">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => setDraft((d) => d + e)}
            className="rounded-lg px-1.5 py-0.5 text-base transition-all hover:scale-110 hover:bg-ink-600"
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
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 rounded-xl border border-ink-500/50 bg-ink-800 px-3 py-2.5 text-sm text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-accent focus:ring-1 focus:ring-accent/30"
        />
        <button
          type="submit"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-black transition-all duration-200 hover:bg-accent-dark hover:shadow-glow-sm active:scale-[0.95]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
