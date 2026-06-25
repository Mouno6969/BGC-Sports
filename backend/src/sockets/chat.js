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
// ---------------------------------------------------------------------------

import { nanoid } from 'nanoid';
import {
  generateUsername,
  generateColor,
  sanitizeUsername,
} from '../utils/identity.js';

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

export function registerChatHandlers(io, socket) {
  socket.data.chat = {
    username: null,
    color: null,
    allow: makeRateLimiter(),
  };

  socket.on('chat:join', (payload = {}) => {
    const username =
      sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();

    socket.data.chat.username = username;
    socket.data.chat.color = color;

    socket.join(PUBLIC_CHANNEL);

    socket.emit('chat:welcome', { username, color });
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

  socket.on('chat:message', (payload = {}) => {
    const { username, color } = socket.data.chat;
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
      text,
      ts: Date.now(),
      reactions: {},
    };
    pushHistory(msg);
    io.to(PUBLIC_CHANNEL).emit('chat:message', msg);
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
