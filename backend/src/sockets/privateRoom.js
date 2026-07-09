// ---------------------------------------------------------------------------
// PRIVATE ROOM system over Socket.IO (replaces the DM feature).
//
// A private room = a group of users behind a room code who can:
//   - chat privately (group chat scoped to the room)
//   - start a video / audio call (WebRTC P2P, signaling scoped to the room)
// The HOST (room creator) has full control of the room.
//
// ---- Events (client -> server) -------------------------------------------
//   proom:create   { username, avatar? }        -> create room, become host
//   proom:join     { code, username, avatar? }  -> join an existing room
//   proom:resume   { code, sessionToken }       -> reclaim a held slot after a
//                                                  brief disconnect (grace period)
//   proom:leave    {}                           -> leave current room
//   proom:chat     { text }                     -> send a group chat message
//
//   // Call (scoped to the room only):
//   proom:call-join   { mode }                  -> join the room A/V call
//   proom:call-leave  {}                        -> leave the room A/V call
//   proom:offer    { to, offer }                -> relay SDP offer
//   proom:answer   { to, answer }               -> relay SDP answer
//   proom:ice      { to, candidate }            -> relay ICE candidate
//   proom:mic      { muted }                    -> broadcast self mic state
//   proom:cam      { camOff }                   -> broadcast self cam state
//
//   // Host controls (host only — server enforces authority):
//   proom:kick        { targetId }              -> remove a member
//   proom:force-mute  { targetId, muted }       -> force/unforce a member's mic
//   proom:lock        { locked }                -> lock/unlock the room
//   proom:end-call    {}                        -> end the call for everyone
//   proom:transfer-host { targetId }            -> hand host to another member
//
// ---- Events (server -> client) -------------------------------------------
//   proom:created     { room, sessionToken }
//   proom:joined      { room, chat, sessionToken }
//   proom:resumed     { room, chat, sessionToken }
//   proom:resume-failed { error }
//   proom:error       { error }
//   proom:members     { hostId, locked, members }   (members carry `disconnected`)
//   proom:chat        message
//   proom:chat-history [messages]
//
//   proom:call-participants [{ id, username, avatar, mode, micMuted, camOff, forceMuted }]
//   proom:call-user-joined  { id, username, avatar, mode }
//   proom:call-user-left    { id }
//   proom:offer    { from, offer }
//   proom:answer   { from, answer }
//   proom:ice      { from, candidate }
//   proom:mic-state { id, muted }
//   proom:cam-state { id, camOff }
//
//   proom:kicked      {}                        (sent to the kicked socket)
//   proom:force-muted { muted }                 (sent to the targeted socket)
//   proom:locked      { locked }
//   proom:call-ended  {}
//   proom:host-changed { hostId }
// ---------------------------------------------------------------------------

import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { privateRoomStore as store } from '../utils/privateRoomStore.js';
import {
  generateUsername,
  generateColor,
  sanitizeUsername,
  sanitizeAvatar,
} from '../utils/identity.js';
import { setupPrivateRoomAI } from './aiChat.js';
import { sanitizeGifUrl } from './chat.js';

// AI handler for private room chat (initialized once)
let aiRoomHandler = null;

const MAX_MESSAGE_LEN = 500;
const ROOM_CODE_LEN = 6;

// How long a disconnected member's slot is held before final removal.
// Overridable via env for fast integration tests.
const GRACE_PERIOD_MS = Number(process.env.PROOM_GRACE_MS) > 0
  ? Number(process.env.PROOM_GRACE_MS)
  : 30_000;

function sanitizeRoomCode(raw) {
  return String(raw || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, ROOM_CODE_LEN);
}

function callRoomName(code) {
  return `proom-call:${code}`;
}

// Shared shape for a member appearing in the in-call participants list.
// Used by both the join handler and broadcastCallParticipants so the two
// payloads never diverge when new fields are added.
function toCallParticipant(m) {
  return {
    id: m.id,
    username: m.username,
    avatar: m.avatar || '',
    mode: m.callMode,
    micMuted: m.micMuted,
    camOff: m.camOff,
    forceMuted: m.forceMuted,
  };
}

