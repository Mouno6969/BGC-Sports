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
const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.82;

const SUGGESTED_QUESTIONS = [
  'Who will win the World Cup 2026?',
  "What's the current live score?",
  'Analyze Argentina vs France',
  'Best players this tournament?',
];

/** Compress a File into a reasonably small data URL for vision APIs. */
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Please choose an image file'));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error('Image is too large (max 12MB before compress)'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function AiChat() {
  const [joined, setJoined] = useState(false);
  const [nameInput, setNameInput] = useState(() => getProfile().displayName || getStoredUsername());
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState(null); // data URL
  const [onlineCount, setOnlineCount] = useState(0);
  const [myUsername, setMyUsername] = useState('');
  // null | 'searching' | 'thinking' | 'translating' — driven by ai:typing { phase }
  const [aiPhase, setAiPhase] = useState(null);
  const [openReactionFor, setOpenReactionFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [errorNote, setErrorNote] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
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
    function onTyping({ isTyping, phase }) {
      if (!isTyping || phase === 'idle') {
        setAiPhase(null);
        return;
      }
      // planning/verifying are internal pipeline steps — show user-friendly labels
      if (phase === 'planning') {
        setAiPhase('planning');
        return;
      }
      if (phase === 'verifying') {
        setAiPhase('verifying');
        return;
      }
      if (
        phase === 'searching'
        || phase === 'scores'
        || phase === 'translating'
        || phase === 'thinking'
      ) {
        setAiPhase(phase);
        return;
      }
      setAiPhase('thinking');
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
  }, [messages, aiPhase]);

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

  function sendMessage(text, imageDataUrl = null) {
    const clean = (text || '').trim();
    const image = imageDataUrl || pendingImage;
    if (!clean && !image) return;
    socket.emit('ai:message', {
      text: clean || (image ? 'What is in this image?' : ''),
      replyTo: replyTo?.id || undefined,
      image: image ? { dataUrl: image } : undefined,
    });
    setDraft('');
    setPendingImage(null);
    setReplyTo(null);
  }

  function handleSend(e) {
    e.preventDefault();
    sendMessage(draft, pendingImage);
  }

  async function handleImagePick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      setPendingImage(dataUrl);
      inputRef.current?.focus();
    } catch (err) {
      setErrorNote(err.message || 'Could not attach image');
      setTimeout(() => setErrorNote(''), 4000);
    }
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
            Ask about the World Cup — or attach a photo (scoreboard, lineup, graphic) and BGC AI will read it.
          </p>
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
          <button type="submit" className="btn-primary w-full">Enter AI Chatroom</button>
        </form>
      </div>
    );
  }

  // ----- Chatroom screen ----------------------------------------------------
  return (
    <div className="chat-panel-root relative" data-chat-root>
      {/* Header (hidden while soft keyboard open) */}
      <div className="chat-panel-header flex shrink-0 items-center justify-between border-b border-[var(--border-primary)] bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-2.5">
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
      <div ref={listRef} className="chat-panel-messages scrollbar-thin space-y-2.5 px-4 py-3">
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

                {m.image?.dataUrl && (
                  <div className="mt-1.5 ml-8 max-w-[min(100%,280px)] overflow-hidden rounded-xl border border-[var(--border-primary)] bg-black/30">
                    <img
                      src={m.image.dataUrl}
                      alt="Shared"
                      className="max-h-48 w-full object-contain"
                      loading="lazy"
                    />
                  </div>
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

        {/* AI status: searching first, then typing — never names tools/providers */}
        <AnimatePresence mode="wait">
          {aiPhase === 'planning' && (
            <motion.div
              key="ai-planning"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <img src={AI_LOGO} alt="BGC AI" className="h-6 w-6 rounded-full ring-1 ring-violet-500/40" />
              <div className="flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                <span className="text-[10px] font-medium text-violet-300/90">Understanding your question…</span>
              </div>
            </motion.div>
          )}
          {aiPhase === 'scores' && (
            <motion.div
              key="ai-scores"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2"
            >
              <img src={AI_LOGO} alt="BGC AI" className="h-6 w-6 rounded-full ring-1 ring-sky-500/40" />
              <div className="flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-2">
                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
                </span>
                <span className="text-[10px] font-medium text-sky-300/90">Checking live scores…</span>
              </div>
            </motion.div>
          )}
          {aiPhase === 'searching' && (
            <motion.div
              key="ai-searching"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2"
            >
              <img src={AI_LOGO} alt="BGC AI" className="h-6 w-6 rounded-full ring-1 ring-sky-500/40" />
              <div className="flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-2">
                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400/40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
                </span>
                <span className="text-[10px] font-medium text-sky-300/90">Looking up the latest…</span>
              </div>
            </motion.div>
          )}
          {(aiPhase === 'thinking' || aiPhase === 'verifying') && (
            <motion.div
              key="ai-thinking"
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
                <span className="ml-1 text-[10px] text-amber-500/80">
                  {aiPhase === 'verifying' ? 'Double-checking facts…' : 'BGC AI is typing…'}
                </span>
              </div>
            </motion.div>
          )}
          {aiPhase === 'translating' && (
            <motion.div
              key="ai-translating"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <img src={AI_LOGO} alt="BGC AI" className="h-6 w-6 rounded-full ring-1 ring-violet-500/40" />
              <div className="flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400/40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
                </span>
                <span className="text-[10px] font-medium text-violet-300/90">Translating…</span>
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

      {/* Image preview before send */}
      <AnimatePresence>
        {pendingImage && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex shrink-0 items-center gap-2 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]/50 px-3 py-2"
          >
            <img
              src={pendingImage}
              alt="Attach"
              className="h-14 w-14 rounded-lg border border-[var(--border-primary)] object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-[var(--text-primary)]">Photo attached</p>
              <p className="text-[10px] text-[var(--text-muted)]">BGC AI will answer from this image</p>
            </div>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="rounded-full px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10"
            >
              Remove
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer — sticky bottom; 16px font prevents iOS focus-zoom */}
      <form
        onSubmit={handleSend}
        className="chat-panel-composer flex items-center gap-1.5 border-t border-[var(--border-primary)] bg-[var(--bg-tertiary)]/95 p-2.5 backdrop-blur-sm"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImagePick}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:border-amber-500/40 hover:text-amber-500"
          title="Attach photo"
          aria-label="Attach photo"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => {
            // Avoid window.scrollTo — Chrome pans visualViewport and hides composer
          }}
          placeholder={pendingImage ? 'Ask about this photo…' : 'Ask BGC AI — or attach a photo…'}
          maxLength={500}
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          inputMode="text"
          style={{ fontSize: 16, scrollMargin: 0 }}
          className="min-w-0 flex-1 rounded-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2.5 text-base text-[var(--text-primary)] outline-none transition-all duration-200 placeholder:text-[var(--text-muted)] focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30"
        />
        <button
          type="submit"
          disabled={!draft.trim() && !pendingImage}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white transition-all duration-200 hover:bg-amber-600 active:scale-[0.95] disabled:opacity-40"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
