// ---------------------------------------------------------------------------
// PRIVATE ROOM system over Socket.IO (replaces the DM feature).
//
// A private room = a group of users behind a room code who can:
//   - chat privately (group chat scoped to the room)
//   - start a video / audio call (WebRTC P2P, signaling scoped to the room)
// The HOST (room creator) has full control of the room.
//
// ---- Events (client -> server) -------------------------------------------
//   proom:create   { username }                 -> create room, become host
//   proom:join     { code, username }           -> join an existing room
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
//   proom:created     { room }
//   proom:joined      { room, chat }
//   proom:error       { error }
//   proom:members     { hostId, locked, members }
//   proom:chat        message
//   proom:chat-history [messages]
//
//   proom:call-participants [{ id, username, mode, micMuted, camOff, forceMuted }]
//   proom:call-user-joined  { id, username, mode }
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
} from '../utils/identity.js';

const MAX_MESSAGE_LEN = 500;

function callRoomName(code) {
  return `proom-call:${code}`;
}

export function registerPrivateRoomHandlers(io, socket) {
  socket.data.proom = { code: null };

  // ----- Create a private room ---------------------------------------------
  socket.on('proom:create', (payload = {}) => {
    // If already in a room, leave it first.
    if (socket.data.proom.code) handleLeave(io, socket);

    const username = sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();

    const room = store.createRoom(socket.id, username, color);
    socket.data.proom.code = room.code;
    socket.data.proom.username = username;
    socket.data.proom.color = color;
    socket.join(room.code);

    socket.emit('proom:created', { room: store.serialize(room.code, socket.id) });
    broadcastMembers(io, room.code);
  });

  // ----- Join a private room -----------------------------------------------
  socket.on('proom:join', (payload = {}) => {
    if (socket.data.proom.code) handleLeave(io, socket);

    const code = String(payload.code || '').toUpperCase();
    const username = sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();

    const result = store.addMember(
      code,
      socket.id,
      username,
      color,
      config.maxParticipantsPerRoom
    );
    if (!result.ok) {
      socket.emit('proom:error', { error: result.error });
      return;
    }

    socket.data.proom.code = result.room.code;
    socket.data.proom.username = username;
    socket.data.proom.color = color;
    socket.join(result.room.code);

    socket.emit('proom:joined', {
      room: store.serialize(result.room.code, socket.id),
      chat: result.room.chat,
    });

    // System message announcing the join.
    const sys = systemMessage(`${username} joined the room`);
    store.pushChat(result.room.code, sys);
    io.to(result.room.code).emit('proom:chat', sys);

    broadcastMembers(io, result.room.code);
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
    if (!text) return;

    const member = room.members.get(socket.id);
    const msg = {
      id: nanoid(),
      username: member.username,
      color: member.color,
      text,
      ts: Date.now(),
    };
    store.pushChat(code, msg);
    io.to(code).emit('proom:chat', msg);
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

    const sys = systemMessage('A member was removed by the host');
    store.pushChat(code, sys);
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

    const sys = systemMessage('The host ended the call');
    store.pushChat(code, sys);
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

  // ----- Disconnect cleanup -------------------------------------------------
  socket.on('disconnect', () => {
    handleLeave(io, socket);
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
    const sys = systemMessage(`${username} left the room`);
    store.pushChat(code, sys);
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
  const list = store
    .memberList(code)
    .filter((m) => m.inCall)
    .map((m) => ({
      id: m.id,
      username: m.username,
      mode: m.callMode,
      micMuted: m.micMuted,
      camOff: m.camOff,
      forceMuted: m.forceMuted,
    }));
  io.to(callRoomName(code)).emit('proom:call-participants', list);
}
