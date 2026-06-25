// ---------------------------------------------------------------------------
// useRoom — manages watch-party room state via Socket.IO.
//
// Responsibilities:
//   - create / join / leave a room
//   - track participant list, host id, locked state
//   - expose host playback broadcasting (room:sync) and incoming playback
//   - host actions: lock/unlock, kick
//
// Playback sync uses a callback registration model: the Player registers an
// `onRemotePlayback` handler that this hook calls whenever the host's state
// arrives. The host calls `broadcastPlayback()` on local play/pause/seek.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';

export function useRoom() {
  const [room, setRoom] = useState(null); // { code, hostId, locked, isHost }
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState(null);
  const [kicked, setKicked] = useState(false);

  // Player registers a handler here to receive host playback updates.
  const remotePlaybackHandler = useRef(null);

  const isHost = room ? room.hostId === socket.id : false;

  useEffect(() => {
    function onCreated({ room }) {
      setRoom(room);
      setError(null);
    }
    function onJoined({ room }) {
      setRoom(room);
      setError(null);
    }
    function onError({ error }) {
      setError(error);
    }
    function onParticipants({ hostId, locked, participants }) {
      setParticipants(participants);
      setRoom((prev) => (prev ? { ...prev, hostId, locked } : prev));
    }
    function onHostChanged({ hostId }) {
      setRoom((prev) => (prev ? { ...prev, hostId } : prev));
    }
    function onPlayback(playback) {
      if (remotePlaybackHandler.current) {
        remotePlaybackHandler.current(playback);
      }
    }
    function onLocked({ locked }) {
      setRoom((prev) => (prev ? { ...prev, locked } : prev));
    }
    function onKicked() {
      setKicked(true);
      setRoom(null);
      setParticipants([]);
    }

    socket.on('room:created', onCreated);
    socket.on('room:joined', onJoined);
    socket.on('room:error', onError);
    socket.on('room:participants', onParticipants);
    socket.on('room:host-changed', onHostChanged);
    socket.on('room:playback', onPlayback);
    socket.on('room:locked', onLocked);
    socket.on('room:kicked', onKicked);

    return () => {
      socket.off('room:created', onCreated);
      socket.off('room:joined', onJoined);
      socket.off('room:error', onError);
      socket.off('room:participants', onParticipants);
      socket.off('room:host-changed', onHostChanged);
      socket.off('room:playback', onPlayback);
      socket.off('room:locked', onLocked);
      socket.off('room:kicked', onKicked);
    };
  }, []);

  const createRoom = useCallback((username) => {
    setKicked(false);
    socket.emit('room:create', { username });
  }, []);

  const joinRoom = useCallback((code, username) => {
    setKicked(false);
    socket.emit('room:join', { code, username });
  }, []);

  const leaveRoom = useCallback(() => {
    socket.emit('room:leave');
    setRoom(null);
    setParticipants([]);
  }, []);

  // Host broadcasts playback state to the room.
  const broadcastPlayback = useCallback(
    (isPlaying, currentTime) => {
      if (!room) return;
      socket.emit('room:sync', { isPlaying, currentTime });
    },
    [room]
  );

  // Participant asks the server for the host's latest playback state.
  const requestSync = useCallback(() => {
    socket.emit('room:request-sync');
  }, []);

  const lockRoom = useCallback((locked) => {
    socket.emit('room:lock', { locked });
  }, []);

  const kickParticipant = useCallback((targetId) => {
    socket.emit('room:kick', { targetId });
  }, []);

  // Register the Player's handler for incoming host playback.
  const setRemotePlaybackHandler = useCallback((fn) => {
    remotePlaybackHandler.current = fn;
  }, []);

  return {
    room,
    participants,
    error,
    kicked,
    isHost,
    createRoom,
    joinRoom,
    leaveRoom,
    broadcastPlayback,
    requestSync,
    lockRoom,
    kickParticipant,
    setRemotePlaybackHandler,
  };
}
