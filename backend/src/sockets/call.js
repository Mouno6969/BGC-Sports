// ---------------------------------------------------------------------------
// WebRTC Peer-to-Peer Call Signaling via Socket.IO.
//
// Supports both video and audio-only calls. No external service (LiveKit)
// required — uses browser-native WebRTC with Socket.IO as the signaling layer.
//
// Events (client -> server):
//   call:join        { channelId, username, mode }  -> join a call room
//   call:leave       { channelId }                  -> leave the call room
//   call:offer       { to, offer }                  -> send SDP offer to peer
//   call:answer      { to, answer }                 -> send SDP answer to peer
//   call:ice         { to, candidate }              -> send ICE candidate to peer
//   call:toggle-mic  { channelId, muted }           -> broadcast mic state
//   call:toggle-cam  { channelId, camOff }          -> broadcast cam state
//
// Events (server -> client):
//   call:participants  [{ id, username, mode, micMuted, camOff }]
//   call:user-joined   { id, username, mode }
//   call:user-left     { id, username }
//   call:offer         { from, offer }
//   call:answer        { from, answer }
//   call:ice           { from, candidate }
//   call:mic-state     { id, muted }
//   call:cam-state     { id, camOff }
// ---------------------------------------------------------------------------

// channelId -> Map<socketId, { username, mode, micMuted, camOff }>
const callRooms = new Map();

function getRoom(channelId) {
  if (!callRooms.has(channelId)) {
    callRooms.set(channelId, new Map());
  }
  return callRooms.get(channelId);
}

function broadcastParticipants(io, channelId) {
  const room = callRooms.get(channelId);
  if (!room) return;
  const list = Array.from(room.entries()).map(([id, data]) => ({
    id,
    username: data.username,
    mode: data.mode,
    micMuted: data.micMuted,
    camOff: data.camOff,
  }));
  io.to(`call:${channelId}`).emit('call:participants', list);
}

export function registerCallHandlers(io, socket) {
  socket.data.call = { channelId: null };

  socket.on('call:join', ({ channelId, username, mode }) => {
    if (!channelId || !username) return;
    const callMode = mode === 'video' ? 'video' : 'audio';

    // Leave previous call if any
    if (socket.data.call.channelId) {
      leaveCall(io, socket);
    }

    socket.data.call.channelId = channelId;
    const room = getRoom(channelId);
    room.set(socket.id, {
      username,
      mode: callMode,
      micMuted: false,
      camOff: callMode === 'audio',
    });

    socket.join(`call:${channelId}`);

    // Notify existing participants about the new user
    socket.to(`call:${channelId}`).emit('call:user-joined', {
      id: socket.id,
      username,
      mode: callMode,
    });

    // Send current participants to the joiner
    broadcastParticipants(io, channelId);
  });

  socket.on('call:leave', () => {
    leaveCall(io, socket);
  });

  // WebRTC Signaling: relay offer
  socket.on('call:offer', ({ to, offer }) => {
    if (!to || !offer) return;
    io.to(to).emit('call:offer', { from: socket.id, offer });
  });

  // WebRTC Signaling: relay answer
  socket.on('call:answer', ({ to, answer }) => {
    if (!to || !answer) return;
    io.to(to).emit('call:answer', { from: socket.id, answer });
  });

  // WebRTC Signaling: relay ICE candidate
  socket.on('call:ice', ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit('call:ice', { from: socket.id, candidate });
  });

  // Mic toggle broadcast
  socket.on('call:toggle-mic', ({ channelId, muted }) => {
    const room = callRooms.get(channelId);
    if (!room || !room.has(socket.id)) return;
    room.get(socket.id).micMuted = Boolean(muted);
    socket.to(`call:${channelId}`).emit('call:mic-state', {
      id: socket.id,
      muted: Boolean(muted),
    });
  });

  // Camera toggle broadcast
  socket.on('call:toggle-cam', ({ channelId, camOff }) => {
    const room = callRooms.get(channelId);
    if (!room || !room.has(socket.id)) return;
    room.get(socket.id).camOff = Boolean(camOff);
    socket.to(`call:${channelId}`).emit('call:cam-state', {
      id: socket.id,
      camOff: Boolean(camOff),
    });
  });

  socket.on('disconnect', () => {
    leaveCall(io, socket);
  });
}

function leaveCall(io, socket) {
  const channelId = socket.data.call?.channelId;
  if (!channelId) return;

  const room = callRooms.get(channelId);
  const userData = room?.get(socket.id);

  if (room) {
    room.delete(socket.id);
    if (room.size === 0) {
      callRooms.delete(channelId);
    }
  }

  socket.leave(`call:${channelId}`);
  socket.data.call.channelId = null;

  // Notify remaining participants
  socket.to(`call:${channelId}`).emit('call:user-left', {
    id: socket.id,
    username: userData?.username || 'Unknown',
  });

  broadcastParticipants(io, channelId);
}