function callParticipants(code) {
  return store
    .memberList(code)
    .filter((m) => m.inCall)
    .map(toCallParticipant);
}

export function registerPrivateRoomHandlers(io, socket) {
  socket.data.proom = { code: null };

  // ----- Create a private room ---------------------------------------------
  socket.on('proom:create', (payload = {}) => {
    // If already in a room, leave it first.
    if (socket.data.proom.code) handleLeave(io, socket);

    const username = sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();
    const avatar = sanitizeAvatar(payload.avatar);

    const room = store.createRoom(socket.id, username, color, avatar);
    socket.data.proom.code = room.code;
    socket.data.proom.username = username;
    socket.data.proom.color = color;
    socket.data.proom.avatar = avatar;
    socket.join(room.code);

    socket.emit('proom:created', {
      room: store.serialize(room.code, socket.id),
      // Private resume secret — sent only to the owning socket.
      sessionToken: room.members.get(socket.id).sessionToken,
    });
    broadcastMembers(io, room.code);
  });

  // ----- Join a private room -----------------------------------------------
  socket.on('proom:join', (payload = {}) => {
    if (socket.data.proom.code) handleLeave(io, socket);

    const code = sanitizeRoomCode(payload.code);
    if (code.length !== ROOM_CODE_LEN) {
      socket.emit('proom:error', { error: 'Enter a valid 6-character room code' });
      return;
    }
    const username = sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();
    const avatar = sanitizeAvatar(payload.avatar);

    const result = store.addMember(
      code,
      socket.id,
      username,
      color,
      config.maxParticipantsPerRoom,
      avatar
    );
    if (!result.ok) {
      socket.emit('proom:error', { error: result.error });
      return;
    }

    socket.data.proom.code = result.room.code;
    socket.data.proom.username = username;
    socket.data.proom.color = color;
    socket.data.proom.avatar = avatar;
    socket.join(result.room.code);

    socket.emit('proom:joined', {
      room: store.serialize(result.room.code, socket.id),
      chat: result.room.chat,
      // Private resume secret — sent only to the owning socket.
      sessionToken: result.room.members.get(socket.id).sessionToken,
    });

    // System message announcing the join (broadcast only, not stored in history).
    const sys = systemMessage(`${username} joined the room`);
    io.to(result.room.code).emit('proom:chat', sys);

    broadcastMembers(io, result.room.code);

    // Send the current call participants list to the newly joined user
    // so they know if a call is already in progress and can auto-join.
    const callList = callParticipants(result.room.code);
    if (callList.length > 0) {
      socket.emit('proom:call-participants', callList);
    }
  });

  // ----- Resume a held slot after a brief disconnect ------------------------
  socket.on('proom:resume', (payload = {}) => {
    const code = sanitizeRoomCode(payload.code);
    const sessionToken = String(payload.sessionToken || '');
    if (code.length !== ROOM_CODE_LEN || !sessionToken) {
      socket.emit('proom:resume-failed', { error: 'Invalid resume request' });
      return;
    }

    // If this socket is already in a different room, leave it first.
    if (socket.data.proom.code && socket.data.proom.code !== code) {
      handleLeave(io, socket);
    }

    const result = store.resumeMember(code, sessionToken, socket.id);
    if (!result.ok) {
      socket.emit('proom:resume-failed', { error: result.error });
      return;
    }

    const { room, member } = result;
    socket.data.proom.code = room.code;
    socket.data.proom.username = member.username;
    socket.data.proom.color = member.color;
    socket.data.proom.avatar = member.avatar;
    socket.join(room.code);

    socket.emit('proom:resumed', {
      room: store.serialize(room.code, socket.id),
      chat: room.chat,
      sessionToken: member.sessionToken,
    });

    // Reconnect notice — broadcast only, not stored in history.
    const sys = systemMessage(`${member.username} reconnected`);
    io.to(room.code).emit('proom:chat', sys);

    broadcastMembers(io, room.code);

    // Let the resumed client know about any call in progress so it can
    // offer to rejoin (media cannot survive a socket drop, so they start fresh).
    const callList = callParticipants(room.code);
    if (callList.length > 0) {
      socket.emit('proom:call-participants', callList);
    }
  });

  // ----- Leave a private room ----------------------------------------------
  socket.on('proom:leave', () => {
    handleLeave(io, socket);
  });

  // ----- Group chat ---------------------------------------------------------
  socket.on('proom:chat', (payload = {}) => {
    const code = socket.data.proom.code;
    const room = store.getRoom(code);
    if (!room || !room.members.has(socket.id)) return;

    const text = String(payload.text || '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, MAX_MESSAGE_LEN);
    const gif = sanitizeGifUrl(payload.gif);
    if (!text && !gif) return;

    const member = room.members.get(socket.id);

    // Build reply snippet if replying to another message
    let replyTo = null;
    if (payload.replyTo) {
      const original = room.chat.find((m) => m.id === String(payload.replyTo));
      if (original && !original.system) {
        replyTo = {
          id: original.id,
          username: original.username,
          color: original.color || '',
          text: original.gif ? '[GIF]' : String(original.text || '').slice(0, 120),
        };
      }
    }

    const msg = {
      id: nanoid(),
      username: member.username,
      color: member.color,
      avatar: member.avatar || '',
      text,
      ts: Date.now(),
    };
    if (gif) msg.gif = gif;
    if (replyTo) msg.replyTo = replyTo;
    store.pushChat(code, msg);
    io.to(code).emit('proom:chat', msg);

    // --- AI Integration: Check for @bgc mention and respond ---
    if (!aiRoomHandler) {
      aiRoomHandler = setupPrivateRoomAI(io, store);
    }
    aiRoomHandler(msg, code).catch((err) => {
      console.error('[AI-Room] Unhandled error:', err);
    });
  });

  // ======================= ROOM-SCOPED A/V CALL ============================

  // ----- Join the room call -------------------------------------------------
  socket.on('proom:call-join', (payload = {}) => {
    const code = socket.data.proom.code;
    const room = store.getRoom(code);
    if (!room || !room.members.has(socket.id)) return;

    const mode = payload.mode === 'video' ? 'video' : 'audio';
    store.updateMember(code, socket.id, {
      inCall: true,
      callMode: mode,
      micMuted: false,
      camOff: mode === 'audio',
    });

    socket.join(callRoomName(code));

    // Notify existing call participants about the new user.
    socket.to(callRoomName(code)).emit('proom:call-user-joined', {
      id: socket.id,
      username: room.members.get(socket.id).username,
      avatar: room.members.get(socket.id).avatar || '',
      mode,
    });

    broadcastCallParticipants(io, code);
  });

  // ----- Leave the room call ------------------------------------------------
  socket.on('proom:call-leave', () => {
    leaveCall(io, socket);
  });

  // ----- WebRTC signaling relays (validated to same room) -------------------
  socket.on('proom:offer', ({ to, offer } = {}) => {
    if (!to || !offer || !sameRoom(socket, to)) return;
    io.to(to).emit('proom:offer', { from: socket.id, offer });
  });

  socket.on('proom:answer', ({ to, answer } = {}) => {
    if (!to || !answer || !sameRoom(socket, to)) return;
    io.to(to).emit('proom:answer', { from: socket.id, answer });
  });

  socket.on('proom:ice', ({ to, candidate } = {}) => {
    if (!to || !candidate || !sameRoom(socket, to)) return;
    io.to(to).emit('proom:ice', { from: socket.id, candidate });
  });

  // ----- Self mic / cam toggles --------------------------------------------
  socket.on('proom:mic', ({ muted } = {}) => {
    const code = socket.data.proom.code;
    const room = store.getRoom(code);
    if (!room || !room.members.has(socket.id)) return;
    const member = room.members.get(socket.id);
    // A force-muted member cannot unmute themselves.
    if (member.forceMuted && !muted) return;
    store.updateMember(code, socket.id, { micMuted: Boolean(muted) });
    socket.to(callRoomName(code)).emit('proom:mic-state', {
      id: socket.id,
      muted: Boolean(muted),
    });
  });

  socket.on('proom:cam', ({ camOff } = {}) => {
    const code = socket.data.proom.code;
    const room = store.getRoom(code);
    if (!room || !room.members.has(socket.id)) return;
    store.updateMember(code, socket.id, { camOff: Boolean(camOff) });
    socket.to(callRoomName(code)).emit('proom:cam-state', {
      id: socket.id,
      camOff: Boolean(camOff),
    });
  });

  // ============================ HOST CONTROLS ==============================

  // ----- Host kicks a member ------------------------------------------------
  socket.on('proom:kick', ({ targetId } = {}) => {
    const room = requireHost(socket);
    if (!room || !targetId || targetId === socket.id) return;
    if (!room.members.has(targetId)) return;

    const code = room.code;
    io.to(targetId).emit('proom:kicked', {});

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.leave(code);
      targetSocket.leave(callRoomName(code));
      targetSocket.data.proom.code = null;
    }
    store.removeMember(code, targetId);

    // Tell remaining call peers the user left (so they tear down the PC).
    io.to(callRoomName(code)).emit('proom:call-user-left', { id: targetId });

    // Kick notice — broadcast only, not stored in history.
    const sys = systemMessage('A member was removed by the host');
    io.to(code).emit('proom:chat', sys);

    broadcastMembers(io, code);
    broadcastCallParticipants(io, code);
  });

  // ----- Host force-mutes / unmutes a member --------------------------------
  socket.on('proom:force-mute', ({ targetId, muted } = {}) => {
    const room = requireHost(socket);
    if (!room || !targetId) return;
    if (!room.members.has(targetId)) return;

    const code = room.code;
    const force = Boolean(muted);
    store.updateMember(code, targetId, {
      forceMuted: force,
      micMuted: force ? true : room.members.get(targetId).micMuted,
    });

    // Tell the target to actually mute their local track.
    io.to(targetId).emit('proom:force-muted', { muted: force });
    // Reflect mic state to all call participants.
    io.to(callRoomName(code)).emit('proom:mic-state', {
      id: targetId,
      muted: force ? true : room.members.get(targetId).micMuted,
    });
    broadcastMembers(io, code);
    broadcastCallParticipants(io, code);
  });

  // ----- Host locks / unlocks the room --------------------------------------
  socket.on('proom:lock', ({ locked } = {}) => {
    const room = requireHost(socket);
    if (!room) return;
    store.setLocked(room.code, locked);
    io.to(room.code).emit('proom:locked', { locked: room.locked });
    broadcastMembers(io, room.code);
  });

  // ----- Host ends the call for everyone ------------------------------------
  socket.on('proom:end-call', () => {
    const room = requireHost(socket);
    if (!room) return;
    const code = room.code;

    // Reset call state for all members.
    room.members.forEach((m) => {
      m.inCall = false;
      m.callMode = null;
    });
    io.to(callRoomName(code)).emit('proom:call-ended', {});

    // Force everyone out of the call socket room.
    const callRoom = io.sockets.adapter.rooms.get(callRoomName(code));
    if (callRoom) {
      for (const sid of Array.from(callRoom)) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.leave(callRoomName(code));
      }
    }

    // Call ended notice — broadcast only, not stored in history.
    const sys = systemMessage('The host ended the call');
    io.to(code).emit('proom:chat', sys);
    broadcastCallParticipants(io, code);
  });

  // ----- Host transfers ownership -------------------------------------------
  socket.on('proom:transfer-host', ({ targetId } = {}) => {
    const room = requireHost(socket);
    if (!room || !targetId || !room.members.has(targetId)) return;
    room.hostId = targetId;
    io.to(room.code).emit('proom:host-changed', { hostId: targetId });
    broadcastMembers(io, room.code);
  });

  // ----- Disconnect: hold the slot for a grace period -----------------------
  socket.on('disconnect', () => {
    handleDisconnect(io, socket);
  });
}

