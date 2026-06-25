// ---------------------------------------------------------------------------
// VideoCall — LiveKit-powered group video/voice call with speaking indicators,
// clear icons, voice-only mode, and polished participant tiles.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  createLocalTracks,
  Track,
} from 'livekit-client';
import { apiPost } from '../lib/config.js';

// ---------------------------------------------------------------------------
// ParticipantTile — renders a single participant (video or avatar).
// ---------------------------------------------------------------------------
function ParticipantTile({ participant, isLocal }) {
  const videoRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!participant) return;

    // Check for video track
    const videoTrack = participant.getTrackPublication(Track.Source.Camera);
    setHasVideo(!!videoTrack?.track && !videoTrack.isMuted);

    if (videoTrack?.track && videoRef.current) {
      videoTrack.track.attach(videoRef.current);
    }

    // Speaking detection
    const checkSpeaking = () => setIsSpeaking(participant.isSpeaking);
    const interval = setInterval(checkSpeaking, 200);

    return () => {
      clearInterval(interval);
      if (videoTrack?.track && videoRef.current) {
        videoTrack.track.detach(videoRef.current);
      }
    };
  }, [participant]);

  const name = participant?.name || participant?.identity || 'Unknown';
  const isMuted = participant?.getTrackPublication(Track.Source.Microphone)?.isMuted;

  return (
    <div
      className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-ink-700/50 ring-1 transition-all duration-300 ${
        isSpeaking
          ? 'ring-2 ring-accent animate-speaking shadow-glow-green'
          : 'ring-ink-600/50'
      }`}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted={isLocal}
        />
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-secondary/20 text-sm font-bold text-white ring-2 ${isSpeaking ? 'ring-accent' : 'ring-ink-500'}`}>
            {name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      {/* Name label + mic status */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4">
        <span className="truncate text-[11px] font-medium text-white/90">
          {isLocal ? `${name} (you)` : name}
        </span>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isMuted ? 'bg-red-500/80' : 'bg-ink-600/80'}`}>
          {isMuted ? (
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
// VideoCall — main component
// ---------------------------------------------------------------------------
export default function VideoCall({ roomCode, username, livekitEnabled }) {
  const [room, setRoom] = useState(null);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [callMode, setCallMode] = useState(null); // 'video' | 'voice'
  const roomRef = useRef(null);

  const refreshParticipants = useCallback((lkRoom) => {
    if (!lkRoom) return;
    const remote = Array.from(lkRoom.remoteParticipants.values());
    setParticipants([lkRoom.localParticipant, ...remote]);
  }, []);

  const join = useCallback(async (mode) => {
    if (!livekitEnabled || !roomCode) return;
    setConnecting(true);
    setError(null);
    setCallMode(mode);
    try {
      const identity = `${username}-${Math.random().toString(36).slice(2, 7)}`;
      const { token, url } = await apiPost('/api/livekit/token', {
        roomCode,
        identity,
        name: username,
      });

      const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = lkRoom;

      lkRoom
        .on(RoomEvent.ParticipantConnected, () => refreshParticipants(lkRoom))
        .on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(lkRoom))
        .on(RoomEvent.TrackSubscribed, () => refreshParticipants(lkRoom))
        .on(RoomEvent.TrackUnsubscribed, () => refreshParticipants(lkRoom))
        .on(RoomEvent.TrackMuted, () => refreshParticipants(lkRoom))
        .on(RoomEvent.TrackUnmuted, () => refreshParticipants(lkRoom))
        .on(RoomEvent.Disconnected, () => {
          setJoined(false);
          setParticipants([]);
          setCallMode(null);
        });

      await lkRoom.connect(url, token);

      // Publish tracks based on mode
      if (mode === 'video') {
        const tracks = await createLocalTracks({ audio: true, video: true });
        for (const track of tracks) {
          await lkRoom.localParticipant.publishTrack(track);
        }
        setCamOn(true);
      } else {
        // Voice only
        const tracks = await createLocalTracks({ audio: true, video: false });
        for (const track of tracks) {
          await lkRoom.localParticipant.publishTrack(track);
        }
        setCamOn(false);
      }

      setRoom(lkRoom);
      setJoined(true);
      setMicOn(true);
      refreshParticipants(lkRoom);
    } catch (err) {
      console.error('[livekit] join error', err);
      setError(err.message || 'Failed to join call');
      setCallMode(null);
    } finally {
      setConnecting(false);
    }
  }, [livekitEnabled, roomCode, username, refreshParticipants]);

  const leave = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    setRoom(null);
    setJoined(false);
    setParticipants([]);
    setCallMode(null);
  }, []);

  useEffect(() => {
    return () => {
      if (roomRef.current) roomRef.current.disconnect();
    };
  }, []);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [room, micOn]);

  const toggleCam = useCallback(async () => {
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }, [room, camOn]);

  // ----- Not configured -----------------------------------------------------
  if (!livekitEnabled) {
    return (
      <div className="animate-fadeIn flex items-center gap-3 rounded-2xl border border-ink-600/50 bg-ink-800/50 p-5 text-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-700">
          <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-slate-300">Video call not configured</p>
          <p className="text-xs text-slate-500">
            Set <code className="rounded bg-ink-700 px-1 py-0.5 text-[10px] text-slate-400">LIVEKIT_*</code> env vars to enable.
          </p>
        </div>
      </div>
    );
  }

  // ----- Main render --------------------------------------------------------
  return (
    <div className="animate-fadeIn space-y-3 rounded-2xl border border-ink-600/50 bg-gradient-to-br from-ink-800 to-ink-900 p-4 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-wide text-white">
          <svg className="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Watch Party Call
        </h4>
        {joined && (
          <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent ring-1 ring-accent/20">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseLive" />
            {participants.length} in call
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-300 ring-1 ring-red-500/20">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {!joined ? (
        <div className="space-y-2">
          {/* Join Video Call */}
          <button
            onClick={() => join('video')}
            disabled={connecting}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {connecting && callMode === 'video' ? 'Connecting...' : 'Join Video Call'}
          </button>
          {/* Join Voice Call */}
          <button
            onClick={() => join('voice')}
            disabled={connecting}
            className="btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            {connecting && callMode === 'voice' ? 'Connecting...' : 'Join Voice Call'}
          </button>
        </div>
      ) : (
        <>
          {/* Participant grid */}
          <div className={`grid gap-2 ${participants.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}>
            {participants.map((p) => (
              <ParticipantTile
                key={p.sid || p.identity}
                participant={p}
                isLocal={p === room?.localParticipant}
              />
            ))}
          </div>

          {/* Empty state */}
          {participants.length <= 1 && (
            <p className="text-center text-xs text-slate-500 italic">
              No one else is here yet — share the code with friends!
            </p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-2 pt-1">
            {/* Mic toggle */}
            <button
              onClick={toggleMic}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
                micOn
                  ? 'bg-ink-600 text-white hover:bg-ink-500'
                  : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/30'
              }`}
              title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              {micOn ? (
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

            {/* Camera toggle */}
            <button
              onClick={toggleCam}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
                camOn
                  ? 'bg-ink-600 text-white hover:bg-ink-500'
                  : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/30'
              }`}
              title={camOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {camOn ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
            </button>

            {/* Leave button */}
            <button
              onClick={leave}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-red-500 px-4 text-xs font-semibold text-white transition-all duration-200 hover:bg-red-600 active:scale-[0.98]"
              title="Leave call"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
              Leave
            </button>
          </div>
        </>
      )}
    </div>
  );
}
