// ---------------------------------------------------------------------------
// Chat — Enhanced live public chat with emoji picker, typing indicator,
// message reactions, GIF support, and slide-in animations.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '../lib/socket.js';
import { formatTime, formatChatText, getStoredUsername, setStoredUsername } from '../lib/utils.js';

const QUICK_EMOJIS = ['👏', '🔥', '⚽', '🏀', '🎉', '😂', '❤️', '💪'];
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👏', '😮'];

// Tenor GIF search (free API key for demo)
const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPzkcsvZnUpdated';
const SPORTS_GIFS = [
  { id: 'g1', url: 'https://media.tenor.com/Iqfq1Ld3XZAAAAAC/goal-soccer.gif', preview: 'https://media.tenor.com/Iqfq1Ld3XZAAAAAM/goal-soccer.gif', title: 'Goal!' },
  { id: 'g2', url: 'https://media.tenor.com/9Vc5dGT8HOEAAAAC/football-touchdown.gif', preview: 'https://media.tenor.com/9Vc5dGT8HOEAAAAM/football-touchdown.gif', title: 'Touchdown' },
  { id: 'g3', url: 'https://media.tenor.com/5qhZBqhGnxIAAAAC/celebration-dance.gif', preview: 'https://media.tenor.com/5qhZBqhGnxIAAAAM/celebration-dance.gif', title: 'Celebrate' },
  { id: 'g4', url: 'https://media.tenor.com/y2JXkY1pXkwAAAAC/clapping-applause.gif', preview: 'https://media.tenor.com/y2JXkY1pXkwAAAAM/clapping-applause.gif', title: 'Clap' },
];

