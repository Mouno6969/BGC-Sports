// ---------------------------------------------------------------------------
// Public live chat over Socket.IO.
//
// Everyone joins a single global chat channel "public-chat". No registration:
// the client sends a username (or we auto-generate one) and a color.
//
// Events (client -> server):
//   chat:join     { username }                 -> assign identity, send history
//   chat:message  { text }                     -> broadcast a message
//   chat:reaction { messageId, emoji }         -> broadcast a reaction
//
// Events (server -> client):
//   chat:welcome  { username, color }
//   chat:history  [messages]
//   chat:message  message
//   chat:reaction { messageId, emoji, username }
//   chat:count    number (online users)
//
// AI Integration:
//   When a message contains "@bgc", the BGC AI agent processes the query
//   and responds with World Cup analysis, predictions, or match insights.
// ---------------------------------------------------------------------------

import { nanoid } from 'nanoid';
import {
  generateUsername,
  generateColor,
  sanitizeUsername,
  sanitizeAvatar,
} from '../utils/identity.js';
import { setupPublicChatAI } from './aiChat.js';

const PUBLIC_CHANNEL = 'public-chat';
const HISTORY_LIMIT = 100;
const MAX_MESSAGE_LEN = 500;

// In-memory ring buffer of recent messages (shared across connections).
const history = [];

function pushHistory(msg) {
  history.push(msg);
  if (history.length > HISTORY_LIMIT) history.shift();
}

// Very small per-socket rate limiter to discourage spam.
function makeRateLimiter(maxPerWindow = 5, windowMs = 3000) {
  let count = 0;
  let windowStart = Date.now();
  return function allow() {
    const now = Date.now();
    if (now - windowStart > windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= maxPerWindow;
  };
}

// AI handler (initialized once per io instance)
let aiHandler = null;

export function registerChatHandlers(io, socket) {
  // Initialize AI handler once
  if (!aiHandler) {
    aiHandler = setupPublicChatAI(io, pushHistory);
  }

  socket.data.chat = {
    username: null,
    color: null,
    avatar: '',
    allow: makeRateLimiter(),
  };

  socket.on('chat:join', (payload = {}) => {
    const username =
      sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();
    const avatar = sanitizeAvatar(payload.avatar);

    socket.data.chat.username = username;
    socket.data.chat.color = color;
    socket.data.chat.avatar = avatar;

    socket.join(PUBLIC_CHANNEL);

    socket.emit('chat:welcome', { username, color, avatar });
    socket.emit('chat:history', history);

    // Broadcast updated online count.
    emitCount(io);

    // System message announcing the join.
    const sys = {
      id: nanoid(),
      system: true,
      text: `${username} joined the chat`,
      ts: Date.now(),
    };
    pushHistory(sys);
    io.to(PUBLIC_CHANNEL).emit('chat:message', sys);
  });

  // Update identity in place (e.g. after the user edits their profile)
  // without re-joining or re-announcing.
  socket.on('chat:update-profile', (payload = {}) => {
    if (!socket.data.chat.username) return;
    const username = sanitizeUsername(payload.username);
    if (username) socket.data.chat.username = username;
    // Only touch the avatar when the caller explicitly provides the field
    // (an empty string intentionally clears it); mirrors the username guard.
    if (payload.avatar !== undefined) {
      socket.data.chat.avatar = sanitizeAvatar(payload.avatar);
    }
    socket.emit('chat:welcome', {
      username: socket.data.chat.username,
      color: socket.data.chat.color,
      avatar: socket.data.chat.avatar,
    });
  });

  socket.on('chat:message', (payload = {}) => {
    const { username, color, avatar } = socket.data.chat;
    if (!username) return; // must join first
    if (!socket.data.chat.allow()) {
      socket.emit('chat:error', { error: 'You are sending messages too fast.' });
      return;
    }

    const text = String(payload.text || '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, MAX_MESSAGE_LEN);
    if (!text) return;

    const msg = {
      id: nanoid(),
      username,
      color,
      avatar: avatar || '',
      text,
      ts: Date.now(),
      reactions: {},
    };
    pushHistory(msg);
    io.to(PUBLIC_CHANNEL).emit('chat:message', msg);

    // --- AI Integration: Check for @bgc mention and respond ---
    if (aiHandler) {
      // Process asynchronously — don't block the chat flow
      aiHandler(msg).catch((err) => {
        console.error('[AI-Chat] Unhandled error:', err);
      });
    }
  });

  socket.on('chat:reaction', (payload = {}) => {
    const { username } = socket.data.chat;
    if (!username) return;
    const { messageId, emoji } = payload;
    if (!messageId || !emoji) return;

    const safeEmoji = String(emoji).slice(0, 8);
    io.to(PUBLIC_CHANNEL).emit('chat:reaction', {
      messageId,
      emoji: safeEmoji,
      username,
    });
  });

  socket.on('chat:typing', (payload = {}) => {
    const { username } = socket.data.chat;
    if (!username) return;
    const { isTyping } = payload;
    socket.broadcast.to(PUBLIC_CHANNEL).emit('chat:typing', {
      username,
      isTyping: !!isTyping,
    });
  });

  socket.on('disconnect', () => {
    if (socket.data.chat?.username) {
      emitCount(io);
    }
  });
}

function emitCount(io) {
  const room = io.sockets.adapter.rooms.get(PUBLIC_CHANNEL);
  const count = room ? room.size : 0;
  io.to(PUBLIC_CHANNEL).emit('chat:count', count);
}
