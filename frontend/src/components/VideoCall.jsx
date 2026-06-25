// ---------------------------------------------------------------------------
// VideoCall — group video/audio call via LiveKit (SFU).
//
// Joins a LiveKit room named after the watch-party room code. Renders a
// floating participant grid with local controls (mute, camera, leave).
//
// Token is minted by the backend (/api/livekit/token). If LiveKit is not
// configured on the server, the call UI shows a friendly disabled state.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
} from 'livekit-client';
import { apiPost } from '../lib/config.js';

// A single participant tile (video element + name + audio).
function ParticipantTile({ participant, isLocal }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    const audioEl = audioRef.current;

    function attachTracks() {
      let videoAttached = false;
      participant.trackPublications.forEach((pub) => {
        if (pub.track) {
          if (pub.kind === Track.Kind.Video && el) {
            pub.track.attach(el);
            videoAttached = true;
          }
          if (pub.kind === Track.Kind.Audio && audioEl && !isLocal) {
            pub.track.attach(audioEl);
          }
        }
      });
      setHasVideo(videoAttached);
    }

    attachTracks();

    const onSub = () => attachTracks();
    const onUnsub = () => attachTracks();
    participant.on('trackSubscribed', onSub);
    participant.on('trackUnsubscribed', onUnsub);
    participant.on('trackMuted', onSub);
    participant.on('trackUnmuted', onSub);
    participant.on('localTrackPublished', onSub);
    participant.on('localTrackUnpublished', onSub);

    return () => {
      participant.off('trackSubscribed', onSub);
      participant.off('trackUnsubscribed', onUnsub);
      participant.off('trackMuted', onSub);
      participant.off('trackUnmuted', onSub);
      participant.off('localTrackPublished', onSub);
      participant.off('localTrackUnpublished', onSub);
    };
  }, [participant, isLocal]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-ink-900">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`h-full w-full object-cover ${hasVideo ? '' : 'hidden'}`}
      />
      {!hasVideo && (
        <div className="flex h-full w-full items-center justify-center bg-ink-800 text-2xl font-bold text-slate-500">
          {(participant.name || participant.identity || '?')
            .charAt(0)
            .toUpperCase()}
        </div>
      )}
      <audio ref={audioRef} autoPlay />
      <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        {participant.name || participant.identity}
        {isLocal ? ' (you)' : ''}
      </div>
    </div>
  );
}

export default function VideoCall({ roomCode, username, livekitEnabled }) {
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const roomRef = useRef(null);

  const refreshParticipants = useCallback((lkRoom) => {
    const remote = Array.from(lkRoom.remoteParticipants.values());
    setParticipants([lkRoom.localParticipant, ...remote]);
  }, []);

  const join = useCallback(async () => {
    if (!livekitEnabled || !roomCode) return;
    setConnecting(true);
    setError(null);
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
        .on(RoomEvent.ParticipantDisconnected, () =>
          refreshParticipants(lkRoom)
        )
        .on(RoomEvent.TrackSubscribed, () => refreshParticipants(lkRoom))
        .on(RoomEvent.TrackUnsubscribed, () => refreshParticipants(lkRoom))
        .on(RoomEvent.Disconnected, () => {
          setJoined(false);
          setParticipants([]);
        });

      await lkRoom.connect(url, token);

      // Publish local camera + mic.
      const tracks = await createLocalTracks({ audio: true, video: true });
      for (const track of tracks) {
        await lkRoom.localParticipant.publishTrack(track);
      }

      setRoom(lkRoom);
      setJoined(true);
      refreshParticipants(lkRoom);
    } catch (err) {
      console.error('[livekit] join error', err);
      setError(err.message || 'Failed to join call');
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
  }, []);

  // Clean up on unmount.
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

  if (!livekitEnabled) {
    return (
      <div className="rounded-xl border border-ink-600 bg-ink-800 p-4 text-center text-xs text-slate-400">
        Group video call is not configured on this server.
        <br />
        Set <code className="text-slate-300">LIVEKIT_*</code> env vars to enable.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-600 bg-ink-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wide text-white">
          Watch Party Call
        </h4>
        {joined && (
          <span className="text-[10px] text-slate-400">
            {participants.length} in call
          </span>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
          {error}
        </div>
      )}

      {!joined ? (
        <button
          onClick={join}
          disabled={connecting}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black transition hover:bg-accent-dark disabled:opacity-60"
        >
          {connecting ? 'Connecting…' : 'Join video call'}
        </button>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {participants.map((p) => (
              <ParticipantTile
                key={p.sid || p.identity}
                participant={p}
                isLocal={p === room?.localParticipant}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              onClick={toggleMic}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                micOn
                  ? 'bg-ink-600 text-white hover:bg-ink-500'
                  : 'bg-red-500/80 text-white'
              }`}
            >
              {micOn ? 'Mute' : 'Unmute'}
            </button>
            <button
              onClick={toggleCam}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                camOn
                  ? 'bg-ink-600 text-white hover:bg-ink-500'
                  : 'bg-red-500/80 text-white'
              }`}
            >
              {camOn ? 'Camera off' : 'Camera on'}
            </button>
            <button
              onClick={leave}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
            >
              Leave
            </button>
          </div>
        </>
      )}
    </div>
  );
}