// Simple emoji categories for the picker
const EMOJI_CATEGORIES = {
  'Sports': ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🥊', '🥋', '🏆', '🥇', '🥈', '🥉', '🎯', '🎽', '🎿'],
  'Reactions': ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '👏', '🙌', '🤝', '💪', '🎉', '🥳', '😍', '🤩'],
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘'],
  'Symbols': ['✅', '❌', '⭐', '🌟', '💫', '✨', '🎊', '🎈', '🎁', '🏅', '🎖️', '🏵️', '🎗️', '🎀', '🎪', '🎭'],
};

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState('Sports');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef(null);
  const typingTimerRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const gifPickerRef = useRef(null);

  // Auto-join if username is stored
  useEffect(() => {
    const stored = getStoredUsername();
    if (stored) {
      socket.emit('chat:join', { username: stored });
      setJoined(true);
    }
  }, []);

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
    function onReaction({ messageId, emoji, username }) {
      setReactions((prev) => {
        const msgReactions = { ...(prev[messageId] || {}) };
        msgReactions[emoji] = (msgReactions[emoji] || 0) + 1;
        return { ...prev, [messageId]: msgReactions };
      });
    }
    function onTyping({ username }) {
      setTypingUsers(prev => {
        if (prev.includes(username)) return prev;
        return [...prev, username];
      });
      setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u !== username));
      }, 3000);
    }
    function onError({ error }) {
      console.warn('[chat] error:', error);
    }

    socket.on('chat:welcome', onWelcome);
    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    socket.on('chat:count', onCount);
    socket.on('chat:reaction', onReaction);
    socket.on('chat:typing', onTyping);
    socket.on('chat:error', onError);

    return () => {
      socket.off('chat:welcome', onWelcome);
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
      socket.off('chat:count', onCount);
      socket.off('chat:reaction', onReaction);
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
    setIsTyping(false);
  }

  function sendReaction(messageId, emoji) {
    socket.emit('chat:reaction', { messageId, emoji });
    setOpenReactionFor(null);
  }

  function handleDraftChange(e) {
    setDraft(e.target.value);
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('chat:typing', { username: myUsername });
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setIsTyping(false), 2000);
  }

  function insertEmoji(emoji) {
    setDraft(d => d + emoji);
    setShowEmojiPicker(false);
  }

  function sendGif(gif) {
    socket.emit('chat:message', { text: `[GIF] ${gif.url}` });
    setShowGifPicker(false);
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
          <p className="mt-1 text-xs text-slate-400">Chat with everyone watching the stream.</p>
        </div>
        <form onSubmit={handleJoin} className="w-full max-w-xs space-y-3">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={24}
            className="input-field text-center"
          />
          <button type="submit" className="btn-primary w-full">Enter Chat</button>
        </form>
      </div>
    );
  }

  // ----- Chat screen --------------------------------------------------------
  return (
    <div className="flex h-full flex-col relative">
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
      <div ref={listRef} className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-slate-500 italic">No messages yet — be the first to say something!</p>
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
                  className="text-center text-[11px] italic text-slate-500"
                >
                  {m.text}
                </motion.div>
              );
            }
            const msgReactions = reactions[m.id] || {};
            // Check if message is a GIF
            const isGif = m.text && m.text.startsWith('[GIF] ');
            const gifUrl = isGif ? m.text.replace('[GIF] ', '') : null;

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12, x: -8 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                transition={{ duration: 0.25 }}
                className="group relative"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold" style={{ color: m.color }}>
                    {m.username}
                  </span>
                  <span className="text-[10px] text-slate-600">{formatTime(m.ts)}</span>
                </div>
                {isGif ? (
                  <img
                    src={gifUrl}
                    alt="GIF"
                    className="mt-1 max-w-[180px] rounded-lg"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div
                    className="mt-0.5 break-words text-sm leading-relaxed text-slate-200"
                    dangerouslySetInnerHTML={{ __html: formatChatText(m.text) }}
                  />
                )}

                {/* Reaction counts */}
                {Object.keys(msgReactions).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(msgReactions).map(([emoji, n]) => (
                      <button
                        key={emoji}
                        onClick={() => sendReaction(m.id, emoji)}
                        className="rounded-full bg-ink-600/50 px-2 py-0.5 text-[11px] ring-1 ring-ink-500/30 hover:bg-ink-500/50 transition-colors"
                      >
                        {emoji} {n}
                      </button>
                    ))}
                  </div>
                )}

                {/* Hover react button */}
                <button
                  onClick={() => setOpenReactionFor(openReactionFor === m.id ? null : m.id)}
                  className="absolute right-0 top-0 hidden rounded-lg bg-ink-600 px-1.5 py-0.5 text-xs text-slate-300 opacity-0 transition-opacity group-hover:block group-hover:opacity-100 hover:bg-ink-500"
                  title="React"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>

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

      {/* Typing indicator */}
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

      {/* Quick emojis */}
      <div className="flex flex-wrap gap-1 border-t border-ink-600/50 px-3 pt-2">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => setDraft((d) => d + e)}
            className="rounded-lg px-1.5 py-0.5 text-base transition-all hover:scale-110 hover:bg-ink-600 active:scale-95"
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
            className="absolute bottom-16 left-2 right-2 z-20 rounded-xl border border-ink-500/50 bg-ink-800 shadow-xl overflow-hidden"
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

      {/* GIF Picker */}
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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Sports GIFs</p>
            <div className="grid grid-cols-2 gap-2">
              {SPORTS_GIFS.map(gif => (
                <button
                  key={gif.id}
                  onClick={() => sendGif(gif)}
                  className="relative overflow-hidden rounded-lg bg-ink-700 aspect-video hover:ring-2 hover:ring-accent transition-all"
                >
                  <div className="flex items-center justify-center h-full text-2xl">{gif.title}</div>
                  <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/60 px-1 rounded">{gif.title}</span>
                </button>
              ))}
            </div>
            <p className="text-[9px] text-slate-600 mt-2 text-center">Powered by Tenor</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <form onSubmit={handleSend} className="flex items-center gap-1.5 p-3">
        {/* Emoji button */}
        <button
          type="button"
          onClick={() => { setShowEmojiPicker(v => !v); setShowGifPicker(false); }}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all active:scale-95 ${
            showEmojiPicker ? 'border-accent bg-accent/10 text-accent' : 'border-ink-500/50 text-slate-400 hover:border-ink-400 hover:text-white'
          }`}
          title="Emoji picker"
        >
          😊
        </button>
        {/* GIF button */}
        <button
          type="button"
          onClick={() => { setShowGifPicker(v => !v); setShowEmojiPicker(false); }}
          className={`flex h-9 shrink-0 items-center justify-center rounded-xl border px-2 text-[10px] font-extrabold transition-all active:scale-95 ${
            showGifPicker ? 'border-accent bg-accent/10 text-accent' : 'border-ink-500/50 text-slate-400 hover:border-ink-400 hover:text-white'
          }`}
          title="GIF picker"
        >
          GIF
        </button>
        <input
          value={draft}
          onChange={handleDraftChange}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 rounded-xl border border-ink-500/50 bg-ink-800 px-3 py-2.5 text-sm text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-accent focus:ring-1 focus:ring-accent/30"
        />
        <button
          type="submit"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-black transition-all duration-200 hover:bg-accent-dark hover:shadow-glow-sm active:scale-[0.95]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
