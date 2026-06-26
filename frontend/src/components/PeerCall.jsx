// ---------------------------------------------------------------------------
// PeerCall — WebRTC peer-to-peer calling component with video and audio modes.
// Uses Socket.IO for signaling (offer/answer/ICE). No external service needed.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// ---------------------------------------------------------------------------
// ParticipantTile — renders a single participant (video or avatar).
// ---------------------------------------------------------------------------
function ParticipantTile({ stream, username, isLocal, mode, micMuted, camOff }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const showVideo = stream && mode === 'video' && !camOff;
  const initial = (username || 'U').charAt(0).toUpperCase();

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-ink-700/50 ring-1 ring-ink-600/50 transition-all duration-300">
      {showVideo ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted={isLocal}
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-secondary/20 text-lg font-bold text-white ring-2 ring-ink-500">
            {initial}
          </div>
          {stream && (
            <audio ref={videoRef} autoPlay muted={isLocal} className="hidden" />
          )}
        </div>
      )}
      {/* Name label + mic status */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-5">
        <span className="truncate text-[11px] font-medium text-white/90">
          {isLocal ? `${username} (you)` : username}
        </span>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${micMuted ? 'bg-red-500/80' : 'bg-ink-600/80'}`}>
          {micMuted ? (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="h-3 w-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PeerCall — main component
// ---------------------------------------------------------------------------
export default function PeerCall({ channelId, username }) {
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [callMode, setCallMode] = useState(null); // 'video' | 'audio'
  const [participants, setParticipants] = useState([]);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [error, setError] = useState(null);

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> { pc, stream }
  const [remoteStreams, setRemoteStreams] = useState(new Map()); // peerId -> stream

  // Join a call
  const joinCall = useCallback(async (mode) => {
    if (!channelId || !username) return;
    setConnecting(true);
    setError(null);
    setCallMode(mode);

    try {
      const constraints = {
        audio: true,
        video: mode === 'video',
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      socket.emit('call:join', { channelId, username, mode });
      setJoined(true);
      setCamOff(mode === 'audio');
    } catch (err) {
      console.error('[call] getUserMedia error:', err);
      setError('Could not access camera/microphone. Please check permissions.');
      setCallMode(null);
    } finally {
      setConnecting(false);
    }
  }, [channelId, username]);

  // Leave the call
  const leaveCall = useCallback(() => {
    // Stop local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    // Close all peer connections
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    setRemoteStreams(new Map());

    socket.emit('call:leave');
    setJoined(false);
    setCallMode(null);
    setParticipants([]);
  }, []);

  // Create a peer connection to a remote user
  const createPeerConnection = useCallback((peerId, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:ice', { to: peerId, candidate: event.candidate });
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      peersRef.current.set(peerId, { ...peersRef.current.get(peerId), stream: remoteStream });
      setRemoteStreams((prev) => new Map(prev).set(peerId, remoteStream));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Clean up failed connection
        pc.close();
        peersRef.current.delete(peerId);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
      }
    };

    peersRef.current.set(peerId, { pc, stream: null });

    // If initiator, create and send offer
    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('call:offer', { to: peerId, offer: pc.localDescription });
        })
        .catch((err) => console.error('[call] offer error:', err));
    }

    return pc;
  }, []);

  // Socket event handlers
  useEffect(() => {
    function onParticipants(list) {
      setParticipants(list);
    }

    function onUserJoined({ id }) {
      // New user joined — we initiate the connection (we are the "polite" peer)
      if (id !== socket.id && joined) {
        createPeerConnection(id, true);
      }
    }

    function onUserLeft({ id }) {
      const peer = peersRef.current.get(id);
      if (peer) {
        peer.pc.close();
        peersRef.current.delete(id);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }

    function onOffer({ from, offer }) {
      // Received an offer — create PC and send answer
      const pc = createPeerConnection(from, false);
      pc.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          socket.emit('call:answer', { to: from, answer: pc.localDescription });
        })
        .catch((err) => console.error('[call] answer error:', err));
    }

    function onAnswer({ from, answer }) {
      const peer = peersRef.current.get(from);
      if (peer) {
        peer.pc.setRemoteDescription(new RTCSessionDescription(answer))
          .catch((err) => console.error('[call] setRemoteDescription error:', err));
      }
    }

    function onIce({ from, candidate }) {
      const peer = peersRef.current.get(from);
      if (peer) {
        peer.pc.addIceCandidate(new RTCIceCandidate(candidate))
          .catch((err) => console.error('[call] addIceCandidate error:', err));
      }
    }

    function onMicState({ id, muted }) {
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, micMuted: muted } : p))
      );
    }

    function onCamState({ id, camOff: off }) {
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, camOff: off } : p))
      );
    }

    socket.on('call:participants', onParticipants);
    socket.on('call:user-joined', onUserJoined);
    socket.on('call:user-left', onUserLeft);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice', onIce);
    socket.on('call:mic-state', onMicState);
    socket.on('call:cam-state', onCamState);

    return () => {
      socket.off('call:participants', onParticipants);
      socket.off('call:user-joined', onUserJoined);
      socket.off('call:user-left', onUserLeft);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
      socket.off('call:mic-state', onMicState);
      socket.off('call:cam-state', onCamState);
    };
  }, [joined, createPeerConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      peersRef.current.forEach(({ pc }) => pc.close());
    };
  }, []);

  // Toggle mic
  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const newMuted = !micMuted;
      audioTrack.enabled = !newMuted;
      setMicMuted(newMuted);
      socket.emit('call:toggle-mic', { channelId, muted: newMuted });
    }
  }, [micMuted, channelId]);

  // Toggle camera
  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      const newCamOff = !camOff;
      videoTrack.enabled = !newCamOff;
      setCamOff(newCamOff);
      socket.emit('call:toggle-cam', { channelId, camOff: newCamOff });
    }
  }, [camOff, channelId]);

  // ----- Not joined: show join buttons ----------------------------------------
  if (!joined) {
    return (
      <div className="animate-fadeIn space-y-4 rounded-2xl border border-ink-600/50 bg-gradient-to-br from-ink-800 to-ink-900 p-5 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-secondary/20">
            <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Join Call</h4>
            <p className="text-[11px] text-slate-400">Talk with others watching this channel</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-300 ring-1 ring-red-500/20">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={() => joinCall('video')}
            disabled={connecting}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {connecting && callMode === 'video' ? 'Connecting...' : 'Video Call'}
          </button>
          <button
            onClick={() => joinCall('audio')}
            disabled={connecting}
            className="btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {connecting && callMode === 'audio' ? 'Connecting...' : 'Audio Call'}
          </button>
        </div>
      </div>
    );
  }

  // ----- In call: show participants and controls ------------------------------
  const otherParticipants = participants.filter((p) => p.id !== socket.id);
  const myParticipant = participants.find((p) => p.id === socket.id);

  return (
    <div className="animate-fadeIn space-y-3 rounded-2xl border border-ink-600/50 bg-gradient-to-br from-ink-800 to-ink-900 p-4 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wide text-white">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {callMode === 'video' ? 'Video Call' : 'Audio Call'}
        </h4>
        <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent ring-1 ring-accent/20">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseLive" />
          {participants.length} in call
        </span>
      </div>

      {/* Participant grid */}
      <div className={`grid gap-2 ${participants.length <= 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {/* Local participant */}
        {myParticipant && (
          <ParticipantTile
            stream={localStreamRef.current}
            username={username}
            isLocal={true}
            mode={callMode}
            micMuted={micMuted}
            camOff={camOff}
          />
        )}
        {/* Remote participants */}
        {otherParticipants.map((p) => (
          <ParticipantTile
            key={p.id}
            stream={remoteStreams.get(p.id)}
            username={p.username}
            isLocal={false}
            mode={p.mode}
            micMuted={p.micMuted}
            camOff={p.camOff}
          />
        ))}
      </div>

      {/* Empty state */}
      {otherParticipants.length === 0 && (
        <p className="text-center text-xs text-slate-500 italic">
          Waiting for others to join...
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 pt-1">
        {/* Mic toggle */}
        <button
          onClick={toggleMic}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
            !micMuted
              ? 'bg-ink-600 text-white hover:bg-ink-500'
              : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/30'
          }`}
          title={micMuted ? 'Unmute' : 'Mute'}
        >
          {!micMuted ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          )}
        </button>

        {/* Camera toggle (only for video calls) */}
        {callMode === 'video' && (
          <button
            onClick={toggleCam}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
              !camOff
                ? 'bg-ink-600 text-white hover:bg-ink-500'
                : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/30'
            }`}
            title={camOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {!camOff ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
          </button>
        )}

        {/* Leave call */}
        <button
          onClick={leaveCall}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500 text-white transition-all duration-200 hover:bg-red-600 active:scale-[0.95]"
          title="Leave call"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