// ----------------------------- helpers -------------------------------------

function systemMessage(text) {
  return { id: nanoid(), system: true, text, ts: Date.now() };
}

/** Returns the room if the socket is its host, else null. */
function requireHost(socket) {
  const code = socket.data.proom?.code;
  const room = store.getRoom(code);
  if (!room || room.hostId !== socket.id) return null;
  return room;
}

/** True if `targetId` is in the same private room as `socket`. */
function sameRoom(socket, targetId) {
  const code = socket.data.proom?.code;
  const room = store.getRoom(code);
  return Boolean(room && room.members.has(targetId) && room.members.has(socket.id));
}

function leaveCall(io, socket) {
  const code = socket.data.proom?.code;
  const room = store.getRoom(code);
  if (!room) return;
  if (!room.members.has(socket.id)) return;

  store.updateMember(code, socket.id, {
    inCall: false,
    callMode: null,
    micMuted: false,
    camOff: false,
  });
  socket.leave(callRoomName(code));
  socket.to(callRoomName(code)).emit('proom:call-user-left', { id: socket.id });
  broadcastCallParticipants(io, code);
}

/**
 * Transport-level disconnect: instead of removing the member immediately,
 * mark them `disconnected` and hold their slot for GRACE_PERIOD_MS so they
 * can resume with their session token. Their call membership ends now
 * (media cannot survive the socket drop), and the slot is finalized as a
 * normal leave if the grace period expires without a resume.
 */
