// ---------------------------------------------------------------------------
// Private Chat (DM) System via Socket.IO.
//
// Users can send direct messages to other users currently online.
// Messages are stored in-memory per conversation (limited history).
//
// Events (client -> server):
//   dm:send       { to, text }              -> send a DM to another user
//   dm:history    { peerId }                -> request DM history with a peer
//   dm:typing     { to }                    -> notify peer you're typing
//
// Events (server -> client):
//   dm:message    { from, fromUsername, fromColor, to, text, ts, id }
//   dm:history    { peerId, messages }
//   dm:typing     { from, fromUsername }
//   dm:online-users  [{ id, username, color }]  -> list of online users
// ---------------------------------------------------------------------------

import { nanoid } from 'nanoid';

const MAX_DM_HISTORY = 50;
const MAX_DM_LEN = 500;

// conversationKey -> messages[]
const dmHistory = new Map();

// socketId -> { username, color }
const onlineUsers = new Map();

function getConversationKey(id1, id2) {
  return [id1, id2].sort().join(':');
}

function getDmHistory(key) {
  if (!dmHistory.has(key)) {
    dmHistory.set(key, []);
  }
  return dmHistory.get(key);
}

function broadcastOnlineUsers(io) {
  const list = Array.from(onlineUsers.entries()).map(([id, data]) => ({
    id,
    username: data.username,
    color: data.color,
  }));
  // Broadcast to all connected sockets that have registered for DMs
  io.emit('dm:online-users', list);
}

export function registerPrivateChatHandlers(io, socket) {
  // When a user joins the chat system, register them for DMs too
  socket.on('dm:register', ({ username, color }) => {
    if (!username) return;
    onlineUsers.set(socket.id, { username, color: color || '#22c55e' });
    broadcastOnlineUsers(io);
  });

  socket.on('dm:send', ({ to, text }) => {
    if (!to || !text) return;
    const sender = onlineUsers.get(socket.id);
    if (!sender) return;

    const sanitized = String(text).replace(/[<>]/g, '').trim().slice(0, MAX_DM_LEN);
    if (!sanitized) return;

    const msg = {
      id: nanoid(),
      from: socket.id,
      fromUsername: sender.username,
      fromColor: sender.color,
      to,
      text: sanitized,
      ts: Date.now(),
    };

    // Store in history
    const key = getConversationKey(socket.id, to);
    const history = getDmHistory(key);
    history.push(msg);
    if (history.length > MAX_DM_HISTORY) history.shift();

    // Send to recipient
    io.to(to).emit('dm:message', msg);
    // Echo back to sender
    socket.emit('dm:message', msg);
  });

  socket.on('dm:history', ({ peerId }) => {
    if (!peerId) return;
    const key = getConversationKey(socket.id, peerId);
    const messages = getDmHistory(key);
    socket.emit('dm:history', { peerId, messages });
  });

  socket.on('dm:typing', ({ to }) => {
    if (!to) return;
    const sender = onlineUsers.get(socket.id);
    if (!sender) return;
    io.to(to).emit('dm:typing', {
      from: socket.id,
      fromUsername: sender.username,
    });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers(io);
  });
}
