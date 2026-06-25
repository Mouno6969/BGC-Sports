// ---------------------------------------------------------------------------
// Watch-party room management + host playback sync over Socket.IO.
//
// Events (client -> server):
//   room:create  { username }            -> create room, return code
//   room:join    { code, username }      -> join an existing room
//   room:leave   {}                      -> leave current room
//   room:sync    { isPlaying, currentTime } (host only) -> broadcast playback
//   room:request-sync {}                 -> ask server for host's last state
//   room:lock    { locked }              (host only) -> lock/unlock room
//   room:kick    { targetId }            (host only) -> kick a participant
//
// Events (server -> client):
//   room:created      { room }
//   room:joined       { room }
//   room:error        { error }
//   room:participants [participants]
//   room:playback     { isPlaying, currentTime, updatedAt }
//   room:host-changed { hostId }
//   room:kicked       {}                 (sent to the kicked socket)
//   room:locked       { locked }
// ---------------------------------------------------------------------------

import { config } from '../config/index.js';
import { roomStore } from '../utils/roomStore.js';
import {
  generateUsername,
  generateColor,
  sanitizeUsername,
} from '../utils/identity.js';

export function registerRoomHandlers(io, socket) {
  socket.data.room = { code: null };

  // ----- Create a room ------------------------------------------------------
  socket.on('room:create', (payload = {}) => {
    const username = sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();

    const room = roomStore.createRoom(socket.id, username, color);
    socket.data.room.code = room.code;
    socket.join(room.code);

    socket.emit('room:created', { room: serializeRoom(room, socket.id) });
    broadcastParticipants(io, room.code);
  });

  // ----- Join a room --------------------------------------------------------
  socket.on('room:join', (payload = {}) => {
    const code = String(payload.code || '').toUpperCase();
    const username = sanitizeUsername(payload.username) || generateUsername();
    const color = generateColor();

    const result = roomStore.addParticipant(
      code,
      socket.id,
      username,
      color,
      config.maxParticipantsPerRoom
    );
    if (!result.ok) {
      socket.emit('room:error', { error: result.error });
      return;
    }

    socket.data.room.code = result.room.code;
    socket.join(result.room.code);

    socket.emit('room:joined', { room: serializeRoom(result.room, socket.id) });

    // Send the joining participant the host's current playback state.
    socket.emit('room:playback', result.room.playback);

    broadcastParticipants(io, result.room.code);
  });

  // ----- Leave a room -------------------------------------------------------
  socket.on('room:leave', () => {
    handleLeave(io, socket);
  });

  // ----- Host broadcasts playback state (play/pause/seek) -------------------
  socket.on('room:sync', (payload = {}) => {
    const code = socket.data.room.code;
    const room = roomStore.getRoom(code);
    if (!room) return;
    if (room.hostId !== socket.id) return; // only host can drive sync

    const playback = {
      isPlaying: Boolean(payload.isPlaying),
      currentTime: Number(payload.currentTime) || 0,
    };
    const updated = roomStore.updatePlayback(code, playback);
    // Broadcast to everyone else in the room.
    socket.to(code).emit('room:playback', updated);
  });

  // ----- Participant requests latest host state ("Sync to host") -----------
  socket.on('room:request-sync', () => {
    const code = socket.data.room.code;
    const room = roomStore.getRoom(code);
    if (!room) return;
    socket.emit('room:playback', room.playback);
  });

  // ----- Host locks/unlocks the room ---------------------------------------
  socket.on('room:lock', (payload = {}) => {
    const code = socket.data.room.code;
    const room = roomStore.getRoom(code);
    if (!room || room.hostId !== socket.id) return;
    roomStore.setLocked(code, payload.locked);
    io.to(code).emit('room:locked', { locked: room.locked });
  });

  // ----- Host kicks a participant ------------------------------------------
  socket.on('room:kick', (payload = {}) => {
    const code = socket.data.room.code;
    const room = roomStore.getRoom(code);
    if (!room || room.hostId !== socket.id) return;

    const targetId = payload.targetId;
    if (!targetId || targetId === socket.id) return;
    if (!room.participants.has(targetId)) return;

    // Notify and disconnect the target from the room.
    io.to(targetId).emit('room:kicked', {});
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.leave(code);
      targetSocket.data.room.code = null;
    }
    roomStore.removeParticipant(code, targetId);
    broadcastParticipants(io, code);
  });

  // ----- Disconnect cleanup -------------------------------------------------
  socket.on('disconnect', () => {
    handleLeave(io, socket);
  });
}

// --------------------------- helpers ---------------------------------------

function handleLeave(io, socket) {
  const code = socket.data.room?.code;
  if (!code) return;

  const { room, newHostId } = roomStore.removeParticipant(code, socket.id);
  socket.leave(code);
  socket.data.room.code = null;

  if (room) {
    if (newHostId) {
      io.to(code).emit('room:host-changed', { hostId: newHostId });
    }
    broadcastParticipants(io, code);
  }
}

function broadcastParticipants(io, code) {
  const room = roomStore.getRoom(code);
  if (!room) return;
  io.to(code).emit('room:participants', {
    hostId: room.hostId,
    locked: room.locked,
    participants: roomStore.participantList(code),
  });
}

function serializeRoom(room, requesterId) {
  return {
    code: room.code,
    hostId: room.hostId,
    locked: room.locked,
    isHost: room.hostId === requesterId,
    participants: Array.from(room.participants.values()),
  };
}
