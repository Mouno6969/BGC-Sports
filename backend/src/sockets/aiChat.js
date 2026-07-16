// ---------------------------------------------------------------------------
// AI Chat Integration — Hooks into both public chat and private room chat
// to detect @bgc mentions and respond with AI-powered World Cup analysis.
//
// The AI agent responds as a special "BGC AI" user with a distinctive color
// and avatar, making it clear the response comes from the AI system.
//
// Integration points:
//   1. Public live chat (chat.js) — via message interception
//   2. Private room chat (privateRoom.js) — via message interception
//
// The handler listens for messages AFTER they are broadcast, processes them
// asynchronously, and injects the AI response as a new message.
// ---------------------------------------------------------------------------

import { nanoid } from 'nanoid';
import { isBgcMention, processQuery } from '../ai/index.js';

// BGC AI Bot identity
const AI_BOT = {
  username: 'BGC AI',
  color: '#f59e0b', // Amber/gold color — matches World Cup theme
  avatar: '/bgc-ai-logo.png', // BGC AI logo served from frontend/public
  isBot: true,
};

// Track processing state to avoid duplicate responses
const processingMessages = new Set();

// ---------------------------------------------------------------------------
// Create an AI response message object
// ---------------------------------------------------------------------------

function createAIMessage(text, replyTo = null) {
  return {
    id: nanoid(),
    username: AI_BOT.username,
    color: AI_BOT.color,
    avatar: AI_BOT.avatar,
    text,
    ts: Date.now(),
    isAI: true,
    replyTo,
    reactions: {},
  };
}

// ---------------------------------------------------------------------------
// Process a message for @bgc mentions (public chat)
// ---------------------------------------------------------------------------

export function setupPublicChatAI(io, pushHistory) {
  const PUBLIC_CHANNEL = 'public-chat';

  return async function handleAIMessage(msg) {
    // Skip system messages, AI messages, or messages already being processed
    if (msg.system || msg.isAI || !msg.text) return;
    if (!isBgcMention(msg.text)) return;
    if (processingMessages.has(msg.id)) return;

    processingMessages.add(msg.id);

    const emitPhase = (phase) => {
      if (phase === 'idle') {
        io.to(PUBLIC_CHANNEL).emit('chat:typing', {
          username: AI_BOT.username,
          isTyping: false,
          phase: 'idle',
        });
        return;
      }
      // phase: 'searching' then 'thinking' — UI shows search indicator first
      io.to(PUBLIC_CHANNEL).emit('chat:typing', {
        username: AI_BOT.username,
        isTyping: true,
        phase,
      });
    };

    try {
      const result = await processQuery(msg.text, msg.username, msg.username, {
        onPhase: emitPhase,
      });

      emitPhase('idle');

      if (result.success && result.response) {
        const aiMsg = createAIMessage(result.response, msg.username);
        pushHistory(aiMsg);
        io.to(PUBLIC_CHANNEL).emit('chat:message', aiMsg);
      } else if (result.error) {
        const errorMsg = createAIMessage(result.error, msg.username);
        pushHistory(errorMsg);
        io.to(PUBLIC_CHANNEL).emit('chat:message', errorMsg);
      }
    } catch (err) {
      console.error('[AI-Chat] Error in public chat AI:', err);
      emitPhase('idle');
    } finally {
      processingMessages.delete(msg.id);
    }
  };
}

// ---------------------------------------------------------------------------
// Process a message for @bgc mentions (private room chat)
// ---------------------------------------------------------------------------

export function setupPrivateRoomAI(io, roomStore) {
  return async function handleAIRoomMessage(msg, roomCode) {
    // Skip system messages, AI messages, or messages already being processed
    if (msg.system || msg.isAI || !msg.text) return;
    if (!isBgcMention(msg.text)) return;
    if (processingMessages.has(msg.id)) return;

    processingMessages.add(msg.id);

    const emitPhase = (phase) => {
      if (phase === 'idle') {
        io.to(roomCode).emit('proom:typing', {
          username: AI_BOT.username,
          isTyping: false,
          phase: 'idle',
        });
        return;
      }
      io.to(roomCode).emit('proom:typing', {
        username: AI_BOT.username,
        isTyping: true,
        phase,
      });
    };

    try {
      const result = await processQuery(msg.text, msg.username, msg.username, {
        onPhase: emitPhase,
      });

      emitPhase('idle');

      if (result.success && result.response) {
        const aiMsg = createAIMessage(result.response, msg.username);
        // Store in room chat history
        if (roomStore && typeof roomStore.pushChat === 'function') {
          roomStore.pushChat(roomCode, aiMsg);
        }
        io.to(roomCode).emit('proom:chat', aiMsg);
      } else if (result.error) {
        const errorMsg = createAIMessage(result.error, msg.username);
        if (roomStore && typeof roomStore.pushChat === 'function') {
          roomStore.pushChat(roomCode, errorMsg);
        }
        io.to(roomCode).emit('proom:chat', errorMsg);
      }
    } catch (err) {
      console.error('[AI-Chat] Error in room chat AI:', err);
      emitPhase('idle');
    } finally {
      processingMessages.delete(msg.id);
    }
  };
}

// ---------------------------------------------------------------------------
// Export bot identity for frontend rendering
// ---------------------------------------------------------------------------

export { AI_BOT };
