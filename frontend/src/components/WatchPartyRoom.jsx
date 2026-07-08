// ---------------------------------------------------------------------------
// WatchPartyRoom — Fixed 10-slot watch party grid displayed below the stream.
// Users can create/join a room and video/audio call together while watching.
// Shows a 5x2 grid (desktop) or 3+2+... (mobile) with empty slot placeholders.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, sanitizeRoomCode, waitForSocketConnection } from '../lib/socket.js';
import { useSocket } from '../hooks/useSocket.js';
import {
  getStoredUsername,
  setStoredUsername,
  copyToClipboard,
} from '../lib/utils.js';
import { showToast } from './Toast.jsx';
import RoomCodeDisplay from './RoomCodeDisplay.jsx';

const MAX_SLOTS = 10;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// ---------------------------------------------------------------------------
// ParticipantTile — one user's video/avatar tile
// ---------------------------------------------------------------------------
function ParticipantTile({ stream, username, isLocal, mode, micMuted, camOff, speaking, volume }) {
  const mediaRef = useRef(null);
  const gainNodeRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);

  useEffect(() => {
    if (mediaRef.current && stream) mediaRef.current.srcObject = stream;
  }, [stream]);

  // Apply volume control via Web Audio GainNode for remote participants
  useEffect(() => {
    if (isLocal || !stream || volume === undefined) return;

    // For video elements, just set the volume directly
    if (mediaRef.current && mediaRef.current.tagName === 'VIDEO') {
      mediaRef.current.volume = volume;
      return;
    }

    // For audio elements, also set volume directly (simpler and more reliable)
    if (mediaRef.current && mediaRef.current.tagName === 'AUDIO') {
      mediaRef.current.volume = volume;
    }
  }, [volume, isLocal, stream]);

  const showVideo = stream && mode === 'video' && !camOff;
  const initial = (username || 'U').charAt(0).toUpperCase();

  return (
    <div className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--bg-tertiary)] transition-all duration-200 ${speaking ? 'speaking-border' : 'border border-[var(--border-primary)]'}`}>
      {showVideo ? (
        <video ref={mediaRef} className="h-full w-full object-cover" autoPlay playsInline muted={isLocal} />
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-muted)] text-lg font-bold text-[var(--accent)]">
            {initial}
          </div>
          {stream && <audio ref={mediaRef} autoPlay muted={isLocal} className="hidden" />}
        </div>
      )}

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4">
        <span className="truncate text-xs font-medium text-white/90">
          {isLocal ? `${username} (you)` : username}
        </span>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${micMuted ? 'bg-red-500/80' : 'bg-[var(--accent)]/80'}`}>
          {micMuted ? (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </span>
      </div>

      {/* Speaking indicator */}
      {speaking && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-[var(--accent)] px-1.5 py-0.5">
          <span className="flex gap-[2px]">
            <span className="h-2 w-[2px] animate-pulse rounded-full bg-white" style={{ animationDelay: '0ms' }} />
            <span className="h-2.5 w-[2px] animate-pulse rounded-full bg-white" style={{ animationDelay: '150ms' }} />
            <span className="h-1.5 w-[2px] animate-pulse rounded-full bg-white" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptySlotTile — placeholder for unfilled slots
// ---------------------------------------------------------------------------
function EmptySlotTile() {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--border-secondary)] bg-[var(--bg-tertiary)]/50">
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-secondary)] text-[var(--text-muted)]">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <span className="text-[10px] font-medium text-[var(--text-muted)]">Empty Slot</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WatchPartyRoom — Main exported component
// ---------------------------------------------------------------------------
const ROOM_CODE_LEN = 6;
const JOIN_TIMEOUT_MS = 15000;

