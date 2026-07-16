// ---------------------------------------------------------------------------
// MiniPlayer — floating PiP-style stream when browsing scores / Match Center
// while a watch session is still active. Expand returns to /watch.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getWatchSession,
  onWatchSessionChange,
  clearWatchSession,
  watchPathFromSession,
} from '../lib/watchSession.js';
import { resolvePlaybackUrl, needsServerProxy, isEmbedPlaybackUrl } from '../lib/playback.js';
import { isToffeeStream } from '../lib/toffee.js';

export default function MiniPlayer() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState(() => getWatchSession());
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const onWatch = location.pathname.startsWith('/watch');

  useEffect(() => onWatchSessionChange(setSession), []);

  // Hide on watch page (full player owns the stream). Keep session so returning
  // from match center still has context if they leave again.
  const visible = Boolean(session?.url) && !onWatch && !collapsed;

  useEffect(() => {
    if (!visible || !session?.url) {
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch { /* ignore */ }
        hlsRef.current = null;
      }
      return undefined;
    }

    const url = session.url;
    const source = session.source || '';
    const type = session.type || '';
    const isEmbed = isEmbedPlaybackUrl(url, type);
    if (isEmbed) {
      // Embeds need iframe — mini player shows expand-only chrome
      setError(false);
      return undefined;
    }

    let cancelled = false;
    const video = videoRef.current;
    if (!video) return undefined;

    const isToffee = isToffeeStream(url, source);
    const proxied = needsServerProxy(url, source, type)
      ? resolvePlaybackUrl(url, source, type)
      : url;
    const sourceUrl = proxied || url;

    async function start() {
      setError(false);
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled || !videoRef.current) return;
        if (Hls.isSupported()) {
          const hls = new Hls({
            lowLatencyMode: false,
            enableWorker: true,
            maxBufferLength: 20,
            maxBufferSize: 20 * 1024 * 1024,
          });
          hlsRef.current = hls;
          hls.loadSource(sourceUrl);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            videoRef.current?.play().catch(() => {});
            setPlaying(true);
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data?.fatal) setError(true);
          });
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = sourceUrl;
          videoRef.current.play().catch(() => {});
          setPlaying(true);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    start();
    return () => {
      cancelled = true;
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch { /* ignore */ }
        hlsRef.current = null;
      }
    };
  }, [visible, session?.url, session?.source, session?.type]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const expand = useCallback(() => {
    if (!session) return;
    navigate(watchPathFromSession(session));
  }, [navigate, session]);

  const close = useCallback(() => {
    clearWatchSession();
    setSession(null);
  }, []);

  if (!session?.url || onWatch) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        className="mini-player-chip"
        onClick={() => setCollapsed(false)}
        aria-label="Show mini player"
      >
        <span className="mini-player-chip-dot" aria-hidden="true" />
        <span className="truncate max-w-[9rem]">{session.name || 'Live'}</span>
      </button>
    );
  }

  if (!visible) return null;

  const isEmbed = isEmbedPlaybackUrl(session.url, session.type || '');

  return (
    <div className="mini-player" role="complementary" aria-label="Mini player">
      <div className="mini-player__video" onClick={expand} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') expand(); }}>
        {isEmbed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-black px-2 text-center">
            <span className="text-[10px] font-bold text-white/90">Embed stream</span>
            <span className="text-[9px] text-white/60">Tap to open full player</span>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="h-full w-full object-contain bg-black"
            playsInline
            muted={false}
            autoPlay
          />
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-2 text-center text-[10px] text-white">
            Stream paused · tap to open
          </div>
        )}
        <div className="mini-player__live">
          <span className="mini-player__live-dot" />
          LIVE
        </div>
      </div>
      <div className="mini-player__bar">
        <p className="mini-player__title truncate">{session.name || 'Live stream'}</p>
        <div className="mini-player__actions">
          {!isEmbed && (
            <button type="button" onClick={togglePlay} className="mini-player__btn" aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? (
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
          )}
          <button type="button" onClick={expand} className="mini-player__btn" aria-label="Expand player">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button type="button" onClick={() => setCollapsed(true)} className="mini-player__btn" aria-label="Minimize">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <button type="button" onClick={close} className="mini-player__btn mini-player__btn--close" aria-label="Close mini player">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
