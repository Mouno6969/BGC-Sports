// ---------------------------------------------------------------------------
// Public live chat over Socket.IO.
//
// Everyone joins a single global chat channel "public-chat". No registration:
// the client sends a username (or we auto-generate one) and a color.
//
// Events (client -> server):
//   chat:join     { username, avatar }          -> assign identity, send history
//   chat:message  { text, gif?, replyTo? }      -> broadcast a message
//   chat:reaction { messageId, emoji }          -> toggle a reaction (1/user/msg)
//
// Events (server -> client):
//   chat:welcome          { username, color, avatar }
//   chat:history          [messages]
//   chat:message          message
//   chat:reaction-update  { messageId, reactions }  reactions = { emoji: [users] }
//   chat:count            number (online users)
//
// Message shape:
//   { id, username, color, avatar, text, gif?, ts, reactions, replyTo? }
//   replyTo (optional) = { id, username, color, isAI, text } snippet of the
//   message being replied to.
//
// Reactions: one reaction per user per message. Clicking the same emoji
// again removes it; clicking a different emoji switches to it. The server is
// the source of truth and broadcasts the full updated reactions map.
//
// GIFs: the client sends `gif` — a direct GIF URL selected from the built-in
// GIF picker (served through /api/gifs). Only known GIF CDN hosts pass
// validation, so arbitrary URLs cannot be injected.
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

// Allowed GIF hosts — matches what the /api/gifs proxy returns.
const GIF_HOST_RE = /^https:\/\/([a-z0-9-]+\.)?(giphy\.com|tenor\.com|gstatic\.com)\//i;

// In-memory ring buffer of recent messages (shared across connections).
const history = [];

function pushHistory(msg) {
  history.push(msg);
  if (history.length > HISTORY_LIMIT) history.shift();
}

function findMessage(messageId) {
  return history.find((m) => m.id === messageId);
}

/** Validate a GIF URL from the picker (must be a known GIF CDN). */
export function sanitizeGifUrl(raw) {
  const url = String(raw || '').trim().slice(0, 600);
  if (!url) return '';
  return GIF_HOST_RE.test(url) ? url : '';
}

/** Build the reply snippet stored on a message that replies to another. */
function buildReplySnippet(replyToId) {
  if (!replyToId) return null;
  const original = findMessage(String(replyToId));
  if (!original || original.system) return null;
  return {
    id: original.id,
    username: original.username,
    color: original.color || '',
    isAI: !!original.isAI,
    text: original.gif ? '[GIF]' : String(original.text || '').slice(0, 120),
  };
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
    const gif = sanitizeGifUrl(payload.gif);
    if (!text && !gif) return;

    const msg = {
      id: nanoid(),
      username,
      color,
      avatar: avatar || '',
      text,
      ts: Date.now(),
      reactions: {},
      replyTo: buildReplySnippet(payload.replyTo),
    };
    if (gif) msg.gif = gif;

    pushHistory(msg);
    io.to(PUBLIC_CHANNEL).emit('chat:message', msg);

    // --- AI Integration: Check for @bgc mention and respond ---
    if (aiHandler && text) {
      // Process asynchronously — don't block the chat flow
      aiHandler(msg).catch((err) => {
        console.error('[AI-Chat] Unhandled error:', err);
      });
    }
  });

  // One reaction per user per message: clicking the same emoji removes it,
  // clicking a different emoji switches to it. The server stores usernames
  // per emoji and broadcasts the authoritative reactions map.
  socket.on('chat:reaction', (payload = {}) => {
    const { username } = socket.data.chat;
    if (!username) return;
    const messageId = String(payload.messageId || '');
    const emoji = String(payload.emoji || '').slice(0, 8);
    if (!messageId || !emoji) return;

    const msg = findMessage(messageId);
    if (!msg || msg.system) return;
    if (!msg.reactions) msg.reactions = {};

    // Remove any existing reaction from this user across all emojis.
    let removedSame = false;
    for (const [em, users] of Object.entries(msg.reactions)) {
      const idx = users.indexOf(username);
      if (idx !== -1) {
        users.splice(idx, 1);
        if (em === emoji) removedSame = true;
        if (users.length === 0) delete msg.reactions[em];
      }
    }
    // Add the new reaction unless the user just un-reacted the same emoji.
    if (!removedSame) {
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      msg.reactions[emoji].push(username);
    }

    io.to(PUBLIC_CHANNEL).emit('chat:reaction-update', {
      messageId,
      reactions: msg.reactions,
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
