// ---------------------------------------------------------------------------
// AiChat — Dedicated shared AI chatroom. Everyone connected to the room sees
// the whole conversation: every user's questions AND every AI answer are
// broadcast to all participants. No @bgc prefix needed — every message goes
// straight to the BGC AI agent. Supports replies and one-reaction-per-person.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '../lib/socket.js';
import { formatTime, formatChatText, getStoredUsername, setStoredUsername } from '../lib/utils.js';
import { getProfile, getGuestName, getEffectiveName, onProfileChange, saveProfile } from '../lib/profile.js';
import UserAvatar from './UserAvatar.jsx';
import AiBotBadge from './AiBotBadge.jsx';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😮'];
const AI_LOGO = '/bgc-ai-logo.png';

const SUGGESTED_QUESTIONS = [
  'Who will win the World Cup 2026?',
  "What's the current live score?",
  'Analyze Argentina vs France',
  'Best players this tournament?',
];

export default function AiChat() {
  const [joined, setJoined] = useState(false);
  const [nameInput, setNameInput] = useState(() => getProfile().displayName || getStoredUsername());
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [myUsername, setMyUsername] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [openReactionFor, setOpenReactionFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [errorNote, setErrorNote] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const messageRefs = useRef({});

  // Auto-join if a profile name or stored username exists
  useEffect(() => {
    const stored = getProfile().displayName || getStoredUsername();
    if (stored) {
      socket.emit('ai:join', { username: stored, avatar: getProfile().avatar });
      setJoined(true);
    }
  }, []);

  // Keep identity in sync with profile edits
  useEffect(() => {
    return onProfileChange((profile) => {
      const name = profile.displayName || getEffectiveName();
      setNameInput(profile.displayName || '');
      if (joined) {
        socket.emit('ai:update-profile', { username: name, avatar: profile.avatar });
      }
    });
  }, [joined]);

  // Socket listeners
  useEffect(() => {
    function onWelcome({ username }) {
      setMyUsername(username);
    }
    function onHistory(history) {
      setMessages(history);
    }
    function onMessage(msg) {
      setMessages((prev) => [...prev.slice(-250), msg]);
    }
    function onCount(count) {
      setOnlineCount(typeof count === 'number' ? count : 0);
    }
    function onTyping({ isTyping }) {
      setAiTyping(!!isTyping);
    }
    function onReactionUpdate({ messageId, reactions }) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    }
    function onError({ error }) {
      setErrorNote(error);
      setTimeout(() => setErrorNote(''), 4000);
    }

    socket.on('ai:welcome', onWelcome);
    socket.on('ai:history', onHistory);
    socket.on('ai:message', onMessage);
    socket.on('ai:count', onCount);
    socket.on('ai:typing', onTyping);
    socket.on('ai:reaction-update', onReactionUpdate);
    socket.on('ai:error', onError);

    return () => {
      socket.off('ai:welcome', onWelcome);
      socket.off('ai:history', onHistory);
      socket.off('ai:message', onMessage);
      socket.off('ai:count', onCount);
      socket.off('ai:typing', onTyping);
      socket.off('ai:reaction-update', onReactionUpdate);
      socket.off('ai:error', onError);
    };
  }, []);

  // Re-join after socket reconnects so history and room membership recover.
  useEffect(() => {
    function onReconnect() {
      if (joined) {
        const stored = getProfile().displayName || getStoredUsername() || getEffectiveName();
        socket.emit('ai:join', { username: stored, avatar: getProfile().avatar });
      }
    }
    socket.on('connect', onReconnect);
    return () => socket.off('connect', onReconnect);
  }, [joined]);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, aiTyping]);

  function handleJoin(e) {
    e.preventDefault();
    const typed = nameInput.trim();
    const username = typed || getEffectiveName();
    if (typed) {
      setStoredUsername(typed);
      saveProfile({ displayName: typed });
    }
    socket.emit('ai:join', { username, avatar: getProfile().avatar });
    setJoined(true);
  }

  function sendMessage(text) {
    const clean = (text || '').trim();
    if (!clean) return;
    socket.emit('ai:message', { text: clean, replyTo: replyTo?.id || undefined });
    setDraft('');
    setReplyTo(null);
  }

  function handleSend(e) {
    e.preventDefault();
    sendMessage(draft);
  }

  function sendReaction(messageId, emoji) {
    socket.emit('ai:reaction', { messageId, emoji });
    setOpenReactionFor(null);
  }

  function startReply(m) {
    setReplyTo({
      id: m.id,
      username: m.username,
      color: m.color,
      text: (m.text || '').slice(0, 120),
    });
    inputRef.current?.focus();
  }

  function scrollToMessage(id) {
    const el = messageRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-1', 'ring-amber-500');
      setTimeout(() => el.classList.remove('ring-1', 'ring-amber-500'), 1200);
    }
  }

  // ----- Join screen --------------------------------------------------------
  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <img
          src={AI_LOGO}
          alt="BGC AI"
          className="mb-4 h-16 w-16 rounded-2xl ring-2 ring-amber-500/40"
        />
        <div className="mb-4 text-center">
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">BGC AI Chatroom</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Ask the AI anything about the World Cup — everyone in the room sees the whole conversation.
          </p>
        </div>
        <form onSubmit={handleJoin} className="w-full max-w-xs space-y-3">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={`Your name (or join as ${getGuestName()})`}
            maxLength={24}
            className="input-field text-center"
          />
          <button type="submit" className="btn-primary w-full">Enter AI Chatroom</button>
        </form>
      </div>
    );
  }

  // ----- Chatroom screen ----------------------------------------------------
  return (
    <div className="flex h-full flex-col relative">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-primary)] bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-primary)]">
          <img src={AI_LOGO} alt="BGC AI" className="h-6 w-6 rounded-lg ring-1 ring-amber-500/40" />
          BGC AI Chatroom
        </h3>
        <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-500 ring-1 ring-amber-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulseLive" />
          {onlineCount > 0 ? `${onlineCount} online` : 'Live'}
        </span>
      </div>

      {/* Messages */}
      <div ref={listRef} className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <img src={AI_LOGO} alt="BGC AI" className="h-12 w-12 rounded-full ring-2 ring-amber-500/30" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Ask BGC AI anything</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Live scores, predictions, player &amp; team analysis. Everyone sees the conversation.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 px-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-500 transition-colors hover:bg-amber-500/15"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const msgReactions = m.reactions || {};
            return (
              <motion.div
                key={m.id}
                ref={(el) => { messageRefs.current[m.id] = el; }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="group relative -mx-2 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--bg-tertiary)]/60"
              >
                <div className="flex items-center gap-2">
                  <UserAvatar name={m.username} avatar={m.avatar} color={m.color} size="sm" />
                  <span className="text-[13px] font-bold" style={{ color: m.color }}>
                    {m.username}
                  </span>
                  {m.isAI && <AiBotBadge />}
                  <span className="text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">{formatTime(m.ts)}</span>
                </div>

                {/* Quoted reply snippet */}
                {m.replyTo && (
                  <button
                    onClick={() => scrollToMessage(m.replyTo.id)}
                    className="mt-1 ml-8 flex w-fit max-w-[85%] items-start gap-1.5 rounded-lg border-l-2 bg-[var(--bg-tertiary)]/70 px-2 py-1 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ borderLeftColor: m.replyTo.color || '#f59e0b' }}
                    title="Jump to original message"
                  >
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold" style={{ color: m.replyTo.color || '#f59e0b' }}>
                        {m.replyTo.username}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--text-muted)]">
                        {m.replyTo.text}
                      </span>
                    </div>
                  </button>
                )}

                <div
                  className={`mt-0.5 ml-8 break-words text-sm leading-relaxed ${
                    m.isAI
                      ? 'rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                  dangerouslySetInnerHTML={{ __html: formatChatText(m.text || '') }}
                />

                {/* Reactions — one per person, toggle/switch */}
                {Object.keys(msgReactions).length > 0 && (
                  <div className="mt-1.5 ml-8 flex flex-wrap gap-1">
                    {Object.entries(msgReactions).map(([emoji, users]) => {
                      const mine = Array.isArray(users) && users.includes(myUsername);
                      return (
                        <button
                          key={emoji}
                          onClick={() => sendReaction(m.id, emoji)}
                          title={Array.isArray(users) ? users.join(', ') : ''}
                          className={`rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors ${
                            mine
                              ? 'bg-amber-500/15 ring-amber-500/50 text-amber-500 font-semibold'
                              : 'bg-ink-600/50 ring-ink-500/30 hover:bg-ink-500/50'
                          }`}
                        >
                          {emoji} {Array.isArray(users) ? users.length : users}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Hover actions: reply + react */}
                <div className="absolute right-0 top-0 hidden gap-1 group-hover:flex">
                  <button
                    onClick={() => startReply(m)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-600 text-slate-300 ring-1 ring-ink-500/40 transition-colors hover:bg-ink-500 hover:text-white"
                    title="Reply"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setOpenReactionFor(openReactionFor === m.id ? null : m.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-600 text-slate-300 ring-1 ring-ink-500/40 transition-colors hover:bg-ink-500 hover:text-white"
                    title="React"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>

                {/* Reaction picker */}
                <AnimatePresence>
                  {openReactionFor === m.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-6 z-10 flex gap-0.5 rounded-xl border border-ink-500/50 bg-ink-700 p-1.5 shadow-lg backdrop-blur"
                    >
                      {REACTION_EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => sendReaction(m.id, e)}
                          className="rounded-lg px-1.5 py-0.5 text-base transition-transform hover:scale-125 hover:bg-ink-500"
                        >
                          {e}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* AI typing indicator */}
        <AnimatePresence>
          {aiTyping && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <img src={AI_LOGO} alt="BGC AI" className="h-6 w-6 rounded-full ring-1 ring-amber-500/40" />
              <div className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="ml-1 text-[10px] text-amber-500/80">BGC AI is analyzing…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rate-limit / error note */}
      <AnimatePresence>
        {errorNote && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 py-1 text-center text-[10px] text-amber-500"
          >
            {errorNote}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Reply banner */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex items-center gap-2 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]/60 px-3 py-1.5"
          >
            <svg className="h-3.5 w-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold" style={{ color: replyTo.color || '#f59e0b' }}>
                Replying to {replyTo.username}
              </span>
              <span className="block truncate text-[10px] text-[var(--text-muted)]">{replyTo.text}</span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              title="Cancel reply"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <form onSubmit={handleSend} className="flex items-center gap-1.5 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]/40 p-2.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask BGC AI anything about the World Cup…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[var(--text-muted)] focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white transition-all duration-200 hover:bg-amber-600 active:scale-[0.95] disabled:opacity-40"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
