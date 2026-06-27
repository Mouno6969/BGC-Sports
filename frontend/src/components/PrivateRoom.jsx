// ---------------------------------------------------------------------------
// PrivateRoom — private room with group chat + room-scoped video/audio call
// and full HOST controls. Replaces the old DM feature.
//
// Flow:
//   1. Lobby: create a room (become host) or join with a code.
//   2. Room: group chat + members list + optional A/V call.
//   3. Host gets a control panel: kick, force-mute, lock, end-call, make-host.
//
// All realtime traffic uses the shared Socket.IO client with `proom:*` events.
// WebRTC media is peer-to-peer (STUN only) and scoped to this room.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import {
  formatTime,
  formatChatText,
  getStoredUsername,
  setStoredUsername,
  copyToClipboard,
} from '../lib/utils.js';
import { showToast } from './Toast.jsx';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// ---------------------------------------------------------------------------
// CallTile — one participant video/avatar tile.
// ---------------------------------------------------------------------------
function CallTile({ stream, username, isLocal, mode, micMuted, camOff }) {
  const mediaRef = useRef(null);
  useEffect(() => {
    if (mediaRef.current && stream) mediaRef.current.srcObject = stream;
  }, [stream]);

  const showVideo = stream && mode === 'video' && !camOff;
  const initial = (username || 'U').charAt(0).toUpperCase();

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-ink-700/50 ring-1 ring-ink-600/50">
      {showVideo ? (
        <video ref={mediaRef} className="h-full w-full object-cover" autoPlay playsInline muted={isLocal} />
      ) : (
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-secondary/20 text-sm font-bold text-white ring-2 ring-ink-500">
            {initial}
          </div>
          {stream && <audio ref={mediaRef} autoPlay muted={isLocal} className="hidden" />}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4">
        <span className="truncate text-[10px] font-medium text-white/90">
          {isLocal ? `${username} (you)` : username}
        </span>
        <span className={`flex h-4 w-4 items-center justify-center rounded-full ${micMuted ? 'bg-red-500/80' : 'bg-ink-600/80'}`}>
          {micMuted ? (
            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="h-2.5 w-2.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </span>
      </div>
    </div>
  );
}

export default function PrivateRoom() {
  // ---- identity ----
  const username = getStoredUsername() || 'Guest';
  const [nameInput, setNameInput] = useState(getStoredUsername());

  // ---- room state ----
  const [room, setRoom] = useState(null);        // { code, hostId, locked, isHost, members }
  const [members, setMembers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [locked, setLocked] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  // ---- chat ----
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const chatRef = useRef(null);

  // ---- call ----
  const [inCall, setInCall] = useState(false);
  const [callMode, setCallMode] = useState(null);   // 'video' | 'audio'
  const [connecting, setConnecting] = useState(false);
  const [callParticipants, setCallParticipants] = useState([]);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [forceMuted, setForceMuted] = useState(false);
  const [callError, setCallError] = useState(null);

  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());               // peerId -> { pc, stream }
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const inCallRef = useRef(false);
  useEffect(() => { inCallRef.current = inCall; }, [inCall]);

  const isHost = hostId === socket.id;
  const mySocketId = socket.id;

  // ================= ROOM lifecycle socket listeners =====================
  useEffect(() => {
    function applyRoom(r) {
      setRoom(r);
      setMembers(r.members || []);
      setHostId(r.hostId);
      setLocked(Boolean(r.locked));
    }
    function onCreated({ room: r }) {
      setBusy(false);
      applyRoom(r);
      setMessages([]);
      showToast(`Room created — code ${r.code}`, 'success');
    }
    function onJoined({ room: r, chat }) {
      setBusy(false);
      applyRoom(r);
      setMessages(chat || []);
      showToast(`Joined room ${r.code}`, 'success');
    }
    function onError({ error }) {
      setBusy(false);
      showToast(error || 'Room error', 'error');
    }
    function onMembers({ hostId: h, locked: l, members: m }) {
      setHostId(h);
      setLocked(Boolean(l));
      setMembers(m || []);
    }
    function onChat(msg) {
      setMessages((prev) => [...prev.slice(-200), msg]);
    }
    function onHostChanged({ hostId: h }) {
      setHostId(h);
      if (h === socket.id) showToast('You are now the host', 'success');
    }
    function onLocked({ locked: l }) {
      setLocked(Boolean(l));
    }
    function onKicked() {
      showToast('You were removed from the room by the host', 'error');
      hardLeave();
    }

    socket.on('proom:created', onCreated);
    socket.on('proom:joined', onJoined);
    socket.on('proom:error', onError);
    socket.on('proom:members', onMembers);
    socket.on('proom:chat', onChat);
    socket.on('proom:host-changed', onHostChanged);
    socket.on('proom:locked', onLocked);
    socket.on('proom:kicked', onKicked);

    return () => {
      socket.off('proom:created', onCreated);
      socket.off('proom:joined', onJoined);
      socket.off('proom:error', onError);
      socket.off('proom:members', onMembers);
      socket.off('proom:chat', onChat);
      socket.off('proom:host-changed', onHostChanged);
      socket.off('proom:locked', onLocked);
      socket.off('proom:kicked', onKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leave the room when the component unmounts (tab switch / navigation).
  useEffect(() => {
    return () => {
      teardownCall();
      socket.emit('proom:leave');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll chat.
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // ===================== CALL: peer connection logic ======================
  const createPeerConnection = useCallback((peerId, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('proom:ice', { to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      peersRef.current.set(peerId, { ...peersRef.current.get(peerId), stream });
      setRemoteStreams((prev) => new Map(prev).set(peerId, stream));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        pc.close();
        peersRef.current.delete(peerId);
        setRemoteStreams((prev) => { const n = new Map(prev); n.delete(peerId); return n; });
      }
    };
    peersRef.current.set(peerId, { pc, stream: null });

    if (isInitiator) {
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => socket.emit('proom:offer', { to: peerId, offer: pc.localDescription }))
        .catch((err) => console.error('[proom] offer error', err));
    }
    return pc;
  }, []);

  // CALL socket listeners.
  useEffect(() => {
    function onParticipants(list) { setCallParticipants(list); }
    function onUserJoined({ id }) {
      if (id !== socket.id && inCallRef.current) createPeerConnection(id, true);
    }
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
        .catch((err) => console.error('[proom] answer error', err));
    }
    function onAnswer({ from, answer }) {
      const peer = peersRef.current.get(from);
      if (peer) peer.pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
    }
    function onIce({ from, candidate }) {
      const peer = peersRef.current.get(from);
      if (peer) peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
    function onMicState({ id, muted }) {
      setCallParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, micMuted: muted } : p)));
    }
    function onCamState({ id, camOff: off }) {
      setCallParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, camOff: off } : p)));
    }
    function onForceMuted({ muted }) {
      setForceMuted(Boolean(muted));
      if (muted && localStreamRef.current) {
        const t = localStreamRef.current.getAudioTracks()[0];
        if (t) t.enabled = false;
        setMicMuted(true);
        showToast('You were muted by the host', 'warning');
      } else if (!muted) {
        showToast('The host allowed you to unmute', 'success');
      }
    }
    function onCallEnded() {
      showToast('The host ended the call', 'warning');
      teardownCall();
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPeerConnection]);

  // ============================= actions =================================
  function persistName() {
    const u = (nameInput || '').trim() || 'Guest';
    setStoredUsername(u);
    return u;
  }

  function handleCreate() {
    const u = persistName();
    setBusy(true);
    socket.emit('proom:create', { username: u });
  }

  function handleJoin(e) {
    e?.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { showToast('Enter a valid room code', 'error'); return; }
    const u = persistName();
    setBusy(true);
    socket.emit('proom:join', { code, username: u });
  }

  function teardownCall() {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    setRemoteStreams(new Map());
    setInCall(false);
    setCallMode(null);
    setCallParticipants([]);
    setMicMuted(false);
    setCamOff(false);
  }

  function hardLeave() {
    teardownCall();
    socket.emit('proom:leave');
    setRoom(null);
    setMembers([]);
    setHostId(null);
    setLocked(false);
    setMessages([]);
    setJoinCode('');
  }

  function leaveRoom() {
    hardLeave();
    showToast('You left the room', 'success');
  }

  function sendChat(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    socket.emit('proom:chat', { text });
    setDraft('');
  }

  async function joinCall(mode) {
    if (!room) return;
    setConnecting(true);
    setCallError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video',
      });
      localStreamRef.current = stream;
      setCallMode(mode);
      setInCall(true);
      inCallRef.current = true;
      setCamOff(mode === 'audio');
      socket.emit('proom:call-join', { mode });
    } catch (err) {
      console.error('[proom] getUserMedia', err);
      setCallError('Could not access camera/microphone. Check permissions.');
    } finally {
      setConnecting(false);
    }
  }

  function leaveCall() {
    teardownCall();
    socket.emit('proom:call-leave');
  }

  function toggleMic() {
    if (!localStreamRef.current) return;
    if (forceMuted) { showToast('You are muted by the host', 'warning'); return; }
    const track = localStreamRef.current.getAudioTracks()[0];
    if (track) {
      const next = !micMuted;
      track.enabled = !next;
      setMicMuted(next);
      socket.emit('proom:mic', { muted: next });
    }
  }

  function toggleCam() {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (track) {
      const next = !camOff;
      track.enabled = !next;
      setCamOff(next);
      socket.emit('proom:cam', { camOff: next });
    }
  }

  // ---- host actions ----
  function kick(targetId) { socket.emit('proom:kick', { targetId }); }
  function forceMute(targetId, muted) { socket.emit('proom:force-mute', { targetId, muted }); }
  function toggleLock() { socket.emit('proom:lock', { locked: !locked }); }
  function endCall() { socket.emit('proom:end-call'); }
  function makeHost(targetId) { socket.emit('proom:transfer-host', { targetId }); }

  async function copyCode() {
    if (!room) return;
    const ok = await copyToClipboard(room.code);
    showToast(ok ? 'Room code copied!' : 'Copy failed', ok ? 'success' : 'error');
  }

  // ============================== RENDER =================================

  // ---------- Lobby (not in a room) ----------
  if (!room) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
          <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
        </div>
        <div className="text-center">
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">Private Rooms</h3>
          <p className="mt-1 max-w-[260px] text-xs text-[var(--text-muted)]">
            Create a private room to chat and start a video/audio call with friends — you'll be the host with full control.
          </p>
        </div>

        <div className="w-full max-w-xs space-y-3">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={24}
            className="input-field text-center"
          />
          <button onClick={handleCreate} disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy ? 'Creating…' : 'Create a Room'}
          </button>

          <div className="flex items-center gap-2 py-1">
            <div className="h-px flex-1 bg-[var(--border-primary)]" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">or join</span>
            <div className="h-px flex-1 bg-[var(--border-primary)]" />
          </div>

          <form onSubmit={handleJoin} className="space-y-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter room code"
              maxLength={6}
              className="input-field text-center uppercase tracking-[0.3em] font-bold"
            />
            <button type="submit" disabled={busy} className="btn-ghost w-full disabled:opacity-60">
              {busy ? 'Joining…' : 'Join Room'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------- In a room ----------
  const otherCallParticipants = callParticipants.filter((p) => p.id !== mySocketId);
  const myCallParticipant = callParticipants.find((p) => p.id === mySocketId);

  return (
    <div className="flex h-full flex-col">
      {/* Header: room code + host badge + leave */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-primary)] px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={copyCode}
            title="Copy room code"
            className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-bold tracking-[0.2em] text-accent ring-1 ring-accent/20 transition-colors hover:bg-accent/20"
          >
            {room.code}
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          {isHost && (
            <span className="rounded-md bg-yellow-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-yellow-400 ring-1 ring-yellow-500/25">
              Host
            </span>
          )}
          {locked && (
            <span className="flex items-center gap-0.5 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400 ring-1 ring-red-500/25">
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Locked
            </span>
          )}
        </div>
        <button
          onClick={leaveRoom}
          className="rounded-lg border border-[var(--border-primary)] px-2.5 py-1 text-[10px] font-bold text-[var(--text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-400 active:scale-95"
        >
          Leave
        </button>
      </div>

      {/* Scrollable body */}
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {/* ----- Call area ----- */}
        <div className="border-b border-[var(--border-primary)] p-3">
          {!inCall ? (
            <div className="space-y-2">
              {callError && (
                <div className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300 ring-1 ring-red-500/20">
                  {callError}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => joinCall('video')} disabled={connecting} className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-60">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Video
                </button>
                <button onClick={() => joinCall('audio')} disabled={connecting} className="btn-ghost flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-60">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Audio
                </button>
              </div>
              <p className="text-center text-[10px] text-[var(--text-muted)]">
                Calls are private to this room only.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {callMode === 'video' ? 'Video Call' : 'Audio Call'}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-semibold text-accent ring-1 ring-accent/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseLive" />
                  {callParticipants.length} in call
                </span>
              </div>
              <div className={`grid gap-1.5 ${callParticipants.length <= 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {myCallParticipant && (
                  <CallTile stream={localStreamRef.current} username={username} isLocal mode={callMode} micMuted={micMuted} camOff={camOff} />
                )}
                {otherCallParticipants.map((p) => (
                  <CallTile key={p.id} stream={remoteStreams.get(p.id)} username={p.username} isLocal={false} mode={p.mode} micMuted={p.micMuted} camOff={p.camOff} />
                ))}
              </div>
              {otherCallParticipants.length === 0 && (
                <p className="text-center text-[10px] italic text-[var(--text-muted)]">Waiting for others to join the call…</p>
              )}
              {/* Call controls — sticky so they stay visible (incl. on mobile) */}
              <div className="sticky bottom-0 z-10 -mx-3 -mb-3 mt-1 flex items-center justify-center gap-3 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 px-3 py-2.5 backdrop-blur sm:gap-2">
                <button onClick={toggleMic} title={micMuted ? 'Unmute' : 'Mute'} aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all active:scale-90 sm:h-10 sm:w-10 ${!micMuted ? 'bg-ink-600 text-white hover:bg-ink-500' : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'}`}>
                  {!micMuted ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                  )}
                </button>
                {callMode === 'video' && (
                  <button onClick={toggleCam} title={camOff ? 'Camera on' : 'Camera off'} aria-label={camOff ? 'Turn camera on' : 'Turn camera off'}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all active:scale-90 sm:h-10 sm:w-10 ${!camOff ? 'bg-ink-600 text-white hover:bg-ink-500' : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'}`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {!camOff
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />}
                    </svg>
                  </button>
                )}
                <button onClick={leaveCall} title="Leave call" aria-label="Leave call"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500 text-white transition-all hover:bg-red-600 active:scale-90 sm:h-10 sm:w-10">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ----- Members + host controls ----- */}
        <div className="border-b border-[var(--border-primary)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Members ({members.length})
            </span>
            {isHost && (
              <div className="flex gap-1.5">
                <button onClick={toggleLock}
                  className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 transition-colors ${locked ? 'bg-red-500/15 text-red-400 ring-red-500/25' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] ring-[var(--border-primary)] hover:text-accent'}`}>
                  {locked ? 'Unlock' : 'Lock'}
                </button>
                <button onClick={endCall}
                  className="rounded-md bg-red-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-400 ring-1 ring-red-500/25 transition-colors hover:bg-red-500/25">
                  End Call
                </button>
              </div>
            )}
          </div>
          <ul className="space-y-1">
            {members.map((m) => {
              const memberIsHost = m.id === hostId;
              const isMe = m.id === mySocketId;
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-tertiary)]/40 px-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-black" style={{ backgroundColor: m.color || '#22c55e' }}>
                      {(m.username || 'U').charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                      {m.username}{isMe ? ' (you)' : ''}
                    </span>
                    {memberIsHost && (
                      <span className="shrink-0 rounded bg-yellow-500/15 px-1 py-0.5 text-[8px] font-bold uppercase text-yellow-400">Host</span>
                    )}
                    {m.forceMuted && (
                      <svg className="h-3 w-3 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                    )}
                  </div>
                  {/* Host controls for OTHER members */}
                  {isHost && !isMe && (
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => forceMute(m.id, !m.forceMuted)} title={m.forceMuted ? 'Unmute' : 'Mute'}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)] ring-1 ring-[var(--border-primary)] transition-colors hover:text-yellow-400">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                      </button>
                      <button onClick={() => makeHost(m.id)} title="Make host"
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)] ring-1 ring-[var(--border-primary)] transition-colors hover:text-yellow-400">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L23 12l-5.714 2.143L15 21l-2.286-6.857L7 12l5.714-2.143L15 3z" /></svg>
                      </button>
                      <button onClick={() => kick(m.id)} title="Remove from room"
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)] ring-1 ring-[var(--border-primary)] transition-colors hover:text-red-400">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* ----- Group chat ----- */}
        <div ref={chatRef} className="scrollbar-thin space-y-2 p-3">
          {messages.length === 0 && (
            <p className="py-4 text-center text-[11px] italic text-[var(--text-muted)]">No messages yet — say hi to the room!</p>
          )}
          {messages.map((m) => {
            if (m.system) {
              return <div key={m.id} className="text-center text-[10px] italic text-[var(--text-muted)]">{m.text}</div>;
            }
            return (
              <div key={m.id}>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold" style={{ color: m.color }}>{m.username}</span>
                  <span className="text-[9px] text-[var(--text-muted)]">{formatTime(m.ts)}</span>
                </div>
                <div className="mt-0.5 break-words text-xs leading-relaxed text-[var(--text-secondary)]"
                  dangerouslySetInnerHTML={{ __html: formatChatText(m.text) }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat composer */}
      <form onSubmit={sendChat} className="flex items-center gap-2 border-t border-[var(--border-primary)] p-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the room…"
          maxLength={500}
          className="input-field flex-1 text-sm"
        />
        <button type="submit" disabled={!draft.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-black transition-transform active:scale-90 disabled:opacity-40">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
