// ---------------------------------------------------------------------------
// PrivateChat — Direct messaging UI with user list and conversation view.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../lib/socket.js';
import { formatTime, formatChatText, getStoredUsername } from '../lib/utils.js';

export default function PrivateChat() {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [conversations, setConversations] = useState({}); // peerId -> messages[]
  const [draft, setDraft] = useState('');
  const [typingFrom, setTypingFrom] = useState(null);
  const [unread, setUnread] = useState({}); // peerId -> count
  const listRef = useRef(null);
  const typingTimeout = useRef(null);

  // Register for DM on mount
  useEffect(() => {
    const username = getStoredUsername() || 'Guest';
    socket.emit('dm:register', { username, color: '#22c55e' });
  }, []);

  // Socket listeners
  useEffect(() => {
    function onOnlineUsers(users) {
      // Filter out self
      setOnlineUsers(users.filter((u) => u.id !== socket.id));
    }

    function onMessage(msg) {
      const peerId = msg.from === socket.id ? msg.to : msg.from;
      setConversations((prev) => {
        const existing = prev[peerId] || [];
        return { ...prev, [peerId]: [...existing.slice(-100), msg] };
      });
      // Mark unread if not currently viewing
      setSelectedUser((current) => {
        if (!current || current.id !== peerId) {
          setUnread((prev) => ({ ...prev, [peerId]: (prev[peerId] || 0) + 1 }));
        }
        return current;
      });
    }

    function onHistory({ peerId, messages }) {
      setConversations((prev) => ({ ...prev, [peerId]: messages }));
    }

    function onTyping({ from, fromUsername }) {
      setTypingFrom({ from, fromUsername });
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTypingFrom(null), 2000);
    }

    socket.on('dm:online-users', onOnlineUsers);
    socket.on('dm:message', onMessage);
    socket.on('dm:history', onHistory);
    socket.on('dm:typing', onTyping);

    return () => {
      socket.off('dm:online-users', onOnlineUsers);
      socket.off('dm:message', onMessage);
      socket.off('dm:history', onHistory);
      socket.off('dm:typing', onTyping);
    };
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [conversations, selectedUser]);

  const selectUser = useCallback((user) => {
    setSelectedUser(user);
    setUnread((prev) => ({ ...prev, [user.id]: 0 }));
    // Request history
    socket.emit('dm:history', { peerId: user.id });
  }, []);

  function handleSend(e) {
    e.preventDefault();
    if (!draft.trim() || !selectedUser) return;
    socket.emit('dm:send', { to: selectedUser.id, text: draft.trim() });
    setDraft('');
  }

  function handleTyping() {
    if (!selectedUser) return;
    socket.emit('dm:typing', { to: selectedUser.id });
  }

  const currentMessages = selectedUser ? (conversations[selectedUser.id] || []) : [];
  const isTypingForMe = typingFrom && selectedUser && typingFrom.from === selectedUser.id;

  // ----- User list view (no user selected) ----------------------------------
  if (!selectedUser) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-600/50 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-white">
            <svg className="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Private Messages
          </h3>
          <span className="rounded-full bg-secondary/10 px-2.5 py-1 text-[10px] font-semibold text-secondary ring-1 ring-secondary/20">
            {onlineUsers.length} online
          </span>
        </div>

        {/* User list */}
        <div className="scrollbar-thin flex-1 overflow-y-auto p-3 space-y-1">
          {onlineUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-700">
                <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-xs text-slate-500 italic">
                No other users online right now.
              </p>
              <p className="mt-1 text-[10px] text-slate-600">
                Users will appear here when they join.
              </p>
            </div>
          ) : (
            onlineUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => selectUser(user)}
                className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all hover:bg-ink-700/50 hover:ring-1 hover:ring-ink-500/30"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-2 ring-ink-500"
                  style={{ backgroundColor: user.color + '30', borderColor: user.color }}
                >
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-white">{user.username}</p>
                  <p className="text-[10px] text-slate-500">Online now</p>
                </div>
                {unread[user.id] > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-bold text-white">
                    {unread[user.id]}
                  </span>
                )}
                <div className="h-2.5 w-2.5 rounded-full bg-accent animate-pulseLive" />
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ----- Conversation view ---------------------------------------------------
  return (
    <div className="flex h-full flex-col">
      {/* Header with back button */}
      <div className="flex items-center gap-3 border-b border-ink-600/50 px-4 py-3">
        <button
          onClick={() => setSelectedUser(null)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-ink-700 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: selectedUser.color + '30', borderColor: selectedUser.color }}
        >
          {selectedUser.username.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-bold text-white">{selectedUser.username}</p>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-[10px] text-slate-500">Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-4 py-3"
      >
        {currentMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-slate-500 italic">
              No messages yet. Say hi!
            </p>
          </div>
        )}
        {currentMessages.map((m) => {
          const isMe = m.from === socket.id;
          return (
            <div
              key={m.id}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fadeIn`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                  isMe
                    ? 'bg-accent/20 text-white ring-1 ring-accent/30'
                    : 'bg-ink-700 text-slate-200 ring-1 ring-ink-500/30'
                }`}
              >
                <div
                  className="break-words text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatChatText(m.text) }}
                />
                <span className="mt-1 block text-right text-[9px] text-slate-500">
                  {formatTime(m.ts)}
                </span>
              </div>
            </div>
          );
        })}
        {isTypingForMe && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 italic animate-fadeIn">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            {selectedUser.username} is typing...
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="flex gap-2 border-t border-ink-600/50 p-3">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            handleTyping();
          }}
          placeholder={`Message ${selectedUser.username}...`}
          maxLength={500}
          className="flex-1 rounded-xl border border-ink-500/50 bg-ink-800 px-3 py-2.5 text-sm text-white outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-secondary focus:ring-1 focus:ring-secondary/30"
        />
        <button
          type="submit"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-white transition-all duration-200 hover:bg-secondary-dark hover:shadow-glow-orange active:scale-[0.95]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
