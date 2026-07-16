// ---------------------------------------------------------------------------
// Chat — Enhanced live public chat with emoji picker, typing indicator,
// message reactions (one per person), replies, real GIF search (via the
// backend /api/gifs proxy), and slide-in animations.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '../lib/socket.js';
import { apiGet } from '../lib/config.js';
import { formatTime, formatChatText, getStoredUsername, setStoredUsername } from '../lib/utils.js';
import { getProfile, getGuestName, getEffectiveName, onProfileChange, saveProfile } from '../lib/profile.js';
import UserAvatar from './UserAvatar.jsx';
import AiBotBadge from './AiBotBadge.jsx';

const QUICK_EMOJIS = ['👏', '🔥', '⚽', '🏀', '🎉', '😂', '❤️', '💪'];
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😮'];

// Simple emoji categories for the picker
const EMOJI_CATEGORIES = {
  'Sports': ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🥊', '🥋', '🏆', '🥇', '🥈', '🥉', '🎯', '🎽', '🎿'],
  'Reactions': ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '👏', '🙌', '🤝', '💪', '🎉', '🥳', '😍', '🤩'],
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘'],
  'Symbols': ['✅', '❌', '⭐', '🌟', '💫', '✨', '🎊', '🎈', '🎁', '🏅', '🎖️', '🏵️', '🎗️', '🎀', '🎪', '🎭'],
};

