// ---------------------------------------------------------------------------
// AI Chatroom — a dedicated, shared chatroom where everyone talks with the
// BGC AI agent. Unlike the public live chat (where the AI only responds to
// @bgc mentions), EVERY user message here is answered by the AI, and the
// whole conversation (all questions and all AI answers) is broadcast to
// every connected participant, so the room behaves like a public group
// conversation with the AI.
//
// Events (client -> server):
//   ai:join     { username, avatar }        -> join room, receive history
//   ai:message  { text, replyTo? }          -> post a question to the AI
//   ai:reaction { messageId, emoji }        -> toggle a reaction (1/user/msg)
//
// Events (server -> client):
//   ai:welcome          { username, color, avatar, bot }
//   ai:history          [messages]
//   ai:message          message
//   ai:reaction-update  { messageId, reactions }
//   ai:typing           { username, isTyping }   (AI thinking indicator)
//   ai:count            number (online users)
//   ai:error            { error }
// ---------------------------------------------------------------------------

import { nanoid } from 'nanoid';
import {
  generateUsername,
  generateColor,
  sanitizeUsername,
  sanitizeAvatar,
} from '../utils/identity.js';
import { processQuery } from '../ai/index.js';
import { AI_BOT } from './aiChat.js';

const AI_CHANNEL = 'ai-chatroom';
const HISTORY_LIMIT = 150;
const MAX_MESSAGE_LEN = 500;

// Shared in-memory conversation history (visible to everyone who joins).
const history = [];

function pushHistory(msg) {
  history.push(msg);
  if (history.length > HISTORY_LIMIT) history.shift();
}

function findMessage(messageId) {
  return history.find((m) => m.id === messageId);
}

// Small per-socket rate limiter (AI queries are expensive).
function makeRateLimiter(maxPerWindow = 3, windowMs = 10000) {
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

function emitCount(io) {
  const room = io.sockets.adapter.rooms.get(AI_CHANNEL);
  const count = room ? room.size : 0;
  io.to(AI_CHANNEL).emit('ai:count', count);
}

// Build a reply snippet stored on messages that reply to earlier ones.
function buildReplySnippet(replyToId) {
  if (!replyToId) return null;
  const original = findMessage(String(replyToId));
  if (!original || original.system) return null;
  return {
    id: original.id,
    username: original.username,
    color: original.color || '',
    isAI: !!original.isAI,
    text: String(original.text || '').slice(0, 120),
  };
}

export function registerAiRoomHandlers(io, socket) {
  socket.data.aiRoom = {
    username: null,
    color: null,
    avatar: '',
    allow: makeRateLimiter(),
  };

  // ----- Join the AI chatroom ----------------------------------------------
  socket.on('ai:join', (payload = {}) => {
    const username = sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();
    const avatar = sanitizeAvatar(payload.avatar);

    socket.data.aiRoom.username = username;
    socket.data.aiRoom.color = color;
    socket.data.aiRoom.avatar = avatar;

    socket.join(AI_CHANNEL);

    socket.emit('ai:welcome', {
      username,
      color,
      avatar,
      bot: {
        username: AI_BOT.username,
        color: AI_BOT.color,
        avatar: AI_BOT.avatar,
      },
    });
    socket.emit('ai:history', history);
    emitCount(io);
  });

  // Keep identity in sync with profile edits.
  socket.on('ai:update-profile', (payload = {}) => {
    if (!socket.data.aiRoom.username) return;
    const username = sanitizeUsername(payload.username);
    if (username) socket.data.aiRoom.username = username;
    if (payload.avatar !== undefined) {
      socket.data.aiRoom.avatar = sanitizeAvatar(payload.avatar);
    }
  });

  // ----- Ask the AI ----------------------------------------------------------
  socket.on('ai:message', async (payload = {}) => {
    const { username, color, avatar } = socket.data.aiRoom;
    if (!username) return; // must join first
    if (!socket.data.aiRoom.allow()) {
      socket.emit('ai:error', {
        error: 'You are asking too fast — give the AI a few seconds.',
      });
      return;
    }

    const text = String(payload.text || '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, MAX_MESSAGE_LEN);
    if (!text) return;

    // 1. Broadcast the user's question so everyone sees the conversation.
    const userMsg = {
      id: nanoid(),
      username,
      color,
      avatar: avatar || '',
      text,
      ts: Date.now(),
      reactions: {},
      replyTo: buildReplySnippet(payload.replyTo),
    };
    pushHistory(userMsg);
    io.to(AI_CHANNEL).emit('ai:message', userMsg);

    // 2. Show the AI typing indicator to the whole room.
    io.to(AI_CHANNEL).emit('ai:typing', {
      username: AI_BOT.username,
      isTyping: true,
    });

    // 3. Ask the AI. In this room no @bgc prefix is needed — every message
    //    is a query. processQuery strips @bgc if present.
    try {
      const result = await processQuery(text, `ai-room:${username}`, username);

      io.to(AI_CHANNEL).emit('ai:typing', {
        username: AI_BOT.username,
        isTyping: false,
      });

      const responseText =
        result.success && result.response
          ? result.response
          : result.error || 'I could not process that right now — please try again.';

      const aiMsg = {
        id: nanoid(),
        username: AI_BOT.username,
        color: AI_BOT.color,
        avatar: AI_BOT.avatar,
        text: responseText,
        ts: Date.now(),
        isAI: true,
        reactions: {},
        replyTo: {
          id: userMsg.id,
          username: userMsg.username,
          color: userMsg.color,
          isAI: false,
          text: userMsg.text.slice(0, 120),
        },
      };
      pushHistory(aiMsg);
      io.to(AI_CHANNEL).emit('ai:message', aiMsg);
    } catch (err) {
      console.error('[AI-Room] Error processing query:', err);
      io.to(AI_CHANNEL).emit('ai:typing', {
        username: AI_BOT.username,
        isTyping: false,
      });
      const errMsg = {
        id: nanoid(),
        username: AI_BOT.username,
        color: AI_BOT.color,
        avatar: AI_BOT.avatar,
        text: 'Something went wrong on my side. Please try again in a moment.',
        ts: Date.now(),
        isAI: true,
        reactions: {},
      };
      pushHistory(errMsg);
      io.to(AI_CHANNEL).emit('ai:message', errMsg);
    }
  });

  // ----- Reactions (one per user per message, toggle/switch) -----------------
  socket.on('ai:reaction', (payload = {}) => {
    const { username } = socket.data.aiRoom;
    if (!username) return;
    const messageId = String(payload.messageId || '');
    const emoji = String(payload.emoji || '').slice(0, 8);
    if (!messageId || !emoji) return;

    const msg = findMessage(messageId);
    if (!msg || msg.system) return;
    if (!msg.reactions) msg.reactions = {};

    // Remove any existing reaction from this user (one reaction per message).
    let removedSame = false;
    for (const [em, users] of Object.entries(msg.reactions)) {
      const idx = users.indexOf(username);
      if (idx !== -1) {
        users.splice(idx, 1);
        if (em === emoji) removedSame = true;
        if (users.length === 0) delete msg.reactions[em];
      }
    }
    // If they clicked a new emoji (not un-reacting the same one), add it.
    if (!removedSame) {
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      msg.reactions[emoji].push(username);
    }

    io.to(AI_CHANNEL).emit('ai:reaction-update', {
      messageId,
      reactions: msg.reactions,
    });
  });

  socket.on('disconnect', () => {
    if (socket.data.aiRoom?.username) {
      emitCount(io);
    }
  });
}