function handleDisconnect(io, socket) {
  const code = socket.data.proom?.code;
  if (!code) return;

  const room = store.getRoom(code);
  if (!room || !room.members.has(socket.id)) return;

  const wasInCall = Boolean(room.members.get(socket.id)?.inCall);
  const member = store.markDisconnected(code, socket.id);
  if (!member) return;

  // Tear down their presence in the call (peers must drop the connection).
  if (wasInCall) {
    io.to(callRoomName(code)).emit('proom:call-user-left', { id: socket.id });
    broadcastCallParticipants(io, code);
  }

  // Disconnect notice — broadcast only, not stored in history.
  const sys = systemMessage(`${member.username} lost connection — waiting for them to reconnect…`);
  io.to(code).emit('proom:chat', sys);

  broadcastMembers(io, code);

  const disconnectedId = socket.id;
  store.attachRemovalTimer(code, disconnectedId, GRACE_PERIOD_MS, () => {
    finalizeDeparture(io, code, disconnectedId, member.username);
  });
}

/** Grace period expired without a resume — remove the member for real. */
function finalizeDeparture(io, code, socketId, username) {
  const room = store.getRoom(code);
  if (!room || !room.members.has(socketId)) return;

  const { room: remaining, newHostId } = store.removeMember(code, socketId);
  if (!remaining) return; // room became empty and was deleted

    // Leave notice — broadcast only, not stored in history.
    const sys = systemMessage(`${username || 'A member'} left the room`);
    io.to(code).emit('proom:chat', sys);

  if (newHostId) {
    io.to(code).emit('proom:host-changed', { hostId: newHostId });
  }
  broadcastMembers(io, code);
  broadcastCallParticipants(io, code);
}

function handleLeave(io, socket) {
  const code = socket.data.proom?.code;
  if (!code) return;

  // Make sure any call membership is cleaned up first.
  socket.leave(callRoomName(code));
  socket.to(callRoomName(code)).emit('proom:call-user-left', { id: socket.id });

  const username = socket.data.proom?.username || 'A member';
  const { room, newHostId } = store.removeMember(code, socket.id);
  socket.leave(code);
  socket.data.proom.code = null;

  if (room) {
    // Leave notice — broadcast only, not stored in history.
    const sys = systemMessage(`${username} left the room`);
    io.to(code).emit('proom:chat', sys);

    if (newHostId) {
      io.to(code).emit('proom:host-changed', { hostId: newHostId });
    }
    broadcastMembers(io, code);
    broadcastCallParticipants(io, code);
  }
}

function broadcastMembers(io, code) {
  const room = store.getRoom(code);
  if (!room) return;
  io.to(code).emit('proom:members', {
    hostId: room.hostId,
    locked: room.locked,
    members: store.memberList(code),
  });
}

function broadcastCallParticipants(io, code) {
  const room = store.getRoom(code);
  if (!room) return;
  io.to(callRoomName(code)).emit('proom:call-participants', callParticipants(code));
}