export default function Chat() {
  const [joined, setJoined] = useState(false);
  const [nameInput, setNameInput] = useState(() => getProfile().displayName || getStoredUsername());
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [myUsername, setMyUsername] = useState('');
  const [myColor, setMyColor] = useState('#22c55e');
  const [openReactionFor, setOpenReactionFor] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState('Sports');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState('');
  const [replyTo, setReplyTo] = useState(null); // { id, username, color, text, isAI }
  const [typingUsers, setTypingUsers] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  // BGC AI phases for @bgc replies: searching → thinking (no tool names in UI)
  const [aiPhase, setAiPhase] = useState(null);
  const listRef = useRef(null);
  const typingTimerRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const gifPickerRef = useRef(null);
  const gifSearchTimerRef = useRef(null);
  const inputRef = useRef(null);
  const messageRefs = useRef({});

  // Auto-join if a profile name or stored username exists
  useEffect(() => {
    const stored = getProfile().displayName || getStoredUsername();
    if (stored) {
      socket.emit('chat:join', { username: stored, avatar: getProfile().avatar });
      setJoined(true);
    }
  }, []);

  // Live-update chat identity when the user edits their profile.
  useEffect(() => {
    return onProfileChange((profile) => {
      const name = profile.displayName || getEffectiveName();
      setNameInput(profile.displayName || '');
      if (joined) {
        socket.emit('chat:update-profile', { username: name, avatar: profile.avatar });
      }
    });
  }, [joined]);

  // Socket listeners
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
      setOnlineCount(typeof count === 'number' ? count : count?.count || 0);
    }
    // Server sends the authoritative reactions map: { emoji: [usernames] }
    function onReactionUpdate({ messageId, reactions }) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    }
    function onTyping({ username, isTyping: typing, phase }) {
      // Dedicated status for BGC AI (searching first, then typing)
      if (username === 'BGC AI') {
        if (!typing || phase === 'idle') {
          setAiPhase(null);
          setTypingUsers((prev) => prev.filter((u) => u !== username));
          return;
        }
        if (phase === 'searching' || phase === 'translating' || phase === 'thinking') {
          setAiPhase(phase);
        } else {
          setAiPhase('thinking');
        }
        // Don't also list BGC AI in the generic "X is typing" line
        setTypingUsers((prev) => prev.filter((u) => u !== username));
        return;
      }

      if (typing === false) {
        setTypingUsers((prev) => prev.filter((u) => u !== username));
        return;
      }
      setTypingUsers((prev) => {
        if (prev.includes(username)) return prev;
        return [...prev, username];
      });
      setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== username));
      }, 3000);
    }
    function onError({ error }) {
      console.warn('[chat] error:', error);
    }

    socket.on('chat:welcome', onWelcome);
    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    socket.on('chat:count', onCount);
    socket.on('chat:reaction-update', onReactionUpdate);
    socket.on('chat:typing', onTyping);
    socket.on('chat:error', onError);

    return () => {
      socket.off('chat:welcome', onWelcome);
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
      socket.off('chat:count', onCount);
      socket.off('chat:reaction-update', onReactionUpdate);
      socket.off('chat:typing', onTyping);
      socket.off('chat:error', onError);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Close pickers on outside click
  useEffect(() => {
    const handler = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
      if (gifPickerRef.current && !gifPickerRef.current.contains(e.target)) {
        setShowGifPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ----- GIF search (through the backend proxy) -----------------------------
  const fetchGifs = useCallback(async (query) => {
    setGifLoading(true);
    setGifError('');
    try {
      const q = query ? `?q=${encodeURIComponent(query)}&limit=16` : '?limit=16';
      const data = await apiGet(`/api/gifs${q}`);
      setGifs(data.gifs || []);
      if (!data.gifs?.length) setGifError('No GIFs found. Try another search.');
    } catch {
      setGifError('Could not load GIFs. Try again.');
      setGifs([]);
    } finally {
      setGifLoading(false);
    }
  }, []);

  // Load trending GIFs when the picker opens; debounce searches.
  useEffect(() => {
    if (!showGifPicker) return;
    clearTimeout(gifSearchTimerRef.current);
    gifSearchTimerRef.current = setTimeout(() => {
      fetchGifs(gifQuery.trim());
    }, gifQuery ? 400 : 0);
    return () => clearTimeout(gifSearchTimerRef.current);
  }, [showGifPicker, gifQuery, fetchGifs]);

  function handleJoin(e) {
    e.preventDefault();
    const typed = nameInput.trim();
    // Falls back to the persisted auto-generated guest name (e.g. SwiftFalcon42).
    const username = typed || getEffectiveName();
    if (typed) {
      setStoredUsername(typed);
      saveProfile({ displayName: typed });
    }
    socket.emit('chat:join', { username, avatar: getProfile().avatar });
    setJoined(true);
  }

  function handleSend(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    socket.emit('chat:message', {
      text: draft.trim(),
      replyTo: replyTo?.id || undefined,
    });
    setDraft('');
    setReplyTo(null);
    setIsTyping(false);
  }

  function sendReaction(messageId, emoji) {
    socket.emit('chat:reaction', { messageId, emoji });
    setOpenReactionFor(null);
  }

  function startReply(m) {
    setReplyTo({
      id: m.id,
      username: m.username,
      color: m.color,
      isAI: !!m.isAI,
      text: m.gif ? '[GIF]' : (m.text || '').slice(0, 120),
    });
    inputRef.current?.focus();
  }

  function scrollToMessage(id) {
    const el = messageRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-1', 'ring-[var(--accent)]');
      setTimeout(() => el.classList.remove('ring-1', 'ring-[var(--accent)]'), 1200);
    }
  }

  function handleDraftChange(e) {
    setDraft(e.target.value);
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('chat:typing', { isTyping: true });
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setIsTyping(false), 2000);
  }

  function insertEmoji(emoji) {
    setDraft(d => d + emoji);
    setShowEmojiPicker(false);
  }

  function sendGif(gif) {
    socket.emit('chat:message', {
      gif: gif.url,
      text: '',
      replyTo: replyTo?.id || undefined,
    });
    setReplyTo(null);
    setShowGifPicker(false);
  }

  const onlineLabel = onlineCount > 0 ? `${onlineCount} online` : 'Live';

  // ----- Join screen --------------------------------------------------------
  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]/25">
          <svg className="h-7 w-7 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="mb-4 text-center">
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">Join Live Chat</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Chat with everyone watching the stream.</p>
        </div>
        <form onSubmit={handleJoin} className="w-full max-w-xs space-y-3">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={`Your name (or join as ${getGuestName()})`}
            maxLength={24}
            className="input-field w-full text-center text-base"
            style={{ fontSize: 16 }}
          />
          <button type="submit" className="btn-primary w-full">Enter Chat</button>
          <p className="text-center text-[10px] text-slate-500">
            Leave the name empty to chat as <span className="font-semibold text-accent">{getGuestName()}</span>.
            Set a picture &amp; more in Profile Settings (avatar in the header).
          </p>
        </form>
      </div>
    );
  }

  // ----- Chat screen --------------------------------------------------------
  return (
    <div className="chat-panel-root relative" data-chat-root>
      {/* Header — subtle accent gradient strip (hidden while keyboard open) */}
      <div className="chat-panel-header flex shrink-0 items-center justify-between border-b border-[var(--border-primary)] bg-gradient-to-r from-[var(--accent-muted)] to-transparent px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-primary)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
            <svg className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </span>
          Live Chat
        </h3>
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/20">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulseLive" />
          {onlineLabel}
        </span>
      </div>

      {/* Messages */}
      <div ref={listRef} className="chat-panel-messages scrollbar-thin space-y-2.5 px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-muted)]">
              <svg className="h-5 w-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6m-6 8l-4-4V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H11l-4 4z" />
              </svg>
            </div>
            <p className="text-xs text-[var(--text-muted)]">No messages yet — be the first to cheer!</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            if (m.system) {
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center"
                >
                  <span className="inline-block rounded-full bg-[var(--bg-tertiary)] px-2.5 py-0.5 text-[10px] italic text-[var(--text-muted)]">{m.text}</span>
                </motion.div>
              );
            }
            const msgReactions = m.reactions || {};
            // GIF messages: new format uses m.gif; keep backward compat with "[GIF] url" text
            const legacyGif = m.text && m.text.startsWith('[GIF] ') ? m.text.replace('[GIF] ', '') : null;
            const gifUrl = m.gif || legacyGif;

            return (
              <motion.div
                key={m.id}
                ref={(el) => { messageRefs.current[m.id] = el; }}
                initial={{ opacity: 0, y: 12, x: -8 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
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
                    style={{ borderLeftColor: m.replyTo.color || 'var(--accent)' }}
                    title="Jump to original message"
                  >
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold" style={{ color: m.replyTo.color || 'var(--accent)' }}>
                        {m.replyTo.username}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--text-muted)]">
                        {m.replyTo.text}
                      </span>
                    </div>
                  </button>
                )}

                {gifUrl ? (
                  <img
                    src={gifUrl}
                    alt="GIF"
                    loading="lazy"
                    className="mt-1 ml-8 max-w-[200px] rounded-xl ring-1 ring-[var(--border-primary)]"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div
                    className={`mt-0.5 ml-8 break-words text-sm leading-relaxed ${
                      m.isAI
                        ? 'rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                    dangerouslySetInnerHTML={{ __html: formatChatText(m.text) }}
                  />
                )}

                {/* Reaction counts — server-authoritative { emoji: [usernames] }.
                    Clicking toggles/switches your single reaction. */}
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
                              ? 'bg-[var(--accent-muted)] ring-[var(--accent)]/50 text-[var(--accent)] font-semibold'
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
      </div>

      {/* BGC AI: searching indicator, then typing — no tool/provider names */}
      <AnimatePresence mode="wait">
        {aiPhase === 'searching' && (
          <motion.div
            key="bgc-searching"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="flex items-center gap-2 px-4 py-1.5"
          >
            <span className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/40" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-400" />
            </span>
            <span className="text-[11px] font-medium text-sky-400/90">BGC AI is searching…</span>
          </motion.div>
        )}
        {aiPhase === 'thinking' && (
          <motion.div
            key="bgc-thinking"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="flex items-center gap-1.5 px-4 py-1.5"
          >
            <span className="inline-flex gap-0.5">
              <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span className="text-[11px] font-medium text-amber-500/90">BGC AI is typing…</span>
          </motion.div>
        )}
        {aiPhase === 'translating' && (
          <motion.div
            key="bgc-translating"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="flex items-center gap-2 px-4 py-1.5"
          >
            <span className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400/40" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" />
            </span>
            <span className="text-[11px] font-medium text-violet-400/90">BGC AI is translating…</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Other users typing */}
      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="px-4 py-1 text-[11px] text-slate-500 italic"
          >
            {typingUsers.slice(0, 2).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing
            <span className="inline-flex gap-0.5 ml-1">
              <span className="inline-block h-1 w-1 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="inline-block h-1 w-1 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="inline-block h-1 w-1 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick emojis — hidden while soft keyboard is open (see body.keyboard-open) */}
      <div className="chat-composer-extras flex flex-wrap gap-1 border-t border-[var(--border-primary)] px-3 pt-2">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setDraft((d) => d + e)}
            className="rounded-lg px-1.5 py-0.5 text-base transition-all hover:scale-110 hover:bg-[var(--bg-tertiary)] active:scale-95"
          >
            {e}
          </button>
        ))}
      </div>

      {/* Emoji Picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            ref={emojiPickerRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="chat-composer-extras absolute bottom-16 left-2 right-2 z-20 overflow-hidden rounded-xl border border-ink-500/50 bg-ink-800 shadow-xl"
          >
            {/* Category tabs */}
            <div className="flex border-b border-ink-600/50 overflow-x-auto scrollbar-thin">
              {Object.keys(EMOJI_CATEGORIES).map(cat => (
                <button
                  key={cat}
                  onClick={() => setEmojiCategory(cat)}
                  className={`shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    emojiCategory === cat ? 'text-accent border-b-2 border-accent' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* Emojis grid */}
            <div className="grid grid-cols-8 gap-0.5 p-2 max-h-40 overflow-y-auto scrollbar-thin">
              {EMOJI_CATEGORIES[emojiCategory].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => insertEmoji(emoji)}
                  className="flex items-center justify-center rounded-lg p-1.5 text-lg hover:bg-ink-600 transition-colors active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GIF Picker — searches real GIFs through the backend proxy */}
      <AnimatePresence>
        {showGifPicker && (
          <motion.div
            ref={gifPickerRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 left-2 right-2 z-20 rounded-xl border border-ink-500/50 bg-ink-800 shadow-xl p-3"
          >
            <input
              value={gifQuery}
              onChange={(e) => setGifQuery(e.target.value)}
              placeholder="Search GIFs… (goal, celebration, wow)"
              className="mb-2 w-full rounded-lg border border-ink-600/60 bg-ink-700 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-accent"
              autoFocus
            />
            {gifLoading && (
              <div className="grid max-h-52 grid-cols-2 gap-2" role="status" aria-label="Loading GIFs">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton aspect-video w-full rounded-lg" />
                ))}
              </div>
            )}
            {!gifLoading && gifError && (
              <p className="py-8 text-center text-[11px] text-slate-500">{gifError}</p>
            )}
            {!gifLoading && !gifError && (
              <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto scrollbar-thin">
                {gifs.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => sendGif(gif)}
                    className="relative overflow-hidden rounded-lg bg-ink-700 aspect-video hover:ring-2 hover:ring-accent transition-all"
                    title={gif.title}
                  >
                    <img
                      src={gif.preview}
                      alt={gif.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
            <p className="text-[9px] text-slate-600 mt-2 text-center">Powered by GIPHY</p>
          </motion.div>
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
            <svg className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold" style={{ color: replyTo.color || 'var(--accent)' }}>
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

      {/* Composer — sticky bottom; 16px font prevents iOS focus-zoom */}
      <form
        onSubmit={handleSend}
        className="chat-panel-composer flex items-center gap-1.5 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]/95 p-2.5 backdrop-blur-sm"
      >
        <button
          type="button"
          onClick={() => { setShowEmojiPicker((v) => !v); setShowGifPicker(false); }}
          className={`chat-composer-extras flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95 ${
            showEmojiPicker ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]' : 'border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="Emoji picker"
        >
          😊
        </button>
        <button
          type="button"
          onClick={() => { setShowGifPicker((v) => !v); setShowEmojiPicker(false); }}
          className={`chat-composer-extras flex h-10 shrink-0 items-center justify-center rounded-full border px-2.5 text-[10px] font-extrabold transition-all active:scale-95 ${
            showGifPicker ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]' : 'border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="GIF picker"
        >
          GIF
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={handleDraftChange}
          onFocus={() => {
            setShowEmojiPicker(false);
            setShowGifPicker(false);
            // Do NOT scrollIntoView / window.scrollTo — Chrome Android pans the
            // visual viewport and yanks the fixed composer under the keyboard.
          }}
          placeholder="Say something… (@bgc for AI)"
          maxLength={500}
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          inputMode="text"
          style={{ fontSize: 16, scrollMargin: 0 }}
          className="min-w-0 flex-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2.5 text-base text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-all duration-200 hover:bg-[var(--accent-dark)] active:scale-[0.95] disabled:opacity-40"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