export default function WatchPartyRoom({ partyCode = '' }) {
  const { connected } = useSocket();
  const username = getStoredUsername() || 'Guest';
  const [nameInput, setNameInput] = useState(getStoredUsername());

  // Room state
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [locked, setLocked] = useState(false);
  const [joinCode, setJoinCode] = useState(() => sanitizeRoomCode(partyCode));
  const [busy, setBusy] = useState(false);
  const [lobbyError, setLobbyError] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const roomRef = useRef(null);
  const joinTimeoutRef = useRef(null);
  const autoJoinAttemptedRef = useRef(false);

  // Call state
  const [inCall, setInCall] = useState(false);
  const [callMode, setCallMode] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [callParticipants, setCallParticipants] = useState([]);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [forceMuted, setForceMuted] = useState(false);
  const [callError, setCallError] = useState(null);

  // Call volume control (0.0 to 1.0) — controls remote participants' audio
  const [callVolume, setCallVolume] = useState(0.75);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const inCallRef = useRef(false);
  useEffect(() => { inCallRef.current = inCall; }, [inCall]);

  // Speaking detection
  const [speakingIds, setSpeakingIds] = useState(new Set());
  const monitorsRef = useRef(new Map());
  const rafIdRef = useRef(null);
  const SPEAK_THRESHOLD = 0.015;
  const HANGOVER_FRAMES = 12;

  const isHost = hostId === socket.id;
  const mySocketId = socket.id;

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    const code = sanitizeRoomCode(partyCode);
    if (code) setJoinCode(code);
  }, [partyCode]);

  // Auto-join when opened via invite link (?party=CODE).
  useEffect(() => {
    const code = sanitizeRoomCode(partyCode);
    if (
      autoJoinAttemptedRef.current ||
      room ||
      busy ||
      code.length !== ROOM_CODE_LEN
    ) {
      return;
    }
    autoJoinAttemptedRef.current = true;
    const u = (nameInput || '').trim() || 'Guest';
    setStoredUsername(u);
    setLobbyError(null);
    setBusy(true);
    startJoinTimeout();
    waitForSocketConnection()
      .then(() => socket.emit('proom:join', { code, username: u }))
      .catch((err) => {
        clearJoinTimeout();
        setBusy(false);
        const msg = err.message || 'Could not connect to the server';
        setLobbyError(msg);
        showToast(msg, 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyCode, room, busy]);

  function clearJoinTimeout() {
    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }

  function startJoinTimeout() {
    clearJoinTimeout();
    joinTimeoutRef.current = setTimeout(() => {
      setBusy(false);
      const msg = 'Join timed out. Check the code and your connection, then try again.';
      setLobbyError(msg);
      showToast(msg, 'error');
    }, JOIN_TIMEOUT_MS);
  }

  // ---- Audio monitoring ----
  function monitorStream(id, stream) {
    if (monitorsRef.current.has(id)) return;
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      monitorsRef.current.set(id, { audioCtx, analyser, source, dataArray, smoothedLevel: 0, hangover: 0 });
    } catch (err) {
      console.warn('[watchparty] audio monitor error', err);
    }
  }

  function stopMonitor(id) {
    const m = monitorsRef.current.get(id);
    if (!m) return;
    try { m.source.disconnect(); m.audioCtx.close(); } catch (_) {}
    monitorsRef.current.delete(id);
  }

  function stopAllMonitors() {
    if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    monitorsRef.current.forEach((_, id) => stopMonitor(id));
    monitorsRef.current.clear();
    setSpeakingIds(new Set());
  }

  function startDetectionLoop() {
    function tick() {
      const newSpeaking = new Set();
      monitorsRef.current.forEach((monitor, id) => {
        const { analyser, dataArray } = monitor;
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const n = (dataArray[i] - 128) / 128;
          sum += n * n;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const alpha = 0.3;
        monitor.smoothedLevel = alpha * rms + (1 - alpha) * monitor.smoothedLevel;
        if (monitor.smoothedLevel > SPEAK_THRESHOLD) {
          monitor.hangover = HANGOVER_FRAMES;
          newSpeaking.add(id);
        } else if (monitor.hangover > 0) {
          monitor.hangover--;
          newSpeaking.add(id);
        }
      });
      setSpeakingIds((prev) => {
        if (prev.size !== newSpeaking.size) return newSpeaking;
        for (const id of newSpeaking) { if (!prev.has(id)) return newSpeaking; }
        return prev;
      });
      rafIdRef.current = requestAnimationFrame(tick);
    }
    rafIdRef.current = requestAnimationFrame(tick);
  }

  // ---- Room socket listeners ----
  useEffect(() => {
    function applyRoom(r) { setRoom(r); setMembers(r.members || []); setHostId(r.hostId); setLocked(Boolean(r.locked)); }
    function onCreated({ room: r }) {
      clearJoinTimeout();
      setBusy(false);
      setLobbyError(null);
      applyRoom(r);
      showToast(`Room created — code ${r.code}`, 'success');
    }
    function onJoined({ room: r }) {
      clearJoinTimeout();
      setBusy(false);
      setLobbyError(null);
      applyRoom(r);
      showToast(`Joined room ${r.code}`, 'success');
    }
    function onError({ error }) {
      clearJoinTimeout();
      setBusy(false);
      const msg = error || 'Room error';
      setLobbyError(msg);
      showToast(msg, 'error');
    }
    function onMembers({ hostId: h, locked: l, members: m }) { setHostId(h); setLocked(Boolean(l)); setMembers(m || []); }
    function onHostChanged({ hostId: h }) { setHostId(h); if (h === socket.id) showToast('You are now the host', 'success'); }
    function onLocked({ locked: l }) { setLocked(Boolean(l)); }
    function onKicked() { showToast('You were removed from the room', 'error'); hardLeave(); }

    socket.on('proom:created', onCreated);
    socket.on('proom:joined', onJoined);
    socket.on('proom:error', onError);
    socket.on('proom:members', onMembers);
    socket.on('proom:host-changed', onHostChanged);
    socket.on('proom:locked', onLocked);
    socket.on('proom:kicked', onKicked);

    return () => {
      socket.off('proom:created', onCreated);
      socket.off('proom:joined', onJoined);
      socket.off('proom:error', onError);
      socket.off('proom:members', onMembers);
      socket.off('proom:host-changed', onHostChanged);
      socket.off('proom:locked', onLocked);
      socket.off('proom:kicked', onKicked);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearJoinTimeout();
      stopAllMonitors();
      teardownCall();
      if (roomRef.current) socket.emit('proom:leave');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Monitor remote streams
  useEffect(() => {
    remoteStreams.forEach((stream, peerId) => {
      if (!monitorsRef.current.has(peerId) && stream) monitorStream(peerId, stream);
    });
    monitorsRef.current.forEach((_, id) => {
      if (id !== 'local' && !remoteStreams.has(id)) stopMonitor(id);
    });
  }, [remoteStreams]);

  // ---- Peer connection ----
  const createPeerConnection = useCallback((peerId, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('proom:ice', { to: peerId, candidate: e.candidate }); };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      peersRef.current.set(peerId, { ...peersRef.current.get(peerId), stream });
      setRemoteStreams((prev) => new Map(prev).set(peerId, stream));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        pc.close(); peersRef.current.delete(peerId);
        setRemoteStreams((prev) => { const n = new Map(prev); n.delete(peerId); return n; });
      }
    };
    peersRef.current.set(peerId, { pc, stream: null });
    if (isInitiator) {
      pc.createOffer().then((o) => pc.setLocalDescription(o))
        .then(() => socket.emit('proom:offer', { to: peerId, offer: pc.localDescription }))
        .catch((err) => console.error('[watchparty] offer error', err));
    }
    return pc;
  }, []);

  // Call socket listeners
  useEffect(() => {
    function onParticipants(list) { setCallParticipants(list); }
    function onUserJoined({ id }) { if (id !== socket.id && inCallRef.current) createPeerConnection(id, true); }
    function onUserLeft({ id }) {
      const peer = peersRef.current.get(id);
      if (peer) { peer.pc.close(); peersRef.current.delete(id); }
      setRemoteStreams((prev) => { const n = new Map(prev); n.delete(id); return n; });
    }
    function onOffer({ from, offer }) {
      const pc = createPeerConnection(from, false);
      pc.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => pc.createAnswer())
        .then((a) => pc.setLocalDescription(a))
        .then(() => socket.emit('proom:answer', { to: from, answer: pc.localDescription }))
        .catch((err) => console.error('[watchparty] answer error', err));
    }
    function onAnswer({ from, answer }) {
      const peer = peersRef.current.get(from);
      if (peer) peer.pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
    }
    function onIce({ from, candidate }) {
      const peer = peersRef.current.get(from);
      if (peer) peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
    function onMicState({ id, muted }) { setCallParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, micMuted: muted } : p))); }
    function onCamState({ id, camOff: off }) { setCallParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, camOff: off } : p))); }
    function onForceMuted({ muted }) {
      setForceMuted(Boolean(muted));
      if (muted && localStreamRef.current) {
        const t = localStreamRef.current.getAudioTracks()[0];
        if (t) t.enabled = false;
        setMicMuted(true);
        showToast('You were muted by the host', 'warning');
      }
    }
    function onCallEnded() { showToast('The host ended the call', 'warning'); teardownCall(); }

    socket.on('proom:call-participants', onParticipants);
    socket.on('proom:call-user-joined', onUserJoined);
    socket.on('proom:call-user-left', onUserLeft);
    socket.on('proom:offer', onOffer);
    socket.on('proom:answer', onAnswer);
    socket.on('proom:ice', onIce);
    socket.on('proom:mic-state', onMicState);
    socket.on('proom:cam-state', onCamState);
    socket.on('proom:force-muted', onForceMuted);
    socket.on('proom:call-ended', onCallEnded);

    return () => {
      socket.off('proom:call-participants', onParticipants);
      socket.off('proom:call-user-joined', onUserJoined);
      socket.off('proom:call-user-left', onUserLeft);
      socket.off('proom:offer', onOffer);
      socket.off('proom:answer', onAnswer);
      socket.off('proom:ice', onIce);
      socket.off('proom:mic-state', onMicState);
      socket.off('proom:cam-state', onCamState);
      socket.off('proom:force-muted', onForceMuted);
      socket.off('proom:call-ended', onCallEnded);
    };
  }, [createPeerConnection]);

  // ---- Actions ----
  function persistName() {
    const u = (nameInput || '').trim() || 'Guest';
    setStoredUsername(u);
    return u;
  }

  async function handleCreate() {
    const u = persistName();
    setLobbyError(null);
    setBusy(true);
    startJoinTimeout();
    try {
      await waitForSocketConnection();
      socket.emit('proom:create', { username: u });
    } catch (err) {
      clearJoinTimeout();
      setBusy(false);
      const msg = err.message || 'Could not connect to the server';
      setLobbyError(msg);
      showToast(msg, 'error');
    }
  }

  async function handleJoin(e) {
    e?.preventDefault();
    const code = sanitizeRoomCode(joinCode);
    if (code.length !== ROOM_CODE_LEN) {
      const msg = `Enter a valid ${ROOM_CODE_LEN}-character room code`;
      setLobbyError(msg);
      showToast(msg, 'error');
      return;
    }
    const u = persistName();
    setLobbyError(null);
    setBusy(true);
    startJoinTimeout();
    try {
      await waitForSocketConnection();
      socket.emit('proom:join', { code, username: u });
    } catch (err) {
      clearJoinTimeout();
      setBusy(false);
      const msg = err.message || 'Could not connect to the server';
      setLobbyError(msg);
      showToast(msg, 'error');
    }
  }

  function teardownCall() {
    stopAllMonitors();
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    setRemoteStreams(new Map());
    setInCall(false);
    setCallMode(null);
    setCallParticipants([]);
    setMicMuted(false);
    setCamOff(false);
  }

  function hardLeave() { teardownCall(); socket.emit('proom:leave'); setRoom(null); setMembers([]); setHostId(null); setLocked(false); setJoinCode(''); }
  function leaveRoom() { hardLeave(); showToast('You left the room', 'success'); }

  async function joinCall(mode) {
    if (!room) return;
    setConnecting(true);
    setCallError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' });
      localStreamRef.current = stream;
      setCallMode(mode);
      setInCall(true);
      inCallRef.current = true;
      setCamOff(mode === 'audio');
      socket.emit('proom:call-join', { mode });
      monitorStream('local', stream);
      startDetectionLoop();
    } catch (err) {
      console.error('[watchparty] getUserMedia', err);
      setCallError('Could not access camera/microphone. Check permissions.');
    } finally {
      setConnecting(false);
    }
  }

  function leaveCall() { teardownCall(); socket.emit('proom:call-leave'); }

  function toggleMic() {
    if (!localStreamRef.current) return;
    if (forceMuted) { showToast('You are muted by the host', 'warning'); return; }
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) { const next = !micMuted; track.enabled = !next; setMicMuted(next); socket.emit('proom:mic', { muted: next }); }
  }

  function toggleCam() {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (track) { const next = !camOff; track.enabled = !next; setCamOff(next); socket.emit('proom:cam', { camOff: next }); }
  }

  async function copyCode() {
    if (!room) return;
    const inviteUrl = `${window.location.origin}/watch?party=${room.code}`;
    const ok = await copyToClipboard(inviteUrl);
    if (ok) {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
    showToast(ok ? 'Invite link copied!' : 'Copy failed', ok ? 'success' : 'error');
  }

  function isSpeaking(participantId, isMuted) {
    if (isMuted) return false;
    if (participantId === mySocketId) return speakingIds.has('local') && !micMuted;
    return speakingIds.has(participantId);
  }

  // ========== RENDER ==========

  // Lobby — not in a room yet
  if (!room) {
    return (
      <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-1 w-1 rounded-full bg-[var(--accent)]" />
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Watch Party Room</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Create or join a room to watch together with up to 10 friends. Video and audio call while enjoying the stream.
        </p>

        <div className="max-w-md mx-auto space-y-4">
          {!connected && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-200">
              Connecting to server…
            </div>
          )}
          {lobbyError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300" role="alert">
              {lobbyError}
            </div>
          )}
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name"
            maxLength={24}
            className="w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
          />
          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[var(--accent-dark)] active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Creating...' : 'Create a Room'}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border-primary)]" />
            <span className="text-xs text-[var(--text-muted)]">or join existing</span>
            <div className="h-px flex-1 bg-[var(--border-primary)]" />
          </div>

          <form onSubmit={handleJoin} className="space-y-3">
            <label className="type-label block text-center text-[var(--text-muted)]">Enter room code</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(sanitizeRoomCode(e.target.value))}
              placeholder="ABC123"
              maxLength={ROOM_CODE_LEN}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              className="room-code-input w-full rounded-xl border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-4 py-3.5 text-[var(--text-primary)] outline-none placeholder:tracking-normal placeholder:font-normal placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-muted)] px-5 py-2.5 text-sm font-bold text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20 active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? 'Joining...' : 'Join Room'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---- In a room ----
  const otherCallParticipants = callParticipants.filter((p) => p.id !== mySocketId);
  const myCallParticipant = callParticipants.find((p) => p.id === mySocketId);
  const totalInCall = callParticipants.length;
  const emptySlots = Math.max(0, MAX_SLOTS - totalInCall);

  return (
    <div className="rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] overflow-hidden">
      {/* Header */}
      <div className="border-b border-[var(--border-primary)] px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="h-5 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
            <h2 className="type-h3 truncate text-[var(--text-primary)]">Watch Party</h2>
            <span className="shrink-0 rounded-full bg-[var(--accent-muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
              {totalInCall}/{MAX_SLOTS}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isHost && (
              <span className="rounded-md bg-yellow-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-400">
                Host
              </span>
            )}
            <button
              type="button"
              onClick={leaveRoom}
              className="min-h-[36px] rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.98]"
            >
              Leave
            </button>
          </div>
        </div>

        <RoomCodeDisplay code={room.code} onCopy={copyCode} copied={codeCopied} />
      </div>

      {/* Call area or Join CTA */}
      <div className="p-4">
        {!inCall ? (
          <div className="flex flex-col items-center gap-4 py-6">
            {callError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-300">
                {callError}
              </div>
            )}
            <p className="text-sm text-[var(--text-secondary)]">Join the call to watch together with others</p>
            <div className="flex gap-3">
              <button
                onClick={() => joinCall('video')}
                disabled={connecting}
                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-[var(--accent-dark)] active:scale-[0.98] disabled:opacity-60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {connecting ? 'Connecting...' : 'Video Call'}
              </button>
              <button
                onClick={() => joinCall('audio')}
                disabled={connecting}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-5 py-2.5 text-sm font-bold text-[var(--text-primary)] transition-all hover:bg-[var(--bg-card-hover)] active:scale-[0.98] disabled:opacity-60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                {connecting ? 'Connecting...' : 'Audio Call'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 5x2 Grid (desktop) / responsive on mobile */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" style={{ aspectRatio: 'auto' }}>
              {/* Local user tile */}
              {myCallParticipant && (
                <div className="aspect-[4/3]">
                  <ParticipantTile
                    stream={localStreamRef.current}
                    username={username}
                    isLocal
                    mode={callMode}
                    micMuted={micMuted}
                    camOff={camOff}
                    speaking={isSpeaking(mySocketId, micMuted)}
                  />
                </div>
              )}
              {/* Remote participants */}
              {otherCallParticipants.map((p) => (
                <div key={p.id} className="aspect-[4/3]">
                  <ParticipantTile
                    stream={remoteStreams.get(p.id)}
                    username={p.username}
                    isLocal={false}
                    mode={p.mode}
                    micMuted={p.micMuted}
                    camOff={p.camOff}
                    speaking={isSpeaking(p.id, p.micMuted)}
                    volume={callVolume}
                  />
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-[4/3]">
                  <EmptySlotTile />
                </div>
              ))}
            </div>

            {/* Control toolbar */}
            <div className="flex items-center justify-center gap-3 pt-2 border-t border-[var(--border-primary)]">
              <button
                onClick={toggleMic}
                title={micMuted ? 'Unmute' : 'Mute'}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.95] ${
                  !micMuted
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {!micMuted ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  )}
                </svg>
                <span className="hidden sm:inline">{micMuted ? 'Unmute' : 'Mic On'}</span>
              </button>

              {callMode === 'video' && (
                <button
                  onClick={toggleCam}
                  title={camOff ? 'Camera on' : 'Camera off'}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.95] ${
                    !camOff
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-red-500/15 text-red-400 border border-red-500/30'
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {!camOff ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
                    )}
                  </svg>
                  <span className="hidden sm:inline">{camOff ? 'Cam Off' : 'Camera On'}</span>
                </button>
              )}

              <button
                onClick={leaveCall}
                title="Leave call"
                className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-600 active:scale-[0.95]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
                <span className="hidden sm:inline">Leave Call</span>
              </button>

              <button
                onClick={copyCode}
                title="Invite friends"
                className="flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20 active:scale-[0.95]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span className="hidden sm:inline">Invite Friends</span>
              </button>
            </div>

            {/* Call Audio Volume Control */}
            <div className="flex items-center gap-3 pt-3 border-t border-[var(--border-primary)]">
              <button
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                title="Adjust call volume"
                className="flex items-center gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-card-hover)] active:scale-[0.95]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {callVolume === 0 ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  ) : callVolume < 0.5 ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  )}
                </svg>
                <span className="text-xs">Call Volume</span>
              </button>

              {showVolumeSlider && (
                <div className="flex flex-1 items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(callVolume * 100)}
                    onChange={(e) => setCallVolume(Number(e.target.value) / 100)}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-[var(--border-secondary)] accent-[var(--accent)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--accent)] [&::-moz-range-thumb]:border-0"
                  />
                  <span className="shrink-0 w-9 text-right text-xs font-semibold text-[var(--text-secondary)]">
                    {Math.round(callVolume * 100)}%
                  </span>
                </div>
              )}

              {!showVolumeSlider && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span>Volume: {Math.round(callVolume * 100)}%</span>
                  {callVolume === 0 && <span className="text-red-400">(Muted)</span>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
