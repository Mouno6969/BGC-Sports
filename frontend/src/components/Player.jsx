// ---------------------------------------------------------------------------
// Player — renders the live stream and integrates host playback sync.
//
// Supports three stream types:
//   - "hls"     : native <video> + HLS.js (with native fallback for Safari)
//   - "youtube" : embedded iframe
//   - "twitch"  : embedded iframe
//
// Sync behaviour (HLS only — iframes can't be programmatically scrubbed):
//   - If the local user is the room host, local play/pause/seek are broadcast
//     to the room via `onLocalPlayback`.
//   - Non-host participants receive host state through `registerRemote` and
//     the player applies it (play/pause + seek if drift > threshold).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

const DRIFT_THRESHOLD = 1.5; // seconds of allowed drift before re-seeking

function parseYouTubeId(url) {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
}

function parseTwitchChannel(url) {
  const m = url.match(/twitch\.tv\/([\w]+)/);
  return m ? m[1] : null;
}

export default function Player({
  stream, // { url, type }
  isHost, // boolean — whether local user controls sync
  inRoom, // boolean — whether a watch-party room is active
  onLocalPlayback, // (isPlaying, currentTime) => void  (host broadcasts)
  registerRemote, // (fn) => void  parent registers our remote handler
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const applyingRemote = useRef(false); // guard to avoid echo loops
  const [error, setError] = useState(null);

  const type = stream?.type || 'hls';
  const url = stream?.url || '';

  // ----- HLS setup ----------------------------------------------------------
  useEffect(() => {
    if (type !== 'hls' || !url) return;
    const video = videoRef.current;
    if (!video) return;

    setError(null);

    // Clean up any previous instance.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setError('Stream error — the source may be offline.');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari / iOS)
      video.src = url;
    } else {
      setError('HLS is not supported in this browser.');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [type, url]);

  // ----- Host: broadcast local playback changes -----------------------------
  useEffect(() => {
    if (type !== 'hls') return;
    const video = videoRef.current;
    if (!video) return;
    if (!inRoom || !isHost) return;

    const emit = () => {
      if (applyingRemote.current) return;
      onLocalPlayback?.(!video.paused, video.currentTime);
    };

    video.addEventListener('play', emit);
    video.addEventListener('pause', emit);
    video.addEventListener('seeked', emit);

    // Periodic heartbeat so late joiners stay aligned.
    const interval = setInterval(() => {
      if (!video.paused) emit();
    }, 4000);

    return () => {
      video.removeEventListener('play', emit);
      video.removeEventListener('pause', emit);
      video.removeEventListener('seeked', emit);
      clearInterval(interval);
    };
  }, [type, inRoom, isHost, onLocalPlayback]);

  // ----- Participant: apply remote (host) playback --------------------------
  useEffect(() => {
    if (type !== 'hls') return;
    if (!registerRemote) return;

    const applyRemote = (playback) => {
      const video = videoRef.current;
      if (!video || !playback) return;
      // The host's own player should ignore remote echoes.
      if (isHost) return;

      applyingRemote.current = true;

      // Estimate the host's "now" by accounting for time since update.
      const elapsed = playback.updatedAt
        ? (Date.now() - playback.updatedAt) / 1000
        : 0;
      const target =
        playback.currentTime + (playback.isPlaying ? elapsed : 0);

      if (Math.abs(video.currentTime - target) > DRIFT_THRESHOLD) {
        try {
          video.currentTime = target;
        } catch {
          /* ignore seek errors on live edges */
        }
      }

      if (playback.isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!playback.isPlaying && !video.paused) {
        video.pause();
      }

      // Release the guard shortly after applying.
      setTimeout(() => {
        applyingRemote.current = false;
      }, 300);
    };

    registerRemote(applyRemote);
  }, [type, isHost, registerRemote]);

  // --------------------------- Render ---------------------------------------
  if (!url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-ink-800 text-slate-400">
        No stream configured yet.
      </div>
    );
  }

  if (type === 'youtube') {
    const id = parseYouTubeId(url);
    const src = id
      ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`
      : url;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          className="h-full w-full"
          src={src}
          title="Live stream"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (type === 'twitch') {
    const channel = parseTwitchChannel(url);
    const parent =
      typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const src = channel
      ? `https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=true`
      : url;
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          className="h-full w-full"
          src={src}
          title="Live stream"
          allowFullScreen
        />
      </div>
    );
  }

  // Default: HLS via <video>
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        className="h-full w-full"
        controls
        playsInline
        autoPlay
        muted={!isHost && inRoom ? false : true}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
