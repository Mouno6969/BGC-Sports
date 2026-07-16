// ---------------------------------------------------------------------------
// Player — HLS / YouTube / Twitch stream player with hero section,
// loading skeletons, and improved visual design.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { buildToffeeSourceUrl, createToffeeHlsConfig } from '../lib/toffee.js';
import { ensureToffeeServiceWorker } from '../lib/toffeeSw.js';
import { reportStreamError } from '../lib/errorTracker.js';
import { PlayerSkeleton } from './Skeleton.jsx';

const DRIFT_THRESHOLD = 2; // seconds

function parseYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    return u.searchParams.get('v') || '';
  } catch {
    return '';
  }
}

function parseTwitchChannel(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('twitch.tv')) return u.pathname.replace('/', '');
    return '';
  } catch {
    return '';
  }
}

export default function Player({
  stream,
  isHost,
  inRoom,
  onLocalPlayback,
  registerRemote,
}) {
  const { url, type } = stream || {};
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const applyingRemote = useRef(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // ----- HLS setup ----------------------------------------------------------
  useEffect(() => {
    if (type !== 'hls' || !url) return;
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setLoading(true);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    let cancelled = false;

    if (Hls.isSupported()) {
      const startPlayback = async () => {
        if (stream.headers) {
          await ensureToffeeServiceWorker(stream.headers);
        }
        if (cancelled) return;

        const hlsConfig = stream.headers
          ? createToffeeHlsConfig(stream.headers)
          : { lowLatencyMode: true, enableWorker: true };

        const sourceUrl = stream.headers
          ? buildToffeeSourceUrl(url)
          : url;

        const hls = new Hls(hlsConfig);
        hlsRef.current = hls;
        hls.loadSource(sourceUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => setLoading(false));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            reportStreamError({
              message: `Player HLS fatal: ${data.details || data.type || 'unknown'}`,
              url: sourceUrl || url,
              type: data.type,
              details: data,
              fatal: true,
            });
            setError('Stream error — the source may be offline.');
            setLoading(false);
          }
        });
      };

      startPlayback();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadeddata', () => setLoading(false), { once: true });
    } else {
      reportStreamError({
        message: 'HLS not supported in this browser',
        url,
        type: 'unsupported',
      });
      setError('HLS is not supported in this browser.');
      setLoading(false);
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [type, url, stream?.headers]);

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
      if (isHost) return;
      applyingRemote.current = true;

      const elapsed = playback.updatedAt
        ? (Date.now() - playback.updatedAt) / 1000
        : 0;
      const target =
        playback.currentTime + (playback.isPlaying ? elapsed : 0);

      if (Math.abs(video.currentTime - target) > DRIFT_THRESHOLD) {
        try {
          video.currentTime = target;
        } catch {}
      }
      if (playback.isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!playback.isPlaying && !video.paused) {
        video.pause();
      }

      setTimeout(() => {
        applyingRemote.current = false;
      }, 300);
    };
    registerRemote(applyRemote);
  }, [type, isHost, registerRemote]);

  // ----- No stream: Hero section --------------------------------------------
  if (!url) {
    return (
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 shadow-card">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2322c55e' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-transparent to-ink-900/50" />
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
            <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-white">
              No stream configured yet
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              The admin can set a live stream URL from the admin panel.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ----- YouTube embed ------------------------------------------------------
  if (type === 'youtube') {
    const id = parseYouTubeId(url);
    const src = id
      ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`
      : url;
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-card ring-1 ring-ink-600/50">
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

  // ----- Twitch embed -------------------------------------------------------
  if (type === 'twitch') {
    const channel = parseTwitchChannel(url);
    const parent =
      typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const src = channel
      ? `https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=true`
      : url;
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-card ring-1 ring-ink-600/50">
        <iframe
          className="h-full w-full"
          src={src}
          title="Live stream"
          allowFullScreen
        />
      </div>
    );
  }

  // ----- HLS player ---------------------------------------------------------
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-card ring-1 ring-ink-600/50">
      {/* Content-shaped player skeleton */}
      {loading && <PlayerSkeleton />}
      <video
        ref={videoRef}
        className="h-full w-full"
        controls
        playsInline
        autoPlay
        // Unmuted by default so stream audio follows the device volume.
        // Browsers may still require a user gesture for autoplay-with-sound.
        muted={false}
        onLoadedData={() => {
          const video = videoRef.current;
          if (!video) return;
          video.volume = 1;
          video.muted = false;
          video.play().catch(() => {
            // Autoplay with sound blocked — stay ready for user unmute via controls.
          });
        }}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-red-300">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
